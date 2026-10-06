// Fixed voice/tail storage shared by the AudioWorklet and its offline tests.
export class RainVoiceMixer{
  constructor(rate){
    this.rate=rate;this.limit=12;this.active=0;this.tails=0;this.frame=0;this.started=0;this.rejected=0;
    this.counts=new Uint16Array(3);this.banks=[];this.fadeFrames=Math.round(rate*.008);this.fadeRate=Math.exp(-1/(rate*.002));
    this.slots=Array.from({length:128},()=>({id:-1,position:0,started:0,protect:0,tailId:-1,tailPosition:0,tailLeft:0,tailGain:0}));
  }
  bank(buffers,gains){this.banks=buffers.map((pcm,i)=>Float32Array.from(pcm,value=>value*gains[Math.floor(i/8)]));}
  setLimit(value){this.limit=Math.max(1,Math.min(128,Math.round(Number.isFinite(value)?value:12)));}
  birth(id){
    if(!this.banks[id]||this.active>this.limit){this.rejected++;return false;}
    const voice=Math.floor(id/8);let slot;
    if(this.active<this.limit)slot=this.slots.find(s=>s.id<0);
    else for(const s of this.slots){
      if(s.id<0)continue;const other=Math.floor(s.id/8);
      if(other===voice?this.frame<s.protect:this.counts[other]<=this.counts[voice])continue;
      if(!slot||this.counts[other]>this.counts[Math.floor(slot.id/8)]||this.counts[other]===this.counts[Math.floor(slot.id/8)]&&s.started<slot.started)slot=s;
    }
    if(!slot){this.rejected++;return false;}
    let delay=0;
    if(slot.id>=0){
      this.counts[Math.floor(slot.id/8)]--;this.active--;
      if(slot.position>0){
        if(slot.tailId<0)this.tails++;
        slot.tailId=slot.id;slot.tailPosition=slot.position;slot.tailLeft=this.fadeFrames;slot.tailGain=1;delay=this.fadeFrames;
      }
    }
    slot.id=id;slot.position=-delay;slot.started=this.frame+delay;
    slot.protect=slot.started+Math.round(this.rate*(.035+.045*(id%8)/7));this.counts[voice]++;this.active++;this.started++;
    return true;
  }
  process(output){
    output.fill(0);const gain=Math.min(1,12/Math.max(1,this.active+this.tails));
    for(const s of this.slots){
      if(s.id>=0){
        const pcm=this.banks[s.id];
        for(let i=0;i<output.length;i++){
          if(s.position<0){s.position++;continue;}
          if(s.position>=pcm.length){this.counts[Math.floor(s.id/8)]--;this.active--;s.id=-1;break;}
          output[i]+=pcm[s.position++]*gain;
        }
      }
      if(s.tailId>=0){
        const pcm=this.banks[s.tailId];
        for(let i=0;i<output.length;i++){
          if(s.tailLeft<=0||s.tailPosition>=pcm.length){s.tailId=-1;this.tails--;break;}
          output[i]+=pcm[s.tailPosition++]*s.tailGain*gain;s.tailGain*=this.fadeRate;s.tailLeft--;
        }
      }
    }
    this.frame+=output.length;
  }
  clear(){
    for(const s of this.slots){s.id=-1;s.tailId=-1;}this.active=0;this.tails=0;this.counts.fill(0);
  }
}
