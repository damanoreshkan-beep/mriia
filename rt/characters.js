import { atom } from "nanostores";
import { VPS_PROXY } from "@microspec/core/runtime/feed.js";
import { gate } from "@microspec/core/runtime/gate.js";
import { session } from "@microspec/core/runtime/auth.js";
import { parseSse } from "@microspec/core/runtime/sse.js";
export { parseSse };

const BASE = VPS_PROXY;
const sidOf = () => session.get()?.sid || null;

async function post(path, body, timeout = 20000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(`${BASE}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!r.ok) { const e = new Error(`${path} ${r.status}`); e.status = r.status; try { e.body = await r.json(); } catch { } throw e; }
    return await r.json();
  } catch (e) {
    if (e && typeof e.status === "number") throw e;
    const err = new Error(`${path} network`); err.status = 0; throw err;
  } finally { clearTimeout(to); }
}

export const $characters = atom(null);
let lastSid = session.get()?.sid || null;
session.listen((s) => { const sid = s?.sid || null; if (sid !== lastSid) { lastSid = sid; $characters.set(null); } });

export async function characters({ force = false } = {}) {
  if (gate) { if (!$characters.get()) $characters.set(FIXTURE_CHARACTERS); return $characters.get(); }
  if (!force && $characters.get()) return $characters.get();
  const j = await post("chars", { ...(sidOf() ? { sid: sidOf() } : {}) });
  const list = (j?.characters || []).map(trimCharacter);
  $characters.set(list);
  return list;
}

export const trimCharacter = (c) => ({
  id: c.id, slug: c.slug, name: c.name, name_uk: c.name_uk || c.name,
  tagline: c.tagline || "", tagline_uk: c.tagline_uk || c.tagline || "",
  story: c.story || "", story_uk: c.story_uk || c.story || "",
  avatar: c.avatar_url || "", url: c.source_url || "", public: !!c.public, created_by: c.created_by ?? null,
});

/** Wikipedia candidates for a typed name — needs a session (the edge rate-limits per user). */
export async function lookup(q) {
  if (gate) return FIXTURE_CANDIDATES.filter((c) => c.title.toLowerCase().includes(String(q).toLowerCase()));
  const sid = sidOf();
  if (!sid) return [];
  const j = await post("chars/lookup", { sid, q });
  return (j?.candidates || []).map((c) => ({ key: c.key, title: c.title, description: c.description || "", thumb: c.thumb || "", url: c.url || "" }));
}

// id → the persona's voice ({gender, age, pitch, accent?, style?}) — cast once on the edge, kept for the session
const voices = new Map();
/** The persona's voice in OmniVoice's Voice Design vocabulary (edge chars.js), cast on first ask. */
export function voiceOf(id) {
  if (gate) return Promise.resolve({ gender: "Male", age: "Middle-aged", pitch: "Low Pitch" });
  if (!voices.has(id)) {
    const sid = sidOf();
    if (!sid) return Promise.reject(Object.assign(new Error("no session"), { status: 401 }));
    voices.set(id, post("chars/voice", { sid, id }, 45000).then((j) => j.voice).catch((e) => { voices.delete(id); throw e; }));
  }
  return voices.get(id);
}

/** An admin puts their OWN persona on the shelf every user sees (or takes it back); → the new `public`. */
export async function publish(id, isPublic = true) {
  const sid = sidOf();
  if (!sid) throw Object.assign(new Error("no session"), { status: 401 });
  const j = await post("chars/publish", { sid, id, public: isPublic });
  const cur = $characters.get() || [];
  $characters.set(cur.map((c) => (c.id === id ? { ...c, public: !!j.public } : c)));
  return !!j.public;
}

/** Create (or fetch, if it already exists) a character from a Wikipedia key. Pushes it onto the shelf. */
export async function create(key) {
  if (gate) { const c = FIXTURE_CHARACTERS[0]; return c; }
  const sid = sidOf();
  if (!sid) throw Object.assign(new Error("no session"), { status: 401 });
  const j = await post("chars/create", { sid, key }, 90000);
  const c = trimCharacter(j.character);
  const cur = $characters.get() || [];
  if (!cur.some((x) => x.id === c.id)) $characters.set([c, ...cur]);
  return c;
}

/** Delete a character you added (the edge refuses public rows for anyone but the owner). Drops it from the shelf atom. */
export async function deleteCharacter(id) {
  if (gate) { $characters.set(($characters.get() || []).filter((c) => c.id !== id)); return true; }
  const sid = sidOf();
  if (!sid) return false;
  const j = await post("chars/delete", { sid, id });
  if (j?.ok) $characters.set(($characters.get() || []).filter((c) => c.id !== id));
  return !!j?.ok;
}

export async function chats() {
  if (gate) return FIXTURE_CHATS;
  const sid = sidOf();
  if (!sid) return [];
  const j = await post("chats", { sid });
  return j?.chats || [];
}

export async function chat(id) {
  if (gate) return { chat: { id, character_id: FIXTURE_CHARACTERS[0].id }, messages: FIXTURE_THREAD };
  const sid = sidOf();
  if (!sid) return null;
  return await post("chats/get", { sid, id });
}

export async function deleteChat(id) {
  if (gate) return true;
  const sid = sidOf();
  if (!sid) return false;
  const j = await post("chats/delete", { sid, id });
  return !!j?.ok;
}

/**
 * send({ characterId, chatId, text }, { onMeta, onDelta, signal }) → { chatId, by, complete, text }
 * Streams the reply; resolves when the stream ends. Throws with .status on a refused request.
 */
export async function send({ characterId, chatId = null, text, locale = "en" }, { onMeta, onDelta, signal } = {}) {
  if (gate) return fixtureStream(text, locale, { onMeta, onDelta, signal, chatId });
  const sid = sidOf();
  if (!sid) throw Object.assign(new Error("no session"), { status: 401 });
  const r = await fetch(`${BASE}/chat/stream`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sid, characterId, chatId, text, locale }), signal,
  });
  if (!r.ok || !r.body) { const e = new Error(`chat ${r.status}`); e.status = r.status; throw e; }
  const reader = r.body.getReader(), dec = new TextDecoder(), p = parseSse();
  let acc = "", meta = null, done = null, error = null;
  const handle = (ev) => {
    if (ev.event === "meta") { meta = ev.data; onMeta?.(ev.data); }
    else if (ev.event === "done") done = ev.data;
    else if (ev.event === "error") error = ev.data;
    else if (ev.data && typeof ev.data.d === "string") { acc += ev.data.d; onDelta?.(ev.data.d, acc); }
  };
  while (true) {
    const { value, done: end } = await reader.read();
    if (end) break;
    for (const ev of p.push(dec.decode(value, { stream: true }))) handle(ev);
  }
  for (const ev of p.end()) handle(ev);
  if (error && !acc) { const e = new Error(error.error || "chat failed"); e.status = 502; throw e; }
  return { chatId: meta?.chatId ?? chatId, by: done?.by ?? null, complete: !!done?.complete, text: acc, messageId: done?.messageId ?? null };
}

const portrait = (hue, initials) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect width="300" height="450" fill="hsl(${hue} 28% 22%)"/><circle cx="150" cy="170" r="70" fill="hsl(${hue} 30% 34%)"/><rect x="60" y="260" width="180" height="150" rx="60" fill="hsl(${hue} 30% 34%)"/><text x="150" y="190" text-anchor="middle" font-family="sans-serif" font-size="56" font-weight="700" fill="hsl(${hue} 20% 88%)">${initials}</text></svg>`)}`;

export const FIXTURE_CHARACTERS = [
  // six of the live shelf's twelve (edge seed-chars.js SHELF, owner 2026-10-12): the first has the two fixture chats,
  // the second none (the e2e's empty-thread openers)
  { id: 1, slug: "Socrates", name: "Socrates", name_uk: "Сократ", tagline: "Athenian philosopher who taught by asking", tagline_uk: "Афінський філософ, що навчав запитаннями", story: "Socrates was a philosopher of classical Athens who left no writings; through his questioning dialogues, recorded by Plato, he founded Western ethics.", story_uk: "Сократ — філософ класичних Афін, що не залишив жодного тексту; його діалоги-запитання, записані Платоном, заклали західну етику.", avatar: portrait(220, "С"), url: "https://en.wikipedia.org/wiki/Socrates", public: true, created_by: null },
  { id: 2, slug: "Florence_Nightingale", name: "Florence Nightingale", name_uk: "Флоренс Найтінгейл", tagline: "Founder of modern nursing", tagline_uk: "Засновниця сучасної сестринської справи", story: "Florence Nightingale was an English social reformer and statistician who turned nursing into a profession during and after the Crimean War.", story_uk: "Флоренс Найтінгейл — англійська реформаторка й статистикиня, що зробила догляд за хворими професією під час і після Кримської війни.", avatar: portrait(350, "FN"), url: "https://en.wikipedia.org/wiki/Florence_Nightingale", public: true, created_by: null },
  { id: 3, slug: "Confucius", name: "Confucius", name_uk: "Конфуцій", tagline: "Chinese teacher of conduct and learning", tagline_uk: "Китайський учитель чесноти й навчання", story: "Confucius was a Chinese philosopher of the Spring and Autumn period whose teachings on virtue, family and government shaped East Asian life for two millennia.", story_uk: "Конфуцій — китайський філософ доби Весен і Осеней; його вчення про чесноту, родину й правління дві тисячі років формувало життя Східної Азії.", avatar: portrait(30, "К"), url: "https://en.wikipedia.org/wiki/Confucius", public: true, created_by: null },
  { id: 4, slug: "Marie_Curie", name: "Marie Curie", name_uk: "Марія Склодовська-Кюрі", tagline: "Pioneering physicist and chemist, Nobel laureate", tagline_uk: "Фізикиня й хімікиня-першопрохідниця, нобелівська лауреатка", story: "Marie Curie was a physicist and chemist who conducted pioneering research on radioactivity and was the first person to win two Nobel Prizes.", story_uk: "Марія Кюрі — фізикиня й хімікиня, піонерка досліджень радіоактивності, перша людина з двома Нобелівськими преміями.", avatar: portrait(160, "MC"), url: "https://en.wikipedia.org/wiki/Marie_Curie", public: true, created_by: null },
  { id: 5, slug: "Mahatma_Gandhi", name: "Mahatma Gandhi", name_uk: "Магатма Ганді", tagline: "Leader of India's nonviolent independence", tagline_uk: "Провідник ненасильницької незалежності Індії", story: "Mahatma Gandhi was an Indian lawyer and leader who led the campaign for India's independence through nonviolent civil resistance.", story_uk: "Магатма Ганді — індійський правник і провідник, що вів Індію до незалежності ненасильницьким громадським опором.", avatar: portrait(90, "МГ"), url: "https://en.wikipedia.org/wiki/Mahatma_Gandhi", public: true, created_by: null },
  { id: 6, slug: "Nelson_Mandela", name: "Nelson Mandela", name_uk: "Нельсон Мандела", tagline: "Anti-apartheid leader, president of South Africa", tagline_uk: "Борець з апартеїдом, президент Південної Африки", story: "Nelson Mandela spent 27 years in prison for fighting apartheid and, freed, became South Africa's first democratically elected president and a reconciler.", story_uk: "Нельсон Мандела провів 27 років у в'язниці за боротьбу з апартеїдом, а на волі став першим демократично обраним президентом ПАР і примирителем.", avatar: portrait(45, "НМ"), url: "https://en.wikipedia.org/wiki/Nelson_Mandela", public: true, created_by: null },
];

export const FIXTURE_CANDIDATES = [
  { key: "Nikola_Tesla", title: "Nikola Tesla", description: "Serbian-American inventor (1856–1943)", thumb: portrait(200, "NT") },
  { key: "Nikola_Tesla_(film)", title: "Nikola Tesla (film)", description: "2020 film", thumb: "" },
];

export const FIXTURE_THREAD = [
  { id: 1, role: "user", content: "Добрий вечір, Сократе. Що ви можете сказати про мене?" },
  { id: 2, role: "assistant", content: "Добрий вечір, друже. Про тебе я знаю менше, ніж ти сам, а про себе знаю лише те, що нічого не знаю. Тож краще ти скажи: що привело тебе сьогодні на агору?", by: "gemini/gemini-2.5-flash" },
  { id: 3, role: "user", content: "Не знаю, чого я насправді хочу." },
];
export const FIXTURE_REPLY = {
  uk: "Це добрий початок, бо хто знає, що не знає, вже ступив на шлях. Скажи мені: коли ти востаннє був задоволений прожитим днем, що саме ти того дня робив? Почнімо звідти.",
  en: "That is a good beginning, for whoever knows that he does not know has already set out. Tell me: the last day you were content with, what exactly did you do that day? Let us start there.",
};
export const FIXTURE_CHATS = [
  { id: 1, character_id: 1, title: "Що ви можете сказати про мене?", updated_at: "2026-08-16T12:00:00Z", name: "Socrates", name_uk: "Сократ", avatar_url: FIXTURE_CHARACTERS[0].avatar, last: FIXTURE_THREAD[2].content },
  { id: 2, character_id: 1, title: "Про добре життя", updated_at: "2026-08-14T09:30:00Z", name: "Socrates", name_uk: "Сократ", avatar_url: FIXTURE_CHARACTERS[0].avatar, last: "Непізнане життя не варте того, щоб його жити." },
];

async function fixtureStream(text, locale, { onMeta, onDelta, signal, chatId }) {
  const id = chatId || 1;
  onMeta?.({ chatId: id, userMessageId: 99 });
  const words = (FIXTURE_REPLY[locale] || FIXTURE_REPLY.en).split(" ");
  let acc = "";
  for (let i = 0; i < words.length; i++) {
    if (signal?.aborted) break;
    await new Promise((r) => setTimeout(r, 22));
    const d = (i ? " " : "") + words[i]; acc += d; onDelta?.(d, acc);
  }
  return { chatId: id, by: "fixture", complete: true, text: acc, messageId: 100 };
}
