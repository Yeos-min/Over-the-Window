import {writeFile} from 'node:fs/promises';
import {renderRainTest,RAIN_SOUND_VOICES} from '../src/rain-sound.js';

const output=process.argv[2];if(!output)throw new Error('Pass an output WAV path.');
const voice=process.argv[3]||'low';if(!Object.hasOwn(RAIN_SOUND_VOICES,voice))throw new Error('Choose low, higher or high.');
const rate=48000,channels=renderRainTest(rate,731,voice),frames=channels[0].length,bytes=frames*4;
const wav=Buffer.alloc(44+bytes);
wav.write('RIFF',0);wav.writeUInt32LE(36+bytes,4);wav.write('WAVEfmt ',8);
wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);
wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);
wav.write('data',36);wav.writeUInt32LE(bytes,40);
let peak=0,square=0;
for(let i=0;i<frames;i++)for(let ch=0;ch<2;ch++){
  const sample=channels[ch][i]*.35*RAIN_SOUND_VOICES[voice].volume;peak=Math.max(peak,Math.abs(sample));square+=sample*sample;
  wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample))*32767),44+(i*2+ch)*2);
}
await writeFile(output,wav);
console.log(JSON.stringify({output,voice,seconds:frames/rate,sampleRate:rate,channels:2,peak,rms:Math.sqrt(square/(frames*2))}));
