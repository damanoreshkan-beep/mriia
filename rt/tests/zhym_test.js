import { assert, assertEquals } from "jsr:@std/assert@1";
import { REP, dayTotals, fmtClock, fmtSec, goalStreak, records, repInit, repStep, setStats, tempoOf, tickOf } from "../zhym.js";

const pushups = (n, { far = 0.12, close = 0.2, down = 900, up = 700, rest = 400, hz = 30, noise = 0 } = {}) => {
  const out = [];
  let t = 0, seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const hold = (ms, v) => { for (let k = 0; k < ms * hz / 1000; k++) { out.push([v + noise * rnd(), t]); t += 1000 / hz; } };
  const ramp = (ms, a, b) => { const k = ms * hz / 1000; for (let i = 0; i < k; i++) { out.push([a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * i / k)) + noise * rnd(), t]); t += 1000 / hz; } };
  hold(1500, far);
  for (let i = 0; i < n; i++) { ramp(down, far, close); ramp(up, close, far); hold(rest, far); }
  hold(1000, far);
  return out;
};
const run = (samples, cfg) => {
  const st = repInit(), reps = [];
  let peaks = 0;
  for (const [s, t] of samples) { const e = repStep(st, s, t, cfg); if (e.rep) reps.push(e.rep); if (e.peak) peaks++; }
  return { st, reps, peaks };
};

Deno.test("zhym: counts every push-up of a clean set, once", () => {
  const { st, reps } = run(pushups(12));
  assertEquals(reps.length, 12);
  assertEquals(st.n, 12);
});

Deno.test("zhym: counts through camera noise and slow reps", () => {
  assertEquals(run(pushups(10, { noise: 0.006 })).reps.length, 10);
  assertEquals(run(pushups(5, { down: 2500, up: 2200, rest: 800 })).reps.length, 5);
});

Deno.test("zhym: a still face or a shallow nod is not a push-up", () => {
  assertEquals(run(pushups(0, { noise: 0.004 })).reps.length, 0);
  assertEquals(run(pushups(8, { far: 0.15, close: 0.16 })).reps.length, 0);
});

Deno.test("zhym: frames without a face are skipped, not counted as far", () => {
  const s = pushups(6).map(([v, t], i) => [i % 5 === 3 ? 0 : v, t]);
  assertEquals(run(s).reps.length, 6);
});

Deno.test("zhym: a rep's times are ordered and its bottom is the nearest point", () => {
  const { reps, peaks } = run(pushups(4, { down: 1000, up: 600 }));
  assert(peaks >= 4);
  for (const r of reps) {
    assert(r.t0 < r.tb && r.tb < r.t1, JSON.stringify(r));
    const tt = tempoOf(r);
    assert(tt.down > 500 && tt.down < 1300, `down ${tt.down}`);
    assert(tt.up > 150 && tt.up < 800, `up ${tt.up}`);
    assertEquals(tt.all, tt.down + tt.up);
  }
});

Deno.test("zhym: the tuning is exported and a too-short twitch is dropped", () => {
  assert(REP.enter > REP.leave && REP.leave > REP.top);
  assertEquals(run(pushups(3, { down: 120, up: 120, rest: 300 })).reps.length, 0);
});

Deno.test("zhym: setStats, dayTotals, records", () => {
  const set = { day: "2026-11-24", dur: 60000, reps: [{ t0: 0, tb: 800, t1: 1500 }, { t0: 2000, tb: 3000, t1: 3900 }] };
  const s = setStats(set);
  assertEquals([s.n, s.avg, s.best, s.worst, s.down, s.up, s.rpm], [2, 1700, 1500, 1900, 900, 800, 2]);
  assertEquals(setStats({ reps: [] }).avg, 0);
  assertEquals(dayTotals([set, set, { day: "2026-11-23", reps: [] }]), { "2026-11-24": 4, "2026-11-23": 0 });
  assertEquals(records([set, { day: "2026-11-23", reps: [] }]), { total: 2, sets: 2, days: 1, bestSet: 2, fastest: 1500 });
});

Deno.test("zhym: goalStreak counts back from today, or from yesterday while today is open", () => {
  const tot = { "2026-11-24": 50, "2026-11-23": 100, "2026-11-22": 120, "2026-11-21": 10, "2026-03-01": 100, "2026-02-28": 100 };
  assertEquals(goalStreak(tot, 100, "2026-11-24"), 2);
  assertEquals(goalStreak({ ...tot, "2026-11-24": 100 }, 100, "2026-11-24"), 3);
  assertEquals(goalStreak(tot, 100, "2026-03-01"), 2);
  assertEquals(goalStreak(tot, 0, "2026-11-24"), 0);
});

Deno.test("zhym: the clock shows microseconds, rounded, never negative", () => {
  assertEquals(fmtClock(0), "00:00.000000");
  assertEquals(fmtClock(83456.7891), "01:23.456789");
  assertEquals(fmtClock(3600000.0004), "60:00.000000");
  assertEquals(fmtClock(-5), "00:00.000000");
  assertEquals(fmtSec(812.3456), "0.812346");
  assertEquals(fmtSec(12000), "12.000000");
});

Deno.test("zhym: tickOf measures the clock's step", () => {
  assertEquals(tickOf([0, 0, 0.1, 0.1, 0.2, 0.5]), 0.1);
  assertEquals(tickOf([1, 1, 1]), 0);
  assertEquals(tickOf([]), 0);
});
