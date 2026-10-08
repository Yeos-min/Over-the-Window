import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.avif':'image/avif','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2','.vert':'text/plain','.frag':'text/plain','.glsl':'text/plain'};
export function byteRange(header,size){
  const match=/^bytes=(\d*)-(\d*)$/.exec(header||'');
  if(!match||!size||(!match[1]&&!match[2]))return null;
  let start,end;
  if(!match[1]){
    const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return null;
    start=Math.max(0,size-suffix);end=size-1;
  }else{start=Number(match[1]);end=match[2]?Number(match[2]):size-1;}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return null;
  return {start,end:Math.min(end,size-1)};
}
export function createPrototypeServer(){return http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const extension=path.extname(file),type=types[extension];
    if (!file.startsWith(root) || !type) { res.writeHead(404).end(); return; }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{'Allow':'GET, HEAD'}).end();return;}
    const info=await stat(file);if(!info.isFile()){res.writeHead(404).end();return;}
    const headers={'Content-Type':type,'Cache-Control':'no-store','Content-Length':info.size};
    let range;
    if(extension==='.mp4'){
      headers['Accept-Ranges']='bytes';
      if(req.headers.range){
        range=byteRange(req.headers.range,info.size);
        if(!range){res.writeHead(416,{'Content-Range':`bytes */${info.size}`,'Accept-Ranges':'bytes'}).end();return;}
        headers['Content-Range']=`bytes ${range.start}-${range.end}/${info.size}`;
        headers['Content-Length']=range.end-range.start+1;
      }
    }
    res.writeHead(range?206:200,headers);
    if(req.method==='HEAD'){res.end();return;}
    const stream=createReadStream(file,range||{});
    stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  } catch { res.writeHead(404).end('Not found'); }
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=createPrototypeServer();
  server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('Rain window: http://127.0.0.1:' + server.address().port));
}
