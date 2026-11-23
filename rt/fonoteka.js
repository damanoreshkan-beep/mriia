export const MB = 1_000_000;

/** A shared file the library takes: audio by type, or by a known extension when the type is blank. */
export const isAudio = (f) => !!f && (String(f.type || "").startsWith("audio/") || /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(String(f.name || "")));

/** "6.0 MB" — one decimal, never a float tail. */
export const mb = (bytes) => `${(Math.max(0, Number(bytes) || 0) / MB).toFixed(1)} MB`;

/** The row's second line: artist · length · size — only what the song knows about itself. */
export function songLine(s, clock) {
  return [s.artist, s.dur ? clock(s.dur) : "", s.size ? mb(s.size) : ""].filter(Boolean).join(" · ");
}

/** The shelf readout: "12 songs · 84 MB of 3 GB" with the words left to the dictionary. */
export const usageLine = (u, words) => (u ? `${u.count} ${words.songs} · ${mb(u.bytes)} ${words.of} ${(u.maxBytes / 1e9).toFixed(0)} GB` : "");

/** The song's own title for the shelf and the lock screen: the tag, else the file name without its extension. */
export const titleOf = (s) => s.title || String(s.name || "").replace(/\.[a-z0-9]{2,5}$/i, "") || s.id;

/** 401 stays silent (the runtime's wall); 413/409 are the quota words; the rest one sentence. */
export const errorKey = (status, why) => (status === 401 ? "" : status === 413 ? "errLarge" : status === 409 ? (why === "too many songs" ? "errCount" : "errFull") : status === 415 ? "errNotAudio" : "errUpload");

/** A playlist cell's line: "12 songs · 41 min" — the count and the whole length, rounded to the minute. */
export const listLine = (list, words) => {
  const sec = (list?.songs || []).reduce((a, s) => a + (Number(s.dur) || 0), 0);
  return `${list?.songs?.length || 0} ${words.songs} · ${Math.max(1, Math.round(sec / 60))} ${words.min}`;
};

/** The songs a saved radio layer sends: streamed ones only, in the layer's order. */
export const listOfLayer = (layer) => layer.filter((s) => s.yt).map((s) => ({ yt: s.yt, title: s.title || "", artist: s.artist || "", dur: s.dur || 0, cover: s.cover || null }));

/** Which song each of `n` petals shows at beat `k`: petal p walks the covers from p, one petal moving a beat, so the collage changes one piece at a time. */
export function petals(covers, n, k) {
  const m = covers.length;
  if (!m) return [];
  return Array.from({ length: n }, (_, p) => covers[(p + n * Math.floor((k + n - 1 - p) / n)) % m]);
}

/** A copy in a random order (Fisher–Yates), the random source given so a test can pin it. */
export function shuffled(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export const FIXTURE_LISTS = [
  { id: "f1x2t3u4r5e6l7s8", name: "Нічна повільна хвиля", added: "2026-11-23T20:00:00Z", songs: [
    { yt: "dQw4w9WgXcQ", title: "0.5 (slowed)", artist: "svnti", dur: 158, cover: null },
    { yt: "kXYiU_JCYtU", title: "ice - slowed", artist: "ZERTAL", dur: 152, cover: null },
    { yt: "EdSz0PeLVgY", title: "you need it", artist: "airshade", dur: 158, cover: null },
  ] },
];

export const FIXTURE_USAGE = { count: 3, bytes: 17_900_000, maxFiles: 300, maxBytes: 3_000_000_000 };
export const FIXTURE_SONGS = [
  { id: "a1b2c3d4e5f60718", name: "Rick Astley - Never Gonna Give You Up (slowed + reverb).mp3", title: "Never Gonna Give You Up (slowed + reverb)", artist: "Rick Astley", size: 6_037_204, dur: 250.6, added: "2026-10-07T20:00:00Z" },
  { id: "b2c3d4e5f6071829", name: "Rick Astley - Never Gonna Give You Up.mp3", title: "Never Gonna Give You Up", artist: "Rick Astley", size: 5_300_000, dur: 213.0, added: "2026-10-06T19:00:00Z" },
  { id: "c3d4e5f607182930", name: "Польова пісня.mp3", title: "", artist: "", size: 6_562_796, dur: 274.2, added: "2026-10-05T18:00:00Z" },
];
