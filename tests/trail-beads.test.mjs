import test from 'node:test';
import assert from 'node:assert/strict';
import {TrailBeads} from '../src/trail-beads.js';
import {WaterMap} from '../src/raindrops.js';
import {BeadField} from '../src/bead-field.js';
import {CodropsPhysics} from '../src/codrops-physics.js';

const drop=()=>({r:8,pathSeed:731,pathPhase:12.31,spreadX:0,spreadY:0,shape:{strain:.5,pulse:0}});
function travel(step,seed=731){
  const sampler=new TrailBeads(),d=drop(),beads=[];d.pathSeed=seed;
  for(let y=100;y<600;y+=step)beads.push(...sampler.sample(d,200,y,200,y+step,720));
  return beads;
}
test('distance noise leaves tiny, irregular beads at the same locations across frame sizes',()=>{
  const a=travel(1),b=travel(5);
  assert.ok(a.length>20&&a.length<110);
  assert.equal(a.length,b.length);
  a.forEach((bead,i)=>{assert.ok(Math.abs(bead.x-b[i].x)<1e-9&&Math.abs(bead.y-b[i].y)<1e-9);});
  assert.ok(a.every(bead=>bead.r>0&&bead.r<1.6&&bead.aspect===1&&bead.heartfeltResidue));
  assert.ok(new Set(a.map(bead=>bead.r.toFixed(2))).size>5);
  assert.notDeepEqual(a,travel(1,732));
  const gaps=a.slice(1).map((bead,i)=>bead.y-a[i].y);
  assert.ok(Math.max(...gaps)>Math.min(...gaps)*2);
});
test('residue waits for the deformed body to pass, and stopped paths produce no beads',()=>{
  const sampler=new TrailBeads(),d=drop();d.shape.strain=1;
  for(let y=100;y<300;y++){
    for(const bead of sampler.sample(d,200,y,200,y+1,720))assert.ok(y+1-bead.y>d.r*1.6);
  }
  const state=JSON.stringify(sampler.paths.get(d));
  for(let i=0;i<120;i++)assert.deepEqual(sampler.sample(d,200,300,200,300,720),[]);
  assert.equal(JSON.stringify(sampler.paths.get(d)),state);
  assert.ok(sampler.paths.get(d).pending.length<=64);
});
const context=()=>({save(){},restore(){},clearRect(){},scale(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},ellipse(){},arc(){},fill(){},drawImage(){}});
function mapFixture(capacity=22200){
  const p=new CodropsPhysics(800,720,()=>.99);p.drops=[];
  const calls=[],rctx=context();rctx.drawImage=(...args)=>calls.push(args);
  const map=Object.assign(Object.create(WaterMap.prototype),{width:800,height:720,massScale:.1,physics:p,
    beads:new BeadField(capacity),field:{visible:()=>true,flush(){},rain:{amount:.65}},
    ctx:context(),hctx:context(),dctx:context(),rctx,mctx:context(),sprites:['normal'],heightSprite:'height',
    mask:{width:400,height:360},canvas:{width:800,height:720},heightMap:{width:800,height:720},residueMap:'residue',
    droplets:'normal beads',trailMemory:{stamp(){}},trailBeads:new TrailBeads()});
  return {map,p,calls};
}
test('runtime trail residue uses Heartfelt height rendering and shared collision mass/erasure',()=>{
  const {map,calls}=mapFixture(),d=drop();
  for(let y=100;y<300;y++){
    assert.deepEqual(map.absorb(200,y+1,8,200,y),[]);
    map.trail(200,y,200,y+1,8,d);
  }
  assert.ok(map.beads.count>10&&calls.length>10);
  const bead=[...map.beads.cells.values()].flat()[0];
  assert.equal(calls[0][0],'height');assert.equal(bead.mass,bead.r**2*.1);
  let erased=false;map.rctx.arc=()=>{erased=true;};
  assert.ok(map.absorb(bead.x,bead.y,bead.r).includes(bead));assert.ok(erased);
  assert.ok(!map.beads.peek(bead.x,bead.y,bead.r).includes(bead));
  const layers=[];map.hctx.drawImage=(image)=>layers.push(image);map.draw([]);assert.deepEqual(layers,['residue']);
});
test('real physics passes the moving drop to residue sampling and pause freezes creation',()=>{
  const {map,p}=mapFixture(),d=p.drop(200,100,14,true);d.nextSpawn=99999;p.drops=[d];p.pathNoise=0;
  for(let i=0;i<60;i++)p.step(1/60,0,(...args)=>map.trail(...args));
  assert.ok(map.beads.count>0);const count=map.beads.count,state=JSON.stringify(map.trailBeads.paths.get(d));
  p.active=false;for(let i=0;i<60;i++)p.step(1/60,0,(...args)=>map.trail(...args));
  assert.equal(map.beads.count,count);assert.equal(JSON.stringify(map.trailBeads.paths.get(d)),state);
});
test('residue respects the shared bead capacity and reset discards queued paths and painted beads',()=>{
  const {map}=mapFixture(3),d=drop();
  for(let y=100;y<500;y++)map.trail(200,y,200,y+1,8,d);
  assert.ok(map.beads.count<=3);
  let cleared=false;map.rctx.clearRect=()=>{cleared=true;};map.width=0;map.height=0;map.field.seed=()=>{};
  map.seed();assert.ok(cleared);assert.equal(map.beads.count,0);assert.equal(map.trailBeads.paths.get(d),undefined);
});
