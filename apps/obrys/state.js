import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { report } from "/_rt/telemetry.js";
import { session } from "/_rt/auth.js";
import { fetchMyChars } from "/_rt/genchar.js";
import { readGltf, gltfStats, modelName } from "/_rt/glb.js";

const SAMPLE = new URL("./assets/sample.glb", import.meta.url).href;

// phase: empty · loading · ready · error. `pct` is the download share (null = reading, no total known);
// `size` and `clips` come from the 3D stage once it has the model (stats come from the file before that).
export const $st = atom({ phase: "empty", name: "", src: "", bytes: 0, stats: null, pct: null, error: "", size: null, clips: [], clip: 0, playing: false });
export const $mine = atom(null);   // null = not asked · { signedIn, list: null (loading) | [] | false (offline) }
export const $ar = atom({ ok: false, on: false });

export const patch = (p) => $st.set({ ...$st.get(), ...p });

let viewer = null, current = null, run = 0;

const fail = (r, code, info = {}) => {
  if (r !== run) return;
  current = null;
  patch({ phase: "error", error: code, pct: null, stats: null, size: null, clips: [], playing: false });
  report("obrys.fail", { reason: code, ...info });
};

async function show(m) {
  if (!viewer || !m) return;
  let r;
  try { r = await viewer.load(m.bytes); } catch (e) { return fail(m.run, "eParse", { why: String(e?.message || e).slice(0, 120), bytes: m.bytes.byteLength }); }
  if (m.run !== run) return;
  const st = $st.get(), clip = Math.min(st.clip, Math.max(0, r.clips.length - 1)), playing = r.clips.length > 0;
  patch({ size: r.size, clips: r.clips, clip, playing });
  if (playing) viewer.play(clip);
}

/** The 3D stage mounted (or remounted after a tab switch): it gets the model already open. */
export function attach(v) { viewer = v; show(current); }
export function detach(v) { if (viewer === v) viewer = null; }
export const stage = () => viewer;

function open(r, bytes, name, src) {
  if (r !== run) return;
  const g = readGltf(bytes);
  if (!g) return fail(r, "eFormat", { src, bytes: bytes.byteLength });
  const stats = gltfStats(g.json);
  if (!g.binary && stats.external) return fail(r, "eExternal", { src });
  current = { bytes, run: r };
  patch({ phase: "ready", name: name || "", src, bytes: bytes.byteLength, stats, pct: null, error: "", size: null, clips: [], clip: 0, playing: false });
  show(current);
}

export async function openFile(file) {
  if (!file) return;
  const r = ++run;
  patch({ phase: "loading", pct: null, error: "", name: modelName(file.name) });
  let buf;
  try { buf = new Uint8Array(await file.arrayBuffer()); } catch { return fail(r, "eRead", { src: "file", bytes: file.size }); }
  open(r, buf, modelName(file.name), "file");
}

/** Download with a live share when the server names the length. `src` = url · farm · sample. */
export async function openUrl(url, name, src = "url") {
  const r = ++run;
  patch({ phase: "loading", pct: 0, error: "", name: name || modelName(url) });
  let res;
  // a fetch that throws while online is almost always CORS: the site does not let another page read the file
  try { res = await fetch(url); } catch { return fail(r, navigator.onLine === false ? "eNetwork" : src === "url" ? "eCors" : "eNetwork", { src }); }
  if (!res.ok) return fail(r, res.status === 404 ? "eGone" : "eNetwork", { src, status: res.status });
  const total = +res.headers.get("content-length") || 0, chunks = [];
  let got = 0;
  try {
    const rd = res.body.getReader();
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      if (r !== run) return rd.cancel();
      chunks.push(value); got += value.byteLength;
      patch({ pct: total ? Math.min(99, Math.round((got / total) * 100)) : null });
    }
  } catch { return fail(r, "eNetwork", { src, got }); }
  const bytes = new Uint8Array(got);
  let at = 0; for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  open(r, bytes, name || modelName(url), src);
}

export function clear() { run++; current = null; patch({ phase: "empty", name: "", src: "", bytes: 0, stats: null, pct: null, error: "", size: null, clips: [], clip: 0, playing: false }); }

export function playClip(i) {
  const { clips } = $st.get();
  if (!clips.length) return;
  const clip = (i + clips.length) % clips.length;
  patch({ clip, playing: true });
  viewer?.play(clip);
}
export function togglePlay() {
  const st = $st.get();
  if (!st.clips.length) return;
  viewer?.setPaused(st.playing);
  patch({ playing: !st.playing });
}

// the sid is the signed-in fact (blackout's rule): the session ATOM stays null until something calls restore(),
// and on a plain page nothing does — measured 2026-10-26: sid present, /character/mine 200, session.get() null
const sidNow = () => { try { return localStorage.getItem("ms:gh:sid") || ""; } catch { return ""; } };

/** The characters this account made on the farm (genchar's list); signed out → the sheet asks to sign in. */
export async function loadMine() {
  if (gate) { $mine.set({ signedIn: true, list: [{ id: "my-sample", name: "Obrys", glb: SAMPLE, avatar: "" }] }); return; }
  if (!session.get() && !sidNow()) { $mine.set({ signedIn: false, list: [] }); return; }
  $mine.set({ signedIn: true, list: null });
  const list = await fetchMyChars();
  $mine.set({ signedIn: true, list: list === null ? false : list });
}

if (gate) openUrl(SAMPLE, "Obrys", "sample");
