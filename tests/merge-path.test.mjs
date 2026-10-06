import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeDrop,merge,integrate,RainPhysics} from '../src/physics.js';
function absorb(side,r=9){
  const a=makeDrop(100,100,24,true),b=makeDrop(100+side*12,104,r);
  a.vy=60;merge(a,b);const x=a.x,y=a.y;
  for(let i=0;i<60;i++)integrate(a,1/60,0,true,{},()=>1);
  return {a,dx:a.x-x,dy:a.y-y};
}
test('absorbed bead side bends runoff, centered beads do not cause random sway',()=>{
  const left=absorb(-1),right=absorb(1),center=absorb(0);
  assert.ok(left.dx<-2&&right.dx>2);assert.ok(right.dx<15);
  assert.ok(Math.abs(left.dx+right.dx)<1e-8);assert.equal(center.dx,0);
  assert.ok(left.dy>0&&right.dy>0);
});
test('larger absorbed beads exert more pull and the pull fades',()=>{
  assert.ok(absorb(1,12).dx>absorb(1,4).dx);
  const {a}=absorb(1);for(let i=0;i<420;i++)integrate(a,1/60,0,true,{},()=>1);
  assert.ok(Math.abs(a.mergePull)<.001);assert.ok(Math.abs(a.vx)<.01);
});
test('repeated merges remain bounded and stationary merge has no lateral kick',()=>{
  const a=makeDrop(100,100,24,true);
  for(let i=0;i<100;i++){merge(a,makeDrop(a.x+10,a.y,8));assert.ok(Math.abs(a.mergePull)<=120);}
  const still=makeDrop(100,100,24);merge(still,makeDrop(110,100,8));assert.equal(still.mergePull,0);
});
test('world merge connects cleared trail across the change of center',()=>{
  const p=new RainPhysics(800,900,()=>1),a=makeDrop(200,200,24,true),b=makeDrop(211,202,8);
  p.drops=[a,b];const segments=[];p.step(1/60,0,(...s)=>segments.push(s));
  assert.equal(p.merges,1);assert.ok(segments.some(s=>Math.abs(s[2]-a.x)<1e-8&&Math.abs(s[3]-a.y)<1e-8));
});
