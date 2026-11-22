import { VPS_PROXY, pool } from "/_rt/feed.js";
import { sealedFrameUrl } from "/_rt/sealedfetch.js";
import { gate } from "/_rt/gate.js";
import { dedupeVideos, isBlackSample, isFlatSample, hasPoster } from "/_rt/vfilter.js";
import { sourceTitle, humanText } from "/_rt/sitelabel.js";
import { reject } from "lodash-es";
import { DEFAULT_SRC, MOCK, MOCK_DEEP, GATE_TITLES, GATE_SEARCH } from "./presets.js";
import { framed } from "./util.js";
import { Effect } from "/_rt/fx.js";
import { pipe, filter, map, uniqueBy, zip, flatMap } from "/_rt/remeda.js";
import { CONFIG } from "./config.js";
import { $src, subscribe, sessionFor, keepJar, unseen, $items, $next, $loading, $err, $active, $ephemeral, $srcTitle, $srcHint, setSrcTitle, $frames, $restoreTo, $owner, $feedChannel, $full, rememberSearch } from "./store.js";

const snapshot = (label) => ({ label, src: $src.get(), title: $srcTitle.get(), hint: $srcHint.get(), items: $items.get(), next: $next.get(), active: $active.get(), eph: $ephemeral.get(), owner: $owner.get(), err: $err.get() });
function restoreTop() {
  const fs = $frames.get(); if (!fs.length) return;
  const f = fs[fs.length - 1];
  $frames.set(fs.slice(0, -1));
  gen++;
  loadingMore = false;
  $src.set(f.src); $srcTitle.set(f.title); $srcHint.set(f.hint); $items.set(f.items); $next.set(f.next); $ephemeral.set(f.eph);
  $owner.set(f.owner); $loading.set(false); $err.set(f.err);
  $active.set(f.active); $restoreTo.set(f.active);
  if (!f.items.length && !f.err && !gate) loadSource(f.src, false, f.hint);
}
let bound = false;
export function bindNav(S) {
  if (bound) return; bound = true;
  S.stack.listen((v) => { while ($frames.get().length > (v?.length || 0)) restoreTop(); });
}
export function pushFrame(S, label) { $frames.set([...$frames.get(), snapshot(label)]); S.stack.set([...S.stack.get(), label]); }
export function popFrame(S) { const st = S.stack.get(); if (st.length) S.stack.set(st.slice(0, -1)); }
export function resetNav(S) { $frames.set([]); if (S.stack.get().length) S.stack.set([]); }

export function diveTarget(item, src) {
  const u = item?.page;
  if (!u || !/^https?:\/\//i.test(u)) return null;
  return u.replace(/#.*$/, "") === String(src).replace(/#.*$/, "") ? null : u;
}
export function openSource(url, hint) { $src.set(url); loadSource(url, false, hint); }
export function diveTo(S, url, hint) {
  if (!url) return;
  pushFrame(S, $srcTitle.get());
  navigator.vibrate?.(10);
  openSource(url, hint);
}

export function openAsSource(S, url, hint, keep = true) {
  if (keep) subscribe({ name: sourceTitle(url), url });
  resetNav(S);
  $owner.set("reel");
  openSource(url, hint);
  S.tab.set("reel");
  S.screen.set(null);
}

const tried = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e });
const attempt = (fx) => Effect.try({ try: fx, catch: (e) => e });
const blankPosters = new Set();
const checkedPosters = new Set();
function posterIsBlank(poster, page) {
  const isData = poster.startsWith("data:");
  if (gate && !isData) return Promise.resolve(false);
  if (typeof document === "undefined" || typeof Image === "undefined") return Promise.resolve(false);
  const side = CONFIG.poster.side;
  const sample = (src) => Effect.callback((resume) => {
    const img = new Image(); if (!isData) img.crossOrigin = "anonymous";
    img.onload = () => { try {
      const c = document.createElement("canvas"); c.width = side; c.height = side;
      const cx = c.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, side, side);
      const px = cx.getImageData(0, 0, side, side).data;
      resume(Effect.succeed(isBlackSample(px) || isFlatSample(px)));
    } catch { resume(Effect.succeed(false)); } };
    img.onerror = () => resume(Effect.fail(src));
    img.src = src;
  });
  const at = (src) => sample(src).pipe(
    Effect.catch(() => isData || src !== poster ? Effect.succeed(false) : tried(() => framed(poster, page)).pipe(
      Effect.flatMap(at),
      Effect.catch(() => Effect.succeed(false)),
    )),
  );
  return Effect.runPromise(at(poster).pipe(
    Effect.timeoutOrElse({ duration: CONFIG.poster.timeoutMs, orElse: () => Effect.succeed(false) }),
  ));
}
export async function checkBlankPosters() {
  const todo = pipe($items.get(),
    filter((it) => it.poster && !checkedPosters.has(it.poster)),
    uniqueBy((it) => it.poster),
    map((it) => [it.poster, it.page || null]),
  );
  todo.forEach(([p]) => checkedPosters.add(p));
  if (!todo.length) return;
  const hits = new Set();
  await pool(todo, CONFIG.poster.pool, async ([p, pg]) => { if (await posterIsBlank(p, pg)) hits.add(p); });
  if (hits.size) { hits.forEach((p) => blankPosters.add(p)); $items.set(reject($items.get(), (i) => i.poster && hits.has(i.poster))); }
}
function clean(arr, { requirePoster = false } = {}) {
  let out = reject(unseen(arr), (i) => i.poster && blankPosters.has(i.poster));
  out = out.map((i) => (i.title ? { ...i, title: humanText(i.title) } : i));
  if (requirePoster) out = out.filter(hasPoster);
  return dedupeVideos(out);
}

let loadingMore = false, gen = 0;
export async function loadSource(url, append = false, hint = "") {
  if (append) { if (loadingMore || !url) return; loadingMore = true; }
  else {
    $loading.set(true); $err.set(false); $items.set([]); $next.set(null); $active.set(0); $restoreTo.set(0);
    $srcHint.set(hint || ""); setSrcTitle(url, { hint });
  }
  const g = append ? gen : ++gen;
  if (gate) {
    rememberSearch(url, GATE_SEARCH);
    if (!append) {
      $items.set(clean(url === DEFAULT_SRC ? MOCK : MOCK_DEEP)); $ephemeral.set(false); $loading.set(false);
      setSrcTitle(url, { pageTitle: GATE_TITLES[url] || "", hint });
    }
    loadingMore = false; return;
  }
  try {
    const cookie = sessionFor(url);
    const r = await fetch(`${VPS_PROXY}/videos`, { method: "POST", headers: { "content-type": "application/json", "x-ms-egress": "reel" }, body: JSON.stringify({ url, cookie }) });
    const d = await r.json();
    keepJar(url, cookie, d.jar);
    if (g !== gen) return;
    const eph = append ? $ephemeral.get() : !!d.ephemeral;
    const got = clean(Array.isArray(d.items) ? d.items : [], { requirePoster: eph });
    $items.set(append ? dedupeVideos([...$items.get(), ...got]) : got);
    $next.set(d.next || null);
    if (!append) $feedChannel.set(d.channel || null);
    rememberSearch(url, d.search);
    if (!append) setSrcTitle(url, { pageTitle: d.title || "", hint });
    if (!append) $ephemeral.set(eph);
  } catch { if (g === gen && !append) $err.set(true); }
  finally { if (g === gen) $loading.set(false); if (append) loadingMore = false; }
}

export async function openFull(S, item) {
  const page = item?.page || item?.orig || item?.video;
  if (!page) return;
  const title = item.title || "";
  $full.set({ page, title, url: null, err: false });
  S.screen.set("full");
  const settle = (patch) => { const cur = $full.get(); if (cur && cur.page === page) $full.set({ ...cur, ...patch }); };
  if (gate) return settle({ url: item.video });
  const info = attempt(() => sessionFor(page)).pipe(
    Effect.flatMap((cookie) => tried(async () => (await fetch(`${VPS_PROXY}${CONFIG.stream}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: page, cookie, ...(item.confirmAge ? { confirmAge: true } : {}) }) })).json()).pipe(
      Effect.tap((d) => attempt(() => keepJar(page, cookie, d.jar))),
    )),
  );
  const ladder = (d) => {
    const vars = (Array.isArray(d.variants) ? d.variants : []).filter((v) => v?.url && v?.bandwidth);
    const canLadder = typeof MediaSource !== "undefined" || typeof window.ManagedMediaSource !== "undefined";
    if (!(canLadder && vars.length > 1)) return Effect.succeed(false);
    return Effect.forEach(vars, (v) => tried(() => framed(v.url, page)), { concurrency: "unbounded" }).pipe(
      Effect.map((sealed) => ["#EXTM3U", ...pipe(zip(vars, sealed), filter(([, s]) => s), flatMap(([v, s]) => [
        `#EXT-X-STREAM-INF:${[`BANDWIDTH=${Math.round(v.bandwidth)}`, v.resolution ? `RESOLUTION=${v.resolution}` : null, v.codecs ? `CODECS="${v.codecs}"` : null].filter(Boolean).join(",")}`, s,
      ]))]),
      Effect.flatMap((lines) => lines.length <= 2 ? Effect.succeed(false) : attempt(() => {
        const master = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: CONFIG.hlsMime }));
        settle({ url: master, type: "hls", blob: master, title: humanText(d.title) || title });
        return true;
      })),
    );
  };
  const progressive = (d, list) => {
    const pick = list.find((s) => s.format === "hls") || list.find((s) => s.height && s.height <= CONFIG.maxHeight) || list[0];
    if (!pick) return attempt(() => settle({ err: true }));
    return tried(() => sealedFrameUrl(pick.url, page)).pipe(
      Effect.flatMap((url) => attempt(() => settle({ url, type: pick.format === "hls" ? "hls" : "progressive", title: humanText(d.title) || title }))),
    );
  };
  await Effect.runPromise(info.pipe(
    Effect.flatMap((d) => d.ageGate ? attempt(() => settle({ err: true, age: true }))
      : attempt(() => (Array.isArray(d.sources) ? d.sources : []).filter((s) => !s.remote)).pipe(
        Effect.flatMap((list) => ladder(d).pipe(Effect.flatMap((done) => done ? Effect.void : progressive(d, list)))),
      )),
    Effect.catch(() => Effect.sync(() => settle({ err: true }))),
  ));
}
