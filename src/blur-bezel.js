import {blurValue} from './background-blur.js';
export const angleDelta=(from,to)=>((to-from+540)%360)-180;
export const bezelValue=value=>Math.round(blurValue(value)*2)/2;
export function keyValue(value,key){
  const delta={ArrowRight:.5,ArrowUp:.5,ArrowLeft:-.5,ArrowDown:-.5,PageUp:3,PageDown:-3};
  if(key==='Home')return 0;
  if(key==='End')return 24;
  return Object.hasOwn(delta,key)?bezelValue(value+delta[key]):null;
}
// Relative rotation avoids jumping when grabbing another part of the rim.
export class BlurBezel{
  constructor(element,output,onChange,options={}){
    const min=options.min??0,max=options.max??24,step=options.step??.5;
    const angleStart=options.angleStart??-135,angleSweep=options.angleSweep??270;
    const limit=v=>Math.max(min,Math.min(max,Number.isFinite(v)?v:0));
    const quantize=v=>Math.round(limit(v)/step)*step;
    const format=options.format??(v=>`${v} px`);
    this.value=0;
    let pointer=null,previous=null,raw=0;
    const enabled=()=>element.getAttribute('aria-disabled')!=='true';
    const set=value=>{
      const next=quantize(value),changed=next!==this.value;this.value=next;
      element.style.setProperty('--angle',`${angleStart+(next-min)/(max-min)*angleSweep}deg`);
      element.setAttribute('aria-valuenow',String(next));element.setAttribute('aria-valuetext',format(next));
      output.textContent=String(next);if(changed)onChange(next);
    };
    const angle=e=>{
      const box=element.getBoundingClientRect(),x=e.clientX-box.left-box.width/2,y=e.clientY-box.top-box.height/2;
      return Math.hypot(x,y)<box.width*.18?null:Math.atan2(y,x)*180/Math.PI;
    };
    const end=()=>{
      const id=pointer;pointer=null;previous=null;element.classList.remove('turning');
      if(id!==null&&element.hasPointerCapture(id))element.releasePointerCapture(id);
    };
    element.addEventListener('pointerdown',e=>{
      if(!enabled()||e.button!==0||pointer!==null)return;
      e.preventDefault();element.focus();pointer=e.pointerId;previous=angle(e);raw=this.value;
      element.setPointerCapture(pointer);element.classList.add('turning');
    });
    element.addEventListener('pointermove',e=>{
      if(e.pointerId!==pointer)return;
      if(!enabled()){end();return;}
      const current=angle(e);
      if(current!==null&&previous!==null){raw=limit(raw+angleDelta(previous,current)*(max-min)/angleSweep);set(raw);}
      previous=current;
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(event,e=>{if(e.pointerId===pointer)end();});
    window.addEventListener('blur',end);
    element.addEventListener('keydown',e=>{
      if(!enabled())return;
      const offsets={ArrowRight:step,ArrowUp:step,ArrowLeft:-step,ArrowDown:-step,PageUp:step*6,PageDown:-step*6};
      const next=e.key==='Home'?min:e.key==='End'?max:e.key==='0'?0:Object.hasOwn(offsets,e.key)?this.value+offsets[e.key]:null;
      if(next===null)return;
      e.preventDefault();end();set(next);
    });
    set(options.initialValue??0);element.setAttribute('aria-disabled','false');
  }
}
