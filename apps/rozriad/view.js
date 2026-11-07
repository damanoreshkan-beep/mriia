import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { Segmented, Island } from "/_rt/ui.js";
import { MachineStage } from "/_rt/machine.js";

// ROZRIAD — a MACHINE app: the bits, the touch and the impulses live in rozriad.wat's linear memory, the pixels are
// rozriad.frag reading that memory, the host is the core's /_rt/machine.js. This file only picks the kernel and
// formats what the machine reports into the terminal HUD. State map: RESEARCH.md.
const KERNELS = ["xor", "hash", "and"];

// the kernel is the one thing the owner picks; under the gate it never persists, so every run starts on XOR
const $kernel = gate ? atom("xor") : persistentAtom("rozriad:kernel", "xor");
// what the machine reported last (HUD block, 4× a second): addresses and counters, plus the fps measured from its step counter
const $hud = atom({ addr: 0, word: 0, energy: 0, pulses: 0, steps: 0, mem: 0, down: 0, fps: 0 });
const $ctx = atom({ gpu: "", glsl: "" });

const hex = (n, w) => (n >>> 0).toString(16).toUpperCase().padStart(w, "0");
const bits = (n) => (n & 255).toString(2).padStart(8, "0");
const kib = (b) => `${Math.round(b / 1024)} KiB`;
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

let lastSteps = 0, lastAt = 0, stage = null;
const onHud = (h) => {
  const now = performance.now();
  const fps = lastAt ? Math.round((h[5] - lastSteps) * 1000 / Math.max(1, now - lastAt)) : 0;
  lastSteps = h[5]; lastAt = now;
  // the drawing buffer is read on the tick, not at mount: before GlStage sizes it a canvas is its intrinsic 300×150
  const fb = stage ? `${stage.width}×${stage.height} ${mib(stage.width * stage.height * 4)}` : "";
  $hud.set({ addr: h[0], word: h[1], energy: h[3] / 1000, pulses: h[4], steps: h[5], mem: h[9], down: h[11], fps, fb });
};

export function rozriad({ t }) {
  const kernel = useStore($kernel);
  const hud = useStore($hud);
  const ctx = useStore($ctx);
  const root = useRef();

  useEffect(() => {
    // the shader context's own words: the stage's canvas hands its WebGL2 context back (a repeated getContext of one type)
    const c = root.current?.querySelector("canvas[data-stage]");
    stage = c || null;
    let gl = null;
    try { gl = c?.dataset.haswebgl === "yes" ? c.getContext("webgl2") : null; } catch { gl = null; }
    $ctx.set({ gpu: gl ? gpuName(gl) : "", glsl: gl ? glslName(gl) : "" });
    return () => { stage = null; };
  }, []);

  const line = (k, v) => html`<span class="block"><b>${T(t, k).padEnd(5)}</b>${v}</span>`;
  return html`<${Fragment}>
    <div ref=${root} data-rz data-kernel=${kernel} data-addr=${"0x" + hex(hud.addr, 8)} data-down=${hud.down} data-pulses=${hud.pulses}
      class="relative h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
      <${MachineStage} wasm=${new URL("rozriad.wasm", import.meta.url)} shader=${new URL("rozriad.frag", import.meta.url)}
        seed=${(Date.now() % 997) / 997} params=${[KERNELS.indexOf(kernel)]} onHud=${onHud} zClass="z-0" />
      <div data-field class="relative z-10 flex-1 min-h-0 flex flex-col pointer-events-none">
        <pre data-hud class="rz-hud shrink-0">${line("hAddr", html`<i>0x${hex(hud.addr, 8)}</i>`)}${line("hWord", html`<i>0x${hex(hud.word, 2)}</i> ${bits(hud.word)}`)}${line("hCtx", `${T(t, "k_" + kernel)} · GLSL ${ctx.glsl || "ES 3.00"}`)}${line("hGpu", ctx.gpu || "—")}${line("hMem", `wasm ${kib(hud.mem)} · fb ${hud.fb || "—"}`)}${line("hT", `${hud.steps} · ${hud.fps} fps`)}</pre>
      </div>
      <${Island} className="relative z-10 shrink-0">
        <${Segmented} attr="data-kernel-key" variant="solid" label=${T(t, "aKernel")} value=${kernel} onChange=${(id) => $kernel.set(id)}
          items=${KERNELS.map((k) => ({ id: k, label: T(t, "k_" + k) }))} />
      </${Island}>
    </div>
  </${Fragment}>`;
}
