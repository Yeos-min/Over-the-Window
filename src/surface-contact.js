const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Contact cycle is separate from gravity/audio: resting beads do not mean rain stops.
export function surfaceContact(d,dt,wind,rng){
  const weight=clamp((d.r-4)/16,0,1),air=clamp(Math.abs(Number.isFinite(wind)?wind:0),0,1);
  if(!d.contact)d.contact={phase:d.flowing?'slide':'rest',time:d.flowing?.35+rng()*.7:.3+rng()*2.2};
  const state=d.contact;state.time-=dt*(state.phase==='rest'?1+air*3:1);
  if(state.phase==='slide'){
    if(state.time>0)return true;
    // Sustained strong wind keeps released water moving over the entire pane.
    if(air>=.7){state.time=.3+rng()*.5+weight*.4;return true;}
    state.phase='settle';state.time=.22+rng()*.16;
  }
  if(state.phase==='settle'){
    // Ease into adhesion, instead of snapping a fast drop to a stop.
    d.vx*=Math.exp(-18*dt);d.vy*=Math.exp(-18*dt);
    d.x+=d.vx*dt;d.y+=d.vy*dt;
    if(state.time<=0){
      d.vx=0;d.vy=0;d.windAcceleration=0;d.flowing=false;d.slip=0;
      state.phase='rest';state.time=(.5+rng()*2)/(1+weight*2+air);
    }
    return false;
  }
  if(state.time>0)return false;
  // Bigger drops release readily; strong wind can release the lightest beads too.
  const rate=.35+weight*2+air*air*(.5+1.5*(1-weight));
  if((air>=.7&&d.r<=10)||rng()<1-Math.exp(-rate*dt)){
    d.flowing=true;d.rest=0;d.slip=.2;d.spreadY+=.12;
    state.phase='slide';state.time=.35+rng()*.75+weight*.6+air*.25;
    return true;
  }
  return false;
}
export function surfaceShape(d,dt){
  const moving=d.contact?.phase==='slide'||Math.hypot(d.vx,d.vy)>1;
  const target=moving?clamp(Math.hypot(d.vx,d.vy)/280,0,.42):0;
  d.stretch=(d.stretch||0)+(target-(d.stretch||0))*(1-Math.exp(-dt/(moving?.12:.3)));
  if(!moving){
    d.spreadX*=Math.exp(-7*dt);d.spreadY*=Math.exp(-4*dt);d.wobble*=Math.exp(-6*dt);
    d.rotation=(d.rotation||0)*Math.exp(-4*dt);
  }
}
