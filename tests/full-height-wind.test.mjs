import test from 'node:test';
import assert from 'node:assert/strict';
import {BeadField} from '../src/bead-field.js';
import {makeDrop} from '../src/physics.js';
import {surfaceContact,surfaceShape} from '../src/surface-contact.js';

const seeded=()=>{
  let value=94721;
  return ()=>{value=(value*1664525+1013904223)>>>0;return value/2**32;};
};
const populate=()=>{
  const field=new BeadField();
  for(let band=0;band<3;band++)for(let i=0;i<18;i++){
    field.add({x:20+i*27,y:20+band*300+i*10,r:2.5+i%4});
  }
  return field;
};

test('wind lifts visible beads from all three height bands in either direction',()=>{
  const a=populate(),b=populate();
  const left=a.takeWind(600,900,-1,9,seeded()),right=b.takeWind(600,900,1,9,seeded());
  assert.deepEqual(left,right);
  for(let band=0;band<3;band++)assert.equal(right.filter(bead=>Math.floor(bead.y/300)===band).length,3);
  assert.equal(a.count,45);assert.equal(b.count,45);
});

test('one-bead frame budgets cycle through the full height rather than favoring a band',()=>{
  const field=populate(),rng=seeded(),bands=[];
  for(let frame=0;frame<12;frame++){
    const [bead]=field.takeWind(600,900,1,1,rng);bands.push(Math.floor(bead.y/300));
  }
  for(let start=0;start<12;start+=3)assert.equal(new Set(bands.slice(start,start+3)).size,3);
});

test('wind promotion removes each bead once and terminates when bands are depleted',()=>{
  const field=new BeadField();
  const eligible=[{x:10,y:10,r:2.5},{x:500,y:30,r:5},{x:200,y:620,r:3}];
  eligible.forEach(bead=>field.add(bead));field.add({x:20,y:400,r:2});
  const first=field.takeWind(600,900,1,2,seeded());
  const last=field.takeWind(600,900,1,20,seeded());
  assert.equal(first.length,2);assert.equal(last.length,1);
  assert.equal(new Set([...first,...last]).size,3);
  assert.equal(field.count,1);
  assert.deepEqual(field.takeWind(600,900,1,20,seeded()),[]);
  for(const bead of eligible)assert.equal(field.take(bead.x,bead.y,1).length,0);
});

test('calm wind and invalid limits leave the field untouched; selection respects its cap',()=>{
  const field=populate(),before=field.count;
  for(const [wind,limit] of [[0,6],[NaN,6],[1,0],[1,-2],[1,Infinity]]){
    assert.deepEqual(field.takeWind(600,900,wind,limit,seeded()),[]);assert.equal(field.count,before);
  }
  assert.equal(field.takeWind(600,900,.1,2.9,seeded()).length,2);
  assert.equal(field.count,before-2);
  const capped=new BeadField();for(let i=0;i<12010;i++)capped.add({x:i%600,y:i%900,r:3});
  assert.equal(capped.count,12000);
  assert.equal(capped.takeWind(600,900,1,12010,seeded()).length,12000);
  assert.equal(capped.count,0);assert.equal(capped.cells.size,0);
});

test('resting newborn beads release sooner and identically across the pane under strong wind',()=>{
  for(const direction of [-1,1]){
    const drops=[makeDrop(20,20,6),makeDrop(300,450,6),makeDrop(580,880,6)];
    const frames=drops.map(drop=>{
      for(let frame=0;frame<180;frame++)if(surfaceContact(drop,1/60,direction,()=>1))return frame;
      return Infinity;
    });
    assert.ok(frames[0]<45);assert.equal(frames[0],frames[1]);assert.equal(frames[1],frames[2]);
  }
  const calm=makeDrop(20,20,6);
  for(let frame=0;frame<180;frame++)assert.equal(surfaceContact(calm,1/60,0,()=>1),false);
});

test('strong wind sustains sliding, then calm permits water to settle again',()=>{
  for(const radius of [4,10,20]){
    const drop=makeDrop(100,100,radius,true);
    for(let frame=0;frame<300;frame++)assert.equal(surfaceContact(drop,1/60,1,()=>.5),true);
    let stopped=false;
    for(let frame=0;frame<120;frame++)if(!surfaceContact(drop,1/60,0,()=>.5))stopped=true;
    assert.ok(stopped);
  }
});

test('rest acceleration is progressive and clamps excessive wind to the same maximum',()=>{
  const remaining=[0,.25,.5,1,10,-10].map(wind=>{
    const drop=makeDrop(100,100,6);drop.contact={phase:'rest',time:2};
    surfaceContact(drop,.1,wind,()=>1);return drop.contact.time;
  });
  assert.ok(remaining[0]>remaining[1]&&remaining[1]>remaining[2]&&remaining[2]>remaining[3]);
  assert.equal(remaining[3],remaining[4]);assert.equal(remaining[4],remaining[5]);
});

test('settling water retains its travel axis until it has slowed to adhesion',()=>{
  const drop=makeDrop(100,100,6,true);
  drop.contact={phase:'settle',time:.3};drop.vx=60;drop.vy=10;drop.rotation=-1;drop.stretch=.2;
  surfaceShape(drop,1/60);assert.equal(drop.rotation,-1);assert.ok(drop.stretch>.2);
  drop.vx=0;drop.vy=0;surfaceShape(drop,.5);
  assert.ok(Math.abs(drop.rotation)<.2);assert.ok(drop.stretch<.05);
});
