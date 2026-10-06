import test from 'node:test';
import assert from 'node:assert/strict';
import {SceneTextures} from '../src/scene-textures.js';

function fixture(){
  const canvases=[];
  const scene=new SceneTextures({createCanvas:()=>{
    const context={filter:'none',draws:[],drawImage(...args){this.draws.push({args,filter:this.filter});}};
    const canvas={width:0,height:0,getContext(){return context;},context};canvases.push(canvas);return canvas;
  }});
  return {scene,canvases};
}
test('video texture views share framing and bounded resolution with sharp refraction',()=>{
  const {scene}=fixture(),source={width:1920,height:1080};
  assert.equal(scene.update(source,0),true);
  assert.equal(scene.width,1280);assert.equal(scene.height,720);
  assert.equal(scene.background,scene.sharp);
  assert.deepEqual(scene.sharp.context.draws[0].args,[source,0,0,1280,720]);
  assert.equal(scene.fog.context.draws[0].filter,'blur(8px)');
  assert.equal(scene.extended.context.draws.length,9);
});
test('video blur reuses canvases and preserves the independent fog softness at every setting',()=>{
  const {scene,canvases}=fixture(),identities=[...canvases],source={width:1280,height:720};
  for(let frame=0;frame<100;frame++)assert.equal(scene.update(source,12),true);
  assert.equal(canvases.length,5);assert.deepEqual(canvases,identities);
  assert.equal(scene.background,scene.blurred);
  assert.equal(scene.blurred.context.draws.at(-1).filter,'blur(12px)');
  assert.equal(scene.fog.context.draws.at(-1).filter,`blur(${Math.hypot(8,12)}px)`);
  scene.update(source,999);assert.equal(scene.blurred.context.draws.at(-1).filter,'blur(24px)');
  scene.update(source,NaN);assert.equal(scene.background,scene.sharp);
});

test('Codrops foreground uses the original soft 96-pixel width with the video aspect and current frame',()=>{
  const {scene}=fixture(),source={width:1920,height:1080};
  scene.update(source,4);
  assert.equal(scene.lens.width,96);assert.equal(scene.lens.height,54);
  assert.deepEqual(scene.lens.context.draws.at(-1).args,[scene.sharp,0,0,96,54]);
  scene.update({width:800,height:1200},12);
  assert.equal(scene.lens.width,96);assert.equal(scene.lens.height,144);
});
test('invalid or unready media cannot replace the last usable video texture',()=>{
  const {scene}=fixture(),source={width:1280,height:720};scene.update(source,4);
  const previous=scene.sharp.context.draws.length;
  assert.equal(scene.update({videoWidth:0,videoHeight:0},0),false);
  assert.equal(scene.update({width:Infinity,height:720},0),false);
  assert.equal(scene.sharp.context.draws.length,previous);
  assert.equal(scene.background,scene.blurred);
});
