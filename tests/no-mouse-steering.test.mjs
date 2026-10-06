import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('live app disconnects mouse steering while keeping parallax and wind',()=>{
  const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/MouseInput|input\.update|input\.clear/);
  assert.match(source,/physics\.step\(1\/60,0,/);
  assert.match(source,/parallax\.move\(/);
  assert.match(source,/initWindControls\(/);
  assert.match(source,/physics\.windTarget=value;/);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/마우스를 좌우로|마우스의 좌우/);
});
