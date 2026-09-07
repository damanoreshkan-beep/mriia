import { atom, map } from "nanostores";
import { shell } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";

export const $state = atom({ running: false, peerCount: 0, maxHops: 0, myPeerID: "", nick: "" });
export const $peers = atom([]);          
export const $room = atom([]);           
export const $threads = map({});         
export const $queued = atom(false);      

const live = () => shell.present && shell.has("mesh.start");
const demo = () => gate || (typeof location !== "undefined" && /[?&](mock|demo)=/.test(location.search));
let cancels = [];

async function startLive() {
  const { peerID, nick } = await shell.call("mesh.start", {});
  $state.set({ ...$state.get(), running: true, myPeerID: peerID, nick });
  cancels.push(shell.subscribe("mesh.peers", {}, (list) => {
    const peers = list?.peers || [];
    $peers.set(peers);
    $state.set({ ...$state.get(), peerCount: peers.length, maxHops: Math.max(0, ...peers.map((p) => p.hops || 0)) });
  }));
  cancels.push(shell.subscribe("mesh.messages", {}, (m) => {
    if (m.kind === "private") {
      const t = $threads.get()[m.fromPeerID] || [];
      $threads.setKey(m.fromPeerID, [...t, { id: m.msgId, text: m.text, ts: m.ts, mine: false }]);
    } else {
      $room.set([...$room.get(), { id: m.msgId, from: m.fromPeerID, nick: m.nick, text: m.text, ts: m.ts, mine: false }]);
    }
  }));
  cancels.push(shell.subscribe("mesh.receipts", {}, (r) => {
    for (const [pid, arr] of Object.entries($threads.get())) {
      const i = arr.findIndex((x) => x.id === r.msgId);
      if (i >= 0) { const copy = arr.slice(); copy[i] = { ...copy[i], status: r.state }; $threads.setKey(pid, copy); }
    }
  }));
}

export async function start() {
  if ($state.get().running) return;
  if (demo()) return startMock();
  if (live()) return startLive();
  $state.set({ ...$state.get(), running: true, myPeerID: "", nick: $state.get().nick || "" });
}
export function stop() { cancels.forEach((c) => c && c()); cancels = []; }

export async function setNick(nick) {
  $state.set({ ...$state.get(), nick });
  if (live()) await shell.call("mesh.setNick", { name: nick });
}

export async function sendPublic(text) {
  text = text.trim(); if (!text) return;
  const msg = { id: rid(), from: $state.get().myPeerID, nick: $state.get().nick, text, ts: Date.now(), mine: true };
  $room.set([...$room.get(), msg]);
  $queued.set($state.get().peerCount === 0);       
  if (live()) await shell.call("mesh.sendPublic", { text });
}

export async function sendPrivate(peerID, text) {
  text = text.trim(); if (!text) return;
  const t = $threads.get()[peerID] || [];
  const msg = { id: rid(), text, ts: Date.now(), mine: true, status: "sent" };
  $threads.setKey(peerID, [...t, msg]);
  if (live()) await shell.call("mesh.sendPrivate", { peerID, text });
  else mockAck(peerID, msg.id);
}

const rid = () => Math.random().toString(36).slice(2, 10);

function startMock() {
  const me = "you";
  $state.set({ running: true, peerCount: 0, maxHops: 0, myPeerID: me, nick: $state.get().nick || "anon4f2a" });
  if (typeof location !== "undefined" && /[?&]mock=empty/.test(location.search)) return;
  const seed = () => {
    $peers.set([
      { peerID: "5aa3", nick: "anon5aa3", hops: 1, lastSeen: Date.now() },
      { peerID: "0f68", nick: "мандрівник", hops: 2, lastSeen: Date.now() - 8000 },
    ]);
    $state.set({ ...$state.get(), peerCount: 2, maxHops: 2 });
    $room.set([
      { id: "m1", from: "5aa3", nick: "anon5aa3", text: "є хтось поруч?", ts: Date.now() - 60000, mine: false },
      { id: "m2", from: "you", nick: "anon4f2a", text: "є, чую тебе", ts: Date.now() - 40000, mine: true },
      { id: "m3", from: "0f68", nick: "мандрівник", text: "передайте далі — я за два стрибки", ts: Date.now() - 20000, mine: false },
    ]);
    $threads.set({ "5aa3": [
      { id: "d1", text: "привіт напряму", ts: Date.now() - 30000, mine: false },
      { id: "d2", text: "привіт, шифровано", ts: Date.now() - 25000, mine: true, status: "read" },
    ] });
  };
  if (gate) { seed(); return; }        
  setTimeout(seed, 900);               
}
function mockAck(peerID, id) {
  const bump = (status, d) => setTimeout(() => {
    const arr = $threads.get()[peerID] || []; const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) { const c = arr.slice(); c[i] = { ...c[i], status }; $threads.setKey(peerID, c); }
  }, d);
  bump("delivered", 500); bump("read", 1400);
}
