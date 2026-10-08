import test from 'node:test';
import assert from 'node:assert/strict';
import {turnRetention,newTurnDrag} from '../src/turn-drag.js';
import {CodropsPhysics} from '../src/codrops-physics.js';
import {initTurnDragControl} from '../src/noise-control.js';

const direction=(drop,angle,dt=1/60,strength=2)=>turnRetention(drop,Math.sin(angle)*100,Math.cos(angle)*100,dt,strength);
const fixture=()=>{
  const p=new CodropsPhysics(2000,2000,()=>.99);p.drops=[];p.spawnClock=-10000;p.setMassScale(.3);
  const d=p.drop(600,100,8,true);d.nextSpawn=99999;p.drops=[d];return {p,d};
};

test('a constant slanted direction never adds resistance; a fresh birth does not count as a turn',()=>{
  for(const angle of [-1,0,1]){
    const d={};for(let i=0;i<120;i++)assert.equal(direction(d,angle),1);
    assert.equal(d.turnDrag.loss,0);
  }
});

test('larger direction changes and stronger tuning reduce speed more, without changing its direction',()=>{
  const ratios=[];
  for(const angle of [.05,.3,.9]){const d={};direction(d,0);ratios.push(direction(d,angle));}
  assert.ok(ratios[0]>ratios[1]&&ratios[1]>ratios[2]);
  const weak={},strong={};direction(weak,0);direction(strong,0);
  assert.ok(direction(strong,.5,1/60,4)<direction(weak,.5,1/60,1));
  assert.ok(ratios.every(r=>r>0&&r<1));
});

test('steady direction recovers temporary resistance smoothly and zero disables it immediately',()=>{
  const d={};direction(d,0);const slow=direction(d,1);let previous=slow;
  for(let i=0;i<120;i++){const speed=direction(d,1);assert.ok(speed>=previous&&speed<=1);previous=speed;}
  assert.ok(previous>.97);assert.equal(direction(d,1,1/60,0),1);
  assert.deepEqual(d.turnDrag,newTurnDrag());
});

test('wrapped headings treat the angle seam as a small turn and invalid time cannot change state',()=>{
  const d={};direction(d,Math.PI-.01);assert.ok(direction(d,-Math.PI+.01)>.95);
  const snapshot={...d.turnDrag};
  for(const dt of [0,-1,NaN,Infinity])direction(d,0,dt);
  turnRetention(d,NaN,100,1/60,2);assert.deepEqual(d.turnDrag,snapshot);
});

test('continuous turn loss agrees at 30, 60 and 120Hz without per-frame tuning',()=>{
  const results=[];
  for(const hz of [30,60,120]){
    const d={};direction(d,0,1/hz);
    for(let i=1;i<=hz;i++)direction(d,i/hz*.7,1/hz);
    results.push(d.turnDrag.retention);
  }
  assert.ok(Math.max(...results)-Math.min(...results)<1e-12);
});

test('actual Perlin runoff slows more on stronger bends while distance remains tied to real travel',()=>{
  const results=[];
  for(const noise of [0,1,4]){
    const {p,d}=fixture();p.setPathNoise(noise);
    for(let i=0;i<60;i++)p.step(1/60,0);
    assert.ok(Math.abs(d.pathDistance-(d.y-100))<1e-9);
    results.push({speed:d.vy,travel:d.y-100,mass:d.mass,retention:d.turnDrag.retention});
  }
  assert.ok(results[0].travel>results[1].travel&&results[1].travel>results[2].travel);
  assert.ok(results[0].speed>results[1].speed&&results[1].speed>results[2].speed);
  assert.equal(results[0].mass,results[2].mass);assert.equal(results[0].retention,1);
});

test('a curved physical path speeds back up when its direction stabilizes, without a mass reset',()=>{
  const {p,d}=fixture();p.setPathNoise(0);
  const steer=angle=>{d.momentumX=d.fallSpeed*d.slide*Math.tan(angle)/60;p.step(1/60,0);};
  steer(0);for(let i=1;i<=10;i++)steer(i/10*.8);
  const slowed=d.vy,mass=d.mass;
  for(let i=0;i<60;i++)steer(.8);
  assert.ok(d.vy>slowed*1.5);assert.equal(d.mass,mass);assert.ok(d.flowing);
});

test('sharp bends enter the existing adhesion hold for either moving renderer and restart with clean history',()=>{
  for(const heartfelt of [false,true]){
    const {p,d}=fixture();p.setPathNoise(0);p.setTurnDrag(4);
    if(heartfelt)d.heartfelt={layer:1,free:true,next:{x:600,y:100,tail:0}};
    let steps=0;
    while(d.flowing&&steps++<20){d.momentumX=d.fallSpeed*d.slide*Math.tan(steps%2?1.4:-1.4)/60;p.step(1/60,0);}
    assert.ok(steps<20);assert.equal(d.vy,0);assert.ok(d.restTime>=.5&&d.restTime<=1);
    const position=[d.x,d.y,d.pathDistance];p.rng=()=>0;
    for(let i=0;i<20;i++){p.step(1/60,0);assert.deepEqual([d.x,d.y,d.pathDistance],position);}
    while(!d.flowing)p.step(1/60,0);
    assert.equal(d.turnDrag.retention,1);assert.equal(d.turnDrag.loss,0);assert.equal(d.restTime,0);
  }
});

test('turn-drag control preserves tuning on reset and changes neither mass nor noise settings',()=>{
  const {p,d}=fixture(),handlers={},attrs={},output={};
  const input={value:'2',disabled:true,addEventListener:(name,fn)=>handlers[name]=fn,setAttribute:(name,value)=>attrs[name]=value};
  initTurnDragControl(input,output,p);assert.equal(p.turnDragStrength,2);assert.equal(input.disabled,false);
  direction(d,0);direction(d,1);const position=[d.x,d.y,d.mass,p.pathNoise];
  input.value='0';handlers.input();assert.equal(d.turnDrag.retention,1);assert.deepEqual([d.x,d.y,d.mass,p.pathNoise],position);
  input.value='3.5';handlers.input();assert.equal(output.textContent,'×3.5');assert.match(attrs['aria-valuetext'],/3.5/);
  p.reset();assert.equal(p.turnDragStrength,3.5);
  p.setTurnDrag(99);assert.equal(p.turnDragStrength,4);p.setTurnDrag(-1);assert.equal(p.turnDragStrength,0);
});

test('pause freezes resistance, travel and adhesion history without queued turns',()=>{
  const {p,d}=fixture();p.setPathNoise(4);for(let i=0;i<30;i++)p.step(1/60,0);
  p.active=false;const snapshot=JSON.stringify(d);
  for(let i=0;i<120;i++)p.step(1/60,0);assert.equal(JSON.stringify(d),snapshot);
});
