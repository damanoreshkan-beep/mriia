import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { report } from "/_rt/telemetry.js";
import { session } from "/_rt/auth.js";
import { fetchMyChars } from "/_rt/genchar.js";
import { readGltf, gltfStats, modelName } from "/_rt/glb.js";
import { Effect } from "/_rt/fx.js";
import { CONFIG } from "./config.js";

const SAMPLE = new URL("./assets/sample.glb", import.meta.url).href;

export const $st = atom({ phase: "empty", name: "", src: "", bytes: 0, stats: null, pct: null, error: "", size: null, clips: [], clip: 0, playing: false });
export const $mine = atom(null);   
export const $ar = atom({ ok: false, on: false });

export const patch = (p) => $st.set({ ...$st.get(), ...p });

let viewer = null, current = null, run = 0;

const fail = (r, code, info = {}) => {
  if (r !== run) return;
  current = null;
  patch({ phase: "error", error: code, pct: null, stats: null, size: null, clips: [], playing: false });
  report("obrys.fail", { reason: code, ...info });
};
const STALE = { stale: true };
const halt = (code, info) => ({ code, info });
const settle = (r, flow) => Effect.runPromise(flow.pipe(Effect.catch((e) => Effect.sync(() => { if (e !== STALE) fail(r, e.code, e.info); }))));

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
  await settle(r, Effect.tryPromise({ try: async () => new Uint8Array(await file.arrayBuffer()), catch: () => halt(CONFIG.download.unread, { src: "file", bytes: file.size }) }).pipe(
    Effect.map((buf) => open(r, buf, modelName(file.name), "file")),
  ));
}

/** Download with a live share when the server names the length. `src` = url · farm · sample. */
export async function openUrl(url, name, src = "url") {
  const r = ++run;
  patch({ phase: "loading", pct: 0, error: "", name: name || modelName(url) });
  const net = CONFIG.download;
  await settle(r, Effect.tryPromise({ try: async () => fetch(url), catch: () => halt(navigator.onLine === false ? net.offline : net.blocked[src] || net.refused, { src }) }).pipe(
    Effect.flatMap((res) => res.ok ? Effect.succeed(res) : Effect.fail(halt(net.codes[res.status] || net.refused, { src, status: res.status }))),
    Effect.flatMap((res) => download(res, r, src)),
    Effect.map((bytes) => open(r, bytes, name || modelName(url), src)),
  ));
}

function download(res, r, src) {
  const total = +res.headers.get("content-length") || 0, chunks = [];
  let got = 0;
  const lost = () => halt(CONFIG.download.refused, { src, got });
  const pull = (rd) => Effect.tryPromise({ try: async () => rd.read(), catch: lost }).pipe(
    Effect.flatMap(({ done, value }) => {
      if (done) return Effect.void;
      if (r !== run) return Effect.promise(() => rd.cancel()).pipe(Effect.andThen(Effect.fail(STALE)));
      return Effect.try({ try: () => {
        chunks.push(value); got += value.byteLength;
        patch({ pct: total ? Math.min(CONFIG.download.maxPct, Math.round((got / total) * 100)) : null });
      }, catch: lost }).pipe(Effect.andThen(Effect.suspend(() => pull(rd))));
    }),
  );
  return Effect.try({ try: () => res.body.getReader(), catch: lost }).pipe(
    Effect.flatMap(pull),
    Effect.map(() => {
      const bytes = new Uint8Array(got);
      let at = 0; for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
      return bytes;
    }),
  );
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
