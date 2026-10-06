import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,openSync,readSync,closeSync,statSync} from 'node:fs';
import {VideoBackground} from '../src/video-background.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} should equal ${expected}`);
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

function fakeVideo(options={}){
  const listeners=new Map(),attributes=new Map(),frameCallbacks=new Map();let nextFrame=1,currentTime=0;
  const video={
    duration:options.duration??15,videoWidth:options.width??1920,videoHeight:options.height??1080,
    readyState:0,HAVE_CURRENT_DATA:2,seeking:false,ended:false,paused:true,src:'',error:null,
    playCalls:0,pauseCalls:0,loadCalls:0,seekWrites:[],frameCancels:[],listeners,attributes,frameCallbacks,
    playError:options.playError??null,playPromise:null,
    get currentTime(){return currentTime;},
    set currentTime(value){currentTime=value;video.seekWrites.push(value);if(value<video.duration)video.ended=false;},
    setAttribute(name,value){attributes.set(name,value);},
    removeAttribute(name){attributes.delete(name);if(name==='src')video.src='';},
    addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},
    removeEventListener(type,listener){listeners.get(type)?.delete(listener);},
    emit(type){for(const listener of [...(listeners.get(type)??[])])listener({type,target:video});},
    load(){
      video.loadCalls++;
      if(video.src&&options.autoLoad!==false){video.readyState=options.readyState??2;video.emit('loadedmetadata');video.emit('loadeddata');}
    },
    play(){
      video.playCalls++;
      if(video.playError){video.paused=true;return Promise.reject(video.playError);}
      video.paused=false;return video.playPromise??Promise.resolve();
    },
    pause(){video.pauseCalls++;video.paused=true;},
    finishSeek(){video.seeking=false;video.emit('seeked');}
  };
  if(options.videoFrames){
    video.requestVideoFrameCallback=callback=>{const id=nextFrame++;frameCallbacks.set(id,callback);return id;};
    video.cancelVideoFrameCallback=id=>{video.frameCancels.push(id);frameCallbacks.delete(id);};
    video.frame=()=>{
      const [id,callback]=frameCallbacks.entries().next().value??[];
      assert.ok(callback,'A decoded-frame callback must be scheduled');frameCallbacks.delete(id);callback(0,{mediaTime:currentTime});
    };
  }
  return video;
}

function fixture(options={}){
  const videos=[],draws=[],states=[];let canvasCount=0;
  const context={
    globalAlpha:1,failNext:false,clears:0,
    drawImage(source,...args){
      if(context.failNext){context.failNext=false;throw new Error('Frame temporarily unavailable');}
      canvas.painted=true;
      draws.push({source,time:source.currentTime,alpha:context.globalAlpha,args});
    },
    clearRect(){context.clears++;canvas.painted=false;}
  };
  let width=0,height=0;
  const canvas={
    painted:false,resizes:0,
    get width(){return width;},set width(value){width=value;canvas.painted=false;canvas.resizes++;},
    get height(){return height;},set height(value){height=value;canvas.painted=false;canvas.resizes++;},
    getContext(type,settings){assert.equal(type,'2d');assert.equal(settings.alpha,false);return context;}
  };
  const source=new VideoBackground('./assets/test-rain.mp4',{
    createVideo(){const video=fakeVideo({...options.video,...options.videos?.[videos.length]});videos.push(video);return video;},
    createCanvas(){canvasCount++;return canvas;},
    ...options.source,
    onStateChange(state,error){states.push({state,error});return options.onStateChange?.(state,error);}
  });
  return {source,videos,canvas,context,draws,states,get canvasCount(){return canvasCount;}};
}

test('video background owns exactly two silent inline decoders and one reusable opaque compositor',()=>{
  const f=fixture();
  try{
    assert.equal(f.videos.length,2);assert.equal(f.canvasCount,1);assert.equal(f.source.canvas,f.canvas);
    assert.equal(f.source.state,'loading');
    for(const video of f.videos){
      assert.equal(video.muted,true);assert.equal(video.defaultMuted,true);assert.equal(video.volume,0);
      assert.equal(video.playsInline,true);assert.equal(video.preload,'auto');assert.equal(video.loop,false);
      assert.equal(video.autoplay,false);assert.ok(video.attributes.has('muted'));assert.ok(video.attributes.has('playsinline'));
    }
  }finally{f.source.dispose();}
});

test('load paints the first decoded frame before exposing a bounded aspect-preserving canvas',async()=>{
  for(const [width,height,expected] of [[1920,1080,[1280,720]],[1080,1920,[720,1280]],[640,360,[640,360]]]){
    const f=fixture({video:{width,height}});
    try{
      assert.equal(await f.source.load(),f.source);assert.equal(f.source.state,'playing');
      assert.deepEqual([f.source.width,f.source.height],expected);
      assert.equal(f.canvas.painted,true,'Canvas dimension assignments must not clear the promised first frame');
      assert.ok(f.draws.length>0);assert.equal(f.draws[0].source,f.videos[0]);assert.equal(f.draws[0].alpha,1);
      assert.deepEqual(f.draws[0].args,[0,0,...expected]);
      assert.equal(f.videos[0].src,f.videos[1].src);assert.equal(f.videos[0].playCalls,1);assert.equal(f.videos[1].playCalls,0);
      f.source.update(0);const before=f.draws.length;assert.equal(f.source.update(40),false);assert.equal(f.draws.length,before);
      assert.equal(await f.source.load(),f.source);assert.equal(f.videos[0].loadCalls,1);assert.equal(f.canvasCount,1);
    }finally{f.source.dispose();}
  }
});

test('repeated metadata and readiness events for the same decoded pixels cannot clear the canvas or trigger duplicate uploads',async()=>{
  const f=fixture();
  try{
    await f.source.load();assert.equal(f.canvas.painted,true);const resizes=f.canvas.resizes,draws=f.draws.length;
    assert.equal(f.source.update(0),false);
    for(const event of ['loadedmetadata','loadeddata','canplay']){
      f.videos[0].emit(event);assert.equal(f.canvas.painted,true);assert.equal(f.source.update(40),false);
    }
    assert.equal(f.canvas.resizes,resizes);assert.equal(f.draws.length,draws);
    f.videos[0].currentTime=.1;f.videos[0].emit('loadeddata');assert.equal(f.source.update(80),true);
    assert.equal(f.draws.length,draws+1);
  }finally{f.source.dispose();}
});

test('loading waits for decoded pixels rather than resolving on metadata alone',async()=>{
  const f=fixture({video:{autoLoad:false}});let resolved=false;
  const loading=f.source.load().then(value=>{resolved=true;return value;});
  try{
    f.videos[0].readyState=1;f.videos[0].emit('loadedmetadata');await flush();
    assert.equal(resolved,false);assert.equal(f.draws.length,0);assert.equal(f.source.update(0),false);
    f.videos[0].readyState=2;f.videos[0].emit('loadeddata');await loading;
    assert.equal(resolved,true);assert.equal(f.draws[0].source,f.videos[0]);
  }finally{f.source.dispose();}
});

test('pause while loading still exposes a painted first frame without starting either decoder',async()=>{
  const f=fixture({video:{autoLoad:false}}),loading=f.source.load();
  try{
    f.source.pause();f.videos[0].readyState=2;f.videos[0].emit('loadedmetadata');f.videos[0].emit('loadeddata');
    await loading;assert.equal(f.source.state,'paused');assert.ok(f.draws.length>0);
    assert.ok(f.videos.every(video=>video.playCalls===0));assert.equal(f.source.update(0),false);
    assert.equal(await f.source.resume(),true);assert.equal(f.videos[0].playCalls,1);
  }finally{f.source.dispose();}
});

test('invalid duration and missing decoded data fail loading without leaving a timer or playing decoder',async()=>{
  for(const duration of [0,-1,NaN,Infinity]){
    const f=fixture({video:{duration}});
    try{await assert.rejects(f.source.load(),/재생 길이/);assert.equal(f.source.state,'error');assert.ok(f.videos.every(video=>video.paused));}
    finally{f.source.dispose();}
  }
  const f=fixture({video:{autoLoad:false},source:{loadTimeout:1}});
  try{await assert.rejects(f.source.load(),/초과/);assert.equal(f.source.state,'error');}
  finally{f.source.dispose();}
});

test('autoplay rejection retains a first frame in blocked state and gesture retry recovers without reloading',async()=>{
  const denied=new Error('Autoplay denied'),f=fixture({videos:[{playError:denied},{}]});
  try{
    await f.source.load();assert.equal(f.source.state,'blocked');assert.equal(f.source.error,denied);assert.equal(f.draws.length,1);
    f.source.update(0);assert.equal(f.source.update(40),false);f.videos[0].playError=null;
    assert.equal(await f.source.retry(),true);assert.equal(f.source.state,'playing');assert.equal(f.source.error,null);
    assert.equal(f.videos[0].loadCalls,1);assert.equal(f.videos[0].playCalls,2);assert.equal(f.canvasCount,1);
  }finally{f.source.dispose();}
});

test('changed frames are capped at video fps, unchanged media and invalid timestamps do not redraw',async()=>{
  const f=fixture();
  try{
    await f.source.load();f.source.update(0);const before=f.draws.length;
    assert.equal(f.source.update(NaN),false);assert.equal(f.source.update(Infinity),false);
    assert.equal(f.source.update(40),false);
    f.videos[0].currentTime=.03;assert.equal(f.source.update(40),true);
    f.videos[0].currentTime=.06;assert.equal(f.source.update(56),false);assert.equal(f.source.update(74),true);
    assert.equal(f.source.update(1000),false);assert.equal(f.draws.length,before+2);
    assert.equal(f.canvasCount,1);assert.equal(f.context.clears,0);assert.equal(f.context.globalAlpha,1);
  }finally{f.source.dispose();}
});

test('tail overlaps the real incoming media time with a smooth fade, then swaps without rewinding the incoming head',async()=>{
  const f=fixture(),[outgoing,incoming]=f.videos;
  try{
    await f.source.load();outgoing.currentTime=13.9;assert.equal(f.source.update(0),true);assert.equal(incoming.playCalls,0);
    outgoing.currentTime=14;assert.equal(f.source.update(40),true);await flush();assert.equal(incoming.playCalls,1);
    for(const [head,tail,time,alpha] of [[.25,14.25,80,.15625],[.5,14.5,120,.5],[.75,14.75,160,.84375]]){
      incoming.currentTime=head;outgoing.currentTime=tail;const start=f.draws.length;
      assert.equal(f.source.update(time),true);const frame=f.draws.slice(start);
      assert.equal(frame.length,2);assert.equal(frame[0].source,outgoing);assert.equal(frame[0].alpha,1);
      assert.equal(frame[1].source,incoming);near(frame[1].alpha,alpha);assert.equal(f.context.globalAlpha,1);
    }
    outgoing.currentTime=15;assert.equal(f.source.update(5000),true);
    near(f.draws.at(-1).alpha,.84375);
    incoming.currentTime=1;assert.equal(f.source.update(5040),true);
    assert.equal(outgoing.currentTime,0);assert.equal(outgoing.paused,true);assert.equal(incoming.currentTime,1);
    incoming.currentTime=1.1;const start=f.draws.length;assert.equal(f.source.update(5080),true);
    assert.equal(f.draws.length,start+1);assert.equal(f.draws.at(-1).source,incoming);assert.equal(f.draws.at(-1).alpha,1);
    assert.equal(f.canvasCount,1);assert.equal(f.context.clears,0);
  }finally{f.source.dispose();}
});

test('rewound spare cannot play or contribute stale tail pixels until seeked confirms its new head',async()=>{
  const f=fixture(),[old,next]=f.videos;
  try{
    await f.source.load();old.currentTime=14;f.source.update(0);await flush();
    old.currentTime=15;next.currentTime=1;f.source.update(40);
    assert.equal(old.currentTime,0);const priorPlay=old.playCalls;
    next.currentTime=14;const start=f.draws.length;assert.equal(f.source.update(80),true);
    assert.equal(old.playCalls,priorPlay);assert.ok(f.draws.slice(start).every(draw=>draw.source===next));
    old.finishSeek();assert.equal(f.source.update(120),true);await flush();assert.equal(old.playCalls,priorPlay+1);
    old.currentTime=.5;next.currentTime=14.5;f.source.update(160);
    assert.equal(f.draws.at(-1).source,old);near(f.draws.at(-1).alpha,.5);
  }finally{f.source.dispose();}
});

test('a fully ready incoming head can complete the overlap when the outgoing decoder temporarily has no frame',async()=>{
  const f=fixture(),[old,next]=f.videos;
  try{
    await f.source.load();old.currentTime=14;f.source.update(0);await flush();
    old.currentTime=15;old.readyState=1;next.currentTime=1;
    assert.equal(f.source.update(40),true);assert.equal(f.draws.at(-1).source,next);assert.equal(f.draws.at(-1).alpha,1);
    assert.equal(old.currentTime,0);next.currentTime=1.1;assert.equal(f.source.update(80),true);
    assert.equal(f.draws.at(-1).source,next);
  }finally{f.source.dispose();}
});

test('buffering incoming pixels hold the last complete blend instead of jumping back to the outgoing image',async()=>{
  const f=fixture(),[old,next]=f.videos;
  try{
    await f.source.load();old.currentTime=14;f.source.update(0);await flush();
    old.currentTime=14.5;next.currentTime=.5;f.source.update(40);near(f.draws.at(-1).alpha,.5);
    const before=f.draws.length;next.readyState=1;old.currentTime=14.6;next.currentTime=.6;
    assert.equal(f.source.update(80),false);assert.equal(f.draws.length,before);assert.equal(f.context.clears,0);
    next.readyState=2;next.emit('canplay');assert.equal(f.source.update(120),true);near(f.draws.at(-1).alpha,.648);
  }finally{f.source.dispose();}
});

test('pause freezes a partial overlap and resume preserves both media times and the composite canvas',async()=>{
  const f=fixture(),[old,next]=f.videos;
  try{
    await f.source.load();old.currentTime=14;f.source.update(0);await flush();
    old.currentTime=14.5;next.currentTime=.5;f.source.update(40);const last=f.draws.length;
    f.source.pause();assert.equal(f.source.state,'paused');assert.ok(f.videos.every(video=>video.paused));
    assert.equal(f.source.update(100000),false);assert.equal(f.draws.length,last);
    assert.equal(await f.source.resume(),true);assert.equal(f.source.state,'playing');
    assert.deepEqual(f.videos.map(video=>video.currentTime),[14.5,.5]);assert.equal(f.source.canvas,f.canvas);
    old.currentTime=14.6;next.currentTime=.6;assert.equal(f.source.update(100040),true);
    near(f.draws.at(-1).alpha,.648);
  }finally{f.source.dispose();}
});

test('retry after a blocked incoming play does not restart the outgoing end frame at zero',async()=>{
  const f=fixture({videos:[{}, {playError:new Error('Incoming autoplay denied')}]});const [old,next]=f.videos;
  try{
    await f.source.load();old.currentTime=14;f.source.update(0);await flush();assert.equal(f.source.state,'blocked');
    old.currentTime=15;old.ended=true;f.source.update(40);const plays=old.playCalls;
    next.playError=null;assert.equal(await f.source.retry(),true);assert.equal(f.source.state,'playing');
    assert.equal(old.playCalls,plays);assert.equal(old.currentTime,15);assert.equal(next.currentTime,0);
    next.currentTime=.5;assert.equal(f.source.update(80),true);near(f.draws.at(-1).alpha,.5);
  }finally{f.source.dispose();}
});

test('short clips bound the overlap to a third of duration rather than starting a transition immediately',async()=>{
  const f=fixture({video:{duration:.6}}),[old,next]=f.videos;
  try{
    await f.source.load();old.currentTime=.35;f.source.update(0);assert.equal(next.playCalls,0);
    old.currentTime=.4;f.source.update(40);await flush();assert.equal(next.playCalls,1);
    next.currentTime=.1;old.currentTime=.5;f.source.update(80);near(f.draws.at(-1).alpha,.5);
    next.currentTime=.2;old.currentTime=.6;f.source.update(120);assert.equal(old.currentTime,0);near(next.currentTime,.2);
  }finally{f.source.dispose();}
});

test('decoded-frame callbacks mark new pixels and are canceled during pause and disposal',async()=>{
  const f=fixture({video:{videoFrames:true}}),video=f.videos[0];
  try{
    await f.source.load();assert.equal(video.frameCallbacks.size,1);f.source.update(0);assert.equal(f.source.update(40),false);
    video.frame();assert.equal(f.source.update(40),true);assert.equal(video.frameCallbacks.size,1);
    f.source.pause();assert.equal(video.frameCallbacks.size,0);assert.ok(video.frameCancels.length>0);
    await f.source.resume();assert.equal(video.frameCallbacks.size,1);
    f.source.dispose();assert.ok(f.videos.every(item=>item.frameCallbacks.size===0));assert.equal(f.source.update(100),false);
  }finally{f.source.dispose();}
});

test('a temporary draw failure does not clear the last frame and can retry the same media pixels',async()=>{
  const f=fixture();
  try{
    await f.source.load();f.videos[0].currentTime=.1;f.context.failNext=true;const before=f.draws.length;
    assert.equal(f.source.update(0),false);assert.equal(f.draws.length,before);assert.equal(f.context.globalAlpha,1);
    assert.equal(f.source.update(40),true);assert.equal(f.draws.length,before+1);assert.equal(f.context.clears,0);
  }finally{f.source.dispose();}
});

test('decoder errors stop both streams while retaining the previously composed image',async()=>{
  const f=fixture();
  try{
    await f.source.load();const before=f.draws.length;f.videos[1].error={code:3};f.videos[1].emit('error');
    assert.equal(f.source.state,'error');assert.match(f.source.error.message,/미디어 오류 3/);
    assert.ok(f.videos.every(video=>video.paused));assert.equal(f.source.update(1000),false);assert.equal(await f.source.retry(),false);
    assert.equal(f.draws.length,before);assert.equal(f.context.clears,0);
  }finally{f.source.dispose();}
});

test('disposing pending load rejects it once, detaches listeners and makes later media events harmless',async()=>{
  const f=fixture({video:{autoLoad:false}}),loading=f.source.load();
  f.source.dispose();await assert.rejects(loading,/해제/);const events=f.states.length,loads=f.videos.map(video=>video.loadCalls);
  f.source.dispose();assert.deepEqual(f.videos.map(video=>video.loadCalls),loads);assert.equal(f.states.length,events);
  for(const video of f.videos){
    assert.equal(video.src,'');assert.equal(video.paused,true);assert.ok([...video.listeners.values()].every(set=>set.size===0));
    video.readyState=2;video.emit('loadeddata');video.emit('error');
  }
  assert.equal(f.source.state,'disposed');assert.equal(f.source.update(0),false);assert.equal(await f.source.resume(),false);
  await assert.rejects(f.source.load(),/해제/);
});

test('late autoplay fulfillment cannot resurrect a disposed or newly paused background',async()=>{
  for(const action of ['pause','dispose']){
    const f=fixture(),pending=deferred();f.videos[0].playPromise=pending.promise;
    const loading=f.source.load();await flush();assert.equal(f.videos[0].playCalls,1);
    f.source[action]();pending.resolve();await loading;
    assert.equal(f.source.state,action==='pause'?'paused':'disposed');assert.ok(f.videos.every(video=>video.paused));
    assert.equal(f.source.update(1000),false);f.source.dispose();
  }
});

test('an obsolete play settlement after a rapid pause-resume cannot block or pause the new playback epoch',async()=>{
  for(const rejection of [false,true]){
    const f=fixture(),oldPlay=deferred();f.videos[0].playPromise=oldPlay.promise;
    const loading=f.source.load();await flush();assert.equal(f.videos[0].playCalls,1);
    try{
      f.source.pause();f.videos[0].playPromise=null;
      assert.equal(await f.source.resume(),true);assert.equal(f.source.state,'playing');assert.equal(f.videos[0].playCalls,2);
      if(rejection)oldPlay.reject(new Error('Old play aborted'));else oldPlay.resolve();
      await loading;await flush();assert.equal(f.source.state,'playing');assert.equal(f.videos[0].paused,false);assert.equal(f.source.error,null);
    }finally{oldPlay.resolve();f.source.dispose();}
  }
});

test('throwing or rejected consumer state callbacks cannot break playback and cleanup',async()=>{
  for(const onStateChange of [()=>{throw new Error('Status UI failed');},()=>Promise.reject(new Error('Async status UI failed'))]){
    const f=fixture({onStateChange});
    await f.source.load();assert.equal(f.source.state,'playing');f.source.pause();assert.equal(f.source.state,'paused');
    assert.equal(await f.source.resume(),true);f.source.dispose();await flush();assert.equal(f.source.state,'disposed');
  }
});

test('local MP4, poster fallback and lifecycle hooks preserve the shared rain, fog, blur and parallax pipeline',()=>{
  const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const url=source.match(/const backgroundUrl=['"](\.\/assets\/[^'"]+\.mp4)['"]/u)?.[1];assert.ok(url);
  const mediaUrl=new URL(url,new URL('../index.html',import.meta.url));assert.ok(statSync(mediaUrl).size>1024);
  const header=Buffer.alloc(16),descriptor=openSync(mediaUrl,'r');
  try{assert.equal(readSync(descriptor,header,0,16,0),16);assert.equal(header.subarray(4,8).toString('ascii'),'ftyp');}
  finally{closeSync(descriptor);}
  const poster=source.match(/const posterUrl=['"](\.\/assets\/[^'"]+\.jpg)['"]/u)?.[1];assert.ok(poster);
  assert.ok(statSync(new URL(poster,new URL('../index.html',import.meta.url))).size>1024);
  assert.match(server,/['"]\.mp4['"]\s*:\s*['"]video\/mp4['"]/);
  assert.match(source,/new VideoBackground\(backgroundUrl/);assert.match(source,/overlap:1,maxWidth:1280,fps:30/);
  assert.match(source,/new SceneTextures\(/);assert.match(source,/videoReady&&video\.update\(now\)/);
  assert.match(source,/sceneTextures\.update\(currentScene,radius\)/);
  for(const [unit,name] of [[1,'sharp'],[2,'fog'],[4,'background'],[5,'lens']])assert.match(source,new RegExp(`renderer\\.upload\\(${unit},sceneTextures\\.${name}\\)`));
  assert.match(source,/sceneTextures\.width\/sceneTextures\.height/);
  assert.match(source,/renderer\.draw\(map,0,revealed,parallax,condensation\.level,rain\)/);
  assert.match(source,/if\(paused\|\|document\.hidden\|\|reduced\)video\.pause\(\)/);
  assert.match(source,/if\(paused\|\|document\.hidden\|\|reduced\)source\.pause\(\)/);
  assert.match(source,/if\(event\.persisted\)video\?\.pause\(\);else video\?\.dispose\(\)/);
  assert.match(source,/pageshow[^;]*syncVideoPlayback\(\)/);
  assert.match(source,/visibilitychange[\s\S]*?syncVideoPlayback\(\)/);
  assert.match(source,/video\?\.state==='error'\)startVideo\(\);else video\?\.retry\(\)/);
  assert.match(html,/<div[^>]*id="background-media"[^>]*hidden[^>]*aria-hidden="true"/);
  assert.match(html,/<button[^>]*id="background-play"[^>]*type="button"/);
});
