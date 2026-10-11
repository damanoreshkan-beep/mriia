import { assertEquals } from "jsr:@std/assert@1";
import { videoId, clock, byline, errorKey, isCC, credit } from "../muzak.js";

Deno.test("licence: only YouTube's Creative Commons mark counts; the credit is Title, Author, Source, Licence", () => {
  assertEquals(isCC("Creative Commons Attribution license (reuse allowed)"), true);
  assertEquals(isCC(null), false);
  assertEquals(isCC(""), false);
  assertEquals(isCC("Standard YouTube License"), false);
  assertEquals(credit({ id: "Yy-NyPTRYU8", title: "Exit the Premises", channel: "Kevin MacLeod", artist: "x" }, "https://music.youtube.com/watch?v=Yy-NyPTRYU8"),
    `"Exit the Premises" — Kevin MacLeod\nhttps://music.youtube.com/watch?v=Yy-NyPTRYU8\nLicence: Creative Commons Attribution (CC BY), via YouTube`);
  assertEquals(credit({ id: "Yy-NyPTRYU8", title: "T", artist: "A" }).split("\n").slice(0, 2), [`"T" — A`, "https://youtu.be/Yy-NyPTRYU8"]);
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
