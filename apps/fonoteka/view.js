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
import { shapeOf, pathOf } from "/_rt/shape.js";
import { envelopeOfBlob, BREATH_HZ } from "/_rt/breath.js";
import { Comb, MARK, PARAM } from "/_rt/comb.js";
import { holdAudio } from "/_rt/mediasession.js";
import { sealedUrl } from "/_rt/sealedfetch.js";
import { uploadResumable } from "/_rt/task.js";
import { authWall } from "/_rt/authwall.js";
import { takeShared } from "/_rt/share.js";
import { report } from "/_rt/telemetry.js";
import { clock } from "/_rt/muzak.js";
import { isAudio, songLine, usageLine, titleOf, errorKey, FIXTURE_SONGS, FIXTURE_USAGE } from "/_rt/fonoteka.js";
import { songStore, keeper } from "/_rt/songstore.js";
import { coverBlob } from "/_rt/id3.js";

const Icon = (icon, cls = "") => html`<iconify-icon icon=${icon} class=${cls}></iconify-icon>`;
const $songs = atom(gate ? FIXTURE_SONGS : null);   
const $usage = atom(gate ? FIXTURE_USAGE : null);
const $held = atom(gate ? new Set(FIXTURE_SONGS.slice(0, 2).map((s) => s.id)) : new Set());   
const $uploads = atom([]);                           
const $err = atom("");
const $cur = atom("");
const $playing = atom(false);
const $pos = atom(0), $dur = atom(0);
let audio = null, hold = null, loaded = gate, kept = "";
const $repeat = persistentAtom("fonoteka:repeat", "all");
const flipRepeat = () => $repeat.set($repeat.get() === "one" ? "all" : "one");
const shownRepeat = (r) => (r === "one" ? "one" : "off");

const store = gate ? null : songStore();
const keep = gate ? null : keeper({
  store, urlOf: (id) => sealedUrl("/library/get", { id }), onHeld: (h) => $held.set(h),
  onFail: (e, s) => report("keep.fail", { status: e?.status || 0, err: String(e?.message || e).slice(0, 120), size: s.size }),
});
const $covers = atom(gate ? { [FIXTURE_SONGS[0].id]: "/_rt/theme-lum.webp" } : {});   
let coverRun = Promise.resolve();
function readCovers() {
  if (!store) return;
  const known = $covers.get(), held = $held.get();
  for (const s of $songs.get() || []) {
    if (!held.has(s.id) || s.id in known) continue;
    coverRun = coverRun.then(async () => {
      if (s.id in $covers.get()) return;
      const blob = await store.blob(s.id).catch(() => null);
      const pic = blob ? await coverBlob(blob).catch(() => null) : null;
      $covers.set({ ...$covers.get(), [s.id]: pic ? URL.createObjectURL(pic) : "" });
    });
  }
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
  try {
    const r = await fetch(`${VPS_PROXY}/library/list`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(20000) });
    if (!r.ok) { if (r.status === 401) { $songs.set([]); return; } report("list.fail", { status: r.status }); return offline(); }
    const j = await r.json();
    $usage.set({ count: j.count, bytes: j.bytes, maxFiles: j.maxFiles, maxBytes: j.maxBytes });
    confirmed(j.songs || []);
  } catch { offline(); }
}

async function offline() {
  const saved = await store?.readShelf().catch(() => null);
  const held = await store?.held().catch(() => null);
  if (!saved || !held?.size) { $err.set("errList"); $songs.set([]); return; }
  $usage.set(saved.usage); $held.set(held);
  $songs.set(saved.songs.filter((s) => held.has(s.id)));
}

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
  try {
    let id;
    try {
      id = await uploadResumable("/library/up", { n: f.name }, f, { onProgress: (sent, total) => { const pct = total ? Math.floor(sent * 100 / total) : 0; $uploads.set($uploads.get().map((u) => (u.k === k && u.pct !== pct ? { ...u, pct } : u))); } });
    } catch (e) {
      if (!e?.status) throw e;
      if (e.status === 401) authWall.set(authWall.get() + 1);
      const why = (() => { try { return JSON.parse(e.message).error; } catch { return ""; } })();
      report("upload.fail", { status: e.status, why: String(why || "").slice(0, 80), name: String(f.name || "").slice(0, 40), size: f.size, type: f.type });
      const key = errorKey(e.status, why); if (key) $err.set(key);
      $uploads.set($uploads.get().map((u) => (u.k === k ? { ...u, state: "err" } : u)));
      return;
    }
    const r = await fetch(`${VPS_PROXY}/library/uprow`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    if (!r.ok) throw new Error(`uprow ${r.status}`);
    const row = await r.json();
    report("upload.ok", { size: f.size, dur: row.dur }, "info");
    const u = $usage.get(); if (u) $usage.set({ ...u, count: u.count + 1, bytes: u.bytes + row.size });
    if (store) await store.put(row.id, f).then(() => $held.set(new Set([...$held.get(), row.id])), () => {});
    confirmed([row, ...($songs.get() || [])]);
    $uploads.set($uploads.get().filter((x) => x.k !== k));
    toastFn?.(T(tNow, "uploaded"));
  } catch (e) { report("upload.throw", { err: String(e?.message || e).slice(0, 120), name: String(f.name || "").slice(0, 40), size: f.size }); $err.set("errUpload"); $uploads.set($uploads.get().map((u) => (u.k === k ? { ...u, state: "err" } : u))); }
}

function ensure() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "metadata";
  audio.addEventListener("timeupdate", () => $pos.set(Math.round(audio.currentTime * 1000)));
  audio.addEventListener("durationchange", () => $dur.set(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0));
  audio.addEventListener("play", () => { $playing.set(true); hold?.setPlaying(); });
  audio.addEventListener("pause", () => { $playing.set(false); hold?.setPaused(); });
  audio.addEventListener("ended", () => step(1, false));
  return audio;
}
const songOf = (id) => ($songs.get() || []).find((s) => s.id === id);
async function play(id) {
  const s = songOf(id);
  if (!s) return;
  if (gate) { $cur.set(id); $playing.set(true); $dur.set(Math.round(s.dur * 1000)); return; }
  const a = ensure();
  if ($cur.get() !== id || !a.src) {
    const blob = await store.blob(id).catch(() => null);
    if (kept) URL.revokeObjectURL(kept);
    kept = blob ? URL.createObjectURL(blob) : "";
    a.src = kept || await sealedUrl("/library/get", { id }); $pos.set(0);
  }
  $cur.set(id);
  if (!hold) hold = holdAudio({ title: titleOf(s), artist: s.artist || "", onPlay: () => a.play(), onPause: () => a.pause(), onPrev: () => step(-1), onNext: () => step(1) });
  else hold.meta(titleOf(s), s.artist || "", $covers.get()[s.id] || null);   
  a.play().catch(() => $playing.set(false));
  if (breathing !== id) breatheSong(id);
  readyShare(s);   
}

let combApi = null, breathing = "", unbreathe = () => {};
const envs = new Map();
const pulse = (v) => { try { combApi?.exports.set(PARAM.pulse, v); } catch { } };
function stopBreath() { unbreathe(); unbreathe = () => {}; breathing = ""; pulse(0); }
async function breatheSong(id) {
  stopBreath();
  if (gate || !audio) return;
  let env = envs.get(id);
  if (!env) {
    const blob = await store.blob(id).catch(() => null);
    env = blob && await envelopeOfBlob(blob).catch(() => null);
    if (!env) return;
    envs.set(id, env);
  }
  if ($cur.get() !== id || breathing) return;
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (audio.paused) { pulse(0); return; }
    pulse((env[Math.min(env.length - 1, Math.floor(audio.currentTime * BREATH_HZ))] || 0) / 255);
  };
  tick();
  unbreathe = () => cancelAnimationFrame(raf);
  breathing = id;
}
function toggle() {
  if ($playing.get()) { if (gate) $playing.set(false); else audio?.pause(); return; }
  const id = $cur.get() || ($songs.get() || [])[0]?.id;
  if (id) play(id);
}
function step(dir, manual = true) {
  const list = $songs.get() || [];
  const next = advance(list.findIndex((s) => s.id === $cur.get()), list.length, { step: dir, repeat: $repeat.get(), manual });
  if (next >= 0) play(list[next].id);
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
  if (!s || gate) return Promise.resolve(null);
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
  toastFn = toast; tNow = t;
  useEffect(() => { load(); }, []);
  const now = cur ? songOf(cur) : null;
  const askDelete = (s) => confirm({ title: T(t, "delTitle"), body: T(t, "delBody", { name: titleOf(s) }), verb: T(t, "delYes"), onConfirm: () => remove(s) });
  const picker = useRef();

  useEffect(() => {
    if ($cur.get() && $playing.get()) breatheSong($cur.get());   
    if ($cur.get()) readyShare(songOf($cur.get()));
    return () => { stopBreath(); combApi = null; };
  }, []);
  const items = (songs || []).map((s) => ({ id: s.id, name: titleOf(s), subtitle: songLine(s, clock), icon: covers[s.id] || null, color: "accent", mark: cur === s.id ? MARK.lit : MARK.none, form: shapeOf(s.id) }));
  const onSettle = (it) => { const s = songOf(it.id); if (s && $cur.get() !== s.id) play(s.id); };
  const cellOf = (it, i, mode) => {
    const s = songOf(it.id); if (!s) return null;
    const on = cur === s.id, f = shapeOf(s.id), cov = covers[s.id];
    const press = () => (on ? toggle() : play(s.id));
    if (mode === "gl") return html`<div key=${s.id} data-song=${s.id} data-cover=${cov ? "true" : null}><button data-play=${s.id} aria-pressed=${on ? "true" : "false"} aria-label=${`${T(t, "aPlay")}: ${titleOf(s)}`} onClick=${press}><span class="fk-name">${titleOf(s)}</span></button></div>`;
    return html`<div key=${s.id} data-song=${s.id} data-cover=${cov ? "true" : null} style=${`--i:${Math.min(i, 14)}`}>
      <button data-play=${s.id} aria-pressed=${on ? "true" : "false"} aria-label=${`${T(t, "aPlay")}: ${titleOf(s)}`} onClick=${press} class="fk-cell ms-press">
        <span class="fk-album">
          <span class="fk-art" style=${`clip-path:url(#fk-c-${f})`}>${cov ? html`<img src=${cov} alt="" decoding="async" />` : null}</span>
          <svg aria-hidden="true" class="fk-arim" viewBox="0 0 1 1"><path d=${pathOf(f)} /></svg>
          ${on ? html`<span class="fk-now" aria-hidden="true">${Icon(playing ? "lucide:audio-lines" : "lucide:play", "text-lg")}</span>` : null}
        </span>
        <span class="fk-name">${titleOf(s)}</span>
      </button>
    </div>`;
  };
  const head = useRef();
  const [headH, setHeadH] = useState(260);
  useEffect(() => {
    const el = head.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHeadH(el.offsetHeight || 0)); ro.observe(el); setHeadH(el.offsetHeight || 0);
    return () => ro.disconnect();
  }, []);

  return html`<div data-fonoteka data-playing=${playing ? "true" : null} data-songs=${songs ? songs.length : null} class="flex flex-col gap-[calc(var(--ms-gap)*2)] p-[var(--ms-pad)]">
    <${Island} pinned data-player className="w-full max-w-[36rem] flex flex-col items-stretch">
      <${Transport} form locale=${locale} playing=${playing} onToggle=${toggle} disabled=${!songs?.length} className="w-full"
        onPrev=${() => step(-1)} onNext=${() => step(1)} pos=${pos} dur=${dur} onSeek=${seek} onScrub=${seek} repeat=${shownRepeat(repeat)} onRepeat=${flipRepeat}
        title=${now ? titleOf(now) : T(t, "nothing")} subtitle=${now ? songLine(now, clock) : ""}
        actions=${[
          { id: "share", icon: "lucide:share-2", label: T(t, "aShare"), onClick: () => shareSong(now), disabled: !now, attr: { "data-share": true } },
          { id: "del", icon: "lucide:trash-2", label: T(t, "aDelete"), haptic: "bump", onClick: () => now && askDelete(now), disabled: !now, attr: { "data-del": true } },
        ]} />
    </${Island}>
    <div ref=${head} class="relative z-10 flex flex-col gap-[calc(var(--ms-gap)*2)] pointer-events-none [&_button]:pointer-events-auto [&_input]:pointer-events-auto">
    <section aria-labelledby="fk-shelf" class="flex flex-col gap-[var(--ms-gap)]">
      <div class="flex items-center justify-between gap-3">
        <h2 id="fk-shelf" class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-muted">${T(t, "songs")}</h2>
        
        <button data-add onClick=${() => picker.current?.click()} class="btn rounded-full sf-raised shrink-0 h-[var(--ms-ctl)] min-h-0 px-4 gap-2 font-medium ms-press">
          ${Icon("lucide:plus", "text-[length:var(--ms-icon)]")}<span>${T(t, "add")}</span>
        </button>
      </div>
      <div class="flex flex-col gap-1 -mt-1">
        ${usage ? html`<div data-usage class="font-mono text-xs tabular-nums text-muted">${usageLine(usage, { songs: T(t, "wSongs"), of: T(t, "wOf") })}</div>` : null}
        ${songs?.length ? html`<div data-onphone data-all=${onPhone === songs.length ? "true" : null} class="flex items-center gap-1.5 text-xs text-muted">
          ${Icon(onPhone === songs.length ? "lucide:smartphone" : "lucide:arrow-down-to-line", `text-sm ${onPhone === songs.length ? "text-secondary" : ""}`)}
          <span class="tabular-nums">${onPhone === songs.length ? T(t, "onPhoneAll") : T(t, "onPhoneSome", { n: onPhone, m: songs.length })}</span>
        </div>` : null}
      </div>
      ${err ? html`<div data-err role="alert" class="text-sm text-error">${T(t, err)}</div>` : null}
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
    <${Comb} items=${items} cell=${cellOf} focus=${cur || null} top=${headH + 32} onOpen=${(it) => { const s = songOf(it.id); if (s) (cur === s.id ? toggle() : play(s.id)); }} onSettle=${onSettle} onReady=${(api) => { combApi = api; }} />
    <svg aria-hidden="true" width="0" height="0" class="absolute"><defs>${[...new Set((songs || []).map((s) => shapeOf(s.id)))].map((n) => html`<clipPath key=${n} id=${`fk-c-${n}`} clipPathUnits="objectBoundingBox"><path d=${pathOf(n)} /></clipPath>`)}</defs></svg>

    <input ref=${picker} data-picker type="file" accept="audio/*,.mp3,.m4a,.ogg,.opus,.wav,.flac" multiple class="hidden" onChange=${(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
  </div>`;
}
