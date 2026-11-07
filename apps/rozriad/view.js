import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { Segmented, Island } from "/_rt/ui.js";
import { GlStage } from "/_rt/glstage.js";

// ROZRIAD — a field of bits on the core's GlStage. The view owns the touch, the impulses and the HUD; the
// pixels are the shader's (rozriad.frag). State map and the uniform mapping: RESEARCH.md.
const KERNELS = ["xor", "hash", "and"];
const PITCH = 6;        // one cell, CSS px (the shader gets it in device px)
const SLOTS = 8;        // the stage's points channel
const RING_S = 2.5;     // an impulse's life, s (the shader stops drawing past it)
const PIX_HZ = 15;      // readPixels cadence while a finger is down

// the kernel is the one thing the owner picks; under the gate it never persists, so every run starts on XOR
const $kernel = gate ? atom("xor") : persistentAtom("rozriad:kernel", "xor");
const $hud = atom({ addr: "0x00000000", pix: "--------", gpu: "", glsl: "", fb: "", t: "0.0s", fps: 0, gl: "" });
const $pulses = atom(0);

// the live state the shader reads EVERY FRAME through the stage's function props — mutated in place, never
// rendered: a pointer move must not re-render the view
const now = () => performance.now() / 1000;
const env = { cx: 0.5, cy: 0.5, down: 0, t0: 0, points: [], energy: 0, energyAt: 0, gl: null, canvas: null, lastPix: 0 };
const ink = () => [env.cx, env.cy, env.down, env.down ? now() - env.t0 : 0];
const vary = () => {
  const t = now();
  env.energy *= Math.exp(-(t - env.energyAt) * 0.9); env.energyAt = t;     // the buffer decays on its own clock
  return [KERNELS.indexOf($kernel.get()), env.energy, PITCH * (env.canvas ? env.canvas.width / Math.max(1, innerWidth) : 1), 0];
};
const points = () => {
  const t = now(), out = [];
  env.points = env.points.filter((p) => t - p.t < RING_S);
  for (const p of env.points) out.push(p.x, p.y, t - p.t, p.k);
  return out;
};
const impulse = (x, y, k) => {
  env.points.push({ x, y, t: now(), k });
  if (env.points.length > SLOTS) env.points.shift();
  env.energy = Math.min(3, env.energy + k);
  $pulses.set($pulses.get() + 1);
};

const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, "0");
const mib = (b) => `${(b / 1048576).toFixed(1)} MiB`;
// the renderer the context admits to: the unmasked one where the browser allows, the masked one elsewhere
const gpuName = (gl) => {
  let r = "";
  try { const x = gl.getExtension("WEBGL_debug_renderer_info"); r = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { }
  const m = /^ANGLE \((.*)\)$/.exec(String(r || ""));
  const parts = (m ? m[1] : String(r || "")).split(",").map((s) => s.trim()).filter(Boolean);
  // "Adreno (TM) 750" → "Adreno 750"; SwiftShader's "Vulkan 1.3.0 (SwiftShader Device …)" → "Vulkan 1.3.0"
  const name = (parts[1] || parts[0] || "").split(/\(TM\)|\(R\)/).join(" ");
  return name.split("(")[0].split(/\s+/).join(" ").trim().slice(0, 26);
};
const glslName = (gl) => { try { return (/ES \d\.\d+/.exec(String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION))) || ["ES 3.00"])[0]; } catch { return "ES 3.00"; } };

/** The address of the pixel under (cx, cy) in the drawing buffer, and its colour read back from the GPU. */
function readTouch(force) {
  const c = env.canvas;
  if (!c) return;
  const w = c.width, h = c.height;
  const x = Math.min(w - 1, Math.max(0, Math.round(env.cx * w))), y = Math.min(h - 1, Math.max(0, Math.round(env.cy * h)));
  const patch = { addr: "0x" + hex((y * w + x) * 4, 8) };
  const t = now();
  if (env.gl && (force || t - env.lastPix > 1 / PIX_HZ)) {
    env.lastPix = t;
    try {
      const b = new Uint8Array(4);
      env.gl.readPixels(x, h - 1 - y, 1, 1, env.gl.RGBA, env.gl.UNSIGNED_BYTE, b);
      patch.pix = "#" + hex(b[0], 2) + hex(b[1], 2) + hex(b[2], 2) + hex(b[3], 2);
    } catch { }
  }
  $hud.set({ ...$hud.get(), ...patch });
}

export function rozriad({ t }) {
  const kernel = useStore($kernel);
  const hud = useStore($hud);
  const pulses = useStore($pulses);
  const root = useRef();

  useEffect(() => {
    // the stage's canvas: the SAME WebGL2 context back (a repeated getContext of one type returns the existing
    // object), so the HUD can read the pixel the shader just wrote — `preserve` keeps it until the next frame
    const canvas = root.current?.querySelector("canvas[data-stage]");
    env.canvas = canvas || null;
    let gl = null;
    try { gl = canvas?.dataset.haswebgl === "yes" ? canvas.getContext("webgl2") : null; } catch { gl = null; }
    env.gl = gl;
    $hud.set({ ...$hud.get(), gl: canvas?.dataset.haswebgl === "yes" ? "yes" : "no", gpu: gl ? gpuName(gl) : "", glsl: gl ? glslName(gl) : "" });
    env.energyAt = now();
    readTouch(true);
    // the HUD's clock: the frame rate is counted on this loop, the text refreshed 4× a second
    let raf = 0, frames = 0, last = performance.now(), shown = last, alive = true;
    const t0 = last;
    const loop = (ts) => {
      if (!alive) return;
      frames++;
      if (ts - shown >= 250) {
        const fps = Math.round(frames * 1000 / (ts - last)); frames = 0; last = ts; shown = ts;
        const c = env.canvas;
        $hud.set({ ...$hud.get(), fps, t: ((ts - t0) / 1000).toFixed(1) + "s", fb: c ? `${c.width}×${c.height} ${mib(c.width * c.height * 4)}` : "" });
        if (env.down) readTouch(false);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); env.gl = null; env.canvas = null; };
  }, []);

  // the stage is the VIEWPORT (fixed inset-0), so a touch is placed in viewport fractions — the field div
  // starts under the header, and its own rect would shift every ring and address by that offset
  const at = (e) => [Math.min(1, Math.max(0, e.clientX / Math.max(1, innerWidth))), Math.min(1, Math.max(0, e.clientY / Math.max(1, innerHeight)))];
  const onDown = (e) => {
    const [x, y] = at(e);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
    if (e.isPrimary !== false) { env.cx = x; env.cy = y; env.down = 1; env.t0 = now(); }
    impulse(x, y, 0.6);
    readTouch(true);
  };
  const onMove = (e) => {
    if (e.isPrimary === false) return;
    [env.cx, env.cy] = at(e);
    if (env.down) readTouch(false);
  };
  const onUp = (e) => {
    const [x, y] = at(e);
    const held = env.down ? now() - env.t0 : 0;
    impulse(x, y, Math.min(1, 0.6 + held * 0.25));          // a release after a hold is the stronger discharge
    if (e.isPrimary !== false) { env.cx = x; env.cy = y; env.down = 0; }
    readTouch(true);
  };
  const onCancel = () => { env.down = 0; readTouch(true); };   // readTouch re-renders, so data-down follows

  // one block per line: htm folds the template's own line breaks, so a `<pre>` cannot carry them as text
  const line = (k, v) => html`<span class="block"><b>${T(t, k).padEnd(5)}</b>${v}</span>`;
  return html`<${Fragment}>
    <div ref=${root} data-rz data-kernel=${kernel} data-addr=${hud.addr} data-down=${env.down} data-pulses=${pulses} data-gl=${hud.gl}
      class="relative h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
      <${GlStage} shader=${new URL("rozriad.frag", import.meta.url)} seed=${(Date.now() % 997) / 997} ink=${ink} vary=${vary} points=${points} preserve=${true} zClass="z-0" />
      <div data-field class="rz-field relative z-10 flex-1 min-h-0 flex flex-col"
        onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onCancel}>
        <pre data-hud class="rz-hud shrink-0">${line("hAddr", html`<i>${hud.addr}</i>`)}${line("hPix", html`<i>${hud.pix}</i>`)}${line("hCtx", `${T(t, "k_" + kernel)} · GLSL ${hud.glsl || "ES 3.00"}`)}${line("hGpu", hud.gpu || "—")}${line("hFb", hud.fb || "—")}${line("hT", `${hud.t} · ${hud.fps} fps`)}</pre>
        ${hud.gl === "no" ? html`<div data-nogl class="rz-nogl flex-1 flex flex-col items-center justify-center text-center gap-1 px-6 pointer-events-none">
          <iconify-icon icon="lucide:cpu" class="text-3xl opacity-60"></iconify-icon>
          <div class="font-semibold">${T(t, "noGl")}</div>
          <div class="text-sm opacity-70">${T(t, "noGlHint")}</div>
        </div>` : null}
      </div>
      <${Island} className="relative z-10 shrink-0">
        <${Segmented} attr="data-kernel-key" variant="solid" label=${T(t, "aKernel")} value=${kernel} onChange=${(id) => $kernel.set(id)}
          items=${KERNELS.map((k) => ({ id: k, label: T(t, "k_" + k) }))} />
      </${Island}>
    </div>
  </${Fragment}>`;
}
