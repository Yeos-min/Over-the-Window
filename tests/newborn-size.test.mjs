import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newbornRadius,RainPhysics,makeDrop,merge} from '../src/physics.js';
test('newborn radius is bounded at 4 to 10px and favors smaller beads',()=>{
  assert.equal(newbornRadius(()=>0),4);assert.equal(newbornRadius(()=>1),10);
  assert.equal(newbornRadius(()=>.5),5.5);
});
test('initial rain and resets start small with some natural runoff',()=>{
  const p=new RainPhysics(800,900,()=>.8);
  for(let i=0;i<2;i++){
    assert.ok(p.drops.every(d=>d.r>=4&&d.r<=10));
    assert.ok(p.drops.some(d=>d.flowing));p.reset();
  }
});
test('new rain stays small even at maximum music and grows through absorption',()=>{
  const p=new RainPhysics(800,900,()=>.9);p.drops=[];p.music={level:1,treble:1};
  p.step(1/60,0);p.step(1/60,0);
  assert.ok(p.drops.length>0);assert.ok(p.drops.every(d=>d.r<=10));
  const d=p.drops[0],r=d.r;merge(d,makeDrop(d.x+2,d.y,4));assert.ok(d.r>r);
});
