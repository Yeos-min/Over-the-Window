import test from 'node:test';
import assert from 'node:assert/strict';
import {BeadField} from '../src/bead-field.js';
import {CodropsPhysics,MAX_RADIUS,GRAVITY} from '../src/codrops-physics.js';
import {WaterMap} from '../src/raindrops.js';
import {TrailMemory} from '../src/trail-memory.js';
import {HeartfeltField} from '../src/heartfelt-field.js';
import {HeartfeltRain} from '../src/heartfelt-rain.js';

const fieldFixture=()=>new HeartfeltField({canvasFactory:()=>({width:1,height:1,getContext:()=>({
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}
})})});
function fixture(){
  const p=new CodropsPhysics(500,500,()=>.99);p.drops=[];p.spawnClock=-10000;p.setPathNoise(0);
  const field=fieldFixture(),map=Object.assign(Object.create(WaterMap.prototype),{
    width:500,height:500,physics:p,massScale:p.massScale,field,beads:new BeadField(22200),
    mask:{width:250,height:250},trailMemory:new TrailMemory(250,250),
    eraseBeads(beads){for(const bead of beads)if(bead.source)this.field.consume(bead);}
  });
  return {p,map,field};
}

test('finger capsule includes endpoints and fine beads between samples, excludes the rest of its bounding box',()=>{
  const beads=new BeadField(),a={x:50,y:50,r:1},b={x:90,y:90,r:2},edge={x:100,y:105,r:1,aspect:3};
  const far={x:50,y:90,r:1},hidden={x:70,y:70,r:1,hidden:true};
  for(const bead of [a,b,edge,far,hidden])beads.add(bead);
  const hit=beads.peekFinger(0,0,100,100,3,bead=>!bead.hidden);
  assert.ok(hit.includes(a)&&hit.includes(b)&&hit.includes(edge));assert.ok(!hit.includes(far)&&!hit.includes(hidden));
  assert.equal(new Set(hit).size,hit.length);assert.equal(beads.count,5);
});

test('current finger contact combines static, ordinary and Heartfelt water once with full area and gravity speed',()=>{
  const {p,map}=fixture(),a=p.drop(200,200,MAX_RADIUS),b=p.drop(205,200,8);
  b.heartfelt={layer:1,free:false,next:{x:205,y:200,tail:10}};
  const untouched=p.drop(400,400,5),dead=p.drop(200,200,9);dead.dead=true;p.drops=[a,b,untouched,dead];
  const beads=[{x:198,y:200,r:1},{x:202,y:201,r:2}],outside={x:300,y:300,r:1};
  for(const bead of [...beads,outside])map.beads.add(bead);
  const expectedArea=a.r*a.r+b.r*b.r+5;
  const drop=map.wipe(190,200,210,200,14);
  assert.equal(drop,a);assert.ok(b.dead);assert.equal(p.drops.length,2);assert.ok(p.drops.includes(untouched));
  assert.ok(Math.abs(drop.r**2-expectedArea)<1e-10);assert.ok(drop.r>MAX_RADIUS);
  assert.ok(Math.abs(drop.mass-expectedArea*p.massScale)<1e-10);assert.equal(drop.vy,drop.mass*GRAVITY);
  assert.equal(drop.restTime,0);assert.ok(drop.flowing);assert.equal(map.beads.count,1);assert.equal(p.merges,3);
  const mass=drop.mass,merges=p.merges;map.wipe(190,200,210,200,14);
  assert.equal(drop.mass,mass);assert.equal(p.merges,merges);assert.equal(map.beads.count,1);
});

test('collecting more fine beads produces one larger, faster flowing drop and actual downward travel',()=>{
  const results=[];
  for(const count of [1,8,32]){
    const {p,map}=fixture();
    for(let i=0;i<count;i++)map.beads.add({x:200+i%4,y:200+Math.floor(i/4),r:2});
    const d=map.wipe(190,200,220,200,14);d.nextSpawn=99999;
    assert.equal(p.drops.length,1);assert.equal(map.beads.count,0);
    assert.ok(Math.abs(d.mass-count*4*p.massScale)<1e-10);assert.equal(d.vy,d.mass*GRAVITY);
    const y=d.y,speed=d.vy;p.step(1/60,0);
    assert.ok(Math.abs((d.y-y)-speed/60)<1e-10);results.push(speed);
  }
  assert.ok(results[0]<results[1]&&results[1]<results[2]);
});

test('old drawing areas cannot collect new water after the finger moves away or is released',()=>{
  const {p,map}=fixture();map.beads.add({x:50,y:100,r:2});map.wipe(20,100,80,100,14);
  const old={x:50,y:100,r:1},current={x:210,y:100,r:1};map.beads.add(old);map.beads.add(current);
  map.wipe(200,100,220,100,14);assert.equal(map.beads.count,1);
  assert.ok(map.beads.peek(50,100,1).includes(old));const mass=p.drops.reduce((sum,d)=>sum+d.mass,0);
  map.trailMemory.advance(10);assert.equal(map.beads.count,1);
  assert.equal(p.drops.reduce((sum,d)=>sum+d.mass,0),mass);
});

test('consumed visible shader beads disappear from rendering and no artificial birth sound fires',()=>{
  const {p,map,field}=fixture();field.seed(500,500,map);field.rain=new HeartfeltRain();
  let sounds=0;p.onImpact=()=>sounds++;
  const record=field.records.find(record=>record.alive&&field.visible(record.bead));assert.ok(record);
  const d=map.wipe(record.bead.x,record.bead.y,record.bead.x,record.bead.y,4);
  assert.ok(d&&d.flowing);assert.equal(record.alive,false);assert.equal(field.pixels.data[record.index+3],0);
  assert.equal(sounds,0);assert.ok(!map.beads.peekFinger(d.x,d.y,d.x,d.y,1).includes(record.bead));
});

test('finger-collected water keeps its mass beyond the birth size cap when absorbing later water',()=>{
  const {p,map}=fixture();const a=p.drop(200,200,14),b=p.drop(202,200,14);p.drops=[a,b];
  const d=map.wipe(200,200,202,200,14),area=d.r*d.r;
  p.absorbMicro(d,[{x:d.x,y:d.y,r:4}]);assert.ok(Math.abs(d.r*d.r-(area+16))<1e-10);
  const other=p.drop(d.x,d.y,10);p.absorb(d,other);
  assert.ok(Math.abs(d.r*d.r-(area+16+100))<1e-10);assert.ok(d.vy>0);
});

test('enlarged finger drops collide across multiple grid cells instead of missing nearby ordinary drops',()=>{
  const {p}=fixture(),large=p.drop(200,200,140),small=p.drop(260,200,4);
  large.fingerMerged=true;p.drops=[large,small];p.step(1/60,0);
  assert.equal(p.drops.length,1);assert.ok(small.dead);assert.ok(large.r>140);assert.ok(large.flowing);
});

test('at the population ceiling a new lump leaves its source beads intact instead of losing water',()=>{
  const {p,map}=fixture();p.drops=Array.from({length:1320},()=>p.drop(400,400,1));
  const bead={x:50,y:50,r:2};map.beads.add(bead);
  assert.equal(map.wipe(50,50,50,50,14),null);assert.equal(map.beads.count,1);assert.equal(p.drops.length,1320);
});
