import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { gate } from "/_rt/gate.js";
import { collection } from "/_rt/db.js";
import { dayKey } from "/_rt/calendar.js";
import { faceTracker } from "/_rt/face.js";
import { report } from "/_rt/telemetry.js";
import { repInit, repStep, tickOf } from "/_rt/zhym.js";

const SETS = collection("zhym");
const FRAME = 128;
const mock = (n) => new URL(`assets/mock-${n}.webp`, import.meta.url).href;

export const $goal = persistentAtom("zhym:goal", "100");
export const $sets = atom([]);
export const $model = atom(gate ? "ready" : "idle");
export const $run = atom(null);
export const $count = atom(gate ? 128 : 0);
export const $last = atom(gate ? { t0: 0, tb: 812.345, t1: 1466.465 } : null);
export const $read = atom(gate ? { eyes: { state: "closed", l: 0.08, r: 0.12 }, gaze: { dir: "dl" }, expr: { id: "strain" } } : null);
export const $pos = atom(gate ? 0.72 : null);
export const $meter = atom(gate ? { tick: 0.1, fps: 30, delegate: "GPU" } : null);
export const $pick = atom(null);

const FIX = [
  ["calm", "c", "open"], ["strain", "c", "closed"], ["open", "d", "open"], ["side", "l", "open"], ["strain", "dl", "closed"], ["calm", "c", "open"],
];
const EXPR = { calm: "calm", strain: "strain", open: "open", side: "calm" };

function fixture() {
  const today = new Date(), sets = [];
  const at = (d, h, m) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - d, h, m).getTime();
  const plan = [[0, 7, 42, 25], [0, 12, 10, 21], [0, 19, 5, 18], [1, 8, 0, 40], [1, 20, 30, 35], [2, 7, 15, 30], [2, 18, 0, 34], [3, 9, 0, 22], [5, 7, 30, 28], [6, 7, 0, 26], [9, 8, 0, 20], [12, 7, 45, 15]];
  plan.forEach(([d, h, m, n], k) => {
    const reps = [];
    let t = 1500 + k * 13.371;
    for (let i = 0; i < n; i++) {
      const slow = 1 + i / n * 0.6, down = (780 + (i * 37 % 90)) * slow + 0.123457 * i, up = (610 + (i * 53 % 80)) * slow + 0.654321 * i;
      const [face, gaze, eyes] = FIX[(i + k) % FIX.length];
      reps.push({
        t0: t, tb: t + down, t1: t + down + up,
        eyes: { state: eyes, l: eyes === "closed" ? 0.06 : 0.93, r: eyes === "closed" ? 0.11 : 0.9 },
        gaze: { dir: gaze }, expr: { id: EXPR[face], score: 0.62 }, frame: mock(face),
      });
      t += down + up + 380 + (i * 29 % 140);
    }
    const day = at(d, h, m);
    sets.push({ id: `s${day}`, day: dayKey(day), at: day, dur: t + 900.5, reps });
  });
  return sets.sort((a, b) => b.at - a.at);
}

/** Load every saved set into `$sets`, newest first (the fixture under the gate). */
export async function loadSets() {
  if (gate) { $sets.set(fixture()); return; }
  try { $sets.set((await SETS.all()).filter((s) => s && s.reps).sort((a, b) => b.at - a.at)); } catch { $sets.set([]); }
}

function measureTick() {
  const xs = new Array(2000);
  for (let i = 0; i < xs.length; i++) xs[i] = performance.now();
  return tickOf(xs);
}

let tracker = null, video = null, mirror = false, loopId = 0, st = null, tStart = 0, reps = [], cand = null, candRead = null, lastT = 0, gaps = [], lastPush = 0;
const canvas = () => { const c = document.createElement("canvas"); c.width = c.height = FRAME; return c; };
let frameCv = null;

function grab(box) {
  if (!video || !box) return;
  frameCv = frameCv || canvas();
  const vw = video.videoWidth, vh = video.videoHeight;
  const side = Math.min(vw, vh, Math.max(box.w * vw, box.h * vh) * 1.6);
  const cx = (box.x + box.w / 2) * vw, cy = (box.y + box.h / 2) * vh;
  const sx = Math.max(0, Math.min(vw - side, cx - side / 2)), sy = Math.max(0, Math.min(vh - side, cy - side / 2));
  const ctx = frameCv.getContext("2d");
  ctx.save();
  ctx.filter = "grayscale(1)";
  if (mirror) { ctx.translate(FRAME, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, sx, sy, side, side, 0, 0, FRAME, FRAME);
  ctx.restore();
  cand = true;
}

function onFrame(t) {
  const r = tracker.read(video, t);
  if (lastT) { gaps.push(t - lastT); if (gaps.length > 60) gaps.shift(); }
  lastT = t;
  if (t - lastPush > 100) {
    lastPush = t;
    $read.set(r);
    if (gaps.length > 10) {
      const g = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
      const m = $meter.get();
      if (g > 0) $meter.set({ ...m, fps: Math.round(1000 / g) });
    }
  }
  if (!$run.get() || !st) return;
  const e = repStep(st, r ? r.scale : 0, t);
  if (e.p != null) $pos.set(e.p);
  if (e.peak && r) { grab(r.box); candRead = r; }
  if (e.rep) {
    const pr = candRead || r || {};
    reps.push({
      t0: e.rep.t0 - tStart, tb: e.rep.tb - tStart, t1: e.rep.t1 - tStart,
      eyes: pr.eyes || null, gaze: pr.gaze ? { dir: pr.gaze.dir, x: pr.gaze.x, y: pr.gaze.y } : null,
      expr: pr.expr || null, frame: cand && frameCv ? frameCv.toDataURL("image/webp", 0.72) : null,
    });
    cand = null; candRead = null;
    $count.set(reps.length);
    $last.set(reps[reps.length - 1]);
  }
}

function loop() {
  const id = ++loopId;
  const v = video;
  if (!v || !tracker) return;
  if (typeof v.requestVideoFrameCallback === "function") {
    const step = (now, meta) => {
      if (id !== loopId || v !== video) return;
      try { onFrame(meta && (meta.captureTime || meta.expectedDisplayTime) || now); } catch (e) { report("zhym.frame", { msg: String(e && e.message || e) }); }
      v.requestVideoFrameCallback(step);
    };
    v.requestVideoFrameCallback(step);
  } else {
    const step = (now) => {
      if (id !== loopId || v !== video) return;
      if (v.readyState >= 2) try { onFrame(now); } catch { }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

/** Load the face tracker once; `$model` goes idle → loading → ready | error. */
export async function prepare() {
  if (gate || tracker || $model.get() === "loading") return;
  $model.set("loading");
  try {
    tracker = await faceTracker();
    $meter.set({ tick: measureTick(), fps: 0, delegate: tracker.delegate });
    $model.set("ready");
    loop();
  } catch (e) {
    report("zhym.model", { msg: String(e && e.message || e) });
    $model.set("error");
  }
}

/** Hand the playing camera element in (or null when it stops). */
export function attach(el, opts) {
  video = el;
  mirror = !!(opts && opts.mirror);
  loopId++;
  if (!el) return;
  if (tracker) loop(); else prepare();
}

/** Start a set: a fresh counter and the stopwatch from now. */
export function start() {
  if ($run.get()) return;
  st = repInit(); reps = []; cand = null; candRead = null;
  tStart = performance.now();
  $count.set(0); $last.set(null); $pos.set(null);
  $run.set({ t0: tStart, at: Date.now() });
}

/** The set's start on the page clock, for the stopwatch. */
export const clockStart = () => tStart;

/**
 * Finish the set and save it when it has reps.
 * @returns the number of reps saved
 */
export async function stop() {
  const run = $run.get();
  if (!run) return 0;
  const dur = performance.now() - run.t0;
  $run.set(null);
  $pos.set(null);
  st = null;
  if (gate || !reps.length) return gate ? $count.get() : 0;
  const set = { id: `s${run.at}`, day: dayKey(run.at), at: run.at, dur, reps };
  try { await SETS.put(set.id, set); } catch (e) { report("zhym.save", { msg: String(e && e.message || e), reps: reps.length }); }
  $sets.set([set, ...$sets.get()]);
  return reps.length;
}
