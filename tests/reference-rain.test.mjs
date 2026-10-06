import test from 'node:test';
import assert from 'node:assert/strict';
import {CodropsPhysics,MAX_RADIUS,GRAVITY} from '../src/codrops-physics.js';
import {HeartfeltRain} from '../src/heartfelt-rain.js';

const seeded=()=>{let state=793;return ()=>{state=(state*1664525+1013904223)>>>0;return state/2**32;};};
const fixture=(rng=()=>.99)=>{const p=new CodropsPhysics(1200,900,rng);p.drops=[];p.setMassScale(1);p.pathNoise=0;return p;};
test('Codrops collision adds 80 percent area, transfers sideways momentum and starts runoff',()=>{
  const p=fixture(),a=p.drop(200,200,12),b=p.drop(204,200,8);
  p.drops=[a,b];p.step(1/60,0);
  assert.equal(p.drops.length,1);assert.equal(p.drops[0],a);assert.ok(b.dead);
  assert.ok(Math.abs(a.r-Math.sqrt(12**2+8**2*.8))<1e-9);
  assert.equal(a.mass,a.r*a.r);assert.ok(a.flowing);assert.equal(a.vy,a.mass*GRAVITY);assert.equal(a.momentumX,.4);
  p.absorb(a,p.drop(204,200,100));assert.equal(a.r,MAX_RADIUS);
});
test('moving drops leave small separate heads and cannot immediately reabsorb their own trail',()=>{
  const p=fixture(),a=p.drop(200,200,12,true);a.vy=180;a.nextSpawn=0;
  p.drops=[a];p.step(1/60,0);
  const child=p.drops.find(d=>d.parent===a);
  assert.ok(child&&!child.flowing);assert.ok(child.r>=12*.2&&child.r<=12*.35);
  assert.ok(child.y<200&&a.y>200);assert.equal(a.r,12*.97);
  p.step(1/60,0);assert.ok(p.drops.includes(child));assert.equal(p.merges,0);
});
test('dry friction slows runoff to complete adhesion at the default mass',()=>{
  const p=fixture();p.setMassScale(.1);const d=p.drop(200,200,8,true);d.nextSpawn=99999;
  p.drops=[d];const initial=d.vy;
  for(let i=0;i<30;i++)p.step(1/60,0);
  assert.ok(d.vy>0&&d.vy<initial);
  for(let i=0;i<120&&d.flowing;i++)p.step(1/60,0);
  assert.equal(d.vy,0);assert.equal(d.flowing,false);assert.ok(d.y>200&&d.y<260);
  const y=d.y;for(let i=0;i<20;i++)p.step(1/60,0);assert.equal(d.y,y);
});
test('absorbing hundreds of microbeads uses capped mass rather than stacking velocity boosts',()=>{
  const p=fixture(),d=p.drop(200,200,12,true);d.vy=180;d.nextSpawn=999;
  p.drops=[d];let cleared=0;
  p.step(1/60,0,()=>{},()=>{cleared++;return Array.from({length:200},()=>({x:200,y:200,r:2}));});
  assert.equal(cleared,1);assert.equal(d.r,MAX_RADIUS);assert.equal(p.merges,200);
  assert.equal(d.fallSpeed,MAX_RADIUS**2*GRAVITY);assert.ok(d.vy>0&&d.vy<d.fallSpeed);
});
test('twice the radius produces four times the mass and release speed, with less relative slowdown',()=>{
  for(const dt of [1/30,1/60]){
    const p=fixture(),small=p.drop(200,100,4,true),large=p.drop(600,100,8,true);
    assert.equal(large.mass/small.mass,4);assert.equal(large.vy/small.vy,4);
    for(const d of [small,large])d.nextSpawn=99999;
    p.drops=[small,large];for(let i=0;i<.5/dt;i++)p.step(dt,0);
    assert.ok(large.slide>small.slide);assert.ok(large.y-100>4*(small.y-100));
  }
});
test('adhered drops have mass but stay still until collision releases them',()=>{
  const p=fixture(),d=p.drop(200,200,4);p.drops=[d];p.step(1/60,0);
  assert.equal(d.mass,16);assert.equal(d.vy,0);assert.equal(d.y,200);
  p.absorb(d,p.drop(201,200,2));const y=d.y,releaseSpeed=d.vy;p.step(1/60,0);
  assert.ok(d.vy<releaseSpeed);assert.ok(Math.abs(d.y-y-releaseSpeed/60)<1e-9);
});
test('disabled simulation freezes drop state, clocks and wind without queued births',()=>{
  const p=new CodropsPhysics(1200,900,seeded());p.windTarget=1;p.active=false;
  const before=JSON.stringify(p);for(let i=0;i<120;i++)p.step(1/60,0);
  assert.equal(JSON.stringify(p),before);
});
test('both wind directions move droplets sideways independently of treble',()=>{
  const results=[];
  for(const wind of [-1,1])for(const treble of [0,1]){
    const p=fixture(),d=p.drop(600,200,12,true);d.vy=600;d.nextSpawn=99999;
    p.wind=p.windTarget=wind;p.music={level:0,treble};p.drops=[d];
    for(let i=0;i<30;i++)p.step(1/60,0);
    assert.ok((d.x-600)*wind>0);assert.ok(d.y>200);results.push(d.x);
  }
  assert.equal(results[0],results[1]);assert.equal(results[2],results[3]);
  assert.ok(Math.abs(results[0]+results[2]-1200)<1e-9);
});
test('runtime population, radius and coordinates remain bounded under maximum audio and wind',()=>{
  const p=new CodropsPhysics(1200,900,seeded());p.music={level:1,treble:1};p.windTarget=1;
  for(let i=0;i<3600;i++){
    p.step(1/60,0);
    assert.ok(p.drops.length<=420);
    assert.ok(p.drops.every(d=>d.r>0&&d.r<=MAX_RADIUS&&Number.isFinite(d.x+d.y+d.vx+d.vy+d.rotation)));
  }
  assert.ok(p.merges>0);assert.ok(p.drops.some(d=>d.parent));
});
test('a physical drop exits the bottom and does not become standing water',()=>{
  const p=fixture(),d=p.drop(600,950,12,true);p.drops=[d];p.step(1/60,0);
  assert.ok(d.dead);assert.ok(!p.drops.includes(d));
});
test('Heartfelt static and moving layers use independently controlled clocks',()=>{
  const quiet=new HeartfeltRain(),treble=new HeartfeltRain(),loud=new HeartfeltRain();
  for(let i=0;i<60;i++){
    quiet.update(1/60);treble.update(1/60,{treble:1});loud.update(1/60,{level:1});
  }
  assert.ok(Math.abs(quiet.time-12.2)<1e-9);assert.ok(Math.abs(treble.time-12.6)<1e-9);
  assert.equal(quiet.staticTime,treble.staticTime);assert.equal(quiet.time,loud.time);
  assert.ok(loud.amount>quiet.amount&&loud.amount<=1);
});
test('Heartfelt wind drift reverses smoothly and never changes stationary bead time',()=>{
  const left=new HeartfeltRain(),right=new HeartfeltRain();
  for(let i=0;i<120;i++){left.update(1/60,{},-1);right.update(1/60,{},1);}
  assert.ok(left.drift<0&&right.drift>0);assert.equal(left.drift,-right.drift);
  assert.equal(left.staticTime,right.staticTime);
  const previous=right.wind;right.update(1/60,{},-1);assert.ok(right.wind<previous&&right.wind>0);
  right.reset();assert.equal(right.time,12);assert.equal(right.staticTime,12);assert.equal(right.drift,0);assert.equal(right.wind,0);
});
