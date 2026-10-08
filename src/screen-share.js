import {SharedBackground} from './shared-background.js';

// Ask only from a user's click. Cancelled or superseded choices must never install a late stream.
export class ScreenShare{
  constructor({getMedia=globalThis.navigator?.mediaDevices?.getDisplayMedia?.bind(globalThis.navigator.mediaDevices),
    createBackground=(stream,onEnded)=>new SharedBackground(stream,{onEnded}),onConnected=()=>{},onStopped=()=>{},onState=()=>{}}={}){
    Object.assign(this,{getMedia,createBackground,onConnected,onStopped,onState});
    this.generation=0;this.pending=false;this.active=false;this.source=null;
    this.notify(getMedia?'idle':'unsupported',getMedia?'다른 탭이나 창을 배경으로 선택해보세요.':'이 브라우저는 화면 공유를 지원하지 않아요. Chrome 또는 Edge에서 열어주세요.');
  }
  notify(state,message){this.state=state;this.onState(state,message);}
  async start(){
    if(!this.getMedia||this.pending||this.active)return;
    const generation=++this.generation;this.pending=true;
    this.notify('requesting','영상이 재생 중인 다른 탭이나 창을 선택해주세요.');
    let stream;
    try{
      // No await before the chooser: retain the initiating click's transient activation.
      stream=await this.getMedia({video:true,audio:false,selfBrowserSurface:'exclude',surfaceSwitching:'include',systemAudio:'exclude'});
      if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return;}
      if(!stream.getVideoTracks().some(track=>track.readyState!=='ended'))throw new Error('no-video');
      const source=this.createBackground(stream,()=>{if(this.source===source)this.stop();});this.source=source;
      this.notify('loading','선택한 화면을 불러오는 중…');
      await source.load();
      if(generation!==this.generation)return;
      this.active=true;this.pending=false;this.onConnected(source);
      this.notify('active','공유 화면에 빗방울과 굴절을 적용하고 있어요. 영상 조작은 원래 탭이나 창에서 해주세요.');
    }catch(error){
      if(generation!==this.generation)return;
      if(!this.source)stream?.getTracks().forEach(track=>track.stop());
      this.stop(false);
      const cancelled=error.name==='NotAllowedError'||error.name==='AbortError';
      this.notify(cancelled?'idle':'error',cancelled?'화면 선택을 취소했어요. 기존 배경을 유지합니다.':'화면을 연결하지 못했어요. 재생 중인 탭이나 창을 다시 선택해주세요.');
    }
  }
  stop(notify=true){
    this.generation++;this.pending=false;
    const active=this.active,source=this.source;this.active=false;this.source=null;
    source?.dispose();if(active)this.onStopped();
    if(notify&&this.getMedia)this.notify('idle','화면 공유를 종료하고 기본 배경으로 돌아왔어요.');
  }
}
