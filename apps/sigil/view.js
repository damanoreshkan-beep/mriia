import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Planet } from "/_rt/astro.js";
import { sigilPath } from "/_rt/sigil.js";
import { collection } from "/_rt/db.js";
import { gate } from "/_rt/gate.js";
import { Sheet, Island, Panel } from "/_rt/ui.js";
import { Scramble, Pixels, useReveal } from "/_rt/skeleton.js";
import { SigilStage, draw2D, sigilToDataURL, immersionAvailable, enableImmersion, disableImmersion } from "./viz.js";
import { downloadUrl } from "/_rt/apk.js";
import { ORGANIC, shapeOf, pathOf } from "/_rt/shape.js";

// THE SEAL (owner 2026-10-11: «розповсюджувати нову дизайн систему»). A kept sigil is pressed into its own seal: the
// sigil's organic form (core shapeOf, seeded by the sigil's seed, so every phone seals the same intent the same way),
// the theme's material faint through it, its edge a rim of light. The form never morphs — it is this sigil's seal.
// The forge stays the 3D stage: the working surface is not decorated. The set leaves out the three forms that cut
// deepest into a centred picture (persona's measure); the sigil reaches ~.25 of the box from the centre.
const FORMS = ORGANIC.filter((n) => !["Flower", "PuffyDiamond", "Puffy"].includes(n));
const formOf = (sig) => shapeOf(sig.seed, FORMS);
// one clipPath per form on screen, not one per seal — two seals of the same form must not repeat an id
const SealDefs = ({ forms }) => html`<svg class="sg-defs" width="0" height="0" aria-hidden="true"><defs>
  ${forms.map((f) => html`<clipPath key=${f} id=${`sg-c-${f}`} clipPathUnits="objectBoundingBox"><path d=${pathOf(f)} /></clipPath>`)}
</defs></svg>`;
const Seal = ({ sig, size, lit }) => {
  const f = formOf(sig), d = pathOf(f);
  return html`<div data-seal data-form=${f} class=${`sg-seal ${lit ? "lit" : ""}`} style=${`width:${size}px;height:${size}px`}>
    <div class="sg-ground" style=${`clip-path:url(#sg-c-${f})`}><${SigilCanvas} sig=${sig} size=${size} /></div>
    <svg class="sg-rim" viewBox="0 0 1 1" aria-hidden="true"><path class="b" d=${d} /><path class="e" d=${d} /></svg>
  </div>`;
};

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const META = "font-mono text-[length:var(--ms-label)] tabular-nums text-muted";
const pKey = (k) => "p" + k[0].toUpperCase() + k.slice(1);
const dKey = (k) => "dom" + k[0].toUpperCase() + k.slice(1);
const grim = collection("sigil");
const DEFAULT_INTENT = "I am calm and focused";

const Attribution = ({ t, sig, onOpen }) => html`<button data-about aria-label=${T(t, "aboutAria")} onClick=${onOpen} class="inline-flex max-w-full items-center gap-2 rounded-full sf-raised sf-e2 px-3 py-1.5 ms-press">
  <span class="shrink-0"><${Planet} body=${sig.planet} /></span>
  <span class="text-sm font-medium truncate">${T(t, pKey(sig.planet))}</span>
  <span class=${`${META} shrink-0`}>${sig.order}×${sig.order}</span>
  ${Icon("lucide:info", "text-sm text-muted shrink-0")}
</button>`;

function AboutSheet({ t, open, sig, onClose }) {
  const kamea = sig ? T(t, "kameaDesc").replace(/\{o\}/g, sig.order).replace("{c}", sig.constant) : "";
  return html`<${Sheet} id="aboutsheet" open=${open} onClose=${onClose}
    title=${sig ? T(t, pKey(sig.planet)) : ""} subtitle=${sig ? `${sig.order}×${sig.order}` : ""}>
    ${sig ? html`<div data-about-sheet class="flex flex-col gap-4">
      <div class="flex items-center gap-2.5">
        <span class="shrink-0"><${Planet} body=${sig.planet} /></span>
        <p class="text-base-content/70">${T(t, dKey(sig.planet))}</p>
      </div>
      ${""}
      <div class="h-px bg-base-content/10"></div>
      <p class="text-sm text-base-content/80 leading-relaxed">${kamea}</p>
      <p class="text-sm text-base-content/80 leading-relaxed">${T(t, "traceDesc")}</p>
      <div class="flex items-center gap-2.5 pt-1">
        <span class=${`${LABEL} shrink-0`}>${T(t, "lettersLabel")}</span>
        <span class="font-mono text-base tracking-[0.35em] text-base-content truncate">${sig.letters.join("")}</span>
      </div>
    </div>` : null}
  </${Sheet}>`;
}

async function shareSigil(sig, t, toast) {
  const url = sigilToDataURL(sig, 720);
  if (url) {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "sigil.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: T(t, "title") }); return; }
    } catch { }
    try { await downloadUrl(url, "sigil.png"); return; } catch { }
  }
  toast && toast(T(t, "shareFail"));
}

export function forge({ S, toast }) {
  const t = useStore(S.t);
  const scr = useStore(S.screen);
  const [intent, setIntent] = useState(gate ? DEFAULT_INTENT : "");
  const [sig, setSig] = useState(gate ? sigilPath(DEFAULT_INTENT) : null);
  const [tilted, setTilted] = useState(false);

  useEffect(() => {
    if (!immersionAvailable) return;
    let alive = true;
    enableImmersion().then((ok) => { if (alive && ok) setTilted(true); });
    return () => { alive = false; disableImmersion(); };
  }, []);

  const doForge = () => { const s = sigilPath(intent); if (s) setSig(s); };
  const keep = async () => { if (!sig) return; try { await grim.put(String(sig.seed), { intent: sig.intent, seed: sig.seed, planet: sig.planet }); } catch { } toast && toast("saved"); };
  const toggleTilt = async () => {
    if (tilted) { disableImmersion(); setTilted(false); return; }
    const ok = await enableImmersion(); setTilted(ok);
  };

  return html`<div class="contents">
    <${SigilStage} sigil=${sig} />
    <div class="relative z-10 flex flex-col min-h-[70svh] px-[var(--ms-pad)] pt-[var(--ms-gap)] pb-[var(--ms-pad)] gap-[var(--ms-gap)] pointer-events-none" data-forged=${sig ? "yes" : "no"} data-tilt=${tilted ? "on" : "off"}>
      <div class="flex justify-center">${sig ? html`<div class="pointer-events-auto"><${Attribution} t=${t} sig=${sig} onOpen=${() => S.screen.set("about")} /></div>` : null}</div>
      <div class="flex-1"></div>
      ${""}
      <${Island} className="pointer-events-auto flex flex-col gap-[var(--ms-gap)]">
        <textarea data-intent rows="1" data-line enterkeyhint="go" aria-label=${T(t, "intentLabel")} value=${intent} placeholder=${T(t, "intentPlaceholder")}
          onInput=${(e) => setIntent(e.currentTarget.value)}
          onKeyDown=${(e) => { if (e.key === "Enter") doForge(); }}
          class="input input-ghost w-full text-base focus:outline-none bg-transparent"></textarea>
        <div class="flex flex-wrap items-center gap-2">
          <button data-forge onClick=${doForge} disabled=${!intent.trim()} class="btn btn-primary flex-1 min-w-0 gap-2">
            ${Icon("lucide:flame", "text-lg shrink-0")}<span class="truncate">${T(t, sig ? "reforgeBtn" : "forgeBtn")}</span>
          </button>
          ${sig ? html`<button data-keep aria-label=${T(t, "keepBtn")} onClick=${keep} class="btn btn-ghost btn-circle shrink-0">${Icon("lucide:bookmark-plus", "text-lg")}</button>` : null}
          ${sig ? html`<button data-share aria-label=${T(t, "shareBtn")} onClick=${() => shareSigil(sig, t, toast)} class="btn btn-ghost btn-circle shrink-0">${Icon("lucide:share-2", "text-lg")}</button>` : null}
          ${""}
          ${sig && immersionAvailable ? html`<button data-tilt aria-label=${T(t, "immerseAria")} aria-pressed=${tilted} onClick=${toggleTilt} class=${`btn btn-circle shrink-0 ${tilted ? "btn-primary" : "btn-ghost"}`}>${Icon("lucide:orbit", "text-lg")}</button>` : null}
        </div>
      </${Island}>
    </div>
    <${AboutSheet} t=${t} open=${scr === "about" && !!sig} sig=${sig} onClose=${() => S.screen.set(null)} />
  </div>`;
}

function SigilCanvas({ sig, size = 132 }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1);
    c.width = size * dpr; c.height = size * dpr;
    // centred: the sigil sits in the middle of its seal (the stage lifts it above the island; a seal has none)
    draw2D(c, sig, { live: true, centred: true });
    let mo;
    if (typeof MutationObserver !== "undefined") { mo = new MutationObserver(() => draw2D(c, sig, { live: true, centred: true })); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] }); }
    return () => mo?.disconnect();
  }, [sig && sig.seed, size]);
  return html`<canvas ref=${ref} data-sigil style=${`width:${size}px;height:${size}px`} class="block"></canvas>`;
}

export function grimoire({ S, toast, undo }) {
  const t = useStore(S.t);
  const scr = useStore(S.screen);
  const [items, setItems] = useState(null);
  const [openId, setOpenId] = useState(null);

  const refresh = async () => { try { setItems(await grim.all()); } catch { setItems([]); } };
  useEffect(() => { refresh(); }, []);
  const shown = useReveal(items !== null);

  const withSig = (items || []).map((it) => ({ ...it, sig: sigilPath(it.intent) })).filter((x) => x.sig);

  const open = (it) => { setOpenId(it.id); S.screen.set("detail"); };
  const remove = async (it) => {
    setItems((xs) => xs.filter((x) => x.id !== it.id));
    if (scr === "detail") S.screen.set(null);
    try { await grim.remove(it.id); } catch { }
    undo && undo(async () => { try { await grim.put(it.id, { intent: it.intent, seed: it.seed, planet: it.planet }); } catch { } refresh(); }, T(t, "removed"));
  };

  const openItem = withSig.find((x) => x.id === openId);

  const tile = "rounded-[var(--ms-r)] sf-raised sf-e2 p-3 flex flex-col items-center gap-2";
  if (!shown) {
    return html`<div class="p-[var(--ms-pad)]"><div class="grid grid-cols-2 gap-[var(--ms-gap)]">
      ${[0, 1].map((i) => html`<div data-skel key=${i} class=${tile}>
        <div class="w-[132px] h-[132px] rounded-[var(--ms-r-in)] overflow-hidden sf-inset"><${Pixels} /></div>
        <div class="text-sm text-muted"><${Scramble} len=${10} /></div>
      </div>`)}
    </div></div>`;
  }

  if (!withSig.length) {
    return html`<div data-empty class="min-h-[60svh] flex items-center justify-center px-[var(--ms-pad)]">
      <${Panel} className="items-center">
        ${Icon("lucide:book-marked", "text-4xl text-muted")}
        <p class="text-sm text-base-content/70">${T(t, "grimoireEmpty")}</p>
      </${Panel}>
    </div>`;
  }

  return html`<div class="p-[var(--ms-pad)]" data-kept=${withSig.length}>
    <${SealDefs} forms=${[...new Set(withSig.map((it) => formOf(it.sig)))]} />
    <div class="grid grid-cols-2 gap-[var(--ms-gap)] ms-stagger">
      ${withSig.map((it, i) => html`<button data-item key=${it.id} onClick=${() => open(it)} style=${`--i:${i}`} class=${`group ${tile} ms-press`}>
        <${Seal} sig=${it.sig} size=${132} />
        <div class="w-full flex items-center gap-1.5 justify-center text-base-content/70">
          <${Planet} body=${it.sig.planet} />
          <span class="text-sm font-medium truncate">${it.intent}</span>
        </div>
      </button>`)}
    </div>

    <${DetailSheet} t=${t} open=${scr === "detail" && !!openItem} it=${openItem} onClose=${() => S.screen.set(null)}
      onShare=${() => openItem && shareSigil(openItem.sig, t, toast)} onRemove=${() => openItem && remove(openItem)} />
  </div>`;
}

function DetailSheet({ t, open, it, onClose, onShare, onRemove }) {
  return html`<${Sheet} id="detailsheet" open=${open} onClose=${onClose} title=${it ? it.intent : ""}>
    ${it ? html`<div data-detail class="flex flex-col items-center gap-4">
      <!-- its clipPath is the grimoire's SealDefs: the sheet opens only for a kept item, whose form is defined there -->
      <${Seal} sig=${it.sig} size=${260} lit />
      <div class="flex items-center gap-2">
        <${Planet} body=${it.sig.planet} />
        <span class="font-medium">${T(t, pKey(it.sig.planet))}</span>
        <span class=${META}>${it.sig.order}×${it.sig.order}</span>
      </div>
      <div class="flex items-center gap-2 w-full max-w-xs">
        <button data-share onClick=${onShare} class="btn btn-primary flex-1 gap-2">${Icon("lucide:share-2", "text-lg")}${T(t, "shareBtn")}</button>
        <button data-remove data-haptic="bump" aria-label=${T(t, "removeBtn")} onClick=${onRemove} class="btn btn-ghost btn-circle text-error">${Icon("lucide:trash-2", "text-lg")}</button>
      </div>
    </div>` : null}
  </${Sheet}>`;
}
