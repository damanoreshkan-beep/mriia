import { assert, assertEquals } from "jsr:@std/assert@1";
import { isAudio, mb, songLine, usageLine, titleOf, errorKey, listLine, listOfLayer, petals, shuffled, FIXTURE_LISTS, FIXTURE_SONGS, FIXTURE_USAGE } from "../fonoteka.js";

const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;

Deno.test("fonoteka: a song is audio by type or by extension; a picture is not", () => {
  assert(isAudio({ type: "audio/mpeg", name: "x" }) && isAudio({ type: "", name: "song.MP3" }) && isAudio({ type: "application/octet-stream", name: "a.m4a" }));
  assert(!isAudio({ type: "image/png", name: "shot.png" }) && !isAudio({ type: "", name: "notes.txt" }) && !isAudio(null));
});

Deno.test("fonoteka: sizes read as one-decimal MB; the row line carries only what the song knows", () => {
  assertEquals(mb(6_037_204), "6.0 MB");
  assertEquals(mb(0), "0.0 MB");
  assertEquals(songLine(FIXTURE_SONGS[0], clock), "Rick Astley · 4:11 · 6.0 MB");
  assertEquals(songLine(FIXTURE_SONGS[2], clock), "4:34 · 6.6 MB");
  assertEquals(songLine({ id: "x" }, clock), "");
});

Deno.test("fonoteka: the shelf readout and the title fallback", () => {
  assertEquals(usageLine(FIXTURE_USAGE, { songs: "songs", of: "of" }), "3 songs · 17.9 MB of 3 GB");
  assertEquals(usageLine(null, {}), "");
  assertEquals(titleOf(FIXTURE_SONGS[2]), "Польова пісня");
  assertEquals(titleOf({ id: "zz", name: "" }), "zz");
});

Deno.test("fonoteka: status → error key; 401 stays silent; 409 splits on the reason", () => {
  assertEquals([errorKey(401), errorKey(413), errorKey(415), errorKey(502)], ["", "errLarge", "errNotAudio", "errUpload"]);
  assertEquals(errorKey(409, "too many songs"), "errCount");
  assertEquals(errorKey(409, "library full"), "errFull");
});

Deno.test("listLine — the count and the whole length to the minute, at least one", () => {
  const w = { songs: "пісень", min: "хв" };
  assertEquals(listLine({ songs: [{ dur: 158 }, { dur: 152 }, { dur: 2400 }] }, w), "3 пісень · 45 хв");
  assertEquals(listLine({ songs: [{ dur: 0 }] }, w), "1 пісень · 1 хв");
});

Deno.test("listOfLayer — only streamed songs, in order, with what a cell and the player need", () => {
  const got = listOfLayer([{ id: "y:a", yt: "aaaaaaaaaaa", title: "0.5", artist: "svnti", dur: 158, cover: "https://x/y" }, { id: "k1", title: "kept" }, { id: "y:b", yt: "bbbbbbbbbbb" }]);
  assertEquals(got, [{ yt: "aaaaaaaaaaa", title: "0.5", artist: "svnti", dur: 158, cover: "https://x/y" }, { yt: "bbbbbbbbbbb", title: "", artist: "", dur: 0, cover: null }]);
});

Deno.test("petals — one petal moves a beat, each walking the covers from its own start", () => {
  const c = ["a", "b", "c", "d", "e", "f"];
  assertEquals(petals(c, 4, 0), ["a", "b", "c", "d"]);
  assertEquals(petals(c, 4, 1), ["e", "b", "c", "d"]);
  assertEquals(petals(c, 4, 2), ["e", "f", "c", "d"]);
  assertEquals(petals(c, 4, 5), ["c", "f", "a", "b"]);
  for (let k = 1; k < 40; k++) {
    const changed = petals(c, 4, k).filter((x, i) => x !== petals(c, 4, k - 1)[i]).length;
    assert(changed <= 1, `beat ${k} changes at most one petal`);
  }
  assertEquals(petals([], 4, 3), []);
  const seq = [0.9, 0.1, 0.5, 0.3];
  let i = 0;
  const s = shuffled(["a", "b", "c", "d", "e"], () => seq[i++ % seq.length]);
  assertEquals([...s].sort(), ["a", "b", "c", "d", "e"], "a shuffle keeps every song once");
  assertEquals(FIXTURE_LISTS[0].songs.length, 3);
  assertEquals(petals(["a"], 4, 2), ["a", "a", "a", "a"]);
});
