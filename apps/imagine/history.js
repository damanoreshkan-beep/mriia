import { html } from "htm/preact";
import { useRef, useState } from "preact/hooks";
import { Sheet } from "/_rt/ui.js";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { shapeOf, pathOf } from "/_rt/shape.js";

const KEY = (ns) => `ms:imagine:hist:${ns}`;
const MAX = 30;
const read = (ns) => { if (gate) return []; try { const v = JSON.parse(localStorage.getItem(KEY(ns)) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };

export function usePromptHistory(ns) {
  const [items, setItems] = useState(() => read(ns));
  const remember = (text) => {
    const line = String(text || "").trim(); if (!line) return;
    const next = [line, ...items.filter((x) => x !== line)].slice(0, MAX);
    setItems(next);
    if (!gate) { try { localStorage.setItem(KEY(ns), JSON.stringify(next)); } catch { } }
  };
  return [items, remember];
}

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// THE PROMPT'S FORM (owner 2026-10-11: «розповсюджувати нову дизайн систему»). Imagine's identity is the PROMPT —
// the words a picture is made from; the picture itself stays untouched on the stage. So a remembered prompt wears
// its own organic form (core shapeOf, seeded by the words): the same words, the same form, on every phone and in
// every tab. One clipPath per form in use, ids scoped by the sheet (three tabs keep three sheets); objectBoundingBox
// takes the 0..1 path as is, so no row is measured. A static path — nothing draws at rest.
export function HistorySheet({ id = "hist-sheet", open, onClose, items, onPick, t, locale }) {
  const forms = items.map((line) => shapeOf(line));
  // the dialog stays mounted while closed (daisyUI's .modal hides it with visibility, not display), so a list
  // mounted once would rise unseen at page load and never again: it mounts on the first open and is keyed by the
  // opening, so it arrives on every open and stays whole through the close
  const opens = useRef(0), was = useRef(false);
  if (open && !was.current) opens.current++;
  was.current = open;
  return html`<${Sheet} id=${id} open=${open} onClose=${onClose} title=${T(t, "history")} icon="lucide:history" locale=${locale}>
    ${!opens.current ? null : items.length
      ? html`<div key=${opens.current} data-hist-list class="ms-stagger flex flex-col gap-1.5">
          <svg aria-hidden="true" class="im-forms" width="0" height="0"><defs>${[...new Set(forms)].map((f) => html`<clipPath key=${f} id=${`${id}-c-${f}`} clipPathUnits="objectBoundingBox"><path d=${pathOf(f)} /></clipPath>`)}</defs></svg>
          ${items.map((line, i) => html`<button key=${line} data-hist-item=${i} type="button" style=${`--i:${i}`} class="im-hist ms-press text-left rounded-2xl sf-inset px-3 py-2.5 flex items-center gap-3 text-[0.95rem] leading-snug" onClick=${() => { onPick(line); onClose(); }}>
            <span data-form=${forms[i]} aria-hidden="true" class="im-form"><span class="im-form-fill" style=${`clip-path:url(#${id}-c-${forms[i]})`}></span><svg class="im-form-rim" viewBox="0 0 1 1"><path d=${pathOf(forms[i])} /></svg></span>
            <span class="flex-1 min-w-0">${line}</span>
          </button>`)}
        </div>`
      : html`<div data-hist-empty class="flex flex-col items-center gap-2 py-8 text-center text-muted">${Icon("lucide:history", "text-3xl")}<div class="text-sm">${T(t, "historyEmpty")}</div></div>`}
  </${Sheet}>`;
}
