import test from 'node:test';
import assert from 'node:assert/strict';
import {RainPhysics,makeDrop} from '../src/physics.js';

const seeded=()=>{
  let seed=23;
  return ()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
};
const setup=(r=20,rng=seeded())=>{
  const p=new RainPhysics(4000,4000,rng),d=makeDrop(1000,1000,r,true);
  d.contact={phase:'slide',time:100};d.slip=1;d.vy=60;p.drops=[d];
  return {p,d};
};

test('large parents leave about twice the old trail density, small parents rarely shed',()=>{
  const measure=r=>{
    const {p,d}=setup(r);let count=0,distance=0;
    for(let i=0;i<1200;i++){
      // Isolate size-dependent shedding per distance: replace lost mass only
      // inside this test and remove children before they can merge again.
      p.drops=[d];p.spawnClock=0;d.r=r;d.mass=r*r;d.vy=60;d.slip=1;
      const y=d.y;p.step(1/120,0);distance+=d.y-y;
      count+=p.drops.filter(t=>t.parent===d).length;
    }
    return {count,spacing:distance/count};
  };
  const tiny=measure(8),newborn=measure(10),small=measure(12),medium=measure(16),large=measure(20);
  assert.equal(tiny.count,0);assert.equal(newborn.count,0);
  assert.ok(medium.count>small.count*2);assert.ok(large.count>medium.count);
  // Previous per-frame random threshold produced roughly 12px spacing.
  assert.ok(large.spacing>5&&large.spacing<7);
});

test('a random gap persists across frames and is resampled only after shedding',()=>{
  const {p,d}=setup(20,()=>.25);p.step(1/120,0);const first=d.trailGap;
  assert.equal(first,10);p.rng=()=>.9;p.step(1/120,0);
  assert.equal(d.trailGap,first);assert.equal(p.drops.length,1);
  d.trailDistance=7;p.step(1/120,0);
  assert.ok(p.drops.some(t=>t.parent===d));assert.equal(d.trailGap,15.2);
});

test('trail beads remain tiny, adhered and behind either lateral flow direction',()=>{
  for(const direction of [-1,1]){
    const {p,d}=setup(20,()=>.5);d.vx=direction*120;d.vy=20;d.trailDistance=20;
    const x=d.x,y=d.y,mass=d.mass;p.step(1/60,0);
    const children=p.drops.filter(t=>t.parent===d),dx=d.x-x,dy=d.y-y;
    assert.equal(children.length,2);
    for(const t of children){
      assert.ok((t.x-d.x)*dx+(t.y-d.y)*dy<0);
      assert.ok(t.r>=1.5&&t.r<=3.2);assert.ok(!t.flowing);
      assert.equal(t.contact.phase,'rest');assert.ok(t.contact.time>=2&&t.contact.time<=4);
      assert.equal(t.rotation,d.rotation);
    }
    assert.ok(Math.abs(d.mass+children.reduce((m,t)=>m+t.mass,0)-mass)<1e-8);
  }
});

test('adhesion, pause and the bounded population cannot produce a delayed trail burst',()=>{
  const {p,d}=setup(20,()=>.5);d.trailDistance=1000;
  d.contact={phase:'rest',time:10};d.flowing=false;d.vx=0;d.vy=0;
  p.step(1/60,0);assert.equal(p.drops.length,1);
  d.contact={phase:'slide',time:100};d.flowing=true;d.vy=60;
  p.active=false;p.step(1/60,0);assert.equal(p.drops.length,1);
  p.active=true;
  p.drops=[d,...Array.from({length:349},(_,i)=>makeDrop(100+(i%25)*120,2000+Math.floor(i/25)*120,4))];
  p.step(1/60,0);assert.ok(!p.drops.some(t=>t.parent===d));
  assert.ok(d.trailDistance<=d.trailGap/2);
  p.drops=[d];p.step(1/60,0);
  assert.equal(p.drops.filter(t=>t.parent===d).length,1);
});
