// Capsule contact against the current finger movement, never the stored fog trail.
export function touchesFinger(drop,x0,y0,x1,y1,radius,extent=drop.r){
  const dx=x1-x0,dy=y1-y0,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((drop.x-x0)*dx+(drop.y-y0)*dy)/length)):0;
  const x=drop.x-x0-dx*t,y=drop.y-y0-dy*t;
  return x*x+y*y<=(radius+extent)**2;
}
