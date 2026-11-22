import { isBook } from "/_rt/acts.js";
import { gate } from "/_rt/gate.js";
import { Effect } from "/_rt/fx.js";
import { pipe, map, filter, entries, fromEntries, sortBy, isTruthy, unique } from "/_rt/remeda.js";
import { CURATED, SHELVES } from "./curated.js";
import { CONFIG } from "./config.js";

const WP = CONFIG.wikipedia;
const WD = CONFIG.wikidata;
export const WIKI_HEADERS = { "Api-User-Agent": "microspec-arc/1.0 (https://github.com/damanoreshkan-beep/microspec)" };

const tried = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e });
const abortAfter = (ms) => Effect.acquireRelease(
  Effect.sync(() => { const ctrl = new AbortController(); return { ctrl, timer: setTimeout(() => ctrl.abort(), ms) }; }),
  ({ timer }) => Effect.sync(() => clearTimeout(timer)),
);
const jget = (url, timeout = CONFIG.timeoutMs) => Effect.scoped(abortAfter(timeout).pipe(
  Effect.flatMap(({ ctrl }) => tried(async () => {
    const r = await fetch(url, { headers: WIKI_HEADERS, signal: ctrl.signal });
    if (!r.ok) throw new Error("status " + r.status);
    return await r.json();
  })),
));
const labelsById = (entities) => pipe(entities || {}, entries(), map(([id, e]) => [id, e.labels?.en?.value || e.labels?.uk?.value || ""]), fromEntries());
const claimIds = (cl, prop, key) => pipe(cl[prop] || [], map((c) => c.mainsnak?.datavalue?.value?.[key]), filter(isTruthy));
const bookMeta = (cl) => {
  const time = claimIds(cl, "P577", "time")[0];
  return { p31: claimIds(cl, "P31", "id"), hasAuthor: !!cl.P50, hasDate: !!cl.P577, author: claimIds(cl, "P50", "id")[0], year: time ? String(time).slice(1, 5) : null };
};
const searchPages = (q) => jget(`${WP}?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}`
  + `&gsrlimit=12&prop=pageprops|pageimages&ppprop=wikibase_item&piprop=thumbnail&pithumbsize=320`
  + `&format=json&formatversion=2&origin=*`).pipe(Effect.map((search) => pipe(search.query?.pages || [], sortBy((p) => p.index || 0))));
const entityMeta = (qids) => jget(`${WD}?action=wbgetentities&ids=${qids.join("|")}&props=claims|labels`
  + `&languages=en|uk&format=json&formatversion=2&origin=*`).pipe(Effect.map((ent) => new Map(pipe(ent.entities || {}, entries(), map(([id, e]) => [id, bookMeta(e.claims || {})])))));
const authorNames = (ids) => !ids.length ? Effect.succeed({}) : jget(`${WD}?action=wbgetentities&ids=${ids.join("|")}&props=labels`
  + `&languages=en|uk&format=json&formatversion=2&origin=*`).pipe(Effect.map((a) => labelsById(a.entities)), Effect.catchCause(() => Effect.succeed({})));
const bookItems = (pages, typed, names) => pipe(pages,
  map((p) => ({ p, qid: p.pageprops?.wikibase_item })),
  map(({ p, qid }) => ({ p, qid, meta: qid && typed.get(qid) })),
  filter(({ meta }) => !!meta && isBook(meta)),
  map(({ p, qid, meta }) => ({
    id: String(p.pageid),
    pageid: p.pageid,
    qid,
    title: p.title,
    author: (meta.author && names[meta.author]) || "",
    year: meta.year || "",
    byline: [(meta.author && names[meta.author]) || "", meta.year || ""].filter(Boolean).join(" · "),
    cover: coverFor(p.title, p.thumbnail?.source),
    hasCover: !!p.thumbnail?.source,
    url: `https://en.wikipedia.org/?curid=${p.pageid}`,
  })),
);

export const spine = (title) => {
  const ch = (String(title || "").trim()[0] || "?").toUpperCase().replace(/[<>&]/g, "?");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">`
    + `<style>:root{--face:#0A0A0D;--rim:rgba(255,232,196,.10);--top:rgba(0,0,0,.9);--pool:rgba(242,184,75,.16);--glow:.7}`
    + `@media(prefers-color-scheme:light){:root{--face:#ECE9E1;--rim:rgba(20,18,16,.10);--top:rgba(40,32,20,.16);--pool:rgba(242,184,75,.12);--glow:.25}}</style>`
    + `<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--top)"/><stop offset="1" style="stop-color:var(--top)" stop-opacity="0"/></linearGradient>`
    + `<radialGradient id="p" cx=".5" cy=".62" r=".55"><stop offset="0" style="stop-color:var(--pool)"/><stop offset="1" style="stop-color:var(--pool)" stop-opacity="0"/></radialGradient>`
    + `<filter id="g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter></defs>`
    + `<rect width="300" height="450" style="fill:var(--face)"/><rect width="300" height="450" fill="url(#p)"/>`
    + `<rect width="300" height="22" fill="url(#t)"/><rect x=".5" y=".5" width="299" height="449" fill="none" style="stroke:var(--rim)"/>`
    + `<g font-family="system-ui,sans-serif" font-size="84" font-weight="700" text-anchor="middle" fill="#F2B84B">`
    + `<text x="50%" y="52%" dy=".35em" filter="url(#g)" style="opacity:var(--glow)">${ch}</text><text x="50%" y="52%" dy=".35em">${ch}</text></g></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
};

const coverFor = (title, thumb) => thumb || spine(title);

export async function load(filters) {
  const q = (filters?.q || "").trim();
  if (gate) return loadShelves();
  if (!q) return loadShelves();
  return Effect.runPromise(Effect.gen(function* () {
    const pages = yield* searchPages(q);
    const qids = pipe(pages, map((p) => p.pageprops?.wikibase_item), filter(isTruthy));
    if (!qids.length) return { items: [], meta: { q } };
    const typed = yield* entityMeta(qids);
    const names = yield* authorNames(pipe([...typed.values()], map((m) => m.author), filter(isTruthy), unique()));
    const items = bookItems(pages, typed, names);
    return { items, meta: { q, found: items.length } };
  }));
}

const shelfThumbs = (flat) => gate ? Effect.succeed({}) : jget(`${WP}?action=query&pageids=${flat.map((b) => b.pageid).join("|")}`
  + `&prop=pageimages&piprop=thumbnail&pithumbsize=320&format=json&formatversion=2&origin=*`, CONFIG.shelvesTimeoutMs).pipe(
  Effect.map((r) => pipe(r.query?.pages || [], filter((p) => !!p.thumbnail), map((p) => [p.pageid, p.thumbnail.source]), fromEntries())),
  Effect.catchCause(() => Effect.succeed({})),
);

async function loadShelves() {
  const flat = SHELVES.flatMap((g) => CURATED[g].map((b) => ({ ...b, group: g })));
  const thumbs = await Effect.runPromise(shelfThumbs(flat));
  const items = flat.map((b) => ({
    id: b.id,
    pageid: b.pageid,
    title: b.title,
    byline: b.uk,
    bylineEn: b.en,
    cover: thumbs[b.pageid] || spine(b.title),
    hasCover: !!thumbs[b.pageid],
    url: `https://en.wikipedia.org/?curid=${b.pageid}`,
    ...Object.fromEntries(SHELVES.map((g) => [`g_${g}`, g === b.group])),
  }));
  return { items, meta: { found: items.length } };
}

import { findPlotSection, cleanPlotText, foldPlot } from "/_rt/acts.js";

const plotSection = (title) => jget(`${WP}?action=parse&page=${encodeURIComponent(title)}&prop=sections`
  + `&format=json&formatversion=2&origin=*`).pipe(Effect.map((secs) => findPlotSection(secs.parse?.sections)));
const sectionHtml = (title, hit) => jget(`${WP}?action=parse&page=${encodeURIComponent(title)}&section=${hit.index}`
  + `&prop=text&format=json&formatversion=2&origin=*`).pipe(Effect.map((body) => body.parse?.text || ""));
const plotOf = (html, hit) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("sup, style, table, .mw-editsection, .reference, .hatnote").forEach((n) => n.remove());
  const text = cleanPlotText(doc.body.textContent, hit.line);
  return { plot: foldPlot(text), heading: hit.line, chars: text.length };
};

export async function loadPlot(title) {
  return Effect.runPromise(plotSection(title).pipe(
    Effect.flatMap((hit) => !hit ? Effect.succeed({ plot: "", heading: null }) : sectionHtml(title, hit).pipe(Effect.map((html) => plotOf(html, hit)))),
  ));
}
