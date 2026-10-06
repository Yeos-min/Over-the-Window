import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RainPhysics,makeDrop} from '../src/physics.js';
test('UI and renderer no longer reference water accumulation or draining',()=>{
  for(const file of ['../index.html','../src/index.js','../src/rain-renderer.js','../src/shaders/water.frag']){
    const source=readFileSync(new URL(file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/WaterPool|pool\.js|u_pool|u_surface|water-level|id="drain"|\$\('#drain'\)/);
  }
});
test('rain exits the bottom without a reservoir or replacement hero',()=>{
  const p=new RainPhysics(800,600,()=>.5),drop=makeDrop(300,599,10,true);
  p.drops=[drop];for(let i=0;i<120;i++)p.step(1/60,0);
  assert.ok(drop.dead);assert.ok(!p.drops.includes(drop));
});
