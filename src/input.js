import {clamp} from './physics.js';
export class TiltInput {
  constructor(canvas,{onStart,onSelect,onStatus,onSensor}){
    Object.assign(this,{canvas,onStart,onSelect,onStatus,onSensor});
    this.keys=new Set();this.pointer=null;this.pointerTilt=0;this.value=0;this.sensorValue=0;this.sensorActive=false;this.base=null;this.buttonTilt=0;this.impulse=0;
    window.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight'].includes(e.key)||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
      e.preventDefault();this.keys.add(e.key);this.impulse=(e.key==='ArrowLeft'?-1:1)*.3;onStart();
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.key));
    window.addEventListener('blur',()=>this.clear());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
    canvas.addEventListener('pointerdown',e=>{
      canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
      const rect=canvas.getBoundingClientRect();onSelect(e.clientX-rect.left,e.clientY-rect.top);
      this.pointer={id:e.pointerId,x:e.clientX};onStart();
    });
    canvas.addEventListener('pointermove',e=>{if(this.pointer?.id===e.pointerId)this.pointerTilt=clamp((e.clientX-this.pointer.x)/110,-1,1);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{this.pointer=null;this.pointerTilt=0;});
    this.orientation=e=>{
      if(!Number.isFinite(e.gamma)||!Number.isFinite(e.beta))return;
      const angle=(screen.orientation?.angle||0)*Math.PI/180;
      const x=e.gamma*Math.cos(angle)+e.beta*Math.sin(angle);
      if(this.base===null){this.base=x;onStatus('지금 자세가 기준이에요. 휴대폰을 천천히 좌우로 기울여보세요.');}
      const relative=x-this.base;
      this.sensorValue=Math.abs(relative)<2?0:clamp(relative/28,-1,1);
      this.sensorActive=true;clearTimeout(this.sensorTimer);onSensor(true);onStart();
    };
    screen.orientation?.addEventListener('change',()=>{this.base=null;this.sensorValue=0;});
  }
  clear(){this.keys.clear();this.pointer=null;this.pointerTilt=0;this.buttonTilt=0;this.impulse=0;this.value=0;this.sensorValue=0;}
  bindButton(button,dir){
    button.addEventListener('pointerdown',e=>{button.setPointerCapture(e.pointerId);this.buttonTilt=dir;button.classList.add('active');this.onStart();});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,()=>{this.buttonTilt=0;button.classList.remove('active');});
    button.addEventListener('click',()=>{this.impulse=dir*.55;this.onStart();});
  }
  update(dt){
    this.impulse*=Math.exp(-3*dt);
    let target=this.sensorActive?this.sensorValue:0;
    if(this.pointer)target=this.pointerTilt;
    if(this.buttonTilt)target=this.buttonTilt;
    if(this.keys.size)target=Number(this.keys.has('ArrowRight'))-Number(this.keys.has('ArrowLeft'));
    if(!this.keys.size&&!this.pointer&&!this.buttonTilt&&Math.abs(this.impulse)>.02)target=this.impulse;
    this.value+=(target-this.value)*(1-Math.exp(-8*dt));return this.value;
  }
  stopSensor(){
    window.removeEventListener('deviceorientation',this.orientation);clearTimeout(this.sensorTimer);
    this.sensorActive=false;this.sensorPending=false;this.sensorValue=0;this.base=null;this.onSensor(false);
  }
  async toggleSensor(){
    if(this.sensorActive||this.sensorPending){this.stopSensor();this.onStatus('키보드 또는 드래그로 조작하세요.');return;}
    if(!window.isSecureContext){this.onStatus('휴대폰 센서는 HTTPS 연결에서 사용할 수 있어요. 지금은 드래그로 조작하세요.');return;}
    if(!window.DeviceOrientationEvent){this.onStatus('기울기 센서를 사용할 수 없어요. 화면을 좌우로 드래그하세요.');return;}
    this.sensorPending=true;
    try{
      if(typeof DeviceOrientationEvent.requestPermission==='function'&&await DeviceOrientationEvent.requestPermission()!=='granted')throw new Error('denied');
      if(!this.sensorPending)return;
      this.base=null;window.addEventListener('deviceorientation',this.orientation);
      this.onStatus('휴대폰을 편하게 들고 잠시 기다려주세요.');
      this.sensorTimer=setTimeout(()=>{this.stopSensor();this.onStatus('기울기 신호가 없어요. 드래그나 방향 버튼을 사용하세요.');},4000);
    }catch{this.stopSensor();this.onStatus('센서 사용이 허용되지 않았어요. 드래그로도 조작할 수 있어요.');}
  }
}
