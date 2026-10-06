import test from 'node:test';
import assert from 'node:assert/strict';
import {CodropsPhysics} from '../src/codrops-physics.js';

const fixture=()=>{const p=new CodropsPhysics(2000,2000,()=>.99);p.drops=[];return p;};
const advance=(p,seconds)=>{for(let i=0;i<seconds*60;i++)p.step(1/60,0);};
test('small beads adhere sooner than large beads and remain still in both axes including shader heads',()=>{
  for(const shader of [false,true]){
    const p=fixture(),small=p.drop(400,100,4,true),large=p.drop(900,100,8,true);
    for(const d of [small,large]){
      d.nextSpawn=99999;
      if(shader)d.heartfelt={layer:1,free:false,next:{x:d.x,y:1000,tail:10},sampleX:d.x};
    }
    p.drops=[small,large];advance(p,.6);
    assert.equal(small.flowing,false);assert.ok(large.flowing);
    for(let i=0;i<180&&(small.flowing||large.flowing);i++)p.step(1/60,0);
    for(const d of [small,large]){
      assert.equal(d.flowing,false);assert.equal(d.vx,0);assert.equal(d.vy,0);
      assert.equal(d.windVx,0);assert.equal(d.pathVx,0);
    }
    const positions=p.drops.slice(0,2).map(d=>[d.x,d.y,d.pathDistance]);
    if(shader)for(const d of [small,large])d.heartfelt.next={x:d.x+50,y:1500,tail:10};
    advance(p,Math.min(small.restTime,large.restTime)/2);
    assert.deepEqual([small,large].map(d=>[d.x,d.y,d.pathDistance]),positions);
  }
});
test('collision resumes an adhered bead while mass adjustment alone preserves its stopped state',()=>{
  const p=fixture(),d=p.drop(400,100,4,true);d.nextSpawn=99999;p.drops=[d];
  for(let i=0;i<120&&d.flowing;i++)p.step(1/60,0);
  assert.equal(d.flowing,false);const position=[d.x,d.y];p.setMassScale(.2);
  assert.equal(d.vy,0);assert.equal(d.slide,0);assert.deepEqual([d.x,d.y],position);
  p.absorb(d,p.drop(d.x+1,d.y,2));assert.equal(d.slide,1);assert.equal(d.vy,d.fallSpeed);
  const y=d.y;p.step(1/60,0);assert.ok(d.y>y&&d.vy<d.fallSpeed);
});
test('tiny contacts add only proportional momentum instead of restarting at full speed',()=>{
  const p=fixture(),d=p.drop(400,100,8);p.absorbMicro(d,[{x:400,y:100,r:1}]);
  assert.ok(d.slide>0&&d.slide<.02);assert.ok(d.vy>0&&d.vy<d.fallSpeed*.02);
});
test('size-based release and wind can restart adhered drops without moving their position instantly',()=>{
  for(const wind of [0,1]){
    const p=fixture(),d=p.drop(400,100,wind?2:8);d.nextSpawn=99999;p.drops=[d];
    p.wind=p.windTarget=wind;p.rng=()=>0;p.step(1/60,0);
    assert.ok(d.flowing&&d.vy>0);assert.ok(d.y>100&&d.y<102);
  }
});
test('friction travel and stop state stay close at 30 and 60 Hz without negative velocity',()=>{
  const positions=[];
  for(const dt of [1/30,1/60]){
    const p=fixture(),d=p.drop(400,100,8,true);d.nextSpawn=99999;p.drops=[d];
    for(let i=0;i<3/dt&&d.flowing;i++){p.step(dt,0);assert.ok(d.vy>=0&&d.slide>=0&&d.slide<=1);}
    assert.equal(d.vy,0);positions.push(d.y);
  }
  assert.ok(Math.abs(positions[0]-positions[1])<1);
});
test('the adhesion hold lasts 0.5 to 1 second and expiration restarts without a random release',()=>{
  for(const phase of [0,.5,.99]){
    const p=fixture(),d=p.drop(600,100,8,true);d.pathPhase=phase;d.nextSpawn=99999;p.drops=[d];
    for(let i=0;i<180&&d.flowing;i++)p.step(1/60,0);
    assert.equal(d.flowing,false);assert.ok(d.restTime>=.5&&d.restTime<=1);
    const before=d.restTime;p.active=false;advance(p,.5);assert.equal(d.restTime,before);p.active=true;
    let ticks=0;while(!d.flowing&&ticks<65){p.step(1/60,0);ticks++;}
    assert.ok(d.flowing);assert.ok(ticks/60>=.5&&ticks/60<=1);
    assert.equal(d.restTime,0);
  }
});
