const FILTER_VERT = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition( void ) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord( void ) { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}`;
const EDGE_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uMatTexture;
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uStrength;
uniform float uStep;
uniform float uFloor;
uniform vec2 uMatScale;
uniform vec2 uMatOffset;
uniform float uInvert;
float lum(vec2 d) {
  vec2 uv = clamp(vTextureCoord + d, uInputClamp.xy, uInputClamp.zw);
  vec3 c = texture(uTexture, uv).rgb;
  return dot(c, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec2 t = uInputSize.zw * uStep;
  float tl = lum(vec2(-t.x, -t.y)), tc = lum(vec2(0.0, -t.y)), tr = lum(vec2(t.x, -t.y));
  float ml = lum(vec2(-t.x, 0.0)),                              mr = lum(vec2(t.x, 0.0));
  float bl = lum(vec2(-t.x, t.y)),  bc = lum(vec2(0.0, t.y)),  br = lum(vec2(t.x, t.y));
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
  float e = smoothstep(uFloor, 1.0, length(vec2(gx, gy)) * uStrength);
  vec3 m = texture(uMatTexture, fract(vTextureCoord * uInputSize.xy * uMatScale + uMatOffset)).rgb;
  m = mix(m, 1.0 - m, uInvert);   // TD Level → invert: a pale material draws DARK lines on the light theme
  finalColor = vec4(m * e, e);   // premultiplied: the material where a contour is, nothing elsewhere
}`;

export async function createGraph(P, app, opts = {}) {
  const loadTex = opts.loadTex || ((url) => P.Assets.load(url));
  const out = new P.Container();                   
  const base = new P.Sprite(P.Texture.EMPTY); base.anchor.set(0.5);
  const drain = new P.ColorMatrixFilter();
  const traced = new P.Sprite(P.Texture.EMPTY); traced.anchor.set(0.5);
  const white = P.Texture.WHITE.source;
  const edge = P.Filter.from({ gl: { vertex: FILTER_VERT, fragment: EDGE_FRAG, name: "portal-edge" }, resources: {
    edgeUniforms: {
      uStrength: { value: 2, type: "f32" }, uStep: { value: 1, type: "f32" }, uFloor: { value: 0.15, type: "f32" },
      uMatScale: { value: new P.Point(1 / 512, 1 / 512), type: "vec2<f32>" }, uMatOffset: { value: new P.Point(0, 0), type: "vec2<f32>" },
      uInvert: { value: 0, type: "f32" },
    },
    uMatTexture: white, uMatSampler: white.style,
  } });
  traced.filters = [edge];
  const loop = new P.Container();
  const echo = new P.Sprite(P.Texture.EMPTY); echo.anchor.set(0.5);
  const fresh = new P.Sprite(P.Texture.EMPTY); fresh.anchor.set(0.5);
  const field = new P.TilingSprite({ texture: P.Texture.EMPTY, width: 8, height: 8 }); field.renderable = false;
  let ripple = null;
  loop.addChild(echo, fresh);
  const view = new P.Sprite(P.Texture.EMPTY); view.anchor.set(0.5); view.blendMode = "add";
  const twin = new P.Sprite(P.Texture.EMPTY); twin.anchor.set(0.5); twin.visible = false; twin.blendMode = "add";
  const maskL = new P.Graphics(), maskR = new P.Graphics();
  out.addChild(base, view, twin, field);
  const textures = new Map();
  let linesRT = null, rt = [null, null], flip = 0, size = { w: 0, h: 0, r: 1 }, mirror = false, preset = null, time = 0;
  const scroll = { x: 0, y: 0 };

  const W = () => app.screen.width, H = () => app.screen.height;
  const ensure = () => {
    const w = W(), h = H(), r = Math.min(preset?.detail || 1, app.renderer.resolution);
    if (size.w === w && size.h === h && size.r === r && rt[0]) return;
    size = { w, h, r };
    rt.forEach((t) => t?.destroy(true)); linesRT?.destroy(true);
    const mk = () => P.RenderTexture.create({ width: w, height: h, resolution: r });
    rt = [mk(), mk()]; linesRT = mk();
    field.width = w; field.height = h;
    for (const s of [echo, fresh, view, twin]) s.position.set(w / 2, h / 2);
    maskL.clear().rect(0, 0, w / 2, h).fill(0xffffff); maskR.clear().rect(w / 2, 0, w / 2, h).fill(0xffffff);
    fitCam();
  };
  const fitCam = () => {
    const tw = base.texture.width, th = base.texture.height, w = W(), h = H();
    if (!(tw > 1 && th > 1)) return;
    const k = Math.max(w / tw, h / th);
    for (const s of [base, traced]) { s.scale.set(k * (mirror ? -1 : 1), k); s.position.set(w / 2, h / 2); }
  };
  const tex = async (name) => {
    if (!name) return null;
    if (!textures.has(name)) textures.set(name, loadTex(name));
    return textures.get(name);
  };

  return {
    out,
    /** The picture: a video or still texture, mirrored for the front camera. */
    setSource(texture, mirrored) { base.texture = texture; traced.texture = texture; mirror = !!mirrored; fitCam(); },
    /** Apply a preset's graph (`tex`, `edge`, `lines`, `echo`, `base`, `mirror`) — the post chain is the caller's. */
    async setPreset(p, textureUrlOf) {
      preset = p;
      const t = p.tex ? await tex(textureUrlOf(p.tex)) : null;
      if (preset !== p) return;   
      const u = edge.resources.edgeUniforms.uniforms;
      u.uStrength = p.edge?.strength ?? 2; u.uStep = p.edge?.step ?? 1; u.uFloor = p.edge?.floor ?? 0.15;
      const src = t ? t.source : white, sc = p.lines?.scale || 1;
      edge.resources.uMatTexture = src; edge.resources.uMatSampler = src.style;
      u.uMatScale.set(1 / (src.width * sc), 1 / (src.height * sc));
      u.uInvert = p.lines?.invert ? 1 : 0;
      fresh.alpha = p.lines?.alpha ?? 0.6;
      const amt = p.lines?.ripple || 0;
      if (amt && t) {
        field.texture = t;
        if (!ripple) ripple = new P.DisplacementFilter({ sprite: field, scale: amt });
        else ripple.scale.set(amt, amt);
        fresh.filters = [ripple];
      } else fresh.filters = null;
      echo.visible = !!p.echo;
      base.tint = p.base?.dim != null ? Math.round(p.base.dim * 255) * 0x010101 : (p.base?.tint ?? 0xffffff);
      drain.reset(); if (p.base?.sat) drain.saturate(p.base.sat, false);
      base.filters = p.base?.sat ? [drain] : null;
      view.blendMode = twin.blendMode = p.lines?.blend || "add";
      twin.visible = !!p.mirror;
      if (p.mirror) { if (!maskL.parent) out.addChild(maskL, maskR); twin.scale.set(-1, 1); }
      else if (maskL.parent) out.removeChild(maskL, maskR);
      view.mask = p.mirror ? maskR : null; twin.mask = p.mirror ? maskL : null;
    },
    /** One frame: scroll the fields, trace, loop, show. */
    tick(dt) {
      ensure();
      const p = preset; if (!p) return;
      time += dt;
      const u = edge.resources.edgeUniforms.uniforms;
      const k = p.lines?.tempo ?? 1;
      const sp = p.lines?.speed; if (sp) { scroll.x += sp[0] * k * dt; scroll.y += sp[1] * k * dt; u.uMatOffset.set(scroll.x * u.uMatScale.x, scroll.y * u.uMatScale.y); }
      const fs = p.lines?.fieldSpeed; if (fs) { field.tilePosition.x += fs[0] * k * dt; field.tilePosition.y += fs[1] * k * dt; }
      if (p.lines?.breathe) fresh.alpha = (p.lines.alpha ?? 0.6) * (1 + p.lines.breathe * Math.sin(time * (p.lines.rate || 0.8)));
      app.renderer.render({ container: traced, target: linesRT, clear: true });
      fresh.texture = linesRT;
      if (p.echo) {
        echo.texture = rt[1 - flip];
        echo.alpha = p.echo.decay ?? 0.9;
        const z = p.echo.zoom ?? 1; echo.scale.set(z, z);
        echo.rotation = p.echo.rot ?? 0;
      }
      app.renderer.render({ container: loop, target: rt[flip], clear: true });
      view.texture = rt[flip]; twin.texture = rt[flip];
      flip = 1 - flip;
    },
    destroy() {
      rt.forEach((t) => t?.destroy(true)); linesRT?.destroy(true);
      out.destroy({ children: true }); traced.destroy(); loop.destroy({ children: true });
    },
  };
}
