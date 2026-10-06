export const blurValue=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(24,Number(value))):0;

// Extend edge pixels before blurring; preserve framing and avoid transparent borders.
export function blurBackground(source,value){
  const radius=blurValue(value),scale=Math.min(1,2048/Math.max(source.width,source.height));
  const width=Math.round(source.width*scale),height=Math.round(source.height*scale);
  const result=document.createElement('canvas');result.width=width;result.height=height;
  const ctx=result.getContext('2d');
  if(radius===0){ctx.drawImage(source,0,0,width,height);return result;}
  const pad=Math.ceil(radius*3),extended=document.createElement('canvas');
  extended.width=width+pad*2;extended.height=height+pad*2;
  const e=extended.getContext('2d'),sw=source.width,sh=source.height;
  const xs=[[0,1,0,pad],[0,sw,pad,width],[sw-1,1,pad+width,pad]];
  const ys=[[0,1,0,pad],[0,sh,pad,height],[sh-1,1,pad+height,pad]];
  for(const [sx,sWidth,dx,dWidth] of xs)for(const [sy,sHeight,dy,dHeight] of ys)
    e.drawImage(source,sx,sy,sWidth,sHeight,dx,dy,dWidth,dHeight);
  ctx.filter=`blur(${radius}px)`;ctx.drawImage(extended,-pad,-pad);
  return result;
}
