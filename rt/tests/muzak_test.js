import { assertEquals } from "jsr:@std/assert@1";
import { videoId, clock, byline, errorKey, songOfFound, mixRadios, FIXTURE_SEARCH } from "../muzak.js";

Deno.test("mixRadios: the radios in turns, no song twice, none of the skipped ones", () => {
  const s = (id) => ({ id });
  assertEquals(mixRadios([[s("a1"), s("a2"), s("a3")], [s("b1"), s("a2")], [s("c1")]]).map((x) => x.id), ["a1", "b1", "c1", "a2", "a3"]);
  assertEquals(mixRadios([[s("a1"), s("liked")], [s("liked"), s("b2")]], ["liked", "shown"]).map((x) => x.id), ["a1", "b2"]);
  assertEquals(mixRadios([]), []);
});

Deno.test("videoId: YouTube link shapes give the id, anything else null", () => {
  for (const u of ["https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD", "https://youtu.be/dQw4w9WgXcQ?si=1", "https://youtube.com/shorts/dQw4w9WgXcQ", " https://m.youtube.com/watch?v=dQw4w9WgXcQ "]) assertEquals(videoId(u), "dQw4w9WgXcQ", u);
  for (const u of ["https://example.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", "", null, "https://youtube.com/watch?v=short"]) assertEquals(videoId(u), null, String(u));
});

Deno.test("clock and byline: 3:33, and only what the song knows", () => {
  assertEquals(clock(213), "3:33");
  assertEquals(clock(0), "0:00");
  assertEquals(byline({ artist: "Band", album: "", year: 1987 }), "Band · 1987");
  assertEquals(byline({}), "");
});

Deno.test("errorKey: the edge's status becomes a sentence key", () => {
  assertEquals([400, 401, 413, 429, 502, 0].map(errorKey), ["errLink", "", "errLong", "errBusy", "errMeta", "errMeta"]);
});

Deno.test("songOfFound: a search result in the liked-song shape the player, keep, mix and mp3 take", () => {
  assertEquals(songOfFound(FIXTURE_SEARCH.songs[0]), { id: "sx5oqwa-Dps", title: "Без бою", artist: "Океан Ельзи", album: "Gloria", dur: 260, cover: "https://i.ytimg.com/vi/sx5oqwa-Dps/mqdefault.jpg", url: "https://music.youtube.com/watch?v=sx5oqwa-Dps" });
  assertEquals(songOfFound({ id: "x" }), { id: "x", title: "", artist: "", album: "", dur: 0, cover: null, url: "https://music.youtube.com/watch?v=x" });
});
