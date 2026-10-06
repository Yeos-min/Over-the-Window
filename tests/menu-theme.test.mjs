import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const styleBlocks=source=>[...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match=>({selectors:match[1].trim().split(',').map(value=>value.trim()),body:match[2]}));
const blocks=styleBlocks(css);
const rule=selector=>{
  const block=blocks.find(candidate=>candidate.selectors.includes(selector));
  assert.ok(block,`Missing style rule: ${selector}`);return block.body;
};
const atRule=marker=>{
  const start=css.indexOf(marker);assert.ok(start>=0,`Missing CSS group: ${marker}`);
  const opening=css.indexOf('{',start);let depth=1,end=opening+1;
  for(;end<css.length&&depth;end++){if(css[end]==='{')depth++;else if(css[end]==='}')depth--;}
  assert.equal(depth,0);return css.slice(opening+1,end-1);
};
const groupedRule=(source,selector)=>{
  const block=styleBlocks(source).find(candidate=>candidate.selectors.includes(selector));
  assert.ok(block,`Missing grouped style rule: ${selector}`);return block.body;
};
const declaration=(body,name)=>{
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return body.match(new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;]+)`))?.[1].trim();
};
const attribute=(tag,name)=>tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`))?.[1];
const rgb=hex=>{
  const digits=hex.replace('#',''),full=digits.length===3?[...digits].map(value=>value+value).join(''):digits;
  return [0,2,4].map(index=>parseInt(full.slice(index,index+2),16));
};
const luminance=color=>{
  const channels=(Array.isArray(color)?color:rgb(color)).map(value=>{const s=value/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
};
const contrast=(a,b)=>{
  const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};

test('Pretendard is a local WOFF2 asset with its license and matching font preload',()=>{
  const face=rule('@font-face');
  assert.match(declaration(face,'font-family'),/Pretendard/);
  const source=declaration(face,'src').match(/^url\(["'](\.\/[^"']+)["']\)\s+format\(["']woff2["']\)$/);
  assert.ok(source,'Font must load from a local relative WOFF2 URL');
  const fontUrl=new URL(source[1],new URL('../style.css',import.meta.url)),font=readFileSync(fontUrl);
  assert.equal(font.subarray(0,4).toString('ascii'),'wOF2');assert.ok(font.length>100000);
  const license=readFileSync(new URL('OFL.txt',fontUrl),'utf8');
  assert.match(license,/SIL OPEN FONT LICENSE Version 1\.1/i);assert.match(license,/Reserved Font Name Pretendard/);
  const preload=html.match(/<link\b[^>]*\brel=["']preload["'][^>]*>/)?.[0];
  assert.ok(preload);assert.equal(attribute(preload,'href'),source[1]);
  assert.equal(attribute(preload,'as'),'font');assert.equal(attribute(preload,'type'),'font/woff2');
  assert.match(preload,/\bcrossorigin(?:=["'][^"']*["'])?(?=\s|>)/);
  assert.equal(declaration(face,'font-display'),'swap');
  const weights=declaration(face,'font-weight').split(/\s+/).map(Number);
  assert.equal(weights.length,2);assert.ok(weights[0]<=400&&weights[1]>=700);
  assert.match(declaration(rule(':root'),'font-family'),/^"Pretendard Variable",Pretendard,/);
  assert.match(declaration(rule(':root'),'font-family'),/Malgun Gothic.*sans-serif$/);
});

test('menu retains bright fallback surfaces and soft charcoal text with readable small-label contrast',()=>{
  const root=rule(':root'),surface=declaration(root,'--menu-surface');
  assert.deepEqual(rgb(surface),[255,255,255]);
  assert.equal(declaration(root,'color'),'var(--menu-ink)');
  assert.equal(declaration(root,'color-scheme'),'light');
  for(const token of ['--menu-ink','--menu-muted']){
    const color=declaration(root,token),channels=rgb(color);
    assert.ok(Math.max(...channels)-Math.min(...channels)<=16,`${token} must remain neutral`);
    assert.ok(Math.min(...channels)>0,`${token} should remain soft rather than pure black`);
    assert.ok(contrast(color,surface)>=4.5,`${token} must be readable on white`);
  }
  assert.equal(declaration(rule('.bezel'),'background'),'var(--menu-surface)');
  assert.equal(declaration(rule('.actions button'),'background'),'var(--control-surface)');
  assert.equal(declaration(root,'--control-surface'),'#fff');
  assert.equal(declaration(rule('.control-rail'),'background'),'var(--glass-surface)');
  assert.ok(rgb(declaration(root,'--glass-surface')).every(value=>value>=240));
  assert.equal(declaration(rule('#status'),'color'),'var(--menu-muted)');
  assert.equal(declaration(rule('#blur-help'),'color'),'var(--menu-muted)');
  assert.match(html,/<meta name="theme-color" content="#ffffff">/);
});

test('filled physical knob retains its circular rotary target, pointer and slider accessibility',()=>{
  const bezel=rule('.bezel'),face=rule('.bezel-face'),pointer=rule('.bezel-pointer');
  assert.equal(declaration(bezel,'width'),declaration(bezel,'height'));
  assert.equal(parseFloat(declaration(bezel,'width')),76);assert.equal(declaration(bezel,'border-radius'),'50%');
  assert.equal(declaration(bezel,'touch-action'),'none');assert.equal(declaration(bezel,'user-select'),'none');
  assert.equal(parseFloat(declaration(bezel,'border')),1);assert.ok(declaration(bezel,'--angle'));
  assert.equal(declaration(pointer,'transform'),'rotate(var(--angle))');
  assert.equal(declaration(pointer,'pointer-events'),'none');assert.equal(declaration(face,'pointer-events'),'none');
  assert.equal(declaration(face,'font-variant-numeric'),'tabular-nums');
  assert.ok(Number(declaration(face,'font-weight'))>=400);
  assert.equal(declaration(rule('.bezel-pointer:before'),'background'),'var(--knob-marker)');
  const body=rule('.bezel:before');
  assert.equal(declaration(body,'background'),'var(--knob-surface)');
  assert.equal(declaration(body,'pointer-events'),'none');assert.equal(declaration(body,'border-radius'),'50%');
  assert.match(declaration(body,'box-shadow'),/inset/);
  for(const block of blocks.filter(candidate=>candidate.selectors.some(selector=>selector.startsWith('.bezel')))){
    assert.doesNotMatch(block.body,/(?:gradient\s*\(|backdrop-filter)/i);
    const glow=declaration(block.body,'text-shadow');assert.ok(!glow||glow==='none');
  }
  for(const id of ['background-blur','wind-direction','wind-strength']){
    const slider=html.match(new RegExp(`<div\\b[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(slider);assert.equal(attribute(slider,'role'),'slider');assert.equal(attribute(slider,'tabindex'),'0');
    for(const name of ['aria-labelledby','aria-describedby','aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext']){
      assert.notEqual(attribute(slider,name),undefined,`${id} requires ${name}`);
    }
  }
});

test('physical knob marker remains high contrast in resting, hover and turning states without scaling',()=>{
  const root=rule(':root'),marker=declaration(root,'--knob-marker'),rest=declaration(root,'--knob-surface');
  const hover=blocks.find(block=>block.selectors.some(selector=>selector.startsWith('.bezel:hover')&&selector.endsWith(':before')));
  const turning=blocks.find(block=>block.selectors.includes('.bezel.turning:before'));
  assert.ok(hover);assert.ok(turning);
  assert.ok(turning.selectors.includes('.bezel.turning:hover:before'),'Turning feedback must also override the hovered body');
  for(const surface of [rest,declaration(hover.body,'background'),declaration(turning.body,'background')]){
    const channels=rgb(surface);assert.ok(Math.max(...channels)-Math.min(...channels)<=16);
    assert.ok(contrast(marker,surface)>=4.5);
  }
  for(const block of blocks.filter(candidate=>candidate.selectors.some(selector=>selector.startsWith('.bezel')&&/:hover|\.turning/.test(selector)))){
    assert.doesNotMatch(block.body,/\bscale(?:X|Y|3d)?\s*\(/);
    const transform=declaration(block.body,'transform');assert.ok(!transform||transform==='none');
  }
});

test('numeric readouts stay upright below the filled knob and retain dark-on-white contrast',()=>{
  const face=rule('.bezel-face'),unit=rule('.bezel-face small');
  assert.equal(declaration(face,'position'),'absolute');assert.match(declaration(face,'top'),/^calc\(100% \+ \d+px\)$/);
  assert.equal(declaration(face,'left'),'0');assert.equal(declaration(face,'right'),'0');
  assert.equal(declaration(face,'flex-direction'),'row');assert.equal(declaration(face,'align-items'),'baseline');
  assert.ok(['transparent','none'].includes(declaration(face,'background')));
  assert.equal(declaration(face,'color'),'var(--menu-ink)');assert.equal(declaration(unit,'color'),'var(--menu-muted)');
  assert.equal(declaration(face,'font-variant-numeric'),'tabular-nums');assert.ok(parseFloat(declaration(face,'font-size'))>=14);
  assert.ok(parseFloat(declaration(unit,'font-size'))>=10);
  const transform=declaration(face,'transform');assert.ok(!transform||transform==='none');
  assert.ok(parseFloat(declaration(rule('#blur-help'),'margin'))>=27);
});

test('keyboard focus and music controls remain visible in the monochrome theme',()=>{
  assert.equal(declaration(rule('.bezel:focus-visible'),'outline'),'2px solid var(--menu-ink)');
  assert.ok(parseFloat(declaration(rule('.bezel:focus-visible'),'outline-offset'))>=2);
  assert.equal(declaration(rule('.music-controls input'),'accent-color'),'var(--menu-ink)');
  assert.equal(declaration(rule('.music-meters meter'),'accent-color'),'var(--menu-ink)');
  for(const selector of ['.music-meters meter::-webkit-meter-optimum-value','.music-meters meter::-webkit-meter-suboptimum-value','.music-meters meter::-webkit-meter-even-less-good-value','.music-meters meter::-moz-meter-bar']){
    assert.equal(declaration(rule(selector),'background'),'var(--menu-ink)');
  }
  assert.equal(declaration(rule('.music-meters meter::-webkit-meter-bar'),'box-shadow'),'none');
  assert.equal(declaration(rule('.actions button[aria-pressed=true]'),'border-color'),'var(--menu-ink)');
});

test('wide toolbar keeps safe overflow on small screens and reduced motion removes disclosure animation',()=>{
  const rail=rule('.control-rail');
  assert.equal(declaration(rail,'overflow'),'auto');assert.equal(declaration(rail,'overscroll-behavior'),'contain');
  assert.equal(declaration(rail,'max-height'),'calc(100svh - var(--menu-edge) - 56px)');
  assert.equal(declaration(rule('.menu-drawer'),'bottom'),'var(--menu-edge)');
  assert.equal(declaration(rule('.menu-drawer'),'left'),'50%');
  assert.match(declaration(rule('.menu-drawer'),'--menu-edge'),/safe-area-inset-bottom/);
  assert.equal(declaration(rule('.menu-drawer'),'--menu-safe'),'env(safe-area-inset-bottom,0px)');
  assert.equal(declaration(rule('.menu-tab'),'transform'),'translateX(-50%) translateY(calc(0px - var(--menu-safe)))');
  assert.equal(declaration(rule('.menu-drawer[data-open=true] .menu-tab'),'transform'),'translateX(-50%) translateY(0)');
  const mobile=atRule('@media(max-width:600px)'),mobileRail=groupedRule(mobile,'.control-rail');
  assert.equal(declaration(mobileRail,'max-height'),'min(48svh,calc(100svh - var(--menu-edge) - 56px))');
  assert.equal(declaration(mobileRail,'grid-template-columns'),'minmax(0,1fr)');
  assert.equal(declaration(groupedRule(mobile,'.actions'),'grid-template-columns'),'repeat(4,minmax(0,1fr))');
  assert.match(css,/@media\s*\(max-width:\s*360px\)\s*\{[^}]*\.bezel\{width:64px;height:64px\}/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.music-content-inner[^}]*transition:none/);
  const reduced=css.slice(css.indexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(reduced,/\.bezel:before[^}]*transition:none/);
  assert.match(reduced,/\.menu-tab(?:,|\{)[^}]*transition:none/);
});

test('compact menu places three real-size knobs alongside 2-by-2 actions and two-column audio controls',()=>{
  assert.equal(declaration(rule('.actions'),'display'),'grid');
  assert.equal(declaration(rule('.actions'),'grid-template-columns'),'repeat(2,minmax(0,1fr))');
  const knobs=rule('.knob-panels');
  assert.equal(declaration(knobs,'display'),'grid');
  assert.equal(declaration(knobs,'grid-template-columns'),'repeat(3,minmax(0,1fr))');
  const knobStart=html.indexOf('class="knob-panels"'),musicStart=html.indexOf('class="music-panel"');
  assert.ok(knobStart>=0&&musicStart>knobStart);
  const knobMarkup=html.slice(knobStart,musicStart);
  for(const id of ['background-blur','wind-direction','wind-strength'])assert.match(knobMarkup,new RegExp(`id="${id}"`));
  assert.match(knobMarkup,/class="knob-help"[^>]*>[^<]*방향키/);
  for(const selector of ['.music-controls','.music-meters']){
    assert.equal(declaration(rule(selector),'display'),'grid');
    assert.match(declaration(rule(selector),'grid-template-columns'),/^(?:repeat\(2,minmax\(0,1fr\)\)|minmax\([^)]+\) minmax\([^)]+\))$/);
  }
  for(const selector of ['.actions button','.music-controls button','.music-toggle','.music-controls input']){
    assert.ok(parseFloat(declaration(rule(selector),'min-height'))>=44,`${selector} must retain a 44px touch target`);
  }
  assert.equal(declaration(rule('.music-toggle[aria-expanded=true]+.music-content'),'grid-template-rows'),'1fr');
  const guide=html.match(/<p class="music-guide">([^<]+)<\/p>/)?.[1];assert.ok(guide);
  for(const term of ['탭 오디오','시스템 오디오','마이크','녹음','저장','전송'])assert.ok(guide.includes(term),`Short audio guide must retain ${term}`);
  const relevant=blocks.filter(block=>block.selectors.some(selector=>/^\.(?:control-rail|actions|knob-panels|blur-panel|bezel|music-controls|music-meters)/.test(selector)));
  for(const block of relevant){
    assert.doesNotMatch(block.body,/\bscale(?:X|Y|3d)?\s*\(/,'Menu controls must not be visually scaled');
    assert.notEqual(declaration(block.body,'display'),'none');assert.notEqual(declaration(block.body,'visibility'),'hidden');
  }
  assert.doesNotMatch(html,/class="[^"]*\b(?:visually-hidden|sr-only)\b[^\"]*"/);
});

test('wide toolbar groups actions, knobs and music into three columns and reflows music across the medium layout',()=>{
  const rail=rule('.control-rail');
  assert.equal(declaration(rail,'display'),'grid');
  assert.equal(declaration(rail,'grid-template-columns'),'minmax(190px,.85fr) minmax(280px,1.15fr) minmax(300px,1.6fr)');
  for(const selector of ['.action-panel','.knob-section','.music-panel'])assert.equal(declaration(rule(selector),'min-width'),'0');
  const markup=html.match(/<aside\b[^>]*id="menu-controls"[^>]*>([\s\S]*?)<\/aside>/)?.[1];assert.ok(markup);
  const direct=[],voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);let depth=0;
  for(const tag of markup.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b[^>]*>/g)){
    if(tag[1])depth--;
    else{
      if(depth===0)direct.push(attribute(tag[0],'class'));
      if(!voidTags.has(tag[2]))depth++;
    }
    assert.ok(depth>=0,'Toolbar group markup must remain correctly nested');
  }
  assert.equal(depth,0);assert.deepEqual(direct,['action-panel','knob-section','music-panel']);
  const actionStart=html.indexOf('class="action-panel"'),knobStart=html.indexOf('class="knob-section"');
  assert.ok(html.indexOf('id="status"')>actionStart&&html.indexOf('id="status"')<knobStart,'Overall status stays with the action controls');
  const medium=atRule('@media(max-width:900px)');
  assert.equal(declaration(groupedRule(medium,'.control-rail'),'grid-template-columns'),'minmax(190px,.75fr) minmax(280px,1.25fr)');
  assert.equal(declaration(groupedRule(medium,'.music-panel'),'grid-column'),'1 / -1');
  assert.equal(declaration(groupedRule(medium,'.music-content-inner'),'grid-template-areas'),'"guide controls" "connection meters"');
  for(const [selector,area] of [['.music-guide','guide'],['.music-controls','controls'],['#music-status','connection'],['.music-meters','meters']]){
    assert.equal(declaration(groupedRule(medium,selector),'grid-area'),area);
  }
  const mobile=atRule('@media(max-width:600px)');
  assert.equal(declaration(groupedRule(mobile,'.music-content-inner'),'grid-template-areas'),'"guide" "controls" "connection" "meters"');
  assert.equal(declaration(groupedRule(mobile,'.knob-section'),'border-left'),'0');
});

test('clearer glass is limited to the toolbar and tab, and its effective text colors stay readable over the darkest background',()=>{
  const supported=atRule('@supports '),variables=groupedRule(supported,'.menu-drawer');
  const alpha=name=>{
    const match=declaration(variables,name)?.match(/^rgba\(255,255,255,([.\d]+)\)$/);assert.ok(match,name);
    const value=Number(match[1]);assert.ok(value>0&&value<1);return value;
  };
  const surfaceAlpha=alpha('--glass-surface');assert.equal(alpha('--glass-edge'),.5);
  assert.equal(surfaceAlpha,.6,'White tint must stay clearer than the former .8 alpha veil');
  assert.equal(alpha('--control-surface'),.55,'Button surfaces keep their own readable tint rather than fading their contents');
  const effectiveColor=token=>declaration(variables,token)??declaration(rule(':root'),token);
  const darkest=[255*surfaceAlpha,255*surfaceAlpha,255*surfaceAlpha];
  for(const token of ['--menu-ink','--menu-muted'])assert.ok(contrast(effectiveColor(token),darkest)>=4.5,`${token} must contrast with glass even above a black photo`);
  assert.equal(effectiveColor('--menu-muted'),effectiveColor('--menu-ink'),'Supported transparent glass darkens small labels to preserve contrast');
  const hoverAlpha=alpha('--menu-hover');
  assert.ok(contrast(declaration(rule(':root'),'--menu-ink'),[255*hoverAlpha,255*hoverAlpha,255*hoverAlpha])>=4.5);
  for(const selector of ['.control-rail','.menu-tab']){
    assert.equal(declaration(rule(selector),'background'),'var(--glass-surface)');
    const backdrop=groupedRule(supported,selector);
    assert.match(declaration(backdrop,'backdrop-filter'),/blur\(10px\)/);
    assert.equal(declaration(backdrop,'-webkit-backdrop-filter'),declaration(backdrop,'backdrop-filter'));
  }
  const activeFilters=blocks.filter(block=>{
    const value=declaration(block.body,'backdrop-filter');return value&&value!=='none';
  });
  assert.ok(activeFilters.length>0);
  for(const block of activeFilters)for(const selector of block.selectors)assert.ok(['.control-rail','.menu-tab'].includes(selector),`${selector} must not blur the scene or dark knob faces`);
});

test('clearer glass changes background paint without fading the toolbar, labels or enabled knob contents',()=>{
  const containers=new Set(['.menu-drawer','.menu-drawer[data-open=true]','.control-rail','.menu-tab','.action-panel','.actions','.knob-section','.knob-panels','.music-panel','.music-controls','.bezel','.bezel-face','.bezel-pointer']);
  for(const block of blocks.filter(candidate=>candidate.selectors.some(selector=>containers.has(selector)||containers.has(selector.replace(/^\.menu-drawer(?:\[[^\]]+\])?\s+/,''))))){
    const opacity=declaration(block.body,'opacity');assert.ok(!opacity||Number(opacity)===1,'Container opacity would fade labels and dark knob contents');
    const filter=declaration(block.body,'filter');assert.ok(!filter||filter==='none','Whole-menu filters must not fade the controls');
  }
  assert.equal(declaration(rule('.music-toggle[aria-expanded=true]+.music-content'),'opacity'),'1','Expanded music keeps its existing fully visible disclosure state');
  assert.equal(declaration(rule('.bezel:before'),'background'),'var(--knob-surface)');
  assert.equal(declaration(rule('.bezel-pointer:before'),'background'),'var(--knob-marker)');
});

test('reduced transparency and forced colors restore opaque readable toolbar surfaces without blur',()=>{
  const reduced=atRule('@media(prefers-reduced-transparency:reduce)'),opaque=groupedRule(reduced,'.menu-drawer');
  assert.equal(declaration(opaque,'--menu-muted'),declaration(rule(':root'),'--menu-muted'),'Opaque mode restores its original soft label color');
  assert.ok(contrast(declaration(opaque,'--menu-muted'),declaration(opaque,'--glass-surface'))>=4.5);
  for(const token of ['--glass-surface','--glass-edge','--control-surface','--menu-hover']){
    assert.match(declaration(rule(':root'),token),/^#[\da-f]{3}(?:[\da-f]{3})?$/i,'Unsupported backdrop filters must have an opaque fallback');
    assert.match(declaration(opaque,token),/^#[\da-f]{3}(?:[\da-f]{3})?$/i);
  }
  const forced=atRule('@media(forced-colors:active)'),colors=groupedRule(forced,'.menu-drawer');
  for(const token of ['--glass-surface','--control-surface','--menu-hover'])assert.equal(declaration(colors,token),'Canvas');
  for(const token of ['--glass-edge','--menu-ink','--menu-muted','--menu-line'])assert.equal(declaration(colors,token),'CanvasText');
  for(const source of [reduced,forced])for(const selector of ['.control-rail','.menu-tab']){
    const body=groupedRule(source,selector);
    assert.equal(declaration(body,'backdrop-filter'),'none');assert.equal(declaration(body,'-webkit-backdrop-filter'),'none');
  }
  assert.equal(declaration(groupedRule(forced,'.menu-drawer[data-open=true] .control-rail'),'box-shadow'),'none');
});

test('forced colors preserve the solid knob and its contrasting index line',()=>{
  const start=css.indexOf('@media(forced-colors:active)');assert.ok(start>=0);
  const forcedBlocks=[...css.slice(start).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(match=>({selectors:match[1].trim().split(',').map(value=>value.trim()),body:match[2]}));
  const body=forcedBlocks.find(block=>block.selectors.includes('.bezel:before'));
  const marker=forcedBlocks.find(block=>block.selectors.includes('.bezel-pointer:before'));
  assert.ok(body);assert.ok(marker);
  assert.ok(body.selectors.includes('.bezel:hover:not([aria-disabled=true]):before'));
  assert.ok(body.selectors.includes('.bezel.turning:before'));
  assert.equal(declaration(body.body,'background'),'CanvasText');
  assert.equal(declaration(body.body,'forced-color-adjust'),'none');
  assert.equal(declaration(body.body,'box-shadow'),'none');
  assert.equal(declaration(marker.body,'background'),'Canvas');
  assert.equal(declaration(marker.body,'forced-color-adjust'),'none');
});
