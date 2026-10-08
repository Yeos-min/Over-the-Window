import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedBackground} from '../src/shared-background.js';

function fixture({ready=true,...options}={}){
  const listeners=new Map(),trackListeners=new Map(),frames=new Map(),draws=[];
  const track={stops:0,addEventListener:(name,fn)=>trackListeners.set(name,fn),removeEventListener:name=>trackListeners.delete(name),stop(){this.stops++;}};
  const stream={getVideoTracks:()=>[track],getTracks:()=>[track]};
  const video={videoWidth:3840,videoHeight:2160,readyState:ready?2:0,
    addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),
    play:async()=>{},pause(){this.paused=true;},remove(){this.removed=true;},
    requestVideoFrameCallback:fn=>{frames.set(1,fn);return 1;},cancelVideoFrameCallback:id=>frames.delete(id)};
  const canvas={width:1,height:1,getContext:()=>({drawImage:(...args)=>draws.push(args)})};
  const source=new SharedBackground(stream,{createVideo:()=>video,createCanvas:()=>canvas,...options});
  return {source,video,canvas,draws,track,listeners,trackListeners,frame(){const fn=frames.get(1);frames.delete(1);fn();},frames};
}

test('live capture shares one bounded frame, paints only decoded changes at 30fps and freezes on pause',async()=>{
  const f=fixture();await f.source.load();
  assert.equal(f.video.muted,true);assert.equal(f.video.srcObject,f.source.stream);
  assert.deepEqual([f.canvas.width,f.canvas.height],[1920,1080]);assert.equal(f.draws.length,1);
  assert.equal(f.source.update(0),false);f.frame();assert.equal(f.source.update(34),true);
  f.frame();assert.equal(f.source.update(40),false);assert.equal(f.source.update(68),true);
  f.source.pause();f.frame();assert.equal(f.source.update(100),false);
  f.source.resume();assert.equal(f.source.update(1000),true);
  f.source.dispose();assert.equal(f.track.stops,1);assert.equal(f.video.srcObject,null);assert.equal(f.frames.size,0);
  f.source.dispose();assert.equal(f.track.stops,1);assert.equal(f.source.update(2000),false);
});

test('capture readiness failure and cancellation release timers and listeners',async()=>{
  const f=fixture({ready:false,timeout:5});
  await assert.rejects(f.source.load(),/캡처/);assert.equal(f.listeners.size,0);f.source.dispose();assert.equal(f.track.stops,1);
  const g=fixture({ready:false});const loading=g.source.load();g.source.dispose();
  await assert.rejects(loading,/캡처/);assert.equal(g.listeners.size,0);assert.equal(g.trackListeners.size,0);
});

test('capture ending during load rejects readiness and signals a single return to the normal background',async()=>{
  let ended=0;const f=fixture({ready:false,onEnded:()=>ended++});const loading=f.source.load();
  f.trackListeners.get('ended')();await assert.rejects(loading,/캡처/);assert.equal(ended,1);
  f.source.dispose();assert.equal(f.trackListeners.size,0);assert.equal(f.track.stops,1);
});
