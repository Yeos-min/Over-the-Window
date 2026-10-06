import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDrop,integrate,RainPhysics,lightDropFactor,windMobility,WIND_FORCE} from '../src/physics.js';
import {rotateNormals} from '../src/drop-orientation.js';
const run=(wind,r=10,treble=0)=>{
  const d=makeDrop(100,100,r,true);
  for(let i=0;i<120;i++)integrate(d,1/60,0,true,{treble},()=>1,wind);
  return d;
};
test('wind bends rain symmetrically and progressively without changing gravity',()=>{
  const a=run(-1),b=run(1),calm=run(0),half=run(.5);
  assert.ok(b.x>half.x&&half.x>calm.x);assert.ok(Math.abs(a.x+b.x-200)<1e-8);
  assert.equal(b.y,calm.y);assert.equal(a.y,calm.y);
  assert.ok(b.rotation<0&&a.rotation>0);assert.ok(Math.abs(b.rotation)<=Math.PI/2);
  assert.equal(calm.rotation,0);
  assert.ok(run(1,10,1).x>100);
});
test('wind cannot detach adhered beads; larger drops lean less and pause freezes rotation',()=>{
  const d=makeDrop(100,100,10);
  for(let i=0;i<60;i++)integrate(d,1/60,0,true,{},()=>1,1);
  assert.equal(d.x,100);assert.equal(d.rotation,0);
  assert.ok(Math.abs(run(1,20).rotation)<Math.abs(run(1,8).rotation));
  const moving=run(1),before={...moving};integrate(moving,1,0,false,{},()=>1,-1);assert.deepEqual(moving,before);
});
test('wind eases in, reverses and returns to neutral without an abrupt jump',()=>{
  const p=new RainPhysics(1000,1000,()=>1);p.drops=[];p.windTarget=1;p.step(1/60,0);
  assert.ok(p.wind>0&&p.wind<.03);
  for(let i=0;i<120;i++)p.step(1/60,0);
  p.windTarget=-1;p.step(1/60,0);assert.ok(p.wind>0);
  for(let i=0;i<180;i++)p.step(1/60,0);assert.ok(p.wind<-.9);
  p.windTarget=0;for(let i=0;i<360;i++)p.step(1/60,0);assert.ok(Math.abs(p.wind)<.001);
});
test('normal rotation follows the silhouette and preserves thickness and alpha',()=>{
  const source=new Uint8ClampedArray([128,200,50,160]);
  const result=rotateNormals(source,Math.PI/2);
  assert.equal(result[0],200);assert.equal(result[1],127);assert.equal(result[2],50);assert.equal(result[3],160);
  assert.equal(source[0],128);
});
test('large drops sag downward at every music level instead of following light drops diagonally',()=>{
  for(const treble of [0,.5,1]){
    const small=run(1,8,treble),large=run(1,20,treble);
    assert.ok(large.x>100);
    assert.ok(large.x-100<(small.x-100)*.3);
    assert.ok(large.y>small.y);
    // Doubled maximum wind still leaves heavy drops moving predominantly downward.
    assert.ok(large.vx/large.vy<.6);
    assert.ok(Math.abs(large.rotation)<Math.abs(small.rotation)*.8);
  }
});
test('growth bends the existing trajectory down gradually without resetting sideways velocity',()=>{
  const d=run(1,8),oldVx=d.vx,oldSlope=d.vx/d.vy;
  d.r=20;d.mass=400;
  integrate(d,1/60,0,true,{},()=>1,1);
  assert.ok(d.vx>oldVx*.9);
  for(let i=0;i<240;i++)integrate(d,1/60,0,true,{},()=>1,1);
  assert.ok(d.vx>0&&d.vx/d.vy<oldSlope*.3);
});
test('heavy drops settle back to vertical after wind stops',()=>{
  const d=run(1,20),beforeY=d.y;
  for(let i=0;i<600;i++)integrate(d,1/60,0,true,{},()=>1,0);
  assert.ok(Math.abs(d.vx)<.01);assert.ok(Math.abs(d.rotation)<.001);assert.ok(d.y>beforeY);
});
test('tiny flowing beads travel mostly sideways in strong wind but continue falling',()=>{
  for(const direction of [-1,1]){
    const d=run(direction,4),calm=run(0,4),gentle=run(direction*.2,4);
    assert.ok((d.x-100)*direction>3*(d.y-100));
    assert.ok(d.y>100);assert.equal(d.y,calm.y);
    assert.ok(Math.abs(gentle.x-100)<gentle.y-100);
    assert.ok(Math.abs(d.rotation)>1.3&&Math.abs(d.rotation)<=Math.PI/2);
  }
});
test('sideways carry fades continuously as droplets grow and never releases adhered beads',()=>{
  assert.equal(lightDropFactor(4),1);assert.equal(lightDropFactor(8),0);
  assert.equal(lightDropFactor(20),0);
  const xs=[4,5,6,7,8].map(r=>run(1,r).x);
  for(let i=1;i<xs.length;i++)assert.ok(xs[i]<xs[i-1]);
  const d=makeDrop(100,100,4);
  for(let i=0;i<120;i++)integrate(d,1/60,0,true,{},()=>1,1);
  assert.equal(d.x,100);assert.equal(d.y,100);
});
test('stronger wind increases speed without music for both directions and every drop size',()=>{
  for(const r of [4,8,12,20])for(const direction of [-1,1]){
    const speeds=[0,.25,.5,.75,1].map(strength=>{
      const d=run(direction*strength,r,0);return Math.hypot(d.vx,d.vy);
    });
    for(let i=1;i<speeds.length;i++)assert.ok(speeds[i]>speeds[i-1]);
  }
});
test('treble cannot change wind acceleration or lateral speed',()=>{
  for(const r of [4,8,12,20])for(const wind of [-1,-.5,0,.5,1]){
    const quiet=run(wind,r,0),loud=run(wind,r,1);
    assert.equal(quiet.windAcceleration,loud.windAcceleration);
    assert.equal(quiet.vx,loud.vx);assert.equal(quiet.x,loud.x);
    assert.ok(loud.vy>quiet.vy);
  }
});
test('maximum wind force is doubled while zero wind retains zero lateral acceleration',()=>{
  assert.equal(WIND_FORCE,120*2);
  for(const direction of [-1,1]){
    const d=makeDrop(100,100,10,true);
    for(let i=0;i<600;i++)integrate(d,1/60,0,true,{},()=>1,direction);
    const oldMaximum=120*1.6*windMobility(10);
    assert.ok(Math.abs(d.windAcceleration-direction*oldMaximum*2)<.001);
  }
  assert.equal(run(0,10).vx,0);
});
