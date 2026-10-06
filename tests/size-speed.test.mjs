import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeDrop,integrate,sizeSpeedFactor} from '../src/physics.js';
test('size adds speed independently at every treble level without changing ordinary drops',()=>{
  assert.equal(sizeSpeedFactor(4),1);assert.equal(sizeSpeedFactor(10),1);
  assert.equal(sizeSpeedFactor(15),1.15);assert.equal(sizeSpeedFactor(20),1.3);
  for(const treble of [0,.5,1]){
    const small=makeDrop(0,0,10,true),large=makeDrop(0,0,20,true);
    for(let i=0;i<300;i++){
      integrate(small,1/60,0,true,{treble},()=>1);
      integrate(large,1/60,0,true,{treble},()=>1);
    }
    assert.ok(Math.abs(large.vy/small.vy-1.3)<1e-9);
  }
});
