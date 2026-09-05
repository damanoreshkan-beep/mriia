export async function createGraph(P, app, opts = {}) {
  const loadTex = opts.loadTex || ((url) => P.Assets.load(url));
  const out = new P.Container();                   
  const world = new P.Container();                 
  const echo = new P.Sprite(P.Texture.EMPTY); echo.anchor.set(0.5);
  const cam = new P.Sprite(P.Texture.EMPTY); cam.anchor.set(0.5);
  const mat = new P.TilingSprite({ texture: P.Texture.EMPTY, width: 8, height: 8 });
  const disp = new P.TilingSprite({ texture: P.Texture.EMPTY, width: 8, height: 8 }); disp.renderable = false;
  world.addChild(echo, cam);
  const view = new P.Sprite(P.Texture.EMPTY); view.anchor.set(0.5);
  const twin = new P.Sprite(P.Texture.EMPTY); twin.anchor.set(0.5); twin.visible = false;
  const maskL = new P.Graphics(), maskR = new P.Graphics();
  out.addChild(view, twin, mat, disp);
  const textures = new Map();
  let rt = [null, null], flip = 0, size = { w: 0, h: 0 }, mirror = false, preset = null, time = 0, dispFilter = null;

  const W = () => app.screen.width, H = () => app.screen.height;
  const ensure = () => {
    const w = W(), h = H();
    if (size.w === w && size.h === h && rt[0]) return;
    size = { w, h };
    rt.forEach((t) => t?.destroy(true));
    rt = [0, 1].map(() => P.RenderTexture.create({ width: w, height: h, resolution: 1 }));
    mat.width = w; mat.height = h; disp.width = w; disp.height = h;
    echo.position.set(w / 2, h / 2); view.position.set(w / 2, h / 2); twin.position.set(w / 2, h / 2);
    maskL.clear().rect(0, 0, w / 2, h).fill(0xffffff); maskR.clear().rect(w / 2, 0, w / 2, h).fill(0xffffff);
    fitCam();
  };
  const fitCam = () => {
    const tw = cam.texture.width, th = cam.texture.height, w = W(), h = H();
    if (!(tw > 1 && th > 1)) return;
    const k = Math.max(w / tw, h / th);
    cam.scale.set(k * (mirror ? -1 : 1), k); cam.position.set(w / 2, h / 2);
  };
  const tex = async (name) => {
    if (!name) return null;
    if (!textures.has(name)) textures.set(name, loadTex(name));
    return textures.get(name);
  };

  return {
    out,
    /** The picture: a video or still texture, mirrored for the front camera. */
    setSource(texture, mirrored) { cam.texture = texture; mirror = !!mirrored; fitCam(); },
    /** Apply a preset's graph (its `tex`, `cam`, `mat`, `echo`, `disp`, `mirror`) — the post chain is the caller's. */
    async setPreset(p, textureUrlOf) {
      preset = p;
      cam.blendMode = p.cam?.blend || "normal"; cam.alpha = p.cam?.alpha ?? 1;
      const t = p.tex ? await tex(textureUrlOf(p.tex)) : null;
      if (preset !== p) return;   
      mat.visible = !!(p.mat && t); if (t) { mat.texture = t; mat.tileScale.set(p.mat?.scale || 1); }
      if (p.mat) { mat.blendMode = p.mat.blend || "screen"; mat.alpha = p.mat.alpha ?? 0.5; }
      echo.visible = !!p.echo;
      if (p.disp && t) {
        disp.texture = t;
        const amt = p.disp.amount || 20;
        if (!dispFilter) dispFilter = new P.DisplacementFilter({ sprite: disp, scale: amt });
        else dispFilter.scale.set(amt, amt);
        cam.filters = [dispFilter];
      } else cam.filters = null;
      twin.visible = !!p.mirror;
      if (p.mirror) { if (!maskL.parent) out.addChild(maskL, maskR); twin.scale.set(-1, 1); }
      else if (maskL.parent) out.removeChild(maskL, maskR);
      view.mask = p.mirror ? maskR : null; twin.mask = p.mirror ? maskL : null;
    },
    /** One frame: scroll the fields, breathe, render the world into the feedback texture, show it. */
    tick(dt) {
      ensure();
      const p = preset; if (!p) return;
      time += dt;
      if (p.mat?.speed) { mat.tilePosition.x += p.mat.speed[0] * dt; mat.tilePosition.y += p.mat.speed[1] * dt; }
      if (p.mat?.breathe) mat.alpha = (p.mat.alpha ?? 0.5) * (1 + p.mat.breathe * Math.sin(time * (p.mat.rate || 0.6)));
      if (p.disp?.speed) { disp.tilePosition.x += p.disp.speed[0] * dt; disp.tilePosition.y += p.disp.speed[1] * dt; }
      if (p.echo) {
        echo.texture = rt[1 - flip];
        echo.alpha = p.echo.decay ?? 0.85;
        const z = p.echo.zoom ?? 1; echo.scale.set(z, z);
        echo.rotation = p.echo.rot ?? 0;
      }
      app.renderer.render({ container: world, target: rt[flip], clear: true });
      view.texture = rt[flip]; twin.texture = rt[flip];
      flip = 1 - flip;
    },
    destroy() { rt.forEach((t) => t?.destroy(true)); out.destroy({ children: true }); world.destroy({ children: true }); },
  };
}
