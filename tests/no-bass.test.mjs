import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RainPhysics} from '../src/physics.js';
test('bass has no independent effect on births or rain trajectories',()=>{
  const run=bass=>{
    let seed=72;const rng=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
    const p=new RainPhysics(800,900,rng);p.music={level:.5,treble:.4,bass};
    for(let i=0;i<120;i++)p.step(1/60,.2);
    return p.drops.map(d=>({x:d.x,y:d.y,r:d.r,vx:d.vx,vy:d.vy}));
  };
  assert.deepEqual(run(0),run(1));
});
