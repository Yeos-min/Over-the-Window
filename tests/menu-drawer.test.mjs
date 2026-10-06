import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initMenuDrawer} from '../src/menu-drawer.js';

const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const styleRule=selector=>{
  const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=css.match(new RegExp(`${escaped}\\{([^}]*)\\}`));assert.ok(match,selector);return match[1];
};

const fixture=()=>{
  const events=[],docListeners=new Map(),toggleListeners=new Map(),outside={id:'canvas'},attributes=new Map();
  const doc={activeElement:outside,addEventListener(type,callback){docListeners.set(type,callback);}};
  const controls=[{id:'wind',value:35},{id:'music',connected:true},{id:'music-content',inert:false,expanded:true}];
  const descendants=new Set(controls);let inert=false;
  const panel={
    ownerDocument:doc,controls,attributes:new Map(),
    contains(node){return node===this||descendants.has(node);},
    setAttribute(name,value){this.attributes.set(name,value);events.push(`panel:${name}=${value}`);},
    get inert(){return inert;},
    set inert(value){
      if(value)assert.ok(!this.contains(doc.activeElement),'Move focus out before making the panel inert');
      inert=value;events.push(`inert=${value}`);
    }
  };
  const toggle={
    attributes,addEventListener(type,callback){toggleListeners.set(type,callback);},
    setAttribute(name,value){attributes.set(name,value);},
    focus(options){assert.deepEqual(options,{preventScroll:true});events.push('focus');doc.activeElement=this;}
  };
  const drawer={ownerDocument:doc,dataset:{},contains(node){return node===this||node===toggle||panel.contains(node);}};
  const api=initMenuDrawer(toggle,panel,drawer);
  const click=()=>toggleListeners.get('click')();
  const key=(key)=>{let prevented=0;docListeners.get('keydown')({key,preventDefault(){prevented++;}});return prevented;};
  const pointer=target=>docListeners.get('pointerdown')({target});
  return {api,doc,panel,toggle,drawer,controls,events,outside,click,key,pointer};
};

test('drawer starts closed with matching button and off-screen accessibility state',()=>{
  const {drawer,toggle,panel}=fixture();
  assert.equal(drawer.dataset.open,'false');assert.equal(toggle.attributes.get('aria-expanded'),'false');
  assert.equal(toggle.attributes.get('aria-label'),'메뉴 열기');
  assert.equal(panel.inert,true);assert.equal(panel.attributes.get('aria-hidden'),'true');
});

test('bookmark toggles the drawer and reverses immediately under rapid clicks',()=>{
  const {drawer,toggle,panel,click}=fixture();
  for(let i=0;i<40;i++){
    click();const open=i%2===0;
    assert.equal(drawer.dataset.open,String(open));assert.equal(toggle.attributes.get('aria-expanded'),String(open));
    assert.equal(toggle.attributes.get('aria-label'),open?'메뉴 접기':'메뉴 열기');
    assert.equal(panel.inert,!open);assert.equal(panel.attributes.get('aria-hidden'),String(!open));
  }
});

test('closing returns internal focus to the bookmark before hiding and making the rail inert',()=>{
  const {api,doc,toggle,panel,controls,events}=fixture();
  api.setOpen(true);doc.activeElement=controls[0];events.length=0;api.setOpen(false);
  assert.equal(doc.activeElement,toggle);assert.equal(panel.inert,true);
  assert.ok(events.indexOf('focus')<events.indexOf('inert=true'));
  assert.ok(events.indexOf('focus')<events.indexOf('panel:aria-hidden=true'));
});

test('Escape closes only an open drawer, prevents its default and restores bookmark focus',()=>{
  const {api,doc,toggle,drawer,outside,key}=fixture();
  assert.equal(key('Escape'),0);assert.equal(doc.activeElement,outside);
  api.setOpen(true);assert.equal(key('ArrowRight'),0);assert.equal(drawer.dataset.open,'true');
  assert.equal(key('Escape'),1);assert.equal(drawer.dataset.open,'false');assert.equal(doc.activeElement,toggle);
  assert.equal(key('Escape'),0);
});

test('outside pointer closes while bookmark and nested control interactions stay inside',()=>{
  const {api,drawer,toggle,panel,controls,outside,pointer}=fixture();
  api.setOpen(true);
  for(const target of [drawer,toggle,panel,...controls]){
    pointer(target);assert.equal(drawer.dataset.open,'true');
  }
  pointer(outside);assert.equal(drawer.dataset.open,'false');assert.equal(panel.inert,true);
  pointer(outside);assert.equal(drawer.dataset.open,'false');
});

test('sliding the menu retains existing wind, audio and nested disclosure state',()=>{
  const {api,panel,controls}=fixture(),references=[...controls],before=controls.map(control=>({...control}));
  for(let i=0;i<10;i++){api.setOpen(true);api.setOpen(false);}
  assert.equal(panel.controls,controls);assert.deepEqual(controls,before);
  for(let i=0;i<controls.length;i++)assert.equal(controls[i],references[i]);
  assert.equal(controls[2].inert,false);
  controls[2].inert=true;api.setOpen(true);assert.equal(controls[2].inert,true);
});

test('bookmark is a focusable sibling outside the inert scrolling menu and is visible by default',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<div[^>]*id="menu-drawer"[^>]*data-open="false"[^>]*>\s*<button[^>]*id="menu-toggle"[^>]*>[\s\S]*?<\/button>\s*<aside/);
  const toggle=html.match(/<button[^>]*id="menu-toggle"[^>]*>/)?.[0];
  const panel=html.match(/<aside[^>]*id="menu-controls"[^>]*>/)?.[0];
  assert.ok(toggle);assert.ok(panel);
  assert.match(toggle,/type="button"/);assert.match(toggle,/aria-controls="menu-controls"/);
  assert.match(toggle,/aria-expanded="false"/);assert.doesNotMatch(toggle,/\b(?:disabled|inert)\b/);
  assert.match(panel,/aria-hidden="true"/);assert.match(panel,/\binert\b/);
});

test('bottom-center toolbar slides up while its top bookmark and wide responsive width stay usable',()=>{
  const drawer=styleRule('.menu-drawer'),tab=styleRule('.menu-tab'),rail=styleRule('.control-rail');
  assert.match(drawer,/width:min\(1120px,calc\(100vw - 40px\)\)/);
  assert.match(drawer,/left:50%/);assert.match(drawer,/bottom:var\(--menu-edge\)/);
  assert.match(drawer,/--menu-edge:max\(12px,env\(safe-area-inset-bottom\)\)/);
  assert.match(drawer,/--menu-safe:env\(safe-area-inset-bottom,0px\)/);
  assert.match(drawer,/transform:translateX\(-50%\) translateY\(calc\(100% \+ var\(--menu-edge\)\)\)/);
  assert.doesNotMatch(drawer,/(?:^|;)(?:right|top):/);
  assert.match(drawer,/transition:transform/);
  assert.match(styleRule('.menu-drawer[data-open=true]'),/transform:translateX\(-50%\) translateY\(0\)/);
  assert.match(tab,/top:-44px/);assert.match(tab,/left:50%/);assert.match(tab,/translateX\(-50%\)/);
  assert.match(tab,/transform:translateX\(-50%\) translateY\(calc\(0px - var\(--menu-safe\)\)\)/);
  assert.match(tab,/transition:transform \.52s/);
  assert.match(styleRule('.menu-drawer[data-open=true] .menu-tab'),/transform:translateX\(-50%\) translateY\(0\)/);
  assert.match(tab,/width:96px/);assert.match(tab,/height:44px/);assert.match(tab,/flex-direction:row/);
  assert.match(tab,/border-bottom:0/);assert.match(tab,/border-radius:8px 8px 0 0/);
  assert.match(styleRule('.menu-tab:focus-visible'),/outline-offset:-5px/);
  assert.match(rail,/position:relative/);assert.match(rail,/overflow:auto/);
  assert.match(rail,/max-height:calc\(100svh - var\(--menu-edge\) - 56px\)/);
  assert.doesNotMatch(rail,/(?:^|;)(?:right|top|transform):/);
  assert.match(css,/@media\(max-width:600px\)\{\s*\.menu-drawer\{[^}]*--menu-edge:max\(10px,env\(safe-area-inset-bottom\)\)[^}]*width:calc\(100vw - 24px\)/);
  const reduced=css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(reduced,/\.menu-drawer/);assert.match(reduced,/\.menu-tab-icon/);assert.match(reduced,/transition:none/);
  assert.match(reduced,/\.menu-tab(?:,|\{)/,'Reduced motion must disable the bookmark offset transition too');
});

test('bottom bookmark text stays horizontal and its chevron indicates opening upward then closing downward',()=>{
  const text=styleRule('.menu-tab-text'),closed=styleRule('.menu-tab-icon'),open=styleRule('.menu-drawer[data-open=true] .menu-tab-icon');
  const writing=text.match(/(?:^|;)writing-mode:([^;]+)/)?.[1];
  assert.ok(!writing||writing==='horizontal-tb');assert.doesNotMatch(css,/writing-mode:(?:vertical|sideways)/);
  assert.doesNotMatch(text,/text-orientation:upright/);
  assert.match(closed,/transform:rotate\(-135deg\)/);assert.match(open,/transform:rotate\(45deg\)/);
  assert.doesNotMatch(styleRule('.menu-tab'),/translateY\(-50%\)|left:-44px|border-right:0/);
});

test('closed bookmark clears a 34px home-indicator inset without exposing the panel and open bookmark reserves top clearance',()=>{
  const tab=styleRule('.menu-tab'),rail=styleRule('.control-rail');
  const top=Number(tab.match(/(?:^|;)top:(-?\d+)px/)?.[1]),height=Number(tab.match(/(?:^|;)height:(\d+)px/)?.[1]);
  const reserved=Number(rail.match(/max-height:calc\(100svh - var\(--menu-edge\) - (\d+)px\)/)?.[1]);
  assert.ok(Number.isFinite(top)&&Number.isFinite(height)&&Number.isFinite(reserved));
  const viewport=667,safe=34,edge=Math.max(12,safe),railHeight=viewport-edge-reserved;
  const closedPanelTop=viewport-edge-railHeight+railHeight+edge;
  assert.equal(closedPanelTop,viewport);
  assert.equal(closedPanelTop+top+height-safe,633);
  const openPanelTop=viewport-edge-railHeight;
  assert.ok(openPanelTop+top>=12);
  assert.equal(openPanelTop+top+height,openPanelTop,'Open bookmark returns to zero offset and attaches to the rail');
});

test('fallback leaves the bookmark enabled and opens its help independently of WebGL setup',()=>{
  const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  const initialization=source.indexOf('const menu=initMenuDrawer(');
  assert.ok(initialization>=0&&initialization<source.indexOf('try{'));
  const fallback=source.slice(source.indexOf('function fallback('));
  assert.match(fallback,/menu\.setOpen\(true\)/);
  assert.match(fallback,/querySelectorAll\('\.control-rail button'\)/);
  assert.doesNotMatch(fallback,/querySelectorAll\('button'\)|menu-toggle[^;]*disabled/);
});
