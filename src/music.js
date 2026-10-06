const clamp=x=>Math.max(0,Math.min(1,x));
export function measureAudio(wave,spectrum,sampleRate){
  let sum=0;for(const v of wave)sum+=v*v;
  const rms=Math.sqrt(sum/wave.length),binHz=sampleRate/(spectrum.length*2);
  const band=(low,high)=>{let s=0,n=0;for(let i=Math.max(1,Math.ceil(low/binHz));i<Math.min(spectrum.length,high/binHz);i++){s+=spectrum[i]/255;n++;}return n?s/n:0;};
  return {level:clamp((rms-.003)*7),bass:band(40,250),treble:band(2000,8000)};
}
export class MusicInput {
  constructor(onState){this.onState=onState;this.features={level:0,bass:0,treble:0,beat:0};this.generation=0;this.sensitivity=1;}
  async toggle(){
    if(this.stream||this.pending){this.stop();return;}
    if(!navigator.mediaDevices?.getDisplayMedia){this.onState(false,'이 브라우저는 오디오 공유를 지원하지 않아요. Chrome 또는 Edge에서 열어주세요.');return;}
    const generation=++this.generation;this.pending=true;
    this.onState(false,'음악이 재생 중인 탭 또는 화면을 선택하고 오디오 공유를 켜주세요.',true);
    try{
      // getDisplayMedia requires video. It is never rendered, recorded, or transmitted.
      const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},systemAudio:'include',selfBrowserSurface:'exclude'});
      if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;
      if(!stream.getAudioTracks().length)throw new Error('no-audio');
      const Context=window.AudioContext||window.webkitAudioContext;
      this.context=new Context();await this.context.resume();
      if(generation!==this.generation)return;
      this.source=this.context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      this.analyser=this.context.createAnalyser();this.analyser.fftSize=2048;this.analyser.smoothingTimeConstant=.35;
      this.source.connect(this.analyser); // No speaker destination: avoid duplicate playback/feedback.
      this.wave=new Float32Array(this.analyser.fftSize);this.spectrum=new Uint8Array(this.analyser.frequencyBinCount);
      for(const track of stream.getTracks())track.addEventListener('ended',()=>{if(this.stream===stream)this.stop();});
      for(const track of stream.getVideoTracks())track.enabled=false;
      this.pending=false;this.connected=true;this.average=0;this.cooldown=0;this.silentTime=0;this.silenceShown=false;
      this.onState(true,'연결됨 · 음량은 생성량, 고음은 흐르는 속도를 바꿔요.');
    }catch(error){
      if(generation!==this.generation)return;
      this.stop(false);
      this.onState(false,error.message==='no-audio'?'오디오가 포함되지 않았어요. 다시 연결해 ‘탭 오디오’ 또는 ‘시스템 오디오’를 켜주세요.':error.name==='NotAllowedError'?'음악 공유가 취소되었거나 허용되지 않았어요.': '연결하지 못했어요. Chrome·Edge에서 오디오 공유가 가능한 탭/화면을 선택하세요.');
    }
  }
  sample(dt){
    if(!this.connected)return this.features;
    this.analyser.getFloatTimeDomainData(this.wave);this.analyser.getByteFrequencyData(this.spectrum);
    const next=measureAudio(this.wave,this.spectrum,this.context.sampleRate);
    this.silentTime=next.level<.01?this.silentTime+dt:0;
    if(this.silentTime>4&&!this.silenceShown){this.silenceShown=true;this.onState(true,'소리가 감지되지 않아요. 음악 재생과 오디오 공유 설정을 확인하세요.');}
    else if(this.silenceShown&&next.level>.03){this.silenceShown=false;this.onState(true,'음악에 반응 중 · 음량은 생성량, 고음은 흐르는 속도를 바꿔요.');}
    this.cooldown=Math.max(0,this.cooldown-dt);
    const attack=next.level>this.average*1.55+.045&&next.level>.09&&this.cooldown===0;
    if(attack){this.features.beat=1;this.cooldown=.22;}else this.features.beat*=Math.exp(-8*dt);
    this.average+=(next.level-this.average)*(1-Math.exp(-2*dt));
    for(const key of ['level','bass','treble']){
      // Broad high-frequency bands are often weaker; boost without using total volume.
      const gain=key==='bass'?1.6:key==='treble'?2.4:1;
      const target=next.level===0?0:clamp(next[key]*this.sensitivity*gain);
      const rate=target>this.features[key]?16:5;
      this.features[key]+=(target-this.features[key])*(1-Math.exp(-rate*dt));
    }
    return this.features;
  }
  stop(notify=true){
    this.generation++;this.pending=false;this.connected=false;
    const stream=this.stream;this.stream=null;stream?.getTracks().forEach(t=>t.stop());
    this.source?.disconnect();this.analyser?.disconnect();this.context?.close().catch(()=>{});
    this.source=null;this.analyser=null;this.context=null;
    this.features={level:0,bass:0,treble:0,beat:0};
    if(notify)this.onState(false,'음악 연결을 해제했어요.');
  }
}
