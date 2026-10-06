import test from 'node:test';
import assert from 'node:assert/strict';
import {dropHeight,dropPixels} from '../src/drop-profile.js';
import {deformDrop} from '../src/drop-orientation.js';

test('water meets dry glass with zero height and a vanishing edge slope',()=>{
  assert.equal(dropHeight(0,0),1);
  for(const angle of [0,.6,1.8,3,4.5]){
    const x=Math.cos(angle),y=Math.sin(angle);
    assert.equal(dropHeight(x*1.01,y*1.01),0);
    const near=dropHeight(x*.999,y*.999),inside=dropHeight(x*.99,y*.99);
    assert.ok(near>=0&&near<inside*.02);
  }
  assert.equal(dropHeight(-.4,.2),dropHeight(.4,.2));
  assert.ok(dropHeight(0,.4)>dropHeight(0,-.4));
});

test('smaller lenses have weaker height gradients without changing their footprint',()=>{
  const small=dropPixels(.035),large=dropPixels(.8);
  let smallBend=0,largeBend=0;
  for(let y=0;y<64;y++)for(let x=1;x<63;x++){
    const i=(y*64+x)*4;
    assert.equal(small[i+3],large[i+3]);
    assert.ok(small[i+2]<=large[i+2]);
    if(!large[i+3])assert.equal(large[i+2],0);
    smallBend+=Math.abs(small[i+6]-small[i-2]);
    largeBend+=Math.abs(large[i+6]-large[i-2]);
  }
  assert.ok(smallBend>0&&largeBend>smallBend*10);
  const center=(32*64+32)*4;
  assert.ok(large[center+2]>200);
  assert.ok(Math.abs(large[center+6]-large[center-2])<3);
});

test('moving silhouette carries the same height surface and leaves no rectangular lens outside it',()=>{
  const moving=deformDrop(dropPixels(.8),1);
  let wet=0,dry=0;
  for(let i=0;i<moving.length;i+=4){
    if(moving[i+3]===0){assert.equal(moving[i+2],0);dry++;}
    else if(moving[i+2]>0)wet++;
  }
  assert.ok(wet>1000&&dry>500);
});
