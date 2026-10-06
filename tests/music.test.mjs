import {test} from 'node:test';
import assert from 'node:assert/strict';
import {measureAudio,MusicInput} from '../src/music.js';
import {makeDrop,integrate,RainPhysics,musicResponse} from '../src/physics.js';
test('silence and separated frequency bands give distinct controls',()=>{
  const wave=new Float32Array(2048),spectrum=new Uint8Array(1024);
  assert.deepEqual(measureAudio(wave,spectrum,48000),{level:0,bass:0,treble:0});
  wave.fill(.1);spectrum.fill(255,2,10);
  const bass=measureAudio(wave,spectrum,48000);assert.ok(bass.level>.6);assert.ok(bass.bass>.7);assert.equal(bass.treble,0);
  spectrum.fill(0);spectrum.fill(255,90,330);
  const treble=measureAudio(wave,spectrum,48000);assert.equal(treble.bass,0);assert.ok(treble.treble>.8);
});
test('adhesion actually stops a drop, high frequencies release it',()=>{
  const d=makeDrop(100,100,20);d.vy=10;d.rest=5;
  for(let i=0;i<60;i++)integrate(d,1/60,0,true,{},()=>1);
  assert.equal(d.vy,0);const y=d.y;d.rest=0;
  integrate(d,1/60,0,true,{treble:1},()=>0);
  assert.ok(d.y>y);assert.ok(d.slip>0);
});
test('quiet baseline creates fewer and smaller drops',()=>{
  const p=new RainPhysics(800,900,()=>.8);p.ambient=true;
  assert.ok(p.drops.every(d=>d.r<20));
  p.drops=[];
  const initial=p.drops.length;for(let i=0;i<60;i++)p.step(1/60,0);
  assert.ok(p.drops.filter(d=>!d.parent).length<=initial+2);
  assert.ok(p.drops.every(d=>d.r<20));
});
test('disconnect stops every shared track and clears music state',()=>{
  let stops=0;const input=new MusicInput(()=>{});
  input.stream={getTracks:()=>[{stop:()=>stops++},{stop:()=>stops++}]};input.connected=true;input.features.level=1;
  input.stop();assert.equal(stops,2);assert.equal(input.connected,false);assert.equal(input.features.level,0);
});
test('high frequencies produce more surface sliding than silence',()=>{
  const run=music=>{
    let seed=71;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    let moving=0;const drops=Array.from({length:40},()=>makeDrop(100,100,18));
    for(let frame=0;frame<600;frame++)for(const d of drops){integrate(d,1/60,0,true,music,rng);if(d.vy>1)moving++;}
    return moving;
  };
  assert.ok(run({treble:.7})>run({}));
});

test('ambient runoff never stops after treble disappears and returns to no-music speed',()=>{
  for(const music of [{},{treble:0,bass:0},{treble:0,bass:1}]){
    const d=makeDrop(100,100,18),baseline=makeDrop(100,100,18);
    d.slip=.1;baseline.slip=.1;
    for(let i=0;i<120;i++)integrate(d,1/60,0,true,{treble:1},()=>1);
    for(let i=0;i<600;i++){
      const y=d.y;integrate(d,1/60,0,true,music,()=>1);
      integrate(baseline,1/60,0,true,{},()=>1);
      assert.ok(d.y>y);assert.ok(d.vy>0);assert.equal(d.rest,0);
    }
    assert.ok(Math.abs(d.vy-baseline.vy)<.01);
  }
});
test('volume controls births, bass has no effect, treble controls sliding',()=>{
  const quiet=musicResponse(),bass=musicResponse({bass:1}),high=musicResponse({treble:1}),loud=musicResponse({level:1});
  assert.ok(loud.spawnRate>quiet.spawnRate*10);assert.equal(bass.spawnRate,quiet.spawnRate);assert.equal(bass.acceleration,quiet.acceleration);
  assert.deepEqual(bass,quiet);
  assert.equal(loud.acceleration,quiet.acceleration);
  assert.equal(bass.releaseRate,quiet.releaseRate);assert.equal(high.spawnRate,quiet.spawnRate);
  assert.equal(quiet.acceleration,144);assert.equal(high.acceleration-quiet.acceleration,972);
  assert.deepEqual(musicResponse({beat:1}),quiet);
  assert.ok(musicResponse({level:.5}).spawnRate>quiet.spawnRate);assert.ok(musicResponse({level:.5}).spawnRate<loud.spawnRate);
});
test('high band makes the same sliding drop travel farther, bass does not',()=>{
  const run=music=>{const d=makeDrop(100,100,22);d.slip=1;for(let i=0;i<30;i++)integrate(d,1/60,0,true,music,()=>1);return d.y-100;};
  assert.ok(run({treble:1})>run({})*3);assert.equal(run({bass:1}),run({}));
});

test('treble fading returns to a steady baseline, even after the flowing drop shrinks',()=>{
  for(const radius of [10,24]){
    const baseline=makeDrop(100,100,radius,true),boosted=makeDrop(100,100,radius,true);
    for(let i=0;i<180;i++){
      integrate(baseline,1/60,0,true,{},()=>1);
      integrate(boosted,1/60,0,true,{treble:1},()=>1);
    }
    assert.ok(baseline.vy>45);assert.ok(boosted.vy>baseline.vy*2);
    for(let i=0;i<360;i++){
      integrate(boosted,1/60,0,true,{},()=>1);
      assert.ok(boosted.vy>=baseline.vy);
    }
    assert.ok(Math.abs(boosted.vy-baseline.vy)<1);
  }
});

test('strong treble exceeds the previous speed cap while retaining a safe limit',()=>{
  const d=makeDrop(100,100,24,true);
  for(let i=0;i<180;i++)integrate(d,1/60,0,true,{treble:1},()=>1);
  assert.ok(d.vy>550);assert.ok(d.vy<=702);
  for(let i=0;i<360;i++)integrate(d,1/60,0,true,{},()=>1);
  assert.ok(d.vy>75&&d.vy<80);
});
test('volume produces visible births without increasing newborn sizes',()=>{
  // Isolate births from the controlled drop's trail shedding and absorption.
  const run=music=>{let seed=83;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);const p=new RainPhysics(1600,1000,rng);p.drops=[];p.active=false;p.ambient=true;p.music=music;for(let i=0;i<60;i++)p.step(1/60,0);return p.drops.filter(d=>!d.parent);};
  const bass=run({level:1}),quiet=run({}),high=run({treble:1});
  assert.ok(bass.length>=20);assert.ok(quiet.length<=2);assert.ok(high.length<=2);
  assert.ok(bass.filter(d=>d.r<20).length/bass.length>.8);
});
test('sharing without audio stops the whole stream and explains retry',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');let stopped=0,message='';
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getDisplayMedia:async options=>{assert.equal(options.video,true);assert.ok(options.audio);return {getAudioTracks:()=>[],getTracks:()=>[{stop:()=>stopped++}]};}}}});
  try{const input=new MusicInput((connected,text)=>{message=text;});await input.toggle();assert.equal(stopped,1);assert.equal(input.connected,false);assert.match(message,/오디오가 포함되지/);}
  finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
