import {DROP_SCALE} from './codrops-physics.js';
import {RAIN_ZOOM} from './heartfelt-field.js';
import {renderSize} from './render-size.js';

export class RainRenderer {
  constructor(canvas,vert,frag){
    this.canvas=canvas;
    const gl=canvas.getContext('webgl',{alpha:false,antialias:false});
    if(!gl)throw new Error('WebGL을 사용할 수 없습니다.');
    this.gl=gl;this.textures=[];this.locations=new Map();
    const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
    const vs=shader(gl.VERTEX_SHADER,vert),fs=shader(gl.FRAGMENT_SHADER,frag);
    this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.program));
    gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(this.program);
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const loc=gl.getAttribLocation(this.program,'a_position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    for(const [i,name] of ['waterMap','scene','fog','clear','background','lens','microSeeds','heartfelt'].entries()){
      gl.activeTexture(gl.TEXTURE0+i);const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.uniform1i(this.loc(name),i);this.textures.push({texture,width:0,height:0});
    }
  }
  loc(name){if(!this.locations.has(name))this.locations.set(name,this.gl.getUniformLocation(this.program,'u_'+name));return this.locations.get(name);}
  upload(i,source,revision){
    const gl=this.gl,t=this.textures[i];gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t.texture);
    if(revision!==undefined&&t.source===source&&t.revision===revision&&t.width===source.width&&t.height===source.height)return;
    if(t.width!==source.width||t.height!==source.height){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);t.width=source.width;t.height=source.height;}
    else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);
    t.source=source;t.revision=revision;
  }
  resize(w,h){
    const size=renderSize(w,h,devicePixelRatio||1),gl=this.gl;
    this.canvas.width=size.width;this.canvas.height=size.height;
    gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.uniform2f(this.loc('resolution'),this.canvas.width,this.canvas.height);gl.uniform2f(this.loc('cssSize'),w,h);
  }
  draw(map,tilt,reveal,parallax,fogLevel=0,rain){
    this.upload(0,map.canvas,map.revision);this.upload(3,map.mask,map.maskRevision);
    this.upload(6,map.field.texture,map.field.revision);this.upload(7,map.heightMap,map.revision);
    this.gl.uniform4f(this.loc('microGrid'),map.field.originX,map.field.originY,map.field.cols,map.field.rows);
    this.gl.uniform1f(this.loc('rainZoom'),RAIN_ZOOM);this.gl.uniform1f(this.loc('dropScale'),DROP_SCALE);
    this.gl.uniform1f(this.loc('tilt'),tilt);this.gl.uniform1f(this.loc('reveal'),reveal?1:0);
    this.gl.uniform1f(this.loc('fogLevel'),fogLevel);
    this.gl.uniform4f(this.loc('rain'),rain?.time??12,rain?.staticTime??12,rain?.amount??.65,rain?.drift??0);
    this.gl.uniform1f(this.loc('rainWind'),rain?.wind||0);
    this.gl.uniform2f(this.loc('parallax'),(parallax?.x||0)*(parallax?.strength??1),(parallax?.y||0)*(parallax?.strength??1));
    this.gl.uniform2f(this.loc('depthScale'),parallax?.glassScale||1,parallax?.sceneScale||1);
    this.gl.drawArrays(this.gl.TRIANGLES,0,6);
  }
}
