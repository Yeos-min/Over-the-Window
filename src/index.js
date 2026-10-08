import {loadImage} from './image-loader.js';
import {CodropsPhysics} from './codrops-physics.js';
import {HeartfeltRain} from './heartfelt-rain.js';
import {WaterMap} from './raindrops.js';
import {RainRenderer} from './rain-renderer.js';
import {MusicInput} from './music.js';
import {Parallax} from './parallax.js';
import {Condensation} from './condensation.js';
import {blurValue} from './background-blur.js';
import {SceneTextures} from './scene-textures.js';
import {VideoBackground} from './video-background.js';
import {ScreenShare} from './screen-share.js';
import {BlurBezel} from './blur-bezel.js';
import {initMusicPanel} from './music-panel.js';
import {initMenuDrawer} from './menu-drawer.js';
import {initWindControls} from './wind-controls.js';
import {initMassControl} from './mass-control.js';
import {initNoiseControl,initTurnDragControl} from './noise-control.js';
import {RAIN_SOUND_VOICES} from './rain-sound.js';
import {RainBirthSound} from './rain-birth-sound.js';
import {FrameStats} from './frame-stats.js';
import {initFingerDrawing} from './finger-drawing.js';
import {initRainControl} from './rain-intensity.js';

const $=s=>document.querySelector(s),canvas=$('#glass'),surface=$('#window'),status=$('#status');
const menu=initMenuDrawer($('#menu-toggle'),$('#menu-controls'),$('#menu-drawer'));
initMusicPanel($('#music-toggle'),$('#music-content'));
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
// Keep collision work at 30Hz; render and video retain their own refresh rates.
const simulationStep=1/30;
const frameStats=new FrameStats($('#performance-status'));
const parallax=new Parallax(!reduced);
const condensation=new Condensation();
const rain=new HeartfeltRain();
let paused=false,revealed=false,raf=0,last=0,acc=0,renderer,physics,map,video,videoReady=false,backgroundFailed=false;
let screenShare,drawingMode=true;
const music=new MusicInput((connected,message,pending=false)=>{
  $('#music').setAttribute('aria-pressed',String(connected));
  $('#music').textContent=pending?'연결 취소':connected?'음악 연결 해제':'음악 연결';
  $('#music-status').textContent=message;
});
const rainSoundButtons=[[$('#rain-sound-test'),'low'],[$('#rain-sound-higher'),'higher'],[$('#rain-sound-high'),'high']];
const rainSound=new RainBirthSound((playing,message,voice)=>{
  for(const [button,key] of rainSoundButtons){
    const active=playing&&voice===key;
    button.setAttribute('aria-pressed',String(active));
    button.textContent=`${RAIN_SOUND_VOICES[key].label} ${active?'중지':'듣기'}`;
  }
  $('#rain-sound-status').textContent=message;
},{onEnabled:(enabled,message,pending=false)=>{
  $('#rain-sound-live').setAttribute('aria-pressed',String(enabled||pending));
  $('#rain-sound-live').textContent=pending?'빗소리 연결 취소':enabled?'빗소리 끄기':'빗소리 켜기';
  $('#rain-sound-live-status').textContent=message;
}});
$('#rain-sound-live').addEventListener('click',()=>rainSound.setEnabled(!rainSound.enabled&&!rainSound.pending));
for(const [button,voice] of rainSoundButtons)button.addEventListener('click',()=>{
  if(rainSound.playing&&rainSound.voice===voice)rainSound.stop();else rainSound.play(voice);
});
$('#rain-sound-volume').addEventListener('input',event=>{
  const value=Number(event.target.value);rainSound.setVolume(value/100);$('#rain-sound-volume-value').textContent=`${value}%`;
});
$('#rain-sound-limit').addEventListener('input',event=>{
  const value=rainSound.setVoiceLimit(Number(event.target.value));event.target.value=String(value);
  $('#rain-sound-limit-value').textContent=`${value}개`;event.target.setAttribute('aria-valuetext',`최대 ${value}개 동시 재생`);
});
$('#rain-sound-auto-gain').addEventListener('click',event=>{
  const enabled=rainSound.setAutoGain(!rainSound.autoGain);
  event.currentTarget.setAttribute('aria-pressed',String(enabled));
  event.currentTarget.textContent=`음량 자동 보정 ${enabled?'ON':'OFF'}`;
  $('#rain-sound-auto-gain-help').textContent=enabled?'12개를 넘게 겹치면 전체 빗소리를 줄여요.':'겹치는 개수에 따른 감쇠 없이 재생해요.';
});
$('#music').addEventListener('click',()=>music.toggle());
$('#sensitivity').addEventListener('input',e=>{music.sensitivity=Number(e.target.value);});
window.addEventListener('pagehide',event=>{screenShare?.stop(false);music.stop(false);rainSound.dispose();if(event.persisted)video?.pause();else video?.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted)syncVideoPlayback();});
const say=text=>{if(status.textContent!==text)status.textContent=text;};
const fetchText=async url=>{const response=await fetch(url);if(!response.ok)throw new Error(url);return response.text();};
const backgroundUrl='./assets/rainy-forest-wind-silent.mp4';
const posterUrl='./assets/rainy-forest-poster.jpg';
canvas.style.background=`url("${posterUrl}") center / cover`;
function syncVideoPlayback(){
  if(!videoReady)return;
  if(paused||document.hidden||reduced)video.pause();else video.resume();
}
try{
  const [fg,vert,fragment,heartfelt,dropAlpha,dropColor]=await Promise.all([
    loadImage(posterUrl),
    fetchText('./src/shaders/simple.vert'),fetchText('./src/shaders/water.frag'),
    fetchText('./src/shaders/heartfelt.glsl'),loadImage('./assets/drop-alpha.png'),loadImage('./assets/drop-color.png')
  ]);
  const frag=fragment.replace('/* HEARTFELT */',heartfelt);
  const sceneTextures=new SceneTextures();
  let currentScene=fg,backgroundDirty=true;
  sceneTextures.update(currentScene,0);
  const blurControl=new BlurBezel($('#background-blur'),$('#background-blur-value'),()=>{backgroundDirty=true;},{initialValue:4});
  renderer=new RainRenderer(canvas,vert,frag);document.body.dataset.renderer='webgl';
  physics=new CodropsPhysics(surface.clientWidth,surface.clientHeight);physics.active=!reduced;map=new WaterMap(dropAlpha,dropColor,{surfaceDensity:.12});
  map.physics=physics;
  physics.onImpact=drop=>rainSound.impact(drop,physics.height);
  initWindControls($('#wind-direction'),$('#wind-direction-value'),$('#wind-strength'),$('#wind-strength-value'),value=>{physics.windTarget=value;});
  function startVideo(){
    video?.dispose();$('#background-media').replaceChildren();
    videoReady=false;currentScene=fg;backgroundDirty=true;document.body.dataset.background='loading';
    $('#background-play').hidden=true;
    const source=new VideoBackground(backgroundUrl,{
      createVideo:()=>{const element=document.createElement('video');$('#background-media').append(element);return element;},
      overlap:1,maxWidth:1280,fps:30,
      onStateChange:(state,error)=>{
        document.body.dataset.background=state;
        $('#background-play').hidden=state!=='blocked'&&state!=='error';
        $('#background-play').textContent=state==='error'?'배경 영상 다시 불러오기':'배경 영상 재생';
        if(error&&state==='error'){
          backgroundFailed=true;
          say(videoReady?'배경 영상이 중단되어 마지막 장면을 표시하고 있어요.':'배경 영상을 불러오지 못해 영상의 첫 장면을 표시하고 있어요.');
        }
        if(state==='playing'&&backgroundFailed){backgroundFailed=false;say('배경 영상이 다시 재생되고 있어요.');}
      }
    });
    video=source;
    // Hidden tabs may defer play() promises. Prepare the first frame without autoplay there.
    if(paused||document.hidden||reduced)source.pause();
    source.load().then(()=>{
      if(video!==source||source.state==='disposed')return;
      videoReady=true;currentScene=source.canvas;backgroundDirty=true;syncVideoPlayback();
    }).catch(()=>{/* Keep the forest poster and rain controls usable if decoding fails. */});
  }
  $('#background-play').addEventListener('click',()=>{if(video?.state==='error')startVideo();else video?.retry();});
  startVideo();
  function scene(w,h){
    // Refraction, mist and background use the exact same composite video frame.
    renderer.upload(1,sceneTextures.sharp);renderer.upload(2,sceneTextures.fog);renderer.upload(4,sceneTextures.background);
    renderer.upload(5,sceneTextures.lens);
    renderer.gl.uniform1f(renderer.loc('textureRatio'),sceneTextures.width/sceneTextures.height);
  }
  function resize(force=false){
    const w=surface.clientWidth,h=surface.clientHeight;
    if(!force&&map.width===w&&map.height===h)return;
    fingerDrawing.cancel();
    parallax.reset();
    physics.resize(w,h);map.resize(w,h);renderer.resize(w,h);scene(w,h);paint();
  }
  const fingerDrawing=initFingerDrawing(canvas,{
    enabled:()=>drawingMode&&!revealed&&document.body.dataset.renderer==='webgl',
    project:(...args)=>parallax.unproject(...args),onStroke:(...args)=>map.wipe(...args)
  });
  screenShare=new ScreenShare({
    onConnected:source=>{
      video?.dispose();$('#background-media').replaceChildren(source.video);video=source;videoReady=true;
      currentScene=source.canvas;backgroundDirty=true;sceneTextures.maxEdge=1920;
      parallax.enabled=false;parallax.reset();document.body.dataset.background='shared';
      $('#background-play').hidden=true;syncVideoPlayback();paint();
    },
    onStopped:()=>{
      fingerDrawing.cancel();
      parallax.enabled=!reduced;parallax.reset();sceneTextures.maxEdge=1280;startVideo();
    },
    onState:(state,message)=>{
      const connecting=state==='requesting'||state==='loading';
      $('#share-background').disabled=state==='unsupported';
      $('#share-background').textContent=connecting?'배경 연결 취소':state==='active'?'배경 화면 공유 중':'화면 공유로 배경 바꾸기';
      $('#share-background').setAttribute('aria-pressed',String(connecting||state==='active'));
      $('#share-stop').hidden=state!=='active';$('#share-status').textContent=message;
    }
  });
  $('#share-background').addEventListener('click',()=>{if(screenShare.pending)screenShare.stop();else screenShare.start();});
  $('#share-stop').addEventListener('click',()=>screenShare.stop());
  function toggleDrawing(){
    drawingMode=!drawingMode;fingerDrawing.cancel();document.body.dataset.drawing=String(drawingMode);
    $('#drawing-mode').setAttribute('aria-pressed',String(drawingMode));
    $('#drawing-mode').textContent=`그리기 모드 ${drawingMode?'ON':'OFF'} · G`;
  }
  $('#drawing-mode').addEventListener('click',toggleDrawing);
  document.addEventListener('keydown',event=>{
    if(event.code!=='KeyG'||event.repeat||event.isComposing||event.ctrlKey||event.altKey||event.metaKey||event.target.closest('input,textarea,select,[contenteditable]'))return;
    event.preventDefault();toggleDrawing();
  });
  canvas.addEventListener('pointermove',e=>{
    if(paused||fingerDrawing.drawing||e.pointerType!=='mouse'&&e.pointerType!=='pen')return;
    const rect=canvas.getBoundingClientRect();
    parallax.move(e.clientX-rect.left,e.clientY-rect.top,rect.width,rect.height);
  });
  for(const event of ['pointerleave','pointercancel'])canvas.addEventListener(event,()=>parallax.leave());
  window.addEventListener('blur',()=>parallax.leave());
  $('#pause').addEventListener('click',()=>{
    paused=!paused;surface.classList.toggle('paused',paused);$('#pause').setAttribute('aria-pressed',String(paused));
    if(paused&&rainSound.playing)rainSound.stop();
    if(paused)rainSound.clearHits();
    $('#pause').textContent=paused?'계속 흐르기':'잠시 멈추기';
    say(paused?'물방울과 물길을 잠시 멈췄어요.':'다시 천천히 흘려보세요.');
    syncVideoPlayback();
  });
  $('#reset').addEventListener('click',()=>{
    fingerDrawing.cancel();
    if(rainSound.playing)rainSound.stop();
    rainSound.clearHits();
    condensation.reset();
    parallax.reset();physics.reset();rain.reset();map.clear();paused=false;revealed=false;
    surface.classList.remove('started','paused','revealed');$('#pause').textContent='잠시 멈추기';$('#pause').setAttribute('aria-pressed','false');
    $('#reveal').textContent='풍경 보기';$('#reveal').setAttribute('aria-pressed','false');
    syncVideoPlayback();
    say('음악 없이도 흘러요. 바람 베젤로 물길의 방향을 조절해보세요.');paint();
  });
  $('#reveal').addEventListener('click',()=>{
    fingerDrawing.cancel();
    revealed=!revealed;surface.classList.toggle('revealed',revealed);$('#reveal').setAttribute('aria-pressed',String(revealed));
    if(revealed)rainSound.clearHits();
    $('#reveal').textContent=revealed?'유리로 돌아가기':'풍경 보기';
    say(revealed?'빗방울 없이 풍경을 보고 있어요.':'바람 베젤로 흐르는 빗물들의 방향을 조절해보세요.');paint();
  });
  $('#defog').addEventListener('click',()=>{
    if(condensation.clear())say('김서림이 천천히 걷히고 있어요.');
  });
  function paint(now=performance.now()){
    let stamp=performance.now();
    if(videoReady&&video.update(now)){currentScene=video.canvas;backgroundDirty=true;}
    if(backgroundDirty){
      const radius=blurValue(blurControl.value);
      sceneTextures.update(currentScene,radius);scene();backgroundDirty=false;
    }
    frameStats.add('background',performance.now()-stamp);stamp=performance.now();
    map.draw(physics.drops);frameStats.add('maps',performance.now()-stamp);stamp=performance.now();
    renderer.draw(map,0,revealed,parallax,condensation.level,rain);frameStats.add('render',performance.now()-stamp);
    $('#defog').disabled=!condensation.canClear||revealed;
    $('#defog').textContent=condensation.clearing?'김서림 걷히는 중…':'김서림 없애기';
  }
  function frame(now){
    const start=performance.now();
    const dt=last?Math.min((now-last)/1000,.08):0;last=now;
    // An explicit defog action can finish while rain is paused; accumulation cannot.
    if(condensation.clearing||(!paused&&!revealed))condensation.update(dt);
    if(!paused&&!fingerDrawing.drawing)parallax.update(dt);
    physics.music=music.sample(dt);
    $('#volume-meter').value=physics.music.level;
    $('#treble-meter').value=physics.music.treble;
    if(!paused&&!revealed){
      // Bound catch-up work so a busy frame cannot create a simulation backlog.
      acc=Math.min(acc+dt,simulationStep*2);while(acc>=simulationStep){
        // Pointer movement affects parallax only; wind controls lateral rain flow.
        let stamp=performance.now();
        if(!reduced){rain.update(simulationStep,physics.music,physics.wind);map.updateRain(rain,physics);}
        frameStats.add('field',performance.now()-stamp);stamp=performance.now();
        physics.step(simulationStep,0,(...args)=>map.trail(...args),(...args)=>map.absorb(...args),(...args)=>map.releaseWind(...args));
        map.dirty=true;
        frameStats.add('physics',performance.now()-stamp);
        acc-=simulationStep;
      }
      let stamp=performance.now();map.decay(dt);frameStats.add('decay',performance.now()-stamp);stamp=performance.now();
      if(!reduced)map.condense(dt);frameStats.add('births',performance.now()-stamp);
    }else {acc=0;}
    frameStats.add('simulation',performance.now()-start);
    rainSound.flush();
    paint(now);frameStats.frame(now,start,{voices:rainSound.worklet?rainSound.audioStats.active:rainSound.hits.size,voiceCounts:rainSound.worklet?rainSound.audioStats.voices:undefined,audio:rainSound.worklet?'worklet':'nodes',width:canvas.width,height:canvas.height});raf=requestAnimationFrame(frame);
  }
  resize();initMassControl($('#mass-scale'),$('#mass-scale-value'),physics,map);
  initRainControl($('#rain-intensity'),$('#rain-intensity-value'),physics);
  initNoiseControl($('#path-noise'),$('#path-noise-value'),physics);
  initTurnDragControl($('#turn-drag'),$('#turn-drag-value'),physics);new ResizeObserver(()=>resize()).observe(surface);
  document.addEventListener('visibilitychange',()=>{
    fingerDrawing.cancel();
    if(document.hidden&&rainSound.playing)rainSound.stop();
    if(document.hidden)rainSound.clearHits();
    cancelAnimationFrame(raf);last=0;acc=0;frameStats.reset();
    parallax.leave();
    syncVideoPlayback();
    if(!document.hidden)raf=requestAnimationFrame(frame);
  });
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fingerDrawing.cancel();cancelAnimationFrame(raf);rainSound.clearHits();video?.pause();say('화면 연결이 중단됐어요. 복구를 기다리는 중입니다.');});
  canvas.addEventListener('webglcontextrestored',()=>{
    try{renderer=new RainRenderer(canvas,vert,frag);resize(true);syncVideoPlayback();last=0;acc=0;cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);say('화면이 복구됐어요.');}catch(error){fallback(error);}
  });
  say('음악 없이도 흘러요. 바람 베젤로 물길의 방향을 조절해보세요.');
  raf=requestAnimationFrame(frame);
}catch(error){fallback(error);}

function fallback(error){
  screenShare?.stop(false);
  rainSound.dispose();
  music.stop();
  video?.dispose();
  console.error(error);cancelAnimationFrame(raf);document.body.dataset.renderer='fallback';surface.classList.add('error','revealed');
  say('이 환경에서는 빗방울 효과를 실행하지 못했어요. 배경 풍경을 대신 보여드려요.');
  // Keep the bookmark available so fallback status and help remain reachable.
  menu.setOpen(true);
  for(const b of document.querySelectorAll('.control-rail button'))b.disabled=true;
  $('#background-blur').setAttribute('aria-disabled','true');
  $('#wind-direction').setAttribute('aria-disabled','true');
  $('#wind-strength').setAttribute('aria-disabled','true');
  $('#mass-scale').disabled=true;
  $('#path-noise').disabled=true;
  $('#turn-drag').disabled=true;
  $('#rain-intensity').disabled=true;
  $('#rain-sound-limit').disabled=true;
}
