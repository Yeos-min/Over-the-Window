import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TrailMemory,trailOpacity} from '../src/trail-memory.js';
test('trail holds for 1.5 seconds then fades for one second',()=>{
  assert.equal(trailOpacity(0),1);assert.equal(trailOpacity(1.5),1);
  assert.equal(trailOpacity(2),.5);assert.equal(trailOpacity(2.5),0);assert.equal(trailOpacity(50),0);
});

test('the whole recovery curve runs exactly twice as fast as the former timeline',()=>{
  const previous=age=>{
    const t=Math.max(0,Math.min(1,(age-3)/2));return 1-t*t*(3-2*t);
  };
  for(let i=0;i<=100;i++)assert.ok(Math.abs(trailOpacity(i/20)-previous(i/10))<1e-12);
});
test('a new pass renews only touched pixels, and old paths fully disappear',()=>{
  const m=new TrailMemory(20,20),data=new Uint8ClampedArray(20*20*4);
  m.stamp(4,4,4,10,2);m.stamp(15,4,15,10,2);m.advance(2);
  m.stamp(4,4,4,10,2);m.advance(.5);m.render(data);
  assert.equal(data[(6*20+4)*4+3],255);assert.equal(data[(6*20+15)*4+3],0);
  m.advance(2);m.render(data);assert.ok(data.every((v,i)=>i%4!==3||v===0));
});
test('resize preserves trail age and clear removes all history',()=>{
  const m=new TrailMemory(10,10);m.stamp(4,4,4,6,2);m.advance(2);m.resize(20,20);
  const data=new Uint8ClampedArray(1600);m.render(data);assert.equal(data[(10*20+8)*4+3],128);
  m.clear();m.render(data);assert.ok(data.every((v,i)=>i%4!==3||v===0));
});

test('recovery does not advance during pause or on invalid time steps',()=>{
  const m=new TrailMemory(10,10),before=new Uint8ClampedArray(400),after=new Uint8ClampedArray(400);
  m.stamp(4,4,4,6,2);m.advance(2);m.render(before);
  for(const dt of [0,-1,NaN,Infinity])m.advance(dt);
  m.render(after);assert.deepEqual(after,before);
  m.advance(.5);m.render(after);assert.ok(after.every((v,i)=>i%4!==3||v===0));
});
