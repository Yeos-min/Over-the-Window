import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HorizontalMotion} from '../src/mouse-input.js';
import {RainPhysics} from '../src/physics.js';
test('silence and no input still produce downward motion, also after reset',()=>{
  const p=new RainPhysics(800,900,()=>.8);
  for(let run=0;run<2;run++){
    p.reset();const hero=p.drops.find(d=>d.flowing);p.drops=[hero];const y=hero.y;
    for(let i=0;i<120;i++)p.step(1/60,0);
    assert.ok(p.drops.includes(hero));assert.ok(hero.y>y+20);
  }
});
test('mouse direction needs no press, eases and fades when still',()=>{
  const m=new HorizontalMotion();m.move(100,0);m.move(180,100);
  assert.ok(m.update(1/60)>0);assert.ok(m.value<1);
  m.move(80,200);for(let i=0;i<6;i++)m.update(1/60);
  assert.ok(m.value<0);
  for(let i=0;i<120;i++)m.update(1/60);
  assert.ok(Math.abs(m.value)<.001);
  m.clear();m.move(900,3000);assert.equal(m.update(1/60),0);
});
test('unchanged mouse X does not steer; steering never stops downward flow',()=>{
  const m=new HorizontalMotion();m.move(200,0);m.move(200,100);assert.equal(m.update(.016),0);
  for(const direction of [-1,0,1]){
    const p=new RainPhysics(800,900,()=>.8);const hero=p.drops.find(d=>d.flowing);p.drops=[hero];const y=hero.y;
    for(let i=0;i<60;i++)p.step(1/60,direction);
    assert.ok(hero.y>y+10);
  }
});
