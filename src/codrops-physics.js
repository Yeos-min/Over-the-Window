// Adapted from Lucas Bebber / Codrops RainEffect (updateRain/updateDrops).
// https://github.com/codrops/RainEffect/blob/master/src/raindrops.js
// Changes: mass-based fall speed, fixed timestep, bounded population and wind/audio controls.
import {clamp,makeDrop,windMobility,lightDropFactor} from './physics.js';
import {followFlow} from './drop-orientation.js';
import {DEFAULT_MASS_SCALE,massScale,dropMass} from './drop-mass.js';
import {pathVelocity} from './path-noise.js';
import {newDropShape,followDropShape,pulseDrop} from './drop-shape.js';
import {DEFAULT_TURN_DRAG,newTurnDrag,turnRetention} from './turn-drag.js';
import {touchesFinger} from './finger-collision.js';
import {surfaceSpeed,adhesionSeconds} from './surface-friction.js';
import {rainIntensity,rainInterval} from './rain-intensity.js';

export const DROP_SCALE=.4;
export const MIN_RADIUS=8*DROP_SCALE,MAX_RADIUS=36*DROP_SCALE;
export const BIRTH_MAX_RADIUS=MIN_RADIUS+12*DROP_SCALE;
export const GRAVITY=9.81;
// Mass * gravity supplies release speed; retained slide momentum permits adhesion.
const updateFallSpeed=(d,scale)=>{
  d.mass=dropMass(d.r,scale);d.fallSpeed=d.mass*GRAVITY;
  d.vy=d.fallSpeed*d.slide*(d.turnDrag?.retention??1);d.flowing=d.vy>0;
};
const releaseDrop=(d,scale)=>{
  const resting=!d.flowing;
  if(resting){d.turnDrag=newTurnDrag();d.restTime=0;d.slide=1;delete d.trailRadius;}
  updateFallSpeed(d,scale);
};
const radius=rng=>MIN_RADIUS+(BIRTH_MAX_RADIUS-MIN_RADIUS)*clamp(rng(),0,1)**3;
export class CodropsPhysics{
  constructor(width,height,rng=Math.random){this.rng=rng;this.width=width;this.height=height;this.active=true;this.massScale=DEFAULT_MASS_SCALE;this.pathNoise=1;this.turnDragStrength=DEFAULT_TURN_DRAG;this.rainIntensity=1;this.reset();}
  setRainIntensity(value){this.rainIntensity=rainIntensity(value);if(!this.rainIntensity)this.spawnClock=0;}
  setTurnDrag(value){
    this.turnDragStrength=clamp(Number.isFinite(value)?value:DEFAULT_TURN_DRAG,0,4);
    if(this.turnDragStrength===0)for(const d of this.drops){d.turnDrag=newTurnDrag();updateFallSpeed(d,this.massScale);}
  }
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
    d.turnDrag=newTurnDrag();
    updateFallSpeed(d,this.massScale);
    d.pathSeed=Math.floor(this.rng()*0x7fffffff);d.pathPhase=this.rng()*256;
    d.pathDistance=0;d.pathVx=0;
    d.travelDistance=0;d.restCycle=0;
    d.restTime=0;d.restMass=0;
    d.nextSpawn=MIN_RADIUS+this.rng()*(MAX_RADIUS-MIN_RADIUS);
    d.lastSpawn=0;d.shrink=0;d.momentumX=0;d.windVx=0;d.isNew=true;
    return d;
  }
  reset(){
    this.drops=[];this.merges=0;this.spawnClock=0;this.spawnArrival=rainInterval(this.rng);this.windBeadClock=0;
    const count=Math.round(clamp(this.width*this.height/11000,24,100)*this.rainIntensity);
    for(let i=0;i<count;i++)this.drops.push(this.drop(this.rng()*this.width,this.rng()*this.height,radius(this.rng),i%5===0));
  }
  impact(drop){
    if(drop.x>=0&&drop.x<=this.width&&drop.y>=0&&drop.y<=this.height)this.onImpact?.(drop);
  }
  gatherFinger(x0,y0,x1,y1,radius,beads){
    const bodies=this.drops.filter(d=>!d.dead&&touchesFinger(d,x0,y0,x1,y1,radius));
    if(!bodies.length&&(!beads.length||this.drops.length>=1320))return null;
    let area=0,x=0,y=0,target;
    for(const d of bodies){if(!target||d.r>target.r)target=d;}
    for(const d of [...bodies,...beads]){const weight=d.r*d.r;area+=weight;x+=d.x*weight;y+=d.y*weight;}
    x/=area;y/=area;
    if(!target){target=this.drop(x,y,Math.sqrt(area));this.drops.push(target);}
    else for(const d of bodies)if(d!==target)d.dead=true;
    // Finger collection keeps all water, including growth beyond ordinary births.
    target.r=Math.sqrt(area);target.x=x;target.y=y;target.fingerMerged=true;
    target.flowing=false;target.slide=0;target.shrink=0;target.momentumX=target.windVx=target.pathVx=target.vx=0;
    target.isNew=true;releaseDrop(target,this.massScale);
    if(target.heartfelt)target.heartfelt.free=true;
    pulseDrop(target,.5);this.merges+=bodies.length+beads.length-1;
    this.drops=this.drops.filter(d=>!d.dead);return target;
  }
  absorb(a,b){
    const dx=b.x-a.x,oldArea=a.r*a.r;
    pulseDrop(a,b.r*b.r/(a.r*a.r+b.r*b.r));
    // Codrops absorbs 80% of the other radius-squared area.
    a.fingerMerged=Boolean(a.fingerMerged||b.fingerMerged);
    const combined=Math.sqrt(a.r*a.r+b.r*b.r*(a.fingerMerged?1:.8));
    a.r=a.fingerMerged?combined:Math.min(MAX_RADIUS,combined);
    // Contacts add only the accepted water's share; capped bodies cannot regain
    // full momentum on every collision and remain permanently in motion.
    const accepted=Math.max(0,a.r*a.r-oldArea);
    if(a.flowing)a.slide=Math.min(1,a.slide+accepted/(oldArea+accepted));
    a.momentumX+=dx*.1;
    a.spreadX=a.spreadY=0;b.dead=true;this.merges++;
    if(a.restTime>0&&accepted<oldArea*.1)updateFallSpeed(a,this.massScale);
    else releaseDrop(a,this.massScale);
    if(a.heartfelt)a.heartfelt.free=true;
  }
  absorbMicro(d,beads){
    if(!beads.length)return;
    let area=0,x=0;const old=d.r*d.r;
    for(const bead of beads){const mass=bead.r*bead.r*(d.fingerMerged?1:.8);area+=mass;x+=bead.x*mass;}
    if(!(area>0))return;
    const share=area/(old+area);
    d.r=d.fingerMerged?Math.sqrt(old+area):Math.min(MAX_RADIUS,Math.sqrt(old+area));
    const accepted=Math.max(0,d.r*d.r-old),momentumShare=accepted/(old+accepted);
    d.momentumX+=(x/area-d.x)*.1*share;
    // Tiny contacts replenish only their area share, avoiding a full restart
    // on every microbead crossed by a dense-field moving head.
    if(d.restTime>0){
      if(dropMass(d.r,this.massScale)>=d.restMass*1.25)releaseDrop(d,this.massScale);
    }else d.slide=Math.min(1,d.slide+momentumShare);
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
        const previousVy=d.vy,baseVy=d.fallSpeed*d.slide;
        const vx=d.momentumX*60+d.windVx+wiggle/dt*d.slide+pathVelocity(d,dt,this.pathNoise,baseVy);
        const retention=turnRetention(d,vx,baseVy,dt,this.turnDragStrength);
        updateFallSpeed(d,this.massScale);d.vx=vx*retention;
        // Noise is attached to distance actually travelled, including bend loss.
        d.pathDistance+=(d.vy-previousVy)*dt;
        d.x+=d.vx*dt;d.y+=d.vy*dt;
        this.absorbMicro(d,absorbSmall(d.x,d.y,d.r,px,py));
      }else{d.vx=0;d.windVx=0;}
      // Local dry friction and travelled length replace the shared settling deadline.
      const distance=Math.hypot(d.x-px,d.y-py);d.travelDistance+=distance;
      let slowed=surfaceSpeed(d,d.vy,distance,dt);
      if(slowed<1.5)slowed=0;
      if(d.flowing&&slowed===0){
        // Larger drops hold for less time; keep adhesion within 0.5–1 second.
        d.restCycle++;d.restTime=adhesionSeconds(d,MAX_RADIUS);d.restMass=d.mass;
      }
      const retained=d.vy>0?slowed/d.vy:0;
      d.vx*=retained;d.windVx*=retained;d.pathVx*=retained;d.momentumX*=retained;
      const baseSpeed=d.fallSpeed*(d.turnDrag?.retention??1);
      d.slide=baseSpeed>0?slowed/baseSpeed:0;
      updateFallSpeed(d,this.massScale);
      if(!d.flowing){d.vx=0;d.windVx=0;d.pathVx=0;d.momentumX=0;d.turnDrag.angle=null;}
      d.momentumX*=.7**timeScale;
      followFlow(d,dt);
      followDropShape(d,dt);
      // The new segment must use the same inertia/rotation state as this frame's body.
      if(distance>0)onTrail(px,py,d.x,d.y,d.r,d);
      if(d.y>this.height+d.r*1.5||d.x< -d.r||d.x>this.width+d.r)d.dead=true;
    }
    // Local grid keeps fine moving heads and ordinary drops in one collision
    // system without a quadratic scan across the dense visual field.
    const cells=new Map();let largest=MAX_RADIUS,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(let i=0;i<this.drops.length;i++){
      const d=this.drops[i];if(d.dead)continue;
      largest=Math.max(largest,d.r);
      const cx=Math.floor(d.x/32),cy=Math.floor(d.y/32),key=`${cx},${cy}`;
      minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy);
      if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);
    }
    for(let i=0;i<this.drops.length;i++){
      const drop=this.drops[i];if(drop.dead)continue;
      const cx=Math.floor(drop.x/32),cy=Math.floor(drop.y/32);
      const reach=Math.max(1,Math.ceil((drop.r+largest)*(.45+drop.vy/60*.0002)/32));
      const left=Math.max(cx-reach,minX),right=Math.min(cx+reach,maxX);
      const top=Math.max(cy-reach,minY),bottom=Math.min(cy+reach,maxY);
      for(let yy=top;yy<=bottom;yy++)for(let xx=left;xx<=right;xx++)for(const j of cells.get(`${xx},${yy}`)||[]){
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
    this.spawnClock+=dt*(16+31.625*level**1.25)*this.rainIntensity;
    while(this.rainIntensity>0&&this.spawnClock>=this.spawnArrival&&physicalCount<limit){
      this.spawnClock-=this.spawnArrival;this.spawnArrival=rainInterval(rng);
      const drop=this.drop(rng()*this.width,rng()*this.height*.95,radius(rng),true);
      this.drops.push(drop);this.impact(drop);
      physicalCount++;
    }
    if(physicalCount>=limit){this.spawnClock=0;this.windBeadClock=0;}
  }
}
