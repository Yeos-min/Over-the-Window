import test from 'node:test';
import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import {once} from 'node:events';
import {byteRange,createPrototypeServer} from '../server.mjs';

test('video byte ranges support bounded, open and suffix requests and reject malformed input',()=>{
  for(const [input,expected] of [['bytes=0-9',{start:0,end:9}],['bytes=70-',{start:70,end:99}],['bytes=-8',{start:92,end:99}],['bytes=0-999',{start:0,end:99}],['bytes=-999',{start:0,end:99}]])assert.deepEqual(byteRange(input,100),expected);
  for(const input of ['bytes=100-','bytes=80-70','bytes=-0','bytes=-','bytes=0-4,8-9','bytes=x-y','bytes=9007199254740992-'])assert.equal(byteRange(input,100),null);
});

test('prototype serves the imported Heartfelt shader for runtime compilation',async t=>{
  const server=createPrototypeServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const response=await fetch(`http://127.0.0.1:${server.address().port}/src/shaders/heartfelt.glsl`);
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'text/plain');
  const source=await response.text();assert.match(source,/vec2 DropLayer2/);assert.match(source,/CC BY-NC-SA 3\.0/);
});
test('prototype serves MP4 as seekable video, handles HEAD and rejects out-of-bounds seeks',async t=>{
  const server=createPrototypeServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const url=`http://127.0.0.1:${server.address().port}/assets/rainy-forest-wind-silent.mp4`;
  const size=(await stat(new URL('../assets/rainy-forest-wind-silent.mp4',import.meta.url))).size;
  const head=await fetch(url,{method:'HEAD'});
  assert.equal(head.status,200);assert.equal(head.headers.get('content-type'),'video/mp4');
  assert.equal(head.headers.get('accept-ranges'),'bytes');assert.equal(Number(head.headers.get('content-length')),size);
  const first=await fetch(url,{headers:{Range:'bytes=0-31'}});
  assert.equal(first.status,206);assert.equal(first.headers.get('content-range'),`bytes 0-31/${size}`);
  assert.equal((await first.arrayBuffer()).byteLength,32);
  const suffix=await fetch(url,{headers:{Range:'bytes=-16'}});
  assert.equal(suffix.status,206);assert.equal((await suffix.arrayBuffer()).byteLength,16);
  const invalid=await fetch(url,{headers:{Range:`bytes=${size}-`}});
  assert.equal(invalid.status,416);assert.equal(invalid.headers.get('content-range'),`bytes */${size}`);
});
