#version 300 es
precision highp float;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;

const mat2 R = mat2(0.86, 0.51, -0.51, 0.86);
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<3;i++){ s+=a*noise(p); p=R*p*2.0+vec2(1.7,9.2); a*=0.5; } return s; }

void main(){
  vec2 uv = gl_FragCoord.xy/res; uv.y = 1.0-uv.y;
  float aspect = res.x/res.y;
  vec2 p = (uv-0.5)*vec2(aspect,1.0);

  float light = env.x;
  float core  = clamp(vary.x, 0.0, 1.0);
  float breath = 0.5 + 0.5*sin(time*2.0*3.14159/11.0);

  vec2 c = vec2(0.0, 0.28);
  float d = length(p - c);
  float glow = smoothstep(0.95, 0.0, d) * (0.55 + 0.45*breath) * (0.5 + 0.5*core);

  float n = fbm(p*1.8 + vec2(time*0.05, -time*0.04) + seed*7.0);
  float field = glow * (0.7 + 0.5*n);

  float base  = mix(0.10, 0.965, light);
  float amp   = mix(0.11, 0.06, light);
  float v     = base + (field - 0.35) * amp;
  v = mix(clamp(v, 0.06, 0.20), clamp(v, 0.90, 0.99), light);

  vec3 accent = clamp(ink.rgb, 0.0, 1.0);
  vec3 col = mix(vec3(v), mix(vec3(v), accent, 0.35), clamp(glow*1.2, 0.0, 1.0));
  o = vec4(col, 1.0);
}
