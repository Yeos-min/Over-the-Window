import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BeadField} from '../src/bead-field.js';
import {RainPhysics,makeDrop,merge} from '../src/physics.js';
test('visible tiny beads are consumed once and distant beads remain',()=>{
  const field=new BeadField();field.add({x:32,y:32,r:3});field.add({x:120,y:120,r:3});
  assert.equal(field.take(30,32,10).length,1);assert.equal(field.take(30,32,10).length,0);assert.equal(field.count,1);
});
test('tiny bead absorption adds real mass and pulls down toward its side',()=>{
  const field=new BeadField();for(let y=198;y<=206;y+=4)field.add({x:210,y,r:4});
  const p=new RainPhysics(800,900,()=>.5),d=makeDrop(200,200,10,true);p.drops=[d];
  p.step(1/60,0,()=>{},(...args)=>field.take(...args));
  assert.equal(d.mass,148);assert.ok(d.r>10);assert.ok(d.mergePull>0);assert.equal(p.merges,3);
  const x=d.x,y=d.y;for(let i=0;i<30;i++)p.step(1/60,0);
  assert.ok(d.x>x);assert.ok(d.y>y);
});
test('absorption variation changes bend magnitude, never side',()=>{
  const strengths=[.65,1,1.75].map(v=>{const d=makeDrop(100,100,24,true);merge(d,makeDrop(111,103,6),v);return d.mergePull;});
  assert.ok(strengths[0]>0&&strengths[0]<strengths[1]&&strengths[1]<strengths[2]);
});
test('stationary drops do not sweep up decorative beads and field has a cap',()=>{
  const p=new RainPhysics(800,900,()=>1);p.drops=[makeDrop(200,200,20)];let calls=0;
  p.step(1/60,0,()=>{},()=>{calls++;return [];});assert.equal(calls,0);
  const f=new BeadField();for(let i=0;i<12010;i++)f.add({x:1,y:1,r:2});assert.equal(f.count,12000);
});

test('a denser surface may opt into a larger but still bounded field',()=>{
  const f=new BeadField(22200);
  for(let i=0;i<22210;i++)f.add({x:1,y:1,r:1});
  assert.equal(f.count,22200);assert.equal(f.add({x:1,y:1,r:1}),false);
  assert.equal(new BeadField(1000000).capacity,24000);
  assert.equal(new BeadField(-1).capacity,0);
  assert.equal(new BeadField(Infinity).capacity,12000);
});
