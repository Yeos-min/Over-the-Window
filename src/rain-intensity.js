export const rainIntensity=value=>Math.max(0,Math.min(2,Number.isFinite(value)?value:1));
// Exponential interarrival distances in a cumulative rate clock; no frame-based chance.
export const rainInterval=rng=>-Math.log(1-Math.max(.02,Math.min(.999999,rng())));
export function initRainControl(input,output,physics){
  const publish=()=>{
    physics.setRainIntensity(Number(input.value)/100);input.value=String(Math.round(physics.rainIntensity*100));
    output.textContent=`${input.value}%`;input.setAttribute('aria-valuetext',`비의 양 ${input.value}%`);
  };
  input.disabled=false;input.addEventListener('input',publish);publish();
}
