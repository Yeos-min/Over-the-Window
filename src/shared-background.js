// One live, silent screen stream replaces the forest video; all optical planes share it.
export class SharedBackground{
  constructor(stream,{createVideo=()=>document.createElement('video'),createCanvas=()=>document.createElement('canvas'),onEnded=()=>{},fps=30,maxEdge=1920,timeout=15000}={}){
    this.stream=stream;this.video=createVideo();this.canvas=createCanvas();
    this.context=this.canvas.getContext('2d',{alpha:false});
    this.fps=fps;this.maxEdge=maxEdge;this.timeout=timeout;this.paused=false;this.disposed=false;this.state='loading';
    this.lastDraw=-Infinity;this.dirty=true;this.frameId=null;this.onEnded=onEnded;
    this.video.muted=true;this.video.playsInline=true;this.video.srcObject=stream;
    this.ended=()=>{if(!this.disposed){this.cancelLoad?.();this.onEnded();}};
    for(const track of stream.getVideoTracks())track.addEventListener('ended',this.ended);
  }
  async load(){
    await new Promise((resolve,reject)=>{
      let timer;
      const cleanup=()=>{clearTimeout(timer);this.video.removeEventListener('loadeddata',ready);this.video.removeEventListener('error',fail);this.cancelLoad=null;};
      const ready=()=>{if(this.video.readyState>=2&&this.video.videoWidth>0){cleanup();resolve();}};
      const fail=()=>{cleanup();reject(new Error('화면 캡처를 읽지 못했습니다.'));};
      this.cancelLoad=fail;this.video.addEventListener('loadeddata',ready);this.video.addEventListener('error',fail);
      timer=setTimeout(fail,this.timeout);Promise.resolve(this.video.play()).then(ready,fail);
    });
    if(this.disposed)throw new Error('화면 연결이 종료됐습니다.');
    this.draw();this.state='playing';this.watchFrame();return this;
  }
  watchFrame(){
    if(this.disposed||!this.video.requestVideoFrameCallback)return;
    this.frameId=this.video.requestVideoFrameCallback(()=>{this.dirty=true;this.watchFrame();});
  }
  draw(){
    const sw=this.video.videoWidth,sh=this.video.videoHeight,scale=Math.min(1,this.maxEdge/Math.max(sw,sh));
    const w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
    if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;
    this.context.drawImage(this.video,0,0,w,h);this.dirty=false;
  }
  update(now){
    if(this.disposed||this.paused||this.state!=='playing'||this.video.readyState<2||now-this.lastDraw<1000/this.fps||(!this.dirty&&this.video.requestVideoFrameCallback))return false;
    this.draw();this.lastDraw=now;return true;
  }
  pause(){this.paused=true;}
  resume(){this.paused=false;this.dirty=true;}
  dispose(){
    if(this.disposed)return;
    this.disposed=true;this.state='disposed';this.cancelLoad?.();
    if(this.frameId!==null)this.video.cancelVideoFrameCallback?.(this.frameId);
    for(const track of this.stream.getTracks()){track.removeEventListener('ended',this.ended);track.stop();}
    this.video.pause();this.video.srcObject=null;this.video.remove?.();
  }
}
