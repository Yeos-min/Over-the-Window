export function loadImage(url){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    const timer=setTimeout(()=>reject(new Error('이미지 로딩 시간 초과: '+url)),15000);
    image.onload=()=>{clearTimeout(timer);resolve(image);};
    image.onerror=()=>{clearTimeout(timer);reject(new Error('이미지를 읽지 못했습니다: '+url));};
    image.src=url;
  });
}
