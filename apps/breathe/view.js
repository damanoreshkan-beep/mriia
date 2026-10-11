import { html } from "htm/preact";
import { useState, useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Segmented, Transport, Island } from "/_rt/ui.js";
import { scalePath, shaper } from "/_rt/shape.js";

const TECHS = {
  box: { name: "tBox", sub: "sBox", in: 4, h1: 4, out: 4, h2: 4 },
  "478": { name: "t478", sub: "s478", in: 4, h1: 7, out: 8, h2: 0 },
  coherent: { name: "tCoherent", sub: "sCoherent", in: 5, h1: 0, out: 5, h2: 0 },
  calm: { name: "tCalm", sub: "sCalm", in: 4, h1: 0, out: 6, h2: 0 },
};
const ORDER = ["box", "478", "coherent", "calm"];
// a technique's own form (core shape.js organic set), pinned one each so the four never share a face: box is the
// soft diamond (a square of four equal counts), 4-7-8 the cloud (the one for falling asleep), coherent the even
// twelve-sided wave, calm the flower. Neither Cookie4Sided nor Cookie7Sided: those are the form play button's
// own (playing / paused), and box + playing is the first screen — the orb must not echo the button under it.
const FORM = { box: "PuffyDiamond", "478": "Puffy", coherent: "Cookie12Sided", calm: "Flower" };
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const readTech = () => { try { const k = localStorage.getItem("breathe.tech"); return TECHS[k] ? k : "box"; } catch { return "box"; } };

export function breathe({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const [tech, setTech] = useState(readTech);
  const [playing, setPlaying] = useState(true);
  const orbRef = useRef(), phaseRef = useRef(), countRef = useRef();
  const fill = useRef(), rim = useRef(), form = useRef();

  // THE ORB IS THE TECHNIQUE'S FORM (owner 2026-10-11: «розповсюджувати нову дизайн систему»): the theme's texture
  // through it, a rim of light, and a pick flows it into the next technique's form (one-shot). The rAF loop below
  // still scales the outer element, so the clip is laid at its unscaled size — offsetWidth ignores transforms.
  // Layout effects, so the first paint already has the form, never an unclipped square.
  useLayoutEffect(() => {
    let w = orbRef.current.offsetWidth, last = "";
    const lay = (d) => {
      last = d;
      if (w) fill.current.style.clipPath = `path("${scalePath(d, w)}")`;
      for (const p of rim.current.children) p.setAttribute("d", d);
    };
    form.current = shaper(FORM[tech], lay);
    const ro = new ResizeObserver(() => { const nw = orbRef.current?.offsetWidth || 0; if (nw !== w) { w = nw; if (last) lay(last); } });
    ro.observe(orbRef.current);
    return () => { ro.disconnect(); form.current.stop(); };
  }, []);
  useLayoutEffect(() => { form.current?.to(FORM[tech]); }, [tech]);

  const choose = (k) => { setTech(k); try { localStorage.setItem("breathe.tech", k); } catch { } };

  useEffect(() => {
    if (!playing) return;
    const c = TECHS[tech], total = c.in + c.h1 + c.out + c.h2;
    const label = { in: T(t, "pIn"), hold: T(t, "pHold"), out: T(t, "pOut") };
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf, start = performance.now();
    const loop = (now) => {
      const el = ((now - start) / 1000) % total;
      let scale, ph, rem;
      if (el < c.in) { scale = 0.55 + 0.45 * ease(el / c.in); ph = "in"; rem = c.in - el; }
      else if (el < c.in + c.h1) { scale = 1; ph = "hold"; rem = c.in + c.h1 - el; }
      else if (el < c.in + c.h1 + c.out) { scale = 1 - 0.45 * ease((el - c.in - c.h1) / c.out); ph = "out"; rem = c.in + c.h1 + c.out - el; }
      else { scale = 0.55; ph = "hold"; rem = total - el; }
      if (orbRef.current) orbRef.current.style.transform = `scale(${(reduce ? 0.8 : scale).toFixed(3)})`;
      if (phaseRef.current) phaseRef.current.textContent = label[ph];
      if (countRef.current) countRef.current.textContent = String(Math.ceil(rem));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tech, playing, t]);

  return html`<div data-breathe data-tech-sel=${tech} data-playing=${playing ? "1" : "0"} class="flex flex-col items-center gap-[calc(var(--ms-gap)*1.5)] pt-2">
    <div class="flex flex-col gap-1 self-stretch min-w-0 px-[var(--ms-pad)]">
      ${""}
      <${Segmented} attr="data-tech" scroll label=${T(t, "tabBreathe")}
        items=${ORDER.map((k) => ({ id: k, label: T(t, TECHS[k].name), title: T(t, TECHS[k].sub) }))} value=${tech} onChange=${choose} />
    </div>

    ${""}
    <div class="w-full flex justify-center py-3">
      <div ref=${orbRef} data-orb data-form=${FORM[tech]} class="br-orb w-full max-w-[210px] aspect-square" style="will-change:transform" aria-hidden="true">
        <div ref=${fill} class="br-fill"></div>
        <svg ref=${rim} class="br-rim" viewBox="0 0 1 1"><path class="b1" /><path class="b2" /><path class="e" /></svg>
      </div>
    </div>

    <div class="flex flex-col items-center gap-[var(--ms-gap)] -mt-4 self-stretch">
      <div ref=${phaseRef} data-phase class="text-xl font-semibold text-base-content/80 h-7"></div>
      <div ref=${countRef} class="text-6xl font-bold tabular-nums leading-none h-14"></div>
      <${Island} className="w-full max-w-xs mx-auto">
        ${/* the kit's organic play button. No seek and no loop toggle: a technique is one endless cycle — no track to
             scrub, no next one to go on to. */""}
        <${Transport} form locale=${loc} playing=${playing} onToggle=${() => setPlaying((p) => !p)} />
      <//>
    </div>
  </div>`;
}
