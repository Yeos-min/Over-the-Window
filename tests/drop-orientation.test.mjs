import test from 'node:test';
import assert from 'node:assert/strict';
import {followFlow,deformDrop,dropGeometry} from '../src/drop-orientation.js';
import {makeDrop,RainPhysics} from '../src/physics.js';
test('long axis follows horizontal and diagonal motion in either direction without a second angle reduction',()=>{
  for(const vx of [-120,120])for(const vy of [0,30,120]){
    const d=makeDrop(200,200,10,true);d.vx=vx;d.vy=vy;
    for(let i=0;i<180;i++)followFlow(d,1/60);
    const target=-Math.atan2(vx,vy);
    assert.ok(Math.abs(d.rotation-target)<.001);
    assert.equal(dropGeometry(d).angle,d.rotation);
    const axis=dropGeometry(d).angle;
    assert.ok(-Math.sin(axis)*vx+Math.cos(axis)*vy>0);
  }
});
test('direction reversal interpolates through the center and resting shape recovers',()=>{
  const d=makeDrop(200,200,10,true);d.vx=200;d.vy=20;
  for(let i=0;i<120;i++)followFlow(d,1/60);
  const previous=d.rotation;d.vx=-200;followFlow(d,1/60);
  assert.ok(d.rotation>previous&&d.rotation<0);
  d.flowing=false;d.vx=0;d.vy=0;d.stretch=0;
  for(let i=0;i<180;i++)followFlow(d,1/60);
  assert.ok(Math.abs(d.rotation)<.001);
  const shape=dropGeometry(d);assert.ok(shape.sy/shape.sx<1.1);
  d.flowing=true;d.vy=160;d.stretch=.3;
  const flowing=dropGeometry(d);assert.ok(flowing.sy/flowing.sx>1.8);
});
test('fluid warp changes the head and tail silhouette while keeping source pixels intact',()=>{
  const source=new Uint8ClampedArray(64*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const i=(y*64+x)*4;source[i]=Math.round(y*255/63);source[i+1]=Math.round(x*255/63);source[i+2]=73;
    source[i+3]=Math.hypot((x-31.5)/26,(y-31.5)/30)<1?255:0;
  }
  const round=deformDrop(source,0),moving=deformDrop(source,1);
  assert.deepEqual(round,source);
  const area=(pixels,y)=>{let count=0;for(let x=0;x<64;x++)if(pixels[(y*64+x)*4+3]>128)count++;return count;};
  assert.ok(area(moving,16)<area(round,16));
  assert.ok(area(moving,48)>area(moving,16));
  assert.equal(source[(32*64+32)*4+2],73);
  assert.ok(moving.some((value,i)=>i%4===3&&value>0));
});
test('fine beads enter physics across the viewport without exceeding the drop budget or moving while paused',()=>{
  const p=new RainPhysics(1000,1000,()=>.5);p.drops=[];p.wind=1;p.windTarget=1;
  const released=[];
  const provider=(wind,budget)=>{
    const batch=Array.from({length:budget},(_,i)=>({x:200+(released.length+i)*20,y:[60,480,900][(released.length+i)%3],r:3}));
    released.push(...batch);return batch;
  };
  for(let i=0;i<10;i++)p.step(1/60,0,()=>{},()=>[],provider);
  assert.ok(released.some(d=>d.y===60)&&released.some(d=>d.y===900));
  assert.ok(p.drops.filter(d=>d.r===3).every(d=>d.flowing));assert.ok(p.drops.length<=420);
  p.active=false;p.ambient=false;const count=released.length;
  p.step(1,0,()=>{},()=>[],provider);assert.equal(released.length,count);
});
