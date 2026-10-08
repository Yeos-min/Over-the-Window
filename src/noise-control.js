export function initNoiseControl(input,output,physics){
  const publish=()=>{
    physics.setPathNoise(Number(input.value));input.value=physics.pathNoise.toFixed(1);
    output.textContent=`×${physics.pathNoise.toFixed(1)}`;
    input.setAttribute('aria-valuetext',`노이즈 강도 ${physics.pathNoise.toFixed(1)}배`);
  };
  input.disabled=false;input.addEventListener('input',publish);publish();
}
export function initTurnDragControl(input,output,physics){
  const publish=()=>{
    physics.setTurnDrag(Number(input.value));input.value=physics.turnDragStrength.toFixed(1);
    output.textContent=`×${physics.turnDragStrength.toFixed(1)}`;
    input.setAttribute('aria-valuetext',`굴곡 감속 강도 ${physics.turnDragStrength.toFixed(1)}배`);
  };
  input.disabled=false;input.addEventListener('input',publish);publish();
}
