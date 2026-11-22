import { VPS_PROXY } from "/_rt/feed.js";
import { Effect } from "/_rt/fx.js";
import { CONFIG } from "./config.js";
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const proxied = (u) => (isLocal ? "/feed" : VPS_PROXY) + "?url=" + encodeURIComponent(u);

async function fetchFeed(url, ok) {
  const r = await fetch(proxied(url));
  const t = await r.text();
  if (!ok(t)) throw new Error("bad feed");
  return t;
}

const okFeed = (x) => x.includes("<item") || x.includes("<option");
const PAGE = CONFIG.page;
const SEARCH = CONFIG.search;
const feedBase = (c) => CONFIG.feeds + encodeURIComponent(c);
const TECH = CONFIG.tech;
const settled = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e }).pipe(
  Effect.map((value) => ({ ok: true, value })),
  Effect.catch(() => Effect.succeed({ ok: false })),
);
const feed = (url) => settled(() => fetchFeed(url, okFeed));

function parseTitle(t) {
  const i = t.indexOf(" в ");
  let position = t.trim(), company = "", locs = [];
  if (i >= 0) { position = t.slice(0, i).trim(); const r = t.slice(i + 3).split(",").map((s) => s.trim()).filter(Boolean); company = r.shift() || ""; locs = r; }
  const remote = /віддален|remote/i.test(t), abroad = /за кордоном/i.test(t);
  const salary = (t.match(/\$\s?[\d\s.–-]*\d|\d[\d\s]*грн/) || [])[0] || "";
  const city = locs.find((l) => !/\$|грн|віддален|remote|за кордоном/i.test(l)) || "";
  return { position, company, city, remote, abroad, salary };
}
function parse(xml, bron) {
  const d = new DOMParser().parseFromString(xml, "text/xml");
  return [...d.querySelectorAll("item")].map((it) => {
    const g = (s) => it.querySelector(s)?.textContent?.trim() || "";
    const tmp = document.createElement("div"); tmp.innerHTML = g("description");
    for (const el of tmp.querySelectorAll("p,div,br,li,tr,h1,h2,h3,h4,h5,h6,section,article,blockquote")) {
      el.parentNode?.insertBefore(document.createTextNode(el.tagName === "LI" ? "\n• " : "\n"), el);
    }
    const desc = tmp.textContent.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").replace(/^•\n/gm, "• ");   
    const m = parseTitle(g("title"));
    const tech = TECH.filter((k) => new RegExp("\\b" + k.replace("+", "\\+"), "i").test(m.position + " " + desc)).slice(0, 3);
    return { ...m, link: g("link"), bron, tech, desc, ts: new Date(g("pubDate")).getTime() };
  });
}
let _cats = null;
async function cats() {
  if (_cats) return _cats;
  try { const doc = new DOMParser().parseFromString(await fetchFeed(PAGE, okFeed), "text/html"); _cats = [...doc.querySelectorAll('select[name="category"] option')].map((o) => ({ v: o.value, l: o.textContent.trim() })); }
  catch { _cats = []; }
  return _cats;
}
export async function load(filters) {
  const cat = filters.category || CONFIG.category;
  const ex = filters.exp ? "&exp=" + filters.exp : "";
  return Effect.runPromise(Effect.all([feed(feedBase(cat) + SEARCH + ex), feed(feedBase(cat) + ex), settled(cats)], { concurrency: "unbounded" }).pipe(
    Effect.flatMap(([b, a, c]) => {
      const bronL = b.ok ? parse(b.value, true) : [];
      const all = a.ok ? parse(a.value, false) : [];
      if (!b.ok && !a.ok) return Effect.fail(new Error("feeds"));
      const seen = new Set(bronL.map((j) => j.link));
      const rest = all.filter((j) => !seen.has(j.link));
      return Effect.succeed({ items: [...bronL, ...rest], meta: { bron: bronL.length, rest: rest.length, categories: c.ok ? c.value : [] } });
    }),
  ));
}
