import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { T } from "/_rt/i18n.js";
import { notify, notifyAsk } from "/_rt/notify.js";
import { holdBackground } from "/_rt/bghold.js";
import { taskOne, jobCode } from "/_rt/task.js";
import { mockArt, toDataURL } from "/_rt/intake.js";
import { report } from "/_rt/telemetry.js";
import { Effect } from "/_rt/fx.js";
import { CONFIG } from "./config.js";

const GATE_GLB = "data:model/gltf-binary;base64,Z2xURgIAAAA=";

export const $st = atom({
  phase: gate ? "done" : "empty",
  src: gate ? mockArt(5) : null,
  out: gate ? { url: GATE_GLB, bytes: 8_541_060, by: "gate" } : null,
  live: null, error: null, t0: 0,
});

export const patch = (p) => { const a = $st.get(); $st.set({ ...a, ...(typeof p === "function" ? p(a) : p) }); };
const revoke = (url) => { if (url?.startsWith?.("blob:")) { try { URL.revokeObjectURL(url); } catch { } } };

let run = 0, hold = null;

export function setSource(url) {
  const cur = $st.get();
  if (cur.out) revoke(cur.out.url);
  if (cur.src !== url) revoke(cur.src);
  patch({ src: url, phase: "ready", out: null, error: null, live: null });
}
export function clearSource() {
  const cur = $st.get(); if (cur.phase === "working") return;
  revoke(cur.src); if (cur.out) revoke(cur.out.url);
  patch({ src: null, phase: "empty", out: null, error: null, live: null });
}

const fail = (r, code) => { if (r !== run) return; patch({ phase: "error", error: code, live: null }); hold?.(); hold = null; report("mesh.fail", { reason: code }); };

export async function sculpt(ctx) {
  const st = $st.get();
  if (!st.src || st.phase === "working") return;
  const r = ++run;
  if (st.out) revoke(st.out.url);
  patch({ phase: "working", out: null, error: null, live: null, t0: Date.now() });
  if (gate) {
    await new Promise((ok) => setTimeout(ok, 350));
    if (r !== run) return;
    patch({ phase: "done", out: { url: GATE_GLB, bytes: 8_541_060, by: "gate" }, live: null });
    return;
  }
  await Effect.runPromise(encoded(st.src).pipe(
    Effect.tap(() => current(r)),
    Effect.tap(() => Effect.sync(() => { hold = holdBackground({ title: T(ctx.t, "title"), body: T(ctx.t, "working") }); })),
    Effect.flatMap((sent) => meshed(r, sent)),
    Effect.tap(() => current(r)),
    Effect.tap(() => Effect.sync(() => { hold?.(); hold = null; })),
    Effect.flatMap(verdict),
    Effect.tap((res) => Effect.sync(() => patch({ phase: "done", out: { url: res.url, bytes: res.blob.size, by: res.by }, live: null }))),
    Effect.as(true),
    Effect.catch((e) => (e === STALE ? Effect.succeed(false) : Effect.sync(() => { fail(r, e.code); return false; }))),
    Effect.flatMap((done) => (done ? announced(ctx) : Effect.void)),
  ));
}
const STALE = { stale: true };
const current = (r) => Effect.suspend(() => (r === run ? Effect.void : Effect.fail(STALE)));
const encoded = (src) => Effect.tryPromise({ try: async () => toDataURL(src), catch: () => ({ code: "eFailed" }) });
const meshed = (r, sent) => Effect.tryPromise({
  try: async () => taskOne(CONFIG.taskRoute, { route: CONFIG.route, body: { image: sent.data, model: CONFIG.model } }, {
    onLive: (live) => { if (r === run) patch({ live }); },
  }),
  catch: (e) => ({ code: e.code || jobCode(e) }),
});
const verdict = (res) => {
  const why = res.error || "";
  return res.status === "done" ? Effect.succeed(res)
    : Effect.fail({ code: res.status === "busy" ? "eBusy" : /content policy|rejected/i.test(why) ? "ePolicy" : /^site: /.test(why) ? "eFailed" : "eSite" });
};
const announced = (ctx) => Effect.suspend(() => (document.visibilityState !== "hidden" ? Effect.void
  : Effect.tryPromise({ try: async () => notifyAsk(), catch: (e) => e }).pipe(
    Effect.tap((ok) => Effect.sync(() => { if (ok) notify({ id: "lipka-done", title: T(ctx.t, "done"), body: T(ctx.t, "download") }).catch(() => {}); })),
  )));

export const liveOf = (live) => {
  const st = String(live?.stage || live?.phase || "");
  if (/queue|waiting/i.test(st)) return { key: "queued", pct: null };
  if (/enhance/i.test(st)) return { key: "enhancing", pct: null };
  if (/generating|dashboard/i.test(st)) return { key: "working", pct: live?.pct ?? null };
  return { key: "preparing", pct: null };
};
