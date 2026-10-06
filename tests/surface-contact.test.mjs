import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDrop,integrate,merge,RainPhysics} from '../src/physics.js';
import {surfaceContact,surfaceShape} from '../src/surface-contact.js';
const tick=(d,rng=()=>0)=>{
  const moving=surfaceContact(d,1/60,0,rng);
  integrate(d,1/60,0,moving,{},rng,0);surfaceShape(d,1/60);return moving;
};
test('surface runoff alternates adhesion and sliding without music',()=>{
  const d=makeDrop(100,100,10,true);let stopped=0,sliding=0,released=0,previous=true;
  for(let i=0;i<600;i++){
    const moving=tick(d);if(moving)sliding++;else if(d.vy===0)stopped++;
    if(moving&&!previous)released++;previous=moving;
  }
  assert.ok(stopped>60);assert.ok(sliding>60);assert.ok(released>=3);assert.ok(d.y>150);
});
test('birth spread contracts and body recovers after moving',()=>{
  const d=makeDrop(100,100,10);const start=d.spreadX;
  for(let i=0;i<30;i++)tick(d,()=>1);
  assert.ok(d.spreadX<start*.1);
  d.contact={phase:'slide',time:2};d.flowing=true;
  for(let i=0;i<60;i++)tick(d);
  assert.ok(d.stretch>.1);
  d.contact={phase:'rest',time:10};d.flowing=false;d.vx=0;d.vy=0;
  for(let i=0;i<120;i++)tick(d);assert.ok(d.stretch<.001);
});
test('merge releases an adhered drop and trails shed bounded mass',()=>{
  const a=makeDrop(100,100,12),b=makeDrop(102,100,4);
  a.contact={phase:'rest',time:10};merge(a,b);assert.equal(a.contact,null);assert.ok(tick(a));
  const p=new RainPhysics(2000,2000,()=>.5),d=makeDrop(100,100,16,true);
  p.drops=[d];d.vy=60;d.trailDistance=30;const mass=d.mass;
  p.step(1/60,0);
  const trails=p.drops.filter(x=>x.parent===d);assert.ok(trails.length>0);
  assert.ok(trails.every(t=>t.y<d.y&&!t.flowing));assert.ok(d.r<16);
  assert.ok(Math.abs(d.mass+trails.reduce((m,t)=>m+t.mass,0)-mass)<1e-8);
});
test('quiet rain continues to spawn during surface rests and pause holds state',()=>{
  const p=new RainPhysics(1000,1000,()=>.5);p.drops=[];
  for(let i=0;i<600;i++)p.step(1/60,0);
  assert.ok(p.drops.length>0);assert.ok(p.drops.some(d=>d.contact?.phase==='rest'));
  p.active=false;p.ambient=false;const before=JSON.stringify(p.drops);p.step(1,0);
  assert.equal(JSON.stringify(p.drops),before);
});
