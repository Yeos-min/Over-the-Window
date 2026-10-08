import {clamp} from './physics.js';
export const PARALLAX_STRENGTH=3;

// Depth-separated image planes: presentation only, never a force on the rain.
export class Parallax {
  constructor(enabled=true){this.enabled=enabled;this.reset();}
  reset(){this.x=0;this.y=0;this.leave();}
  leave(){this.targetX=0;this.targetY=0;}
  move(x,y,width,height){
    if(!this.enabled||width<=0||height<=0)return;
    this.targetX=clamp(x/width*2-1,-1,1);
    this.targetY=clamp(y/height*2-1,-1,1);
  }
  update(dt){
    if(!this.enabled){this.reset();return;}
    const ease=1-Math.exp(-6*Math.max(0,dt));
    this.x+=(this.targetX-this.x)*ease;this.y+=(this.targetY-this.y)*ease;
  }
  get strength(){return this.enabled?PARALLAX_STRENGTH:0;}
  get glassScale(){return 1+.025*this.strength;}
  get sceneScale(){return 1+.09*this.strength;}
  project(x,y,width,height){
    return {x:((x/width-.5)+this.x*.006*this.strength)*this.glassScale*width+width*.5,
      y:((y/height-.5)+this.y*.006*this.strength)*this.glassScale*height+height*.5};
  }
  unproject(x,y,width,height){
    return {x:((x/width-.5)/this.glassScale-this.x*.006*this.strength+.5)*width,
      y:((y/height-.5)/this.glassScale-this.y*.006*this.strength+.5)*height,scale:this.glassScale};
  }
}
