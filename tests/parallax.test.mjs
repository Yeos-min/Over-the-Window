import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Parallax,PARALLAX_STRENGTH} from '../src/parallax.js';
test('parallax eases toward pointer and returns to center on leave',()=>{
  const p=new Parallax();p.move(800,0,800,600);p.update(1/60);
  assert.ok(p.x>0&&p.x<1);assert.ok(p.y<0&&p.y>-1);
  p.leave();for(let i=0;i<180;i++)p.update(1/60);
  assert.ok(Math.abs(p.x)<1e-7&&Math.abs(p.y)<1e-7);
});
test('overscan protects every corner and marker projection inverts glass sampling',()=>{
  const p=new Parallax();
  for(const [w,h] of [[1481,1110],[390,844]])for(const sign of [-1,1]){
    p.x=sign;p.y=-sign;
    for(const uv of [0,1])for(const offset of [-1,1]){
      const glass=(uv-.5)/p.glassScale+.5-offset*.006*p.strength;
      const scene=(uv-.5)/p.sceneScale+.5-offset*.028*p.strength;
      assert.ok(glass>=0&&glass<=1);assert.ok(scene>=0&&scene<=1);
    }
    const point=p.project(100,200,w,h);
    assert.ok(Math.abs(((point.x/w-.5)/p.glassScale+.5-p.x*.006*p.strength)*w-100)<1e-9);
    assert.ok(Math.abs(((point.y/h-.5)/p.glassScale+.5-p.y*.006*p.strength)*h-200)<1e-9);
  }
});
test('reduced motion and reset give neutral view',()=>{
  const p=new Parallax(false);p.move(800,600,800,600);p.update(1);
  assert.deepEqual(p.project(100,200,800,600),{x:100,y:200});
  assert.equal(p.sceneScale,1);assert.equal(p.x,0);
  assert.equal(p.strength,0);
  const active=new Parallax();active.move(800,600,800,600);active.update(1);active.reset();assert.equal(active.x,0);assert.equal(active.targetX,0);
});
test('pointer translation and depth margins use triple strength with the same easing',()=>{
  const p=new Parallax();assert.equal(PARALLAX_STRENGTH,3);
  assert.equal(p.strength,3);assert.equal(p.glassScale,1.075);assert.equal(p.sceneScale,1.27);
  p.move(800,600,800,600);p.update(1/60);
  assert.ok(Math.abs(p.x-(1-Math.exp(-6/60)))<1e-12);
  assert.ok(Math.abs((p.x*.028*p.strength)/(p.x*.028)-3)<1e-12);
});
