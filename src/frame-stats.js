// Small, visible profiler: samples are bounded and published once per second.
export class FrameStats{
  constructor(output){this.output=output;this.last=0;this.since=0;this.samples=[];this.totals={simulation:0,background:0,maps:0,render:0,field:0,physics:0,decay:0,births:0};}
  add(stage,ms){this.totals[stage]+=ms;}
  frame(now,start,details={}){
    if(this.last)this.samples.push({interval:now-this.last,cpu:performance.now()-start});this.last=now;
    if(!this.since)this.since=now;
    if(now-this.since<1000||!this.samples.length)return;
    const count=this.samples.length,average=key=>this.samples.reduce((sum,s)=>sum+s[key],0)/count;
    const sorted=this.samples.map(s=>s.interval).sort((a,b)=>a-b);
    const result={fps:1000/average('interval'),cpu:average('cpu'),p95:sorted[Math.floor((count-1)*.95)],...details};
    for(const [key,total] of Object.entries(this.totals))result[key]=total/count;
    this.output.textContent=`${result.fps.toFixed(1)} FPS · CPU ${result.cpu.toFixed(1)} ms · 프레임 p95 ${result.p95.toFixed(1)} ms\n계산 ${result.simulation.toFixed(1)} · 배경 ${result.background.toFixed(1)} · 물방울 지도 ${result.maps.toFixed(1)} · 렌더 ${result.render.toFixed(1)} ms\n미세 방울 ${result.field.toFixed(1)} · 충돌 ${result.physics.toFixed(1)} · 물길 ${result.decay.toFixed(1)} · 생성 ${result.births.toFixed(1)} ms`;
    this.output.textContent+=`\n오디오 ${result.audio} · ${result.voices}개 · 렌더 ${result.width}×${result.height}`;
    if(result.voiceCounts)this.output.textContent+=` · 저/중/고 ${result.voiceCounts.join('/')}`;
    this.output.dataset.sample=JSON.stringify(result);this.samples.length=0;this.since=now;
    for(const key of Object.keys(this.totals))this.totals[key]=0;
  }
  reset(){this.last=0;this.since=0;this.samples.length=0;for(const key of Object.keys(this.totals))this.totals[key]=0;}
}
