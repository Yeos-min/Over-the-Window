import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {angleDelta,bezelValue,keyValue} from '../src/blur-bezel.js';
test('bezel rotation crosses angle seam without jumping',()=>{
  assert.equal(angleDelta(179,-179),2);
  assert.equal(angleDelta(-179,179),-2);
  assert.equal(angleDelta(-90,0),90);
});
test('bezel keeps background blur in half-pixel steps and bounds',()=>{
  assert.equal(bezelValue(-4),0);assert.equal(bezelValue(40),24);
  assert.equal(bezelValue(4.3),4.5);assert.equal(bezelValue(NaN),0);
});
test('bezel keyboard provides increments, bounds and endpoints',()=>{
  assert.equal(keyValue(0,'ArrowLeft'),0);assert.equal(keyValue(24,'ArrowUp'),24);
  assert.equal(keyValue(2,'ArrowRight'),2.5);assert.equal(keyValue(2,'PageUp'),5);
  assert.equal(keyValue(12,'Home'),0);assert.equal(keyValue(12,'End'),24);
  assert.equal(keyValue(12,'Tab'),null);
});
test('UI has right rail and bezel, without merge-count feedback or blur range',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const script=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  assert.match(html,/<aside class="control-rail"/);
  assert.match(html,/id="background-blur"[^>]+role="slider"/);
  assert.doesNotMatch(html,/<footer|id="background-blur"[^>]+type="range"/);
  assert.doesNotMatch(script,/lastMerge|physics\.merges/);
});
