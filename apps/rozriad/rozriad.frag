#version 300 es
// (#version stays on line 1: ANGLE refuses a directive that is not the first line, comments or not.)
// RULE: smoothstep(edge0, edge1, x) only with edge0 < edge1 — a reversed pair is UNDEFINED in GLSL ES.
// rozriad — the picture of the machine's memory (GLSL ES 3.00, mounted by /_rt/glstage.js under
// /_rt/machine.js). The bits live in rozriad.wat: a W×H grid of bytes evolved by the kernel, fluttered under the
// finger, burnt by the impulses. This shader only READS that memory — one texelFetch per pixel, exact bytes — and
// turns a word into light; it adds the glow the memory cannot hold (a soft halo under the finger, the ring's bloom).
//   buf      usampler2D  the grid, row 0 = top; bufSize = W, H in cells
//   ink.xy   cursor  0..1  the primary pointer, top-down like the DOM
//   ink.z    down    0/1
//   ink.w    hold    s
//   vary.x   kernel  0|1|2
//   vary.y   energy  0..3  the machine's energy buffer
//   points   [x, y, age, strength] × 8  the impulses the machine holds
//   env.x    light   0..1  the runtime's theme channel: 0 black void · 1 paper
precision highp float; precision highp int; precision highp usampler2D;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;
uniform vec4 points[8]; uniform float pointCount;
uniform usampler2D buf; uniform vec2 bufSize;

const vec3 AMBER = vec3(0.95, 0.72, 0.29);     // the farm's warm pole
const vec3 CYAN  = vec3(0.36, 0.89, 0.86);     // #5CE4DC, the cool pole
const vec3 PAPER = vec3(0.965, 0.957, 0.933);  // #F6F4EE
const vec3 AMBER_DEEP = vec3(0.44, 0.28, 0.0); // the poles on paper, deepened
const vec3 CYAN_DEEP  = vec3(0.05, 0.43, 0.41);

// population count of a byte — GLSL ES 3.00 has no bitCount (3.10), so the SWAR fold
uint pop8(uint v){ v = v - ((v >> 1u) & 0x55u); v = (v & 0x33u) + ((v >> 2u) & 0x33u); return (v + (v >> 4u)) & 0x0Fu; }

void main(){
  vec2 px = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);   // top-down like the DOM, the cursor and the grid
  vec2 size = max(bufSize, vec2(1.0));
  vec2 pitch = res / size;                                    // one cell in device px
  vec2 cellf = px / pitch;
  ivec2 cell = ivec2(clamp(cellf, vec2(0.0), size - 1.0));
  // the word: the exact byte of the machine's memory at this cell (zero until the memory is bound)
  uint w = bufSize.x > 0.0 ? texelFetch(buf, cell, 0).r : 0u;
  vec2 cc = (vec2(cell) + 0.5) * pitch;                       // the cell's centre, px

  // the finger's halo — the bits already flutter in memory; this is the light around them
  vec2 cur = ink.xy * res;
  float dCells = distance(cc, cur) / pitch.x;
  float r = ink.z > 0.5 ? 6.0 + 18.0 * (1.0 - exp(-ink.w * 0.8)) : 0.0;
  float near = r > 0.0 ? 1.0 - smoothstep(0.0, r, dCells) : 0.0;

  // the impulses' bloom — the ring itself is burnt into memory by the machine; this is its glow
  float ring = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= pointCount) break;
    vec4 p = points[i];
    if (p.z < 0.0 || p.z > 2.5) continue;
    float rad = p.z * 36.0 * (0.6 + 0.4 * p.w) * pitch.x;    // the machine's ring: 36 cells/s
    float dd = abs(distance(cc, p.xy * res) - rad);
    ring += p.w * exp(-p.z * 0.9) * (1.0 - smoothstep(0.0, 2.0 * pitch.x + 8.0 * p.z, dd));
  }
  ring = min(ring, 1.0);

  // word → light: the population count is the brightness, CUBED so the field is mostly true black with sparse
  // lit bits; the low bit picks the pole; the energy buffer lifts the whole field a little
  float pop = float(pop8(w)) / 8.0;
  float energy = clamp(vary.y, 0.0, 3.0);
  float lit = pop * pop * pop * (0.85 + 0.15 * energy) + near * 0.4 * pop;
  // a hairline between cells: the raster is the subject
  vec2 f = fract(cellf);
  float seam = step(0.9, max(f.x, f.y));
  lit *= 1.0 - 0.45 * seam;
  vec3 pole = (w & 1u) == 1u ? CYAN : AMBER;
  vec3 poleDeep = (w & 1u) == 1u ? CYAN_DEEP : AMBER_DEEP;

  vec3 dark = pole * lit + vec3(0.78, 1.0, 0.98) * ring * 0.6 + CYAN * near * 0.06;
  dark = min(dark, vec3(1.0));
  vec3 light = PAPER - (PAPER - poleDeep) * lit - (PAPER - CYAN_DEEP) * ring * 0.5 - (PAPER - CYAN_DEEP) * near * 0.05;
  light = max(light, vec3(0.0));
  o = vec4(mix(dark, light, clamp(env.x, 0.0, 1.0)), 1.0);
}
