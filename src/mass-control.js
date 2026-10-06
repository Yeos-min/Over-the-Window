import {massScale} from './drop-mass.js';
export function initMassControl(input,output,physics,map){
  const publish=()=>{
    const scale=massScale(Number(input.value));input.value=scale.toFixed(2);
    output.textContent=`×${scale.toFixed(2)}`;input.setAttribute('aria-valuetext',`질량 배율 ${scale.toFixed(2)}배`);
    physics.setMassScale(scale);map.setMassScale(scale);
  };
  input.disabled=false;input.addEventListener('input',publish);publish();
}
