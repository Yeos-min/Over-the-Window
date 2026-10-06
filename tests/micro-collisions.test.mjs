import test from 'node:test';
import assert from 'node:assert/strict';
import {BeadField} from '../src/bead-field.js';
import {WaterMap} from '../src/raindrops.js';
import {CodropsPhysics,MIN_RADIUS,MAX_RADIUS,GRAVITY} from '../src/codrops-physics.js';
import {HeartfeltRain} from '../src/heartfelt-rain.js';
import {HeartfeltField} from '../src/heartfelt-field.js';

const fieldFixture=()=>new HeartfeltField({canvasFactory:()=>({width:1,height:1,getContext:()=>({
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}
})})});
const fixture=(width=400,height=300)=>{
  const p=new CodropsPhysics(width,height,()=>.99);p.drops=[];p.setMassScale(1);p.pathNoise=0;
  const field=fieldFixture();
  const map=Object.assign(Object.create(WaterMap.prototype),{
    width,height,massScale:1,physics:p,field,beads:new BeadField(22200),
    drawBead(bead){this.beads.add(bead);},
    eraseBeads(beads){for(const bead of beads)if(bead.source)this.field.consume(bead);}
  });
  return {p,field,map};
};
test('nearby microbeads add mass and recalculate fall speed from gravity',()=>{
  const {p}=fixture(),d=p.drop(200,200,2);d.vy=60;
  p.absorbMicro(d,[{x:201,y:200,r:1},{x:202,y:200,r:1}]);
  assert.ok(Math.abs(d.r-Math.sqrt(4+1.6))<1e-9);assert.equal(d.mass,d.r*d.r);
  assert.equal(p.merges,2);assert.ok(d.momentumX>0);assert.ok(d.vy>0&&d.vy<d.mass*GRAVITY);
});
test('fine beads coalesce into one visible bead and growth eventually releases it',()=>{
  for(const r of [1,2.8]){
    const {p,map}=fixture(),a={x:100,y:100,r,aspect:1},b={x:101,y:100,r,aspect:1};
    map.beads.add(a);map.beads.add(b);assert.equal(map.coalesce(a,true),true);
    assert.equal(p.merges,1);
    if(r===1){
      assert.equal(map.beads.count,1);assert.equal(p.drops.length,0);
      const merged=map.beads.cells.values().next().value[0];assert.ok(merged.r>1&&merged.r<MIN_RADIUS);
    }else{
      assert.equal(map.beads.count,0);assert.equal(p.drops.length,1);
      assert.ok(p.drops[0].r>MIN_RADIUS&&p.drops[0].flowing);
      assert.equal(p.drops[0].vy,p.drops[0].mass*GRAVITY);
    }
  }
});
test('swept collision consumes tiny beads between frame endpoints only once',()=>{
  const {map}=fixture(),bead={x:25,y:30,r:1},far={x:80,y:30,r:1};
  map.beads.add(bead);map.beads.add(far);
  assert.deepEqual(map.absorb(50,30,2,0,30),[bead]);assert.equal(map.beads.count,1);
  assert.deepEqual(map.absorb(50,30,2,0,30),[]);
});
test('absorbed shader bead is removed from both collision field and rendering mask until fresh condensation',()=>{
  const {p,field,map}=fixture(),rain=new HeartfeltRain();field.seed(400,300,map);field.rain=rain;
  const record=field.records.find(r=>r.alive&&field.visible(r.bead));assert.ok(record);
  const bead=record.bead;assert.equal(field.pixels.data[record.index+3],255);
  const consumed=map.absorb(bead.x,bead.y,bead.r);assert.ok(consumed.includes(bead));
  assert.equal(record.alive,false);assert.equal(field.pixels.data[record.index+3],0);
  assert.ok(!map.beads.peek(bead.x,bead.y,bead.r).includes(bead));
  map.coalesce=()=>false;rain.staticTime=record.returnAt-.001;field.step(rain,p,map);
  assert.equal(field.pixels.data[record.index+3],0);
  rain.staticTime=record.returnAt+.001;field.step(rain,p,map);
  assert.equal(record.alive,true);assert.equal(field.pixels.data[record.index+3],255);
});
test('Heartfelt moving heads merge with ordinary physical drops in the same collision grid',()=>{
  const {p}=fixture(),a=p.drop(100,100,4),b=p.drop(101,100,2);
  b.heartfelt={layer:1,free:false,next:{x:101,y:100,tail:10}};p.drops=[a,b];
  p.step(1/60,0);
  assert.equal(p.drops.length,1);assert.ok(b.dead);assert.equal(p.merges,1);
  assert.ok(Math.abs(a.r-Math.sqrt(16+3.2))<1e-9);
});
test('microbead absorption releases a moving shader head from its programmed path',()=>{
  const {p}=fixture(),d=p.drop(20,30,2,true);
  d.heartfelt={layer:1,free:false,next:{x:21,y:31,tail:10}};p.drops=[d];
  p.step(1/60,0,()=>{},()=>[{x:22,y:31,r:1}]);
  assert.ok(d.heartfelt.free);assert.ok(d.r>2);
  d.heartfelt.next={x:1000,y:1000,tail:10};p.step(1/60,0);
  assert.ok(d.x<30&&d.y<40);
});
test('unmerged shader heads use mass for vertical motion and noise zero disables the source wiggle',()=>{
  for(const treble of [0,1]){
    const {p}=fixture(),d=p.drop(20,30,2,true);d.nextSpawn=99999;
    d.heartfelt={layer:1,free:false,next:{x:21,y:1000,tail:10},sampleX:20};
    p.music={level:0,treble};p.drops=[d];p.step(1/60,0);
    assert.equal(d.x,20);assert.ok(Math.abs(d.y-(30+4*GRAVITY/60))<1e-9);
    assert.ok(d.vy>0&&d.vy<d.mass*GRAVITY);assert.equal(d.heartfelt.free,false);
  }
});
test('disabled shared simulation freezes shader positions and consumed seed masks',()=>{
  const {p,field,map}=fixture(),rain=new HeartfeltRain();field.seed(400,300,map);map.coalesce=()=>false;
  assert.ok(field.records.filter(r=>r.alive).every(r=>r.bead.mass===r.bead.r**2));
  field.step(rain,p,map);p.active=false;
  const frame=field.frame,positions=JSON.stringify(p.drops),pixels=new Uint8ClampedArray(field.pixels.data);
  rain.update(1);field.step(rain,p,map);p.step(1/60,0);
  assert.equal(field.frame,frame);assert.equal(JSON.stringify(p.drops),positions);assert.deepEqual(field.pixels.data,pixels);
});
test('shared dense field remains bounded and finite while colliding and replenishing',()=>{
  const {p,field,map}=fixture(),rain=new HeartfeltRain();field.seed(400,300,map);
  p.music={level:1,treble:1};p.windTarget=.5;
  for(let i=0;i<120;i++){
    rain.update(1/60,p.music,p.wind);field.step(rain,p,map);
    p.step(1/60,0,()=>{},(...args)=>map.absorb(...args));
    assert.ok(map.beads.count<=22200);assert.ok(p.drops.length<=1320);
    assert.ok(p.drops.every(d=>d.r>0&&d.r<=MAX_RADIUS&&Number.isFinite(d.x+d.y+d.vx+d.vy)));
  }
  assert.ok(p.merges>0);assert.ok(field.consumed.size>0);
});
test('the actual dense collision field retains visibly adhered heads at default mass',()=>{
  const {p,field,map}=fixture(1200,900),rain=new HeartfeltRain();p.setMassScale(.1);map.massScale=.1;
  field.seed(1200,900,map);let held=0;
  for(let i=0;i<180;i++){
    rain.update(1/60);field.step(rain,p,map);
    p.step(1/60,0,()=>{},(...args)=>map.absorb(...args));
    if(i>60)held+=p.drops.filter(d=>d.heartfelt&&!d.flowing&&d.restTime>.5).length;
  }
  assert.ok(held>100);assert.ok(p.merges>0);
});
