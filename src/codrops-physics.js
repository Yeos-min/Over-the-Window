// Adapted from Lucas Bebber / Codrops RainEffect (updateRain/updateDrops).
// https://github.com/codrops/RainEffect/blob/master/src/raindrops.js
// Changes: mass-based fall speed, fixed timestep, bounded population and wind/audio controls.
import {clamp,makeDrop,windMobility,lightDropFactor} from './physics.js';
import {followFlow} from './drop-orientation.js';
import {DEFAULT_MASS_SCALE,massScale,dropMass} from './drop-mass.js';
import {pathVelocity} from './path-noise.js';
import {newDropShape,followDropShape,pulseDrop} from './drop-shape.js';

export const DROP_SCALE=.4;
export const MIN_RADIUS=8*DROP_SCALE,MAX_RADIUS=36*DROP_SCALE;
export const BIRTH_MAX_RADIUS=MIN_RADIUS+12*DROP_SCALE;
export const GRAVITY=9.81;
// Mass * gravity supplies release speed; retained slide momentum permits adhesion.
const updateFallSpeed=(d,scale)=>{
  d.mass=dropMass(d.r,scale);d.fallSpeed=d.mass*GRAVITY;
  d.vy=d.fallSpeed*d.slide;d.flowing=d.vy>0;
};
const releaseDrop=(d,scale)=>{
  const resting=!d.flowing;
  if(resting){d.slideTime=0;d.restTime=0;d.slideDuration=.5+.7*clamp(d.r/MAX_RADIUS,0,1)+.35*(d.pathPhase%1);}
  // Continuous contacts must not reset an already settling drop every frame.
  if(resting||d.slideTime<d.slideDuration)d.slide=1;
  updateFallSpeed(d,scale);
};
const radius=rng=>MIN_RADIUS+(BIRTH_MAX_RADIUS-MIN_RADIUS)*clamp(rng(),0,1)**3;
export class CodropsPhysics{
  constructor(width,height,rng=Math.random){this.rng=rng;this.width=width;this.height=height;this.active=true;this.massScale=DEFAULT_MASS_SCALE;this.pathNoise=1;this.reset();}
  setMassScale(value){
    const old=this.massScale;this.massScale=massScale(value);
    for(const d of this.drops){d.restMass*=this.massScale/old;updateFallSpeed(d,this.massScale);}
  }
  setPathNoise(value){
    this.pathNoise=clamp(Number.isFinite(value)?value:1,0,4);
    if(this.pathNoise===0)for(const d of this.drops)d.pathVx=0;
  }
  resize(width,height){
    this.drops=this.drops.filter(d=>!d.heartfelt);
    for(const d of this.drops){d.x*=width/this.width;d.y*=height/this.height;}
    this.width=width;this.height=height;
  }
  drop(x,y,r,moving=false){
    const d=makeDrop(x,y,r,moving);
    d.spreadX=d.spreadY=moving?1.5:0;
    d.slide=moving?1:0;
    d.shape=newDropShape();
    updateFallSpeed(d,this.massScale);
    d.pathSeed=Math.floor(this.rng()*0x7fffffff);d.pathPhase=this.rng()*256;
    d.pathDistance=0;d.pathVx=0;
    d.slideTime=0;d.slideDuration=.5+.7*clamp(r/MAX_RADIUS,0,1)+.35*(d.pathPhase%1);
    d.restTime=0;d.restMass=0;
    d.nextSpawn=MIN_RADIUS+this.rng()*(MAX_RADIUS-MIN_RADIUS);
    d.lastSpawn=0;d.shrink=0;d.momentumX=0;d.windVx=0;d.isNew=true;
    return d;
  }
  reset(){
    this.drops=[];this.merges=0;this.spawnClock=0;this.windBeadClock=0;
    const count=Math.round(clamp(this.width*this.height/11000,24,100));
    for(let i=0;i<count;i++)this.drops.push(this.drop(this.rng()*this.width,this.rng()*this.height,radius(this.rng),i%5===0));
  }
  impact(drop){
    if(drop.x>=0&&drop.x<=this.width&&drop.y>=0&&drop.y<=this.height)this.onImpact?.(drop);
  }
  absorb(a,b){
    const dx=b.x-a.x;
    pulseDrop(a,b.r*b.r/(a.r*a.r+b.r*b.r));
    // Codrops absorbs 80% of the other radius-squared area.
    a.r=Math.min(MAX_RADIUS,Math.sqrt(a.r*a.r+b.r*b.r*.8));
    a.momentumX+=dx*.1;
    a.spreadX=a.spreadY=0;b.dead=true;this.merges++;
    releaseDrop(a,this.massScale);
    if(a.heartfelt)a.heartfelt.free=true;
  }
  absorbMicro(d,beads){
    if(!beads.length)return;
    let area=0,x=0;const old=d.r*d.r;
    for(const bead of beads){const mass=bead.r*bead.r*.8;area+=mass;x+=bead.x*mass;}
    if(!(area>0))return;
    const share=area/(old+area);
    d.r=Math.min(MAX_RADIUS,Math.sqrt(old+area));
    d.momentumX+=(x/area-d.x)*.1*share;
    // Tiny contacts replenish only their area share, avoiding a full restart
    // on every microbead crossed by a dense-field moving head.
    if(d.restTime>0){
      if(dropMass(d.r,this.massScale)>=d.restMass*1.25)releaseDrop(d,this.massScale);
    }else if(d.slideTime<d.slideDuration)d.slide=Math.min(1,d.slide+share);
    this.merges+=beads.length;
    pulseDrop(d,share);
    updateFallSpeed(d,this.massScale);
    if(d.heartfelt)d.heartfelt.free=true;
  }
  step(dt,tilt,onTrail=()=>{},absorbSmall=()=>[],releaseWind=()=>[]){
    if((!this.active&&!this.ambient)||!Number.isFinite(dt)||dt<=0)return;
    const timeScale=dt*60,rng=this.rng,level=clamp(this.music?.level||0,0,1);
    const airTarget=clamp(Number.isFinite(this.windTarget)?this.windTarget:0,-1,1);
    this.wind=(this.wind||0)+(airTarget-(this.wind||0))*(1-Math.exp(-dt/.65));
    const quiet=Math.round(clamp(this.width*this.height/3000,120,280));
    const limit=Math.round(quiet+(420-quiet)*level**1.25),added=[];
    let physicalCount=this.drops.filter(d=>!d.heartfelt&&!d.dead).length;
    const room=()=>physicalCount+added.length<limit;
    for(const d of this.drops){
      if(d.dead)continue;
      d.age+=dt;const held=d.restTime>0;d.restTime=Math.max(0,d.restTime-dt);
      if(held&&d.restTime===0)releaseDrop(d,this.massScale);
      const px=d.x,py=d.y;
      let wiggle=0;
      if(d.heartfelt&&!d.heartfelt.free){
        const next=d.heartfelt.next;
        wiggle=(next.x-(d.heartfelt.sampleX??d.x))*this.pathNoise;d.heartfelt.sampleX=next.x;
      }
      // Adhered beads can release on contact, wind or the original size-based chance.
      const release=clamp((d.r-MIN_RADIUS)*(.1/(MAX_RADIUS-MIN_RADIUS)),0,.9);
      if(!d.flowing&&d.restTime===0&&rng()<1-(1-release)**timeScale)releaseDrop(d,this.massScale);
      if(!d.flowing&&d.restTime===0&&Math.abs(this.wind)>.15&&rng()<1-Math.exp(-Math.abs(this.wind)*dt*2))releaseDrop(d,this.massScale);
      if(d.r<=MIN_RADIUS&&rng()<1-.95**timeScale)d.shrink+=.01;
      d.r-=d.shrink*timeScale;
      if(d.r<=0){d.dead=true;continue;}
      updateFallSpeed(d,this.massScale);let momentum=d.vy/60;
      d.lastSpawn+=momentum*timeScale;
      if(momentum>0&&d.lastSpawn>d.nextSpawn&&room()){
        const r=d.r*(.2+rng()*.15);
        const trail=this.drop(d.x+(rng()*2-1)*d.r*.1,d.y-d.r*.01,r);
        trail.spreadY=momentum*.1;trail.parent=d;
        added.push(trail);d.r*=.97**timeScale;
        updateFallSpeed(d,this.massScale);momentum=d.vy/60;
        d.lastSpawn=0;
        d.nextSpawn=Math.max(2,MIN_RADIUS+rng()*(MAX_RADIUS-MIN_RADIUS)-momentum*2+(MAX_RADIUS-d.r));
      }
      d.spreadX*=.4**timeScale;d.spreadY*=.7**timeScale;
      if(momentum>0){
        const carry=1+2.6*lightDropFactor(d.r)*this.wind*this.wind;
        d.windVx+=this.wind*240*windMobility(d.r)*carry*dt;
        d.windVx*=Math.exp(-2*dt);
        d.vx=d.momentumX*60+d.windVx+wiggle/dt*d.slide+pathVelocity(d,dt,this.pathNoise);
        d.x+=d.vx*dt;d.y+=d.vy*dt;
        this.absorbMicro(d,absorbSmall(d.x,d.y,d.r,px,py));
        onTrail(px,py,d.x,d.y,d.heartfelt?Math.min(d.r,MIN_RADIUS):d.r,d);
      }else{d.vx=0;d.windVx=0;}
      // Stronger dry friction plus a settling phase make adhesion visible even
      // when dense microcontacts would otherwise keep replenishing momentum.
      if(d.flowing)d.slideTime+=dt;
      let slowed=Math.max(0,d.vy-Math.max(1,MIN_RADIUS*.5/DROP_SCALE-d.vy/60)*.1*timeScale*60*.07);
      if(d.slideTime>=d.slideDuration)slowed*=Math.exp(-14*dt);
      if(slowed<1.5)slowed=0;
      if(d.flowing&&slowed===0){
        d.restTime=.5+.5*(d.pathPhase%1);d.restMass=d.mass;
      }
      const retained=d.vy>0?slowed/d.vy:0;
      d.vx*=retained;d.windVx*=retained;d.pathVx*=retained;d.momentumX*=retained;
      d.slide=d.fallSpeed>0?slowed/d.fallSpeed:0;
      updateFallSpeed(d,this.massScale);
      if(!d.flowing){d.vx=0;d.windVx=0;d.pathVx=0;d.momentumX=0;}
      d.momentumX*=.7**timeScale;
      followFlow(d,dt);
      followDropShape(d,dt);
      if(d.y>this.height+d.r*1.5||d.x< -d.r||d.x>this.width+d.r)d.dead=true;
    }
    // Local grid keeps fine moving heads and ordinary drops in one collision
    // system without a quadratic scan across the dense visual field.
    const cells=new Map();
    for(let i=0;i<this.drops.length;i++){
      const d=this.drops[i];if(d.dead)continue;
      const key=`${Math.floor(d.x/32)},${Math.floor(d.y/32)}`;
      if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);
    }
    for(let i=0;i<this.drops.length;i++){
      const drop=this.drops[i];if(drop.dead)continue;
      const cx=Math.floor(drop.x/32),cy=Math.floor(drop.y/32);
      for(let yy=cy-1;yy<=cy+1;yy++)for(let xx=cx-1;xx<=cx+1;xx++)for(const j of cells.get(`${xx},${yy}`)||[]){
        if(j<=i)continue;
        let a=this.drops[i],b=this.drops[j];
        if(a.dead||b.dead||a.parent===b||b.parent===a)continue;
        if(!a.flowing&&!b.flowing&&!a.isNew&&!b.isNew)continue;
        if(b.r>a.r)[a,b]=[b,a];
        const reach=(a.r+b.r)*(.45+a.vy/60*.0002);
        if(Math.hypot(a.x-b.x,a.y-b.y)<reach)this.absorb(a,b);
      }
    }
    for(const d of this.drops)d.isNew=false;
    this.drops=this.drops.filter(d=>!d.dead).concat(added);
    this.windBeadClock+=dt*48*Math.abs(this.wind)**1.5;
    physicalCount=this.drops.filter(d=>!d.heartfelt).length;
    const budget=Math.max(0,Math.min(12,Math.floor(this.windBeadClock),limit-physicalCount));
    if(budget){
      for(const bead of releaseWind(this.wind,budget)){this.drops.push(this.drop(bead.x,bead.y,bead.r,true));physicalCount++;}
      this.windBeadClock-=budget;
    }
    this.spawnClock+=dt*(16+31.625*level**1.25);
    while(this.spawnClock>=1&&physicalCount<limit){
      this.spawnClock--;const drop=this.drop(rng()*this.width,rng()*this.height*.95,radius(rng),true);
      this.drops.push(drop);this.impact(drop);
      physicalCount++;
    }
    if(physicalCount>=limit){this.spawnClock=0;this.windBeadClock=0;}
  }
}
