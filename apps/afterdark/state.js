import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { VPS_PROXY } from "/_rt/feed.js";
import { session } from "/_rt/auth.js";
import { gate } from "/_rt/gate.js";
import { CHARACTERS, registerChars } from "./characters.js";
import { DEFAULT_MOVES, MOVE_IDS, isMoveId } from "./dances.js";

const HOST = VPS_PROXY.replace(/\/feed$/, "");
const TINTS = ["#FF3EB5", "#39FF6A", "#F5B942", "#7C5CFF", "#22D3EE", "#FF6AD5", "#4ADE80", "#FB7185", "#FBBF24", "#38BDF8", "#F472B6", "#A3E635", "#F97316", "#2DD4BF", "#C084FC", "#FACC15"];
const JSON_H = { "content-type": "application/json" };
/** An edge row {char_id, name, kind, glb_url, avatar_url, created_at} → the grid's character. */
export const charOf = (r) => ({ id: `my-${r.char_id}`, name: r.name || "", tint: TINTS[parseInt(String(r.char_id).slice(-2), 36) % TINTS.length], kind: r.kind === "creature" ? "creature" : "human", glb: HOST + r.glb_url, avatar: r.avatar_url || "", ts: Date.parse(r.created_at) || Date.now() });

export const $myChars = persistentAtom("afterdark:myChars", "[]");
export function getMyChars() {
  let a; try { a = JSON.parse($myChars.get()); } catch { a = null; }
  return Array.isArray(a) ? a.filter((c) => c && typeof c.id === "string" && typeof c.glb === "string") : [];
}
const setMyChars = (list) => $myChars.set(JSON.stringify(list));
/** A body just finished (genchar.js) — the edge already holds the row; mirror it here. */
export const addMyChar = (c) => setMyChars([c, ...getMyChars().filter((x) => x.id !== c.id)]);
/** Forget a character here and on the edge (the .glb file stays, immutable and unlisted). */
export async function removeMyChar(id) {
  setMyChars(getMyChars().filter((x) => x.id !== id));
  const c = getCast().filter((x) => x !== id); if (c.length) setCast(c);
  if (gate) return;
  try { await fetch(`${VPS_PROXY}/character/mine/remove`, { method: "POST", headers: JSON_H, body: JSON.stringify({ id: id.replace(/^my-/, "") }) }); }
  catch {  }
}
/** The list from the edge for the current session (a no-op when nobody is signed in, or under the gate). */
export async function loadMyChars() {
  if (gate || !sidNow()) return;
  let r; try { r = await fetch(`${VPS_PROXY}/character/mine`); } catch { return; }   
  if (r.status === 401) { setMyChars([]); return; }                                   
  if (!r.ok) return;
  const j = await r.json().catch(() => null);
  if (Array.isArray(j?.characters)) setMyChars(j.characters.map(charOf));
}
const sidNow = () => { try { return localStorage.getItem("ms:gh:sid") || ""; } catch { return ""; } };
registerChars(getMyChars());
$myChars.listen(() => registerChars(getMyChars()));
if (!gate) {
  let loadedFor = sidNow();
  if (loadedFor) setTimeout(loadMyChars, 0);
  session.listen((s) => {
    const sid = s ? s.sid : "";
    if (sid === loadedFor) return;
    loadedFor = sid;
    if (s) loadMyChars(); else setMyChars([]);
  });
}

export const $genCharLoading = atom("");
export const $genCharPct = atom(0);
export const $genCharError = atom("");
export const $newChar = atom("");

export const MAX_CAST = 12;
export const DEFAULT_CAST = ["kaya", "michelle", "arissa"];
export const ALL_IDS = CHARACTERS.map((g) => g.id);
const allIds = () => [...ALL_IDS, ...getMyChars().map((c) => c.id)];
export const $cast = persistentAtom("afterdark:cast", JSON.stringify(DEFAULT_CAST));
export function getCast() {
  let a; try { a = JSON.parse($cast.get()); } catch { a = null; }
  const ok = allIds();
  a = Array.isArray(a) ? a.filter((id) => ok.includes(id)).slice(0, MAX_CAST) : [];
  return a.length ? a : DEFAULT_CAST.slice();
}
export const setCast = (next) => { if (next.length) $cast.set(JSON.stringify(next.slice(0, MAX_CAST))); };
/** Toggle a character; returns false when the cap refuses an addition (the tab shows the hint). */
export function toggleChar(id) {
  const c = getCast();
  if (c.includes(id)) { if (c.length > 1) setCast(c.filter((x) => x !== id)); return true; }
  if (c.length >= MAX_CAST) return false;
  setCast([...c, id]); return true;
}
/** A fresh crowd: MAX_CAST characters drawn at random from the whole library (and my own). */
export function mixCast(rand = Math.random) {
  const pool = allIds(); const out = [];
  while (out.length < MAX_CAST && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  setCast(out);
}

export const $moves = persistentAtom("afterdark:moves", JSON.stringify(DEFAULT_MOVES));
export function getMoves() {
  let a; try { a = JSON.parse($moves.get()); } catch { a = null; }
  a = Array.isArray(a) ? a.filter((id) => MOVE_IDS.includes(id) || isMoveId(id)) : [];
  return a.length ? a : DEFAULT_MOVES.slice();
}
export const setMoves = (next) => { if (next.length) $moves.set(JSON.stringify(next)); };
export function toggleMove(id) { const m = getMoves(); setMoves(m.includes(id) ? (m.length > 1 ? m.filter((x) => x !== id) : m) : [...m, id]); }
