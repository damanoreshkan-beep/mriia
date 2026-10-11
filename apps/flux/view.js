import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Island } from "/_rt/ui.js";
import { CamStage } from "/_rt/camstage.js";
import { motionCells, motionEnergy, centroidOf } from "/_rt/motion.js";
import { createEngine, midiToFreq, filter } from "/_rt/audio.js";
import { gate } from "/_rt/gate.js";
import { downloadUrl } from "/_rt/apk.js";

const PITCHES = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69];

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

function paintSeed(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  const N = 300;
  for (let i = 0; i < N; i++) {
    const s = i / N;
    const x = w * (0.5 + 0.34 * Math.sin(s * Math.PI * 6));
    const y = h * (0.5 + 0.32 * Math.sin(s * Math.PI * 4 + 0.7));
    const hue = (s * 320 + 170) % 360, rad = 4 + 10 * Math.abs(Math.sin(s * Math.PI * 7));
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `hsla(${hue},85%,62%,0.5)`); g.addColorStop(1, `hsla(${hue},85%,62%,0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

export function flux({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const [energy, setEnergy] = useState(gate ? 0.42 : 0);
  const [ghost, setGhost] = useState(true);
  const [sound, setSound] = useState(false);
  const [err, setErr] = useState(null);
  const [ready, setReady] = useState(false);
  const [cam, setCam] = useState(null);
  const sampleRef = useRef(), paintRef = useRef(), prevRef = useRef(null), rafRef = useRef(0);
  const engRef = useRef(null), oscRef = useRef(null), filtRef = useRef(null), sgainRef = useRef(null), soundRef = useRef(false);
  soundRef.current = sound;

  const fit = () => { const c = paintRef.current; if (!c) return; const r = c.getBoundingClientRect?.(); if (r && r.width) { c.width = Math.round(r.width); c.height = Math.round(r.height); } };

  useEffect(() => {
    if (!gate) return;
    fit();
    try { const c = paintRef.current, ctx = c?.getContext?.("2d"); if (ctx) paintSeed(ctx, c.width || 360, c.height || 480); } catch { }
  }, []);

  useEffect(() => {
    if (!cam) return;
    let liveFlag = true;
    fit();
    const onResize = () => fit(); addEventListener("resize", onResize);
    const step = () => {
      if (!liveFlag) return;
      const v = cam, sc = sampleRef.current, pc = paintRef.current, pctx = pc?.getContext?.("2d");
      if (v && sc && pctx && v.readyState >= 2) {
        try {
          const W = 64, H = 48; sc.width = W; sc.height = H;
          const sctx = sc.getContext("2d", { willReadFrequently: true });
          sctx.drawImage(v, 0, 0, W, H);
          const cur = sctx.getImageData(0, 0, W, H).data;
          const cells = motionCells(prevRef.current, cur, W, H, 22);
          const en = motionEnergy(prevRef.current, cur);
          setEnergy(en);
          prevRef.current = cur.slice(0);
          const pw = pc.width, ph = pc.height;
          pctx.globalCompositeOperation = "destination-out";
          pctx.fillStyle = "rgba(0,0,0,0.055)"; pctx.fillRect(0, 0, pw, ph);
          pctx.globalCompositeOperation = "lighter";
          const stepN = Math.max(1, Math.floor(cells.length / 240));
          for (let i = 0; i < cells.length; i += stepN) {
            const c = cells[i], x = c.x * pw, y = c.y * ph, rad = 3 + c.m * 13;
            const g = pctx.createRadialGradient(x, y, 0, x, y, rad);
            g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},0.55)`); g.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
            pctx.fillStyle = g; pctx.beginPath(); pctx.arc(x, y, rad, 0, 7); pctx.fill();
          }
          pctx.globalCompositeOperation = "source-over";
          if (soundRef.current && engRef.current && oscRef.current) {
            const ctx = engRef.current.ctx, now = ctx.currentTime, cen = centroidOf(cells);
            const note = PITCHES[Math.max(0, Math.min(PITCHES.length - 1, Math.floor((1 - cen.y) * PITCHES.length)))];
            try {
              oscRef.current.frequency.setTargetAtTime(midiToFreq(note), now, 0.08);
              filtRef.current.frequency.setTargetAtTime(400 + en * 3200, now, 0.1);
              sgainRef.current.gain.setTargetAtTime(Math.min(0.18, en * 0.5), now, 0.12);
            } catch { }
          }
        } catch { }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { liveFlag = false; cancelAnimationFrame(rafRef.current); removeEventListener("resize", onResize); prevRef.current = null; };
  }, [cam]);

  const clear = () => { const c = paintRef.current, ctx = c?.getContext?.("2d"); if (ctx) ctx.clearRect(0, 0, c.width, c.height); };
  const save = () => {
    const c = paintRef.current; if (!c) return;
    try {
      const out = document.createElement("canvas"); out.width = c.width; out.height = c.height;
      const o = out.getContext("2d"); o.fillStyle = "#000000"; o.fillRect(0, 0, out.width, out.height); o.drawImage(c, 0, 0);
      downloadUrl(out.toDataURL("image/png"), "flux.png");
      S.toast?.(T(t, "toastSaved"));
    } catch { }
  };
  const toggleSound = () => {
    if (sound) { try { sgainRef.current?.gain.setTargetAtTime(0, engRef.current.ctx.currentTime, 0.2); } catch { } setSound(false); return; }
    try {
      if (!engRef.current) {
        const eng = createEngine({ noise: false }); if (!eng) return;
        const osc = eng.ctx.createOscillator(); osc.type = "triangle"; osc.frequency.value = 220;
        const f = filter(eng.ctx, "lowpass", 800, 0.9);
        const g = eng.ctx.createGain(); g.gain.value = 0;
        osc.connect(f); f.connect(g); g.connect(eng.master); osc.start();
        engRef.current = eng; oscRef.current = osc; filtRef.current = f; sgainRef.current = g;
      }
      engRef.current.resume(); setSound(true);
    } catch { }
  };
  useEffect(() => () => { try { oscRef.current?.stop(); engRef.current?.close(); } catch { } }, []);

  return html`<div class="ms-stage z-20 bg-base-100 flex flex-col" data-flux=${err ? "error" : ready ? "live" : "prime"} data-energy=${Math.round(energy * 100)}>
    ${""}
    <div class="relative flex-1 min-h-0 overflow-hidden bg-black">
      <${CamStage} loc=${loc} reason=${T(t, "primeReason")} onSettings=${() => S.screen.set("perms")} primeFull
          facing="environment" still=${null} show=${true} fullscreen=${false} gestures=${false}
          picClassName=${`fx-pic ${ghost ? "opacity-20" : "opacity-0"}`}
          onVideo=${(el) => setCam(el)} onState=${(s) => { setReady(!!s.ready); setErr(s.err || null); }}>
        <canvas ref=${sampleRef} class="hidden"></canvas>
        <canvas ref=${paintRef} class="absolute inset-0 z-[2] w-full h-full"></canvas>
        ${ready && !err ? html`<div class="absolute top-3 left-3 right-3 z-[2] flex items-center pointer-events-none">
          <div data-readout class="h-1.5 flex-1 rounded-full bg-white/15 overflow-hidden">${/* the energy changes every frame: a compositor scale (head.html .fx-level), not a width that relays out */""}<div class="fx-level h-full rounded-full bg-white/70" style=${`scale:${energy.toFixed(2)} 1`}></div></div>
        </div>` : null}
      <//>
    </div>

    ${""}
    <${Island} pinned className="flex items-center justify-center gap-[var(--ms-gap)]">
      ${/* No free form, no Transport, no «одна по колу» (owner 2026-10-11: «розповсюджувати нову дизайн систему»): the
           painting is the canvas itself, edge to edge, and there is nothing to play, pause or go on to — the sound is
           a drone the movement steers. Ghost and sound are held states, so they read in the material (sopilka's
           overblow): pressed into the island while on, the glyph lit (head.html). Save stays the one ink action. btn-ghost
           stays on in both states: core's `.btn:not(.btn-ghost)…` raised drop outranks `.sf-pressed` and would
           paint the held key lifted. Every key is --ms-ctl tall (44px), not btn-sm's 32px. */""}
      <button data-ghost aria-label=${T(t, "ghost")} aria-pressed=${ghost} onClick=${() => setGhost((g) => !g)} class=${`btn btn-ghost btn-circle w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ms-press ${ghost ? "sf-pressed" : ""}`}>${Icon(ghost ? "lucide:eye" : "lucide:eye-off", "fx-glyph text-lg")}</button>
      <button data-sound aria-label=${T(t, "sound")} aria-pressed=${sound} onClick=${toggleSound} class=${`btn btn-ghost btn-circle w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ms-press ${sound ? "sf-pressed" : ""}`}>${Icon(sound ? "lucide:volume-2" : "lucide:volume-x", "fx-glyph text-lg")}</button>
      <button data-clear aria-label=${T(t, "clear")} data-haptic="bump" onClick=${clear} class="btn btn-ghost btn-circle w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ms-press">${Icon("lucide:trash-2", "text-lg")}</button>
      <button data-save aria-label=${T(t, "save")} onClick=${save} class="btn btn-primary rounded-full h-[var(--ms-ctl)] min-h-0 gap-2 px-5 ms-press">${Icon("lucide:download")}${T(t, "save")}</button>
    <//>
  </div>`;
}
