import { html } from "htm/preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { Transport, MiniPlayer } from "/_rt/ui.js";
import { advance } from "/_rt/player.js";
import { shapeOf, pathOf, scalePath, shaper } from "/_rt/shape.js";
import { envelopeOfBlob, breathe } from "/_rt/breath.js";
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
const $songs = atom(gate ? FIXTURE_SONGS : null);   // null until the shelf is read
const $usage = atom(gate ? FIXTURE_USAGE : null);
const $held = atom(gate ? new Set(FIXTURE_SONGS.slice(0, 2).map((s) => s.id)) : new Set());   // ids kept on the phone
const $uploads = atom([]);                           // [{ k, name, state: "up" | "err", pct? }]
const $err = atom("");
const $cur = atom("");
const $playing = atom(false);
const $pos = atom(0), $dur = atom(0);
let audio = null, hold = null, loaded = gate, kept = "";
// ONE SONG ON A LOOP or on through the shelf (owner 2026-10-11: «я слухаю їх як медитацію по колу в основному»):
// two modes, not the kit's three — "off" would stop at the end of the shelf, which nobody here asked for. The
// choice is remembered; advance() replays the song when it ENDS under "one", and ▶︎▶︎ still moves on.
const $repeat = persistentAtom("fonoteka:repeat", "all");
const flipRepeat = () => $repeat.set($repeat.get() === "one" ? "all" : "one");
// what the button SHOWS: "on through the shelf" is the quiet default (the plain glyph, unlit), the loop is the lit
// repeat-1 — the kit lights "all" too, and two lit states told apart by a tiny "1" read as one state on a phone
const shownRepeat = (r) => (r === "one" ? "one" : "off");

// Every song on the shelf is kept on the phone (rt/songstore.js), so the shelf plays with no network.
const store = gate ? null : songStore();
const keep = gate ? null : keeper({
  store, urlOf: (id) => sealedUrl("/library/get", { id }), onHeld: (h) => $held.set(h),
  onFail: (e, s) => report("keep.fail", { status: e?.status || 0, err: String(e?.message || e).slice(0, 120), size: s.size }),
});
// ALBUMS (owner 2026-10-12: «Фонотека альбомами — роби в самій Фонотеці»; «не вистачає обложок … альбомчики форми
// сіткою гарною, а не банальним списком»). A song's cover is the picture INSIDE its file (rt/id3.js), read from the
// copy the phone keeps — no server, no network, the tag's bytes only — one song after another in the background,
// once per launch. A song with no picture shows the theme's material in its form instead.
const $covers = atom(gate ? { [FIXTURE_SONGS[0].id]: "/_rt/theme-lum.webp" } : {});   // id → object URL | "" (none)
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

// A shelf the edge confirmed: keep the phone in step with it and remember it for a start with no network.
function confirmed(list) {
  $songs.set(list);
  keep?.set(list);
  store?.saveShelf({ songs: list, usage: $usage.get() }).catch(() => {});
}

async function load() {
  if (loaded) return;
  loaded = true;
  store?.held().then((h) => $held.set(h)).catch(() => {});
  navigator.storage?.persist?.().catch(() => {});   // the user's own songs: ask the browser never to evict them
  try {
    const r = await fetch(`${VPS_PROXY}/library/list`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(20000) });
    if (!r.ok) { if (r.status === 401) { $songs.set([]); return; } report("list.fail", { status: r.status }); return offline(); }
    const j = await r.json();
    $usage.set({ count: j.count, bytes: j.bytes, maxFiles: j.maxFiles, maxBytes: j.maxBytes });
    confirmed(j.songs || []);
  } catch { offline(); }
}

// No shelf from the edge (no network, or the edge is down): the saved one, cut to the songs on the phone.
async function offline() {
  const saved = await store?.readShelf().catch(() => null);
  const held = await store?.held().catch(() => null);
  if (!saved || !held?.size) { $err.set("errList"); $songs.set([]); return; }
  $usage.set(saved.usage); $held.set(held);
  $songs.set(saved.songs.filter((s) => held.has(s.id)));
}

// A file share lands here (sh_files): every song is uploaded as it is, raw, on a sealed URL that carries the session.
let toastFn = null, tNow = null;
takeShared((s) => {
  const files = s.files || [];
  // the one place a phone's share can be seen from the edge: what arrived, before anything is judged
  report("share.in", { n: files.length, types: files.map((f) => f.type).slice(0, 5), sizes: files.map((f) => f.size).slice(0, 5), names: files.map((f) => String(f.name || "").slice(0, 40)).slice(0, 5), text: String(s.text || "").slice(0, 80) }, "info");
  for (const f of files) { if (isAudio(f)) upload(f); else toastFn?.(T(tNow, "skipped")); }
});

async function upload(f) {
  const k = `${Date.now()}-${f.name}`;
  $uploads.set([{ k, name: f.name, state: "up" }, ...$uploads.get()]);
  $err.set("");
  if (gate) { $uploads.set($uploads.get().filter((u) => u.k !== k)); return; }
  try {
    // RESUMABLE (tus, rt/task.js): 4 MB chunks; a dead zone costs a pause, the upload goes on from where it stood,
    // and a reload finds it again. A raw POST of the whole song under a 110 s abort lost it to any drop.
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
    // the file is already on the phone: kept as it is, never pulled back down
    if (store) await store.put(row.id, f).then(() => $held.set(new Set([...$held.get(), row.id])), () => {});
    confirmed([row, ...($songs.get() || [])]);
    $uploads.set($uploads.get().filter((x) => x.k !== k));
    toastFn?.(T(tNow, "uploaded"));
  } catch (e) { report("upload.throw", { err: String(e?.message || e).slice(0, 120), name: String(f.name || "").slice(0, 40), size: f.size }); $err.set("errUpload"); $uploads.set($uploads.get().map((u) => (u.k === k ? { ...u, state: "err" } : u))); }
}

// ── one element, the shelf as its queue ──────────────────────────────────────────────────────────────────
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
    // the copy on the phone first — no network, no data spent; the stream only for a song not kept yet
    const blob = await store.blob(id).catch(() => null);
    if (kept) URL.revokeObjectURL(kept);
    kept = blob ? URL.createObjectURL(blob) : "";
    a.src = kept || await sealedUrl("/library/get", { id }); $pos.set(0);
  }
  $cur.set(id);
  if (!hold) hold = holdAudio({ title: titleOf(s), artist: s.artist || "", onPlay: () => a.play(), onPause: () => a.pause(), onPrev: () => step(-1), onNext: () => step(1) });
  else hold.meta(titleOf(s));
  a.play().catch(() => $playing.set(false));
  if (breathing !== id) breatheSong(id);
  readyShare(s);   // so a tap on "share" can open the sheet inside the gesture
}

// ── the orb breathes with the song (core breath.js): the copy on the phone is read ONCE into a bass
// envelope, then the compositor plays it as a `scale` track pinned to the audio clock. A streamed song (no
// copy yet) holds still. Never an AnalyserNode — Web Audio in the playback path stops the song when iOS
// backgrounds the page.
let orbEl = null, breathing = "", unbreathe = () => {};
const IDLE = "Cookie9Sided";   // the orb's form before any song is chosen
const envs = new Map();
function stopBreath() { unbreathe(); unbreathe = () => {}; breathing = ""; }
async function breatheSong(id) {
  stopBreath();
  if (gate || !audio || !orbEl) return;
  let env = envs.get(id);
  if (!env) {
    const blob = await store.blob(id).catch(() => null);
    env = blob && await envelopeOfBlob(blob).catch(() => null);
    if (!env) return;
    envs.set(id, env);
  }
  if ($cur.get() !== id || !orbEl || breathing) return;
  unbreathe = breathe(orbEl, env, audio);
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

// RESUME — the last song and its second survive a reload (owner 2026-10-11: «запоминай останній трек та час, але
// енергоефективно … я часто перезагружаю апку і хочу щоб далі грало»; «багато ризиків що зломається, зроби в одному
// місці по інтервалу»). ONE writer: an interval every 5 s that does nothing unless a song is playing, and writes only
// when the whole second or the song changed — no listener on timeupdate, pause, unload or visibility to keep in step.
// ONE reader: the first shelf that holds the remembered song puts it back at that second and asks it to play; a
// browser that will not start sound before a tap leaves it paused right there, and the next ▶︎ continues from it.
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
  confirmed(($songs.get() || []).filter((x) => x.id !== s.id));   // the phone's copy goes with it
  toastFn?.(T(tNow, "deleted"));
}

// The other door in: a file picker. Same upload as a share — the picker is for a phone where the share sheet
// is not an option (iOS cannot share INTO a web app; the APK shell hands in text only).
// Share a LINK to the song's own public page, not the file (owner 2026-10-10: «ділитись не піснею, а лінкою на
// цей трек … без авторизації»). The edge gives the song a token once (`/library/link`) and serves, with no
// session, a page with a player for this one song plus everything a chat's link preview reads — the 1200×630
// card, and the mp4 Telegram plays inline (edge songpage.js / songcard.js). A file in a chat was a download; a
// link is the song, playable where it lands.
//
// The URL is made READY before the tap (when the song becomes current), and the tap calls share() with no await
// in front of it: Chrome consumes the gesture browser-side (ShareServiceImpl::Share → ConsumeTransientUserActivation)
// and answers "Permission denied" to a stale one — what a 6 MB read between the tap and share() did (2026-10-10).
// A browser with no share sheet (desktop) gets the link on the clipboard instead.
// One link PER SONG, remembered for the session, and one request per song in flight. It used to be a single
// { id, url } slot: switching songs let an older song's late answer overwrite the slot, and a request that timed
// out on a weak link failed silently — so the owner (2026-10-11) got «Готую посилання — натисни ще раз» on tap
// after tap. Every failure is reported now.
const links = new Map(), linking = new Map();   // song id → url · song id → the request
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
// A link not made yet is WAITED FOR, then shared — one tap, not two. If the wait outlived the tap's gesture the
// browser refuses the sheet ("Permission denied", seen 2026-10-10), and openShare copies the link instead.
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
      if (e?.name === "AbortError") return;   // the person closed the sheet
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
  const askDelete = (s) => confirm({ title: T(t, "delTitle"), body: T(t, "delBody"), verb: T(t, "delYes"), onConfirm: () => remove(s) });
  const picker = useRef();

  // THE ORB — the playing song's form, the theme's texture through it, its rim a light. The shaper flows it
  // into the next song's form (one-shot) and the clip follows the orb's measured size. Layout effects, so
  // the first paint already has the form (an unclipped square for one frame is exactly the box we left).
  const orb = useRef(), fill = useRef(), rim = useRef(), core = useRef(), form = useRef();
  useLayoutEffect(() => {
    let w = orb.current.offsetWidth, last = "";
    const lay = (d) => {
      last = d;
      if (w) fill.current.style.clipPath = `path("${scalePath(d, w)}")`;
      for (const p of rim.current.children) p.setAttribute("d", d);
    };
    form.current = shaper(shapeOf($cur.get() || IDLE), lay);
    const ro = new ResizeObserver(() => { const nw = orb.current?.offsetWidth || 0; if (nw !== w) { w = nw; if (last) lay(last); } });
    ro.observe(orb.current);
    orbEl = orb.current;
    if ($cur.get() && $playing.get()) breatheSong($cur.get());   // back from the other tab mid-song
    if ($cur.get()) readyShare(songOf($cur.get()));
    return () => { ro.disconnect(); form.current.stop(); if (orbEl === orb.current) { stopBreath(); orbEl = null; } };
  }, []);
  useLayoutEffect(() => { form.current?.to(shapeOf(cur || IDLE)); }, [cur]);

  const glyph = (id, on = false) => html`<svg aria-hidden="true" viewBox="0 0 1 1" class=${`fk-glyph ${on ? "on" : ""}`}><path d=${pathOf(shapeOf(id))} /></svg>`;

  // the mini orb rides above the dock once the player has scrolled away — one observer, one attribute
  // (owner 2026-10-10: the player lives in the body, the ONLY island is this one, after a scroll down)
  const [away, setAway] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setAway(e.intersectionRatio < 0.2), { threshold: [0, 0.2] });
    io.observe(core.current);
    return () => io.disconnect();
  }, []);
  const mini = away && !!now;
  const toOrb = () => core.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });

  return html`<div data-fonoteka data-playing=${playing ? "true" : null} data-songs=${songs ? songs.length : null} class="flex flex-col gap-[calc(var(--ms-gap)*2)] p-[var(--ms-pad)]">
    <section ref=${core} aria-label=${T(t, "now")} class="flex flex-col items-center gap-[var(--ms-gap)] pt-2 scroll-mt-[var(--hdr-h)]">
      <div ref=${orb} class="fk-orb" aria-hidden="true">
        <div ref=${fill} class="fk-fill"></div>
        <svg ref=${rim} class="fk-rim" viewBox="0 0 1 1"><path class="b1" /><path class="b2" /><path class="e" /></svg>
      </div>
      <${Transport} form locale=${locale} playing=${playing} onToggle=${toggle} disabled=${!songs?.length} className="w-full pt-1"
        onPrev=${() => step(-1)} onNext=${() => step(1)} pos=${pos} dur=${dur} onSeek=${seek} onScrub=${seek} repeat=${shownRepeat(repeat)} onRepeat=${flipRepeat}
        title=${now ? titleOf(now) : T(t, "nothing")} subtitle=${now ? (now.artist || clock(now.dur)) : ""}
        actions=${[{ id: "share", icon: "lucide:share-2", label: T(t, "aShare"), onClick: () => shareSong(now), disabled: !now, attr: { "data-share": true } }]} />
    </section>

    <section aria-labelledby="fk-shelf" class="flex flex-col gap-[var(--ms-gap)]">
      <div class="flex items-center justify-between gap-3">
        <h2 id="fk-shelf" class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-muted">${T(t, "songs")}</h2>
        ${/* a secondary action: a rim of light, not a second ink form competing with the play button */""}
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
          ${/* the song's own form fills with light from the bottom as the bytes go up */""}
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
      ${/* THE ALBUMS: every song a tile — its cover (or the theme's material) inside the song's own form, its rim lit
           while it plays, the name under it. Two columns on a phone, three on a wide screen. */""}
      <div data-albums class="fk-grid ms-stagger grid gap-x-[var(--ms-gap)] gap-y-5">
        ${songs === null ? [0, 1, 2, 3].map((i) => html`<div key=${i} class="flex flex-col gap-2"><div class="skeleton aspect-square rounded-full"></div><div class="skeleton h-3.5 w-2/3"></div></div>`)
          : songs.map((s, i) => {
            const on = cur === s.id, f = shapeOf(s.id), cov = covers[s.id];
            return html`<div key=${s.id} data-song=${s.id} data-cover=${cov ? "true" : null} style=${`--i:${Math.min(i, 14)}`} class="flex flex-col gap-2 min-w-0">
              <button data-play=${s.id} aria-pressed=${on ? "true" : "false"} aria-label=${`${T(t, "aPlay")}: ${titleOf(s)}`} onClick=${() => (on ? toggle() : play(s.id))} class="fk-album ms-press">
                <span class="fk-art" style=${`clip-path:url(#fk-c-${f})`}>${cov ? html`<img src=${cov} alt="" decoding="async" />` : null}</span>
                <svg aria-hidden="true" class="fk-arim" viewBox="0 0 1 1"><path d=${pathOf(f)} /></svg>
                ${on ? html`<span class="fk-now" aria-hidden="true">${Icon(playing ? "lucide:audio-lines" : "lucide:play", "text-xl")}</span>` : null}
              </button>
              <div class="flex items-start gap-1 min-w-0">
                <div class="min-w-0 flex-1 px-0.5">
                  <div class=${`font-semibold text-sm leading-snug line-clamp-2 ${on ? "text-[var(--app-accent)]" : ""}`}>${titleOf(s)}</div>
                  <div class="font-mono text-xs tabular-nums text-muted truncate mt-0.5">${songLine(s, clock)}</div>
                </div>
                <button data-del=${s.id} data-haptic="bump" aria-label=${`${T(t, "aDelete")}: ${titleOf(s)}`} onClick=${() => askDelete(s)}
                  class="btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 -mt-2 -mr-2 text-muted">${Icon("lucide:trash-2", "text-base")}</button>
              </div>
            </div>`;
          })}
      </div>
      <svg aria-hidden="true" width="0" height="0" class="absolute"><defs>${[...new Set((songs || []).map((s) => shapeOf(s.id)))].map((n) => html`<clipPath key=${n} id=${`fk-c-${n}`} clipPathUnits="objectBoundingBox"><path d=${pathOf(n)} /></clipPath>`)}</defs></svg>
    </section>

    <input ref=${picker} data-picker type="file" accept="audio/*,.mp3,.m4a,.ogg,.opus,.wav,.flac" multiple class="hidden" onChange=${(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
    ${/* the island is the kit's MiniPlayer now (owner 2026-10-11: «заливкою анімованою трек часу пісні і перемотка,
         щоб не скролити до верху … винести зробити системним»): its fill is the song's time, a drag across it seeks */""}
    <${MiniPlayer} show=${mini} title=${now ? titleOf(now) : ""} glyph=${now ? glyph(now.id, true) : null} playing=${playing} onToggle=${toggle}
      pos=${pos} dur=${dur} onSeek=${seek} onScrub=${seek} onOpen=${toOrb} openLabel=${now ? `${T(t, "now")}: ${titleOf(now)}` : T(t, "now")} locale=${locale} />
  </div>`;
}
