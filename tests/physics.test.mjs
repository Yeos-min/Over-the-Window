import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RainPhysics,makeDrop,merge,integrate} from '../src/physics.js';
test('merge conserves mass and momentum and releases runoff',()=>{
  const a=makeDrop(20,20,10),b=makeDrop(23,20,10);a.vx=8;b.vx=-2;
  merge(a,b);assert.equal(a.mass,200);assert.equal(a.vx,3);assert.ok(a.flowing);assert.ok(b.dead);
});
test('mouse steers every flowing drop but cannot release stationary drops',()=>{
  for(const direction of [-1,1]){
    const drops=[makeDrop(100,100,18,true),makeDrop(300,100,24,true),makeDrop(500,100,20)];
    const before=drops.map(d=>({x:d.x,y:d.y}));
    for(let i=0;i<60;i++)for(const d of drops)integrate(d,1/60,direction,true,{},()=>1);
    for(let i=0;i<2;i++){assert.ok((drops[i].x-before[i].x)*direction>25);assert.ok(drops[i].y>before[i].y);}
    assert.equal(drops[2].x,before[2].x);assert.equal(drops[2].y,before[2].y);assert.equal(drops[2].flowing,false);
  }
});
test('no selected drop or special respawn; ordinary runoff starts after reset',()=>{
  const p=new RainPhysics(800,900,()=>.8);
  for(let i=0;i<2;i++){
    assert.equal(p.hero,undefined);assert.ok(p.drops.some(d=>d.flowing));
    assert.ok(p.drops.every(d=>!('selected' in d)));p.reset();
  }
  const d=makeDrop(-100,100,18,true);p.drops=[d];p.step(1/60,0);
  assert.equal(p.drops.length,0);assert.ok(d.dead);
});
test('pause holds drops; merge and resize still work',()=>{
  const p=new RainPhysics(800,900,()=>1),a=makeDrop(200,200,25),b=makeDrop(202,200,25);
  p.drops=[a,b];p.active=false;p.step(1/60,1);assert.equal(a.x,200);assert.equal(p.drops.length,2);
  p.active=true;p.step(1/60,0);assert.equal(p.drops.length,1);assert.ok(p.drops[0].flowing);
  const x=p.drops[0].x;p.resize(400,450);assert.equal(p.drops[0].x,x/2);
});
