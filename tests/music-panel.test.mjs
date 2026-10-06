import test from 'node:test';
import assert from 'node:assert/strict';
import {initMusicPanel} from '../src/music-panel.js';
test('music disclosure reverses immediately, keeps hidden controls inert and restores focus',()=>{
  let click,expanded='false',focused=false;
  const toggle={addEventListener:(type,fn)=>{assert.equal(type,'click');click=fn;},getAttribute:()=>expanded,setAttribute:(key,value)=>{assert.equal(key,'aria-expanded');expanded=value;},focus:()=>{focused=true;}};
  const content={inert:true,ownerDocument:{activeElement:{}},contains:()=>true};
  initMusicPanel(toggle,content);
  click();assert.equal(expanded,'true');assert.equal(content.inert,false);
  click();assert.equal(expanded,'false');assert.equal(content.inert,true);assert.equal(focused,true);
  for(let i=0;i<10;i++)click();
  assert.equal(expanded,'false');assert.equal(content.inert,true);
});
