import {test} from 'node:test';
import assert from 'node:assert/strict';
import {musicResponse,makeDrop,integrate,RainPhysics,sizeSpeedFactor} from '../src/physics.js';
test('quiet births are 2/5 while peak music births and acceleration stay unchanged',()=>{
  assert.ok(Math.abs(musicResponse().spawnRate-.7)<1e-10);assert.equal(musicResponse().acceleration,144);
  assert.ok(Math.abs(musicResponse({level:1}).spawnRate-38.1*1.25)<1e-10);
  assert.equal(musicResponse({treble:1}).acceleration,744*1.5);
  let previous=0;
  for(let i=0;i<=10;i++){const rate=musicResponse({level:i/10}).spawnRate;assert.ok(rate>previous);previous=rate;}
});
test('peak steady falling speeds reach 1.5x previous values for small and large runoff',()=>{
  const dt=1/60;
  for(const r of [10,18,24,40]){
    const d=makeDrop(100,100,r,true);let oldVelocity=0;
    const strength=.75;
    for(let i=0;i<600;i++){
      oldVelocity=Math.min(360,(oldVelocity+744*strength*dt)*Math.exp(-1.8*dt));
      integrate(d,dt,0,true,{treble:1},()=>1);
    }
    assert.ok(Math.abs(d.vy-oldVelocity*1.5*sizeSpeedFactor(r))<1e-7);assert.ok(d.vy<=540*sizeSpeedFactor(d.r));
  }
});
test('loud music produces increased births and high input stays finite and bounded',()=>{
  let seed=99;const rng=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  const p=new RainPhysics(1600,1200,rng);p.drops=[];p.music={level:1};
  for(let i=0;i<60;i++)p.step(1/60,0);
  assert.ok(p.drops.filter(d=>!d.parent).length>=36);
  p.music={level:1,treble:1};
  for(let i=0;i<600;i++)p.step(1/60,.5);
  assert.ok(p.drops.length<=420);
  assert.ok(p.drops.every(d=>Number.isFinite(d.x)&&Number.isFinite(d.y)&&d.vy<=540));
});
