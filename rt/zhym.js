/**
 * Default tuning of the push-up counter: the sliding window (ms), the least near/far ratio a rep must span,
 * the enter/leave/top thresholds as shares of the window's range, the smoothing weight and the shortest rep (ms).
 */
export const REP = { win: 8000, amp: 1.12, enter: 0.62, leave: 0.38, top: 0.25, alpha: 0.45, minRep: 350 };

/**
 * Nearness from one small camera frame: a face coming down onto the phone shades the lens, so the frame darkens.
 * @param px RGBA bytes of a downscaled frame
 * @returns 1000 / (mean luma + 4) — grows as the frame darkens, 0 for an empty buffer
 */
export function nearOf(px) {
  const n = px ? px.length >> 2 : 0;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  return 1000 / (sum / n + 4);
}

/**
 * A fresh counter state.
 * @returns the state `repStep` advances
 */
export function repInit() {
  return { phase: "up", buf: [], ema: 0, tTop: null, tb: 0, sb: 0, n: 0 };
}

/**
 * Advance the counter by one nearness sample: the face grows as the chest goes down to the phone.
 * @param st the state from `repInit` (advanced in place)
 * @param s the face's scale in the frame (bigger = nearer); 0 or less = no face, skipped
 * @param t the sample's time in ms
 * @param cfg tuning, `REP` by default
 * @returns `{ rep, peak, p }` — `rep` is `{ t0, tb, t1 }` when a push-up just completed, `peak` true on a new
 *   nearest point of the current descent, `p` the position 0 (top) .. 1 (bottom) or null before a range exists
 */
export function repStep(st, s, t, cfg = REP) {
  if (!(s > 0)) return { rep: null, peak: false, p: null };
  st.ema = st.ema ? st.ema + cfg.alpha * (s - st.ema) : s;
  st.buf.push({ t, v: st.ema });
  while (st.buf.length && st.buf[0].t < t - cfg.win) st.buf.shift();
  let lo = Infinity, hi = -Infinity;
  for (const b of st.buf) { if (b.v < lo) lo = b.v; if (b.v > hi) hi = b.v; }
  const ok = lo > 0 && hi >= lo * cfg.amp;
  const p = ok ? (st.ema - lo) / (hi - lo) : null;
  let rep = null, peak = false;
  if (st.phase === "up") {
    if (!ok || p <= cfg.top || st.tTop == null) st.tTop = t;
    if (ok && p >= cfg.enter) { st.phase = "down"; st.tb = t; st.sb = st.ema; peak = true; }
  } else {
    if (st.ema > st.sb) { st.sb = st.ema; st.tb = t; peak = true; }
    if (ok && p <= cfg.leave) {
      st.phase = "up";
      if (t - st.tTop >= cfg.minRep) { rep = { t0: st.tTop, tb: st.tb, t1: t }; st.n++; }
      st.tTop = t;
    }
  }
  return { rep, peak, p };
}

/**
 * One rep's tempo.
 * @param r `{ t0, tb, t1 }`
 * @returns `{ down, up, all }` in ms
 */
export function tempoOf(r) {
  return { down: r.tb - r.t0, up: r.t1 - r.tb, all: r.t1 - r.t0 };
}

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

/**
 * The numbers of one set.
 * @param set `{ dur, reps: [{ t0, tb, t1 }] }`
 * @returns `{ n, dur, avg, best, worst, down, up, rpm }` — times in ms, `rpm` reps per minute of the set
 */
export function setStats(set) {
  const reps = set && set.reps || [], tt = reps.map(tempoOf), all = tt.map((x) => x.all);
  const dur = set && set.dur || 0;
  return {
    n: reps.length,
    dur,
    avg: mean(all),
    best: all.length ? Math.min(...all) : 0,
    worst: all.length ? Math.max(...all) : 0,
    down: mean(tt.map((x) => x.down)),
    up: mean(tt.map((x) => x.up)),
    rpm: dur > 0 ? reps.length / (dur / 60000) : 0,
  };
}

/**
 * Reps per day.
 * @param sets `[{ day: "YYYY-MM-DD", reps }]`
 * @returns `{ [day]: reps }`
 */
export function dayTotals(sets) {
  const out = {};
  for (const s of sets || []) out[s.day] = (out[s.day] || 0) + (s.reps ? s.reps.length : 0);
  return out;
}

const prevDay = (key) => {
  const [y, m, d] = key.split("-").map(Number), dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

/**
 * Days in a row that reached the goal, ending today — or yesterday while today is still open.
 * @param totals `{ [day]: reps }`
 * @param goal reps per day
 * @param today "YYYY-MM-DD"
 * @returns the streak length
 */
export function goalStreak(totals, goal, today) {
  if (!(goal > 0)) return 0;
  let k = (totals[today] || 0) >= goal ? today : prevDay(today), n = 0;
  while ((totals[k] || 0) >= goal) { n++; k = prevDay(k); }
  return n;
}

/**
 * The all-time records.
 * @param sets every saved set
 * @returns `{ total, sets, days, bestSet, fastest }` — `fastest` the shortest rep in ms (0 with none)
 */
export function records(sets) {
  let total = 0, bestSet = 0, fastest = 0;
  const days = new Set();
  for (const s of sets || []) {
    const n = s.reps ? s.reps.length : 0;
    total += n;
    if (n > bestSet) bestSet = n;
    if (n) days.add(s.day);
    for (const r of s.reps || []) { const a = r.t1 - r.t0; if (a > 0 && (!fastest || a < fastest)) fastest = a; }
  }
  return { total, sets: (sets || []).length, days: days.size, bestSet, fastest };
}

/**
 * The stopwatch face to the microsecond.
 * @param ms elapsed milliseconds (fractional)
 * @returns "MM:SS.uuuuuu"
 */
export function fmtClock(ms) {
  const us = Math.max(0, Math.round((ms || 0) * 1000));
  const m = Math.floor(us / 60e6), s = Math.floor(us % 60e6 / 1e6), u = us % 1e6;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(u).padStart(6, "0")}`;
}

/**
 * A duration in seconds to the microsecond.
 * @param ms milliseconds (fractional)
 * @returns "S.uuuuuu"
 */
export function fmtSec(ms) {
  const us = Math.max(0, Math.round((ms || 0) * 1000));
  return `${Math.floor(us / 1e6)}.${String(us % 1e6).padStart(6, "0")}`;
}

/**
 * The clock's measured step: the smallest positive gap between consecutive readings.
 * @param samples timestamps in ms, in reading order
 * @returns the step in ms, 0 when no two readings differ
 */
export function tickOf(samples) {
  let best = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i] - samples[i - 1];
    if (d > 1e-9 && (!best || d < best)) best = d;
  }
  return best;
}
