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

export const byline = (m) => [m.artist, m.album, m.year].filter(Boolean).join(" · ");

export const errorKey = (status) => (status === 401 ? "" : status === 413 ? "errLong" : status === 429 ? "errBusy" : status === 400 ? "errLink" : "errMeta");

export const FIXTURE_LINK = "https://music.youtube.com/watch?v=dQw4w9WgXcQ";
export const FIXTURE_LIKES = {
  connected: true, channel: "Оксана", next: "more",
  songs: [
    { id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley", dur: 213, cover: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg", url: "https://music.youtube.com/watch?v=dQw4w9WgXcQ" },
    { id: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody", artist: "Queen", dur: 355, cover: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg", url: "https://music.youtube.com/watch?v=fJ9rUzIMcZQ" },
    { id: "kXYiU_JCYtU", title: "Numb", artist: "Linkin Park", dur: 187, cover: "https://i.ytimg.com/vi/kXYiU_JCYtU/mqdefault.jpg", url: "https://music.youtube.com/watch?v=kXYiU_JCYtU" },
    { id: "pAgnJDJN4VA", title: "Back In Black", artist: "AC/DC", dur: 255, cover: "https://i.ytimg.com/vi/pAgnJDJN4VA/mqdefault.jpg", url: "https://music.youtube.com/watch?v=pAgnJDJN4VA" },
  ],
};

export const isCC = (license) => /creative commons/i.test(String(license || ""));

export const credit = (m, link) => [
  `"${m.title}" — ${m.channel || m.artist || ""}`.trim(),
  link || `https://youtu.be/${m.id}`,
  "Licence: Creative Commons Attribution (CC BY), via YouTube",
].join("\n");

export const FIXTURE_FREE = [
  { id: "Yy-NyPTRYU8", title: "Exit the Premises", artist: "Kevin MacLeod", dur: 213, cover: "https://i.ytimg.com/vi/Yy-NyPTRYU8/mqdefault.jpg", url: "https://music.youtube.com/watch?v=Yy-NyPTRYU8", doubt: false },
  { id: "KKVgIrnlWDg", title: "Clash Defiant", artist: "Kevin MacLeod", dur: 376, cover: "https://i.ytimg.com/vi/KKVgIrnlWDg/mqdefault.jpg", url: "https://music.youtube.com/watch?v=KKVgIrnlWDg", doubt: false },
  { id: "nKnyq0PMIkc", title: "Silver Blue Light", artist: "Kevin MacLeod Archive", dur: 353, cover: "https://i.ytimg.com/vi/nKnyq0PMIkc/mqdefault.jpg", url: "https://music.youtube.com/watch?v=nKnyq0PMIkc", doubt: false },
  { id: "Dtdz7qpRcLU", title: "RM - Tokyo Lofi (Slowed + Reverb + Rain)", artist: "Apollo", dur: 233, cover: "https://i.ytimg.com/vi/Dtdz7qpRcLU/mqdefault.jpg", url: "https://music.youtube.com/watch?v=Dtdz7qpRcLU", doubt: true },
];

export const FIXTURE_META ={ id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley", album: "Whenever You Need Somebody", year: 1987, duration: 213, cover: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg" };
