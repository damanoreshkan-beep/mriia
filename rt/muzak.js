// muzak — what the screen decides without the network: is it a YouTube link, how a song reads, which words
// an edge answer gets.
export function videoId(s) {
  let u;
  try { u = new URL(String(s || "").trim()); } catch { return null; }
  if (!/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(u.hostname)) return null;
  const v = u.searchParams.get("v");
  if (v && /^[\w-]{11}$/.test(v)) return v;
  const m = u.pathname.match(/^\/(?:shorts\/|embed\/|live\/)?([\w-]{11})\/?$/);
  return m ? m[1] : null;
}

export const clock = (sec) => `${Math.floor((sec || 0) / 60)}:${String(Math.round(sec || 0) % 60).padStart(2, "0")}`;

// "Artist · Album · 1987" — whatever the song knows about itself, nothing invented.
export const byline = (m) => [m.artist, m.album, m.year].filter(Boolean).join(" · ");

// 401 is the runtime's: the sealed tunnel opens the sign-in wall on it, so the screen says nothing of its own.
export const errorKey = (status) => (status === 401 ? "" : status === 413 ? "errLong" : status === 429 ? "errBusy" : status === 400 ? "errLink" : "errMeta");

export const FIXTURE_LINK = "https://music.youtube.com/watch?v=dQw4w9WgXcQ";
// The likes list as the edge answers it (/feed/google/yt/likes): what the gate and the store's capture show.
export const FIXTURE_LIKES = {
  connected: true, channel: "Оксана", next: "more",
  songs: [
    { id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley", dur: 213, cover: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg", url: "https://music.youtube.com/watch?v=dQw4w9WgXcQ" },
    { id: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody", artist: "Queen", dur: 355, cover: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg", url: "https://music.youtube.com/watch?v=fJ9rUzIMcZQ" },
    { id: "kXYiU_JCYtU", title: "Numb", artist: "Linkin Park", dur: 187, cover: "https://i.ytimg.com/vi/kXYiU_JCYtU/mqdefault.jpg", url: "https://music.youtube.com/watch?v=kXYiU_JCYtU" },
    { id: "pAgnJDJN4VA", title: "Back In Black", artist: "AC/DC", dur: 255, cover: "https://i.ytimg.com/vi/pAgnJDJN4VA/mqdefault.jpg", url: "https://music.youtube.com/watch?v=pAgnJDJN4VA" },
  ],
};

export const FIXTURE_META ={ id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley", album: "Whenever You Need Somebody", year: 1987, duration: 213, cover: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg" };

// A search result (edge /feed/music/search: { id, title, artist, album, duration, cover }) in the list's shape —
// the one shape the player, keep, mix and the mp3 take, the same as a liked song. The album rides along for the row.
export const songOfFound = (f) => ({ id: f.id, title: f.title || "", artist: f.artist || "", album: f.album || "", dur: f.duration || 0, cover: f.cover || null, url: `https://music.youtube.com/watch?v=${f.id}` });

// The search reply as the edge answers it, for the gate and the store's capture.
export const FIXTURE_QUERY = "океан ельзи";
export const FIXTURE_SEARCH = { songs: [
  { id: "sx5oqwa-Dps", title: "Без бою", artist: "Океан Ельзи", album: "Gloria", duration: 260, cover: "https://i.ytimg.com/vi/sx5oqwa-Dps/mqdefault.jpg" },
  { id: "8wWrzr3_46Y", title: "Обійми", artist: "Океан Ельзи", album: "Земля", duration: 225, cover: "https://i.ytimg.com/vi/8wWrzr3_46Y/mqdefault.jpg" },
  { id: "kKbuv7NAMTc", title: "Я так хочу...", artist: "Океан Ельзи", album: "Dolce vita", duration: 282, cover: "https://i.ytimg.com/vi/kKbuv7NAMTc/mqdefault.jpg" },
  { id: "hTU6Kz6muXQ", title: "Дві весни", artist: "Jerry Heil і Sviatoslav Vakarchuk", album: "Дві весни", duration: 231, cover: "https://i.ytimg.com/vi/hTU6Kz6muXQ/mqdefault.jpg" },
] };

// «Для тебе» (owner 2026-10-14: «роби рекомендації з радіо вподобаних»): the radios of a few liked songs, taken in
// turns — first of each, then second of each — so one seed never fills the screen; a song already met (a liked one,
// one shown earlier, one in two radios) is dropped.
export function mixRadios(lists, skip = []) {
  const out = [], seen = new Set(skip);
  for (let i = 0, any = true; any; i++) {
    any = false;
    for (const l of lists) {
      if (i >= l.length) continue;
      any = true;
      if (!seen.has(l[i].id)) { seen.add(l[i].id); out.push(l[i]); }
    }
  }
  return out;
}

// The radio reply as the edge answers it (/feed/music/radio), for the gate and the store's capture.
export const FIXTURE_RADIO = { songs: [
  { id: "EdSz0PeLVgY", title: "З якого ти поверху неба?", artist: "Jerry Heil і YARMAK", album: "АРХЕТИПИ", duration: 197, cover: "https://i.ytimg.com/vi/EdSz0PeLVgY/mqdefault.jpg" },
  { id: "iJF2vlu0308", title: "Твій на 100%", artist: "БумБокс", album: "Таємний код Рубікон Частина 1", duration: 286, cover: "https://i.ytimg.com/vi/iJF2vlu0308/mqdefault.jpg" },
  { id: "xrI5jBPT4Cw", title: "Оберіг", artist: "Святослав Вакарчук", album: "Оранжерея", duration: 214, cover: "https://i.ytimg.com/vi/xrI5jBPT4Cw/mqdefault.jpg" },
  { id: "lf7NA8FwMxo", title: "Пробач", artist: "SHUMEI", album: "Пробач", duration: 160, cover: "https://i.ytimg.com/vi/lf7NA8FwMxo/mqdefault.jpg" },
] };
