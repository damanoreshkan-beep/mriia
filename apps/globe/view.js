import { html } from "htm/preact";
import { useState, useRef, useLayoutEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Globe } from "/_rt/globe.js";
import { Panel } from "/_rt/ui.js";
import { ORGANIC, shapeOf, pathOf, scalePath, shaper } from "/_rt/shape.js";
import facts from "./facts.json" with { type: "json" };

export { iss } from "./track.js";
export { quakes } from "./quakes.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LIST = Object.entries(facts).map(([id, f]) => ({ id, ...f }));
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const iso = (flag) => Array.from(flag || "").map((ch) => { const n = ch.codePointAt(0) - 0x1F1E6; return n >= 0 && n < 26 ? String.fromCharCode(65 + n) : ""; }).join("");
// A country's own form (core shape.js), the same on every phone, seeded by its ISO numeric id. The globe is the
// working surface and stays unclipped; the form sits on the country as an OBJECT — its code in the search list,
// the orb on its facts card. Flower, PuffyDiamond and Puffy cut deepest into a centred mark (the store's measure),
// so a two-letter code sits in the other ten.
const FORMS = ORGANIC.filter((n) => !["Flower", "PuffyDiamond", "Puffy"].includes(n));
const formOf = (id) => shapeOf(id, FORMS);

// THE ORB — the chosen country's form, the theme's texture through it, a rim of light, its code on it. Picking
// another country flows it into that one's form (one-shot; instant under reduced motion and in the gate). Layout
// effects, so the first paint already has the form; the clip follows the measured size.
function CountryOrb({ id, code }) {
  const orb = useRef(), fill = useRef(), rim = useRef(), form = useRef();
  useLayoutEffect(() => {
    let w = orb.current.offsetWidth, last = "";
    const lay = (d) => {
      last = d;
      if (w) fill.current.style.clipPath = `path("${scalePath(d, w)}")`;
      for (const p of rim.current.children) p.setAttribute("d", d);
    };
    form.current = shaper(formOf(id), lay);
    const ro = new ResizeObserver(() => { const nw = orb.current?.offsetWidth || 0; if (nw !== w) { w = nw; if (last) lay(last); } });
    ro.observe(orb.current);
    return () => { ro.disconnect(); form.current.stop(); };
  }, []);
  useLayoutEffect(() => { form.current?.to(formOf(id)); }, [id]);
  return html`<span ref=${orb} data-orb data-form=${formOf(id)} class="gl-orb">
    <span ref=${fill} class="gl-fill" aria-hidden="true"></span>
    <svg ref=${rim} class="gl-rim" viewBox="0 0 1 1" aria-hidden="true"><path class="b" /><path class="e" /></svg>
    <span class="gl-code font-mono font-semibold tracking-wider">${code}</span>
  </span>`;
}

export function globe({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(null);
  const f = sel ? facts[sel] : null;
  const ql = q.trim().toLowerCase();
  const matches = ql ? LIST.filter((c) => c.n.toLowerCase().includes(ql) || (c.nUk || "").toLowerCase().includes(ql)).slice(0, 6) : [];

  const pick = ({ id }) => { if (id && facts[id]) { setSel(id); setQ(""); } };
  const choose = (c) => { setSel(c.id); setQ(""); setFocus({ lat: c.ll[0], lon: c.ll[1] }); };

  const num = (n) => n == null ? "—" : Number(n).toLocaleString(loc === "uk" ? "uk-UA" : "en-US");
  const row = (icon, label, val) => val ? html`<div class="flex items-start gap-2.5 py-2"><span class="text-muted shrink-0 w-5 text-center mt-0.5">${Icon(icon)}</span><div class="min-w-0"><div class=${LABEL}>${T(t, label)}</div><div class="font-medium break-words">${val}</div></div></div>` : null;

  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-sel=${sel || ""} data-matches=${matches.length}>
    <${Globe} selected=${sel} focus=${focus} onPick=${pick} spin=${!sel} />

    <label class="input flex items-center gap-2 h-auto min-h-[var(--ms-ctl)] rounded-[var(--ms-r)]">${Icon("lucide:search", "text-lg text-muted")}<textarea rows="1" data-line enterkeyhint="search" id="country-search" class="grow leading-6 py-1.5 bg-transparent outline-none border-0" placeholder=${T(t, "search")} autocomplete="off" value=${q} onInput=${(e) => setQ(e.target.value)}></textarea></label>
    ${matches.length ? html`<div class="flex flex-col gap-1 ms-stagger" id="matches">${matches.map((c, i) => html`<button class="gl-pick btn btn-ghost justify-start gap-2.5 ms-press" style=${`--i:${i}`} data-id=${c.id} key=${c.id} onClick=${() => choose(c)}><span class="gl-mark" data-form=${formOf(c.id)} aria-hidden="true"><svg viewBox="0 0 1 1" class="gl-form"><path d=${pathOf(formOf(c.id))} /></svg><span class="gl-mark-code">${iso(c.flag)}</span></span>${c.n}</button>`)}</div>` : null}

    ${f
      ? html`<${Panel} data-facts=${sel}>
          <div class="flex items-center gap-3">
            ${""}
            <${CountryOrb} id=${sel} code=${iso(f.flag)} />
            <div class="min-w-0"><div class="font-bold text-lg leading-tight break-words">${f.n}</div><div class="text-sm text-muted">${f.reg}${f.sub ? " · " + f.sub : ""}</div></div>
          </div>
          <div class="divide-y divide-base-300/40">
            ${row("lucide:landmark", "fCapital", f.cap)}
            ${row("lucide:users", "fPopulation", num(f.pop))}
            ${row("lucide:ruler", "fArea", f.area ? num(f.area) + " km²" : null)}
            ${row("lucide:languages", "fLang", f.langs)}
            ${row("lucide:coins", "fCurrency", f.cur)}
          </div>
        <//>`
      : null}
  </div>`;
}
