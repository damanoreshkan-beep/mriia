import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { collection } from "/_rt/db.js";
import { ORGANIC, shapeOf, pathOf } from "/_rt/shape.js";
import { frequent } from "/_rt/usage.js";
import { Comb, MARK } from "/_rt/comb.js";
import apps from "./apps.json" with { type: "json" };
import spec from "./spec.json" with { type: "json" };

const Icon = (icon, cls, style) => html`<iconify-icon icon=${icon} class=${cls || ""} style=${style || ""}></iconify-icon>`;
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const DOT = (accent2) => html`<span aria-hidden="true" class="w-1.5 h-1.5 rounded-full shrink-0" style=${`background:var(${accent2 ? "--app-accent-2" : "--app-accent"})`}></span>`;
const AppArt = (a, size) => a.icon
  ? html`<img src=${`../${a.id}/icon.svg`} alt="" aria-hidden="true" decoding="async" loading="lazy" style=${`width:${size};height:${size}`} class="rounded-[inherit] block" />`
  : a.art
  ? html`<svg viewBox="0 0 24 24" style=${`width:${size};height:${size};color:var(--color-base-content)`} fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: a.art }}></svg>`
  : Icon(a.glyph, "", `font-size:${size};color:var(--color-base-content)`);
const FORMS = ORGANIC.filter((n) => !["Flower", "PuffyDiamond", "Puffy"].includes(n));
const formOf = (a) => shapeOf(a.id, FORMS);
const Forms = () => html`<svg aria-hidden="true" class="st-forms" width="0" height="0"><defs>${FORMS.map((n) => html`<clipPath key=${"c" + n} id=${`st-c-${n}`} clipPathUnits="objectBoundingBox"><path d=${pathOf(n)} /></clipPath><path key=${"p" + n} id=${`st-p-${n}`} d=${pathOf(n)} vector-effect="non-scaling-stroke" />`)}</defs></svg>`;
const Tile = (a, cls) => { const f = formOf(a); return html`<div data-form=${f} class=${`st-tile ${cls}`}>
  <div class="st-tile-art" style=${`clip-path:url(#st-c-${f})`}>${AppArt(a, a.icon ? "100%" : "46%")}</div>
  <svg aria-hidden="true" class="st-rim" viewBox="0 0 1 1"><use href=${`#st-p-${f}`} /></svg>
</div>`; };
const SEEN = collection("seen");
const CATALOG = collection("catalog");
const appUrl = (id) => `../${id}/`;
const CATS = ["science", "feeds", "tools", "sound", "hackrf", "creative", "money", "wellness", "play", "esoterica"];
const catKey = (c) => "cat" + c[0].toUpperCase() + c.slice(1);
const TODAY_DAYS = 2;
const ageDays = (a) => Math.max(0, Math.floor((Date.now() - Date.parse(a.added + "T00:00:00")) / 86400000));
const isNewborn = (a) => !!a.added && ageDays(a) < TODAY_DAYS;
const NEWBORN = apps.filter(isNewborn).sort((x, y) => y.added.localeCompare(x.added) || x.title.localeCompare(y.title, "uk"));
const TOP = 6;
const byId = new Map(apps.map((a) => [a.id, a]));
const USED = frequent().map((x) => byId.get(x.id)).filter(Boolean);
const PICKS = [...new Set([...USED, ...(spec.featured || []).map((id) => byId.get(id)).filter(Boolean)])].slice(0, TOP);
const LEAD = PICKS[0] || null;
const NEW = NEWBORN.filter((a) => !PICKS.includes(a));
const CAT_GROUPS = CATS.map((c) => ({ id: c, key: catKey(c), items: apps.filter((a) => a.category === c && !PICKS.includes(a) && !isNewborn(a)).sort((x, y) => x.title.localeCompare(y.title, "uk")) })).filter((g) => g.items.length);
const OTHER = apps.filter((a) => !CATS.includes(a.category) && !PICKS.includes(a) && !isNewborn(a));
const GROUPS = [
  { id: "picks", key: "featured", color: "accent", items: PICKS },
  ...(NEW.length ? [{ id: "new", key: "fresh", color: "secondary", items: NEW }] : []),
  ...CAT_GROUPS.map((g, i) => ({ ...g, color: ["accent", "secondary", "ink"][i % 3] })),
  ...(OTHER.length ? [{ id: "other", key: "allApps", color: "ink", items: OTHER }] : []),
];
const ORDER = GROUPS.flatMap((g) => g.items);
const GROUP_OF = new Map(GROUPS.flatMap((g, gi) => g.items.map((a) => [a.id, gi])));

export function store({ S }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const nameOf = (a) => a.titles?.[locale] || a.title;
  const taglineOf = (a) => a.taglines?.[locale] || a.tagline || "";
  const subtitleOf = (a) => { const s = taglineOf(a); const m = /^(.{12,90}?[.!?—])\s/.exec(s + " "); return m ? m[1].replace(/[—.]$/, "") : s; };
  const byName = (x, y) => nameOf(x).localeCompare(nameOf(y), locale);
  const [q, setQ] = useState("");
  const searchOpen = useStore(S.searchOpen);
  const fieldRef = useRef(null);
  useEffect(() => { if (searchOpen) fieldRef.current?.focus?.(); else setQ(""); }, [searchOpen]);
  const [seen, setSeen] = useState(null);
  const [fresh, setFresh] = useState(null);
  useEffect(() => {
    Promise.all([SEEN.all(), CATALOG.all()]).then(([s, c]) => {
      setSeen(Object.fromEntries(s.map((x) => [x.id, x.v])));
      const ids = apps.map((a) => a.id);
      const rec = c.find((x) => x.id === "known");
      const known = rec ? new Set(rec.ids || []) : null;
      setFresh(known ? new Set(ids.filter((i) => !known.has(i))) : new Set());
      CATALOG.put("known", { ids }).catch(() => {});
    }).catch(() => { setSeen({}); setFresh(new Set()); });
  }, []);
  const badgeOf = (a) => (!seen || !fresh ? null : fresh.has(a.id) && !(a.id in seen) ? "new" : (a.id in seen) && seen[a.id] !== a.version ? "upd" : null);
  const installed = (a) => !!seen && a.id in seen;
  const remember = (a) => { SEEN.put(a.id, { v: a.version }).catch(() => {}); setSeen((s) => ({ ...(s || {}), [a.id]: a.version })); };
  const launch = (a) => { remember(a); try { window.open(appUrl(a.id), "_blank", "noopener"); } catch { location.assign(appUrl(a.id)); } };
  const tag = (b) => b === "new" ? html`<span class=${`${LABEL} inline-flex items-center gap-1 shrink-0`}>${DOT()}${T(t, "newBadge")}</span>` : b === "upd" ? html`<span class=${`${LABEL} inline-flex items-center gap-1 shrink-0`}>${DOT(true)}${T(t, "updBadge")}</span>` : null;
  const tap = (a) => launch(a);
  const pill = (a, extra = "") => html`<button class=${`btn btn-xs rounded-full px-3.5 min-h-7 h-7 bg-base-300 border-0 text-base-content font-bold shrink-0 ms-press ${extra}`} aria-label=${`${T(t, "openApp")} — ${nameOf(a)}`} onClick=${(e) => { e.stopPropagation(); launch(a); }}>${installed(a) ? Icon("lucide:external-link", "text-sm") : T(t, "openApp")}</button>`;

  const markOf = (a) => { const b = badgeOf(a); return b === "upd" ? MARK.updated : b === "new" || isNewborn(a) ? MARK.new : MARK.none; };
  const sloganOf = (a) => t?.["slogan_" + a.id] || "";
  const lineOf = (a) => sloganOf(a) || subtitleOf(a);
  const [bloom, setBloom] = useState(null);
  const [shotIx, setShotIx] = useState(0);
  const shotAt = (a, i, light) => (a.shots?.length ? `./assets/shot-${a.id}--${a.shots[Math.min(i, a.shots.length - 1)]}${light ? "--light" : ""}.webp` : "");
  const shot = (a, light) => shotAt(a, bloom && bloom.app.id === a.id ? shotIx : 0, light);
  const items = ORDER.map((a) => ({ id: a.id, name: nameOf(a), icon: a.icon ? `../${a.id}/icon.svg` : null, window: a.shots?.length ? { dark: shot(a), light: shot(a, true) } : null, color: a.fg || "accent", mark: markOf(a), form: formOf(a), group: GROUP_OF.get(a.id) || 0 }));
  const groups = GROUPS.map((g) => ({ id: g.id, name: T(t, g.key), color: g.color }));
  const Cell = (a, i, mode) => { const mark = markOf(a), word = mark === MARK.updated ? T(t, "updBadge") : mark === MARK.new ? T(t, "newBadge") : "";
    const label = word ? `${nameOf(a)} · ${word}` : nameOf(a);
    if (mode === "gl") return html`<button key=${a.id} data-app=${a.id} data-cell="comb" data-seen=${installed(a) ? "1" : null} data-mark=${mark || null} style=${`--i:${Math.min(i, 14)}`} aria-label=${label} onClick=${() => tap(a)}>${nameOf(a)}</button>`;
    return html`<button key=${a.id} data-app=${a.id} data-cell="dom" data-seen=${installed(a) ? "1" : null} data-mark=${mark || null} aria-label=${label} onClick=${() => tap(a)} style=${`--i:${Math.min(i, 14)}`} class="st-cell ms-press">
      <span class="st-cell-form">${Tile(a, "")}${mark ? html`<span aria-hidden="true" class="st-cell-dot" style=${`background:var(${mark === MARK.updated ? "--app-accent-2" : "--app-accent"})`}></span>` : null}</span>
      <span class="st-cell-name">${nameOf(a)}</span>
    </button>`; };
  const cellOf = (it, i, mode) => { const a = byId.get(it.id); return a ? Cell(a, i, mode) : null; };
  const [focus, setFocus] = useState(LEAD);
  const headRef = useRef(null);
  const [headH, setHeadH] = useState(72);
  useEffect(() => {
    const el = headRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHeadH(el.offsetHeight || 0)); ro.observe(el); setHeadH(el.offsetHeight || 0);
    return () => ro.disconnect();
  }, [searchOpen]);

  const Row = (a) => { const b = badgeOf(a); return html`<div data-app=${a.id} key=${a.id} class="flex items-center gap-3 py-2">
    <button aria-label=${nameOf(a)} onClick=${() => tap(a)} class="flex items-center gap-3 flex-1 min-w-0 text-left ms-press">
      ${Tile(a, "w-[3.25rem] h-[3.25rem]")}
      <div class="min-w-0 flex-1 flex flex-col gap-0.5">
        <span class="font-semibold text-[0.9rem] leading-tight truncate flex items-center gap-2">${nameOf(a)}${b ? tag(b) : null}${PICKS.includes(a) ? Icon("lucide:sparkles", "text-[0.8em] shrink-0", "color:var(--app-accent)") : null}</span>
        <span class="text-[0.78rem] text-muted leading-snug truncate">${subtitleOf(a)} · ${T(t, catKey(a.category))}</span>
      </div>
    </button>
    ${pill(a)}
  </div>`; };
  const rows = (items) => html`<div class="flex flex-col [&>div+div]:border-t [&>div+div]:border-base-300/40">${items.map(Row)}</div>`;
  const noResults = html`<div class="flex flex-col items-center text-muted py-16 gap-2 text-center px-6">${Icon("lucide:search-x", "text-4xl")}<span>${T(t, "noResults")}</span></div>`;
  const dateLine = new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const query = q.trim().toLowerCase();
  const found = query ? apps.filter((a) => (nameOf(a) + " " + taglineOf(a)).toLowerCase().includes(query)).sort(byName) : null;
  const onType = (e) => { setQ(e.target.value); if (e.target.value && !S.searchOpen.get()) S.searchOpen.set(true); };
  const headRow = searchOpen
    ? html`<div data-search-open class="flex items-center gap-2 min-h-[var(--ms-ctl)] px-0.5">
        ${Icon("lucide:search", "text-lg text-muted shrink-0")}
        <textarea id="store-filter" ref=${fieldRef} rows="1" data-line enterkeyhint="search" value=${q} onInput=${onType} placeholder=${T(t, "search")} aria-label=${T(t, "search")} autocomplete="off"
          class="grow min-w-0 bg-transparent text-base leading-6 py-1.5 border-0 px-0 outline-none appearance-none focus:outline-none focus:ring-0 shadow-none placeholder:text-muted"></textarea>
        <span id="store-status" class=${`${LABEL} tabular-nums shrink-0`}>${found ? found.length : apps.length}</span>
        <button id="search-close" class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "close")} onClick=${() => S.searchOpen.set(false)}>${Icon("lucide:x", "text-xl")}</button>
      </div>`
    : html`<div class="flex items-end justify-between gap-3 px-0.5">
        <div class="flex flex-col gap-0.5 min-w-0">
          <div class=${`${LABEL} text-muted`}>${dateLine}</div>
          <h2 class="text-[2rem] font-bold leading-none tracking-tight">${T(t, "today")}</h2>
        </div>
        <textarea id="store-filter" rows="1" data-line enterkeyhint="search" class="input hidden" tabindex="-1" aria-hidden="true" value=${q} onInput=${onType}></textarea>
        <button id="search-btn" class="btn btn-ghost btn-sm btn-circle shrink-0 mb-0.5" aria-label=${T(t, "search")} onClick=${() => S.searchOpen.set(true)}>${Icon("lucide:search", "text-xl")}</button>
      </div>`;

  if (found) {
    return html`<div class="flex flex-col gap-4" data-store-mode="search" data-store-search=${searchOpen ? "open" : "folded"} data-store-found=${found.length}>${headRow}
      <div class="ms-stagger flex flex-col" key=${query}>${found.length ? rows(found) : noResults}</div>
      <${Forms} />
    </div>`;
  }

  const open = bloom ? bloom.app : null;
  const openGroup = open ? GROUPS[GROUP_OF.get(open.id) || 0] : null;
  const CAPTION_H = 180;
  const caption = open ? html`<div data-open-caption data-app=${open.id} class="ms-stage z-10 pointer-events-none flex flex-col justify-end items-center px-6 pb-3">
    <div class="w-full max-w-[22rem] flex flex-col items-center justify-end text-center gap-1.5" style=${`height:${CAPTION_H}px`}>
      ${open.shots?.length > 1 ? html`<div data-shots class="flex gap-2 pointer-events-auto">${open.shots.map((_, i) => html`<button key=${i} aria-label=${open.screens?.[locale]?.[i] || String(i + 1)} onClick=${() => setShotIx(i)}
        class=${`w-2 h-2 rounded-full ms-press ${i === shotIx ? "" : "opacity-35"}`} style="background:var(--app-accent)"></button>`)}</div>` : null}
      <div class=${`${LABEL} flex items-center gap-1.5`}>${isNewborn(open) ? DOT() : null}<span>${openGroup ? T(t, openGroup.key) : ""}${openGroup && openGroup.id !== open.category ? ` · ${T(t, catKey(open.category))}` : ""}</span></div>
      <h3 class="font-bold text-[1.5rem] leading-tight tracking-tight">${nameOf(open)}</h3>
      ${sloganOf(open) ? html`<p data-slogan class="font-bold tracking-tight text-[1.05rem] leading-snug">${sloganOf(open)}</p>` : null}
      <p class="text-[0.85rem] leading-snug text-muted line-clamp-2">${taglineOf(open)}</p>
      <button data-card-open class="btn btn-primary rounded-full px-8 min-h-10 text-base font-bold ms-press pointer-events-auto mt-0.5" onClick=${() => launch(open)}>${T(t, "openApp")}</button>
    </div>
  </div>` : null;

  return html`<div class="flex flex-col gap-4" data-store-mode="today" data-store-search=${searchOpen ? "open" : "folded"} data-store-used=${USED.length} data-store-lead=${LEAD ? LEAD.id : null} data-store-focus=${focus ? focus.id : null}>
    <div ref=${headRef} class="relative z-10 pointer-events-none [&_button]:pointer-events-auto [&_textarea]:pointer-events-auto">${headRow}</div>
    <${Comb} items=${items} groups=${groups} cell=${cellOf} top=${headH + 32} onOpen=${(it) => { const a = byId.get(it.id); if (a) tap(a); }} onFocus=${(it) => setFocus(byId.get(it.id) || null)}
      onBloom=${(it, at) => { const a = it ? byId.get(it.id) : null; if (a) { setShotIx(0); setBloom({ app: a, at }); } else setBloom(null); }} />
    ${caption}
    <${Forms} />
  </div>`;
}
