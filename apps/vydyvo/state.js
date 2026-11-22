import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { session } from "/_rt/auth.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { T } from "/_rt/i18n.js";
import { toEnglish } from "/_rt/translate.js";
import { holdBackground } from "/_rt/bghold.js";
import { suggest } from "/_rt/ai-text.js";
import { cancelJob } from "/_rt/imagejob.js";
import { taskSlides, jobCode } from "/_rt/task.js";
import { LINES, WORLDS, worldOf, voiceOf, composePrompt, mockFrame, seedUrl } from "./worlds.js";
import { Effect } from "/_rt/fx.js";
import { CONFIG } from "./config.js";

const STALE = { stale: true };
const tried = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e });

const OPTS_KEY = "ms:vydyvo:opts";
const BASE = `${VPS_PROXY}/image`;
const CAP = 2 + 4;
const AHEAD = 2;
const K = CONFIG.k;
const BACKOFF = { eRate: 120_000, eBusy: 300_000, eFailed: 180_000, eNetwork: 60_000, eSignIn: 600_000, eTranslate: 60_000 };
const DEFAULT = { prompt: "", every: 120, quality: "2k", char: "lum" };
export const EVERY = [30, 60, 120, 300];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const loadOpts = () => { try { const v = JSON.parse(localStorage.getItem(OPTS_KEY) || "null"); if (v && EVERY.includes(v.every)) return { ...DEFAULT, ...v }; } catch { } return DEFAULT; };
export const $opts = atom(loadOpts());
export const setOpts = (p) => { const v = { ...$opts.get(), ...p }; $opts.set(v); try { localStorage.setItem(OPTS_KEY, JSON.stringify(v)); } catch { } };
/** The chosen character's world id (worlds.js) — the grid's pick, `lum` until one is made or if the id is gone. */
export const activeWorld = () => { const c = $opts.get().char; return WORLDS[c] ? c : "lum"; };
/** The mode the DOCUMENT is in — the applied theme, which `?theme=` can override without touching the atom. */
const docMode = () => (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "signal-light") ? "light" : "dark";

export const $frames = atom([]);
export const $stage = atom({ cur: null, prev: null, since: 0, slot: 0 });
export const $gen = atom({ phase: "idle", error: null, until: 0, live: null });
const patchGen = (p) => $gen.set({ ...$gen.get(), ...p });

const revoke = (url) => { if (url?.startsWith?.("blob:")) { try { URL.revokeObjectURL(url); } catch { } } };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const lineOf = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % LINES; };

export const unshown = () => $frames.get().filter((f) => !f.shown);
export const current = () => { const st = $stage.get(); return $frames.get().find((f) => f.id === st.cur) || null; };

function addFrame(f) {
  const id = newId(), frame = { id, li: lineOf(id), line: null, ts: Date.now(), shown: false, shownAt: 0, ...f };
  let list = [...$frames.get(), frame];
  const cur = $stage.get().cur;
  while (list.filter((x) => !x.seed).length > CAP) {
    const gone = list.filter((x) => x.shown && !x.seed && x.id !== cur).sort((a, b) => a.shownAt - b.shownAt)[0] || list.find((x) => !x.seed && x.id !== cur);
    if (!gone) break;
    list = list.filter((x) => x !== gone); revoke(gone.url);
  }
  $frames.set(list);
  return id;
}

function jsonField(raw, key) {
  try {
    const m = String(raw || "").match(/\{[\s\S]*\}/);
    const v = m ? JSON.parse(m[0])?.[key] : null;
    return typeof v === "string" ? v.trim() : "";
  } catch { return ""; }
}

async function lineFor(id, world, mode, userWords, loc) {
  if (gate) return;
  const avoid = $frames.get().map((f) => f.line).filter(Boolean).slice(-12);
  const spark = [
    `Голос: ${voiceOf(world, mode)}.`,
    userWords ? `Слова власника: ${userWords}.` : "",
    avoid.length ? `Вже прозвучало: ${avoid.join(" | ")}` : "",
  ].filter(Boolean).join("\n");
  try {
    const out = await suggest("line", spark, loc || "uk");
    const line = jsonField(out, "line").replace(/^["«—–\-\s]+/, "").replace(/["»\s]+$/, "").slice(0, 90);
    if (!line || !$frames.get().some((f) => f.id === id)) return;
    $frames.set($frames.get().map((f) => (f.id === id ? { ...f, line } : f)));
  } catch { }
}

function present(id, now) {
  const st = $stage.get();
  const keep = new Set([id, st.cur]);
  $frames.set($frames.get().filter((f) => { if (!f.shown || keep.has(f.id)) return true; revoke(f.url); return false; })
    .map((f) => (f.id === id ? { ...f, shown: true, shownAt: now } : f)));
  $stage.set({ cur: id, prev: st.cur, since: now, slot: 1 - st.slot });
}
function advance(now) {
  const mode = document.documentElement.getAttribute("data-theme") === "signal-light" ? "light" : "dark";
  const wid = activeWorld();
  const pick = (list) => list.find((f) => f.mode === mode && f.preset === wid) || list.find((f) => f.mode === mode) || list[0];
  const next = pick(unshown());
  if (next) present(next.id, now);
}
/** Skip to the next frame now (a tap on the picture). */
export function skip() { advance(Date.now()); }

export function ensureSeed(mode = docMode(), wid = activeWorld()) {
  if ($frames.get().some((f) => f.mode === mode && f.preset === wid)) return;
  const id = addFrame({ url: seedUrl(wid, mode), preset: wid, mode, seed: true, w: 90, h: 160 });
  const cur = current();
  if (!cur || cur.mode !== mode || cur.preset !== wid) present(id, Date.now());
}

let loopId = null, runs = 0, job = null, hold = null, ctxRef = null;
/** Start the show loop once; `ctx.t` is the dictionary for the hold's words. Idempotent. */
export function startLoop(ctx) {
  ctxRef = ctx;
  if (loopId) return;
  loopId = -1;
  tick(); loopId = setInterval(tick, 1000);
}
function tick() {
  const now = Date.now(), st = $stage.get(), o = $opts.get();
  const m = document.documentElement.getAttribute("data-theme") === "signal-light" ? "light" : "dark";
  const w = activeWorld();
  ensureSeed(m, w);
  const curF = current();
  if (!st.cur) { const first = unshown()[0] || $frames.get()[0]; if (first) present(first.id, now); }
  else if (curF?.seed && unshown().some((f) => !f.seed && f.mode === m && f.preset === w)) advance(now);
  else if (now - st.since >= o.every * 1000) advance(now);
  const g = $gen.get();
  const online = gate || (typeof navigator === "undefined" || navigator.onLine !== false);
  const ahead = $frames.get().filter((f) => !f.shown && f.mode === m && f.preset === w).length;
  const signedIn = gate || !!(session.get() && session.get().sid);
  if (g.phase !== "working" && now >= g.until && ahead < AHEAD && online && signedIn) generate();
}

/** A theme flip with no frame of the new mode must not wait out a refusal's backoff — race now. */
export function nudge() {
  const g = $gen.get();
  if (g.phase !== "working" && g.until > Date.now()) patchGen({ until: 0 });
}

/** The explicit "paint now": supersede whatever runs — the old
 * edge job is cancelled so its quota stops burning — clear any backoff and start a fresh race. */
export function generateNow() {
  runs++;
  if (job && !gate) cancelJob(BASE, job);
  hold?.(); hold = null; job = null;
  $frames.set($frames.get().filter((f) => { if (f.shown) return true; revoke(f.url); return false; }));
  patchGen({ phase: "idle", error: null, live: null, until: 0 });
  generate();
}

async function generate() {
  const run = ++runs, o = $opts.get(), wid = activeWorld(), world = worldOf(wid);
  const mode = document.documentElement.getAttribute("data-theme") === "signal-light" ? "light" : "dark";
  const seed = Math.floor(Math.random() * 1e9);
  patchGen({ phase: "working", error: null, live: null, runs: run });
  if (gate) {
    await sleep(90); if (run !== runs) return;
    for (let n = 0; n < K; n++) addFrame({ url: mockFrame(seed + n, mode), preset: wid, prompt: o.prompt, mode, w: 90, h: 160 });
    patchGen({ phase: "idle", until: Date.now() + 3000 });
    return;
  }
  const typed = o.prompt.trim();
  const userDriven = !!typed;
  const painted = $frames.get().map((f) => f.subject).filter(Boolean).slice(-8);
  const spark = [
    userDriven ? `Owner's subject (depict exactly this): ${typed}.` : `In the spirit of: ${world.subject}.`,
    painted.length ? `Already painted: ${painted.join(" | ")}` : "",
  ].filter(Boolean).join("\n");
  const fresh = (v) => run === runs ? Effect.succeed(v) : Effect.fail(STALE);
  const imagine = tried(() => suggest("scene", spark, ctxRef?.loc || "uk")).pipe(
    Effect.map((out) => jsonField(out, "scene").slice(0, CONFIG.sceneChars)),
    Effect.catch(() => Effect.succeed("")),
  );
  const english = (subject) => !subject ? Effect.succeed(subject) : tried(() => toEnglish(subject)).pipe(Effect.mapError((e) => ({ code: e.code || "eTranslate" })));
  const paint = (prompt, scene) => {
    let got = 0;
    const sw = (typeof screen !== "undefined" && screen.width) || window.innerWidth || 1;
    const sh = (typeof screen !== "undefined" && screen.height) || window.innerHeight || 1;
    const ratio = Math.max(CONFIG.ratio.min, Math.min(CONFIG.ratio.max, sw / sh));
    hold = holdBackground({ title: T(ctxRef.t, "title"), body: T(ctxRef.t, "notifWorking") });
    return tried(() => taskSlides(CONFIG.route, { prompt, quality: o.quality, aspect: CONFIG.aspect, ratio, seed, k: K }, {
      onStart: (_id, rep) => { if (run === runs) job = rep.job; else cancelJob(BASE, rep.job); },
      onLive: (live) => { if (run === runs) patchGen({ live }); },
      onSlide: (s) => { if (run !== runs) return; got++; const fid = addFrame({ url: s.url, blob: s.blob, preset: wid, prompt: o.prompt, subject: scene || null, mode, w: s.w, h: s.h }); lineFor(fid, world, mode, o.prompt, ctxRef?.loc); },
    })).pipe(
      Effect.mapError((e) => ({ code: e.code || jobCode(e) })),
      Effect.flatMap(fresh),
      Effect.map((status) => {
        hold?.(); hold = null; job = null;
        if (got) patchGen({ phase: "idle", error: null, live: null, until: Date.now() + CONFIG.restMs });
        else fail(run, status === "busy" ? "eBusy" : "eFailed");
      }),
    );
  };
  await Effect.runPromise(imagine.pipe(
    Effect.flatMap(fresh),
    Effect.flatMap((scene) => english(scene || typed).pipe(
      Effect.flatMap(fresh),
      Effect.flatMap((subject) => paint(composePrompt(subject, world, mode, userDriven), scene)),
    )),
    Effect.catch((e) => Effect.sync(() => { if (e !== STALE) fail(run, e.code); })),
  ));
}
function fail(run, code) {
  if (run !== runs) return;
  hold?.(); hold = null; job = null;
  patchGen({ phase: "idle", error: code, live: null, until: Date.now() + (BACKOFF[code] || 120_000) });
}
