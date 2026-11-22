import { viaProxy, fetchJson } from "/_rt/feed.js";
import { Effect } from "/_rt/fx.js";
import { pipe, map, filter } from "/_rt/remeda.js";
import { CONFIG } from "./config.js";

const tried = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e });
const direct = (url) => tried(async () => {
  const r = await fetch(url, { signal: AbortSignal.timeout(CONFIG.timeoutMs) });
  if (!r.ok) throw new Error(`status ${r.status}`);
  const data = await r.json();
  return { data, next: (r.headers.get("link") || "").match(/<([^>]+)>;\s*rel="next"/)?.[1] || null };
});
const proxied = (url) => tried(() => fetchJson(url, { array: true })).pipe(Effect.map((data) => ({ data, next: null })));
const listing = (url) => direct(url).pipe(Effect.catch(() => proxied(url)));

const compact = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(n);
};

export async function load(filters = {}) {
  const spaces = filters.type === "spaces";
  const kind = spaces ? "spaces" : "models";
  const SORT = CONFIG.sorts;
  const sort = (!spaces && filters.sort === "downloads") ? "downloads" : (SORT[filters.sort] || "likes");
  const q = (filters.q || "").trim();
  const cat = (filters.category || "").trim();
  const params = new URLSearchParams({ sort, direction: "-1", limit: CONFIG.limit });
  if (q) params.set("search", q);
  if (cat) params.set("filter", cat);
  if (!spaces) for (const f of CONFIG.expand) params.append("expand[]", f);
  const url = filters.cursor || `${CONFIG.api}${kind}?${params}`;
  const { data, next } = await Effect.runPromise(listing(url));
  const items = pipe(Array.isArray(data) ? data : [], map((m) => {
    const id = m.id || m.modelId || "";
    const [org, ...rest] = id.split("/");
    const name = rest.length ? rest.join("/") : id;
    return {
      id,
      name,
      author: rest.length ? org : "",
      task: spaces ? (m.sdk || "space") : (m.pipeline_tag || ""),
      lib: spaces ? "" : (m.library_name || ""),
      downloads: spaces ? "" : compact(m.downloads),
      likes: compact(m.likes),
      createdAt: m.createdAt ? Date.parse(m.createdAt) : 0,
      url: spaces ? `${CONFIG.spaces}${id}` : `${CONFIG.site}${id}`,
      readme: m.gated ? "" : (spaces ? `${CONFIG.spaces}${id}` : `${CONFIG.site}${id}`),
    };
  }), filter((it) => !!it.id));
  return { items, meta: {}, next };
}
