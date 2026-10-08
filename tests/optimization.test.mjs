import test from 'node:test';
import assert from 'node:assert/strict';
import {RainVoiceMixer} from '../src/rain-voice-mixer.js';
import {RainBirthSound,birthSound} from '../src/rain-birth-sound.js';
import {glassImpact,RAIN_SOUND_VOICES} from '../src/rain-sound.js';
import {TrailMemory,trailOpacity} from '../src/trail-memory.js';
import {HeartfeltField,saw,smooth} from '../src/heartfelt-field.js';
import {RainRenderer} from '../src/rain-renderer.js';
import {renderSize} from '../src/render-size.js';

const voices=['low','higher','high'];
function mixer(rate=48000){
  const m=new RainVoiceMixer(rate);
  m.bank(voices.flatMap(voice=>Array.from({length:8},(_,seed)=>glassImpact(rate,{size:.5,seed:71+seed,voice}))),voices.map(v=>.2*RAIN_SOUND_VOICES[v].volume));
  return m;
}

test('worklet mixer preserves each approved PCM and its relative volume',()=>{
  for(const rate of [44100,48000])for(let v=0;v<3;v++){
    const m=mixer(rate),block=new Float32Array(128),actual=[];m.birth(v*8);
    while(m.active){m.process(block);actual.push(...block);}
    const expected=Float32Array.from(glassImpact(rate,{size:.5,seed:71,voice:voices[v]}),x=>x*.2*RAIN_SOUND_VOICES[voices[v]].volume||0);
    assert.deepEqual(Float32Array.from(actual.slice(0,expected.length)),expected);
    assert.ok(actual.slice(expected.length).every(x=>x===0));assert.equal(m.counts[v],0);
  }
});

test('fixed mixer slots keep all three voices audible under dense births without clipping',()=>{
  const m=mixer(),slots=m.slots.slice(),block=new Float32Array(128),admitted=[0,0,0];m.setLimit(50);
  for(let frame=0;frame<1000;frame++){
    for(let birth=0;birth<25;birth++){const v=birth===0?2:birth<8?1:0;if(m.birth(v*8+frame%8))admitted[v]++;}
    m.process(block);assert.ok(block.every(x=>Number.isFinite(x)&&Math.abs(x)<1));
    assert.ok(m.active<=50&&m.tails<=128);assert.equal(m.counts.reduce((a,b)=>a+b),m.active);
  }
  assert.ok(admitted.every(n=>n>100));m.slots.forEach((slot,i)=>assert.equal(slot,slots[i]));
  m.setLimit(1);assert.equal(m.birth(0),false);
  m.clear();m.process(block);assert.ok(block.every(x=>x===0));assert.equal(m.active+m.tails,0);
  assert.equal(m.birth(0),true);assert.equal(m.birth(16),true);assert.equal(m.active,1);assert.equal(m.counts[2],1);
});

test('automatic gain toggles during dense playback without changing active voices',()=>{
  const m=new RainVoiceMixer(48000),block=new Float32Array(128);
  m.bank(Array.from({length:24},()=>new Float32Array(1024).fill(.01)),[1,1,1]);m.setLimit(24);
  for(let i=0;i<24;i++)assert.equal(m.birth(i),true);
  m.process(block);const balanced=block[0];
  m.setAutoGain(false);m.process(block);
  assert.equal(block[0],balanced*2);assert.equal(m.active,24);assert.equal(m.started,24);
  m.setAutoGain(true);m.process(block);assert.equal(block[0],balanced);
  m.setAutoGain(false);m.clear();assert.equal(m.autoGain,false);
});

test('replacement protects fresh attacks and fades a started tail for eight milliseconds',()=>{
  const m=mixer(),block=new Float32Array(128);m.setLimit(1);m.birth(0);
  assert.equal(m.birth(1),false);
  for(let i=0;i<20;i++)m.process(block);
  assert.equal(m.birth(1),true);assert.equal(m.tails,1);
  assert.equal(m.slots[0].position,-384);
  for(let i=0;i<4;i++)m.process(block);
  assert.equal(m.tails,0);assert.ok(m.slots[0].position>0);
});

function workletFixture(fail=false){
  const messages=[],nodes=[],sources=[];
  const context={state:'running',sampleRate:48000,currentTime:0,destination:{},
    async resume(){},async close(){this.state='closed';},
    audioWorklet:{async addModule(url){assert.match(String(url),/rain-audio-worklet.js$/);if(fail)throw Error('unsupported');}},
    createGain:()=>({gain:{value:0,setTargetAtTime(){}},connect(){},disconnect(){}}),
    createBuffer:()=>({copyToChannel(){}}),createBufferSource(){const s={connect(){},disconnect(){},start(){},stop(){}};sources.push(s);return s;}
  };
  const player=new RainBirthSound(()=>{},{createContext:()=>context,createWorkletNode:()=>{
    const node={connect(){},disconnect(){this.disconnected=true;},port:{postMessage:m=>messages.push(m),close(){this.closed=true;}}};nodes.push(node);return node;
  }});
  return {player,messages,nodes,sources};
}

test('live worklet batches birth signals using one node and clears on stop',async()=>{
  const {player,messages,nodes,sources}=workletFixture();player.setVoiceLimit(50);await player.setEnabled(true);
  assert.equal(nodes.length,1);assert.equal(messages[0].type,'bank');assert.equal(messages[0].buffers.length,24);
  const d={r:.8,pathSeed:1,source:{birthVersion:1}};
  assert.equal(player.impact(d,1532),true);assert.equal(player.impact(d,1532),false);
  d.source.birthVersion++;assert.equal(player.impact(d,1532),true);
  player.impact({r:4,pathSeed:2},1532);player.impact({r:14,pathSeed:3},1532);
  assert.equal(messages.filter(m=>m.type==='births').length,0);player.flush();
  assert.deepEqual(messages.at(-1).ids.map(id=>Math.floor(id/8)),[0,0,1,2]);assert.equal(sources.length,0);
  player.flush();assert.equal(messages.filter(m=>m.type==='births').length,1);
  player.setVoiceLimit(128);assert.deepEqual(messages.at(-1),{type:'limit',value:128});
  player.impact({r:8},1532);await player.setEnabled(false);player.flush();assert.equal(messages.at(-1).type,'clear');
  await player.setEnabled(true);assert.equal(nodes.length,1);player.dispose();assert.ok(nodes[0].disconnected&&nodes[0].port.closed);
});

test('worklet load failure retains the working node backend',async()=>{
  const {player,sources}=workletFixture(true);await player.setEnabled(true);
  assert.equal(player.enabled,true);assert.equal(player.worklet,null);
  assert.equal(player.impact({r:8},600),true);assert.equal(sources.length,1);player.dispose();
});

test('automatic gain preference reaches a new worklet and updates without restarting playback',async()=>{
  const {player,messages,nodes}=workletFixture();player.setAutoGain(false);await player.setEnabled(true);
  assert.deepEqual(messages.find(m=>m.type==='autoGain'),{type:'autoGain',value:false});
  player.setAutoGain(true);assert.deepEqual(messages.at(-1),{type:'autoGain',value:true});
  player.setAutoGain(false);await player.setEnabled(false);await player.setEnabled(true);
  assert.equal(player.autoGain,false);assert.equal(nodes.length,1);player.dispose();
});

test('cached birth thresholds match logarithmic classification at several screen sizes',()=>{
  const p=new RainBirthSound(()=>{});
  for(const h of [300,600,1532,2160])for(let r=.01;r<20;r+=.017){
    assert.equal(voices[p.classify(r,h)],birthSound(r,h).voice);
  }
});

test('sparse wet-pixel updates match the full mask through overlap, expiry, resize and clear',()=>{
  const m=new TrailMemory(80,60);let data=new Uint8ClampedArray(80*60*4);
  const compare=()=>{
    m.render(data);const expected=new Uint8ClampedArray(data.length);
    for(let i=0;i<m.times.length;i++)expected.set([255,255,255,Math.round(255*m.coverage[i]*trailOpacity(m.time-m.times[i]))],i*4);
    assert.deepEqual(data,expected);
  };
  for(let i=0;i<100;i++){m.stamp((i*7)%80,(i*13)%60,(i*7+3)%80,(i*13+6)%60,1+i%3);m.advance(.037);compare();}
  assert.equal(m.render(data),false);m.advance(3);compare();assert.equal(m.activeCount,0);
  m.stamp(20,20,25,30,2);m.advance(2);compare();m.resize(40,30);data=new Uint8ClampedArray(40*30*4);compare();
  m.clear();compare();assert.equal(m.activeCount,0);
});

test('quantized visibility cache retains original static fade and dead-drop exclusion',()=>{
  const f=new HeartfeltField({canvasFactory:()=>({getContext:()=>({})})});
  for(const time of [12,12.025,12.3,13.001,17.9])for(const amount of [0,.4,.65,1]){
    f.rain={staticTime:time,amount};
    for(let i=0;i<256;i++){
      const nz=i/255,source={nz,alive:true};
      const expected=saw(.025,(time+nz)%1)*(nz*10%1)*smooth(-.5,1,amount)*2>.32;
      assert.equal(f.visible({source}),expected);source.alive=false;assert.equal(f.visible({source}),false);
    }
  }
});

test('rendering fits the pixel budget while retaining aspect and CSS size',()=>{
  for(const [w,h,dpr] of [[2934,1532,1.25],[3840,2160,2],[600,900,2],[0,0,1]]){
    const size=renderSize(w,h,dpr);assert.ok(size.width*size.height<=2500000);assert.ok(size.width>=1&&size.height>=1);
    if(w&&h)assert.ok(Math.abs(size.width/size.height-w/h)<.003);
  }
  assert.deepEqual(renderSize(800,600),{width:800,height:600});
});

test('GPU upload cache skips unchanged data, updates changed data and reallocates resized textures',()=>{
  const calls=[],r=Object.create(RainRenderer.prototype);
  r.gl={activeTexture(){},bindTexture(){},texImage2D(){calls.push('allocate');},texSubImage2D(){calls.push('update');}};
  r.textures=[{texture:{},width:0,height:0}];const canvas={width:100,height:80};
  r.upload(0,canvas,1);r.upload(0,canvas,1);assert.deepEqual(calls,['allocate']);
  r.upload(0,canvas,2);r.upload(0,{width:100,height:80},2);assert.deepEqual(calls,['allocate','update','update']);
  canvas.width=200;r.upload(0,canvas,2);assert.equal(calls.at(-1),'allocate');
  r.upload(0,canvas);r.upload(0,canvas);assert.deepEqual(calls.slice(-2),['update','update']);
});
