const HAVE_CURRENT_DATA=2;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Keep two decoders and one output canvas for the entire session. The incoming
// video's real media time drives the overlap; animation-frame delays do not.
export class VideoBackground{
  constructor(url,options={}){
    this.url=url;
    this.canvas=(options.createCanvas??(()=>document.createElement('canvas')))();
    this.canvas.width=1;
    this.canvas.height=1;
    this.context=this.canvas.getContext('2d',{alpha:false});
    if(!this.context)throw new Error('영상 배경용 Canvas를 만들지 못했습니다.');
    const createVideo=options.createVideo??(()=>document.createElement('video'));
    this.videos=[createVideo(),createVideo()];
    this.state='loading';
    this.error=null;
    this._onStateChange=options.onStateChange;
    this._maxWidth=Math.max(1,Number(options.maxWidth)||1280);
    this._fps=clamp(Number(options.fps)||30,1,60);
    this._overlap=Math.max(0.05,Number(options.overlap)||1);
    this._loadTimeout=Math.max(1,Number(options.loadTimeout)||15000);
    this._active=0;
    this._transition=null;
    this._paused=false;
    this._disposed=false;
    this._ready=false;
    this._lastDraw=-Infinity;
    this._drawTimes=[NaN,NaN];
    this._dirty=[true,true];
    this._awaitingSeek=[false,false];
    this._playPending=[null,null];
    this._playEpoch=0;
    this._frameIds=[null,null];
    this._listeners=[];
    this._timer=null;
    this._loadPromise=null;
    for(let index=0;index<2;index++){
      const video=this.videos[index];
      video.muted=true;
      video.defaultMuted=true;
      video.volume=0;
      video.playsInline=true;
      video.preload='auto';
      video.autoplay=false;
      video.loop=false;
      video.disablePictureInPicture=true;
      video.setAttribute?.('muted','');
      video.setAttribute?.('playsinline','');
      video.setAttribute?.('webkit-playsinline','');
      this._listen(video,'loadedmetadata',()=>this._metadata(index));
      for(const event of ['loadeddata','canplay']){
        this._listen(video,event,()=>this._data(index));
      }
      this._listen(video,'seeked',()=>{
        this._awaitingSeek[index]=false;
        this._dirty[index]=true;
        this._data(index);
      });
      this._listen(video,'ended',()=>{this._dirty[index]=true;});
      this._listen(video,'error',()=>{
        const code=video.error?.code;
        this._fail(new Error('배경 영상을 읽지 못했습니다'+(code?' (미디어 오류 '+code+')':'')+'.'));
      });
    }
  }

  get width(){return this.canvas.width;}
  get height(){return this.canvas.height;}

  _listen(target,type,listener){
    target.addEventListener(type,listener);
    this._listeners.push([target,type,listener]);
  }

  _setState(state,error=null){
    if(this._disposed&&state!=='disposed')return;
    const changed=this.state!==state||this.error!==error;
    this.state=state;
    this.error=error;
    if(changed){
      // A consumer's status UI must not interrupt playback or leave a promise
      // rejection unhandled.
      try{
        const result=this._onStateChange?.(state,error);
        if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});
      }catch{}
    }
  }

  _metadata(index){
    if(this._disposed||this.state==='error')return;
    const video=this.videos[index];
    if(!Number.isFinite(video.duration)||video.duration<=0){
      this._fail(new Error('배경 영상의 재생 길이를 확인하지 못했습니다.'));
      return;
    }
    if(index===0&&video.videoWidth>0&&video.videoHeight>0){
      const ratio=Math.min(1,this._maxWidth/Math.max(video.videoWidth,video.videoHeight));
      const width=Math.max(1,Math.round(video.videoWidth*ratio));
      const height=Math.max(1,Math.round(video.videoHeight*ratio));
      if(this.width!==width||this.height!==height){
        this.canvas.width=width;
        this.canvas.height=height;
        this._dirty[0]=true;
      }
    }
    this._data(index);
  }

  _canDraw(index){
    const video=this.videos[index];
    return video.readyState>=HAVE_CURRENT_DATA&&video.videoWidth>0&&video.videoHeight>0&&
      !this._awaitingSeek[index]&&!video.seeking;
  }

  _data(index){
    if(this._disposed||this.state==='error')return;
    const video=this.videos[index];
    // loadedmetadata, loadeddata and canplay can describe the same cached frame.
    // Do not issue three identical texture uploads after the initial paint.
    if(!this._ready||this._drawTimes[index]!==video.currentTime)this._dirty[index]=true;
    if(index!==0||this._ready||!this._canDraw(0))return;
    if(!Number.isFinite(video.duration)||video.duration<=0){
      this._fail(new Error('배경 영상의 재생 길이를 확인하지 못했습니다.'));
      return;
    }
    if(this.canvas.width===1&&this.canvas.height===1){
      const ratio=Math.min(1,this._maxWidth/Math.max(video.videoWidth,video.videoHeight));
      this.canvas.width=Math.max(1,Math.round(video.videoWidth*ratio));
      this.canvas.height=Math.max(1,Math.round(video.videoHeight*ratio));
    }
    // load() never exposes an unpainted black compositor to the renderer.
    if(!this._draw(0,null,0))return;
    this._ready=true;
    clearTimeout(this._timer);
    this._timer=null;
    this._resolveLoad?.(this);
    this._resolveLoad=null;
    this._rejectLoad=null;
  }

  _fail(error){
    if(this._disposed||this.state==='error')return;
    this._playEpoch++;
    this._playPending=[null,null];
    for(const video of this.videos)video.pause();
    this._cancelFrames();
    clearTimeout(this._timer);
    this._timer=null;
    this._setState('error',error);
    this._rejectLoad?.(error);
    this._resolveLoad=null;
    this._rejectLoad=null;
    // The existing canvas is deliberately left intact on decoder/network error.
  }

  async load(){
    if(this._disposed)throw new Error('영상 배경이 이미 해제되었습니다.');
    if(!this._loadPromise){
      this._loadPromise=new Promise((resolve,reject)=>{
        this._resolveLoad=resolve;
        this._rejectLoad=reject;
        this._timer=setTimeout(()=>this._fail(new Error('배경 영상 로딩 시간이 초과되었습니다.')),this._loadTimeout);
        for(const video of this.videos){
          video.src=this.url;
          try{video.load();}catch(error){this._fail(error);break;}
        }
        // Also support cached sources whose ready events fired synchronously.
        if(this.videos[0].readyState>=1)this._metadata(0);
        if(this.videos[1].readyState>=1)this._metadata(1);
      }).then(async()=>{
        if(!this._paused&&!this._disposed)await this.resume();
        return this;
      });
    }
    return this._loadPromise;
  }

  _requestFrame(index){
    const video=this.videos[index];
    if(this._disposed||this._paused||video.paused||video.ended||this._frameIds[index]!==null||
      typeof video.requestVideoFrameCallback!=='function')return;
    try{
      this._frameIds[index]=video.requestVideoFrameCallback(()=>{
        this._frameIds[index]=null;
        if(this._disposed||this._paused||video.paused||video.ended)return;
        this._dirty[index]=true;
        this._requestFrame(index);
      });
    }catch{this._frameIds[index]=null;}
  }

  _cancelFrames(){
    for(let index=0;index<2;index++){
      if(this._frameIds[index]!==null){
        try{this.videos[index].cancelVideoFrameCallback?.(this._frameIds[index]);}catch{}
        this._frameIds[index]=null;
      }
    }
  }

  _play(index){
    if(this._playPending[index])return this._playPending[index];
    const epoch=this._playEpoch;
    let play;
    try{play=this.videos[index].play();}catch(error){play=Promise.reject(error);}
    const pending=Promise.resolve(play).then(()=>{
      if(this._paused||this._disposed||this.state==='error'){
        this.videos[index].pause();
        return false;
      }
      if(epoch!==this._playEpoch)return false;
      this._requestFrame(index);
      return true;
    },error=>{
      if(epoch===this._playEpoch&&!this._paused&&!this._disposed&&this.state!=='error')this._setState('blocked',error);
      return false;
    }).finally(()=>{
      if(this._playPending[index]===pending)this._playPending[index]=null;
    });
    this._playPending[index]=pending;
    return pending;
  }

  pause(){
    if(this._disposed)return;
    this._paused=true;
    this._playEpoch++;
    this._playPending=[null,null];
    for(const video of this.videos)video.pause();
    this._cancelFrames();
    if(this.state!=='error')this._setState('paused');
  }

  async resume(){
    if(this._disposed||this.state==='error')return false;
    this._paused=false;
    if(!this._ready){this._setState('loading');return false;}
    const epoch=this._playEpoch;
    // play() on an ended video restarts it at zero. During an overlap its last
    // decoded frame is the outgoing image, so only restart the incoming stream.
    const active=this.videos[this._active];
    const targets=this._transition&&(active.ended||active.currentTime>=active.duration)?[]:[this._active];
    if(this._transition)targets.push(this._transition.incoming);
    const played=await Promise.all(targets.map(index=>this._play(index)));
    if(played.every(Boolean)&&epoch===this._playEpoch&&!this._paused&&!this._disposed&&this.state!=='error'){
      this._setState('playing');
      return true;
    }
    return false;
  }

  retry(){return this.resume();}

  _rewind(index){
    const video=this.videos[index];
    video.pause();
    if(this._frameIds[index]!==null){
      try{video.cancelVideoFrameCallback?.(this._frameIds[index]);}catch{}
      this._frameIds[index]=null;
    }
    this._dirty[index]=true;
    this._awaitingSeek[index]=video.currentTime>0.001;
    try{video.currentTime=0;}catch(error){this._fail(error);}
  }

  _draw(outgoing,incoming,blend){
    // Do not remove an in-progress blend merely because the incoming decoder is
    // buffering. The previous complete composite remains visible until it can
    // supply a frame again.
    if(incoming!==null&&blend>0&&!this._canDraw(incoming))return false;
    if(!this._canDraw(outgoing)){
      // At the end of an overlap a buffering outgoing decoder is no longer
      // needed. Never wait on it (or paint an empty frame) to promote the ready
      // incoming video.
      if(incoming===null||blend<1||!this._canDraw(incoming))return false;
      outgoing=incoming;
      incoming=null;
    }
    const context=this.context;
    try{
      context.globalAlpha=1;
      context.drawImage(this.videos[outgoing],0,0,this.width,this.height);
      if(incoming!==null&&blend>0&&this._canDraw(incoming)){
        context.globalAlpha=blend;
        context.drawImage(this.videos[incoming],0,0,this.width,this.height);
      }
      this._dirty[outgoing]=false;
      this._drawTimes[outgoing]=this.videos[outgoing].currentTime;
      if(incoming!==null){
        this._dirty[incoming]=false;
        this._drawTimes[incoming]=this.videos[incoming].currentTime;
      }
      return true;
    }catch{
      // A not-yet-decoded or temporarily unavailable frame must not clear the
      // previous output. Wait for canplay/seeked/the next decoded frame.
      return false;
    }finally{context.globalAlpha=1;}
  }

  update(now=performance.now()){
    if(!this._ready||this._disposed||this._paused||this.state==='error'||
      !Number.isFinite(now)||now-this._lastDraw<1000/this._fps)return false;
    const outgoing=this._active;
    const video=this.videos[outgoing];
    const incoming=1-outgoing;
    const overlap=Math.min(this._overlap,video.duration/3,this.videos[incoming].duration/3);
    if(!this._transition&&this.state!=='blocked'&&Number.isFinite(overlap)&&
      video.currentTime>=video.duration-overlap&&this._canDraw(incoming)){
      this._transition={incoming,overlap};
      // Rejections are handled inside _play; no orphaned promise is created.
      void this._play(incoming);
    }
    const transition=this._transition;
    const incomingTime=transition?this.videos[transition.incoming].currentTime:0;
    const progress=transition?clamp(incomingTime/transition.overlap,0,1):0;
    const blend=progress*progress*(3-2*progress);
    const changed=this._dirty[outgoing]||video.currentTime!==this._drawTimes[outgoing]||
      (transition&&(this._dirty[transition.incoming]||incomingTime!==this._drawTimes[transition.incoming]));
    if(!changed)return false;
    if(!this._draw(outgoing,transition?transition.incoming:null,blend))return false;
    this._lastDraw=now;
    if(transition&&progress>=1&&this._canDraw(transition.incoming)){
      this._active=transition.incoming;
      this._transition=null;
      this._rewind(outgoing);
    }
    return true;
  }

  dispose(){
    if(this._disposed)return;
    this._disposed=true;
    this._paused=true;
    this._playEpoch++;
    this._playPending=[null,null];
    clearTimeout(this._timer);
    this._timer=null;
    this._cancelFrames();
    for(const [target,type,listener] of this._listeners)target.removeEventListener(type,listener);
    this._listeners=[];
    for(const video of this.videos){
      video.pause();
      video.removeAttribute?.('src');
      try{video.load();}catch{}
    }
    this._rejectLoad?.(new Error('영상 배경이 해제되었습니다.'));
    this._resolveLoad=null;
    this._rejectLoad=null;
    this._transition=null;
    this._setState('disposed');
  }
}

export default VideoBackground;
