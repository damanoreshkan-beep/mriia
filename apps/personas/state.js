import { atom } from "nanostores";
import { gate } from "/_rt/gate.js";
import { session } from "/_rt/auth.js";
import { authWall } from "/_rt/authwall.js";
import { askAI } from "/_rt/ai-core.js";
import { collection, idbSupported } from "/_rt/db.js";
import { toDataURL } from "/_rt/intake.js";
import { taskOne, taskSlides, jobCode } from "/_rt/task.js";
import { FIXTURE, GATE_REPLY } from "./fixture.js";

const CFG = {
  task: "/task",
  image: { route: "/feed/image", quality: "fast", aspect: "portrait", ratio: 0.75, k: 2 },
  mesh: "/feed/mesh",
  half: 4,
  side: 640,
  look: ", head and shoulders portrait photo, looking at the camera, natural soft daylight, realistic skin texture, plain softly blurred background, 50mm, photorealistic, adult",
};

const PEOPLE = collection("personas");
const GROUP = collection("personas-group");

export const $group = atom(gate ? FIXTURE.group : null);
export const $people = atom(gate ? FIXTURE.people : []);
export const $busy = atom("");
export const $error = atom("");
export const $mesh = atom({});

const signedIn = () => gate || !!session.get()?.sid;
const wall = () => { authWall.set(authWall.get() + 1); $error.set("eSignIn"); };
const save = (p) => { if (!gate && idbSupported) PEOPLE.put(p.id, p).catch(() => {}); };
const patch = (id, fn) => {
  let next = null;
  $people.set($people.get().map((p) => (p.id === id ? (next = { ...p, ...fn(p) }) : p)));
  if (next) save(next);
  return next;
};

export async function boot() {
  if (gate || !idbSupported) return;
  try {
    const [g] = await GROUP.all();
    if (!g) return;
    const all = (await PEOPLE.all()).filter((p) => p.group === g.id).sort((a, b) => a.n - b.n);
    $group.set(g); $people.set(all);
    all.filter((p) => !p.photo).forEach((p) => portraits.push(p.id));
    pumpPortraits();
  } catch { }
}

const str = (v, cap = 220) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, cap);
export function personsOf(text) {
  let j = null;
  try { const m = String(text || "").match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : null; } catch { }
  const list = Array.isArray(j?.people) ? j.people : [];
  return list
    .map((x) => ({ name: str(x?.name, 60), age: Math.round(Number(x?.age) || 0), city: str(x?.city, 60), job: str(x?.job, 120), money: str(x?.money), media: str(x?.media), spends: str(x?.spends), hides: str(x?.hides), look: str(x?.look, 400) }))
    .filter((x) => x.name && x.age >= 18 && x.age < 100);
}

export const dossierOf = (p, loc) => (loc === "uk"
  ? `ДОСЬЄ\nІм'я: ${p.name}\nВік: ${p.age}\nМісто: ${p.city}\nРобота: ${p.job}\nГроші: ${p.money}\nМедіа щодня: ${p.media}\nОстанні витрати: ${p.spends}\nПриховує: ${p.hides}`
  : `DOSSIER\nName: ${p.name}\nAge: ${p.age}\nCity: ${p.city}\nJob: ${p.job}\nMoney: ${p.money}\nDaily media: ${p.media}\nLast spending: ${p.spends}\nHides: ${p.hides}`);

const askOf = (who, n, half, loc) => (loc === "uk"
  ? `ХТО: ${who}\nСКІЛЬКИ: ${n}\nВЖЕ Є: —\nЦЯ ПОЛОВИНА: ${half ? "старші, з краю аудиторії, байдужі або скептики" : "молодші, з самого ядра аудиторії"}`
  : `WHO: ${who}\nCOUNT: ${n}\nALREADY: —\nTHIS HALF: ${half ? "older, at the edge of the audience, indifferent or sceptical" : "younger, at the very core of the audience"}`);

export async function gather(who, loc) {
  const line = str(who, 200);
  if (!line || $busy.get()) return;
  if (!signedIn()) return wall();
  $error.set(""); $busy.set("crowd");
  if (gate) { $busy.set(""); return; }
  const halves = await Promise.all([0, 1].map((h) => askAI(askOf(line, CFG.half, h, loc), loc, "crowd", {}).then((r) => personsOf(r.text), (e) => (e?.status === 401 ? null : []))));
  if (halves.includes(null)) { $busy.set(""); return wall(); }
  const seen = new Set();
  const found = halves.flat().filter((p) => !seen.has(p.name) && seen.add(p.name));
  if (!found.length) { $busy.set(""); $error.set("eCrowd"); return; }
  const g = { id: "g" + Date.now().toString(36), who: line, loc, idea: "", ts: Date.now() };
  const people = found.map((p, n) => ({ ...p, id: `${g.id}-${n}`, group: g.id, n, photo: "", turns: [], price: null, quote: "" }));
  if (idbSupported) {
    try { for (const old of await PEOPLE.all()) await PEOPLE.remove(old.id); await GROUP.clear(); await GROUP.put(g.id, g); } catch { }
  }
  $group.set(g); $people.set(people); people.forEach(save);
  $busy.set("");
  portraits.push(...people.map((p) => p.id));
  pumpPortraits();
}

const portraits = [];
let drawing = 0;
const DRAW_AT_ONCE = 2;
function pumpPortraits() {
  while (drawing < DRAW_AT_ONCE && portraits.length) {
    const id = portraits.shift();
    const p = $people.get().find((x) => x.id === id);
    if (!p || p.photo) continue;
    drawing++;
    portrait(p).finally(() => { drawing--; pumpPortraits(); });
  }
}
async function portrait(p) {
  patch(p.id, () => ({ drawing: true, photoFail: false }));
  let first = null;
  try {
    await taskSlides(CFG.image.route, { ...CFG.image, prompt: str(p.look, 400) + CFG.look, seed: Math.floor(Math.random() * 1e9) }, { onSlide: (s) => { first ??= s; } });
  } catch { }
  if (!first) { patch(p.id, () => ({ drawing: false, photoFail: true })); return; }
  try {
    const { data } = await toDataURL(first.url, CFG.side);
    patch(p.id, () => ({ photo: data, drawing: false }));
  } catch { patch(p.id, () => ({ drawing: false, photoFail: true })); }
}
export function redraw(id) { portraits.unshift(id); pumpPortraits(); }

export const KINDS = ["last", "annoys", "spent", "hides", "pitch", "price"];
const numberIn = (s) => { const m = String(s || "").replace(/(\d)[\s ](?=\d{3}\b)/g, "$1").match(/\d+/); return m ? Number(m[0]) : null; };

export async function ask(id, text, kind, loc) {
  const q = str(text, 600);
  const p = $people.get().find((x) => x.id === id);
  if (!q || !p || p.turns.some((t) => t.pending)) return;
  if (!signedIn()) return wall();
  if (kind === "pitch") {
    const g = { ...$group.get(), idea: q };
    $group.set(g); if (!gate && idbSupported) GROUP.put(g.id, g).catch(() => {});
  }
  const before = p.turns.filter((t) => t.a);
  patch(id, (x) => ({ turns: [...x.turns, { q, kind: kind || "", a: "", pending: true }] }));
  const turns = [...before.flatMap((t) => [{ r: "u", t: t.q }, { r: "a", t: t.a }]), { r: "u", t: q }];
  let a = "", failed = false;
  if (gate) a = GATE_REPLY[kind] || GATE_REPLY.last;
  else {
    try { a = (await askAI(dossierOf(p, p.loc || $group.get()?.loc || loc), loc, "interview", { turns })).text; }
    catch (e) { failed = true; if (e?.status === 401) wall(); }
  }
  patch(id, (x) => {
    const list = x.turns.map((t) => (t.pending ? { ...t, a, pending: false, failed: failed || !a } : t));
    const got = !failed && a;
    return {
      turns: list.filter((t) => !t.failed || t === list[list.length - 1]),
      ...(got && kind === "price" ? { price: numberIn(a) } : {}),
      ...(got && (kind === "pitch" || !x.quote) ? { quote: a } : {}),
    };
  });
}

export async function sculpt(id) {
  const p = $people.get().find((x) => x.id === id);
  if (!p?.photo || $mesh.get()[id]?.phase === "working") return;
  if (!signedIn()) return wall();
  const set = (v) => $mesh.set({ ...$mesh.get(), [id]: v });
  const t0 = Date.now();
  set({ phase: "working", stage: "queued", t0 });
  if (gate) return;
  try {
    const r = await taskOne(CFG.task, { route: CFG.mesh, body: { image: p.photo } }, {
      onLive: (l) => set({ phase: "working", stage: /queue|wait/i.test(String(l?.stage || "")) ? "queued" : "shaping", pct: l?.pct ?? null, t0 }),
    });
    if (r.status !== "done" || !r.blob) { set({ phase: "error", code: r.status === "busy" ? "eBusy" : "eMesh" }); return; }
    patch(id, () => ({ glb: r.blob }));
    set({ phase: "done" });
  } catch (e) { set({ phase: "error", code: e?.status === 409 ? "eOneAtATime" : jobCode(e) }); if (e?.status === 401) wall(); }
}
