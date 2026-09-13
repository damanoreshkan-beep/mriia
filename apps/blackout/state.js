import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { gate } from "/_rt/gate.js";
import { session } from "/_rt/auth.js";
import { fetchMyChars, removeChar } from "/_rt/genchar.js";

export const SKINS = [
  { id: "arissa", name: "Arissa", tint: "#F5B942", price: 0 },
  { id: "kaya", name: "Kaya", tint: "#FF3EB5", price: 20 },
  { id: "michelle", name: "Michelle", tint: "#39FF6A", price: 25 },
  { id: "eve", name: "Eve", tint: "#7C5CFF", price: 40 },
  { id: "sophie", name: "Sophie", tint: "#22D3EE", price: 60 },
  { id: "nightshade", name: "Nightshade", tint: "#FF6AD5", price: 80 },
  { id: "louise", name: "Louise", tint: "#4ADE80", price: 100 },
  { id: "kachujin", name: "Kachujin", tint: "#FB7185", price: 120 },
  { id: "jolleen", name: "Jolleen", tint: "#FBBF24", price: 150 },
  { id: "pirate", name: "Pirate", tint: "#38BDF8", price: 180 },
  { id: "akai", name: "Akai", tint: "#F472B6", price: 220 },
];
export const GEN_PRICE = 1000;   
const BUNDLED = new Set(["arissa"]);   

export const $myChars = persistentAtom("blackout:myChars", "[]");
export function myChars() { let a; try { a = JSON.parse($myChars.get()); } catch { a = null; } return Array.isArray(a) ? a.filter((c) => c && typeof c.id === "string" && typeof c.glb === "string") : []; }
const setMyChars = (list) => $myChars.set(JSON.stringify(list));
export const addMyChar = (c) => setMyChars([c, ...myChars().filter((x) => x.id !== c.id)]);
export async function removeMyChar(id) {
  setMyChars(myChars().filter((x) => x.id !== id));
  if ($skin.get() === id) $skin.set("arissa");
  if (!gate) await removeChar(id);
}
const sidNow = () => { try { return localStorage.getItem("ms:gh:sid") || ""; } catch { return ""; } };
async function loadMyChars() { const list = await fetchMyChars(); if (list) setMyChars(list); }
if (!gate) {
  let loadedFor = sidNow();
  if (loadedFor) setTimeout(loadMyChars, 0);   
  session.listen((s) => { const sid = s ? s.sid : ""; if (sid === loadedFor) return; loadedFor = sid; if (s) loadMyChars(); else setMyChars([]); });
}

export const skinById = (id) => SKINS.find((s) => s.id === id) || myChars().find((c) => c.id === id) || SKINS[0];   
export const avatarUrl = (id) => { const s = skinById(id); return s.avatar || new URL(`assets/av-${s.id}.png`, import.meta.url).href; };
export const glbUrl = (id) => { const s = skinById(id); if (s.glb) return s.glb; return new URL(BUNDLED.has(s.id) ? `assets/${s.id}.glb` : `../afterdark/assets/${s.id}.glb`, import.meta.url).href; };

const NS = "blackout:";
export const $best = persistentAtom(`${NS}best`, "0");
export const $coins = persistentAtom(`${NS}coins`, "0");
export const $runs = persistentAtom(`${NS}runs`, "0");
export const $skin = persistentAtom(`${NS}skin`, "arissa");
export const $owned = persistentAtom(`${NS}owned`, '["arissa"]');
export const owned = () => { try { const a = JSON.parse($owned.get()); return Array.isArray(a) ? a : ["arissa"]; } catch { return ["arissa"]; } };
export const coins = () => +$coins.get() || 0;
/** Take `n` coins from the wallet; false when it cannot afford them. */
export function spend(n) { const c = coins(); if (c < n) return false; $coins.set(String(c - n)); return true; }
export const refund = (n) => $coins.set(String(coins() + n));

export const $state = atom(gate ? "run" : "idle");
export const $run = atom(gate ? { frame: 240, dist: 128, coins: 7, speed: 7.1, fps: 0, lane: 1, near: 0.35 } : { frame: 0, dist: 0, coins: 0, speed: 0, fps: 0, lane: 1, near: 0 });
export const $phys = atom(gate ? "skipped" : "loading");
export const $why = atom("");
export const $last = atom({ dist: 0, coins: 0, record: false });   

export const $genLoading = atom("");
export const $genPct = atom(0);
export const $genError = atom("");
export const $newChar = atom("");

if (gate) { $coins.set("1250"); $best.set("340"); $owned.set('["arissa"]'); $skin.set("arissa"); $myChars.set('[{"id":"my-gate1","name":"Nox","tint":"#7C5CFF","kind":"human","glb":"about:blank","avatar":"","ts":0}]'); }

export function pickSkin(id) {
  const s = skinById(id), have = owned();
  if (!s.glb && !have.includes(s.id)) {
    if (!spend(s.price)) return false;
    $owned.set(JSON.stringify([...have, s.id]));
  }
  $skin.set(s.id);
  return true;
}

export function finishRun(dist, coinsGot) {
  const d = Math.round(dist), record = d > (+$best.get() || 0);
  if (record) $best.set(String(d));
  $coins.set(String(coins() + coinsGot));
  $runs.set(String((+$runs.get() || 0) + 1));
  $last.set({ dist: d, coins: coinsGot, record });
  $state.set("over");
}
