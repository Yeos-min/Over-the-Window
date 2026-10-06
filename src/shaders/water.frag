// Composite of Codrops RainEffect optics and BigWings Heartfelt rain.
// See THIRD_PARTY_NOTICES.md for source attribution and licenses.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_waterMap;
uniform sampler2D u_scene;
uniform sampler2D u_lens;
uniform sampler2D u_background;
uniform sampler2D u_fog;
uniform sampler2D u_clear;
uniform sampler2D u_microSeeds;
uniform sampler2D u_heartfelt;
uniform vec4 u_microGrid;
uniform float u_rainZoom;
uniform float u_dropScale;
uniform vec2 u_resolution;
uniform vec2 u_cssSize;
uniform vec2 u_parallax;
uniform vec2 u_depthScale;
uniform float u_textureRatio;
uniform float u_tilt;
uniform float u_reveal;
uniform float u_fogLevel;
// Flow time, static time, rainfall amount and accumulated horizontal drift.
uniform vec4 u_rain;
uniform float u_rainWind;
/* HEARTFELT */
vec2 cover(vec2 uv){float ratio=u_cssSize.x/u_cssSize.y;return (uv-.5)*vec2(min(1.,ratio/u_textureRatio),min(1.,u_textureRatio/ratio))+.5;}
void main(){
  vec2 uv=vec2(gl_FragCoord.x/u_resolution.x,1.-gl_FragCoord.y/u_resolution.y);
  vec2 glassUV=(uv-.5)/u_depthScale.x+.5-u_parallax*.006;
  vec2 sceneUV=cover((uv-.5)/u_depthScale.y+.5-u_parallax*.028)+vec2(u_tilt*3.,0.)/u_cssSize;
  if(u_reveal>.5){gl_FragColor=vec4(texture2D(u_background,sceneUV).rgb,1.);return;}

  // Heartfelt uses a Y-up coordinate system and two differently sized flow layers.
  float rainZoom=u_rainZoom;
  vec2 rainUV=(glassUV-.5)*vec2(u_cssSize.x/u_cssSize.y,-1.)*rainZoom;
  float l0=S(-.5,1.,u_rain.z)*2.;
  float l1=S(.25,.75,u_rain.z),l2=S(0.,.5,u_rain.z);
  vec2 drops=Drops(rainUV,u_rain.x,l0,l1,l2);
  vec2 e=vec2(.001,0.);
  vec2 normal=vec2(Drops(rainUV+e,u_rain.x,l0,l1,l2).x-drops.x,Drops(rainUV+e.yx,u_rain.x,l0,l1,l2).x-drops.x);
  vec2 rainBend=vec2(normal.x,-normal.y)/rainZoom;
  float trail=max(drops.y,S(.1,.2,drops.x));
  float clear=max(S(.08,.85,texture2D(u_clear,glassUV).a),clamp(trail,0.,1.));
  vec2 rainSceneUV=clamp(sceneUV+rainBend,0.,1.);
  // WebGL 1 has no textureLod: reuse the app's sharp and blurred video planes.
  vec3 sharp=texture2D(u_scene,rainSceneUV).rgb;
  vec3 throughGlass=mix(texture2D(u_background,rainSceneUV).rgb,sharp,clear);
  float mist=u_fogLevel*(1.-clear);
  vec3 base=throughGlass;
  if(mist>0.){
    base=mix(base,texture2D(u_fog,rainSceneUV).rgb,mist);
    base=mix(base,vec3(.87,.91,.92),mist*.10);
  }

  // Codrops' original G/R direction, B thickness and 6x - 3 alpha correction.
  vec4 water=texture2D(u_waterMap,glassUV);
  vec2 refraction=(water.gr-.5)*2.;
  vec2 bend=refraction*(256.+water.b*256.)*u_dropScale/u_cssSize;
  vec2 offset=cover(.5+bend)-.5;
  float coverage=clamp(water.a*6.-3.,0.,1.);
  if(coverage>0.)base=mix(base,texture2D(u_lens,clamp(sceneUV+offset,0.,1.)).rgb*1.04,coverage);
  gl_FragColor=vec4(base,1.);
}
