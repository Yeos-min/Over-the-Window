import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Condensation} from '../src/condensation.js';
test('starts clear and builds gentle bounded fog over time',()=>{
  const fog=new Condensation();assert.equal(fog.level,0);assert.equal(fog.canClear,false);assert.equal(fog.clear(),false);
  fog.update(4);assert.ok(fog.canClear);assert.ok(fog.level<.05);
  fog.update(66);assert.equal(fog.level,.65);fog.update(100);assert.equal(fog.level,.65);
});
test('defog fades smoothly for five seconds then allows later reaccumulation',()=>{
  const fog=new Condensation();fog.update(70);assert.equal(fog.clear(),true);
  assert.equal(fog.canClear,false);assert.equal(fog.clear(),false);
  let previous=fog.level;
  for(let i=0;i<50;i++){fog.update(.1);assert.ok(fog.level<=previous);previous=fog.level;}
  fog.update(.01);assert.equal(fog.level,0);assert.equal(fog.clearing,false);
  fog.update(8);assert.equal(fog.level,0);fog.update(4);assert.ok(fog.canClear);
});
test('reset clears a running fade and invalid time cannot poison state',()=>{
  const fog=new Condensation();fog.update(30);fog.clear();fog.reset();
  for(const dt of [NaN,Infinity,-1,0])fog.update(dt);
  assert.equal(fog.level,0);assert.equal(fog.clearing,false);assert.equal(fog.cooldown,0);
});
