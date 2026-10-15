import { html } from "htm/preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { Panel, Transport, Sheet } from "/_rt/ui.js";
import { takeShared, firstLink } from "/_rt/share.js";
import { advance } from "/_rt/player.js";
import { holdAudio } from "/_rt/mediasession.js";
import { sealedUrl } from "/_rt/sealedfetch.js";
import { authWall } from "/_rt/authwall.js";
import { shapeOf, scalePath, shaper } from "/_rt/shape.js";
import { videoId, clock, byline, errorKey, songOfFound, mixRadios, FIXTURE_LINK, FIXTURE_META, FIXTURE_LIKES, FIXTURE_QUERY, FIXTURE_SEARCH, FIXTURE_RADIO } from "/_rt/muzak.js";
import { taskOne, taskCall } from "/_rt/task.js";
import { session, restore } from "/_rt/auth.js";
import { useLikes, connect, $lBusy, LikesConnect, LikesHead, LikeRow, LikesSkeleton } from "/_rt/ytlikes.js";

// MUZAK is a PLAYER (owner 2026-10-11): a song from a link or from the person's YouTube likes is LISTENED to here,
// kept in Fonoteka, shared as a Muzak link, handed to Remix for a mix, or downloaded as an mp3. The sound is made on the edge from the song's id (/feed/library/play, a sealed
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
// ONE SONG ON A LOOP or on through the list (owner 2026-10-11: «я слухаю їх як медитацію по колу в основному»):
// two modes, not the kit's three — "off" would stop at the end of the list, which nobody here asked for. The
// choice is remembered; advance() replays the song when it ENDS under "one", and ▶︎▶︎ still moves on.
const $repeat = persistentAtom("muzak:repeat", "all");
const flipRepeat = () => $repeat.set($repeat.get() === "one" ? "all" : "one");
// what the button SHOWS: "on through the list" is the quiet default (the plain glyph, unlit), the loop is the lit
// repeat-1 — the kit lights "all" too, and two lit states told apart by a tiny "1" read as one state on a phone
const shownRepeat = (r) => (r === "one" ? "one" : "off");
const curSong =() => $q.get().find((s) => s.id === $cur.get()) || null;

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
  const next = advance(q.findIndex((s) => s.id === $cur.get()), q.length, { step: dir, repeat: $repeat.get(), manual });
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

// «Мікс» (owner 2026-10-11: «напроти кожної пісні кнопку мікс — одразу 2 версії slowed та deep slowed рендеряться і
// додаються в фонотеку»). Both versions are made on the edge straight onto the shelf — the same keeptask «У Фонотеку»
// uses, with Remix's own presets (`v`) — side by side; the phone holds nothing and can leave the screen. Per song,
// so the list, the card and the player agree. It used to open Remix with the link; Remix is still one tap away there.
const MIX = ["slowed", "deep"];
const $mixed = atom({});   // id → "busy" | "done"
async function mix(s, toast, t) {
  if ($mixed.get()[s.id]) return;
  $mixed.set({ ...$mixed.get(), [s.id]: "busy" }); $err.set("");
  toast?.(T(t, "mixing"));
  const done = gate ? MIX.length
    : (await Promise.allSettled(MIX.map((v) => taskCall("/library/keeptask", { url: s.url, v })))).filter((r) => r.status === "fulfilled").length;
  if (!done) { const m = { ...$mixed.get() }; delete m[s.id]; $mixed.set(m); $err.set("errMix"); return; }
  $mixed.set({ ...$mixed.get(), [s.id]: "done" });
  toast?.(T(t, done === MIX.length ? "mixed" : "mixedPart"));
}

// «Скачати» — back by the owner's word (2026-10-11: «тоді поверни скачування», once the YouTube scope was settled
// to stay unverified). The mp3 is a TASK on the edge (rt/task.js, the weak-link transport): yt-dlp runs to the end,
// the file arrives by byte range, then it is saved through an <a download>. One song is prepared at a time.
const $dl = atom("");   // the id of the ONE song being prepared
async function mp3(s) {
  const r = await taskOne("/music/filetask", { url: s.url });
  if (r.status !== "done") return false;
  const name = `${[s.artist, s.title].filter(Boolean).join(" - ") || s.id}.mp3`.replace(/[\\/:*?"<>|]/g, "");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(r.blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return true;
}
async function save(s, toast, t) {
  if ($dl.get()) return;
  $dl.set(s.id); $err.set("");
  try {
    if (!gate && !(await mp3(s))) { $err.set("errFile"); return; }
    toast?.(T(t, "saved"));
  } catch (e) { $err.set(e?.status === 429 ? "errBusy" : "errFile"); }
  finally { $dl.set(""); }
}

// «Радіо» (owner 2026-10-15: «напроти кожного треку … кнопку радіо — шукаємо схожі, як ми робимо підбірки по
// лайкам»): the song's own YouTube Music radio (/feed/music/radio, the route «Для тебе» is made of). Like YouTube
// Music's «Start radio»: the song plays at once (or plays on, if it already was), the ~50 songs like it line up
// behind it in the queue, and the person is taken to the «Радіо» tab, which lists them (owner 2026-10-15: «зроби
// окрему табу під радіо і на неї перекидуй завжди з треком» — a radio section on every tab got in the way).
// null · { seed, songs: null (being read) | [seed, …like it], err } — under the gate a radio stands, so the tab and
// its store capture show the populated screen
const radioOf = (seed, like) => ({ seed, songs: [seed, ...mixRadios([like.map(songOfFound)], [seed.id])], err: "" });
const $radio = atom(gate ? radioOf(FIXTURE_LIKES.songs[2], FIXTURE_RADIO.songs) : null);
let radioSeq = 0;
async function tune(s, S) {
  const my = ++radioSeq;
  $radio.set({ seed: s, songs: null, err: "" });
  if ($cur.get() !== s.id) play(s, [s]);   // inside the tap: the sound starts while the radio is read
  S.tab.set("radio");
  const hl = document.documentElement.lang === "en" ? "en" : "uk";
  try {
    const like = gate ? FIXTURE_RADIO.songs : await fetch(`${VPS_PROXY}/music/radio?v=${s.id}&hl=${hl}`, { signal: AbortSignal.timeout(30000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((j) => j.songs || []);
    if (my !== radioSeq) return;
    const r = radioOf(s, like);
    $radio.set(r);
    if ($cur.get() === s.id) $q.set(r.songs);   // the seed is still what plays: the queue walks on into its radio
  } catch (e) { if (my === radioSeq && e !== 401) $radio.set({ seed: s, songs: null, err: e === 429 ? "errBusy" : "errRadio" }); else if (my === radioSeq) $radio.set(null); }   // 401: the runtime's sign-in wall
}

// «⋯» (owner 2026-10-15: «у фонотеку та скачати за трьома кнопками меню»): a song's quiet tools — «У Фонотеку»
// and «Скачати» — live in one sheet, so beside a song stay «Мікс», «Радіо» and the dots. The sheet is the
// routing atom's (S.screen "more"), so Back closes it; $menu holds which song it is for.
const $menu = atom(null);
const openMore = (S, s) => { $menu.set(s); S.screen.set("more"); };
// the dots pulse while the song's keep or mp3 runs, as their own buttons did before they moved into the sheet
const moreBusy = (s, st) => st.kept[s.id] === "busy" || st.dl === s.id;

// a song's tools beside its play control: `st` = { S, t, toast, kept, mixed, dl, rad } — the stores each view reads
const actionsFor = (s, st) => {
  const { S, t, toast } = st, mx = st.mixed[s.id];
  return [
    { id: "share", icon: "lucide:share-2", label: T(t, "aShare"), onClick: () => share(s, toast, t), attr: { "data-share": s.id } },
    // the record, not sparkles: sparkles read as "AI" (owner 2026-10-15), and a mix is a song played another way
    { id: "mix", icon: "lucide:disc-3", label: `${T(t, mx === "done" ? "mixedA" : "aMix")}: ${s.title}`, onClick: () => mix(s, toast, t), active: mx === "done", pulse: mx === "busy", disabled: mx === "busy", attr: { "data-mix": s.id } },
    { id: "radio", icon: "lucide:radio", label: `${T(t, "aRadio")}: ${s.title}`, onClick: () => tune(s, S), active: st.rad?.seed.id === s.id, attr: { "data-radio": s.id } },
    { id: "more", icon: "lucide:ellipsis", label: `${T(t, "aMore")}: ${s.title}`, onClick: () => openMore(S, s), pulse: moreBusy(s, st), attr: { "data-more": s.id } },
  ];
};
const ctl = (a) => `btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ${a.active ? "text-primary" : "text-base-content/70"} ${a.pulse ? "animate-pulse" : ""}`;
const toolButton = (a) => html`<button key=${a.id} ...${a.attr} aria-label=${a.label} aria-pressed=${a.id === "radio" ? String(!!a.active) : null} disabled=${a.disabled} onClick=${a.onClick}
  class=${ctl(a)}>${Icon(a.icon, "text-[length:var(--ms-icon)]")}</button>`;

// the sheet behind «⋯»: the song it is for on top, «У Фонотеку» and «Скачати» as two wide buttons; a tap starts the
// job and closes the sheet — the dots in the row pulse until it is done, and the toast says how it went
function MoreSheet({ S, t, locale, toast }) {
  const screen = useStore(S.screen), s = useStore($menu), kept = useStore($kept), dl = useStore($dl);
  const close = () => S.screen.set(null);
  const k = s ? kept[s.id] : "";
  const run = (fn) => { close(); fn(); };
  const wide = "btn w-full h-[var(--ms-ctl)] min-h-0 justify-start gap-3 normal-case font-medium";
  return html`<${Sheet} id="mz-more" open=${screen === "more" && !!s} onClose=${close} locale=${locale}
    title=${s?.title || ""} subtitle=${s?.artist || ""} icon="lucide:music-2">
    ${s ? html`<div data-more-sheet=${s.id} class="flex flex-col gap-2">
      <button data-keep=${s.id} disabled=${!!k} onClick=${() => run(() => keep(s, toast, t))} class=${`${wide} ${k === "done" ? "text-primary" : ""}`}>
        ${Icon(k === "done" ? "lucide:library-big" : "lucide:library", "text-[length:var(--ms-icon)]")}<span>${T(t, k === "done" ? "keptA" : "aKeep")}</span>
      </button>
      <button data-save=${s.id} disabled=${!!dl} onClick=${() => run(() => save(s, toast, t))} class=${wide}>
        ${Icon(dl === s.id ? "lucide:hourglass" : "lucide:download", "text-[length:var(--ms-icon)]")}<span>${T(t, dl === s.id ? "preparingFile" : "download")}</span>
      </button>
    </div>` : null}
  <//>`;
}

// ── tab «Пісня»: a link → the song's card → listen ───────────────────────────────────────────────────────────
export function muzak({ S, toast }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const link = useStore($link), meta = useStore($meta), busy = useStore($busy), err = useStore($err);
  const cur = useStore($cur), playing = useStore($playing), loading = useStore($loading), pos = useStore($pos), dur = useStore($dur), repeat = useStore($repeat);
  const st = useTools(S, t, toast);
  const input = useRef();
  useEffect(() => { if (!gate && !meta) input.current?.focus(); }, []);
  useEffect(() => { if (!gate) restore().catch(() => {}); }, []);   // the session is restored lazily in the runtime; listening needs it

  const paste = async () => {
    try { const text = (await navigator.clipboard.readText()).trim(); if (text) { $link.set(text); find(text); } } catch { input.current?.focus(); }
  };
  const song = meta ? songOfMeta(meta, link) : null;
  const on = !!song && cur === song.id;

  return html`<div class="flex flex-col">
  <div data-muzak data-busy=${busy || null} data-song=${meta ? meta.id : null} data-playing=${on && playing ? "true" : null} class="flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]">
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
        <${Transport} size="sm" locale=${locale} playing=${playing} onToggle=${() => toggle()} pos=${pos} dur=${dur} onSeek=${seek} onScrub=${seek} repeat=${shownRepeat(repeat)} onRepeat=${flipRepeat}
          actions=${actionsFor(song, st)} />
      </div>` : html`<div class="flex items-center gap-1">
        <button data-listen onClick=${() => toggle(song, [song])}
          class="btn btn-primary flex-1 min-w-0 h-[var(--ms-ctl)] min-h-0 gap-2 sf-e3">
          ${Icon("lucide:play", "text-[length:var(--ms-icon)]")}<span>${T(t, "listen")}</span>
        </button>
        ${actionsFor(song, st).map(toolButton)}
      </div>`}
    <//>` : null}
  </div>
  ${/* beside the card, not in it: the card's tools stay the card's alone */""}
  <div class="px-[var(--ms-pad)] pb-[var(--ms-pad)] pt-2"><${ForYou} st=${st} locale=${locale} player /></div>
  <${MoreSheet} S=${S} t=${t} locale=${locale} toast=${toast} />
  </div>`;
}

// ── tab «Вподобане»: the songs a person liked on YouTube (edge yt.js), played here ──────────────────────────────
// Owner 2026-10-10/11: any Google account, the liked songs as a list; the list reads on by itself as it scrolls.
// The list, its reads and its connect are rt/ytlikes.js — the same list remix makes remixes from (owner 2026-10-12).

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

// the stores a song's tools read, in one bag for actionsFor / rowTools
function useTools(S, t, toast) {
  const kept = useStore($kept), mixed = useStore($mixed), dl = useStore($dl), rad = useStore($radio);
  return { S, t, toast, kept, mixed, dl, rad };
}
// a row's own tools beside its play button — «Мікс», «Радіо», «⋯» — the same in every list
const rowTools = (s, st) => actionsFor(s, st).filter((a) => a.id !== "share").map(toolButton);
// the big (form) player's — «Поділитися», «Мікс», «Радіо»: its prev/play/next/repeat row holds three beside them
// (a fourth overflowed 412 px by 6 px in CI), and the playing song's row carries the «⋯»
const bigActions = (s, st) => actionsFor(s, st).filter((a) => a.id !== "more");

// ── tab «Радіо»: the last radio started from any song — the player on top, «Радіо · <song>», the songs like it ──
// The tab every «Радіо» button leads to. Before any radio: one line on how one starts. A song played elsewhere
// since leaves the radio standing: the player names the radio's song again and play starts the radio from it.
export function radio({ S, toast }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const st = useTools(S, t, toast), r = st.rad;
  const cur = useStore($cur), playing = useStore($playing), playErr = useStore($err);
  useEffect(() => { if (!gate) restore().catch(() => {}); }, []);   // listening needs the session
  const list = r?.songs || (r ? [r.seed] : []);
  const now = list.find((s) => s.id === cur) || r?.seed || null;
  return html`<div data-radio-tab data-seed=${r ? r.seed.id : null} data-songs=${r?.songs ? list.length : null} data-playing=${now && cur === now.id && playing ? "true" : null}
    class="flex flex-col gap-[calc(var(--ms-gap)*2)] p-[var(--ms-pad)]">
    ${playErr ? html`<div data-err role="alert" class="text-sm text-error">${T(t, playErr)}</div>` : null}
    ${!r ? html`<div data-hint class="py-10 flex flex-col items-center gap-2 text-center text-base-content/70">
        ${Icon("lucide:radio", "text-3xl text-primary")}
        <div class="font-semibold text-sm text-base-content">${T(t, "radioEmptyTitle")}</div>
        <div class="text-sm max-w-[32ch]">${T(t, "radioEmptyHint")}</div>
      </div>`
    : html`<${Player} now=${now} list=${list} st=${st} locale=${locale} />
      <section aria-labelledby="mz-radio" class="flex flex-col gap-[var(--ms-gap)]">
        <h2 id="mz-radio" class="flex items-center gap-2 min-w-0 font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70">
          ${Icon("lucide:radio", "shrink-0 text-[length:var(--ms-icon)] text-[var(--app-accent)]")}<span class="truncate">${T(t, "radio")} · ${r.seed.title}</span>
        </h2>
        ${r.err ? html`<div data-err role="alert" class="text-sm text-error">${T(t, r.err)}</div>`
        : !r.songs ? html`<div class="flex flex-col gap-1"><${LikesSkeleton} /></div>`
        : html`<div class="flex flex-col gap-1">
            ${list.map((s) => {
              const here = cur === s.id;
              return html`<${LikeRow} key=${s.id} s=${s} here=${here} busy=${here && playing} label=${`${T(t, "aPlay")}: ${s.title}`} onPick=${() => toggle(s, list)} attr=${{ "data-play": s.id }}>
                ${rowTools(s, st)}
              <//>`;
            })}
          </div>`}
      </section>`}
    <${MoreSheet} S=${S} t=${t} locale=${locale} toast=${toast} />
  </div>`;
}

export function likes({ S, toast, confirm }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const playErr = useStore($err);
  const q = useStore($q), cur = useStore($cur), playing = useStore($playing), loading = useStore($loading), pos = useStore($pos), dur = useStore($dur), repeat = useStore($repeat);
  const st = useTools(S, t, toast);
  // the player was walking this list: it walks on into the songs a scrolled-in page added
  const { l, busy, err, songs, on, reading, tail } = useLikes((g) => { if ($q.get() === g.was) $q.set(g.songs); });
  const now = q.find((s) => s.id === cur) || null;
  const shown = now || songs[0] || null;   // the player names the first song before anything has played

  return html`<div data-likes data-connected=${on ? "true" : l ? "false" : null} data-songs=${on ? songs.length : null} data-playing=${playing ? "true" : null} data-loading=${loading ? "true" : null}
    class="flex flex-col gap-[calc(var(--ms-gap)*2)] p-[var(--ms-pad)]">
    ${err || playErr ? html`<div data-err role="alert" class="text-sm text-error">${T(t, err || playErr)}</div>` : null}

    ${reading ? html`<${LikesSkeleton} />`

    : !on ? html`<${LikesConnect} t=${t} app="muzak" expired=${l?.expired} />`

    : html`${songs.length ? html`<section data-player aria-label=${T(t, "now")} class="flex flex-col items-center gap-[var(--ms-gap)] pt-2">
        <${Orb} song=${now} />
        <${Transport} form locale=${locale} playing=${playing} onToggle=${() => toggle(now ? null : songs[0], now ? null : songs)} className="w-full pt-1"
          onPrev=${() => step(-1)} onNext=${() => step(1)} pos=${pos} dur=${dur} onSeek=${seek} onScrub=${seek} disabled=${!songs.length} repeat=${shownRepeat(repeat)} onRepeat=${flipRepeat}
          title=${shown ? shown.title : ""} subtitle=${now && loading ? T(t, "preparing") : shown ? [shown.artist, clock(shown.dur)].filter(Boolean).join(" · ") : ""}
          actions=${shown ? bigActions(shown, st) : []} />
      </section>` : null}

      <section aria-labelledby="mz-likes" class="flex flex-col gap-[var(--ms-gap)]">
        <${LikesHead} t=${t} l=${l} id="mz-likes" toast=${toast} confirm=${confirm} />
        <div class="flex flex-col gap-1">
          ${songs.map((s) => {
            const here = cur === s.id;
            return html`<${LikeRow} key=${s.id} s=${s} here=${here} busy=${here && playing} label=${`${T(t, "aPlay")}: ${s.title}`} onPick=${() => toggle(s, songs)} attr=${{ "data-play": s.id }}>
              ${rowTools(s, st)}
            <//>`;
          })}
          ${busy === "more" ? html`<${LikesSkeleton} n=${2} />` : null}
        </div>
        ${l.next ? html`<div ref=${tail} data-tail aria-hidden="true" class="h-px"></div>` : null}
        ${!songs.length ? html`<div data-none class="py-6 flex flex-col items-center gap-1 text-center">
          <div class="font-semibold text-sm">${T(t, "likesEmpty")}</div><div class="text-sm text-base-content/70">${T(t, "likesEmptyHint")}</div>
        </div>` : null}
      </section>`}
    <${MoreSheet} S=${S} t=${t} locale=${locale} toast=${toast} />
  </div>`;
}

// ── «Для тебе»: songs like the person's liked ones, under the song card and on the search tab before a search ─
// Owner 2026-10-14: «там де пошук та пісня пусте пространство … ті що рекомендуються для аккаунту» → «роби
// рекомендації з радіо вподобаних». The edge answers one song's YouTube Music radio (/feed/music/radio, ~50 songs,
// ~1 s); the three latest likes' radios are mixed in turns (mixRadios), without the liked songs themselves. The
// list scrolls on: the next two likes' radios join it as its end nears. Read once a visit, shared by both tabs.
const SEEDS_FIRST = 3, SEEDS_MORE = 2;
const $recs = atom(gate ? FIXTURE_RADIO.songs.map(songOfFound) : null);   // null: not read yet
const $rbusy = atom(""), $rerr = atom("");   // busy: "" · "list" · "more"
let rseed = 0;
async function readRecs(liked, locale, more = false) {
  if (gate || $rbusy.get() || (!more && $recs.get()) || rseed >= liked.length) return;
  const seeds = liked.slice(rseed, rseed + (more ? SEEDS_MORE : SEEDS_FIRST)), was = $recs.get() || [];
  rseed += seeds.length;
  $rerr.set(""); $rbusy.set(more ? "more" : "list");
  try {
    const got = await Promise.allSettled(seeds.map((s) => fetch(`${VPS_PROXY}/music/radio?v=${s.id}&hl=${locale === "en" ? "en" : "uk"}`, { signal: AbortSignal.timeout(30000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))));
    const lists = got.filter((g) => g.status === "fulfilled").map((g) => (g.value.songs || []).map(songOfFound));
    if (!lists.length) { if (!was.length) $rerr.set("errRecs"); return; }
    const songs = [...was, ...mixRadios(lists, [...liked.map((s) => s.id), ...was.map((s) => s.id)])];
    $recs.set(songs);
    if (more && $q.get() === was) $q.set(songs);   // the player was walking this list: it walks on into the new songs
  } catch { if (!was.length) $rerr.set("errRecs"); }
  finally { $rbusy.set(""); }
}

// the big player — the orb and the form transport — for a song played from a list on a tab that has no card for it
// `list`: the songs `now` belongs to — when `now` is not what plays (the radio tab after a song played elsewhere),
// the player shows it paused at 0:00 and play starts that list from it
function Player({ now, st, locale, list = null }) {
  const { t } = st;
  const cur = useStore($cur), live = cur === now.id;
  const playing = useStore($playing), loading = useStore($loading), pos = useStore($pos), dur = useStore($dur), repeat = useStore($repeat);
  return html`<section data-player aria-label=${T(t, "now")} class="flex flex-col items-center gap-[var(--ms-gap)]">
    <${Orb} song=${now} />
    <${Transport} form locale=${locale} playing=${live && playing} onToggle=${() => (live ? toggle() : toggle(now, list || [now]))} className="w-full pt-1"
      onPrev=${() => step(-1)} onNext=${() => step(1)} pos=${live ? pos : 0} dur=${live ? dur : (now.dur || 0) * 1000} onSeek=${seek} onScrub=${seek} repeat=${shownRepeat(repeat)} onRepeat=${flipRepeat}
      title=${now.title} subtitle=${live && loading ? T(t, "preparing") : [now.artist, clock(now.dur)].filter(Boolean).join(" · ")}
      actions=${bigActions(now, st)} />
  </section>`;
}

// `player`: the tab has no player of its own for these songs (the song tab), so the section shows one on top
function ForYou({ st, locale, player = false }) {
  const { t } = st;
  const { l, songs: liked, on, reading } = useLikes();
  const recs = useStore($recs), busy = useStore($rbusy), err = useStore($rerr), lbusy = useStore($lBusy);
  const cur = useStore($cur), playing = useStore($playing);
  useEffect(() => { if (on && liked.length) readRecs(liked, locale); }, [on, liked.length]);
  const tail = useRef();
  const more = on && rseed < liked.length;
  useEffect(() => {
    if (!tail.current || !more) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) readRecs(liked, locale, true); }, { rootMargin: "0px 0px 600px 0px" });
    io.observe(tail.current);
    return () => io.disconnect();
  }, [recs?.length, busy, more]);
  if (reading || (l === null && !gate)) return null;   // the likes are being read: nothing to say yet
  const list = recs || [];
  const now = player ? list.find((s) => s.id === cur) || null : null;

  return html`<section data-foryou data-songs=${on ? list.length : null} aria-labelledby="mz-foryou" class="flex flex-col gap-[var(--ms-gap)]">
    ${now ? html`<${Player} now=${now} st=${st} locale=${locale} />` : null}
    <h2 id="mz-foryou" class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70">${T(t, "forYou")}</h2>
    ${!on ? html`<div data-connect class="flex flex-col gap-3">
        <p class="text-sm leading-relaxed text-base-content/80">${T(t, "forYouConnect")}</p>
        <button data-yt-connect disabled=${lbusy === "connect"} onClick=${() => connect("muzak")}
          class=${`btn btn-primary w-full h-[var(--ms-ctl)] min-h-0 gap-2 sf-e3 ${lbusy === "connect" ? "animate-pulse" : ""}`}>
          ${Icon("lucide:heart", "text-[length:var(--ms-icon)]")}<span>${T(t, lbusy === "connect" ? "connecting" : "connect")}</span>
        </button>
      </div>`
    : !liked.length ? html`<p data-none class="text-sm text-base-content/70">${T(t, "forYouEmpty")}</p>`
    : err ? html`<div data-err role="alert" class="text-sm text-error">${T(t, err)}</div>`
    : busy === "list" || !recs ? html`<div class="flex flex-col gap-1"><${LikesSkeleton} /></div>`
    : html`<div class="flex flex-col gap-1">
        ${list.map((s) => {
          const here = cur === s.id;
          return html`<${LikeRow} key=${s.id} s=${s} here=${here} busy=${here && playing} label=${`${T(t, "aPlay")}: ${s.title}`} onPick=${() => toggle(s, list)} attr=${{ "data-play": s.id }}>
            ${rowTools(s, st)}
          <//>`;
        })}
        ${busy === "more" ? html`<${LikesSkeleton} n=${2} />` : null}
        ${more ? html`<div ref=${tail} data-tail aria-hidden="true" class="h-px"></div>` : null}
      </div>`}
  </section>`;
}

// ── tab «Пошук»: any song on YouTube Music by its name, played here (owner 2026-10-13: «додамо пошук пісень на
// ютубі у апці музак, новий розділ окремий») ────────────────────────────────────────────────────────────────
// The edge searches YouTube Music itself (/feed/music/search, no daily limit — the owner's pick over the Data API's
// ~100 searches a day), signed-in only like every /feed/music route. A search runs on Enter / the button, never per
// keystroke. The rows are the likes' rows; a tap plays the song and the queue walks on through what was found.
const $sq = atom(gate ? FIXTURE_QUERY : "");
const $found = atom(gate ? FIXTURE_SEARCH.songs.map(songOfFound) : null);   // null: nothing searched yet
const $sbusy = atom(""), $serr = atom("");   // busy: "" · "list" (a new search) · "more" (the next page)
// INFINITE SCROLL (owner 2026-10-14: «додай ще інфініт скролл та пагінацію, бо знаходить мало пісень»): the edge
// answers 20 songs and `next`, the page after's token; a sentinel under the list asks for it as it nears the viewport.
let snext = "", sfor = { q: "", hl: "uk" };
let sseq = 0;
async function lookup(q, locale, more = false) {
  q = more ? sfor.q : String(q || "").trim();
  if (!q || (more && (!snext || $sbusy.get()))) return;
  const my = more ? sseq : ++sseq, hl = more ? sfor.hl : locale === "en" ? "en" : "uk", was = more ? $found.get() || [] : [];
  $serr.set(""); $sbusy.set(more ? "more" : "list");
  if (gate) { $found.set(FIXTURE_SEARCH.songs.map(songOfFound)); $sbusy.set(""); return; }
  if (!more) { snext = ""; sfor = { q, hl }; }
  try {
    const r = await fetch(`${VPS_PROXY}/music/search?q=${encodeURIComponent(q)}&hl=${hl}${more ? `&c=${encodeURIComponent(snext)}` : ""}`, { signal: AbortSignal.timeout(30000) });
    if (my !== sseq) return;
    if (!r.ok) { if (r.status !== 401) $serr.set(r.status === 429 ? "errBusy" : "errSearch"); return; }   // 401: the runtime's sign-in wall
    const j = await r.json(), seen = new Set(was.map((s) => s.id));
    snext = j.next || "";
    const songs = [...was, ...(j.songs || []).map(songOfFound).filter((s) => !seen.has(s.id))];
    $found.set(songs);
    if (more && $q.get() === was) $q.set(songs);   // the player was walking this list: it walks on into the new page
  } catch { if (my === sseq) $serr.set("errSearch"); }
  finally { if (my === sseq) $sbusy.set(""); }
}

export function search({ S, toast }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const q = useStore($sq), found = useStore($found), busy = useStore($sbusy), err = useStore($serr), playErr = useStore($err);
  const cur = useStore($cur), playing = useStore($playing), recs = useStore($recs);
  const st = useTools(S, t, toast);
  const input = useRef();
  useEffect(() => { if (!gate && found === null) input.current?.focus(); }, []);
  useEffect(() => { if (!gate) restore().catch(() => {}); }, []);   // listening needs the session
  const songs = found || [];
  // the player shows here only for a song played from this list, or from «Для тебе» under the hint
  const now = songs.find((s) => s.id === cur) || (found === null && recs?.find((s) => s.id === cur)) || null;
  // the observer is made again whenever the list grows, so a page too short to scroll still pulls the next one
  const tail = useRef();
  useEffect(() => {
    if (!tail.current || !snext) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) lookup("", locale, true); }, { rootMargin: "0px 0px 600px 0px" });
    io.observe(tail.current);
    return () => io.disconnect();
  }, [songs.length, busy]);

  return html`<div data-search data-busy=${busy ? "true" : null} data-found=${found ? songs.length : null} data-playing=${now && playing ? "true" : null}
    class="flex flex-col gap-[calc(var(--ms-gap)*2)] p-[var(--ms-pad)]">
    <form role="search" class="flex items-center gap-2" onSubmit=${(e) => { e.preventDefault(); input.current?.blur(); lookup(q, locale); }}>
      <textarea rows="1" data-line data-q ref=${input} inputmode="search" autocomplete="off" spellcheck="false" enterkeyhint="search"
        class="input input-bordered sf-inset min-w-0 flex-1" aria-label=${T(t, "searchPlaceholder")}
        placeholder=${T(t, "searchPlaceholder")} value=${q}
        onInput=${(e) => { $sq.set(e.target.value); if ($serr.get()) $serr.set(""); }}></textarea>
      <button type="submit" data-search-go aria-label=${T(t, "aSearch")} disabled=${!q.trim() || busy === "list"}
        class="btn btn-primary btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 sf-e3">${Icon("lucide:search", "text-[length:var(--ms-icon)]")}</button>
    </form>
    ${err || playErr ? html`<div data-err role="alert" class="text-sm text-error">${T(t, err || playErr)}</div>` : null}

    ${now ? html`<${Player} now=${now} st=${st} locale=${locale} />` : null}

    ${busy === "list" ? html`<${LikesSkeleton} />`
    : found === null ? html`<div data-hint class="py-4 flex flex-col items-center gap-2 text-center text-base-content/70">
        ${Icon("lucide:audio-lines", "text-3xl text-primary")}
        <div class="font-semibold text-sm text-base-content">${T(t, "searchHintTitle")}</div>
        <div class="text-sm max-w-[32ch]">${T(t, "searchHint")}</div>
      </div>
      <${ForYou} st=${st} locale=${locale} />`
    : !songs.length ? html`<div data-none class="py-6 flex flex-col items-center gap-1 text-center">
        <div class="font-semibold text-sm">${T(t, "searchEmpty")}</div><div class="text-sm text-base-content/70">${T(t, "searchEmptyHint")}</div>
      </div>`
    : html`<section aria-label=${T(t, "searchFound")} class="flex flex-col gap-1">
        ${songs.map((s) => {
          const here = cur === s.id;
          return html`<${LikeRow} key=${s.id} s=${s} here=${here} busy=${here && playing} label=${`${T(t, "aPlay")}: ${s.title}`} onPick=${() => toggle(s, songs)} attr=${{ "data-play": s.id }}>
            ${rowTools(s, st)}
          <//>`;
        })}
        ${busy === "more" ? html`<${LikesSkeleton} n=${2} />` : null}
        ${snext ? html`<div ref=${tail} data-tail aria-hidden="true" class="h-px"></div>` : null}
      </section>`}
    <${MoreSheet} S=${S} t=${t} locale=${locale} toast=${toast} />
  </div>`;
}
