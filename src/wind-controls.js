import {BlurBezel} from './blur-bezel.js';

// Project the left/right angle around an upward-facing neutral index onto lateral wind.
// Gravity still supplies downward flow; this does not introduce upward air forces.
export function lateralWind(direction,strength){
  const angle=Math.max(-90,Math.min(90,Number.isFinite(direction)?direction:0));
  const force=Math.max(0,Math.min(100,Number.isFinite(strength)?strength:0));
  return Math.sin(angle*Math.PI/180)*force/100;
}

export function initWindControls(directionElement,directionOutput,strengthElement,strengthOutput,onChange){
  let direction=0,strength=0;
  const publish=()=>onChange(lateralWind(direction,strength));
  const directionControl=new BlurBezel(directionElement,directionOutput,value=>{
    direction=value;publish();
  },{
    min:-90,max:90,step:5,initialValue:0,angleStart:-90,angleSweep:180,
    format:value=>value===0?'중립 · 0도':`${value<0?'왼쪽':'오른쪽'} ${Math.abs(value)}도`
  });
  const strengthControl=new BlurBezel(strengthElement,strengthOutput,value=>{
    strength=value;publish();
  },{min:0,max:100,step:5,format:value=>value===0?'무풍 · 0%':`바람 세기 ${value}%`});
  publish();
  return {direction:directionControl,strength:strengthControl};
}
