import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { taskOne, jobCode } from "/_rt/task.js";
import { mockArt, toDataURL } from "/_rt/intake.js";
import { session } from "/_rt/auth.js";
import { report } from "/_rt/telemetry.js";

export const MATERIALS = [
  { id: "lum", theme: "lum" }, { id: "paper", theme: "paper" }, { id: "ink", theme: "ink" }, { id: "chrome", theme: "mercury" },
  { id: "smoke", theme: "smoke" }, { id: "thread", theme: "thread" }, { id: "circuit", theme: "circuit" }, { id: "veil", theme: "veil" },
  { id: "ferro", theme: "ferro" }, { id: "porcelain", theme: "porcelain" }, { id: "sand", theme: "sand" },
];
export const foxOf = (theme) => `/_rt/theme-${theme}.webp`;
const FOX = foxOf("plain");   
const BASE = `${VPS_PROXY}/styles`;
const CONCURRENT = 4;          

const MOCK_STYLES = [{ id: "a1b2c3d4e5f60718", name: "Вітраж", prompt: "stained glass with dark lead lines", thumb: mockArt(9) }];
export const $src = atom(gate ? mockArt(5) : null);          
export const $tiles = atom({});                               
export const $styles = atom(gate ? MOCK_STYLES : []);         
export const $err = atom("");
export const tileKey = (mode, key) => `${mode}:${key}`;
const patchTile = (k, v) => $tiles.set({ ...$tiles.get(), [k]: { ...$tiles.get()[k], ...v } });

let run = 0;
const revoke = (u) => { if (u?.startsWith?.("blob:")) { try { URL.revokeObjectURL(u); } catch { } } };
export function setSource(url) {
  run++;
  revoke($src.get());
  for (const t of Object.values($tiles.get())) revoke(t.url);
  $src.set(url); $tiles.set({}); $err.set("");
}
export function clearSource() { setSource(null); }

/** A job per material (and per own style) for `mode`, CONCURRENT at a time; each tile lands the moment it is drawn. */
export async function splitAll(mode) {
  const src = $src.get(); if (!src) return;
  const r = ++run;
  const jobs = [...MATERIALS.map((m) => ({ key: m.id, body: { material: m.id } })), ...$styles.get().map((s) => ({ key: `own:${s.id}`, body: { material: "custom", style: s.prompt } }))];
  for (const j of jobs) patchTile(tileKey(mode, j.key), { state: "work", url: null });
  $err.set("");
  if (gate) {
    jobs.forEach((j, i) => setTimeout(() => { if (r === run) patchTile(tileKey(mode, j.key), { state: "done", url: mockArt(20 + i) }); }, 60 + i * 30));
    return;
  }
  let sent;
  try { sent = await toDataURL(src); } catch { $err.set("eImage"); for (const j of jobs) patchTile(tileKey(mode, j.key), { state: "fail" }); return; }
  const queue = [...jobs];
  const worker = async () => {
    for (let j = queue.shift(); j && r === run; j = queue.shift()) await draw(r, mode, j, sent.data);
  };
  await Promise.all(Array.from({ length: CONCURRENT }, worker));
}

/** One tile again (a failed one, or the person wants another take). */
export async function redraw(mode, key) {
  const src = $src.get(); if (!src) return;
  const own = key.startsWith("own:") ? $styles.get().find((s) => `own:${s.id}` === key) : null;
  const body = own ? { material: "custom", style: own.prompt } : { material: key };
  patchTile(tileKey(mode, key), { state: "work", url: null });
  if (gate) { setTimeout(() => patchTile(tileKey(mode, key), { state: "done", url: mockArt(40) }), 80); return; }
  let sent; try { sent = await toDataURL(src); } catch { patchTile(tileKey(mode, key), { state: "fail" }); return; }
  await draw(run, mode, { key, body }, sent.data);
}

async function draw(r, mode, j, image) {
  const k = tileKey(mode, j.key);
  let res;
  try { res = await taskOne("/task", { route: "/feed/image/material", body: { image, mode, seed: Math.floor(Math.random() * 1e9), ...j.body } }); }
  catch (e) { if (r === run) { patchTile(k, { state: "fail" }); const c = e.code || jobCode(e); if (c !== "eFailed") $err.set(c); report("prism.fail", { key: j.key, mode, code: c }); } return; }
  if (r !== run) return;
  if (res.status !== "done") { patchTile(k, { state: "fail" }); if (res.status === "busy") $err.set("eBusy"); return; }
  patchTile(k, { state: "done", url: res.url, blob: res.blob });
}

async function call(op, body = {}) {
  const r = await fetch(`${BASE}/${op}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sid: session.get()?.sid, ...body }), signal: AbortSignal.timeout(60_000) });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(j?.error || String(r.status)), { status: r.status, code: j?.error });
  return j;
}
export async function loadStyles() {
  if (gate || !session.get()?.sid) return;
  try { $styles.set((await call("list")).styles || []); } catch { }
}

async function thumbOf(blob, side = 256) {
  const bmp = await createImageBitmap(blob);
  const k = side / Math.max(bmp.width, bmp.height);
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.82, 0.7, 0.55]) {
    const url = c.toDataURL("image/webp", q);
    if (url.length * 0.75 < 60_000) return url;
  }
  return c.toDataURL("image/jpeg", 0.6);
}

/** Draw the fox in `prompt` (the preview the person judges before saving) → { url, thumb } or throws a code. */
export async function foxIn(prompt, mode) {
  if (gate) return { url: mockArt(33), thumb: mockArt(33) };
  const fox = await toDataURL(FOX, 512);
  let res;
  try { res = await taskOne("/task", { route: "/feed/image/material", body: { image: fox.data, material: "custom", style: prompt, mode, seed: 7 } }); }
  catch (e) { throw Object.assign(new Error("fox"), { code: e.code || jobCode(e) }); }
  if (res.status !== "done") throw Object.assign(new Error("fox"), { code: res.status === "busy" ? "eBusy" : "eFailed" });
  return { url: res.url, thumb: await thumbOf(res.blob) };
}

export async function saveStyle({ name, prompt, thumb }) {
  if (gate) { const s = { id: Math.random().toString(16).slice(2, 18).padEnd(16, "0"), name, prompt, thumb }; $styles.set([s, ...$styles.get()]); return s; }
  const s = await call("save", { name, prompt, thumb });
  $styles.set([s, ...$styles.get()]);
  return s;
}
export async function deleteStyle(id) {
  const before = $styles.get();
  $styles.set(before.filter((s) => s.id !== id));
  if (gate) return;
  try { await call("del", { id }); } catch { $styles.set(before); $err.set("eFailed"); }
}
