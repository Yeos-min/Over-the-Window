import test from 'node:test';
import assert from 'node:assert/strict';
import {ScreenShare} from '../src/screen-share.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture({choice,loading,error,noVideo=false}={}){
  const states=[],connected=[],stopped=[];let requests=0,ended;
  const track={readyState:'live',stops:0,stop(){this.stops++;}},stream={getTracks:()=>[track],getVideoTracks:()=>noVideo?[]:[track]};
  const source={disposed:false,load:()=>loading?.promise??Promise.resolve(),dispose(){this.disposed=true;track.stop();loading?.reject(new Error('disposed'));}};
  const share=new ScreenShare({getMedia:options=>{requests++;assert.equal(options.audio,false);assert.equal(options.selfBrowserSurface,'exclude');
    if(error)return Promise.reject(error);return choice?.promise??Promise.resolve(stream);},
    createBackground:(received,onEnded)=>{assert.equal(received,stream);ended=onEnded;return source;},
    onConnected:value=>connected.push(value),onStopped:()=>stopped.push(true),onState:(state,message)=>states.push({state,message})});
  return {share,track,stream,source,states,connected,stopped,end:()=>ended(),get requests(){return requests;}};
}

test('capture chooser starts synchronously from the click, commits only a decoded frame and releases on stop',async()=>{
  const loading=deferred(),f=fixture({loading});const start=f.share.start();
  assert.equal(f.requests,1);assert.equal(f.share.state,'requesting');
  await flush();assert.equal(f.share.state,'loading');assert.equal(f.connected.length,0);
  await f.share.start();assert.equal(f.requests,1);
  loading.resolve();await start;assert.equal(f.share.state,'active');assert.equal(f.connected[0],f.source);
  f.share.stop();assert.equal(f.source.disposed,true);assert.equal(f.track.stops,1);assert.equal(f.stopped.length,1);
  f.share.stop();assert.equal(f.track.stops,1);assert.equal(f.stopped.length,1);
});

test('cancelled or denied choices retain the current background without producing an application error',async()=>{
  for(const name of ['NotAllowedError','AbortError']){
    const error=Object.assign(new Error('cancelled'),{name}),f=fixture({error});await f.share.start();
    assert.equal(f.share.state,'idle');assert.equal(f.connected.length,0);assert.equal(f.stopped.length,0);
    assert.match(f.states.at(-1).message,/기존 배경/);assert.equal(f.share.pending,false);
  }
});

test('late chooser results after cancellation are stopped and cannot replace a newer connection',async()=>{
  const choice=deferred(),f=fixture({choice});const first=f.share.start();f.share.stop();
  choice.resolve(f.stream);await first;
  assert.equal(f.track.stops,1);assert.equal(f.connected.length,0);assert.equal(f.share.source,null);
  await f.share.start();assert.equal(f.connected.length,1);assert.equal(f.share.state,'active');f.share.stop();
});

test('cancellation during decoding and a browser Stop Sharing event release the source and restore once',async()=>{
  const loading=deferred(),f=fixture({loading});const start=f.share.start();await flush();f.share.stop();await start;
  assert.equal(f.connected.length,0);assert.equal(f.track.stops,1);assert.equal(f.share.state,'idle');
  const g=fixture();await g.share.start();g.end();g.end();
  assert.equal(g.stopped.length,1);assert.equal(g.track.stops,1);assert.equal(g.share.active,false);
});

test('missing video and decoder failure release tracks and keep the original background',async()=>{
  const f=fixture({noVideo:true});await f.share.start();assert.equal(f.share.state,'error');assert.equal(f.track.stops,1);
  assert.equal(f.connected.length,0);assert.equal(f.stopped.length,0);
  const loading=deferred(),g=fixture({loading});const start=g.share.start();await flush();loading.reject(new Error('decode'));await start;
  assert.equal(g.share.state,'error');assert.equal(g.track.stops,1);assert.equal(g.stopped.length,0);
});

test('unsupported browsers keep a readable state and never ask for media',async()=>{
  const states=[],share=new ScreenShare({getMedia:null,onState:state=>states.push(state)});
  await share.start();share.stop();assert.deepEqual(states,['unsupported']);assert.equal(share.active,false);
});
