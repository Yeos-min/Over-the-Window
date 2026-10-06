import test from 'node:test';
import assert from 'node:assert/strict';
import {RainBirthSound,birthSound} from '../src/rain-birth-sound.js';
import {CodropsPhysics,MIN_RADIUS,BIRTH_MAX_RADIUS} from '../src/codrops-physics.js';
import {HeartfeltField,RAIN_ZOOM} from '../src/heartfelt-field.js';
import {HeartfeltRain} from '../src/heartfelt-rain.js';
import {BeadField} from '../src/bead-field.js';
import {glassImpact} from '../src/rain-sound.js';
import {WaterMap} from '../src/raindrops.js';

function fixture(resume){
  const sources=[],enabled=[],gains=[];
  const context={state:'suspended',sampleRate:48000,currentTime:4,destination:{},
    async resume(){if(resume)await resume();this.state='running';},async close(){this.state='closed';},
    createGain(){const gain={gain:{value:0,setTargetAtTime(value){this.value=value;}},connect(){},disconnect(){}};gains.push(gain);return gain;},
    createBuffer:(channels,length)=>({channels,length,copyToChannel(pcm,index){this[index]=pcm;}}),
    createBufferSource(){const source={connect(){},disconnect(){this.disconnected=true;},start(time){this.time=time;},stop(){this.stopped=true;}};
      source.stop=time=>{source.stopped=true;source.stopTime=time;};sources.push(source);return source;}
  };
  const player=new RainBirthSound(()=>{},{createContext:()=>context,onEnabled:(...args)=>enabled.push(args)});
  return {player,context,sources,enabled,gains};
}
test('smallest birth selects low, middle selects middle, largest selects high at every viewport size',()=>{
  for(const height of [300,720,1536]){
    const head=.4*height/(12*RAIN_ZOOM),min=Math.min(.8,.3*height/(40*RAIN_ZOOM)),max=Math.max(BIRTH_MAX_RADIUS,Math.min(14.4,head));
    assert.equal(birthSound(min,height).voice,'low');assert.equal(birthSound(Math.sqrt(min*max),height).voice,'higher');
    assert.equal(birthSound(max,height).voice,'high');assert.equal(birthSound(.8,height).voice,'low');
    assert.equal(birthSound(50,height).voice,'high');
  }
});

test('wide desktop birth bands distinguish fine glass beads, medium beads and large heads',()=>{
  const height=1532;
  assert.equal(birthSound(.8,height).voice,'low');assert.equal(birthSound(2,height).voice,'low');
  assert.equal(birthSound(3.2,height).voice,'higher');assert.equal(birthSound(4.5,height).voice,'higher');
  assert.equal(birthSound(8,height).voice,'high');assert.equal(birthSound(14.4,height).voice,'high');
  let previous=-1;const ranks={low:0,higher:1,high:2};
  for(let r=.8;r<=14.4;r+=.1){const rank=ranks[birthSound(r,height).voice];assert.ok(rank>=previous);previous=rank;}
});

test('a full low pool cannot starve new middle or high births, even at a one-voice limit',async()=>{
  const {player,sources}=fixture();await player.setEnabled(true);
  for(let i=0;i<12;i++)assert.equal(player.impact({r:.8,pathSeed:i},600),true);
  assert.equal(player.impact({r:Math.sqrt(.8*8),pathSeed:20},600),true);
  assert.equal(player.impact({r:8,pathSeed:21},600),true);
  const voices=[...player.hits].map(hit=>hit.voice);
  assert.ok(voices.includes('higher')&&voices.includes('high'));assert.equal(player.hits.size,12);
  assert.ok(sources.slice(0,12).some(source=>source.stopped));
  player.clearHits();player.setVoiceLimit(1);
  player.impact({r:.8,pathSeed:0},600);assert.equal(player.impact({r:8,pathSeed:1},600),true);
  assert.equal([...player.hits][0].voice,'high');assert.equal(player.hits.size,1);player.dispose();
});

test('fading tails release slots before the synchronized 175 ms endings with a short crossfade',async()=>{
  const {player,context,sources}=fixture();await player.setEnabled(true);
  for(let i=0;i<12;i++)player.impact({r:.8,pathSeed:i},600);
  assert.equal(player.impact({r:.8,pathSeed:44},600),false); // Fresh attacks stay protected.
  context.currentTime=4.1;assert.equal(player.impact({r:.8,pathSeed:45},600),true);
  assert.equal(player.hits.size,12);assert.equal(player.retiringHits.size,1);
  const old=[...player.retiringHits][0],replacement=sources.at(-1);
  assert.equal(old.source.stopTime,4.108);assert.equal(replacement.time,4.108);
  old.source.onended();assert.equal(player.retiringHits.size,0);assert.equal(player.hits.size,12);
  context.currentTime=4.12;player.impact({r:.8,pathSeed:46},600);
  assert.equal(player.retiringHits.size,1);player.clearHits();
  assert.equal(player.hits.size,0);assert.equal(player.retiringHits.size,0);
  assert.ok(sources.every(source=>source.disconnected));player.dispose();
});

test('static cell indices and unseeded condensation positions use all eight timbre variants',async()=>{
  const {player}=fixture();await player.setEnabled(true);player.setVoiceLimit(128);
  for(let i=0;i<64;i++)player.impact({r:.8,pathSeed:i*4},600);
  assert.equal(player.buffers.size,8);player.clearHits();player.buffers.clear();
  for(let i=0;i<64;i++)player.impact({r:.8,x:13+i*7,y:21+i*3},600);
  assert.equal(player.buffers.size,8);player.dispose();
});

test('shader static drops emit at their visible birth edge, once per appearance and again after replenishment',async()=>{
  const field=new HeartfeltField({canvasFactory:()=>({getContext:()=>({
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})
  })})});
  const p=new CodropsPhysics(800,600,()=>.5),rain=new HeartfeltRain(),events=[],versions=[];
  const {player,sources}=fixture();await player.setEnabled(true);
  p.drops=[];p.onImpact=d=>{if(d.source){events.push(d);versions.push(d.source.birthVersion);player.impact(d,600);}};
  const map={beads:new BeadField(22200),massScale:.1,coalesce:()=>false};field.seed(800,600,map);
  field.step(rain,p,map);assert.equal(events.length,0); // Already visible initial seeds are quiet.
  const record=field.records.find(r=>r.alive&&r.nz>.1&&!r.wasVisible&&((r.nz*10)%1)>.5);
  assert.ok(record);field.records=[record];
  rain.staticTime=13-record.nz+.015;field.step(rain,p,map);
  assert.equal(events.length,1);assert.equal(events[0].source,record);assert.equal(player.hits.size,1);
  assert.equal([...player.hits][0].voice,'low');sources.at(-1).onended();
  field.step(rain,p,map);assert.equal(events.length,1);
  field.consume(record.bead);map.beads.remove([record.bead]);field.step(rain,p,map);
  assert.equal(record.wasVisible,false);
  rain.staticTime=record.returnAt+.015;field.step(rain,p,map);
  assert.equal(events.length,2);assert.equal(events[0],events[1]);assert.deepEqual(versions,[1,2]);assert.equal(player.hits.size,1);
  p.active=false;rain.staticTime+=1;field.step(rain,p,map);assert.equal(events.length,2);
  player.dispose();
});

test('new condensation emits only successful births and merging existing beads stays quiet',()=>{
  const p=new CodropsPhysics(100,100,()=>.5),events=[];p.onImpact=d=>events.push(d);
  const map=Object.assign(Object.create(WaterMap.prototype),{
    width:100,height:100,physics:p,beads:new BeadField(1),sprites:[{}],dctx:{drawImage(){}},field:{visible:()=>true}
  });
  map.coalesce=()=>false;map.tinyDrop();assert.equal(events.length,1);assert.equal(map.beads.count,1);
  assert.ok(events[0].r>=.8&&events[0].r<=4.5);
  map.tinyDrop();assert.equal(events.length,1); // Capacity rejected, nothing appeared.
  map.coalesce=()=>true;map.tinyDrop();assert.equal(events.length,2); // Fresh bead contacts existing water.
  map.coalesce({x:10,y:10,r:2},true);assert.equal(events.length,2);
});

test('a Heartfelt head first registered offscreen emits when its physical body enters the glass',()=>{
  const field=new HeartfeltField({canvasFactory:()=>({getContext:()=>({
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})
  })})});
  const p=new CodropsPhysics(800,600,()=>.5),rain=new HeartfeltRain(),events=[];p.drops=[];p.onImpact=d=>events.push(d);
  const map={beads:new BeadField(22200),massScale:.1,coalesce:()=>false};field.seed(800,600,map);field.step(rain,p,map);
  const state=[...field.heads.values()].find(s=>!s.impacted);assert.ok(state);
  const before=events.length;state.drop.x=400;state.drop.y=1;field.step(rain,p,map);
  assert.equal(events.length,before+1);assert.equal(events.at(-1),state.drop);
  field.step(rain,p,map);assert.equal(events.length,before+1);
});
test('live audio requires activation and plays each birth once using the correct approved voice',async()=>{
  const {player,sources}=fixture(),drop={r:MIN_RADIUS,pathSeed:0};
  assert.equal(player.impact(drop,600),false);assert.equal(sources.length,0);
  await player.setEnabled(true);assert.equal(player.enabled,true);
  for(const r of [MIN_RADIUS,(MIN_RADIUS+BIRTH_MAX_RADIUS)/2,BIRTH_MAX_RADIUS]){
    const d={r,pathSeed:0},voice=birthSound(r,600).voice;
    assert.equal(player.impact(d,600),true);assert.equal(player.impact(d,600),false);
    const source=sources.at(-1);assert.deepEqual(source.buffer[0],glassImpact(48000,{size:.5,seed:71,voice}));
    assert.equal(source.time,4);source.onended();assert.ok(source.disconnected);
  }
  await player.setEnabled(false);assert.equal(player.impact({r:8},600),false);
});

test('live low hits are quieter than middle hits and high hits are louder without clipping a dense mix',async()=>{
  const {player,sources}=fixture();await player.setEnabled(true);
  const rms=(pcm,gain)=>Math.sqrt(pcm.reduce((sum,x)=>sum+x*x,0)/pcm.length)*gain;
  const levels=[];
  for(const r of [.8,Math.sqrt(.8*8),8]){
    assert.equal(player.impact({r,pathSeed:0},600),true);
    const hit=[...player.hits].at(-1),source=sources.at(-1);
    levels.push(rms(source.buffer[0],hit.level.gain.value));source.onended();
  }
  assert.ok(levels[0]<levels[1]&&levels[1]<levels[2]);assert.ok(levels[2]>levels[0]*2);
  player.setVoiceLimit(128);
  for(let i=0;i<128;i++)assert.equal(player.impact({r:8,pathSeed:i},600),true);
  let bound=0;
  for(const hit of player.hits){
    const peak=hit.source.buffer[0].reduce((max,x)=>Math.max(max,Math.abs(x)),0);
    bound+=peak*hit.level.gain.value;
  }
  assert.ok(bound*player.liveGain.gain.value<1);player.dispose();
});
test('dense births have capped polyphony and clear without replaying pending hits',async()=>{
  const {player,sources}=fixture();await player.setEnabled(true);
  for(let i=0;i<100;i++)player.impact({r:8,pathSeed:i},600);
  assert.equal(player.hits.size,12);assert.equal(sources.length,12);assert.ok(player.buffers.size<=24);
  player.clearHits();assert.equal(player.hits.size,0);assert.ok(sources.every(source=>source.stopped&&source.disconnected));
  assert.equal(player.impact({r:8,pathSeed:3},600),true);await player.play('high');
  assert.equal(player.hits.size,0);assert.equal(player.impact({r:8},600),false);player.dispose();assert.equal(player.enabled,false);
});

test('voice limit changes apply to new births while existing tails finish and dense mixing stays bounded',async()=>{
  const {player,sources}=fixture();await player.setEnabled(true);
  assert.equal(player.setVoiceLimit(32),32);
  for(let i=0;i<32;i++)assert.equal(player.impact({r:8,pathSeed:i},600),true);
  const skipped={r:8,pathSeed:33};assert.equal(player.impact(skipped,600),false);
  assert.equal(player.hits.size,32);assert.equal(player.liveGain.gain.value,12/32);
  assert.ok([...player.hits].reduce((sum,hit)=>sum+hit.level.gain.value,0)*player.liveGain.gain.value<=2.88+1e-12);
  player.setVoiceLimit(16);assert.ok(sources.every(source=>!source.stopped));
  assert.equal(player.impact({r:8},600),false);
  for(const source of sources.slice(0,17))source.onended();
  assert.equal(player.hits.size,15);assert.equal(player.impact({r:8},600),true);
  player.clearHits();assert.equal(player.voiceLimit,16);assert.equal(player.liveGain.gain.value,1);
  assert.equal(player.impact(skipped,600),false); // Never replay a skipped old birth.
  assert.equal(player.setVoiceLimit(1000),128);
  for(let i=0;i<128;i++)assert.equal(player.impact({r:8,pathSeed:i},600),true);
  assert.equal(player.impact({r:8},600),false);assert.equal(player.liveGain.gain.value,12/128);
  assert.ok(player.buffers.size<=24);player.clearHits();
  assert.equal(player.setVoiceLimit(0),1);assert.equal(player.impact({r:8},600),true);
  assert.equal(player.impact({r:8},600),false);player.clearHits();
  assert.equal(player.setVoiceLimit(NaN),12);assert.equal(player.setVoiceLimit(3.6),4);
  player.dispose();assert.equal(player.liveGain,null);
});
test('canceling activation prevents a late resume from enabling live playback',async()=>{
  let finish;const {player}=fixture(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=player.setEnabled(true);assert.equal(player.pending,true);
  await player.setEnabled(false);finish();await pending;assert.equal(player.enabled,false);assert.equal(player.pending,false);
});
test('ordinary rainfall emits birth events once; reset, trails, merges and pause do not',()=>{
  const p=new CodropsPhysics(800,600,()=>.5),events=[];p.drops=[];p.onImpact=drop=>events.push(drop);
  p.step(1/16,0);assert.equal(events.length,1);const first=events[0];
  assert.equal(first.age,0);assert.ok(p.drops.includes(first));
  p.step(1/60,0);assert.equal(events.length,1);
  p.absorb(first,p.drop(first.x,first.y,2));p.absorbMicro(first,[{x:first.x,y:first.y,r:1}]);
  p.reset();assert.equal(events.length,1);p.active=false;p.step(1,0);assert.equal(events.length,1);
  p.active=true;p.drops=[p.drop(400,100,8,true)];p.drops[0].nextSpawn=0;p.spawnClock=-100;
  p.step(1/60,0);assert.ok(p.drops.some(d=>d.parent));assert.equal(events.length,1);
});
test('Heartfelt head births emit events once per new visible head and stop when paused',()=>{
  const field=new HeartfeltField({canvasFactory:()=>({width:1,height:1,getContext:()=>({
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})
  })})});
  const p=new CodropsPhysics(800,600,()=>.5),rain=new HeartfeltRain(),events=[];p.drops=[];p.onImpact=d=>events.push(d);
  const map={beads:new BeadField(22200),massScale:.1,coalesce:()=>false};field.seed(800,600,map);
  assert.equal(events.length,0);field.step(rain,p,map);const count=events.length;assert.ok(count>0);
  assert.ok(events.every(d=>d.heartfelt&&d.x>=0&&d.x<=800&&d.y>=0&&d.y<=600));
  field.step(rain,p,map);assert.equal(events.length,count);p.active=false;rain.update(1);field.step(rain,p,map);assert.equal(events.length,count);
});
