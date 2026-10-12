// ytlikes — the person's YouTube likes as a list, ONE implementation for every app that lists them (muzak plays a
// song from it, remix makes one into a remix). Owner 2026-10-12: «у реміксі додай кнопку підключити ютуб і переюзай
// те саме що у музаці той же список». The grant is the edge's (yt.js, server-side, per farm account), so a person who
// connected in one app sees the same list in the other, and disconnecting anywhere disconnects both.
//
// What lives here: the list's state, the reads (with the 4-page reach for a page of no songs), the connect / revoke
// calls, Google's return word (?yt=ok|denied|fail, read once), the hook that reads on sign-in, on coming back from
// another browser and as the list scrolls — and the three pieces of screen every app draws the same: the connect
// panel, the list's head with «Відключити», a song row whose actions are the app's.
import { html } from "htm/preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "@microspec/core/runtime/i18n.js";
import { gate } from "@microspec/core/runtime/gate.js";
import { VPS_PROXY } from "@microspec/core/runtime/feed.js";
import { Panel } from "@microspec/core/runtime/ui.js";
import { openOutside } from "@microspec/core/runtime/tma.js";
import { session, restore } from "@microspec/core/runtime/auth.js";
import { clock, FIXTURE_LIKES } from "./muzak.js";

const Icon = (icon, cls = "") => html`<iconify-icon icon=${icon} class=${cls}></iconify-icon>`;

export const $likes = atom(gate ? FIXTURE_LIKES : null);   // null = not read | { connected: false[, expired] } | { connected, channel, songs, next }
export const $lBusy = atom("");                            // "" | "list" | "more" | "connect"
export const $lErr = atom("");
let back = false;                                          // the connect left for another app (Telegram, the APK's browser)

// Google returns the person to /<app>/?tab=likes&yt=ok|denied|fail: the word is read once and taken off the address.
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

/** Reads the list (or, `more`, its next page). → `{ was, songs }` when a page grew the list, so a caller walking the
 *  old list can walk on into the new songs; nothing otherwise. */
export async function readLikes(more = false) {
  if (gate || $lBusy.get()) return null;
  const was = more ? $likes.get() : null;
  if (more && !was?.next) return null;
  $lBusy.set(more ? "more" : "list");
  try {
    let songs = was?.songs || [], page = was?.next || "", j = null;
    // 50 likes can hold no song at all (vlogs, hour-long mixes): a read goes on until it has something new
    for (let i = 0; i < 4; i++) {
      const r = await yt("likes", page ? { page } : {});
      if (!r.ok) { if (r.status === 401) $likes.set({ connected: false }); else $lErr.set(await ytErr(r)); return null; }
      j = await r.json();
      if (!j.connected) { $likes.set(j); return null; }
      const seen = new Set(songs.map((s) => s.id));
      songs = [...songs, ...j.songs.filter((s) => !seen.has(s.id))];
      page = j.next || "";
      if (songs.length > (was?.songs.length || 0) || !page) break;
    }
    $likes.set({ ...j, songs, next: page || null });
    return more ? { was: was.songs, songs } : null;
  } catch { $lErr.set("errLikes"); return null; }
  finally { $lBusy.set(""); }
}

/** Google's consent, coming back to this app's likes tab (`app` = the app id, edge yt.js keeps a closed list). */
export async function connect(app) {
  if (gate || $lBusy.get()) return;
  $lErr.set(""); $lBusy.set("connect");
  try {
    const r = await yt("start", { app });
    if (!r.ok) { if (r.status !== 401) $lErr.set("ytFail"); return; }   // 401: the runtime's sign-in wall is already up
    back = openOutside((await r.json()).url) !== "page";
  } catch { $lErr.set("ytFail"); }
  finally { $lBusy.set(""); }
}

export async function disconnect(toast, t) {
  if (!gate) { const r = await yt("revoke").catch(() => null); if (!r?.ok) { $lErr.set("errLikes"); return; } }
  $likes.set({ connected: false });
  toast?.(T(t, "ytOff"));
}

/**
 * The list on a screen: reads it once the session is there, again when the person comes back from the browser the
 * consent ran in, and the next page as the sentinel (`tail`) nears the viewport.
 * @param onMore called with readLikes(true)'s `{ was, songs }` when a scrolled-in page grew the list
 * @returns `{ l, busy, err, songs, on, reading, tail }` — `tail` is the ref for the sentinel under the list
 */
export function useLikes(onMore) {
  const sid = useStore(session)?.sid || "";
  const l = useStore($likes), busy = useStore($lBusy), err = useStore($lErr);
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
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) readLikes(true).then((g) => { if (g) onMore?.(g); }); }, { rootMargin: "0px 0px 600px 0px" });
    io.observe(tail.current);
    return () => io.disconnect();
  }, [l?.next, songs.length]);
  return { l, busy, err, songs, on: !!l?.connected, reading: !gate && !!sid && l === null, tail };
}

/** Four skeleton rows: the list being read. */
export const LikesSkeleton = ({ n = 4 }) => [...Array(n).keys()].map((i) => html`<div key=${"s" + i} class="flex items-center gap-3 px-1 py-1.5"><div class="skeleton w-12 h-12 shrink-0 rounded-[var(--ms-r-in)]"></div><div class="flex-1 flex flex-col gap-1.5"><div class="skeleton h-3.5 w-2/3"></div><div class="skeleton h-3 w-1/3"></div></div></div>`);

/** Not connected (or the grant expired): what the list is and the one button. `app` goes to connect(). */
export function LikesConnect({ t, app, expired }) {
  const busy = useStore($lBusy);
  return html`<${Panel} title=${T(t, "likesTitle")}>
    <div data-connect class="flex flex-col gap-3">
      <p class="text-sm leading-relaxed text-base-content/80">${T(t, expired ? "ytExpired" : "connectBody")}</p>
      <button data-yt-connect disabled=${busy === "connect"} onClick=${() => connect(app)}
        class=${`btn btn-primary w-full h-[var(--ms-ctl)] min-h-0 gap-2 sf-e3 ${busy === "connect" ? "animate-pulse" : ""}`}>
        ${Icon("lucide:heart", "text-[length:var(--ms-icon)]")}<span>${T(t, busy === "connect" ? "connecting" : "connect")}</span>
      </button>
      <p class="text-xs leading-relaxed text-base-content/70">${T(t, "connectNote")}</p>
    </div>
  <//>`;
}

/** The list's head: whose YouTube it is, and «Відключити» behind the app's confirm. */
export function LikesHead({ t, l, id, toast, confirm }) {
  const askOff = () => confirm({ title: T(t, "offTitle"), body: T(t, "offBody"), verb: T(t, "offYes"), onConfirm: () => disconnect(toast, t) });
  return html`<div class="flex items-center justify-between gap-3">
    <h2 id=${id} class="min-w-0 truncate font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70">${l.channel ? T(t, "ytAs", { name: l.channel }) : T(t, "likesTitle")}</h2>
    <button data-yt-off onClick=${askOff} class="btn btn-ghost btn-sm shrink-0 min-h-0 h-8 px-2 text-xs font-normal text-base-content/70">${T(t, "ytOffBtn")}</button>
  </div>`;
}

/**
 * One liked song: its cover, title, artist and length as one press target, then the app's own action buttons.
 * @param props `s` the song; `here` it is the app's current song; `busy` it is playing / being made (the cover dims
 *   under a live glyph); `label` the press target's accessible name; `onPick`; `attr` the press target's data
 *   attribute ({ "data-play": id } in muzak); children: the actions
 */
export function LikeRow({ s, here, busy, label, onPick, attr, children }) {
  return html`<div data-like=${s.id} class="mz-row flex items-center gap-1">
    <button ...${attr} aria-pressed=${here ? "true" : "false"} aria-label=${label} onClick=${onPick}
      class="flex-1 min-w-0 flex items-center gap-3 text-left px-1 py-1.5 min-h-0 rounded-[var(--ms-r-in)] ms-press">
      <span class="mz-cover sf-raised bg-base-200 flex items-center justify-center text-base-content/40">
        ${Icon(busy ? "lucide:audio-lines" : "lucide:music-2", "text-lg")}
        ${s.cover ? html`<img src=${s.cover} alt="" loading="lazy" class=${`absolute inset-0 w-full h-full object-cover ${busy ? "opacity-60" : ""}`} onError=${(e) => { e.target.remove(); }} />` : null}
      </span>
      <span class="min-w-0 flex-1 flex flex-col leading-tight gap-0.5">
        <span class=${`font-semibold text-sm truncate ${here ? "text-primary" : ""}`}>${s.title}</span>
        <span class="text-xs text-base-content/70 truncate">${s.artist}<span class="font-mono tabular-nums"> · ${clock(s.dur)}</span></span>
      </span>
    </button>
    ${children}
  </div>`;
}
