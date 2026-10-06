import test from 'node:test';
import assert from 'node:assert/strict';
import {glassBead,glassBeadTarget,seedGlassBeads,GLASS_BEAD_LIMIT} from '../src/glass-beads.js';
import {WaterMap} from '../src/raindrops.js';
import {BeadField} from '../src/bead-field.js';

const seeded=()=>{
  let state=793;
  return ()=>{state=(state*1664525+1013904223)>>>0;return state/2**32;};
};
const sequence=values=>{let index=0;return ()=>values[index++];};
const fakeMap=(width,height)=>{
  const calls={draw:[],erase:[],clear:[],maskClear:[],fills:[],trailClear:0},stack=[];
  const dctx={
    globalCompositeOperation:'source-over',
    drawImage(...args){calls.draw.push(args);},
    clearRect(...args){calls.clear.push(args);},
    save(){stack.push(this.globalCompositeOperation);},
    restore(){this.globalCompositeOperation=stack.pop();},
    beginPath(){},ellipse(...args){calls.erase.push(args);},
    fill(){calls.fills.push(this.globalCompositeOperation);}
  };
  const map=Object.assign(Object.create(WaterMap.prototype),{
    width,height,dctx,rctx:{clearRect(){},save(){},restore(){}},droplets:{width,height},sprites:[{}],beads:new BeadField(),
    mask:{width:width/2,height:height/2},mctx:{clearRect(...args){calls.maskClear.push(args);}},
    trailMemory:{clear(){calls.trailClear++;}}
  });
  return {map,calls};
};

test('wet-glass texture is mostly small round beads while retaining wind-eligible water',()=>{
  const beads=seedGlassBeads(1200,800,seeded()),fine=beads.filter(bead=>bead.r<=2),large=beads.filter(bead=>bead.r>=2.5);
  assert.ok(fine.length>beads.length*.9&&fine.length<beads.length*.94);
  assert.ok(large.length>beads.length*.06&&large.length<beads.length*.1);
  assert.equal(fine.length+large.length,beads.length);
  assert.ok(fine.every(bead=>bead.r>=.8&&bead.aspect>=.95&&bead.aspect<=1.2));
  assert.ok(large.every(bead=>bead.r<=4.5&&bead.aspect===1.5));
  const field=new BeadField(GLASS_BEAD_LIMIT);beads.forEach(bead=>field.add(bead));
  const released=field.takeWind(1200,800,1,9,seeded());
  assert.equal(released.length,9);assert.ok(released.every(bead=>bead.r>=2.5));
  for(let band=0;band<3;band++)assert.equal(released.filter(bead=>Math.floor(bead.y/800*3)===band).length,3);
});

test('fine and larger bead generation obeys its visual size boundaries',()=>{
  const smallest=glassBead(100,100,sequence([0,0,0]),30,40);
  assert.deepEqual(smallest,{x:30,y:40,r:.8,aspect:.95});
  const widest=glassBead(100,100,sequence([0,1,1]),30,40);
  assert.equal(widest.r,2);assert.equal(widest.aspect,1.2);
  const larger=glassBead(100,100,sequence([1,0]),30,40);
  const largest=glassBead(100,100,sequence([1,1]),30,40);
  assert.equal(larger.r,2.5);assert.equal(largest.r,4.5);
  assert.equal(larger.aspect,1.5);assert.equal(largest.aspect,1.5);
});

test('only the fine adhered population is doubled, including formerly capped screens',()=>{
  for(const [width,height] of [[1200,800],[1920,1080],[3200,1800]]){
    const former=Math.min(12000,Math.ceil(width*height/150));
    const beads=seedGlassBeads(width,height,seeded());
    const fine=beads.filter(b=>b.r<=2).length,large=beads.length-fine;
    assert.equal(beads.length,Math.round(former*1.85));
    assert.ok(fine/(former*.85)>1.95&&fine/(former*.85)<2.05);
    assert.ok(large/(former*.15)>.9&&large/(former*.15)<1.1);
  }
});

test('stratified texture covers every height and horizontal region on desktop and portrait',()=>{
  for(const [width,height] of [[1200,800],[390,844]]){
    const beads=seedGlassBeads(width,height,seeded()),regions=Array(18).fill(0);
    for(const bead of beads){
      assert.ok(bead.x>0&&bead.x<width&&bead.y>0&&bead.y<height);
      regions[Math.floor(bead.y/height*3)*6+Math.floor(bead.x/width*6)]++;
    }
    const average=beads.length/regions.length;
    assert.ok(regions.every(count=>count>average*.8&&count<average*1.2));
  }
});

test('target is area-based and bounded, including repeated seed and reset',()=>{
  assert.equal(glassBeadTarget(300,200),740);
  assert.equal(glassBeadTarget(10000,10000),22200);
  assert.equal(glassBeadTarget(0,800),0);assert.equal(glassBeadTarget(-20,800),0);
  assert.deepEqual(seedGlassBeads(0,800,seeded()),[]);
  for(const [width,height] of [[400,300],[2000,1500]]){
    const {map,calls}=fakeMap(width,height),target=glassBeadTarget(width,height);
    map.seed();assert.equal(map.beads.count,target);assert.equal(calls.draw.length,target);
    map.counter=123;map.fadeTime=2;
    const firstField=map.beads;map.clear();
    assert.notEqual(map.beads,firstField);assert.equal(map.beads.count,target);
    assert.equal(calls.draw.length,target*2);assert.equal(calls.clear.length,2);
    assert.equal(map.counter,0);assert.equal(map.fadeTime,0);assert.equal(calls.trailClear,1);
    assert.equal(calls.maskClear.length,1);
  }
});

test('condensation stops at target and refills absorbed space without a delayed burst',()=>{
  const {map,calls}=fakeMap(400,300);map.seed();
  const target=map.beads.count,drawn=calls.draw.length;
  map.counter=1000;map.condense(10000);
  assert.equal(map.beads.count,target);assert.equal(calls.draw.length,drawn);assert.equal(map.counter,0);
  const first=map.beads.cells.values().next().value[0];
  const absorbed=map.absorb(first.x,first.y,1);assert.ok(absorbed.length>=1);
  const remaining=map.beads.count;assert.equal(remaining,target-absorbed.length);
  map.condense(.001);
  assert.equal(map.beads.count,remaining);assert.equal(calls.draw.length,drawn);
  assert.ok(map.counter>0&&map.counter<1);
  map.condense(100);
  assert.equal(map.beads.count,target);assert.equal(calls.draw.length,drawn+absorbed.length);assert.equal(map.counter,0);
  for(let frame=0;frame<100;frame++)map.condense(1);
  assert.equal(map.beads.count,target);assert.equal(calls.draw.length,drawn+absorbed.length);assert.equal(map.counter,0);
});

test('sprite drawing and erasure use each bead aspect and erase absorbed beads once',()=>{
  const {map,calls}=fakeMap(100,100);
  const fine={x:20,y:20,r:1,aspect:1.1},large={x:80,y:80,r:3,aspect:1.5};
  map.drawBead(fine);map.drawBead(large);
  assert.deepEqual(calls.draw[0].slice(1),[19,18.9,2,2.2]);
  assert.deepEqual(calls.draw[1].slice(1),[77,75.5,6,9]);
  assert.deepEqual(map.absorb(20,20,1),[fine]);
  assert.equal(map.beads.count,1);
  assert.deepEqual(calls.erase[0],[20,20,2,2.1,0,0,Math.PI*2]);
  assert.deepEqual(map.absorb(20,20,1),[]);assert.equal(calls.erase.length,1);
  map.eraseBeads([large]);assert.deepEqual(calls.erase[1],[80,80,4,5.5,0,0,Math.PI*2]);
  assert.ok(calls.fills.every(mode=>mode==='destination-out'));
  assert.equal(map.dctx.globalCompositeOperation,'source-over');
});
