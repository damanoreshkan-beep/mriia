#version 300 es
precision highp float; precision highp int;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;
uniform vec4 points[8]; uniform float pointCount;

const vec3 AMBER = vec3(0.95, 0.72, 0.29);
const vec3 CYAN  = vec3(0.36, 0.89, 0.86);
const vec3 PAPER = vec3(0.965, 0.957, 0.933);
const vec3 AMBER_DEEP = vec3(0.44, 0.28, 0.0);
const vec3 CYAN_DEEP  = vec3(0.05, 0.43, 0.41);

uint pcg(uint v){ v = v * 747796405u + 2891336453u; uint w = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u; return (w >> 22u) ^ w; }
uint h2(uvec2 p, uint t){ return pcg(p.x ^ pcg(p.y ^ pcg(t))); }
uint pop8(uint v){ v = v - ((v >> 1u) & 0x55u); v = (v & 0x33u) + ((v >> 2u) & 0x33u); return (v + (v >> 4u)) & 0x0Fu; }

void main(){
  vec2 px = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  float pitch = max(2.0, vary.z);
  uvec2 cell = uvec2(px / pitch);
  vec2 cc = (vec2(cell) + 0.5) * pitch;
  uint frame = uint(time * 8.0);
  uint s = uint(seed * 1024.0);
  int kernel = int(vary.x + 0.5);

  uint w;
  if (kernel == 0)      w = ((cell.x ^ cell.y) + frame + s) & 255u;
  else if (kernel == 1) w = h2(cell, frame / 4u + s) & 255u;
  else                  w = (((cell.x + frame) & cell.y) + s) & 255u;

  vec2 cur = ink.xy * res;
  float d = distance(cc, cur) / pitch;
  float r = ink.z > 0.5 ? 6.0 + 18.0 * (1.0 - exp(-ink.w * 0.8)) : 0.0;
  float near = 0.0;
  if (r > 0.0) {
    near = 1.0 - smoothstep(0.0, r, d);
    uint f = h2(cell, uint(time * 60.0));
    w ^= f & uint(near * 255.0);
  }

  float ring = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= pointCount) break;
    vec4 p = points[i];
    if (p.z < 0.0 || p.z > 2.5) continue;
    float rad = p.z * 220.0 * (0.6 + 0.4 * p.w);
    float dd = abs(distance(cc, p.xy * res) - rad);
    ring += p.w * exp(-p.z * 0.9) * (1.0 - smoothstep(0.0, 12.0 + 8.0 * p.z, dd));
  }
  ring = min(ring, 1.0);

  float pop = float(pop8(w)) / 8.0;
  float energy = clamp(vary.y, 0.0, 3.0);
  float lit = pop * pop * pop * (0.85 + 0.15 * energy) + near * 0.4 * pop;
  vec2 f = fract(px / pitch);
  float seam = step(0.9, max(f.x, f.y));
  lit *= 1.0 - 0.45 * seam;
  vec3 pole = (w & 1u) == 1u ? CYAN : AMBER;
  vec3 poleDeep = (w & 1u) == 1u ? CYAN_DEEP : AMBER_DEEP;

  vec3 dark = pole * lit + vec3(0.78, 1.0, 0.98) * ring * 0.85 + CYAN * near * 0.06;
  dark = min(dark, vec3(1.0));
  vec3 light = PAPER - (PAPER - poleDeep) * lit - (PAPER - CYAN_DEEP) * ring * 0.7 - (PAPER - CYAN_DEEP) * near * 0.05;
  light = max(light, vec3(0.0));
  o = vec4(mix(dark, light, clamp(env.x, 0.0, 1.0)), 1.0);
}
