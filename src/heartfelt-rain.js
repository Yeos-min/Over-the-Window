const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
// Shader clocks advance only with the app simulation, never wall-clock iTime.
export class HeartfeltRain{
  constructor(){this.reset();}
  reset(){this.time=12;this.staticTime=12;this.drift=0;this.wind=0;this.amount=.65;}
  update(dt,music={},wind=0){
    if(!Number.isFinite(dt)||dt<=0)return;
    const treble=clamp(music.treble||0,0,1),level=clamp(music.level||0,0,1);
    this.time+=dt*.2*(1+treble*2);
    this.staticTime+=dt*.2;
    this.wind+=(clamp(Number.isFinite(wind)?wind:0,-1,1)-this.wind)*(1-Math.exp(-dt/.65));
    this.drift+=dt*this.wind*.025;
    this.amount+=(.65+.35*level-this.amount)*(1-Math.exp(-dt*3));
  }
}
