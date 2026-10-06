import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {glassImpact,rainTestPattern,renderRainTest,RainSoundTest,RAIN_SOUND_VOICES} from '../src/rain-sound.js';

const rms=pcm=>Math.sqrt(pcm.reduce((sum,value)=>sum+value*value,0)/pcm.length);
const spectrum=(pcm,rate)=>{
  const length=2048;let total=0,low=0,high=0,weighted=0;
  for(let bin=1;bin<length/2;bin++){
    let real=0,imaginary=0;
    for(let i=0;i<length;i++){
      const value=pcm[i]*(.5-.5*Math.cos(2*Math.PI*i/(length-1))),angle=2*Math.PI*bin*i/length;
      real+=value*Math.cos(angle);imaginary-=value*Math.sin(angle);
    }
    const energy=real*real+imaginary*imaginary,hz=bin*rate/length;
    total+=energy;weighted+=energy*hz;if(hz<800)low+=energy;if(hz>2000)high+=energy;
  }
  return {low:low/total,high:high/total,centroid:weighted/total};
};
test('synthesized glass hits are finite, click-free at their boundaries and decay rapidly',()=>{
  for(const sampleRate of [44100,48000])for(const size of [0,.5,1])for(const voice of ['low','higher','high']){
    const pcm=glassImpact(sampleRate,{size,voice}),head=pcm.slice(0,Math.round(sampleRate*.03)),tail=pcm.slice(-Math.round(sampleRate*.03));
    assert.equal(Math.abs(pcm[0]),0);assert.ok(Math.abs(pcm.at(-1))<.0001);
    assert.ok(pcm.every(sample=>Number.isFinite(sample)&&Math.abs(sample)<1));
    assert.ok(rms(head)>.01);assert.ok(rms(tail)<rms(head)*.015);
  }
  const small=glassImpact(48000,{size:.15}),large=glassImpact(48000,{size:.95});
  assert.ok(large.length>small.length);assert.ok(rms(large)>rms(small));
  assert.deepEqual(small,glassImpact(48000,{size:.15}));
  assert.notDeepEqual(small,glassImpact(48000,{size:.15,seed:72}));
});
test('the five-second stereo preview varies event timing and remains unclipped at maximum volume',()=>{
  const events=rainTestPattern();assert.ok(events.length>15&&events.length<45);
  assert.deepEqual(events.slice(0,3).map(event=>event.size),[.15,.5,.95]);
  assert.ok(new Set(events.slice(3).map((event,i)=>Math.round((event.time-events[i+2].time)*1000))).size>8);
  for(const rate of [44100,48000])for(const voice of ['low','higher','high']){
    const [left,right]=renderRainTest(rate,731,voice);assert.equal(left.length,rate*5);assert.equal(right.length,left.length);
    assert.ok(left.every(sample=>Number.isFinite(sample)&&Math.abs(sample)<1));
    assert.ok(right.every(sample=>Number.isFinite(sample)&&Math.abs(sample)<1));
    assert.ok(rms(left)>.01&&rms(right)>.01);assert.notDeepEqual(left,right);
    assert.ok(left.slice(-rate*.1).every(sample=>sample===0));
  }
});
test('wet impacts have a soft onset and little sharp high-frequency energy',()=>{
  for(const rate of [44100,48000])for(const size of [0,.5,1]){
    const pcm=glassImpact(rate,{size});
    const onset=pcm.slice(0,Math.round(rate*.0007)),body=pcm.slice(0,Math.round(rate*.012));
    assert.ok(rms(onset)<rms(body)*.2);
    const roughness=pcm.slice(2).map((value,i)=>value-2*pcm[i+1]+pcm[i]);
    assert.ok(rms(roughness)<rms(pcm)*.55);
  }
});
test('thick-board impacts concentrate spectral energy below 800 Hz',()=>{
  for(const rate of [44100,48000])for(const size of [0,.5,1]){
    const result=spectrum(glassImpact(rate,{size}),rate);
    assert.ok(result.low>.9,`${rate}/${size}: low ${result.low}`);
    assert.ok(result.high<.01,`${rate}/${size}: high ${result.high}`);
  }
});
test('the accepted lowest voice remains sample-identical to its approved version',()=>{
  const hash=createHash('sha256');
  for(const channel of renderRainTest(48000))hash.update(new Uint8Array(channel.buffer));
  assert.equal(hash.digest('hex'),'2f5aa485f250d3e623ab16e563546e14fcdc8d4ca715ff1df030d07abc601412');
});
test('the approved second voice becomes the middle voice without changing samples',()=>{
  const hash=createHash('sha256');
  for(const channel of renderRainTest(48000,731,'higher'))hash.update(new Uint8Array(channel.buffer));
  assert.equal(hash.digest('hex'),'f170ee54b67722c79cb4e9c59bb3fe9add9bea8cf308256e8f9b73145222dc32');
});
test('the second voice is higher while retaining a damped texture and similar loudness',()=>{
  for(const rate of [44100,48000])for(const size of [0,.5,1]){
    const low=glassImpact(rate,{size}),higher=glassImpact(rate,{size,voice:'higher'});
    const a=spectrum(low,rate),b=spectrum(higher,rate);
    assert.equal(low.length,higher.length);assert.ok(b.centroid>a.centroid*1.2);
    assert.ok(b.high<.03);assert.ok(rms(higher)/rms(low)>.8&&rms(higher)/rms(low)<1.2);
  }
});
test('the final high voice raises the spectral center above the middle voice at similar loudness',()=>{
  for(const rate of [44100,48000])for(const size of [0,.5,1]){
    const middle=glassImpact(rate,{size,voice:'higher'}),high=glassImpact(rate,{size,voice:'high'});
    const a=spectrum(middle,rate),b=spectrum(high,rate);
    assert.equal(middle.length,high.length);assert.ok(b.centroid>a.centroid*1.2);
    assert.ok(b.high<.08);assert.ok(rms(high)/rms(middle)>.8&&rms(high)/rms(middle)<1.2);
  }
});
function fixture(resume){
  const states=[],sources=[],gain={gain:{value:0,setTargetAtTime(value){this.value=value;}},connect(){},disconnect(){}};
  let closes=0;
  const context={sampleRate:48000,currentTime:12,state:'suspended',destination:{},createGain:()=>gain,
    async resume(){if(resume)await resume();this.state='running';},
    createBuffer:(count,length,rate)=>({count,length,rate,copyToChannel(pcm,index){this[index]=pcm;}}),
    createBufferSource(){const source={connect(){},disconnect(){this.disconnected=true;},
      start(time){this.started=time;},stop(){this.stopped=true;}};sources.push(source);return source;},
    async close(){this.state='closed';closes++;}
  };
  const player=new RainSoundTest((...state)=>states.push(state),{createContext:()=>context});
  return {player,context,gain,sources,states,get closes(){return closes;}};
}
test('Web Audio playback resumes on demand, supplies a stereo buffer and cleans up after completion',async()=>{
  const {player,context,gain,sources,states}=fixture();await player.play();
  assert.equal(context.state,'running');assert.equal(player.playing,true);assert.equal(gain.gain.value,.35);
  assert.equal(sources.length,1);assert.equal(sources[0].buffer.length,240000);assert.equal(sources[0].buffer.count,2);
  assert.equal(sources[0].started,12.02);assert.match(states.at(-1)[1],/재생 중/);
  player.setVolume(2);assert.equal(gain.gain.value,1);player.setVolume(-1);assert.equal(gain.gain.value,0);
  sources[0].onended();assert.equal(player.playing,false);assert.equal(player.source,null);assert.ok(sources[0].disconnected);
  assert.match(states.at(-1)[1],/청취 완료/);
});
test('stopping during audio unlock prevents late playback and restarting keeps only one source',async()=>{
  let finish;const waiting=fixture(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=waiting.player.play();waiting.player.stop();finish();await pending;
  assert.equal(waiting.sources.length,0);assert.equal(waiting.player.playing,false);
  const f=fixture();await f.player.play();await f.player.play();
  assert.equal(f.sources.length,2);assert.ok(f.sources[0].stopped);assert.equal(f.sources[0].onended,null);
  f.player.dispose();assert.ok(f.sources[1].stopped);assert.equal(f.closes,1);assert.equal(f.player.context,null);
});
test('switching between voices replaces playback and selects the matching buffer',async()=>{
  const {player,sources,states}=fixture();await player.play();await player.play('higher');
  assert.ok(sources[0].stopped);assert.equal(player.voice,'higher');assert.equal(states.at(-1)[2],'higher');
  assert.deepEqual(sources[1].buffer[0],renderRainTest(48000,731,'higher')[0].map(sample=>sample*RAIN_SOUND_VOICES.higher.volume));
  await player.play('high');assert.ok(sources[1].stopped);assert.equal(player.voice,'high');
  assert.deepEqual(sources[2].buffer[0],renderRainTest(48000,731,'high')[0].map(sample=>sample*RAIN_SOUND_VOICES.high.volume));
  await player.play('low');assert.ok(sources[2].stopped);assert.equal(player.voice,'low');
  assert.deepEqual(sources[3].buffer[0],renderRainTest(48000)[0].map(sample=>sample*RAIN_SOUND_VOICES.low.volume));
  player.dispose();
});

test('listening buttons apply quieter low and louder high levels to the approved waveforms',async()=>{
  const {player,sources}=fixture(),levels=[];
  for(const voice of ['low','higher','high']){
    await player.play(voice);const pcm=sources.at(-1).buffer[0];levels.push(rms(pcm));
    assert.ok(pcm.every(sample=>Math.abs(sample)<1));
  }
  assert.ok(levels[0]<levels[1]&&levels[1]<levels[2]);assert.ok(levels[2]>levels[0]*2);
  player.dispose();
});
test('unavailable or rejected audio reports failure without leaving a playing state',async()=>{
  const states=[],unavailable=new RainSoundTest((...state)=>states.push(state),{createContext:()=>{throw new Error('unavailable');}});
  await unavailable.play();assert.equal(unavailable.playing,false);assert.match(states.at(-1)[1],/재생하지 못/);
  const f=fixture(()=>Promise.reject(new Error('denied')));await f.player.play();
  assert.equal(f.player.playing,false);assert.equal(f.sources.length,0);assert.match(f.states.at(-1)[1],/재생하지 못/);
});
