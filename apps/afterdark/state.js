import { persistentAtom } from "@nanostores/persistent";
import { CHARACTERS } from "./characters.js";
import { DEFAULT_MOVES, MOVE_IDS, isMoveId } from "./dances.js";

export const MAX_CAST = 12;
export const DEFAULT_CAST = ["kaya", "michelle", "arissa"];
export const ALL_IDS = CHARACTERS.map((g) => g.id);
export const $cast = persistentAtom("afterdark:cast", JSON.stringify(DEFAULT_CAST));
export function getCast() {
  let a; try { a = JSON.parse($cast.get()); } catch { a = null; }
  a = Array.isArray(a) ? a.filter((id) => ALL_IDS.includes(id)).slice(0, MAX_CAST) : [];
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
/** A fresh crowd: MAX_CAST characters drawn at random from the whole library. */
export function mixCast(rand = Math.random) {
  const pool = ALL_IDS.slice(); const out = [];
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
