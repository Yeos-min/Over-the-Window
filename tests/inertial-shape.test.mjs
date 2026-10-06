import test from 'node:test';
import assert from 'node:assert/strict';
import {CodropsPhysics} from '../src/codrops-physics.js';
import {dropGeometry,followFlow} from '../src/drop-orientation.js';
import {newDropShape,followDropShape,pulseDrop} from '../src/drop-shape.js';
import {WaterMap} from '../src/raindrops.js';

const fixture=()=>{const p=new CodropsPhysics(2000,2000,()=>.99);p.drops=[];return p;};
test('runtime elongates moving drops, keeps deformation briefly after stopping, then relaxes to round',()=>{
  const p=fixture(),d=p.drop(600,100,12,true);d.nextSpawn=99999;p.drops=[d];
  for(let i=0;i<30;i++)p.step(1/60,0);
  const moving=dropGeometry(d);assert.ok(moving.sy/moving.sx>1.9);assert.ok(moving.sx<1);
  d.slide=0;p.setMassScale(p.massScale);const stopped=dropGeometry(d);
  assert.equal(stopped.shape,moving.shape);assert.ok(stopped.sy/stopped.sx>1.9);
  for(let i=0;i<90;i++)p.step(1/60,0);
  const settled=dropGeometry(d);assert.ok(settled.sy/settled.sx<1.1);assert.ok(settled.shape<.01);
});
test('merging adds a bounded squash/rebound pulse and microcontacts stay proportional',()=>{
  const p=fixture(),d=p.drop(600,100,12);p.absorb(d,p.drop(601,100,8));
  assert.ok(d.shape.pulseVelocity<0);followDropShape(d,1/60);
  assert.ok(d.shape.pulse<0);const pulse=d.shape.pulse;
  for(let i=0;i<120;i++)followDropShape(d,1/60);assert.ok(Math.abs(d.shape.pulse)<Math.abs(pulse)*.01);
  const fine=p.drop(100,100,12);p.absorbMicro(fine,[{x:101,y:100,r:1}]);
  assert.ok(Math.abs(fine.shape.pulseVelocity)<.04);
});
test('direction changes lag in the long axis and keep finite geometry during extreme inputs',()=>{
  const d={r:12,vx:240,vy:100,flowing:true,shape:newDropShape()};
  for(let i=0;i<60;i++){followFlow(d,1/60);followDropShape(d,1/60);}
  const angle=d.rotation;d.vx=-240;followFlow(d,1/60);followDropShape(d,1/60);
  assert.ok(d.rotation>angle&&d.rotation<0);
  for(let i=0;i<600;i++){
    d.vx=(i%2?1:-1)*10000;d.vy=10000;pulseDrop(d,1);followDropShape(d,1/30);
    const g=dropGeometry(d);assert.ok(Number.isFinite(g.sx+g.sy));assert.ok(g.sx>0&&g.sy>0&&g.sy/g.sx<4);
  }
});
test('the spring response matches at 30 and 60 Hz and paused physics freezes its state',()=>{
  const results=[];
  for(const dt of [1/30,1/60]){
    const d={r:12,vx:0,vy:150,flowing:true,shape:newDropShape()};pulseDrop(d,.5);
    for(let i=0;i<.5/dt;i++)followDropShape(d,dt);results.push(d.shape);
  }
  assert.ok(Math.abs(results[0].strain-results[1].strain)<1e-9);
  assert.ok(Math.abs(results[0].pulse-results[1].pulse)<1e-9);
  const p=fixture(),d=p.drop(100,100,8,true);p.drops=[d];p.active=false;
  const before=JSON.stringify(d.shape);p.step(1,0);assert.equal(JSON.stringify(d.shape),before);
});
test('both normal and Heartfelt rendering use the same rotated, deformed geometry',()=>{
  const calls=[],context=name=>({save(){},restore(){},clearRect(){},translate(...args){calls.push([name,'translate',...args]);},
    rotate(angle){calls.push([name,'rotate',angle]);},drawImage(...args){calls.push([name,'draw',...args]);}});
  const p=fixture(),d=p.drop(100,100,8,true);d.shape.strain=.8;d.rotation=-.6;d.spreadX=d.spreadY=0;
  const head={...d,x:300,heartfelt:{layer:1,free:true,next:{tail:0}}};
  const map=Object.assign(Object.create(WaterMap.prototype),{ctx:context('normal'),hctx:context('head'),
    canvas:{width:400,height:300},heightMap:{width:400,height:300},field:{flush(){},rain:{amount:.65}},
    droplets:'beads',heightSprites:Array.from({length:7},(_,i)=>`height${i}`),
    orientedSprite(index,angle,strength){calls.push(['profile',angle,strength]);return 'sprite';}});
  map.draw([d,head]);
  const normal=calls.find(c=>c[0]==='normal'&&c[1]==='draw'&&c[2]==='sprite');
  const moving=calls.find(c=>c[0]==='head'&&c[1]==='draw');
  assert.deepEqual(normal.slice(3),moving.slice(3));assert.ok(normal[6]/normal[5]>2);
  assert.ok(calls.some(c=>c[0]==='head'&&c[1]==='rotate'&&c[2]===-.6));
  assert.ok(calls.some(c=>c[0]==='profile'&&c[2]===.8));
});
