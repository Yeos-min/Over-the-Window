export class Condensation {
  constructor(){this.reset();}
  reset(){this.level=0;this.clearing=false;this.elapsed=0;this.from=0;this.cooldown=0;}
  get canClear(){return !this.clearing&&this.level>=.03;}
  clear(){
    if(!this.canClear)return false;
    this.from=this.level;this.elapsed=0;this.clearing=true;return true;
  }
  update(dt){
    if(!Number.isFinite(dt)||dt<=0)return;
    if(this.clearing){
      this.elapsed+=dt;const t=Math.min(1,this.elapsed/5);
      this.level=this.from*(1-t*t*(3-2*t));
      if(t===1){this.level=0;this.clearing=false;this.cooldown=8;}
    }else if(this.cooldown>0){this.cooldown=Math.max(0,this.cooldown-dt);}
    else this.level=Math.min(.65,this.level+dt*.65/70);
  }
}
