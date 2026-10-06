// Area-based approximation: mass = radius² (not a 3D volume simulation).
import {surfaceContact,surfaceShape} from './surface-contact.js';
import {followFlow} from './drop-orientation.js';
export const clamp = (x,a,b) => Math.max(a, Math.min(b,x));
export const MAX_DROP_RADIUS=20;
export const WIND_FORCE=240; // Previously 120: twice the force at the same bezel setting.
export const QUIET_RAIN_FACTOR=.4;
const quietSeedCount=(w,h)=>Math.round(clamp(Math.round(w*h/6500),55,180)*QUIET_RAIN_FACTOR);
export const rainPopulationLimit=(w,h,music={})=>{
  const quiet=clamp(Math.round(w*h/16000),32,96);
  const level=clamp(music.level||0,0,1);
  return Math.round(quiet+(420-quiet)*level**1.25);
};
export const sizeSpeedFactor=r=>1+.3*clamp((r-10)/10,0,1);
export const newbornRadius=rng=>4+clamp(rng(),0,1)**2*6;
const trailDensity=r=>{
  const t=clamp((r-10)/8,0,1);
  return .15+1.85*t*t*(3-2*t);
};
// Artistic glass-water model: lateral response falls with size, not a free-air solver.
export const windMobility=r=>clamp((8/Math.max(4,r))**1.6,.23,1.35);
export const lightDropFactor=r=>{
  const t=clamp((8-r)/4,0,1);
  return t*t*(3-2*t);
};
// Independent musical controls: volume creates rain, treble accelerates; bass has no separate effect.
export function musicResponse(music={}){
  const level=clamp(music.level||0,0,1),treble=clamp(music.treble||0,0,1);
  // A fixed gravity baseline plus an additive treble boost (never a multiplier).
  // Quiet rain is 2/5 of its former rate; leave the loud-music peak unchanged.
  const quiet=1.75*QUIET_RAIN_FACTOR;
  return {spawnRate:quiet+(47.625-quiet)*Math.pow(level,1.25),acceleration:144+972*treble*treble,releaseRate:.7+treble*2.5,treble};
}
export function merge(a,b,variation=1) {
  const m = a.mass+b.mass;
  // A short surface-tension pull toward the absorbed bead, not random jitter.
  const side=clamp((b.x-a.x)/Math.max(1,a.r+b.r),-1,1);
  const pull=(a.flowing||b.flowing)?side*Math.sqrt(b.mass/m)*150*variation:0;
  a.mergePull=clamp(((a.mergePull||0)*a.mass+(b.mergePull||0)*b.mass)/m+pull,-45,45);
  a.vx=(a.vx*a.mass+b.vx*b.mass)/m;
  a.vy=(a.vy*a.mass+b.vy*b.mass)/m;
  a.windAcceleration=((a.windAcceleration||0)*a.mass+(b.windAcceleration||0)*b.mass)/m;
  a.x=(a.x*a.mass+b.x*b.mass)/m;
  a.y=(a.y*a.mass+b.y*b.mass)/m;
  a.mass=m; a.r=Math.sqrt(m); a.flowing=true; a.wobble=0.22;
  a.contact=null; // Fresh merged mass breaks adhesion and starts a new short slide.
  a.slip=.25; a.vy=Math.max(a.vy,18); a.spreadX=.3; a.spreadY=.5;
  b.dead=true;
  return a;
}
export function makeDrop(x,y,r,flowing=false) {
  return {x,y,r,mass:r*r,vx:0,vy:0,rotation:0,mergePull:0,wobble:0,dead:false,age:0,trailDistance:0,flowing,slip:0,rest:0,spreadX:.8,spreadY:.65};
}
export function integrate(d,dt,tilt,active,music={},rng=Math.random,wind=0) {
  if(!active) return;
  const response=musicResponse(music),treble=response.treble;
  const size=clamp((d.r-5)/22,0,1.8);
  d.rest=Math.max(0,d.rest-dt);
  const release=size*response.releaseRate;
  if(d.slip<=0&&d.rest<=0&&rng()<1-Math.exp(-release*dt)){
    d.slip=.18+rng()*.5+treble*.35;d.spreadY+=.22;
  }
  // Once released, runoff keeps its baseline gravity when treble disappears.
  // Newly formed stationary beads can still adhere until they release or merge.
  if(d.slip>0)d.flowing=true;
  if(d.flowing){d.slip=Math.max(d.slip,dt*2);d.rest=0;}
  if(d.slip>0){
    d.slip-=dt;
    const strength=clamp(d.r/22,.35,1.8);
    d.vx+=tilt*292.5*strength*dt;
    // Heavy runoff sags downward: weaker lateral acceleration and slower response.
    // Wind acceleration is independent of falling velocity and musical treble.
    const air=clamp(Number.isFinite(wind)?wind:0,-1,1);
    // Strong wind carries tiny sliding beads mostly sideways. Gravity stays positive
    // and unchanged; weak wind and beads of radius >= 8 retain the previous response.
    const carry=1+2.6*lightDropFactor(d.r)*air*air;
    const speedGain=1+.6*Math.abs(air)*clamp(10/Math.max(4,d.r),.25,1);
    const windTarget=air*WIND_FORCE*speedGain*windMobility(d.r)*carry;
    const windLag=.12+.65*clamp((d.r-4)/16,0,1)**2;
    d.windAcceleration=(d.windAcceleration||0)+(windTarget-(d.windAcceleration||0))*(1-Math.exp(-dt/windLag));
    d.vx+=d.windAcceleration*dt;
    d.vx+=(d.mergePull||0)*dt;
    // Runoff retains baseline speed as it sheds small trail beads.
    const sizeBoost=sizeSpeedFactor(d.r);
    const fallStrength=.75*sizeBoost;
    d.vy+=response.acceleration*fallStrength*dt;
    d.vx*=Math.exp(-2*dt);d.vy*=Math.exp(-1.8*dt);
    d.vy=Math.min(540*sizeBoost,d.vy);
    if(d.slip<=0)d.rest=(.5+rng()*1.8)/(1+treble*2);
  }else{
    d.windAcceleration=0;
    // Adhesion is dry friction: velocity reaches exactly zero, unlike endless drag.
    const friction=80*dt;
    d.vx=Math.sign(d.vx)*Math.max(0,Math.abs(d.vx)-friction);
    d.vy=Math.max(0,d.vy-friction);
  }
  d.x+=d.vx*dt; d.y+=d.vy*dt;
  followFlow(d,dt);
  d.mergePull=(d.mergePull||0)*Math.exp(-1.8*dt);
  d.wobble*=Math.exp(-6*dt);
  d.spreadX*=Math.exp(-7*dt);d.spreadY*=Math.exp(-4*dt);
}
export class RainPhysics {
  constructor(width,height,rng=Math.random){this.rng=rng;this.resize(width,height);this.reset();}
  resize(w,h){
    if(this.drops) for(const d of this.drops){d.x*=w/this.width;d.y*=h/this.height;}
    this.width=w;this.height=h;
  }
  reset(){
    this.drops=[];this.merges=0;this.active=true;this.spawnClock=0;this.windBeadClock=0;
    const count=quietSeedCount(this.width,this.height);
    for(let i=0;i<count;i++){const d=makeDrop(this.rng()*this.width,this.rng()*this.height,newbornRadius(this.rng));this.drops.push(d);}
    // Begin with a few ordinary runoff drops; none is selected or privileged.
    this.drops.slice(0,Math.max(1,Math.round(count*.06))).forEach(d=>{d.flowing=true;});
  }
  step(dt,tilt,onTrail=()=>{},absorbSmall=()=>[],releaseWind=()=>[]){
    if(!this.active&&!this.ambient)return;
    const target=clamp(Number.isFinite(this.windTarget)?this.windTarget:0,-1,1);
    this.wind=(this.wind||0)+(target-(this.wind||0))*(1-Math.exp(-dt/ .65));
    const populationLimit=rainPopulationLimit(this.width,this.height,this.music);
    const trailLimit=Math.min(350,populationLimit);
    const trails=[];
    for(const d of this.drops){
      d.age+=dt;
      const px=d.x,py=d.y;
      const sliding=surfaceContact(d,dt,this.wind,this.rng);
      integrate(d,dt,tilt,sliding,this.music,this.rng,this.wind);
      surfaceShape(d,dt);
      if(sliding||Math.hypot(d.x-px,d.y-py)>.05)for(const bead of absorbSmall(d.x,d.y,d.r)){
        merge(d,makeDrop(bead.x,bead.y,bead.r),.65+this.rng()*1.1);this.merges++;
        if(d.r>MAX_DROP_RADIUS){d.r=MAX_DROP_RADIUS;d.mass=MAX_DROP_RADIUS**2;}
      }
      if(Math.hypot(d.x-px,d.y-py)>.05) onTrail(px,py,d.x,d.y,d.r);
      const distance=Math.hypot(d.x-px,d.y-py);
      if(d.r<=10){d.trailDistance=0;d.trailGap=null;}
      else if(sliding&&distance>.001){
        d.trailDistance+=distance;
        // Keep one random gap until it is crossed. Larger parents cross it more
        // often: max-size spacing averages 6px, versus about 12px previously.
        if(d.trailGap==null)d.trailGap=8+this.rng()*8;
        let emitted=0;
        while(d.r>10&&d.trailDistance>=d.trailGap/trailDensity(d.r)&&emitted<2&&this.drops.length+trails.length<trailLimit){
          d.trailDistance-=d.trailGap/trailDensity(d.r);
          const dx=(d.x-px)/distance,dy=(d.y-py)/distance;
          const behind=d.r*.8+d.trailDistance,side=(this.rng()-.5)*d.r*.08;
          const r=clamp(d.r*(.12+this.rng()*.04),1.5,3.2);
          const t=makeDrop(d.x-dx*behind-dy*side,d.y-dy*behind+dx*side,r);
          t.spreadX=.05;t.spreadY=.08+this.rng()*.1;t.rotation=d.rotation;
          t.contact={phase:'rest',time:2+this.rng()*2};
          t.parent=d;trails.push(t);d.mass-=t.mass;d.r=Math.sqrt(d.mass);
          d.trailGap=8+this.rng()*8;emitted++;
        }
        // Do not build a delayed burst while the bounded population is full.
        if(this.drops.length+trails.length>=trailLimit)d.trailDistance=Math.min(d.trailDistance,d.trailGap/trailDensity(d.r));
      }
      if(d.r<10&&d.age>25){d.r=Math.max(0,d.r-dt*.3);d.mass=d.r*d.r;if(d.r<1)d.dead=true;}
      if(d.y>this.height+d.r*1.5||d.x< -d.r||d.x>this.width+d.r)d.dead=true;
    }
    // Small bounded population; inspect each pair once, including equal-sized drops.
    for(let i=0;i<this.drops.length;i++)for(let j=i+1;j<this.drops.length;j++){
      let a=this.drops[i],b=this.drops[j];
      if(a.dead||b.dead||(!a.flowing&&!b.flowing&&a.r<14&&b.r<14))continue;
      if((a.parent===b&&a.age<1)||(b.parent===a&&b.age<1))continue;
      let distance=Math.hypot(a.x-b.x,a.y-b.y);
      if(distance<(a.r+b.r)*.45){
        if(b.mass>a.mass)[a,b]=[b,a];
        const mergeX=a.x,mergeY=a.y;
        merge(a,b,.65+this.rng()*1.1);this.merges++;
        if(a.r>MAX_DROP_RADIUS){a.r=MAX_DROP_RADIUS;a.mass=MAX_DROP_RADIUS**2;} // Absorption still steers at the size limit.
        // Join the previous trail to the merged center so the clear path stays continuous.
        if(Math.hypot(a.x-mergeX,a.y-mergeY)>.05)onTrail(mergeX,mergeY,a.x,a.y,a.r);
      }
    }
    this.drops=this.drops.filter(d=>!d.dead).concat(trails);
    // Release a small, height-balanced portion of the glass's fine-bead layer.
    // Wind force is uniform over the window; tiny beads keep their actual mass.
    this.windBeadClock=(this.windBeadClock||0)+dt*48*Math.abs(this.wind)**1.5;
    if(Math.abs(this.wind)<.02)this.windBeadClock=0;
    const windBudget=Math.max(0,Math.min(Math.floor(this.windBeadClock),populationLimit-this.drops.length,12));
    if(windBudget>0){
      const beads=releaseWind(this.wind,windBudget);
      for(const bead of beads){
        const d=makeDrop(bead.x,bead.y,bead.r,true);d.spreadX=.1;d.spreadY=.1;
        this.drops.push(d);
      }
      this.windBeadClock=Math.min(12,Math.max(0,this.windBeadClock-windBudget));
    }
    if(this.drops.length>=populationLimit)this.windBeadClock=0;
    // Volume controls only ordinary rain births, preserving the quiet baseline.
    this.spawnClock+=dt*musicResponse(this.music).spawnRate;
    while(this.spawnClock>=1&&this.drops.length<populationLimit){
      this.spawnClock--;const d=makeDrop(this.rng()*this.width,this.rng()*this.height,newbornRadius(this.rng));
      this.drops.push(d);
    }
    // A falling volume limits new arrivals; existing water exits naturally.
    if(this.drops.length>=populationLimit)this.spawnClock=0;
  }
}
