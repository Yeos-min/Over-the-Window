import test from 'node:test';
import assert from 'node:assert/strict';
import {CodropsPhysics,GRAVITY} from '../src/codrops-physics.js';
import {WaterMap} from '../src/raindrops.js';
import {BeadField} from '../src/bead-field.js';
import {initMassControl} from '../src/mass-control.js';
import {pathNoise} from '../src/path-noise.js';

const fixture=()=>{const p=new CodropsPhysics(2000,2000,()=>.99);p.drops=[];return p;};
test('default mass is ten percent and live tuning changes velocity without size, position or adhesion changes',()=>{
  const p=fixture(),moving=p.drop(200,200,8,true),rest=p.drop(800,200,8);
  p.drops=[moving,rest];assert.equal(moving.mass,6.4);assert.equal(moving.vy,6.4*GRAVITY);
  const old=moving.vy;p.setMassScale(.02);
  assert.ok(Math.abs(moving.vy/old-.2)<1e-12);assert.equal(moving.r,8);assert.equal(moving.y,200);
  assert.equal(rest.vy,0);assert.equal(rest.flowing,false);assert.equal(rest.mass,1.28);
  p.reset();assert.equal(p.massScale,.02);assert.ok(p.drops.every(d=>d.mass===d.r*d.r*.02));
  p.setMassScale(999);assert.equal(p.massScale,1);p.setMassScale(-1);assert.equal(p.massScale,.01);
});
test('slider updates all physical and microbead masses immediately, including consumed shader records',()=>{
  const p=fixture(),d=p.drop(200,200,8,true);p.drops=[d];
  const bead={x:100,y:100,r:2},consumed={r:1};const beads=new BeadField();beads.add(bead);
  const map=Object.assign(Object.create(WaterMap.prototype),{beads,field:{records:[{bead:consumed}]}});
  const listeners={},attrs={},input={value:'.1',disabled:true,setAttribute:(k,v)=>attrs[k]=v,addEventListener:(k,v)=>listeners[k]=v};
  const output={};initMassControl(input,output,p,map);input.value='.25';listeners.input();
  assert.equal(d.mass,16);assert.equal(d.vy,16*GRAVITY);assert.equal(bead.mass,1);assert.equal(consumed.mass,.25);
  assert.equal(output.textContent,'×0.25');assert.equal(input.disabled,false);assert.ok(attrs['aria-valuetext'].includes('0.25'));
});
test('gradient noise is deterministic, bounded and continuous with continuous slope across cell boundaries',()=>{
  for(const seed of [1,79,100000]){
    for(let x=-3;x<3;x+=.013){assert.equal(pathNoise(x,seed),pathNoise(x,seed));assert.ok(Math.abs(pathNoise(x,seed))<=1.001);}
    for(let x=-3;x<=3;x++){
      const e=1e-5,at=pathNoise(x,seed),left=pathNoise(x-e,seed),right=pathNoise(x+e,seed);
      assert.ok(Math.abs(left-right)<.00005);assert.ok(Math.abs((at-left)/e-(right-at)/e)<.001);
    }
  }
});
test('calm runoff bends smoothly until adhesion at a higher mass setting',()=>{
  const p=fixture();p.setMassScale(.3);const d=p.drop(600,100,8,true);d.nextSpawn=99999;p.drops=[d];
  let previous=0,bends=[],positions=[d.x];
  for(let i=0;i<720&&d.flowing;i++){
    p.step(1/60,0);assert.ok(Math.abs(d.pathVx-previous)<6);previous=d.pathVx;bends.push(d.pathVx);
    positions.push(d.x);
  }
  assert.ok(Math.max(...positions)-Math.min(...positions)>1);assert.ok(Math.max(...bends)-Math.min(...bends)>3);
  assert.ok(d.y>100&&d.y<100+d.fallSpeed*12);assert.equal(d.vy,0);
  const before=JSON.stringify(d);p.active=false;for(let i=0;i<120;i++)p.step(1/60,0);assert.equal(JSON.stringify(d),before);
});
test('noise curves remain consistent across 30 and 60 Hz and do not reset after merging or mass tuning',()=>{
  const results=[];
  for(const dt of [1/30,1/60]){
    const p=fixture(),d=p.drop(600,100,8,true);d.nextSpawn=99999;p.drops=[d];
    for(let i=0;i<2/dt;i++)p.step(dt,0);results.push(d.x);
    const seed=d.pathSeed,distance=d.pathDistance,held=d.restTime;
    p.absorb(d,p.drop(601,d.y,2));p.setMassScale(.2);
    assert.equal(d.pathSeed,seed);assert.equal(d.pathDistance,distance);assert.ok(d.r>8);
    if(held>0){assert.equal(d.vy,0);assert.equal(d.restTime,held);}
    else assert.ok(d.vy>0&&d.vy<=d.mass*GRAVITY*d.turnDrag.retention);
  }
  assert.ok(Math.abs(results[0]-results[1])<.3);
});
