import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RainPhysics,makeDrop,MAX_DROP_RADIUS} from '../src/physics.js';
test('ordinary absorption caps radius at 20 while retaining steering',()=>{
  const p=new RainPhysics(800,900,()=>1),a=makeDrop(200,200,20,true),b=makeDrop(208,202,9);
  p.drops=[a,b];p.step(1/60,0);
  assert.equal(a.r,20);assert.equal(a.mass,400);assert.ok(b.dead);assert.ok(a.mergePull>0);
});
test('tiny bead absorption stays capped and continues to change direction',()=>{
  const p=new RainPhysics(800,900,()=>.5),a=makeDrop(200,200,20,true);p.drops=[a];
  p.step(1/60,0,()=>{},()=>Array.from({length:20},()=>({x:190,y:202,r:4})));
  assert.equal(a.r,MAX_DROP_RADIUS);assert.equal(a.mass,400);assert.equal(p.merges,20);assert.ok(a.mergePull<0);
});
test('births and repeated loud-music merges remain within the size limit',()=>{
  let seed=21;const rng=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  const p=new RainPhysics(800,900,rng);p.music={level:1,treble:1};
  for(let i=0;i<600;i++){
    p.step(1/60,.2);
    assert.ok(p.drops.every(d=>d.r<=20&&d.mass<=400));
  }
});
