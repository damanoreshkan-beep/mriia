import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { Transport, Island } from "/_rt/ui.js";
import { advance } from "/_rt/player.js";
import { shapeOf, pathOf, rimAt } from "/_rt/shape.js";
import { listen, spectrumOfBlob, SPECTRUM_HZ, SPECTRUM_BANDS } from "/_rt/breath.js";
import { Comb, MARK, PARAM, COMB_MAX } from "/_rt/comb.js";
import { holdAudio } from "/_rt/mediasession.js";
import { sealedUrl } from "/_rt/sealedfetch.js";
import { uploadResumable, taskCall } from "/_rt/task.js";
import { session, restore } from "/_rt/auth.js";
import { $likes, $lErr, $lBusy, readLikes, connect } from "/_rt/ytlikes.js";
import { songOfFound, FIXTURE_RADIO } from "/_rt/muzak.js";
import { authWall } from "/_rt/authwall.js";
import { takeShared } from "/_rt/share.js";
import { report } from "/_rt/telemetry.js";
import { clock } from "/_rt/muzak.js";
import { isAudio, songLine, usageLine, titleOf, errorKey, listLine, listOfLayer, petals, shuffled, FIXTURE_LISTS, FIXTURE_SONGS, FIXTURE_USAGE } from "/_rt/fonoteka.js";
import { songStore, keeper } from "/_rt/songstore.js";
import { coverBlob } from "/_rt/id3.js";
import { Effect, Semaphore, Cause } from "/_rt/fx.js";
import { pipe, filter, forEach, zip, map, fromEntries } from "/_rt/remeda.js";
import { CONFIG } from "./config.js";

const R = CONFIG.routes;
const tried = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e });
const orNull = (fx) => tried(fx).pipe(Effect.catch(() => Effect.succeed(null)));
const settled = (eff) => eff.pipe(
  Effect.map((value) => ({ status: "fulfilled", value })),
  Effect.catch((reason) => Effect.succeed({ status: "rejected", reason })),
);
const squashed = (handle) => Effect.catchCause((cause) => handle(Cause.squash(cause)));
const postJson = (path, body, init) => fetch(`${VPS_PROXY}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body, ...init });

const Icon = (icon, cls = "") => html`<iconify-icon icon=${icon} class=${cls}></iconify-icon>`;
const $songs = atom(gate ? FIXTURE_SONGS : null);   
const $usage = atom(gate ? FIXTURE_USAGE : null);
const $held = atom(gate ? new Set(FIXTURE_SONGS.slice(0, 2).map((s) => s.id)) : new Set());   
const $uploads = atom([]);                           
const $err = atom("");
const $cur = atom("");
const $playing = atom(false);
const $pos = atom(0), $dur = atom(0);
let audio = null, hold = null, tap = null, loaded = gate, kept = "";
const $repeat = persistentAtom("fonoteka:repeat", "all");
const flipRepeat = () => $repeat.set($repeat.get() === "one" ? "all" : "one");
const shownRepeat = (r) => (r === "one" ? "one" : "off");

const store = gate ? null : songStore();
const keep = gate ? null : keeper({
  store, urlOf: (id) => sealedUrl("/library/get", { id }), onHeld: (h) => $held.set(h),
  onFail: (e, s) => report("keep.fail", { status: e?.status || 0, err: String(e?.message || e).slice(0, 120), size: s.size }),
});
const $covers = atom(gate ? { [FIXTURE_SONGS[0].id]: "/_rt/theme-lum.webp" } : {});   
const coverQueue = Semaphore.makeUnsafe(1);
const coverOf = (s) => Effect.suspend(() => (s.id in $covers.get() ? Effect.void : orNull(() => store.blob(s.id)).pipe(
  Effect.flatMap((blob) => (blob ? orNull(() => coverBlob(blob)) : Effect.succeed(null))),
  Effect.tap((pic) => Effect.sync(() => $covers.set({ ...$covers.get(), [s.id]: pic ? URL.createObjectURL(pic) : "" }))),
)));
function readCovers() {
  if (!store) return;
  const known = $covers.get(), held = $held.get();
  pipe($songs.get() || [],
    filter((s) => held.has(s.id) && !(s.id in known)),
    forEach((s) => { Effect.runFork(Semaphore.withPermit(coverQueue)(coverOf(s))); }));
}
if (!gate) { $songs.listen(readCovers); $held.listen(readCovers); }

function confirmed(list) {
  $songs.set(list);
  keep?.set(list);
  store?.saveShelf({ songs: list, usage: $usage.get() }).catch(() => {});
}

async function load() {
  if (loaded) return;
  loaded = true;
  store?.held().then((h) => $held.set(h)).catch(() => {});
  navigator.storage?.persist?.().catch(() => {});
  readLists();
  await Effect.runPromise(listed.pipe(
    Effect.catchCause(() => Effect.sync(() => { offline(); return "done"; })),
    Effect.flatMap((v) => (v === "refused" ? tried(offline) : Effect.void)),
  ));
}
const listed = tried(() => postJson(R.list, "{}", { signal: AbortSignal.timeout(CONFIG.listTimeoutMs) })).pipe(
  Effect.flatMap((r) => {
    if (r.ok) return tried(() => r.json()).pipe(Effect.map((j) => {
      $usage.set({ count: j.count, bytes: j.bytes, maxFiles: j.maxFiles, maxBytes: j.maxBytes });
      confirmed(j.songs || []);
      return "done";
    }));
    if (r.status === 401) return Effect.sync(() => { $songs.set([]); return "done"; });
    return Effect.sync(() => { report("list.fail", { status: r.status }); return "refused"; });
  }),
);
const shelf = Effect.all([orNull(() => store?.readShelf()), orNull(() => store?.held())]);

const $lists = atom(gate ? FIXTURE_LISTS : []);
const $collage = atom({});
async function readLists() {
  if (gate || !session.get()) return;
  const r = await postJson(R.lists, "{}", { signal: AbortSignal.timeout(CONFIG.listTimeoutMs) }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => null) : null;
  if (j?.lists) $lists.set(j.lists);
}
const listOf = (id) => (String(id).startsWith("p:") ? $lists.get().find((l) => `p:${l.id}` === id) || null : null);
const listSongsOf = (l) => l.songs.map((s) => ytOf({ id: s.yt, title: s.title, artist: s.artist, dur: s.dur, cover: s.cover }));

const bitmaps = new Map();
const bitmapOf = (url) => {
  if (!bitmaps.has(url)) bitmaps.set(url, Effect.runPromise(coverAt(url)).then((b) => (b ? createImageBitmap(b) : null)).catch(() => null));
  return bitmaps.get(url);
};
let beat = 0, beatAt = 0;
async function paintList(l) {
  const covers = [...new Set(l.songs.map((s) => s.cover).filter(Boolean))];
  if (!covers.length || typeof OffscreenCanvas === "undefined") return;
  const n = CONFIG.petals, S = CONFIG.collagePx, c = new OffscreenCanvas(S, S), g = c.getContext("2d");
  const imgs = await Promise.all(petals(covers, n, beat).map(bitmapOf));
  const turn = (p) => (p * 360 / n - 135) * Math.PI / 180;
  imgs.forEach((im, p) => {
    if (!im) return;
    g.save(); g.beginPath(); g.moveTo(S / 2, S / 2); g.arc(S / 2, S / 2, S, turn(p), turn(p + 1)); g.closePath(); g.clip();
    const k = Math.max(S / im.width, S / im.height);
    g.drawImage(im, (S - im.width * k) / 2, (S - im.height * k) / 2, im.width * k, im.height * k);
    g.restore();
  });
  g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 3;
  for (let p = 0; p < n; p++) { g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + S * Math.cos(turn(p)), S / 2 + S * Math.sin(turn(p))); g.stroke(); }
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--app-accent").trim() || "#5BC8FF";
  const ring = new Image();
  ring.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="${pathOf(shapeOf(`p:${l.id}`))}" transform="translate(.1 .1) scale(.8)" fill="none" stroke="${ink}" stroke-width=".014"/></svg>`)}`;
  if (await ring.decode().then(() => true, () => false)) g.drawImage(ring, 0, 0, S, S);
  const blob = await c.convertToBlob({ type: "image/webp", quality: 0.9 }).catch(() => null);
  if (!blob) return;
  const was = $collage.get()[l.id];
  $collage.set({ ...$collage.get(), [l.id]: URL.createObjectURL(blob) });
  if (was) URL.revokeObjectURL(was);
}
const paintLists = () => { if (!gate) for (const l of $lists.get()) paintList(l); };
if (!gate) $lists.listen(paintLists);
function onBeat(level) {
  const now = performance.now();
  if (level < CONFIG.petalBeat || now - beatAt < CONFIG.petalGapMs || !$lists.get().length) return;
  beatAt = now; beat++;
  paintLists();
}

async function offline() {
  const [saved, held] = await Effect.runPromise(shelf);
  if (!saved || !held?.size) { $err.set("errList"); $songs.set([]); return; }
  $usage.set(saved.usage); $held.set(held);
  $songs.set(saved.songs.filter((s) => held.has(s.id)));
}

const markErr = (k) => $uploads.set($uploads.get().map((u) => (u.k === k ? { ...u, state: "err" } : u)));
const progress = (k) => (sent, total) => { const pct = total ? Math.floor(sent * 100 / total) : 0; $uploads.set($uploads.get().map((u) => (u.k === k && u.pct !== pct ? { ...u, pct } : u))); };
const refused = (f, k, e) => Effect.sync(() => {
  if (e.status === 401) authWall.set(authWall.get() + 1);
  const why = (() => { try { return JSON.parse(e.message).error; } catch { return ""; } })();
  report("upload.fail", { status: e.status, why: String(why || "").slice(0, 80), name: String(f.name || "").slice(0, 40), size: f.size, type: f.type });
  const key = errorKey(e.status, why); if (key) $err.set(key);
  markErr(k);
});
const crashed = (f, k) => (e) => Effect.sync(() => { report("upload.throw", { err: String(e?.message || e).slice(0, 120), name: String(f.name || "").slice(0, 40), size: f.size }); $err.set("errUpload"); markErr(k); });
const sent = (f, k) => tried(() => uploadResumable(R.up, { n: f.name }, f, { onProgress: progress(k) })).pipe(Effect.map((id) => ({ id })));
const rowOf = (id) => tried(async () => {
  const r = await postJson(R.uprow, JSON.stringify({ id }));
  if (!r.ok) throw new Error(`uprow ${r.status}`);
  return r.json();
});
const counted = (f, row) => Effect.sync(() => {
  report("upload.ok", { size: f.size, dur: row.dur }, "info");
  const u = $usage.get(); if (u) $usage.set({ ...u, count: u.count + 1, bytes: u.bytes + row.size });
});
const stored = (f, row) => !store ? Effect.void : tried(() => store.put(row.id, f)).pipe(
  Effect.as(true),
  Effect.catch(() => Effect.succeed(false)),
  Effect.flatMap((ok) => (ok ? Effect.sync(() => $held.set(new Set([...$held.get(), row.id]))) : Effect.void)),
);
const shelved = (k, row) => Effect.sync(() => {
  confirmed([row, ...($songs.get() || [])]);
  $uploads.set($uploads.get().filter((x) => x.k !== k));
  toastFn?.(T(tNow, "uploaded"));
});
const uploaded = (f, k) => sent(f, k).pipe(
  Effect.catchIf((e) => !!e?.status, (e) => refused(f, k, e).pipe(Effect.as(null))),
  Effect.flatMap((up) => (!up ? Effect.void : rowOf(up.id).pipe(
    Effect.tap((row) => counted(f, row)),
    Effect.tap((row) => stored(f, row)),
    Effect.tap((row) => shelved(k, row)),
  ))),
  squashed(crashed(f, k)),
);

let toastFn = null, tNow = null;
takeShared((s) => {
  const files = s.files || [];
  report("share.in", { n: files.length, types: files.map((f) => f.type).slice(0, 5), sizes: files.map((f) => f.size).slice(0, 5), names: files.map((f) => String(f.name || "").slice(0, 40)).slice(0, 5), text: String(s.text || "").slice(0, 80) }, "info");
  for (const f of files) { if (isAudio(f)) upload(f); else toastFn?.(T(tNow, "skipped")); }
});

async function upload(f) {
  const k = `${Date.now()}-${f.name}`;
  $uploads.set([{ k, name: f.name, state: "up" }, ...$uploads.get()]);
  $err.set("");
  if (gate) { $uploads.set($uploads.get().filter((u) => u.k !== k)); return; }
  await Effect.runPromise(uploaded(f, k));
}

function ensure() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "metadata";
  audio.addEventListener("timeupdate", () => $pos.set(Math.round(audio.currentTime * 1000)));
  audio.addEventListener("durationchange", () => $dur.set(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0));
  audio.addEventListener("play", () => { $playing.set(true); hold?.setPlaying(); });
  audio.addEventListener("pause", () => { $playing.set(false); hold?.setPaused(); stopBreath(); });
  audio.addEventListener("ended", () => step(1, false));
  tap = listen(audio);
  audio.addEventListener("playing", breathe);
  return audio;
}
const $yt = gate ? atom("") : persistentAtom("fonoteka:yt", "");
const known = new Map();
function ytOf(f) {
  const id = `y:${f.id}`;
  let e = known.get(id);
  if (!e) { e = { id, yt: f.id, title: f.title || "", artist: f.artist || "", dur: f.dur || 0, cover: f.cover || null, url: f.url || `https://music.youtube.com/watch?v=${f.id}` }; known.set(id, e); }
  return e;
}
const $radios = atom({});
const $acts = atom({});
let stackOf = null, layerNow = [], queue = [];
const songOf = (id) => ($songs.get() || []).find((s) => s.id === id) || known.get(id) || null;

async function play(id, list) {
  const s = songOf(id);
  if (!s) return;
  if (list) queue = list;
  if (gate) { $cur.set(id); $playing.set(true); $dur.set(Math.round(s.dur * 1000)); return; }
  if (s.yt && !session.get()) { authWall.set(authWall.get() + 1); return; }
  const a = ensure();
  if ($cur.get() !== id || !a.src) {
    if (kept) URL.revokeObjectURL(kept);
    kept = "";
    if (s.yt) { $dur.set(Math.round(s.dur * 1000)); a.src = await sealedUrl("/library/play", { v: s.yt }); }
    else {
      const blob = await store.blob(id).catch(() => null);
      kept = blob ? URL.createObjectURL(blob) : "";
      a.src = kept || await sealedUrl("/library/get", { id });
    }
    $pos.set(0);
  }
  $cur.set(id);
  if (!hold) hold = holdAudio({ title: titleOf(s), artist: s.artist || "", onPlay: () => a.play(), onPause: () => a.pause(), onPrev: () => step(-1), onNext: () => step(1) });
  else hold.meta(titleOf(s), s.artist || "", $covers.get()[s.id] || null);
  a.play().catch(() => $playing.set(false));
  readyShare(s);
}

async function enrich() {
  if (gate) return;
  await Effect.runPromise(likePage.pipe(Effect.repeat({ times: CONFIG.likePages - 1, while: (more) => more }), Effect.asVoid));
}
const likePage = Effect.suspend(() => {
  const l = $likes.get();
  if (!l?.connected || !l.next || (($songs.get() || []).length + l.songs.length) >= COMB_MAX) return Effect.succeed(false);
  return tried(() => readLikes(true)).pipe(Effect.map((got) => !!got));
});
async function ytTap() {
  $lErr.set("");
  if ($yt.get() === "on" && $likes.get()?.connected) { $yt.set(""); return; }
  if (gate) { $yt.set("on"); return; }
  if (!session.get()) { authWall.set(authWall.get() + 1); return; }
  $yt.set("on");
  if (!$likes.get()?.connected) await readLikes();
  if ($likes.get()?.connected) enrich();
  else connect("fonoteka");
}

const ytAsked = new Set();
async function ytCovers(list) {
  const want = list.filter((s) => s.yt && s.cover && !ytAsked.has(s.id));
  if (!want.length) return;
  for (const s of want) ytAsked.add(s.id);
  await Effect.runPromise(Effect.forEach(want, (s) => coverAt(s.cover), { concurrency: "unbounded" }).pipe(
    Effect.map((got) => pipe(zip(want, got), filter(([, blob]) => !!blob), map(([s, blob]) => [s.id, URL.createObjectURL(blob)]), fromEntries())),
    Effect.tap((fresh) => Effect.sync(() => $covers.set({ ...$covers.get(), ...fresh }))),
  ));
}
const coverAt = (url) => orNull(async () => { const r = await fetch(url, { signal: AbortSignal.timeout(CONFIG.coverTimeoutMs) }); return r.ok ? r.blob() : null; });
const radioOf = (s, hl) => (gate ? Effect.succeed(FIXTURE_RADIO.songs) : tried(async () => {
  const r = await fetch(`${VPS_PROXY}${R.radio}?v=${s.yt}&hl=${hl}`, { signal: AbortSignal.timeout(CONFIG.radioTimeoutMs) });
  if (!r.ok) throw r.status;
  return (await r.json()).songs || [];
}));

async function tune(s) {
  if (!s?.yt || !stackOf) return;
  const st = stackOf.get();
  if (st[st.length - 1]?.id === s.id) return;
  stackOf.set([...st, s]);
  if ($radios.get()[s.yt]) return;
  $radios.set({ ...$radios.get(), [s.yt]: { songs: null } });
  const hl = document.documentElement.lang === "en" ? "en" : "uk";
  await Effect.runPromise(radioOf(s, hl).pipe(
    Effect.tap((like) => Effect.sync(() => $radios.set({ ...$radios.get(), [s.yt]: { songs: like.filter((f) => f.id !== s.yt).map((f) => ytOf(songOfFound(f))) } }))),
    squashed((e) => Effect.sync(() => {
      const m = { ...$radios.get() }; delete m[s.yt]; $radios.set(m);
      toastFn?.(T(tNow, e === 429 ? "errBusy" : "errRadio"));
      const now = stackOf.get();
      if (now[now.length - 1]?.id === s.id) stackOf.set(now.slice(0, -1));
    })),
  ));
}

const actKey = (k, s) => `${k}:${s.yt}`;
function setAct(key, v) { const a = { ...$acts.get() }; if (v) a[key] = v; else delete a[key]; $acts.set(a); }
function landed(row) {
  if (!row?.id) return;
  const u = $usage.get(); if (u) $usage.set({ ...u, count: u.count + 1, bytes: u.bytes + (row.size || 0) });
  confirmed([row, ...($songs.get() || [])]);
}
function keepFail(e, fallback) {
  if (e?.status === 401) { authWall.set(authWall.get() + 1); return; }
  const why = (() => { try { return JSON.parse(e?.message).error; } catch { return String(e?.message || ""); } })();
  $err.set(e?.status === 409 ? errorKey(409, why) : e?.status === 429 ? "errBusy" : fallback);
}
async function keepYt(s) {
  const key = actKey("keep", s);
  if ($acts.get()[key]) return;
  if (!gate && !session.get()) { authWall.set(authWall.get() + 1); return; }
  setAct(key, "busy"); $err.set("");
  toastFn?.(T(tNow, "keeping"));
  await Effect.runPromise((gate ? Effect.void : keepTask({ url: s.url }).pipe(Effect.tap((row) => Effect.sync(() => landed(row))))).pipe(
    Effect.tap(() => Effect.sync(() => { setAct(key, "done"); toastFn?.(T(tNow, "kept")); })),
    squashed((e) => Effect.sync(() => { setAct(key, ""); keepFail(e, "errKeep"); })),
  ));
}
const keepTask = (body) => tried(() => taskCall(R.keep, body));
const MIX = CONFIG.mix;
async function mixYt(s) {
  const key = actKey("mix", s);
  if ($acts.get()[key]) return;
  if (!gate && !session.get()) { authWall.set(authWall.get() + 1); return; }
  setAct(key, "busy"); $err.set("");
  toastFn?.(T(tNow, "mixing"));
  const got = gate ? MIX.map(() => ({ status: "fulfilled", value: null }))
    : await Effect.runPromise(Effect.forEach(MIX, (v) => settled(keepTask({ url: s.url, v })), { concurrency: "unbounded" }));
  const ok = got.filter((r) => r.status === "fulfilled");
  for (const r of ok) landed(r.value);
  if (!ok.length) { setAct(key, ""); keepFail(got[0].reason, "errMix"); return; }
  setAct(key, "done");
  toastFn?.(T(tNow, ok.length === MIX.length ? "mixed" : "mixedPart"));
}

async function saveList(layer) {
  const songs = listOfLayer(layer), key = `save:${songs[0]?.yt}`;
  if (songs.length < 2 || $acts.get()[key]) return;
  if (!gate && !session.get()) { authWall.set(authWall.get() + 1); return; }
  setAct(key, "busy");
  toastFn?.(T(tNow, "savingList"));
  if (gate) { setAct(key, "done"); return; }
  const r = await postJson(R.listsave, JSON.stringify({ locale: document.documentElement.lang === "en" ? "en" : "uk", songs })).catch(() => null);
  const l = r?.ok ? await r.json().catch(() => null) : null;
  if (!l?.id) {
    setAct(key, "");
    if (r?.status === 401) authWall.set(authWall.get() + 1);
    else toastFn?.(T(tNow, r?.status === 409 ? "errListCount" : "errSaveList"));
    report("list.save.fail", { status: r?.status || 0 });
    return;
  }
  $lists.set([l, ...$lists.get()]);
  setAct(key, "done");
  toastFn?.(T(tNow, "savedList", { name: l.name }));
}
function playList(l, mix) {
  const songs = listSongsOf(l), order = mix ? shuffled(songs) : songs;
  if (order.length) play(order[0].id, order);
}
function openList(l) {
  if (!stackOf) return;
  const st = stackOf.get();
  if (st[st.length - 1]?.id !== `p:${l.id}`) stackOf.set([...st, { id: `p:${l.id}`, list: l.id }]);
}
async function dropList(l) {
  if (!gate) {
    const r = await postJson(R.listdel, JSON.stringify({ id: l.id })).catch(() => null);
    if (!r?.ok) { toastFn?.(T(tNow, "errDelete")); return; }
  }
  $lists.set($lists.get().filter((x) => x.id !== l.id));
  const was = $collage.get()[l.id];
  if (was) { URL.revokeObjectURL(was); const m = { ...$collage.get() }; delete m[l.id]; $collage.set(m); }
  toastFn?.(T(tNow, "deleted"));
}

let combApi = null, raf = 0, spec = null, specOf = "", told = "";
let seen = { id: "", frames: 0, empty: 0, live: 0, top: 0, sum: 0, sent: 0, done: false };
function measure(id, f, live, b) {
  if (seen.id !== id) seen = { id, frames: 0, empty: 0, live: 0, top: 0, sum: 0, sent: 0, done: false };
  if (seen.done) return;
  seen.frames++;
  if (!f) seen.empty++;
  if (live) seen.live++;
  if (b) { seen.sent++; for (let i = 0; i < SPECTRUM_BANDS; i++) { seen.top = Math.max(seen.top, b[i]); seen.sum += b[i]; } }
  if (audio.currentTime < CONFIG.statsAtS) return;
  seen.done = true;
  report("spectrum.stats", { yt: id.startsWith("y:"), frames: seen.frames, empty: seen.empty, live: seen.live, sent: seen.sent, top: seen.top, mean: seen.sent ? Math.round(seen.sum / (seen.sent * SPECTRUM_BANDS)) : 0, comb: !!combApi, ...(tap ? tap.state() : DEAF) }, "info");
}
const pulse = (v) => { try { combApi?.exports.set(PARAM.pulse, v); } catch { } };
const bands = (arr) => { try { for (let b = 0; b < SPECTRUM_BANDS; b++) combApi?.exports.set(PARAM.band + b, arr ? arr[b] : 0); } catch { } };
function stopBreath() { cancelAnimationFrame(raf); raf = 0; pulse(0); bands(null); }
const DEAF = { ctx: "none", track: "none", fault: "no capture", heard: false };
function tell(id, src) {
  if (told === id) return;
  told = id;
  report("spectrum", { src, yt: id.startsWith("y:"), ...(tap ? tap.state() : DEAF) }, "info");
}
function readKept(id) {
  if (specOf === id) return;
  specOf = id; spec = null;
  tell(id, "kept");
  store?.blob(id).then((b) => (b ? spectrumOfBlob(b) : null)).then((s) => { if (specOf === id) spec = s; }).catch(() => {});
}
function keptFrame() {
  const n = Math.floor(spec.length / SPECTRUM_BANDS), f = Math.min(n - 1, Math.floor(audio.currentTime * SPECTRUM_HZ));
  return f < 0 ? null : spec.subarray(f * SPECTRUM_BANDS, (f + 1) * SPECTRUM_BANDS);
}
function breathe() {
  if (gate || !combApi || raf || !audio || audio.paused) return;
  const tick = () => {
    if (!combApi || audio.paused) { stopBreath(); return; }
    raf = requestAnimationFrame(tick);
    const id = $cur.get() || "", f = tap?.frame() || null, live = !!f && tap.state().heard;
    if (live) tell(id, "live");
    else if (id && audio.currentTime > CONFIG.liveWaitS) readKept(id);
    const k = !live && spec && specOf === id ? keptFrame() : null;
    const b = live ? f.bands : k, p = live ? f.pulse : k ? (k[0] + k[1]) / 510 : 0;
    pulse(p); bands(b);
    measure(id, f, live, b);
    if (b) onBeat(p);
  };
  tick();
}
function toggle() {
  if ($playing.get()) { if (gate) $playing.set(false); else audio?.pause(); return; }
  const id = $cur.get() || layerNow[0]?.id;
  if (id) play(id, $cur.get() ? null : layerNow);
}
function step(dir, manual = true) {
  const list = (queue.some((s) => s.id === $cur.get()) ? queue : layerNow).filter((s) => songOf(s.id));
  const next = advance(list.findIndex((s) => s.id === $cur.get()), list.length, { step: dir, repeat: $repeat.get(), manual });
  if (next >= 0) play(list[next].id, list);
}
function seek(ms) { if (audio && !gate) audio.currentTime = ms / 1000; $pos.set(ms); }
function stop() { stopBreath(); if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); } if (kept) { URL.revokeObjectURL(kept); kept = ""; } $cur.set(""); $playing.set(false); $pos.set(0); $dur.set(0); }

const RESUME_KEY = "fonoteka:resume";
let resumeSaved = "";
if (!gate) setInterval(() => {
  if (!$playing.get() || !audio || !$cur.get()) return;
  const v = JSON.stringify({ id: $cur.get(), t: Math.floor(audio.currentTime) });
  if (v === resumeSaved) return;
  resumeSaved = v;
  try { localStorage.setItem(RESUME_KEY, v); } catch { }
}, 5000);
if (!gate) {
  const off = $songs.subscribe((list) => {
    if (!list?.length) return;
    queueMicrotask(() => off());
    let r = null; try { r = JSON.parse(localStorage.getItem(RESUME_KEY) || "null"); } catch { }
    if (!r?.id || $cur.get() || !songOf(r.id)) return;
    resumeAt(r.id, Number(r.t) || 0);
  });
}
async function resumeAt(id, t) {
  await play(id);
  const a = audio; if (!a) return;
  const go = () => { try { a.currentTime = t; } catch { } $pos.set(Math.round(t * 1000)); };
  if (a.readyState >= 1) go(); else a.addEventListener("loadedmetadata", go, { once: true });
}

async function remove(s) {
  if (!gate) {
    const r = await fetch(`${VPS_PROXY}/library/del`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id }), signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!r || !r.ok) { $err.set("errDelete"); return; }
  }
  if ($cur.get() === s.id) stop();
  const u = $usage.get(); if (u) $usage.set({ ...u, count: Math.max(0, u.count - 1), bytes: Math.max(0, u.bytes - s.size) });
  confirmed(($songs.get() || []).filter((x) => x.id !== s.id));   
  toastFn?.(T(tNow, "deleted"));
}

const links = new Map(), linking = new Map();   
function readyShare(s) {
  if (!s || gate || s.yt) return Promise.resolve(null);
  if (links.has(s.id)) return Promise.resolve(links.get(s.id));
  if (!linking.has(s.id)) linking.set(s.id, (async () => {
    try {
      const r = await fetch(`${VPS_PROXY}/library/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id }), signal: AbortSignal.timeout(20000) });
      if (!r.ok) { report("share.link.fail", { status: r.status }); return null; }
      const { url } = await r.json();
      links.set(s.id, url);
      return url;
    } catch (e) { report("share.link.fail", { err: String(e?.name || e).slice(0, 80) }); return null; }
    finally { linking.delete(s.id); }
  })());
  return linking.get(s.id);
}
async function shareSong(s) {
  if (!s || gate) return;
  let url = links.get(s.id);
  if (!url) {
    toastFn?.(T(tNow, "shareWait"));
    url = await readyShare(s);
    if (!url) { toastFn?.(T(tNow, "shareFail")); return; }
  }
  openShare(s, url);
}
function openShare(s, url) {
  const data = { title: titleOf(s), url };
  if (!navigator.share || !navigator.canShare?.(data)) {
    navigator.clipboard?.writeText(url).then(() => toastFn?.(T(tNow, "shareCopied")), () => toastFn?.(T(tNow, "shareFail")));
    return;
  }
  navigator.share(data).then(
    () => report("share.out.ok", {}, "info"),
    (e) => {
      if (e?.name === "AbortError") return;   
      report("share.out.fail", { err: String(e?.message || e).slice(0, 120) });
      navigator.clipboard?.writeText(url).then(() => toastFn?.(T(tNow, "shareCopied")), () => toastFn?.(T(tNow, "shareFail")));
    },
  );
}

function pickFiles(files) { for (const f of files || []) { if (isAudio(f)) upload(f); else toastFn?.(T(tNow, "skipped")); } }

export function fonoteka({ S, toast, confirm }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const songs = useStore($songs), usage = useStore($usage), uploads = useStore($uploads), err = useStore($err), held = useStore($held), covers = useStore($covers);
  const onPhone = songs ? songs.filter((s) => held.has(s.id)).length : 0;
  const cur = useStore($cur), playing = useStore($playing), pos = useStore($pos), dur = useStore($dur), repeat = useStore($repeat);
  const stack = useStore(S.stack), radios = useStore($radios), likes = useStore($likes), yt = useStore($yt), acts = useStore($acts), lErr = useStore($lErr), lBusy = useStore($lBusy);
  const lists = useStore($lists), collage = useStore($collage);
  const sid = useStore(session)?.sid || "";
  toastFn = toast; tNow = t; stackOf = S.stack;
  useEffect(() => { load(); if (!gate) restore().catch(() => {}); }, []);
  useEffect(() => { if (!gate && sid) readLists(); if (!gate && sid && $yt.get() === "on" && !$likes.get()?.connected) readLikes().then(enrich); }, [sid]);
  useEffect(() => {
    const on = () => { if (document.visibilityState === "visible" && $yt.get() === "on" && !$likes.get()?.connected && session.get()) readLikes().then(enrich); };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  const ytOn = yt === "on" && !!likes?.connected;
  const top = stack.length ? stack[stack.length - 1] : null;
  const topList = top?.list ? lists.find((l) => l.id === top.list) || null : null;
  const tuned = top && !top.list ? radios[top.yt] : null;
  const shelfLists = top ? [] : lists;
  const layer = top ? (top.list ? (topList ? listSongsOf(topList) : []) : tuned?.songs ? [top, ...tuned.songs] : [])
    : [...(songs || []), ...(ytOn ? likes.songs.map(ytOf) : [])].slice(0, COMB_MAX - shelfLists.length);
  layerNow = layer;
  const layerKey = layer.map((s) => s.id).join("|");
  useEffect(() => { ytCovers(layer); }, [layerKey]);
  const [bloom, setBloom] = useState(null);
  useEffect(() => setBloom((b) => (b && top && !top.list ? { ...b, id: top.id } : null)), [top?.id]);
  const now = cur ? songOf(cur) : null;
  const askDelete = (s) => confirm({ title: T(t, "delTitle"), body: T(t, "delBody", { name: titleOf(s) }), verb: T(t, "delYes"), onConfirm: () => remove(s) });
  const askDropList = (l) => confirm({ title: T(t, "delListTitle"), body: T(t, "delListBody", { name: l.name }), verb: T(t, "delYes"), onConfirm: () => dropList(l) });
  const saveKey = top && !top.list ? acts[`save:${top.yt}`] : null;
  const picker = useRef();

  useEffect(() => {
    if ($cur.get()) readyShare(songOf($cur.get()));
    return () => { stopBreath(); combApi = null; };
  }, []);
  const listWords = { songs: T(t, "wSongs"), min: T(t, "wMin") };
  const items = [
    ...shelfLists.map((l) => ({ id: `p:${l.id}`, name: l.name, subtitle: listLine(l, listWords), icon: collage[l.id] || null, window: collage[l.id] || null, color: "accent", mark: MARK.none, form: shapeOf(`p:${l.id}`) })),
    ...layer.map((s) => ({ id: s.id, name: titleOf(s), subtitle: songLine(s, clock), icon: covers[s.id] || null, window: s.yt ? covers[s.id] || null : null, color: s.yt ? "secondary" : "accent", mark: cur === s.id ? MARK.lit : MARK.none, form: shapeOf(s.id) })),
  ];
  const onSettle = (it) => { const s = songOf(it.id); if (s && $cur.get() !== s.id) play(s.id, layerNow); };
  const actsOf = (s) => {
    const l = listOf(s.id);
    if (l) return [
      { id: "listplay", icon: "lucide:play", label: T(t, "aPlayList"), go: () => playList(l, false) },
      { id: "shuffle", icon: "lucide:shuffle", label: T(t, "aShuffle"), go: () => playList(l, true) },
      { id: "listdel", icon: "lucide:trash-2", label: T(t, "aDelList"), bump: true, go: () => askDropList(l) },
    ];
    const k = acts[actKey("keep", s)], m = acts[actKey("mix", s)];
    return [
      { id: "keep", icon: k === "done" ? "lucide:check" : "lucide:arrow-down-to-line", label: T(t, k === "done" ? "keptA" : "aKeep"), busy: k === "busy", done: k === "done", go: () => keepYt(s) },
      { id: "mix", icon: m === "done" ? "lucide:check" : "lucide:disc-3", label: T(t, m === "done" ? "mixedA" : "aMix"), busy: m === "busy", done: m === "done", go: () => mixYt(s) },
      { id: "radio", icon: "lucide:radio", label: T(t, "aRadio"), go: () => tune(s) },
    ];
  };
  const actBtn = (s, a) => html`<button key=${a.id} ...${{ [`data-${a.id}`]: s.yt }} data-haptic=${a.bump ? "bump" : null} aria-label=${`${a.label}: ${titleOf(s)}`} aria-busy=${a.busy ? "true" : null} disabled=${a.busy || a.done}
    onClick=${a.go} class=${`btn rounded-full sf-raised min-h-0 gap-1.5 font-medium ms-press btn-xs px-2 ${a.busy ? "animate-pulse" : ""} ${a.done ? "text-secondary" : ""}`}>
    ${Icon(a.icon, "text-sm")}<span>${a.label}</span>
  </button>`;
  const listCell = (l, mode) => {
    const id = `p:${l.id}`, pic = collage[l.id], f = shapeOf(id);
    const twin = html`<button data-list=${l.id} aria-label=${`${T(t, "aOpenList")}: ${l.name}`} onClick=${() => openList(l)} class=${mode === "gl" ? "" : "fk-cell ms-press"}>
      ${mode === "gl" ? null : html`<span class="fk-album"><span class="fk-art" style=${`clip-path:url(#fk-c-${f})`}>${pic ? html`<img src=${pic} alt="" decoding="async" />` : null}</span><svg aria-hidden="true" class="fk-arim" viewBox="0 0 1 1"><path d=${pathOf(f)} /></svg></span>`}
      <span class="fk-name">${l.name}</span>
    </button>`;
    return html`<div key=${id} data-playlist=${l.id}>${twin}${mode === "gl" ? actsOf({ id }).map((a) => actBtn({ id, yt: l.id, title: l.name }, a)) : null}</div>`;
  };
  const cellOf = (it, i, mode) => {
    const pl = listOf(it.id);
    if (pl) return listCell(pl, mode);
    const s = songOf(it.id); if (!s) return null;
    const on = cur === s.id, f = shapeOf(s.id), cov = covers[s.id];
    const press = () => (on ? toggle() : play(s.id, layerNow));
    const mark = s.yt ? { "data-yt": s.yt } : { "data-song": s.id };
    if (mode === "gl") return html`<div key=${s.id} ...${mark} data-cover=${cov ? "true" : null}><button data-play=${s.id} aria-pressed=${on ? "true" : "false"} aria-label=${`${T(t, "aPlay")}: ${titleOf(s)}`} onClick=${press}><span class="fk-name">${titleOf(s)}</span></button>${s.yt ? actsOf(s).map((a) => actBtn(s, a)) : null}</div>`;
    return html`<div key=${s.id} ...${mark} data-cover=${cov ? "true" : null} style=${`--i:${Math.min(i, 14)}`}>
      <button data-play=${s.id} aria-pressed=${on ? "true" : "false"} aria-label=${`${T(t, "aPlay")}: ${titleOf(s)}`} onClick=${press} class="fk-cell ms-press">
        <span class="fk-album">
          <span class="fk-art" style=${`clip-path:url(#fk-c-${f})`}>${cov ? html`<img src=${cov} alt="" decoding="async" />` : null}</span>
          <svg aria-hidden="true" class="fk-arim" viewBox="0 0 1 1"><path d=${pathOf(f)} /></svg>
          ${on ? html`<span class="fk-now" aria-hidden="true">${Icon(playing ? "lucide:audio-lines" : "lucide:play", "text-lg")}</span>` : null}
        </span>
        <span class="fk-name">${titleOf(s)}</span>
      </button>
      ${s.yt && on ? html`<div class="flex flex-wrap justify-center gap-1">${actsOf(s).map((a) => actBtn(s, a))}</div>` : null}
    </div>`;
  };
  const bloomList = bloom && shelfLists.some((l) => `p:${l.id}` === bloom.id) ? listOf(bloom.id) : null;
  const open = bloomList ? { id: bloom.id, yt: bloomList.id, title: bloomList.name }
    : bloom && layer.some((s) => s.id === bloom.id) ? songOf(bloom.id) : null;
  const rim = open?.yt ? html`<div data-open-rim data-yt=${open.yt} class="contents">${actsOf(open).map((a, k) => {
    const p = rimAt(shapeOf(open.id), CONFIG.rim[k], CONFIG.rimSpread), R = bloom.at.r;
    const x = Math.max(28, Math.min(innerWidth - 28, bloom.at.x + (p.x - 0.5) * 2 * R)), y = bloom.at.y + (p.y - 0.5) * 2 * R;
    return html`<button key=${a.id} ...${{ [`data-${a.id}`]: open.yt }} data-haptic=${a.bump ? "bump" : null} aria-label=${`${a.label}: ${titleOf(open)}`} title=${a.label} aria-busy=${a.busy ? "true" : null} disabled=${a.busy || a.done} onClick=${a.go}
      class=${`fixed z-10 btn btn-circle sf-raised min-h-0 w-12 h-12 -translate-x-1/2 -translate-y-1/2 ms-press ${a.busy ? "animate-pulse" : ""} ${a.done ? "text-secondary" : ""}`}
      style=${`left:${Math.round(x)}px;top:${Math.round(y)}px;animation:msReveal .26s ${k * 70}ms both`}>${Icon(a.icon, "text-xl")}</button>`;
  })}</div>` : null;
  const head = useRef();
  const [headH, setHeadH] = useState(260);
  useEffect(() => {
    const el = head.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHeadH(el.offsetHeight || 0)); ro.observe(el); setHeadH(el.offsetHeight || 0);
    return () => ro.disconnect();
  }, []);

  return html`<div data-fonoteka data-playing=${playing ? "true" : null} data-songs=${songs ? songs.length : null} class="flex flex-col gap-[calc(var(--ms-gap)*2)] p-[var(--ms-pad)]">
    <${Island} pinned data-player className="w-full max-w-[36rem] flex flex-col items-stretch !py-2">
      <${Transport} form dense locale=${locale} playing=${playing} onToggle=${toggle} disabled=${!layer.length && !now} className="w-full"
        onPrev=${() => step(-1)} onNext=${() => step(1)} pos=${pos} dur=${dur} onSeek=${seek} onScrub=${seek} repeat=${shownRepeat(repeat)} onRepeat=${flipRepeat}
        title=${now ? titleOf(now) : T(t, "nothing")} subtitle=${now ? songLine(now, clock) : ""}
        actions=${[
          { id: "share", icon: "lucide:share-2", label: T(t, "aShare"), onClick: () => shareSong(now), disabled: !now || !!now.yt, attr: { "data-share": true } },
          { id: "del", icon: "lucide:trash-2", label: T(t, "aDelete"), haptic: "bump", onClick: () => now && !now.yt && askDelete(now), disabled: !now || !!now.yt, attr: { "data-del": true } },
        ]} />
    </${Island}>
    <div ref=${head} class="relative z-10 flex flex-col gap-[calc(var(--ms-gap)*2)] pointer-events-none [&_button]:pointer-events-auto [&_input]:pointer-events-auto">
    ${top ? html`<nav data-radio-nav data-depth=${stack.length} aria-label=${T(t, "radio")} class="flex items-center gap-2">
      <button data-back aria-label=${T(t, "aBack")} onClick=${() => S.stack.set(stack.slice(0, -1))} class="btn rounded-full sf-raised btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ms-press">${Icon("lucide:arrow-left", "text-[length:var(--ms-icon)]")}</button>
      <div class="min-w-0 flex-1 flex flex-col leading-tight gap-0.5">
        <span class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-muted">${T(t, top.list ? "playlist" : "radio")}${stack.length > 1 ? ` · ${stack.length}` : ""}</span>
        <span class="font-semibold text-sm truncate">${top.list ? topList?.name || "" : [top.artist, titleOf(top)].filter(Boolean).join(" — ")}</span>
      </div>
      ${!top.list && tuned?.songs?.length > 1 ? html`<button data-save-list=${top.yt} aria-label=${T(t, saveKey === "done" ? "savedListA" : "aSaveList")} aria-busy=${saveKey === "busy" ? "true" : null} disabled=${!!saveKey} onClick=${() => saveList(layer)}
        class=${`btn rounded-full sf-raised shrink-0 h-[var(--ms-ctl)] min-h-0 px-3.5 gap-2 font-medium ms-press ${saveKey === "busy" ? "animate-pulse" : ""} ${saveKey === "done" ? "text-secondary" : ""}`}>
        ${Icon(saveKey === "done" ? "lucide:check" : "lucide:bookmark-plus", "text-[length:var(--ms-icon)]")}<span class="max-[380px]:hidden">${T(t, saveKey === "done" ? "savedListA" : "aSaveList")}</span>
      </button>` : null}
      ${stack.length > 1 ? html`<button data-home aria-label=${T(t, "aHome")} onClick=${() => S.stack.set([])} class="btn rounded-full sf-raised btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ms-press">${Icon("lucide:house", "text-[length:var(--ms-icon)]")}</button>` : null}
    </nav>` : null}
    ${top && err ? html`<div data-err role="alert" class="text-sm text-error">${T(t, err)}</div>` : null}
    <section aria-labelledby="fk-shelf" class=${`flex flex-col gap-[var(--ms-gap)] ${top ? "hidden" : ""}`}>
      <div class="flex items-center justify-between gap-3">
        <h2 id="fk-shelf" class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-muted">${T(t, "songs")}</h2>
        <div class="flex items-center gap-2 shrink-0">
          <button data-yt-music aria-pressed=${ytOn ? "true" : "false"} aria-label=${T(t, ytOn ? "ytHide" : "ytConnect")} disabled=${lBusy === "connect" || lBusy === "list"} onClick=${ytTap}
            class=${`btn rounded-full sf-raised shrink-0 h-[var(--ms-ctl)] min-h-0 px-3.5 gap-2 font-medium ms-press ${ytOn ? "text-secondary" : ""} ${lBusy === "connect" || lBusy === "list" ? "animate-pulse" : ""}`}>
            ${Icon(ytOn ? "lucide:check" : "lucide:youtube", "text-[length:var(--ms-icon)]")}<span class="max-[380px]:hidden">YT Music</span>
          </button>
          <button data-add onClick=${() => picker.current?.click()} class="btn rounded-full sf-raised shrink-0 h-[var(--ms-ctl)] min-h-0 px-4 gap-2 font-medium ms-press">
            ${Icon("lucide:plus", "text-[length:var(--ms-icon)]")}<span>${T(t, "add")}</span>
          </button>
        </div>
      </div>
      <div class="flex flex-col gap-1 -mt-1">
        ${usage ? html`<div data-usage class="font-mono text-xs tabular-nums text-muted">${usageLine(usage, { songs: T(t, "wSongs"), of: T(t, "wOf") })}</div>` : null}
        ${songs?.length ? html`<div data-onphone data-all=${onPhone === songs.length ? "true" : null} class="flex items-center gap-1.5 text-xs text-muted">
          ${Icon(onPhone === songs.length ? "lucide:smartphone" : "lucide:arrow-down-to-line", `text-sm ${onPhone === songs.length ? "text-secondary" : ""}`)}
          <span class="tabular-nums">${onPhone === songs.length ? T(t, "onPhoneAll") : T(t, "onPhoneSome", { n: onPhone, m: songs.length })}</span>
        </div>` : null}
      </div>
      ${err ? html`<div data-err role="alert" class="text-sm text-error">${T(t, err)}</div>` : null}
      ${lErr ? html`<div data-yt-err role="alert" class="text-sm text-error">${T(t, lErr)}</div>` : null}
      <div class="flex flex-col gap-1">
        ${uploads.map((u) => html`<div key=${u.k} data-upload data-state=${u.state} class="fk-row flex items-center gap-3 px-2 h-[var(--ms-ctl)]">
          
          <span class="fk-up" aria-hidden="true">
            <svg viewBox="0 0 1 1" class="fk-glyph"><path d=${pathOf(shapeOf(u.name))} /></svg>
            ${u.state === "up" ? html`<svg data-progress viewBox="0 0 1 1" class="fk-glyph lit" style=${`clip-path:inset(${100 - (u.pct || 0)}% 0 0 0)`}><path d=${pathOf(shapeOf(u.name))} /></svg>` : null}
          </span>
          <span class="min-w-0 flex-1 flex flex-col leading-tight"><span class="font-semibold text-sm truncate">${u.name}</span><span class=${`text-xs ${u.state === "err" ? "text-error" : "text-muted"}`}>${u.state === "up" ? `${T(t, "uploading")}${u.pct ? ` · ${u.pct}%` : ""}` : T(t, "errUpload")}</span></span>
        </div>`)}
        ${songs && !songs.length && !uploads.length ? html`<div data-none class="py-6 flex flex-col items-center gap-1 text-center">
          <div class="font-semibold text-sm">${T(t, "empty")}</div><div class="text-sm text-muted">${T(t, "emptyHint")}</div>
        </div>` : null}
      </div>
    </section>
    </div>
    <${Comb} items=${items} cell=${cellOf} focus=${layer.some((s) => s.id === cur) ? cur : top && !top.list ? top.id : null} loading=${top ? !top.list && !tuned?.songs : songs === null} top=${headH + 32}
      onOpen=${(it) => { const l = listOf(it.id); if (l) { openList(l); return; } const s = songOf(it.id); if (s) (cur === s.id ? toggle() : play(s.id, layerNow)); }} onSettle=${onSettle} onReady=${(api) => { combApi = api; breathe(); }}
      onBloom=${(it, at) => setBloom(it && (songOf(it.id)?.yt || listOf(it.id)) ? { id: it.id, at } : null)} />
    ${rim}
    <svg aria-hidden="true" width="0" height="0" class="absolute"><defs>${[...new Set(items.map((it) => it.form))].map((n) => html`<clipPath key=${n} id=${`fk-c-${n}`} clipPathUnits="objectBoundingBox"><path d=${pathOf(n)} /></clipPath>`)}</defs></svg>

    <input ref=${picker} data-picker type="file" accept="audio/*,.mp3,.m4a,.ogg,.opus,.wav,.flac" multiple class="hidden" onChange=${(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
  </div>`;
}
