import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lateralWind,initWindControls} from '../src/wind-controls.js';
import {BlurBezel} from '../src/blur-bezel.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-12,`${actual} should equal ${expected}`);
const element=(min,max)=>{
  const attributes=new Map([['aria-disabled','true'],['aria-valuemin',String(min)],['aria-valuemax',String(max)]]);
  const listeners=new Map(),properties=new Map(),classes=new Set(),captured=new Set();
  const node={
    attributes,properties,classes,captured,focused:false,
    getAttribute(name){return attributes.get(name)??null;},
    setAttribute(name,value){attributes.set(name,value);},
    addEventListener(type,listener){listeners.set(type,listener);},
    style:{setProperty(name,value){properties.set(name,value);}},
    classList:{add(name){classes.add(name);},remove(name){classes.delete(name);}},
    getBoundingClientRect(){return {left:0,top:0,width:100,height:100};},
    focus(){node.focused=true;},
    setPointerCapture(id){captured.add(id);},
    hasPointerCapture(id){return captured.has(id);},
    releasePointerCapture(id){captured.delete(id);},
    key(key){let prevented=0;listeners.get('keydown')({key,preventDefault(){prevented++;}});return prevented;},
    pointer(type,angle,pointerId=1){
      const radians=angle*Math.PI/180;let prevented=0;
      listeners.get(type)({button:0,pointerId,clientX:50+45*Math.cos(radians),clientY:50+45*Math.sin(radians),preventDefault(){prevented++;}});
      return prevented;
    }
  };
  return node;
};
const withFixture=callback=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window'),windowListeners=new Map();
  Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener(type,listener){
    if(!windowListeners.has(type))windowListeners.set(type,[]);windowListeners.get(type).push(listener);
  }}});
  try{
    const direction=element(-90,90),strength=element(0,100),directionOutput={textContent:''},strengthOutput={textContent:''},forces=[];
    const controls=initWindControls(direction,directionOutput,strength,strengthOutput,value=>forces.push(value));
    return callback({direction,strength,directionOutput,strengthOutput,forces,controls,blur(){windowListeners.get('blur').forEach(listener=>listener());}});
  }finally{
    if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;
  }
};

test('wind projection maps left, neutral, right and proportional strength without changing gravity',()=>{
  near(lateralWind(-90,100),-1);near(lateralWind(0,100),0);near(lateralWind(90,100),1);
  near(lateralWind(30,50),.25);near(lateralWind(-30,50),-.25);
  for(const angle of [-90,-45,0,45,90])near(lateralWind(angle,0),0);
  for(const angle of [5,30,60,90])for(const strength of [0,25,50,100]){
    near(lateralWind(-angle,strength),-lateralWind(angle,strength));
    near(lateralWind(angle,strength),lateralWind(angle,100)*strength/100);
  }
});

test('wind projection clamps finite bounds and invalid values cannot create a force',()=>{
  near(lateralWind(180,200),1);near(lateralWind(-180,200),-1);near(lateralWind(45,-10),0);
  for(const invalid of [NaN,Infinity,-Infinity,undefined,null,'90']){
    near(lateralWind(invalid,100),0);near(lateralWind(90,invalid),0);
  }
});

test('independent bezels start with an upward neutral index and calm strength with matching ARIA',()=>withFixture(({direction,strength,directionOutput,strengthOutput,forces,controls})=>{
  assert.ok(controls.direction instanceof BlurBezel);assert.ok(controls.strength instanceof BlurBezel);
  assert.notEqual(controls.direction,controls.strength);
  assert.equal(controls.direction.value,0);assert.equal(controls.strength.value,0);
  assert.equal(direction.attributes.get('aria-valuenow'),'0');assert.equal(strength.attributes.get('aria-valuenow'),'0');
  assert.match(direction.attributes.get('aria-valuetext'),/중립/);assert.match(strength.attributes.get('aria-valuetext'),/무풍|0\s*%/);
  assert.equal(direction.attributes.get('aria-disabled'),'false');assert.equal(strength.attributes.get('aria-disabled'),'false');
  assert.equal(direction.properties.get('--angle'),'0deg');assert.equal(strength.properties.get('--angle'),'-135deg');
  assert.equal(directionOutput.textContent,'0');assert.match(strengthOutput.textContent,/0/);
  assert.ok(forces.every(value=>Math.abs(value)===0));
}));

test('keyboard strength changes preserve direction and direction changes preserve stored strength',()=>withFixture(({direction,strength,controls,forces})=>{
  assert.equal(strength.key('ArrowUp'),1);assert.equal(controls.strength.value,5);near(forces.at(-1),0);
  strength.key('PageUp');assert.equal(controls.strength.value,35);assert.equal(controls.direction.value,0);near(forces.at(-1),0);
  direction.key('ArrowLeft');assert.equal(controls.direction.value,-5);assert.equal(controls.strength.value,35);near(forces.at(-1),lateralWind(-5,35));
  direction.key('Home');assert.equal(controls.direction.value,-90);assert.equal(direction.properties.get('--angle'),'-90deg');near(forces.at(-1),-.35);
  direction.key('End');assert.equal(controls.direction.value,90);assert.equal(direction.properties.get('--angle'),'90deg');near(forces.at(-1),.35);
  direction.key('0');assert.equal(controls.direction.value,0);assert.equal(controls.strength.value,35);near(forces.at(-1),0);
  assert.match(direction.attributes.get('aria-valuetext'),/중립/);assert.equal(direction.properties.get('--angle'),'0deg');
  strength.key('End');assert.equal(controls.strength.value,100);near(forces.at(-1),0);
  strength.key('Home');assert.equal(controls.strength.value,0);
  assert.equal(direction.key('Tab'),0);assert.equal(strength.key('Tab'),0);
}));

test('changing direction at zero strength remains calm, including immediate direction reversal',()=>withFixture(({direction,strength,controls,forces})=>{
  for(let i=0;i<20;i++)direction.key(i%2?'End':'Home');
  assert.ok(forces.every(value=>Math.abs(value)===0));assert.equal(controls.strength.value,0);
  strength.key('End');near(forces.at(-1),1);
  for(let i=0;i<20;i++){
    direction.key(i%2?'End':'Home');near(forces.at(-1),i%2?1:-1);
    assert.equal(controls.strength.value,100);assert.ok(forces.every(value=>Number.isFinite(value)&&Math.abs(value)<=1));
  }
}));

test('upward direction index follows clockwise pointer rotation toward right and back toward left',()=>withFixture(({direction,strength,controls,forces})=>{
  strength.key('End');
  assert.equal(direction.pointer('pointerdown',0),1);assert.ok(direction.focused);assert.ok(direction.captured.has(1));
  direction.pointer('pointermove',45);assert.equal(controls.direction.value,45);
  assert.equal(direction.properties.get('--angle'),'45deg');near(forces.at(-1),Math.SQRT1_2);
  direction.pointer('pointermove',90);assert.equal(controls.direction.value,90);
  assert.equal(direction.properties.get('--angle'),'90deg');near(forces.at(-1),1);
  direction.pointer('pointermove',0);assert.equal(controls.direction.value,0);
  assert.equal(direction.properties.get('--angle'),'0deg');near(forces.at(-1),0);
  direction.pointer('pointermove',-90);assert.equal(controls.direction.value,-90);
  assert.equal(direction.properties.get('--angle'),'-90deg');near(forces.at(-1),-1);
  direction.pointer('pointerup',-90);assert.equal(direction.captured.size,0);assert.ok(!direction.classes.has('turning'));
  assert.equal(controls.strength.value,100);
}));

test('pointer seam and positive strength sweep remain continuous and blur releases capture',()=>withFixture(({direction,strength,controls,forces,blur})=>{
  direction.key('0');strength.key('End');
  direction.pointer('pointerdown',170);direction.pointer('pointermove',-170);
  assert.equal(controls.direction.value,20);near(parseFloat(direction.properties.get('--angle')),20);
  near(forces.at(-1),lateralWind(20,100));direction.pointer('pointerup',-170);
  direction.key('End');strength.key('Home');
  strength.pointer('pointerdown',0,2);strength.pointer('pointermove',27,2);
  assert.equal(controls.strength.value,10);assert.equal(controls.direction.value,90);
  assert.equal(strength.properties.get('--angle'),'-108deg');near(forces.at(-1),.1);
  blur();assert.equal(strength.captured.size,0);assert.ok(!strength.classes.has('turning'));
}));

test('disabled wind bezels reject keyboard and pointer adjustments',()=>withFixture(({direction,strength,controls,forces})=>{
  direction.setAttribute('aria-disabled','true');strength.setAttribute('aria-disabled','true');
  const count=forces.length;
  assert.equal(direction.key('Home'),0);assert.equal(strength.key('End'),0);
  assert.equal(direction.pointer('pointerdown',0),0);assert.equal(strength.pointer('pointerdown',0),0);
  assert.equal(controls.direction.value,0);assert.equal(controls.strength.value,0);assert.equal(forces.length,count);
}));

test('HTML exposes separate labeled direction and strength sliders and fallback disables both',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const [id,min,max,value] of [['wind-direction',-90,90,0],['wind-strength',0,100,0]]){
    const slider=html.match(new RegExp(`<div[^>]*id="${id}"[^>]*>`))?.[0];assert.ok(slider);
    assert.match(slider,/role="slider"/);assert.match(slider,/tabindex="0"/);
    for(const [name,expected] of [['aria-valuemin',min],['aria-valuemax',max],['aria-valuenow',value]]){
      assert.match(slider,new RegExp(`${name}="${expected}"`));
    }
    assert.match(slider,new RegExp(`aria-labelledby="${id}-label"`));
    assert.match(slider,new RegExp(`aria-describedby="${id}-help"`));
    assert.match(html,new RegExp(`id="${id}-value"`));
  }
  const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
  assert.match(css,/#wind-direction\{[^}]*--angle:0deg/);
  assert.match(html,/id="wind-direction-value">0<\/span>/);
  assert.match(html,/id="wind-direction"[^>]*aria-valuetext="중립 · 0도"/);
  assert.doesNotMatch(html,/id="wind"/);
  const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  assert.match(source,/initWindControls\(/);assert.match(source,/physics\.windTarget=value/);
  const fallback=source.slice(source.indexOf('function fallback('));
  for(const id of ['wind-direction','wind-strength']){
    assert.match(fallback,new RegExp(`\\$\\('#${id}'\\)\\.setAttribute\\('aria-disabled','true'\\)`));
  }
});
