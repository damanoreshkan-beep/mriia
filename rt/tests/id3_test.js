import { assert, assertEquals } from "jsr:@std/assert@1";
import { tagSize, coverOf, coverBlob } from "../id3.js";

const ss = (n) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
const be = (n) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const JPEG = [0xff, 0xd8, 0xff, 0xe0, ...Array(40).fill(7)];
const PNG = [0x89, 0x50, 0x4e, 0x47, ...Array(40).fill(9)];

// an ID3v2.<v> tag around frames: [id, bytes]
function tag(v, frames, pad = 8) {
  const body = frames.flatMap(([id, f]) => [...ascii(id), ...(v === 4 ? ss(f.length) : be(f.length)), 0, 0, ...f]);
  const all = [...body, ...Array(pad).fill(0)];
  return new Uint8Array([...ascii("ID3"), v, 0, 0, ...ss(all.length), ...all, 0xff, 0xfb]);
}
const apic = (mime, type, data, enc = 0, desc = "") => enc === 1
  ? [1, ...ascii(mime), 0, type, 0xff, 0xfe, ...[...desc].flatMap((c) => [c.charCodeAt(0), 0]), 0, 0, ...data]
  : [enc, ...ascii(mime), 0, type, ...ascii(desc), 0, ...data];

Deno.test("id3: the tag's size from its header; no tag is 0", () => {
  const t = tag(3, [["TIT2", [0, ...ascii("Song")]]]);
  assertEquals(tagSize(t), t.length - 2);
  assertEquals(tagSize(new Uint8Array([0xff, 0xfb, 0, 0, 0, 0, 0, 0, 0, 0])), 0);
});

Deno.test("id3: v2.3 and v2.4 APIC give the picture and its type; the front cover wins over another", () => {
  const t3 = tag(3, [["TIT2", [0, ...ascii("Song")]], ["APIC", apic("image/png", 0, PNG)], ["APIC", apic("image/jpeg", 3, JPEG, 0, "front")]]);
  const c = coverOf(t3);
  assertEquals(c.mime, "image/jpeg");
  assertEquals([...c.bytes], JPEG);
  const t4 = tag(4, [["APIC", apic("image/png", 0, PNG)]]);
  assertEquals(coverOf(t4).mime, "image/png");
  assertEquals([...coverOf(t4).bytes], PNG);
});

Deno.test("id3: a UTF-16 description is skipped by its double NUL; v2.2 PIC reads too; no picture is null", () => {
  assertEquals([...coverOf(tag(3, [["APIC", apic("image/jpeg", 3, JPEG, 1, "Cover")]])).bytes], JPEG);
  const pic = [1, ...ascii("PNG"), 3, 0xff, 0xfe, 0, 0, ...PNG];
  const v2 = new Uint8Array([...ascii("ID3"), 2, 0, 0, ...ss(6 + pic.length), ...ascii("PIC"), 0, 0, pic.length, ...pic]);
  assertEquals(coverOf(v2).mime, "image/png");
  assertEquals(coverOf(tag(3, [["TIT2", [0, ...ascii("x")]]])), null);
  assertEquals(coverOf(new Uint8Array([1, 2, 3])), null);
});

Deno.test("id3: coverBlob reads only the tag and gives an image Blob", async () => {
  const t = tag(3, [["APIC", apic("image/jpeg", 3, JPEG)]]);
  const audio = new Blob([t, new Uint8Array(5000)]);
  const b = await coverBlob(audio);
  assert(b);
  assertEquals(b.type, "image/jpeg");
  assertEquals([...new Uint8Array(await b.arrayBuffer())], JPEG);
  assertEquals(await coverBlob(new Blob([new Uint8Array(100)])), null);
});
