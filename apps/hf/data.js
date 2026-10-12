import { viaProxy, fetchJson } from "/_rt/feed.js";

const compact = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(n);
};

export async function load(filters = {}) {
  const spaces = filters.type === "spaces";
  const kind = spaces ? "spaces" : "models";
  const sort = (!spaces && filters.sort === "downloads") ? "downloads" : "likes";
  const q = (filters.q || "").trim();
  const cat = (filters.category || "").trim();
  const params = new URLSearchParams({ sort, direction: "-1", limit: "40" });
  if (q) params.set("search", q);
  if (cat) params.set("filter", cat);
  // `gated` is not in the list's default fields, and `expand` replaces the defaults — so every field read below is named
  if (!spaces) for (const f of ["downloads", "likes", "pipeline_tag", "library_name", "createdAt", "gated"]) params.append("expand[]", f);
  const data = await fetchJson(`https://huggingface.co/api/${kind}?${params}`, { array: true });
  const items = (Array.isArray(data) ? data : []).map((m) => {
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
      url: spaces ? `https://huggingface.co/spaces/${id}` : `https://huggingface.co/${id}`,
      // what spec `enrich` reads the card's prose from: a gated model's README answers 401 to a browser without a
      // grant (meta-llama, FLUX — 24 failed loads a list), so a gated model is not asked
      readme: m.gated ? "" : (spaces ? `https://huggingface.co/spaces/${id}` : `https://huggingface.co/${id}`),
    };
  }).filter((it) => it.id);
  return { items, meta: {} };
}
