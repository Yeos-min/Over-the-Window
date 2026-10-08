// One captured pointer draws continuous strokes; hovering never wipes the glass.
export function initFingerDrawing(canvas,{enabled=()=>true,project,onStroke,radius=14}){
  let pointer=null,last=null;
  const cancel=()=>{
    const id=pointer;pointer=null;last=null;
    canvas.classList.remove('wiping');
    if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  };
  const stroke=event=>{
    if(!enabled()){cancel();return;}
    const rect=canvas.getBoundingClientRect();
    if(!(rect.width>0&&rect.height>0)||!Number.isFinite(event.clientX+event.clientY))return;
    const point=project(event.clientX-rect.left,event.clientY-rect.top,rect.width,rect.height);
    onStroke(last?.x??point.x,last?.y??point.y,point.x,point.y,radius/(point.scale??1));
    last=point;
  };
  canvas.addEventListener('pointerdown',event=>{
    if(pointer!==null||event.button!==0||event.isPrimary===false||!enabled())return;
    pointer=event.pointerId;canvas.setPointerCapture(pointer);canvas.classList.add('wiping');event.preventDefault();stroke(event);
  });
  canvas.addEventListener('pointermove',event=>{
    if(event.pointerId!==pointer)return;
    if(event.pointerType==='mouse'&&event.buttons===0){cancel();return;}
    for(const sample of event.getCoalescedEvents?.()??[])stroke(sample);
    if(event.pointerId===pointer)stroke(event);
    event.preventDefault();
  });
  canvas.addEventListener('pointerup',event=>{
    if(event.pointerId!==pointer)return;
    stroke(event);cancel();
  });
  for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{
    if(event.pointerId===pointer)cancel();
  });
  canvas.ownerDocument.defaultView.addEventListener('blur',cancel);
  return {cancel,get drawing(){return pointer!==null;}};
}
