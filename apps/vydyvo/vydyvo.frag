#version 300 es
precision highp float;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;
uniform sampler2D tex; uniform vec2 texAspect;
out vec4 o;

float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / res;
  float dark = vary.x, hasTex = vary.y;
  float t = time * 0.02;
  vec3 base = mix(vec3(0.945, 0.935, 0.905), vec3(0.012, 0.013, 0.020), dark);
  vec3 mist = texture(tex, uv * 0.85 + vec2(t * 0.12, -t * 0.07)).rgb;
  vec3 mist2 = texture(tex, uv * 1.25 - vec2(t * 0.08, t * 0.05)).rgb;
  vec3 col = mix(base, (mist * 0.6 + mist2 * 0.4), hasTex * 0.5);
  col += (n2(uv * 1.8 + vec2(t, -t * 0.7)) - 0.5) * 0.05;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = vec2(0.5) + 0.34 * vec2(sin(t * (0.5 + fi * 0.17) + fi * 2.1 + seed), cos(t * (0.4 + fi * 0.13) + fi * 1.7));
    float d = length((uv - c) * vec2(res.x / res.y, 1.0));
    col += ink.rgb * exp(-d * d * 220.0) * mix(0.10, 0.05, 1.0 - dark) * (0.7 + 0.3 * sin(t * 3.0 + fi));
  }
  float v = smoothstep(1.15, 0.45, length(uv - 0.5) * 1.6);
  col = mix(col * mix(0.985, 0.92, dark), col, v);
  o = vec4(col, 1.0);
}
