import test from 'node:test';
import assert from 'node:assert/strict';
import {CodropsPhysics,MAX_RADIUS} from '../src/codrops-physics.js';
import {dropGeometry,dropTrailRadius} from '../src/drop-orientation.js';
import {WaterMap} from '../src/raindrops.js';
import {TrailMemory} from '../src/trail-memory.js';

function fixture(){
  const map=Object.assign(Object.create(WaterMap.prototype),{
    width:400,height:600,mask:{width:200,height:300},trailMemory:new TrailMemory(200,300),
    trailBeads:{sample:()=>[]}
  });
  const alpha=(x,y)=>map.trailMemory.coverage[Math.floor(y/2)*200+Math.floor(x/2)];
  return {map,alpha};
}

test('ordinary and Heartfelt finger merges clear their full growing width without a radius cap',()=>{
  for(const heartfelt of [false,true]){
    const p=new CodropsPhysics(400,600,()=>.99);p.drops=[];p.pathNoise=0;
    const d=p.drop(200,100,12);
    if(heartfelt)d.heartfelt={layer:1,free:true};
    p.drops=[d];
    const {map,alpha}=fixture();
    for(const r of [16,32]){
      p.gatherFinger(200,100,200,100,14,[{x:200,y:100,r}]);
      d.nextSpawn=Infinity;
      let radius;
      p.step(1/60,0,(...args)=>{radius=args[4];map.trail(...args);});
      assert.ok(radius>MAX_RADIUS);assert.equal(radius,d.r);
      assert.ok(alpha(200+d.r*.8,100)>0,'body edge must leave a cleared path');
      assert.equal(alpha(200+d.r*1.4,100),0,'dry glass beyond the body stays dry');
    }
  }
});

test('stretched and tilted bodies sweep the rendered width perpendicular to travel',()=>{
  const d={r:24,shape:{strain:1,pulse:0},rotation:0};
  const g=dropGeometry(d),vertical=dropTrailRadius(d,0,50);
  assert.ok(Math.abs(vertical-d.r*g.sx*.88)<1e-12);
  assert.ok(vertical<d.r);
  // Once the stretched body aligns with diagonal travel, its narrow axis is the width.
  d.rotation=-Math.PI/4;
  assert.ok(Math.abs(dropTrailRadius(d,50,50)-vertical)<1e-12);
  d.rotation=0;
  assert.ok(dropTrailRadius(d,50,0)>vertical*2);
  const {map,alpha}=fixture();map.trail(100,100,200,200,d.r,d);
  assert.ok(alpha(150-vertical*.7,150+vertical*.7)>0);
  assert.equal(alpha(100,200),0);
});

test('an accelerating body stamps its updated visual width instead of the previous round shape',()=>{
  for(const hz of [30,60,120])for(const heartfelt of [false,true]){
    const p=new CodropsPhysics(400,600,()=>.99);p.setRainIntensity(0);p.setPathNoise(0);
    const d=p.drop(200,100,24,true);d.nextSpawn=Infinity;p.drops=[d];
    d.spreadX=d.spreadY=0;
    if(heartfelt)d.heartfelt={layer:1,free:true};
    const {map}=fixture();let observed;
    p.step(1/hz,0,(...args)=>{map.trail(...args);observed=d.trailRadius;});
    assert.ok(d.shape.strain>0);assert.ok(observed<24);
    assert.equal(observed,dropTrailRadius(d,0,d.y-100));
  }
});

test('narrowing runoff tapers each new segment without clearing ahead or shrinking its past',()=>{
  const {map,alpha}=fixture(),d={r:20,rotation:0,shape:{strain:0,pulse:0}};
  map.trail(100,100,100,140,d.r,d);
  assert.ok(alpha(114,120)>0);assert.equal(alpha(100,150),0);
  d.shape.strain=1;
  map.trail(100,140,100,200,d.r,d);
  assert.ok(alpha(114,150)>0,'wide start connects to the previous width');
  assert.equal(alpha(114,194),0,'new narrow end must not retain a broad cap');
  assert.ok(alpha(108,194)>0);assert.equal(alpha(100,210),0,'no clearing ahead of the head');
  assert.ok(alpha(114,120)>0,'historical width is preserved');
  for(let y=102;y<200;y+=2)assert.ok(alpha(100,y)>0,'adjacent segments stay connected');
  d.shape.strain=0;map.trail(100,200,100,260,d.r,d);
  assert.equal(alpha(116,206),0);assert.ok(alpha(116,252)>0,'relaxing body widens its later trail');
});

test('a turned elongated body uses its central section rather than the full silhouette projection',()=>{
  const d={r:24,rotation:0,shape:{strain:1,pulse:0}},g=dropGeometry(d);
  const section=dropTrailRadius(d,50,50),bounds=d.r*Math.hypot(g.sx/Math.SQRT2,g.sy/Math.SQRT2);
  assert.ok(section<bounds*.75);assert.ok(section>dropTrailRadius(d,0,50));
});

test('small paths scale with their body, remain continuous and retain fog recovery',()=>{
  const {map,alpha}=fixture();
  map.trail(100,100,100,300,4);
  assert.ok(alpha(102,200)>0);assert.equal(alpha(108,200),0);
  for(let y=100;y<=300;y+=2)assert.ok(alpha(100,y)>0);
  map.trailMemory.advance(2);
  const pixels=new Uint8ClampedArray(200*300*4);map.trailMemory.render(pixels);
  assert.equal(pixels[(100*200+50)*4+3],128);
  map.trailMemory.advance(.5);map.trailMemory.render(pixels);
  assert.equal(pixels[(100*200+50)*4+3],0);
});
