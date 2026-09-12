import { VPS_PROXY } from "/_rt/feed.js";
import { startJob, follow } from "/_rt/imagejob.js";
import { toEnglish } from "/_rt/translate.js";
import { toDataURL } from "/_rt/intake.js";
import { session } from "/_rt/auth.js";
import { gate } from "/_rt/gate.js";
import { $genCharLoading, $genCharPct, $genCharError, $newChar, addMyChar, toggleChar, charOf } from "./state.js";

const IMG = `${VPS_PROXY}/image`, CHAR = `${VPS_PROXY}/character`;
const LOOK = ", full body head to toe, single character, standing A-pose with arms slightly out, facing camera, centered, plain white background, studio lighting, 3d game character render, no text";
const POLL = 3000, BUDGET = 20 * 60_000;              
const JOB_KEY = "afterdark:genJob", JOB_TTL = 60 * 60_000;   
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jobGet = () => { try { const j = JSON.parse(localStorage.getItem(JOB_KEY) || "null"); return j && typeof j.id === "string" && Date.now() - j.ts < JOB_TTL ? j : null; } catch { return null; } };
const jobSet = (j) => { try { j ? localStorage.setItem(JOB_KEY, JSON.stringify(j)) : localStorage.removeItem(JOB_KEY); } catch {  } };
const whoNow = () => session.get()?.user?.login || "";
let run = 0, t0 = 0;
export const genElapsed = () => (t0 ? (Date.now() - t0) / 1000 | 0 : 0);

function headShot(url) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => { try { const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h * 0.45); const c = document.createElement("canvas"); c.width = c.height = 96; c.getContext("2d").drawImage(img, (w - side) / 2, 0, side, side, 0, 0, 96, 96); ok(c.toDataURL("image/jpeg", 0.85)); } catch (e) { no(e); } };
    img.onerror = () => no(new Error("load failed"));
    img.src = url;
  });
}

async function followJob(id, alive, began) {
  while (Date.now() - began < BUDGET) {
    await sleep(POLL);
    if (!alive()) return;
    let j; try { j = await (await fetch(`${CHAR}/${id}`)).json(); } catch { continue; }
    if (!j) continue;
    if (j.status === "error") throw { code: "eFailed", why: j.error };
    if (j.status === "done") {
      const c = charOf(j);
      addMyChar(c); toggleChar(c.id); $newChar.set(c.id); $genCharLoading.set(""); jobSet(null);
      return c;
    }
    $genCharLoading.set(j.stage === "mesh" || j.stage === "rig" || j.stage === "store" ? j.stage : "queued");
    $genCharPct.set(j.pct || 0);
  }
  throw { code: "eTimeout" };
}
function fail(e, alive) {
  if (!alive()) return;
  jobSet(null);
  $genCharError.set(e?.code || "eFailed"); $genCharLoading.set("");
  if (e?.why) console.warn("[genchar]", e.why);
}

/** Make a character; resolves to it (also added to my characters and put on stage), or undefined on a failure (the error atom says why). */
export async function generateCharacter({ prompt, name, kind }) {
  if ($genCharLoading.get()) return;
  const my = ++run; t0 = Date.now();
  const alive = () => my === run;
  $genCharError.set(""); $genCharPct.set(0); $genCharLoading.set("picture");
  try {
    const en = await toEnglish(prompt);
    const job = await startJob(IMG, { prompt: en + LOOK, quality: "fast", aspect: "portrait", ratio: 0.75, seed: Math.floor(Math.random() * 1e9), k: 2 });
    let blob = null;
    const st = await follow({ base: IMG, job, alive, onLive: (l) => $genCharPct.set(l.pct || 0), onSlide: (s) => { blob ??= s.blob; } });
    if (!alive()) return;
    if (!blob) throw { code: st === "busy" ? "eBusy" : st === "timeout" ? "eTimeout" : "eFailed" };
    const url = URL.createObjectURL(blob);
    let image, avatar;
    try { image = (await toDataURL(url, 1024)).data; avatar = await headShot(url); } finally { URL.revokeObjectURL(url); }
    $genCharLoading.set("queued"); $genCharPct.set(0);
    const r = await fetch(CHAR, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, name, kind, avatar }) });
    const j0 = await r.json().catch(() => ({}));
    if (!(r.status === 202 || r.status === 409) || !j0.job) throw { code: r.status === 429 ? "eRate" : r.status === 401 ? "eSignIn" : "eFailed" };   
    const began = Date.now();
    jobSet({ id: j0.job, ts: began, user: whoNow() });
    return await followJob(j0.job, alive, began);
  } catch (e) { fail(e, alive); }
}

/** Pick up the job a previous page load left in flight (boot): the progress continues where it was. */
export function resumeGeneration() {
  if (gate || $genCharLoading.get()) return;
  const saved = jobGet();
  if (!saved) { jobSet(null); return; }
  const who = whoNow();
  if (saved.user && who && saved.user !== who) { jobSet(null); return; }   
  const my = ++run; t0 = saved.ts;
  const alive = () => my === run;
  $genCharError.set(""); $genCharPct.set(0); $genCharLoading.set("queued");
  followJob(saved.id, alive, saved.ts).catch((e) => fail(e, alive));
}

/** Forget the wait (the edge finishes on its own and keeps the body in my list; the picture race is not cancelled — its next call is the same job). */
export function cancelGenerate() { run++; t0 = 0; jobSet(null); $genCharLoading.set(""); $genCharPct.set(0); }

setTimeout(resumeGeneration, 0);   
