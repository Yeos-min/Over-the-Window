const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
export const RAIN_SOUND_VOICES=Object.freeze({
  low:Object.freeze({label:'1 · 최저음',pitch:1,volume:.5}),
  higher:Object.freeze({label:'2 · 중간음',pitch:1.5,volume:.8}),
  high:Object.freeze({label:'3 · 높은음',pitch:2.25,volume:1.2})
});

// A short, low-pitched thud on a thick, damped surface.
// Listening-test parameters; filtered noise avoids a ringing metal-like tone.
export function glassImpact(sampleRate,{size=.5,seed=71,voice='low'}={}){
  const amount=clamp(size),rng=random(seed),duration=.13+.09*amount;
  const voicePitch=RAIN_SOUND_VOICES[Object.hasOwn(RAIN_SOUND_VOICES,voice)?voice:'low'].pitch;
  const pcm=new Float32Array(Math.ceil(sampleRate*duration));
  const pitch=(1.15-.35*amount)*(.94+rng()*.12)*voicePitch;
  const bodyRate=1-Math.exp(-2*Math.PI*(480-140*amount)*pitch/sampleRate);
  const touchRate=1-Math.exp(-2*Math.PI*(950-300*amount)*pitch/sampleRate);
  const subRate=1-Math.exp(-2*Math.PI*75*voicePitch/sampleRate);
  const splatA=.004+rng()*.006,splatB=.014+rng()*.009;
  const burst=(t,delay,decay)=>t<delay?0:(1-Math.exp(-(t-delay)/.0015))*Math.exp(-(t-delay)/decay);
  let body=0,body2=0,body3=0,touch=0,touch2=0,touch3=0,sub=0,sub2=0;
  for(let i=0;i<pcm.length;i++){
    const t=i/sampleRate,noise=rng()*2-1;
    body+=(noise-body)*bodyRate;body2+=(body-body2)*bodyRate;body3+=(body2-body3)*bodyRate;
    touch+=(noise-touch)*touchRate;touch2+=(touch-touch2)*touchRate;touch3+=(touch2-touch3)*touchRate;
    sub+=(noise-sub)*subRate;sub2+=(sub-sub2)*subRate;
    const thud=(body3-sub2)*3.3*Math.exp(-t/(.019+.012*amount));
    const texture=(touch3-body3)*(.32*Math.exp(-t/.01)+
      .18*burst(t,splatA,.009)+.08*burst(t,splatB,.006));
    const attack=1-Math.exp(-t/.0035),tail=clamp((duration-t)/.006);
    pcm[i]=(thud+texture)*attack*tail*(.45+.6*amount)/Math.sqrt(voicePitch);
  }
  return pcm;
}

export const RAIN_TEST_SECONDS=5;
export function rainTestPattern(seed=731){
  const rng=random(seed),events=[{time:.08,size:.15,pan:-.45},{time:.65,size:.5,pan:0},{time:1.22,size:.95,pan:.45}];
  for(let time=1.9;time<4.6;time+=.075+rng()*.16)events.push({time,size:.1+rng()*.75,pan:rng()*1.6-.8});
  return events.map(event=>({...event,seed:Math.floor(rng()*0x7fffffff)}));
}
export function renderRainTest(sampleRate,seed=731,voice='low'){
  const channels=[new Float32Array(sampleRate*RAIN_TEST_SECONDS),new Float32Array(sampleRate*RAIN_TEST_SECONDS)];
  for(const event of rainTestPattern(seed)){
    const hit=glassImpact(sampleRate,{...event,voice}),start=Math.round(event.time*sampleRate);
    const angle=(event.pan+1)*Math.PI/4,gains=[Math.cos(angle),Math.sin(angle)];
    for(let i=0;i<hit.length&&start+i<channels[0].length;i++){
      channels[0][start+i]+=hit[i]*gains[0];channels[1][start+i]+=hit[i]*gains[1];
    }
  }
  return channels;
}

export class RainSoundTest{
  constructor(onState,{createContext=()=>new (window.AudioContext||window.webkitAudioContext)()}={}){
    this.onState=onState;this.createContext=createContext;this.volume=.35;this.generation=0;this.playing=false;this.voice='low';
  }
  setVolume(value){
    this.volume=clamp(value);
    if(this.context&&this.gain)this.gain.gain.setTargetAtTime(this.volume,this.context.currentTime,.02);
  }
  async play(voice='low'){
    this.stop(false);const generation=++this.generation;
    this.voice=Object.hasOwn(RAIN_SOUND_VOICES,voice)?voice:'low';
    const label=RAIN_SOUND_VOICES[this.voice].label;
    this.playing=true;this.onState(true,'소리를 준비하고 있어요…',this.voice);
    try{
      if(!this.context||this.context.state==='closed'){
        this.context=this.createContext();this.gain=this.context.createGain();
        this.gain.gain.value=this.volume;this.gain.connect(this.context.destination);
      }
      await this.context.resume();if(generation!==this.generation)return;
      if(this.context.state!=='running')throw new Error('audio-suspended');
      const pcm=renderRainTest(this.context.sampleRate,731,this.voice),buffer=this.context.createBuffer(2,pcm[0].length,this.context.sampleRate);
      const volume=RAIN_SOUND_VOICES[this.voice].volume;
      pcm.forEach((channel,i)=>buffer.copyToChannel(channel.map(sample=>sample*volume),i));
      const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.gain);this.source=source;
      source.onended=()=>{
        source.disconnect();if(generation!==this.generation)return;
        this.source=null;this.playing=false;this.onState(false,`${label} · 5초 청취 완료`,this.voice);
      };
      source.start(this.context.currentTime+.02);
      this.onState(true,`${label} 재생 중 · 작은 방울 → 중간 → 큰 방울 → 연속 빗소리`,this.voice);
    }catch(error){
      if(generation!==this.generation)return;
      this.stop(false);this.onState(false,'소리를 재생하지 못했어요. 버튼을 다시 눌러주세요.',this.voice);
    }
  }
  stop(notify=true){
    this.generation++;this.playing=false;
    if(this.source){this.source.onended=null;this.source.stop();this.source.disconnect();this.source=null;}
    if(notify)this.onState(false,'테스트를 멈췄어요.',this.voice);
  }
  dispose(){this.stop();this.gain?.disconnect();this.context?.close().catch(()=>{});this.context=null;this.gain=null;}
}
