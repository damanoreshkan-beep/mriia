import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { T } from "/_rt/i18n.js";
import { notify, notifyAsk } from "/_rt/notify.js";
import { holdBackground } from "/_rt/bghold.js";
import { taskOne, jobCode } from "/_rt/task.js";
import { mockArt, toDataURL } from "/_rt/intake.js";
import { report } from "/_rt/telemetry.js";

// the gate's finished mesh: a few bytes that start like a glb, so Download has a file to hand over
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

// The owner, 2026-10-17: lipka rides /feed/site3d (our upscale, then Prism 3.1 on 3daistudio.com — edge site3d.js)
// instead of /feed/mesh. No cancel: the route has none, and a second start while one runs follows the running job.
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
  let sent;
  try { sent = await toDataURL(st.src); } catch { return fail(r, "eFailed"); }
  if (r !== run) return;
  hold = holdBackground({ title: T(ctx.t, "title"), body: T(ctx.t, "working") });
  let res;
  try {
    res = await taskOne("/task", { route: "/feed/site3d", body: { image: sent.data, model: "Prism 3.1" } }, {
      onLive: (live) => { if (r === run) patch({ live }); },
    });
  } catch (e) { if (r === run) fail(r, e.code || jobCode(e)); return; }
  if (r !== run) return;
  hold?.(); hold = null;
  // Prism's NSFW filter refuses some photos outright; the edge hands its words on ("… content policy …")
  if (res.status !== "done") return fail(r, res.status === "busy" ? "eBusy" : /content policy|rejected/i.test(res.error || "") ? "ePolicy" : "eFailed");
  patch({ phase: "done", out: { url: res.url, bytes: res.blob.size, by: res.by }, live: null });
  if (document.visibilityState === "hidden") {
    if (await notifyAsk()) notify({ id: "lipka-done", title: T(ctx.t, "done"), body: T(ctx.t, "download") }).catch(() => {});
  }
}

// the edge's stages (site3d.js + the pod's site3d kind) → what the screen says; pct only while the model is made
export const liveOf = (live) => {
  const st = String(live?.stage || live?.phase || "");
  if (/queue|waiting/i.test(st)) return { key: "queued", pct: null };
  if (/enhance/i.test(st)) return { key: "enhancing", pct: null };
  if (/generating|dashboard/i.test(st)) return { key: "working", pct: live?.pct ?? null };
  return { key: "preparing", pct: null };
};
