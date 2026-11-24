import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { gate } from "/_rt/gate.js";
import { collection } from "/_rt/db.js";
import { dayKey } from "/_rt/calendar.js";
import { report } from "/_rt/telemetry.js";
import { nearOf, repInit, repStep, tickOf } from "/_rt/zhym.js";

const SETS = collection("zhym");
const FRAME = 128;
const PROBE = 24;
const mock = (n) => new URL(`assets/mock-${n}.webp`, import.meta.url).href;

export const $goal = persistentAtom("zhym:goal", "100");
export const $sets = atom([]);
export const $cam = atom(gate);
export const $run = atom(null);
export const $count = atom(gate ? 128 : 0);
export const $last = atom(gate ? { t0: 0, tb: 812.345, t1: 1466.465 } : null);
export const $pos = atom(gate ? 0.72 : null);
export const $meter = atom(gate ? { tick: 0.1, fps: 30 } : null);
export const $pick = atom(null);

const FACES = ["calm", "strain", "open", "side", "strain", "calm"];

function fixture() {
  const today = new Date(), sets = [];
  const at = (d, h, m) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - d, h, m).getTime();
  const plan = [[0, 7, 42, 25], [0, 12, 10, 21], [0, 19, 5, 18], [1, 8, 0, 40], [1, 20, 30, 35], [2, 7, 15, 30], [2, 18, 0, 34], [3, 9, 0, 22], [5, 7, 30, 28], [6, 7, 0, 26], [9, 8, 0, 20], [12, 7, 45, 15]];
  plan.forEach(([d, h, m, n], k) => {
    const reps = [];
    let t = 1500 + k * 13.371;
    for (let i = 0; i < n; i++) {
      const slow = 1 + i / n * 0.6, down = (780 + (i * 37 % 90)) * slow + 0.123457 * i, up = (610 + (i * 53 % 80)) * slow + 0.654321 * i;
      reps.push({ t0: t, tb: t + down, t1: t + down + up, frame: mock(FACES[(i + k) % FACES.length]) });
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

let video = null, mirror = false, loopId = 0, st = null, tStart = 0, reps = [], cand = false, lastT = 0, gaps = [], lastPush = 0;
let probeCv = null, probeCtx = null, frameCv = null;

function near() {
  if (!probeCv) {
    probeCv = document.createElement("canvas");
    probeCv.width = probeCv.height = PROBE;
    probeCtx = probeCv.getContext("2d", { willReadFrequently: true });
  }
  probeCtx.drawImage(video, 0, 0, PROBE, PROBE);
  return nearOf(probeCtx.getImageData(0, 0, PROBE, PROBE).data);
}

function grab() {
  if (!frameCv) { frameCv = document.createElement("canvas"); frameCv.width = frameCv.height = FRAME; }
  const vw = video.videoWidth, vh = video.videoHeight, side = Math.min(vw, vh);
  const ctx = frameCv.getContext("2d");
  ctx.save();
  ctx.filter = "grayscale(1)";
  if (mirror) { ctx.translate(FRAME, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, FRAME, FRAME);
  ctx.restore();
  cand = true;
}

function onFrame(t) {
  if (lastT) { gaps.push(t - lastT); if (gaps.length > 60) gaps.shift(); }
  lastT = t;
  if (t - lastPush > 500 && gaps.length > 10) {
    lastPush = t;
    const g = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
    if (g > 0) $meter.set({ ...$meter.get(), fps: Math.round(1000 / g) });
  }
  if (!$run.get() || !st || !video.videoWidth) return;
  const e = repStep(st, near(), t);
  if (e.p != null) $pos.set(e.p);
  if (e.peak) grab();
  if (e.rep) {
    reps.push({ t0: e.rep.t0 - tStart, tb: e.rep.tb - tStart, t1: e.rep.t1 - tStart, frame: cand ? frameCv.toDataURL("image/webp", 0.72) : null });
    cand = false;
    $count.set(reps.length);
    $last.set(reps[reps.length - 1]);
  }
}

function loop() {
  const id = ++loopId, v = video;
  if (!v) return;
  const tick = (t) => { try { onFrame(t); } catch (e) { report("zhym.frame", { msg: String(e && e.message || e).slice(0, 200) }); } };
  if (typeof v.requestVideoFrameCallback === "function") {
    const step = (now, meta) => {
      if (id !== loopId || v !== video) return;
      tick(meta && (meta.captureTime || meta.expectedDisplayTime) || now);
      v.requestVideoFrameCallback(step);
    };
    v.requestVideoFrameCallback(step);
  } else {
    const step = (now) => {
      if (id !== loopId || v !== video) return;
      if (v.readyState >= 2) tick(now);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

/** Hand the playing camera element in (or null when it stops). */
export function attach(el, opts) {
  video = el;
  mirror = !!(opts && opts.mirror);
  loopId++;
  $cam.set(gate || !!el);
  if (!el || gate) return;
  if (!$meter.get()) $meter.set({ tick: measureTick(), fps: 0 });
  loop();
}

/** Start a set: a fresh counter and the stopwatch from now. */
export function start() {
  if ($run.get()) return;
  st = repInit(); reps = []; cand = false;
  tStart = performance.now();
  $count.set(0); $last.set(null); $pos.set(null);
  $run.set({ t0: tStart, at: Date.now() });
}

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
