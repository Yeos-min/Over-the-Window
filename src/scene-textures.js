import {blurValue} from './background-blur.js';

// Keep the sharp, glass and fog views on the same frame without allocating canvases per frame.
export class SceneTextures {
  constructor({createCanvas=()=>document.createElement('canvas'),maxEdge=1280}={}){
    this.maxEdge=maxEdge;
    this.sharp=createCanvas();this.blurred=createCanvas();this.fog=createCanvas();this.extended=createCanvas();this.lens=createCanvas();
    this.contexts=[this.sharp,this.blurred,this.fog,this.extended,this.lens].map(canvas=>canvas.getContext('2d',{alpha:false}));
    if(this.contexts.some(context=>!context))throw new Error('배경을 그릴 수 없습니다.');
    this.background=this.sharp;
  }
  get width(){return this.sharp.width;}
  get height(){return this.sharp.height;}
  update(source,value=0){
    const sw=source.videoWidth||source.width,sh=source.videoHeight||source.height;
    if(!Number.isFinite(sw)||!Number.isFinite(sh)||!(sw>0&&sh>0))return false;
    const scale=Math.min(1,this.maxEdge/Math.max(sw,sh));
    const width=Math.max(1,Math.round(sw*scale)),height=Math.max(1,Math.round(sh*scale));
    const radius=blurValue(value),fogRadius=Math.hypot(8,radius),pad=Math.ceil(Math.hypot(8,24)*3);
    for(const canvas of [this.sharp,this.blurred,this.fog]){
      if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    }
    if(this.extended.width!==width+pad*2)this.extended.width=width+pad*2;
    if(this.extended.height!==height+pad*2)this.extended.height=height+pad*2;
    const [sharp,background,fog,edge,lens]=this.contexts;
    sharp.filter='none';sharp.drawImage(source,0,0,width,height);
    // Codrops renders its foreground at 96 x 64. Keep that soft optical detail,
    // while preserving this video's aspect ratio and shared frame timing.
    const lensHeight=Math.max(1,Math.round(96*height/width));
    if(this.lens.width!==96)this.lens.width=96;if(this.lens.height!==lensHeight)this.lens.height=lensHeight;
    lens.drawImage(this.sharp,0,0,96,lensHeight);
    // Extend the edge pixels before filtering, so cover/parallax never reveals dark blur borders.
    const xs=[[0,1,0,pad],[0,width,pad,width],[width-1,1,pad+width,pad]];
    const ys=[[0,1,0,pad],[0,height,pad,height],[height-1,1,pad+height,pad]];
    for(const [sx,sWidth,dx,dWidth] of xs)for(const [sy,sHeight,dy,dHeight] of ys)
      edge.drawImage(this.sharp,sx,sy,sWidth,sHeight,dx,dy,dWidth,dHeight);
    if(radius){background.filter=`blur(${radius}px)`;background.drawImage(this.extended,-pad,-pad);}
    fog.filter=`blur(${fogRadius}px)`;fog.drawImage(this.extended,-pad,-pad);
    this.background=radius?this.blurred:this.sharp;
    return true;
  }
}
