import {RainVoiceMixer} from './rain-voice-mixer.js';

class RainAudioProcessor extends AudioWorkletProcessor{
  constructor(){
    super();this.mixer=new RainVoiceMixer(sampleRate);this.reportAt=0;
    this.port.onmessage=({data})=>{
      if(data.type==='bank')this.mixer.bank(data.buffers,data.gains);
      else if(data.type==='limit')this.mixer.setLimit(data.value);
      else if(data.type==='autoGain')this.mixer.setAutoGain(data.value);
      else if(data.type==='clear')this.mixer.clear();
      else if(data.type==='births')for(const id of data.ids)this.mixer.birth(id);
    };
  }
  process(inputs,outputs){
    const output=outputs[0]?.[0];if(!output)return true;
    this.mixer.process(output);
    if(this.mixer.frame>=this.reportAt){
      this.reportAt=this.mixer.frame+sampleRate/2;
      this.port.postMessage({active:this.mixer.active,tails:this.mixer.tails,started:this.mixer.started,rejected:this.mixer.rejected,voices:Array.from(this.mixer.counts)});
    }
    return true;
  }
}
registerProcessor('rain-audio',RainAudioProcessor);
