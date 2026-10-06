import {clamp} from './physics.js';

export class HorizontalMotion {
  constructor(){this.clear();}
  clear(){this.previous=null;this.target=0;this.value=0;this.age=0;}
  move(x,time){
    if(this.previous!==null){
      const elapsed=Math.max(.016,(time-this.previous.time)/1000);
      this.target=clamp((x-this.previous.x)/elapsed/500,-1,1);
    }
    this.previous={x,time};this.age=0;
  }
  update(dt){
    this.age+=dt;
    if(this.age>.12)this.target*=Math.exp(-12*dt);
    this.value+=(this.target-this.value)*(1-Math.exp(-8*dt));
    return this.value;
  }
}

export class MouseInput extends HorizontalMotion {
  constructor(canvas,onMove){
    super();
    canvas.addEventListener('pointermove',e=>{
      if(e.pointerType!=='mouse'&&e.pointerType!=='pen')return;
      this.move(e.clientX,e.timeStamp);onMove();
    });
    for(const event of ['pointerleave','pointercancel'])canvas.addEventListener(event,()=>this.clear());
    window.addEventListener('blur',()=>this.clear());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
  }
}
