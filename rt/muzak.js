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

// Licence (owner 2026-10-11: «тільки робимо легально з указом на джерело»). The edge reports yt-dlp's licence string;
// YouTube's Creative Commons mark is CC BY — reuse and remix allowed with credit. Anything else is the standard licence.
export const isCC = (license) => /creative commons/i.test(String(license || ""));

// The credit a CC BY reuse owes, in the TASL order the licence asks for: Title, Author, Source, Licence.
export const credit = (m, link) => [
  `"${m.title}" — ${m.channel || m.artist || ""}`.trim(),
  link || `https://youtu.be/${m.id}`,
  "Licence: Creative Commons Attribution (CC BY), via YouTube",
].join("\n");

// The «Вільні» tab under the gate: real CC BY songs (Kevin MacLeod, incompetech) and one CC-marked rework, flagged.
export const FIXTURE_FREE = [
  { id: "Yy-NyPTRYU8", title: "Exit the Premises", artist: "Kevin MacLeod", dur: 213, cover: "https://i.ytimg.com/vi/Yy-NyPTRYU8/mqdefault.jpg", url: "https://music.youtube.com/watch?v=Yy-NyPTRYU8", doubt: false },
  { id: "KKVgIrnlWDg", title: "Clash Defiant", artist: "Kevin MacLeod", dur: 376, cover: "https://i.ytimg.com/vi/KKVgIrnlWDg/mqdefault.jpg", url: "https://music.youtube.com/watch?v=KKVgIrnlWDg", doubt: false },
  { id: "nKnyq0PMIkc", title: "Silver Blue Light", artist: "Kevin MacLeod Archive", dur: 353, cover: "https://i.ytimg.com/vi/nKnyq0PMIkc/mqdefault.jpg", url: "https://music.youtube.com/watch?v=nKnyq0PMIkc", doubt: false },
  { id: "Dtdz7qpRcLU", title: "RM - Tokyo Lofi (Slowed + Reverb + Rain)", artist: "Apollo", dur: 233, cover: "https://i.ytimg.com/vi/Dtdz7qpRcLU/mqdefault.jpg", url: "https://music.youtube.com/watch?v=Dtdz7qpRcLU", doubt: true },
];

export const FIXTURE_META ={ id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley", album: "Whenever You Need Somebody", year: 1987, duration: 213, cover: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg" };
