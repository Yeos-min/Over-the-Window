import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blurValue} from '../src/background-blur.js';
import {Condensation} from '../src/condensation.js';
test('background blur clamps values without changing condensation state',()=>{
  const fog=new Condensation();fog.update(30);const before={...fog};
  for(const [input,expected] of [[0,0],['8.5',8.5],[24,24],[100,24],[-1,0],[NaN,0],[Infinity,0]])assert.equal(blurValue(input),expected);
  assert.deepEqual({...fog},before);
});
