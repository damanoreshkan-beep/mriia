import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { cancelJob } from "/_rt/imagejob.js";
import { taskOne, taskCall } from "/_rt/task.js";
import { toEnglish } from "/_rt/translate.js";
import { report } from "/_rt/telemetry.js";
import { Effect } from "/_rt/fx.js";
import { CONFIG } from "./config.js";

const BASE = VPS_PROXY + CONFIG.base;
/** The chunk. The edge clamps to the same number and writes
 *  it into the Space's own Duration control where the row has one; see `CHUNK_MAX_SEC` in edge/video.js. */
export const CHUNK_SEC = 2;
/** */
export const LENGTHS = [15, 30, 60];

/** `{ phase: idle|writing|filming|done|error, error, at, of }` — `at` is the chunk being filmed, 1-based. */
export const $reelJob = atom({ phase: "idle", error: null, at: 0, of: 0 });
/** The storyboard: `[{ i, beat, status: waiting|filming|done|error, url, blob, thumb, dur }]`. */
export const $reel = atom([]);
/** The chosen total length in seconds. */
export const $length = atom(30);

const setJob = (p) => $reelJob.set({ ...$reelJob.get(), ...p });
const setChunk = (i, p) => $reel.set($reel.get().map((c) => (c.i === i ? { ...c, ...p } : c)));

/**
 * The final visible frame of a clip, as a data: URL — the next chunk's first frame.
 * Returns "" when the browser will not decode the clip, so a broken chunk breaks the CHAIN, not the reel:
 * the caller then films the next beat from words alone rather than from a black square.
 */
export async function lastFrame(blob) {
  return await Effect.runPromise(Effect.acquireUseRelease(
    Effect.sync(() => URL.createObjectURL(blob)),
    grab,
    (url) => Effect.sync(() => URL.revokeObjectURL(url)),
  ));
}

const STALE = { stale: true };
const tried = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e });
const attempt = (fx) => Effect.try({ try: fx, catch: (e) => e });
const mediaEvent = (v, name) => Effect.callback((resume) => {
  v[`on${name}`] = () => resume(Effect.succeed(true));
  v.onerror = () => resume(Effect.succeed(false));
}).pipe(Effect.timeoutOrElse({ duration: CONFIG.frame.waitMs, orElse: () => Effect.succeed(false) }));
const grab = (url) => attempt(() => {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  return v;
}).pipe(
  Effect.flatMap((v) => mediaEvent(v, "loadedmetadata").pipe(
    Effect.flatMap((meta) => !meta || !v.videoWidth ? Effect.succeed("") : attempt(() => { v.currentTime = Math.max(0, (v.duration || 0) - CONFIG.frame.tailSec); }).pipe(
      Effect.andThen(mediaEvent(v, "seeked")),
      Effect.flatMap((seeked) => !seeked ? Effect.succeed("") : attempt(() => {
        const c = document.createElement("canvas");
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        return c.toDataURL(CONFIG.frame.mime, CONFIG.frame.quality);
      })),
    )),
  )),
  Effect.catch(() => Effect.succeed("")),
);

/**
 * ONE prompt → N beats, one per chunk, from the edge's text cascade. A failure is not fatal: the reel falls
 * back to the prompt itself for every beat, which films the same idea N times — worse, but still a reel.
 */
export async function beatsFor(prompt, durationSec, locale = "en") {
  const n = Math.max(1, Math.ceil(durationSec / CHUNK_SEC));
  if (gate) return Array.from({ length: n }, (_, i) => `${prompt} — ${i + 1}`);
  try {
    const j = await taskCall("/task", { route: "/feed/scenario", body: { prompt, durationSec, locale } });
    const beats = Array.isArray(j?.beats) ? j.beats.filter((b) => typeof b === "string" && b.trim()) : [];
    if (!beats.length) throw new Error("no beats");
    return Array.from({ length: n }, (_, i) => beats[i] || prompt);
  } catch (e) {
    report("reel.scenario.fail", { reason: String(e?.message || e).slice(0, 40) });
    return Array.from({ length: n }, () => prompt);
  }
}

let runs = 0, live = null, ctl = null;   

/** Stop the reel where it stands; the chunks already filmed stay on the storyboard. */
export function stopReel() {
  runs++;
  ctl?.abort(); ctl = null;
  if (live) { cancelJob(BASE, live); live = null; }
  setJob({ phase: $reel.get().some((c) => c.status === "done") ? "done" : "idle", at: 0 });
}

/**
 * Film the whole reel: scenario first, then one chunk per beat, each starting from the previous chunk's last
 * frame. A newer tap supersedes an older reel (the `run` guard), exactly as a single shot does in state.js.
 */
export async function runReel({ prompt, firstFrame = "", locale = "en" }) {
  const words = String(prompt || "").trim();
  if (!words) return;
  const run = ++runs;
  ctl?.abort(); ctl = null;
  const seconds = $length.get();

  setJob({ phase: "writing", error: null, at: 0, of: 0 });
  $reel.set([]);
  const beats = await beatsFor(words, seconds, locale);
  if (run !== runs) return;

  $reel.set(beats.map((beat, n) => ({ i: n + 1, beat, status: "waiting", url: "", blob: null, thumb: "", dur: 0 })));
  setJob({ phase: "filming", at: 1, of: beats.length });

  const fresh = (v) => run === runs ? Effect.succeed(v) : Effect.fail(STALE);
  const broken = (i) => Effect.sync(() => { setChunk(i, { status: "error" }); return ""; });
  const mock = (i, carry) => Effect.sleep(CONFIG.gateDelayMs).pipe(
    Effect.andThen(Effect.suspend(() => fresh())),
    Effect.andThen(Effect.promise(async () => (await fetch(new URL("./assets/mock.webm", import.meta.url).href)).blob().catch(() => null))),
    Effect.map((blob) => {
      if (!blob) setChunk(i, { status: "error" });
      else setChunk(i, { status: "done", blob, url: URL.createObjectURL(blob), dur: 1.5, thumb: "" });
      return carry;
    }),
  );
  const shoot = (i, beatEn, carry) => tried(() => {
    const ac = ctl = new AbortController();
    return taskOne(CONFIG.task, { prompt: beatEn, seconds: CHUNK_SEC, ...(carry ? { image: carry } : {}) }, { signal: ac.signal, onStart: (id) => { if (run === runs) live = id; else cancelJob(BASE, id); } });
  }).pipe(
    Effect.tap(() => Effect.sync(() => { live = null; })),
    Effect.flatMap(fresh),
    Effect.flatMap((r) => r.status !== "done" || !r.blob || !r.blob.type.startsWith("video/") || r.blob.size < CONFIG.minClipBytes ? broken(i)
      : attempt(() => r.url || URL.createObjectURL(r.blob)).pipe(
        Effect.flatMap((url) => tried(() => lastFrame(r.blob)).pipe(
          Effect.flatMap(fresh),
          Effect.tap((thumb) => Effect.sync(() => setChunk(i, { status: "done", blob: r.blob, url, dur: r.dur || 0, thumb }))),
        )),
      )),
  );
  const film = (i, beat, carry) => tried(() => toEnglish(beat)).pipe(
    Effect.matchEffect({ onFailure: () => broken(i), onSuccess: (beatEn) => fresh(beatEn).pipe(Effect.flatMap((en) => shoot(i, en, carry))) }),
    Effect.catchIf((e) => e !== STALE, () => Effect.suspend(() => fresh()).pipe(Effect.andThen(Effect.sync(() => { live = null; })), Effect.andThen(broken(i)))),
  );
  const chunk = (carry, beat, n) => Effect.suspend(() => fresh()).pipe(
    Effect.andThen(Effect.sync(() => { setJob({ at: n + 1 }); setChunk(n + 1, { status: "filming" }); })),
    Effect.andThen(Effect.suspend(() => gate ? mock(n + 1, carry) : film(n + 1, beat, carry))),
  );
  await Effect.runPromise(Effect.reduce(beats, () => firstFrame, chunk).pipe(
    Effect.flatMap(fresh),
    Effect.tap(() => Effect.sync(() => {
      const made = $reel.get().filter((c) => c.status === "done").length;
      setJob({ phase: made ? "done" : "error", error: made ? null : "eFailed", at: 0 });
      report("reel.done", { of: beats.length, made, seconds });
    })),
    Effect.catchIf((e) => e === STALE, () => Effect.void),
  ));
}
