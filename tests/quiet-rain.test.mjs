import test from 'node:test';
import assert from 'node:assert/strict';
import {RainPhysics,makeDrop,musicResponse,rainPopulationLimit} from '../src/physics.js';

const seeded=()=>{
  let seed=129;
  return ()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
};
const heldDrops=count=>Array.from({length:count},(_,i)=>{
  const d=makeDrop(50+(i%20)*70,50+Math.floor(i/20)*70,12);
  d.contact={phase:'rest',time:10000};return d;
});

test('quiet births are reduced to 40% without reducing loud-music or treble speed',()=>{
  assert.ok(Math.abs(musicResponse().spawnRate-1.75*.4)<1e-10);
  assert.equal(musicResponse({level:1}).spawnRate,47.625);
  assert.equal(musicResponse().acceleration,144);
  assert.equal(musicResponse({treble:1}).acceleration,1116);
  let previous=0;
  for(let i=0;i<=100;i++){
    const response=musicResponse({level:i/100});
    assert.ok(response.spawnRate>previous);previous=response.spawnRate;
  }
});

test('startup and reset have 40% of former seeds and a few natural runoffs',()=>{
  for(const [w,h,expected] of [[300,500,22],[800,900,44],[1600,1000,72],[4000,4000,72]]){
    const p=new RainPhysics(w,h,seeded());
    for(let i=0;i<2;i++){
      assert.equal(p.drops.length,expected);
      assert.ok(p.drops.filter(d=>d.flowing).length>=1);
      assert.ok(p.drops.filter(d=>d.flowing).length<=4);
      assert.ok(p.drops.every(d=>d.r<=10));
      assert.ok(p.drops.length<=rainPopulationLimit(w,h));p.reset();
    }
  }
});

test('quantity ceiling expands only with volume, not bass, treble or wind',()=>{
  for(const [w,h] of [[300,500],[800,900],[1600,1000]]){
    const quiet=rainPopulationLimit(w,h);assert.ok(quiet>=32&&quiet<=96);
    assert.equal(rainPopulationLimit(w,h,{bass:1,treble:1}),quiet);
    assert.equal(rainPopulationLimit(w,h,{level:1}),420);
    let previous=quiet;
    for(let i=1;i<=100;i++){
      const cap=rainPopulationLimit(w,h,{level:i/100});
      assert.ok(cap>=previous&&cap<=420);previous=cap;
    }
  }
});

test('quiet quantity bounds include trail beads and wind promotion with no backlog',()=>{
  const p=new RainPhysics(1600,1000,seeded()),limit=rainPopulationLimit(1600,1000);
  p.drops=heldDrops(limit-1);
  const d=makeDrop(1400,800,20,true);d.contact={phase:'slide',time:100};d.vy=60;d.trailDistance=100;
  p.drops[p.drops.length-1]=d;
  p.step(1/60,0);assert.equal(p.drops.filter(t=>t.parent===d).length,1);
  assert.ok(p.drops.length<=limit);
  p.drops=heldDrops(limit);p.wind=1;p.windTarget=1;p.spawnClock=100;p.windBeadClock=100;
  let promotions=0;p.step(1/60,0,()=>{},()=>[],()=>{promotions++;return [{x:1400,y:800,r:3}];});
  assert.equal(promotions,0);assert.equal(p.spawnClock,0);assert.equal(p.windBeadClock,0);
  p.music={level:1};p.step(1/60,0);
  assert.equal(p.drops.length,limit); // No backlog burst on the first louder frame.
  for(let i=0;i<60;i++)p.step(1/60,0);
  assert.ok(p.drops.length>limit);assert.ok(p.drops.length<=420);
});

test('two minutes of quiet runoff, absorption and strong wind stay bounded and moving',()=>{
  const p=new RainPhysics(800,900,seeded()),limit=rainPopulationLimit(800,900);
  p.windTarget=1;let travelled=0;
  for(let i=0;i<3600;i++){
    p.step(1/30,0,()=>travelled++,
      (x,y)=>i%3===0?[{x:x+1,y:y+1,r:1}]:[],
      (wind,budget)=>Array.from({length:budget},(_,j)=>({x:100+(j%3)*200,y:100+(i%3)*300,r:3})));
    assert.ok(p.drops.length<=limit);
    assert.ok(p.drops.every(d=>Number.isFinite(d.x)&&Number.isFinite(d.y)&&d.r<=20));
  }
  assert.ok(travelled>100);
});

test('returning to silence retains existing water rather than deleting it abruptly',()=>{
  const p=new RainPhysics(1600,1000,seeded());p.music={level:1};p.drops=heldDrops(140);
  const original=p.drops.slice();p.music={level:0,treble:0};p.step(1/60,0);
  assert.equal(p.drops.length,140);assert.ok(original.every(d=>p.drops.includes(d)));
  // Water leaves by the ordinary exit rule; the quiet ceiling then allows births.
  p.drops.forEach(d=>{d.y=2000;});p.step(1/60,0);assert.equal(p.drops.length,0);
  for(let i=0;i<180;i++)p.step(1/60,0);
  assert.ok(p.drops.length>0&&p.drops.length<=2);
});
