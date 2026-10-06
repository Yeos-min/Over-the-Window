import test from 'node:test';
import assert from 'node:assert/strict';
import {CodropsPhysics} from '../src/codrops-physics.js';
import {initNoiseControl} from '../src/noise-control.js';

const fixture=()=>{const p=new CodropsPhysics(2000,2000,()=>.99);p.drops=[];return p;};
test('even heavy runoff settles while continuously absorbing fine beads, then visibly holds at rest',()=>{
  for(const shader of [false,true]){
    const p=fixture(),d=p.drop(600,100,14.4,true);d.nextSpawn=99999;p.drops=[d];
    if(shader)d.heartfelt={free:true,layer:1,next:{x:600,y:100,tail:0}};
    let steps=0;
    while(d.flowing&&steps++<180)p.step(1/60,0,()=>{},()=>[{x:d.x,y:d.y,r:2}]);
    assert.ok(steps<150);assert.equal(d.vy,0);assert.ok(d.restTime>=.5&&d.restTime<=1);
    const location=[d.x,d.y,d.pathDistance];p.rng=()=>0;p.wind=p.windTarget=1;
    for(let i=0;i<40;i++){
      p.step(1/60,0);assert.equal(d.flowing,false);assert.deepEqual([d.x,d.y,d.pathDistance],location);
    }
  }
});
test('a small absorbed bead cannot break the rest hold, but substantial new water or a big collision can',()=>{
  const p=fixture(),d=p.drop(600,100,8,true);d.nextSpawn=99999;p.drops=[d];
  for(let i=0;i<120&&d.flowing;i++)p.step(1/60,0);
  assert.ok(d.restTime>0);p.setMassScale(.2);p.absorbMicro(d,[{x:601,y:d.y,r:1}]);
  assert.equal(d.flowing,false);assert.equal(d.vy,0);
  p.absorbMicro(d,[{x:601,y:d.y,r:5}]);assert.ok(d.flowing);assert.equal(d.restTime,0);
  d.slide=0;p.setMassScale(p.massScale);d.restTime=1;
  p.absorb(d,p.drop(d.x+1,d.y,4));assert.ok(d.flowing);assert.equal(d.restTime,0);
});
test('noise slider supports zero through four, preserves tuning on reset, and cannot affect mass or adhesion',()=>{
  const p=fixture(),d=p.drop(600,100,8,true);p.drops=[d];d.pathVx=30;
  const handlers={},attrs={},input={value:'1',disabled:true,addEventListener:(k,v)=>handlers[k]=v,setAttribute:(k,v)=>attrs[k]=v},output={};
  initNoiseControl(input,output,p);const mass=d.mass,y=d.y;
  input.value='0';handlers.input();assert.equal(p.pathNoise,0);assert.equal(d.pathVx,0);
  assert.equal(output.textContent,'×0.0');assert.equal(d.mass,mass);assert.equal(d.y,y);
  input.value='4';handlers.input();assert.equal(p.pathNoise,4);assert.ok(attrs['aria-valuetext'].includes('4.0'));
  p.reset();assert.equal(p.pathNoise,4);assert.equal(input.disabled,false);
  p.setPathNoise(999);assert.equal(p.pathNoise,4);p.setPathNoise(-1);assert.equal(p.pathNoise,0);
});
test('noise zero produces straight calm runoff and higher settings increase lateral change for both renderers',()=>{
  for(const shader of [false,true]){
    const results=[];
    for(const strength of [0,1,4]){
      const p=fixture();p.setPathNoise(strength);p.setMassScale(.3);
      const d=p.drop(600,100,8,true);d.nextSpawn=99999;p.drops=[d];
      if(shader)d.heartfelt={layer:1,free:false,next:{x:600,y:1000,tail:0},sampleX:600};
      const curve=[];for(let i=0;i<30;i++){
        if(shader)d.heartfelt.next.x+=.1;
        p.step(1/60,0);
        curve.push(d.x);
      }
      results.push({x:d.x,y:d.y,curve});
    }
    assert.equal(results[0].x,600);assert.ok(Math.max(...results[1].curve)-Math.min(...results[1].curve)>.5);
    assert.ok(Math.abs((results[2].x-600)-4*(results[1].x-600))<1e-8);
    assert.equal(results[0].y,results[1].y);assert.equal(results[1].y,results[2].y);
  }
});
