import { html } from "htm/preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { Panel, Transport } from "/_rt/ui.js";
import { takeShared, firstLink } from "/_rt/share.js";
import { advance } from "/_rt/player.js";
import { holdAudio } from "/_rt/mediasession.js";
import { sealedUrl } from "/_rt/sealedfetch.js";
import { authWall } from "/_rt/authwall.js";
import { shapeOf, scalePath, shaper } from "/_rt/shape.js";
import { videoId, clock, byline, errorKey, FIXTURE_LINK, FIXTURE_META, FIXTURE_LIKES } from "/_rt/muzak.js";
import { taskCall } from "/_rt/task.js";
import { openOutside } from "/_rt/tma.js";
import { session, restore } from "/_rt/auth.js";

// MUZAK is a PLAYER (owner 2026-10-11): a song from a link or from the person's YouTube likes is LISTENED to here,
// kept in Fonoteka, shared as a Muzak link, or handed to Remix for a mix. There is no download button — «за це
// можуть по шапці надавати». The sound is made on the edge from the song's id (/feed/library/play, a sealed
// <audio src> carrying the session), so listening needs a sign-in, like Fonoteka.

const Icon = (icon, cls = "") => html`<iconify-icon icon=${icon} class=${cls}></iconify-icon>`;
const $link = atom(gate ? FIXTURE_LINK : "");
const $meta = atom(gate ? FIXTURE_META : null);
const $busy = atom("");        // "" | "meta"
const $err = atom("");
let seq = 0;
// A link shared from another app (the OS share sheet, spec.share) is the whole gesture: it lands in the field and is looked up at once.
takeShared((s) => { const link = firstLink(s) || String(s.text || "").trim(); if (link) { $link.set(link); find(link); } });

// A Muzak link someone shared (`/muzak/?v=<id>`, see share() below) opens that song's card; the word leaves the address.
try {
  const u = new URL(location.href), v = u.searchParams.get("v");
  if (v && /^[\w-]{11}$/.test(v) && !gate) {
    u.searchParams.delete("v");
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    const link = `https://music.youtube.com/watch?v=${v}`;
    $link.set(link); find(link);
  }
} catch { }

async function find(link) {
  const id = videoId(link);
  if (!id) { $err.set("errLink"); $meta.set(null); return; }
  const my = ++seq;
  $err.set(""); $busy.set("meta");
  if (gate) { $meta.set(FIXTURE_META); $busy.set(""); return; }
  try {
    const r = await fetch(`${VPS_PROXY}/music/meta?url=${encodeURIComponent(link)}`, { signal: AbortSignal.timeout(40000) });
    if (my !== seq) return;
    if (!r.ok) { $meta.set(null); const k = errorKey(r.status); if (k) $err.set(k); return; }
    $meta.set(await r.json());
  } catch { if (my === seq) { $meta.set(null); $err.set("errMeta"); } }
  finally { if (my === seq) $busy.set(""); }
}

// the song card's meta in the list's shape — the one shape the player, keep, share and mix take
const songOfMeta = (m, link) => ({ id: m.id, title: m.title, artist: m.artist || "", dur: m.duration || 0, cover: m.cover || null, url: link || `https://music.youtube.com/watch?v=${m.id}` });

// ── the player: ONE <audio>, the queue it walks ──────────────────────────────────────────────────────────────
// The queue is whatever the person pressed play in: the likes list, or the one song of the song tab.
const $q = atom(gate ? FIXTURE_LIKES.songs : []);
const $cur = atom("");
const $playing = atom(false), $loading = atom(false);
const $pos = atom(0), $dur = atom(0);
let audio = null, hold = null;
const curSong = () => $q.get().find((s) => s.id === $cur.get()) || null;

function ensure() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.addEventListener("timeupdate", () => $pos.set(Math.round(audio.currentTime * 1000)));
  audio.addEventListener("durationchange", () => { if (Number.isFinite(audio.duration)) $dur.set(Math.round(audio.duration * 1000)); });
  audio.addEventListener("play", () => { $playing.set(true); hold?.setPlaying(); });
  audio.addEventListener("pause", () => { $playing.set(false); hold?.setPaused(); });
  audio.addEventListener("waiting", () => $loading.set(true));
  audio.addEventListener("playing", () => { $loading.set(false); warmNext(); });
  audio.addEventListener("ended", () => step(1, false));
  audio.addEventListener("error", () => { if (!audio.getAttribute("src")) return; $loading.set(false); $playing.set(false); $err.set("errPlay"); });
  return audio;
}

async function play(s, queue) {
  if (!s) return;
  if (queue) $q.set(queue);
  if (!gate && !session.get()) { authWall.set(authWall.get() + 1); return; }   // the sound carries the session: sign in first
  $err.set("");
  const was = $cur.get();
  $cur.set(s.id);
  if (gate) { $playing.set(true); $dur.set((s.dur || 0) * 1000); return; }
  const a = ensure();
  if (was !== s.id || !a.getAttribute("src")) {
    $loading.set(true); $pos.set(0); $dur.set((s.dur || 0) * 1000);
    a.src = await sealedUrl("/library/play", { v: s.id });
  }
  if (!hold) hold = holdAudio({ title: s.title, artist: s.artist, onPlay: () => a.play(), onPause: () => a.pause(), onPrev: () => step(-1), onNext: () => step(1) });
  else hold.meta(s.title);
  a.play().catch(() => { $playing.set(false); });
}
function toggle(s, queue) {
  if (s && $cur.get() !== s.id) return play(s, queue);
  if ($playing.get()) { if (gate) $playing.set(false); else audio?.pause(); return; }
  play(s || curSong() || $q.get()[0]);
}
function step(dir, manual = true) {
  const q = $q.get();
  const next = advance(q.findIndex((s) => s.id === $cur.get()), q.length, { step: dir, repeat: "all", manual });
  if (next >= 0) play(q[next]);
}
function seek(ms) { if (audio && !gate) audio.currentTime = ms / 1000; $pos.set(ms); }
// the NEXT song is made on the edge while this one plays, so the queue never waits for a first listen
function warmNext() {
  const q = $q.get(), i = q.findIndex((s) => s.id === $cur.get());
  const n = q.length > 1 ? q[(i + 1) % q.length] : null;
  if (n && !gate) fetch(`${VPS_PROXY}/library/warm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ v: n.id }) }).catch(() => {});
}

// ── what a song can do besides play ─────────────────────────────────────────────────────────────────────────
// «У Фонотеку» — the edge puts the song on the person's shelf itself (library.js keep; a song just listened to is
// copied from the play cache, not fetched again). Per song, so the list and the card agree.
const $kept = atom({});   // id → "busy" | "done"
async function keep(s, toast, t) {
  if ($kept.get()[s.id]) return;
  $kept.set({ ...$kept.get(), [s.id]: "busy" }); $err.set("");
  try {
    if (!gate) await taskCall("/library/keeptask", { url: s.url });   // a task: the shelf fills whatever the link does
    $kept.set({ ...$kept.get(), [s.id]: "done" }); toast?.(T(t, "kept"));
  } catch { const k = { ...$kept.get() }; delete k[s.id]; $kept.set(k); $err.set("errKeep"); }
}

// «Поділитися» — a MUZAK link (owner 2026-10-11), not a file: whoever opens it lands on the song's card here and
// can listen, keep or mix. The URL is ready before the tap, so share() runs inside the gesture.
function share(s, toast, t) {
  const url = `${location.origin}/muzak/?v=${s.id}`;
  const data = { title: [s.artist, s.title].filter(Boolean).join(" — "), url };
  const copy = () => navigator.clipboard?.writeText(url).then(() => toast?.(T(t, "shareCopied")), () => toast?.(T(t, "shareFail")));
  if (gate || !navigator.share || !navigator.canShare?.(data)) { copy(); return; }
  navigator.share(data).catch((e) => { if (e?.name !== "AbortError") copy(); });
}

// «Мікс» — Remix takes a song the way any app hands it one: a shared link, looked up the moment it lands.
function mix(s) { if (!gate) location.assign(`/remix/?sh_text=${encodeURIComponent(s.url)}`); }

const actionsFor = (s, kept, t, toast) => [
  { id: "keep", icon: kept === "done" ? "lucide:library-big" : "lucide:library", label: T(t, kept === "done" ? "keptA" : "aKeep"), onClick: () => keep(s, toast, t), active: kept === "done", pulse: kept === "busy", disabled: kept === "busy", attr: { "data-keep": s.id } },
  { id: "share", icon: "lucide:share-2", label: T(t, "aShare"), onClick: () => share(s, toast, t), attr: { "data-share": s.id } },
  { id: "mix", icon: "lucide:sparkles", label: T(t, "aMix"), onClick: () => mix(s), attr: { "data-mix": s.id } },
];

// ── tab «Пісня»: a link → the song's card → listen ───────────────────────────────────────────────────────────
export function muzak({ S, toast }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const link = useStore($link), meta = useStore($meta), busy = useStore($busy), err = useStore($err);
  const cur = useStore($cur), playing = useStore($playing), loading = useStore($loading), pos = useStore($pos), dur = useStore($dur), kept = useStore($kept);
  const input = useRef();
  useEffect(() => { if (!gate && !meta) input.current?.focus(); }, []);
  useEffect(() => { if (!gate) restore().catch(() => {}); }, []);   // the session is restored lazily in the runtime; listening needs it

  const paste = async () => {
    try { const text = (await navigator.clipboard.readText()).trim(); if (text) { $link.set(text); find(text); } } catch { input.current?.focus(); }
  };
  const song = meta ? songOfMeta(meta, link) : null;
  const on = !!song && cur === song.id;

  return html`<div data-muzak data-busy=${busy || null} data-song=${meta ? meta.id : null} data-playing=${on && playing ? "true" : null} class="flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]">
    <${Panel} title=${T(t, "link")}>
      <form class="flex items-center gap-2" onSubmit=${(e) => { e.preventDefault(); find(link); }}>
        <textarea rows="1" data-line ref=${input} data-link inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"
          class="input input-bordered sf-inset min-w-0 flex-1 font-mono text-sm"
          placeholder=${T(t, "linkPlaceholder")} value=${link}
          onInput=${(e) => { $link.set(e.target.value); if ($err.get()) $err.set(""); }}></textarea>
        <button type="button" data-paste aria-label=${T(t, "aPaste")} onClick=${paste}
          class="btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 text-base-content/70">${Icon("lucide:clipboard-paste", "text-[length:var(--ms-icon)]")}</button>
        <button type="submit" data-find aria-label=${T(t, "aFind")} disabled=${!link || busy === "meta"}
          class="btn btn-primary btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 sf-e3">${Icon("lucide:search", "text-[length:var(--ms-icon)]")}</button>
      </form>
      ${err ? html`<div data-err role="alert" class="text-sm text-error">${T(t, err)}</div>` : null}
    <//>

    ${busy === "meta" ? html`<${Panel} title=${T(t, "song")}>
      <div class="flex gap-[var(--ms-gap)] items-start">
        <div class="skeleton w-28 h-28 shrink-0 rounded-[var(--ms-r-in)]"></div>
        <div class="flex-1 flex flex-col gap-2 pt-1"><div class="skeleton h-5 w-3/4"></div><div class="skeleton h-4 w-1/2"></div><div class="skeleton h-4 w-16"></div></div>
      </div>
    <//>` : song ? html`<${Panel} title=${T(t, "song")}>
      <div class="flex gap-[var(--ms-gap)] items-start">
        <div data-cover class="relative w-28 h-28 shrink-0 rounded-[var(--ms-r-in)] overflow-hidden sf-raised sf-e2 bg-base-200 flex items-center justify-center text-base-content/40">
          ${Icon("lucide:music-2", "text-3xl")}
          ${meta.cover ? html`<img src=${meta.cover} alt="" class="absolute inset-0 w-full h-full object-cover" onError=${(e) => { e.target.remove(); }} />` : null}
        </div>
        <div class="min-w-0 flex-1 flex flex-col gap-1">
          <div data-song-title class="font-semibold text-[length:var(--ms-title)] leading-tight break-words">${meta.title}</div>
          <div class="text-sm text-base-content/70 leading-snug break-words">${byline(meta)}</div>
          <div class="font-mono text-xs tabular-nums text-base-content/70">${clock(meta.duration)}</div>
        </div>
      </div>
      ${/* before the first listen: one wide «Слухати» and the song's tools; once it is the current song, the
           player takes that row — play/pause, seek and the same tools — so there is never a second pause button */""}
      ${on ? html`<div class="flex flex-col gap-1">
        ${loading ? html`<div data-preparing role="status" class="text-xs text-base-content/70 animate-pulse">${T(t, "preparing")}</div>` : null}
        <${Transport} size="sm" locale=${locale} playing=${playing} onToggle=${() => toggle()} pos=${pos} dur=${dur} onSeek=${seek} onScrub=${seek}
          actions=${actionsFor(song, kept[song.id], t, toast)} />
      </div>` : html`<div class="flex items-center gap-1">
        <button data-listen onClick=${() => toggle(song, [song])}
          class="btn btn-primary flex-1 min-w-0 h-[var(--ms-ctl)] min-h-0 gap-2 sf-e3">
          ${Icon("lucide:play", "text-[length:var(--ms-icon)]")}<span>${T(t, "listen")}</span>
        </button>
        ${actionsFor(song, kept[song.id], t, toast).map((a) => html`<button key=${a.id} ...${a.attr} aria-label=${a.label} disabled=${a.disabled} onClick=${a.onClick}
          class=${`btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ${a.active ? "text-primary" : "text-base-content/70"} ${a.pulse ? "animate-pulse" : ""}`}>${Icon(a.icon, "text-[length:var(--ms-icon)]")}</button>`)}
      </div>`}
    <//>` : null}
  </div>`;
}

// ── tab «Вподобане»: the songs a person liked on YouTube (edge yt.js), played here ──────────────────────────────
// Owner 2026-10-10/11: any Google account, the liked songs as a list; the list reads on by itself as it scrolls.
const $likes = atom(gate ? FIXTURE_LIKES : null);   // null = not read | { connected: false[, expired] } | { connected, channel, songs, next }
const $lBusy = atom("");                            // "" | "list" | "more" | "connect"
const $lErr = atom("");
let back = false;                                   // the connect left for another app (Telegram, the APK's browser)

// Google returns the person to /muzak/?tab=likes&yt=ok|denied|fail: the word is read once and taken off the address.
try {
  const u = new URL(location.href), k = u.searchParams.get("yt");
  if (k) {
    if (k !== "ok") $lErr.set(k === "denied" ? "ytDenied" : "ytFail");
    u.searchParams.delete("yt");
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  }
} catch { }

const yt = (route, body = {}) => fetch(`${VPS_PROXY}/google/yt/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
const ytErr = async (r) => ((await r.json().catch(() => ({}))).error === "quota" ? "errQuota" : "errLikes");

async function readLikes(more = false) {
  if (gate || $lBusy.get()) return;
  const was = more ? $likes.get() : null;
  if (more && !was?.next) return;
  $lBusy.set(more ? "more" : "list");
  try {
    let songs = was?.songs || [], page = was?.next || "", j = null;
    // 50 likes can hold no song at all (vlogs, hour-long mixes): a read goes on until it has something new
    for (let i = 0; i < 4; i++) {
      const r = await yt("likes", page ? { page } : {});
      if (!r.ok) { if (r.status === 401) $likes.set({ connected: false }); else $lErr.set(await ytErr(r)); return; }
      j = await r.json();
      if (!j.connected) { $likes.set(j); return; }
      const seen = new Set(songs.map((s) => s.id));
      songs = [...songs, ...j.songs.filter((s) => !seen.has(s.id))];
      page = j.next || "";
      if (songs.length > (was?.songs.length || 0) || !page) break;
    }
    $likes.set({ ...j, songs, next: page || null });
    if (more && $q.get() === was.songs) $q.set(songs);   // the player was walking this list: it walks on into the new songs
  } catch { $lErr.set("errLikes"); }
  finally { $lBusy.set(""); }
}

async function connect() {
  if (gate || $lBusy.get()) return;
  $lErr.set(""); $lBusy.set("connect");
  try {
    const r = await yt("start");
    if (!r.ok) { if (r.status !== 401) $lErr.set("ytFail"); return; }   // 401: the runtime's sign-in wall is already up
    back = openOutside((await r.json()).url) !== "page";
  } catch { $lErr.set("ytFail"); }
  finally { $lBusy.set(""); }
}

async function disconnect(toast, t) {
  if (!gate) { const r = await yt("revoke").catch(() => null); if (!r?.ok) { $lErr.set("errLikes"); return; } }
  $likes.set({ connected: false });
  toast?.(T(t, "ytOff"));
}

// THE ORB — the playing song's cover through the song's own form; it flows into the next song's form (core shaper,
// one-shot) and the clip follows the orb's measured size. Layout effects, so the first paint already has the form.
const IDLE = "Cookie9Sided";
function Orb({ song }) {
  const orb = useRef(), fill = useRef(), rim = useRef(), form = useRef();
  useLayoutEffect(() => {
    let w = orb.current.offsetWidth, last = "";
    const lay = (d) => {
      last = d;
      if (w) fill.current.style.clipPath = `path("${scalePath(d, w)}")`;
      for (const p of rim.current.children) p.setAttribute("d", d);
    };
    form.current = shaper(shapeOf(song?.id || IDLE), lay);
    const ro = new ResizeObserver(() => { const nw = orb.current?.offsetWidth || 0; if (nw !== w) { w = nw; if (last) lay(last); } });
    ro.observe(orb.current);
    return () => { ro.disconnect(); form.current.stop(); };
  }, []);
  useLayoutEffect(() => { form.current?.to(shapeOf(song?.id || IDLE)); }, [song?.id]);
  return html`<div ref=${orb} class="mz-orb" aria-hidden="true">
    <div ref=${fill} class="mz-fill">${song?.cover ? html`<img key=${song.id} src=${song.cover} alt="" onError=${(e) => { e.target.remove(); }} />` : null}</div>
    <svg ref=${rim} class="mz-rim" viewBox="0 0 1 1"><path class="b1" /><path class="b2" /><path class="e" /></svg>
  </div>`;
}

export function likes({ S, toast, confirm }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const sid = useStore(session)?.sid || "";
  const l = useStore($likes), busy = useStore($lBusy), err = useStore($lErr), playErr = useStore($err);
  const q = useStore($q), cur = useStore($cur), playing = useStore($playing), loading = useStore($loading), pos = useStore($pos), dur = useStore($dur), kept = useStore($kept);
  // the session is restored lazily in the runtime (the account card does it); this tab needs it at once, and a
  // signed-out restore spends no network. Signing in later (the wall a connect tap raises) re-reads through `sid`.
  useEffect(() => { if (!gate) restore().then((s) => { if (!s) $likes.set({ connected: false }); }).catch(() => {}); }, []);
  useEffect(() => { if (sid && !gate) readLikes(); }, [sid]);   // the sid, not the object: restore sets it twice (cached, then revalidated)
  // back from Telegram's browser or the APK's: the grant was made over there, so read the list again here
  useEffect(() => {
    const on = () => { if (back && document.visibilityState === "visible") { back = false; readLikes(); } };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  // INFINITE SCROLL (owner 2026-10-11): a sentinel under the list reads the next page as it comes into view. The
  // observer is made again whenever the list grows, so a page too short to scroll still pulls the next one.
  const tail = useRef();
  const songs = l?.connected ? l.songs : [];
  useEffect(() => {
    if (!tail.current || !l?.next) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) readLikes(true); }, { rootMargin: "0px 0px 600px 0px" });
    io.observe(tail.current);
    return () => io.disconnect();
  }, [l?.next, songs.length]);

  const askOff = () => confirm({ title: T(t, "offTitle"), body: T(t, "offBody"), verb: T(t, "offYes"), onConfirm: () => disconnect(toast, t) });
  const on = !!l?.connected;
  const reading = !gate && !!sid && l === null;
  const now = q.find((s) => s.id === cur) || null;
  const shown = now || songs[0] || null;   // the player names the first song before anything has played

  return html`<div data-likes data-connected=${on ? "true" : l ? "false" : null} data-songs=${on ? songs.length : null} data-playing=${playing ? "true" : null} data-loading=${loading ? "true" : null}
    class="flex flex-col gap-[calc(var(--ms-gap)*2)] p-[var(--ms-pad)]">
    ${err || playErr ? html`<div data-err role="alert" class="text-sm text-error">${T(t, err || playErr)}</div>` : null}

    ${reading ? [0, 1, 2, 3].map((i) => html`<div key=${i} class="flex items-center gap-3 px-1 py-1.5"><div class="skeleton w-12 h-12 shrink-0 rounded-[var(--ms-r-in)]"></div><div class="flex-1 flex flex-col gap-1.5"><div class="skeleton h-3.5 w-2/3"></div><div class="skeleton h-3 w-1/3"></div></div></div>`)

    : !on ? html`<${Panel} title=${T(t, "likesTitle")}>
      <div data-connect class="flex flex-col gap-3">
        <p class="text-sm leading-relaxed text-base-content/80">${T(t, l?.expired ? "ytExpired" : "connectBody")}</p>
        <button data-yt-connect disabled=${busy === "connect"} onClick=${connect}
          class=${`btn btn-primary w-full h-[var(--ms-ctl)] min-h-0 gap-2 sf-e3 ${busy === "connect" ? "animate-pulse" : ""}`}>
          ${Icon("lucide:heart", "text-[length:var(--ms-icon)]")}<span>${T(t, busy === "connect" ? "connecting" : "connect")}</span>
        </button>
        <p class="text-xs leading-relaxed text-base-content/70">${T(t, "connectNote")}</p>
      </div>
    <//>`

    : html`${songs.length ? html`<section data-player aria-label=${T(t, "now")} class="flex flex-col items-center gap-[var(--ms-gap)] pt-2">
        <${Orb} song=${now} />
        <${Transport} form locale=${locale} playing=${playing} onToggle=${() => toggle(now ? null : songs[0], now ? null : songs)} className="w-full pt-1"
          onPrev=${() => step(-1)} onNext=${() => step(1)} pos=${pos} dur=${dur} onSeek=${seek} onScrub=${seek} disabled=${!songs.length}
          title=${shown ? shown.title : ""} subtitle=${now && loading ? T(t, "preparing") : shown ? [shown.artist, clock(shown.dur)].filter(Boolean).join(" · ") : ""}
          actions=${shown ? actionsFor(shown, kept[shown.id], t, toast) : []} />
      </section>` : null}

      <section aria-labelledby="mz-likes" class="flex flex-col gap-[var(--ms-gap)]">
        <div class="flex items-center justify-between gap-3">
          <h2 id="mz-likes" class="min-w-0 truncate font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70">${l.channel ? T(t, "ytAs", { name: l.channel }) : T(t, "likesTitle")}</h2>
          <button data-yt-off onClick=${askOff} class="btn btn-ghost btn-sm shrink-0 min-h-0 h-8 px-2 text-xs font-normal text-base-content/70">${T(t, "ytOffBtn")}</button>
        </div>
        <div class="flex flex-col gap-1">
          ${songs.map((s) => {
            const here = cur === s.id, k = kept[s.id];
            return html`<div key=${s.id} data-like=${s.id} class="mz-row flex items-center gap-1">
              <button data-play=${s.id} aria-pressed=${here ? "true" : "false"} aria-label=${`${T(t, "aPlay")}: ${s.title}`} onClick=${() => toggle(s, songs)}
                class="flex-1 min-w-0 flex items-center gap-3 text-left px-1 py-1.5 min-h-0 rounded-[var(--ms-r-in)] ms-press">
                <span class="mz-cover sf-raised bg-base-200 flex items-center justify-center text-base-content/40">
                  ${Icon(here && playing ? "lucide:audio-lines" : "lucide:music-2", "text-lg")}
                  ${s.cover ? html`<img src=${s.cover} alt="" loading="lazy" class=${`absolute inset-0 w-full h-full object-cover ${here && playing ? "opacity-60" : ""}`} onError=${(e) => { e.target.remove(); }} />` : null}
                </span>
                <span class="min-w-0 flex-1 flex flex-col leading-tight gap-0.5">
                  <span class=${`font-semibold text-sm truncate ${here ? "text-primary" : ""}`}>${s.title}</span>
                  <span class="text-xs text-base-content/70 truncate">${s.artist}<span class="font-mono tabular-nums"> · ${clock(s.dur)}</span></span>
                </span>
              </button>
              <button data-keep=${s.id} aria-label=${T(t, k === "done" ? "keptA" : "aKeep")} disabled=${k === "busy"} onClick=${() => keep(s, toast, t)}
                class=${`btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ${k === "done" ? "text-primary" : "text-base-content/70"} ${k === "busy" ? "animate-pulse" : ""}`}>${Icon(k === "done" ? "lucide:library-big" : "lucide:library", "text-[length:var(--ms-icon)]")}</button>
            </div>`;
          })}
          ${busy === "more" ? [0, 1].map((i) => html`<div key=${"m" + i} class="flex items-center gap-3 px-1 py-1.5"><div class="skeleton w-12 h-12 shrink-0 rounded-[var(--ms-r-in)]"></div><div class="flex-1 flex flex-col gap-1.5"><div class="skeleton h-3.5 w-2/3"></div><div class="skeleton h-3 w-1/3"></div></div></div>`) : null}
        </div>
        ${l.next ? html`<div ref=${tail} data-tail aria-hidden="true" class="h-px"></div>` : null}
        ${!songs.length ? html`<div data-none class="py-6 flex flex-col items-center gap-1 text-center">
          <div class="font-semibold text-sm">${T(t, "likesEmpty")}</div><div class="text-sm text-base-content/70">${T(t, "likesEmptyHint")}</div>
        </div>` : null}
      </section>`}
  </div>`;
}
