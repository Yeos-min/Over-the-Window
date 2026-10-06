// A continuous water surface: blue stores height, alpha only bounds the footprint.
// Refraction is derived from this height in water.frag, rather than a painted lens.
export function dropHeight(x,y){
  const distance=Math.hypot(x,y);
  if(distance>=1)return 0;
  const dome=1-distance*distance;
  return dome*dome*(1+.12*y);
}

export function dropPixels(depth,width=64){
  const pixels=new Uint8ClampedArray(width*width*4),half=(width-1)/2;
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    const nx=(x-half)/half,ny=(y-half)/half,i=(y*width+x)*4;
    const height=dropHeight(nx,ny);
    if(!height)continue;
    // Keep legacy normal channels neutral; normals now follow the whole surface.
    pixels[i]=pixels[i+1]=128;
    pixels[i+2]=Math.round(255*height*Math.max(0,Math.min(1,depth)));
    pixels[i+3]=Math.round(255*Math.min(1,(1-Math.hypot(nx,ny))*16));
  }
  return pixels;
}
