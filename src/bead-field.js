export class BeadField {
  constructor(capacity=12000){
    this.cells=new Map();this.count=0;this.maxRadius=0;
    this.capacity=Math.min(24000,Math.max(0,Math.floor(Number.isFinite(capacity)?capacity:12000)));
  }
  add(bead){
    if(this.count>=this.capacity)return false;
    const key=`${Math.floor(bead.x/32)},${Math.floor(bead.y/32)}`;
    if(!this.cells.has(key))this.cells.set(key,[]);
    this.cells.get(key).push(bead);this.count++;this.maxRadius=Math.max(this.maxRadius,bead.r);return true;
  }
  takeWind(width,height,wind,limit,rng=Math.random){
    const air=Math.min(1,Math.abs(Number.isFinite(wind)?wind:0));
    if(!air||!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0)return [];
    const wanted=Math.min(this.count,Math.max(0,Math.floor(Number.isFinite(limit)?limit:0)));
    if(!wanted)return [];
    const random=()=>Math.max(0,Math.min(1-Number.EPSILON,rng()));
    const bands=[[],[],[]],seen=[0,0,0];
    // One finite pass through the capped field. Reservoir sampling avoids favoring
    // recently created beads, leftmost cells, or large beads within a height band.
    for(const [key,cell] of this.cells)for(const bead of cell){
      if(bead.r<2.5)continue;
      const band=Math.max(0,Math.min(2,Math.floor(bead.y/height*3)));
      const index=Math.floor(random()*++seen[band]),pool=bands[band];
      if(pool.length<wanted)pool.push({key,bead});
      else if(index<wanted)pool[index]={key,bead};
    }
    const chosen=[],start=this.windBand??Math.floor(random()*3);let lastBand=start;
    // Rotate through all three bands, including when one has already emptied.
    for(let round=0;round<wanted&&chosen.length<wanted;round++){
      let found=false;
      for(let offset=0;offset<3&&chosen.length<wanted;offset++){
        const band=(start+offset)%3,pool=bands[band];if(!pool.length)continue;
        const index=Math.floor(random()*pool.length),entry=pool[index];
        pool[index]=pool[pool.length-1];pool.pop();chosen.push(entry);found=true;lastBand=band;
      }
      if(!found)break;
    }
    if(chosen.length)this.windBand=(lastBand+1)%3;
    const removals=new Map();
    for(const {key,bead} of chosen){
      if(!removals.has(key))removals.set(key,new Set());
      removals.get(key).add(bead);
    }
    for(const [key,beads] of removals){
      const cell=this.cells.get(key),keep=cell.filter(bead=>!beads.has(bead));
      if(keep.length)this.cells.set(key,keep);else this.cells.delete(key);
      this.count-=cell.length-keep.length;
    }
    return chosen.map(entry=>entry.bead);
  }
  peek(x,y,r,predicate=()=>true,exclude){
    const found=[],reach=r*1.5+Math.max(6,this.maxRadius);
    for(let cy=Math.floor((y-reach)/32);cy<=Math.floor((y+reach)/32);cy++)
    for(let cx=Math.floor((x-reach)/32);cx<=Math.floor((x+reach)/32);cx++){
      const key=`${cx},${cy}`,cell=this.cells.get(key);if(!cell)continue;
      for(const b of cell){
        if(b!==exclude&&predicate(b)&&((b.x-x)/(r*.75+b.r))**2+((b.y-y)/(r*1.2+b.r))**2<=1)found.push(b);
      }
    }
    return found;
  }
  remove(beads){
    const removals=new Map();
    for(const bead of beads){
      const key=`${Math.floor(bead.x/32)},${Math.floor(bead.y/32)}`;
      if(!removals.has(key))removals.set(key,new Set());removals.get(key).add(bead);
    }
    for(const [key,selected] of removals){
      const cell=this.cells.get(key);if(!cell)continue;
      const keep=cell.filter(bead=>!selected.has(bead));this.count-=cell.length-keep.length;
      if(keep.length)this.cells.set(key,keep);else this.cells.delete(key);
    }
  }
  take(x,y,r,predicate){const found=this.peek(x,y,r,predicate);this.remove(found);return found;}
}
