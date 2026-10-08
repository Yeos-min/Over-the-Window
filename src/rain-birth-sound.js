import {RainSoundTest,glassImpact,RAIN_SOUND_VOICES} from './rain-sound.js';
import {MAX_RADIUS,BIRTH_MAX_RADIUS} from './codrops-physics.js';
import {RAIN_ZOOM} from './heartfelt-field.js';

export function birthSound(radius,height){
  // Shared bounds include the smallest glass beads and shader static drops.
  const head=.4*height/(12*RAIN_ZOOM);
  const min=Math.min(.8,.3*height/(40*RAIN_ZOOM)),max=Math.max(BIRTH_MAX_RADIUS,Math.min(MAX_RADIUS,head));
  // Relative size bands keep fine, medium and large births distinct even when
  // large Heartfelt heads extend the upper bound far beyond ordinary beads.
  const size=Math.max(0,Math.min(1,Math.log(radius/min)/Math.log(max/min)));
  return {voice:size<1/3?'low':size<2/3?'higher':'high',size};
}

function impactSeed(drop){
  let seed=(drop.pathSeed??Math.trunc(drop.x*4099+drop.y*131+drop.r*8191))>>>0;
  seed=Math.imul(seed^(seed>>>16),0x7feb352d);seed=Math.imul(seed^(seed>>>15),0x846ca68b);
  return (seed^(seed>>>16))>>>0;
}

export class RainBirthSound extends RainSoundTest{
  constructor(onState,options={}){
    super(onState,options);this.onEnabled=options.onEnabled||(()=>{});
    this.enabled=false;this.pending=false;this.liveGeneration=0;this.hits=new Set();this.buffers=new Map();this.heard=new WeakMap();
    this.voiceLimit=12;this.autoGain=true;this.liveGain=null;this.liveContext=null;this.retiringHits=new Set();
    this.worklet=null;this.workletContext=null;this.pendingBirths=[];this.audioStats={active:0,tails:0,started:0,rejected:0,voices:[0,0,0]};
    this.createWorkletNode=options.createWorkletNode??(typeof AudioWorkletNode==='function'?context=>new AudioWorkletNode(context,'rain-audio',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]}):null);
    this.boundsHeight=0;this.thresholds=[];
  }
  setVoiceLimit(value){
    this.voiceLimit=Math.max(1,Math.min(128,Math.round(Number.isFinite(value)?value:12)));
    this.worklet?.port.postMessage({type:'limit',value:this.voiceLimit});
    return this.voiceLimit;
  }
  setAutoGain(value){
    this.autoGain=Boolean(value);this.worklet?.port.postMessage({type:'autoGain',value:this.autoGain});
    this.balanceHits();return this.autoGain;
  }
  classify(radius,height){
    if(height!==this.boundsHeight){
      const head=.4*height/(12*RAIN_ZOOM),min=Math.min(.8,.3*height/(40*RAIN_ZOOM)),max=Math.max(BIRTH_MAX_RADIUS,Math.min(MAX_RADIUS,head));
      const step=Math.cbrt(max/min);this.thresholds=[min*step,min*step*step];this.boundsHeight=height;
    }
    return radius<this.thresholds[0]?0:radius<this.thresholds[1]?1:2;
  }
  async prepareWorklet(){
    if(!this.createWorkletNode||!this.context.audioWorklet)return;
    if(this.workletContext===this.context)return;
    this.worklet?.disconnect();this.worklet=null;
    try{
      const context=this.context;await context.audioWorklet.addModule(new URL('./rain-audio-worklet.js',import.meta.url));
      if(this.context!==context||context.state==='closed')return;
      const node=this.createWorkletNode(context),buffers=[];
      for(const voice of ['low','higher','high'])for(let seed=0;seed<8;seed++)buffers.push(glassImpact(context.sampleRate,{size:.5,seed:71+seed,voice}));
      node.port.onmessage=event=>{this.audioStats=event.data;};node.connect(this.gain);
      node.port.postMessage({type:'bank',buffers,gains:['low','higher','high'].map(voice=>.2*RAIN_SOUND_VOICES[voice].volume)},buffers.map(pcm=>pcm.buffer));
      node.port.postMessage({type:'limit',value:this.voiceLimit});
      node.port.postMessage({type:'autoGain',value:this.autoGain});this.worklet=node;this.workletContext=context;
    }catch{this.workletContext=this.context;/* The existing node backend remains available. */}
  }
  flush(){
    if(!this.worklet||!this.pendingBirths.length)return;
    this.worklet.port.postMessage({type:'births',ids:this.pendingBirths});this.pendingBirths=[];
  }
  balanceHits(){if(this.liveGain)this.liveGain.gain.value=this.autoGain?Math.min(1,12/Math.max(1,this.hits.size+this.retiringHits.size)):1;}
  replacement(voice){
    const counts={low:0,higher:0,high:0};for(const hit of this.hits)counts[hit.voice]++;
    let candidate;
    for(const hit of this.hits){
      // A rarer voice gets room immediately; the same voice can replace only
      // a fading tail, after its seed-dependent audible attack has finished.
      if(hit.voice===voice?this.context.currentTime<hit.protectUntil:counts[hit.voice]<=counts[voice])continue;
      if(!candidate||counts[hit.voice]>counts[candidate.voice]||counts[hit.voice]===counts[candidate.voice]&&hit.startedAt<candidate.startedAt)candidate=hit;
    }
    return candidate;
  }
  retire(hit){
    this.hits.delete(hit);
    if(hit.startedAt>=this.context.currentTime){
      hit.source.onended=null;hit.source.stop();hit.source.disconnect();hit.level.disconnect();return 0;
    }
    // Crossfade for 8 ms instead of waiting for the nearly silent 175 ms tail
    // to release a whole batch of slots at once.
    this.retiringHits.add(hit);hit.level.gain.setTargetAtTime(0,this.context.currentTime,.002);
    hit.source.stop(this.context.currentTime+.008);return .008;
  }
  async setEnabled(enabled){
    const generation=++this.liveGeneration;this.pending=false;this.enabled=false;this.clearHits();
    if(!enabled){this.onEnabled(false,'빗소리 꺼짐');return;}
    this.stop(this.playing);this.pending=true;this.onEnabled(false,'빗소리를 준비하고 있어요…',true);
    try{
      if(!this.context||this.context.state==='closed'){
        this.context=this.createContext();this.gain=this.context.createGain();
        this.gain.gain.value=this.volume;this.gain.connect(this.context.destination);this.buffers.clear();
      }
      await this.context.resume();if(generation!==this.liveGeneration)return;
      if(this.context.state!=='running')throw new Error('audio-suspended');
      await this.prepareWorklet();if(generation!==this.liveGeneration)return;
      this.pending=false;this.enabled=true;this.onEnabled(true,'빗소리 켜짐 · 작은 방울 낮게 / 큰 방울 높게');
    }catch(error){
      if(generation!==this.liveGeneration)return;
      this.pending=false;this.enabled=false;this.onEnabled(false,'빗소리를 켜지 못했어요. 다시 눌러주세요.');
    }
  }
  impact(drop,height){
    if(!Number.isFinite(drop.r)||drop.r<=0||!Number.isFinite(height)||height<=0)return false;
    const birthVersion=drop.source?.birthVersion??0;
    if(!this.enabled||this.playing||this.context?.state!=='running'||this.heard.get(drop)===birthVersion)return false;
    this.heard.set(drop,birthVersion);
    const voiceIndex=this.classify(drop.r,height),voice=['low','higher','high'][voiceIndex];let delay=0;
    if(this.worklet){
      if(this.pendingBirths.length>=4096)return false;
      this.pendingBirths.push(voiceIndex*8+impactSeed(drop)%8);return true;
    }
    // Lowering the debug limit lets existing attacks finish. At a full limit,
    // replace fading or overrepresented voices rather than starving new ones.
    if(this.hits.size>this.voiceLimit)return false;
    if(this.hits.size===this.voiceLimit){
      const victim=this.replacement(voice);if(!victim)return false;delay=this.retire(victim);
    }
    const seed=impactSeed(drop)%8,key=`${voice}:${seed}`;
    if(!this.buffers.has(key)){
      // Keep each approved voice's timbre; size selects the voice, not a downward pitch bend.
      const pcm=glassImpact(this.context.sampleRate,{size:.5,seed:71+seed,voice});
      const buffer=this.context.createBuffer(1,pcm.length,this.context.sampleRate);buffer.copyToChannel(pcm,0);
      this.buffers.set(key,buffer);
    }
    if(this.liveContext!==this.context){
      this.liveGain?.disconnect();this.liveGain=this.context.createGain();this.liveGain.connect(this.gain);this.liveContext=this.context;
    }
    const source=this.context.createBufferSource(),level=this.context.createGain();
    source.buffer=this.buffers.get(key);level.gain.value=.2*RAIN_SOUND_VOICES[voice].volume;source.connect(level);level.connect(this.liveGain);
    const startedAt=this.context.currentTime+delay;
    const hit={source,level,voice,startedAt,protectUntil:startedAt+.035+.045*seed/7};this.hits.add(hit);
    this.balanceHits();
    source.onended=()=>{source.disconnect();level.disconnect();this.hits.delete(hit);this.retiringHits.delete(hit);this.balanceHits();};
    source.start(startedAt);return true;
  }
  clearHits(){
    this.pendingBirths.length=0;this.worklet?.port.postMessage({type:'clear'});
    for(const {source,level} of [...this.hits,...this.retiringHits]){source.onended=null;source.stop();source.disconnect();level.disconnect();}
    this.hits.clear();this.retiringHits.clear();
    this.balanceHits();
  }
  async play(voice='low'){this.clearHits();return super.play(voice);}
  dispose(){this.setEnabled(false);this.buffers.clear();this.worklet?.disconnect();this.worklet?.port.close();this.worklet=null;this.workletContext=null;this.liveGain?.disconnect();this.liveGain=null;this.liveContext=null;super.dispose();}
}
