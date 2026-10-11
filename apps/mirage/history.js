import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { Sheet } from "/_rt/ui.js";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";

const KEY = (ns) => `ms:mirage:hist:${ns}`;
const MAX = 30;
const read = (ns) => { if (gate) return []; try { const v = JSON.parse(localStorage.getItem(KEY(ns)) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };

export function usePromptHistory(ns) {
  const [items, setItems] = useState(() => read(ns));
  useEffect(() => { setItems(read(ns)); }, [ns]);
  const remember = (text) => {
    const line = String(text || "").trim(); if (!line) return;
    const next = [line, ...items.filter((x) => x !== line)].slice(0, MAX);
    setItems(next);
    if (!gate) { try { localStorage.setItem(KEY(ns), JSON.stringify(next)); } catch { } }
  };
  return [items, remember];
}

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// How many times a sheet has opened. Its list is keyed by this count: a fresh key on each open replays the arrival
// (.ms-stagger), and the list stays mounted while the sheet closes, so the box rides its close animation whole
// instead of collapsing to the title.
export function useOpens(open) {
  const s = useRef({ n: 0, was: false });
  if (open && !s.current.was) s.current.n++;
  s.current.was = open;
  return s.current.n;
}

export function HistorySheet({ id = "hist-sheet", open, onClose, items, onPick, t, locale }) {
  const opens = useOpens(open);
  return html`<${Sheet} id=${id} open=${open} onClose=${onClose} title=${T(t, "history")} icon="lucide:history" locale=${locale}>
    ${!opens ? null : items.length
      ? html`<div key=${opens} data-hist-list class="flex flex-col gap-1.5 ms-stagger">
          ${items.map((line, i) => html`<button key=${line} data-hist-item=${i} type="button" style=${`--i:${i}`} class="text-left rounded-2xl sf-inset px-4 py-3 text-[0.95rem] leading-snug ms-press" onClick=${() => { onPick(line); onClose(); }}>${line}</button>`)}
        </div>`
      : html`<div data-hist-empty class="flex flex-col items-center gap-2 py-8 text-center text-muted">${Icon("lucide:history", "text-3xl")}<div class="text-sm">${T(t, "historyEmpty")}</div></div>`}
  </${Sheet}>`;
}
