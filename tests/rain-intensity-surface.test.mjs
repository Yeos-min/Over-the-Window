import test from 'node:test';
import assert from 'node:assert/strict';
import {CodropsPhysics} from '../src/codrops-physics.js';
import {HeartfeltField} from '../src/heartfelt-field.js';
import {HeartfeltRain} from '../src/heartfelt-rain.js';
import {BeadField} from '../src/bead-field.js';
import {WaterMap} from '../src/raindrops.js';
import {glassResistance,surfaceSpeed} from '../src/surface-friction.js';
import {initRainControl} from '../src/rain-intensity.js';

const seeded=()=>{let seed=3481;return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
const fieldFixture=(intensity=1,width=800)=>{
  const p=new CodropsPhysics(width,600,seeded());p.drops=[];p.setRainIntensity(intensity);
  const f=new HeartfeltField({canvasFactory:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})})})});
  const map={physics:p,beads:new BeadField(22200),massScale:.1,coalesce:()=>false},rain=new HeartfeltRain();f.seed(width,600,map);
  return {p,f,map,rain};
};

test('the rain slider stops new arrivals without changing existing water, size, mass or motion settings',()=>{
  const p=new CodropsPhysics(2000,2000,seeded()),d=p.drop(400,100,8,true);p.drops=[d];d.nextSpawn=1e9;
  const before={r:d.r,mass:d.mass,noise:p.pathNoise,turn:p.turnDragStrength},events=[];p.onImpact=d=>events.push(d);
  const handlers={},attrs={},input={value:'100',disabled:true,addEventListener:(k,v)=>handlers[k]=v,setAttribute:(k,v)=>attrs[k]=v},output={};
  initRainControl(input,output,p);input.value='0';handlers.input();
  assert.equal(input.disabled,false);assert.equal(output.textContent,'0%');assert.equal(attrs['aria-valuetext'],'비의 양 0%');
  p.step(1/60,0);assert.ok(d.y>100);assert.ok(p.drops.includes(d));assert.equal(events.length,0);
  assert.deepEqual({r:d.r,mass:d.mass,noise:p.pathNoise,turn:p.turnDragStrength},before);
  input.value='200';handlers.input();assert.equal(p.rainIntensity,2);p.reset();assert.equal(p.rainIntensity,2);
  p.setRainIntensity(0);p.reset();assert.equal(p.drops.length,0);
  p.setRainIntensity(Infinity);assert.equal(p.rainIntensity,1);p.setRainIntensity(-1);assert.equal(p.rainIntensity,0);
});

test('arrival rate follows intensity, birth intervals vary, and the population cap remains fixed',()=>{
  const counts=[];
  for(const intensity of [0,.5,1,2]){
    const p=new CodropsPhysics(10000,10000,seeded());p.drops=[];p.setRainIntensity(intensity);const times=[];
    let time=0;p.onImpact=()=>times.push(time);
    for(let i=0;i<600;i++){time=(i+1)/60;p.step(1/60,0);p.drops=[];}
    counts.push(times.length);
    if(intensity===1){const intervals=times.slice(1).map((t,i)=>Math.round((t-times[i])*60));assert.ok(new Set(intervals).size>8);}
  }
  assert.equal(counts[0],0);assert.ok(counts[1]>50&&counts[1]<110);assert.ok(counts[2]>120&&counts[2]<200);
  assert.ok(counts[3]>counts[2]*1.7&&counts[3]<counts[2]*2.3);
  const p=new CodropsPhysics(1200,900,seeded());p.setRainIntensity(2);p.music={level:1};
  for(let i=0;i<1800;i++){p.step(1/60,0);assert.ok(p.drops.length<=420);}
});

test('Heartfelt head density follows the same slider and existing heads survive reducing it to zero',()=>{
  const counts=[];
  for(const intensity of [0,.5,1,2]){const {p,f,map,rain}=fieldFixture(intensity,300);f.step(rain,p,map);counts.push(p.drops.length);}
  assert.equal(counts[0],0);assert.ok(counts[1]>0&&counts[1]<counts[2]);assert.ok(counts[3]>counts[2]*1.5);
  const capped=fieldFixture(2);capped.f.step(capped.rain,capped.p,capped.map);assert.equal(capped.p.drops.length,900);
  const {p,f,map,rain}=fieldFixture();f.step(rain,p,map);const bodies=p.drops.slice();
  assert.ok(bodies.some(d=>!d.flowing)&&bodies.some(d=>d.flowing));
  assert.ok(new Set(bodies.map(d=>d.slide.toFixed(3))).size>20);
  p.setRainIntensity(0);rain.time+=.01;f.step(rain,p,map);assert.deepEqual(p.drops,bodies);
});

test('zero suppresses shader births in both collision visibility and texture alpha, then restores them',()=>{
  const {p,f,map,rain}=fieldFixture();const events=[];p.onImpact=d=>{if(d.source)events.push(d);};
  f.step(rain,p,map);
  const record=f.records.find(r=>r.alive&&!r.wasVisible&&((r.nz*10)%1)>.5);assert.ok(record);f.records=[record];
  p.setRainIntensity(0);rain.staticTime=13-record.nz+.001;f.step(rain,p,map);
  assert.equal(f.pixels.data[record.index+3],0); // Gate even before the visible/collision threshold.
  rain.staticTime=13-record.nz+.015;f.step(rain,p,map);
  assert.equal(events.length,0);assert.equal(f.visible(record.bead),false);assert.equal(f.pixels.data[record.index+3],0);
  p.setRainIntensity(1);rain.staticTime=13-record.nz+.99;f.step(rain,p,map);
  rain.staticTime=14-record.nz+.015;f.step(rain,p,map);
  assert.equal(events.length,1);assert.equal(f.visible(record.bead),true);assert.equal(f.pixels.data[record.index+3],255);
  const zero=fieldFixture(0);assert.equal(zero.f.pixels.data.filter((_,i)=>i%4===3&&zero.f.pixels.data[i]>0).length,0);
});

test('zero also blocks new condensation and does not accumulate a later burst',()=>{
  const map=Object.assign(Object.create(WaterMap.prototype),{physics:{rainIntensity:0},width:1000,height:1000,field:{},beads:{count:0},counter:10000,beadArrival:1});
  let births=0;map.tinyDrop=()=>births++;
  map.condense(20);assert.equal(births,0);assert.equal(map.counter,0);
  map.physics.rainIntensity=1;map.condense(.001);assert.equal(births,0);assert.ok(map.counter<1);
});

test('same-sized simultaneous births stop at distributed times and hold within 0.5–1 second',()=>{
  const p=new CodropsPhysics(5000,5000,seeded());p.drops=[];p.setRainIntensity(0);p.setPathNoise(0);
  const drops=Array.from({length:100},(_,i)=>{const d=p.drop(200+(i%10)*350,200+Math.floor(i/10)*350,6,true);d.nextSpawn=1e9;return d;});p.drops=drops;
  const stops=new Map(),bins=new Map(),holds=[];
  for(let i=1;i<=720&&stops.size<100;i++){
    p.step(1/60,0);
    for(const d of drops)if(!d.flowing&&!stops.has(d)){
      stops.set(d,i/60);holds.push(d.restTime);const bin=Math.floor(i/6);bins.set(bin,(bins.get(bin)||0)+1);
    }
  }
  const times=[...stops.values()].sort((a,b)=>a-b);
  assert.equal(stops.size,100);assert.equal(p.merges,0);assert.ok(times[89]-times[10]>1);
  assert.ok(Math.max(...bins.values())<20);assert.ok(holds.every(t=>t>=.5&&t<=1));
  assert.ok(new Set(holds.map(t=>t.toFixed(3))).size>30);
});

test('glass resistance is position-bound and continuous; travelled length brakes independently of elapsed time',()=>{
  const values=[];
  for(let i=0;i<100;i++){const a=glassResistance(i*13,i*29);assert.equal(a,glassResistance(i*13,i*29));values.push(a);assert.ok(Math.abs(a-glassResistance(i*13+.001,i*29))<.001);}
  assert.ok(Math.max(...values)-Math.min(...values)>.5);
  const d={x:300,y:400,r:6,mass:3.6,pathSeed:128};
  assert.equal(surfaceSpeed(d,50,0,0),50);assert.ok(surfaceSpeed(d,50,30,0)<surfaceSpeed(d,50,10,0));
});

test('local friction stays close across frame rates and records full curved travel while pause freezes it',()=>{
  const results=[];
  for(const hz of [30,60,120]){
    const p=new CodropsPhysics(5000,5000,seeded());p.drops=[];p.setRainIntensity(0);
    const d=p.drop(600,100,8,true);d.nextSpawn=1e9;p.drops=[d];let length=0,ticks=0;
    while(d.flowing&&ticks++<hz*12){const x=d.x,y=d.y;p.step(1/hz,0);length+=Math.hypot(d.x-x,d.y-y);}
    assert.equal(d.flowing,false);assert.ok(Math.abs(length-d.travelDistance)<1e-8);assert.ok(length>d.y-100);
    results.push({time:ticks/hz,y:d.y});const snapshot=JSON.stringify(d);p.active=false;
    for(let i=0;i<hz;i++)p.step(1/hz,0);assert.equal(JSON.stringify(d),snapshot);
  }
  assert.ok(Math.max(...results.map(r=>r.time))-Math.min(...results.map(r=>r.time))<.15);
  assert.ok(Math.max(...results.map(r=>r.y))-Math.min(...results.map(r=>r.y))<3);
});

test('repeated capped-body contacts cannot refill slide momentum or break its rest hold',()=>{
  const p=new CodropsPhysics(5000,5000,seeded());p.setRainIntensity(0);p.drops=[];
  const d=p.drop(600,100,14.4,true);d.nextSpawn=1e9;p.drops=[d];
  let ticks=0;
  while(d.flowing&&ticks++<720){
    const slide=d.slide;p.absorb(d,p.drop(d.x+1,d.y,.5));assert.equal(d.slide,slide);
    p.absorbMicro(d,[{x:d.x,y:d.y,r:.5}]);assert.equal(d.slide,slide);p.step(1/60,0);
  }
  assert.equal(d.flowing,false);assert.ok(d.restTime>=.5&&d.restTime<=1);
  const rest=d.restTime;p.absorb(d,p.drop(d.x+1,d.y,.5));assert.equal(d.restTime,rest);assert.equal(d.vy,0);
  p.absorbMicro(d,[{x:d.x,y:d.y,r:.5}]);assert.equal(d.restTime,rest);assert.equal(d.vy,0);
});
