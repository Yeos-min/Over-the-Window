import test from 'node:test';
import assert from 'node:assert/strict';
import {initFingerDrawing} from '../src/finger-drawing.js';
import {Parallax} from '../src/parallax.js';
import {WaterMap} from '../src/raindrops.js';
import {TrailMemory} from '../src/trail-memory.js';

function fixture(){
  const handlers={},windowHandlers={},capture=new Set(),strokes=[];
  const rect={left:100,top:50,width:200,height:120},parallax=new Parallax();
  let enabled=true;
  const canvas={
    classList:{add(){},remove(){}},
    ownerDocument:{defaultView:{addEventListener:(type,fn)=>windowHandlers[type]=fn}},
    addEventListener:(type,fn)=>handlers[type]=fn,getBoundingClientRect:()=>rect,
    setPointerCapture:id=>capture.add(id),hasPointerCapture:id=>capture.has(id),releasePointerCapture:id=>capture.delete(id)
  };
  const drawing=initFingerDrawing(canvas,{enabled:()=>enabled,project:(...args)=>parallax.unproject(...args),onStroke:(...args)=>strokes.push(args)});
  const send=(type,props={})=>handlers[type]({pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:1,clientX:120,clientY:70,preventDefault(){},...props});
  return {drawing,send,strokes,capture,parallax,rect,windowHandlers,setEnabled:value=>enabled=value};
}

test('hover and secondary input never wipe; a pressed stroke connects sparse pointer samples',()=>{
  const f=fixture();f.send('pointermove');f.send('pointerdown',{button:2});f.send('pointerdown',{isPrimary:false});
  assert.equal(f.strokes.length,0);assert.equal(f.drawing.drawing,false);
  f.send('pointerdown');assert.equal(f.drawing.drawing,true);assert.ok(f.capture.has(1));
  f.send('pointermove',{clientX:260,clientY:130});
  assert.deepEqual(f.strokes[1].slice(0,2),f.strokes[0].slice(2,4));
  f.send('pointerup',{clientX:280,clientY:140});
  assert.equal(f.drawing.drawing,false);assert.equal(f.capture.size,0);
  const count=f.strokes.length;f.send('pointermove');assert.equal(f.strokes.length,count);
});

test('touch and pen work with one captured pointer, including coalesced intermediate positions',()=>{
  for(const pointerType of ['touch','pen']){
    const f=fixture();f.send('pointerdown',{pointerType});
    f.send('pointerdown',{pointerId:2,pointerType});f.send('pointermove',{pointerId:2,pointerType});
    assert.equal(f.strokes.length,1);
    f.send('pointermove',{pointerType,clientX:200,clientY:100,getCoalescedEvents:()=>[
      {clientX:140,clientY:80},{clientX:170,clientY:90}
    ]});
    assert.equal(f.strokes.length,4);
    for(let i=1;i<f.strokes.length;i++)assert.deepEqual(f.strokes[i].slice(0,2),f.strokes[i-1].slice(2,4));
    f.send('pointerup',{pointerType});assert.equal(f.capture.size,0);
  }
});

test('cancellation, lost capture, window blur and disabled glass cannot bridge separate strokes',()=>{
  for(const reason of ['pointercancel','lostpointercapture','blur','disabled','buttons']){
    const f=fixture();f.send('pointerdown');
    if(reason==='blur')f.windowHandlers.blur();
    else if(reason==='disabled'){f.setEnabled(false);f.send('pointermove');}
    else if(reason==='buttons')f.send('pointermove',{buttons:0});
    else f.send(reason);
    assert.equal(f.drawing.drawing,false);assert.equal(f.capture.size,0);
    f.setEnabled(true);f.send('pointerdown',{clientX:250,clientY:100});
    assert.deepEqual(f.strokes.at(-1).slice(0,2),f.strokes.at(-1).slice(2,4));
  }
});

test('screen coordinates and finger width invert the rendered glass scale and parallax exactly',()=>{
  const f=fixture();f.parallax.x=.8;f.parallax.y=-.6;
  const projected=f.parallax.project(60,40,f.rect.width,f.rect.height);
  f.send('pointerdown',{clientX:projected.x+f.rect.left,clientY:projected.y+f.rect.top});
  const [x,y,,,radius]=f.strokes[0];
  assert.ok(Math.abs(x-60)<1e-12&&Math.abs(y-40)<1e-12);
  assert.ok(Math.abs(radius*f.parallax.glassScale-14)<1e-12);
  f.drawing.cancel();f.rect.width=400;f.rect.height=240;
  f.send('pointerdown',{clientX:300,clientY:170});
  const p=f.parallax.project(...f.strokes.at(-1).slice(2,4),400,240);
  assert.ok(Math.abs(p.x-200)<1e-12&&Math.abs(p.y-120)<1e-12);
});

function maskFixture(){
  const map=Object.create(WaterMap.prototype),width=100,height=60,uploads=[];
  Object.assign(map,{width:200,height:120,mask:{width,height},trailMemory:new TrailMemory(width,height),
    maskPixels:{data:new Uint8ClampedArray(width*height*4)},mctx:{putImageData:(...args)=>uploads.push(args)},
    field:{flush(){}},dirty:false,maskRevision:0});
  const alpha=(x,y)=>map.maskPixels.data[(y*width+x)*4+3];
  return {map,uploads,alpha};
}

test('finger strokes flush once per paint, form a continuous clear line and recover on the existing fog timeline',()=>{
  const {map,uploads,alpha}=maskFixture();
  for(let x=20;x<160;x+=10)map.wipe(x,60,x+10,60,14);
  assert.equal(uploads.length,0);map.draw([]);assert.equal(uploads.length,1);assert.equal(map.maskRevision,1);
  for(let x=10;x<=85;x++)assert.equal(alpha(x,30),255);
  assert.equal(alpha(50,10),0);
  map.draw([]);assert.equal(uploads.length,1);
  map.decay(1.5);assert.equal(alpha(50,30),255);
  map.decay(.5);assert.equal(alpha(50,30),128);
  map.decay(.5);assert.equal(alpha(50,30),0);
});

test('drawing while time is frozen still paints, revisiting renews only touched fog and keeps rain trails',()=>{
  const {map,alpha}=maskFixture();map.trail(20,30,160,30,8);
  map.wipe(20,80,160,80,14);map.draw([]);
  map.decay(0);assert.equal(alpha(50,40),255);
  map.decay(2);map.wipe(80,80,120,80,14);map.draw([]);
  assert.equal(alpha(50,40),255);assert.equal(alpha(15,40),128);assert.equal(alpha(50,15),128);
  map.decay(.5);assert.equal(alpha(50,40),255);assert.equal(alpha(15,40),0);assert.equal(alpha(50,15),0);
  map.trailMemory.clear();map.maskDirty=true;map.draw([]);assert.equal(alpha(50,40),0);
});
