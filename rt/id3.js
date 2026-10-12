// id3 — the picture a song carries inside itself (an ID3v2 APIC / PIC frame), read on the phone from the copy it
// already keeps, so fonoteka's albums need no server and no network (owner 2026-10-12: «Фонотека альбомами — роби
// в самій Фонотеці»; «не вистачає обложок … альбомчики форми сіткою гарною»). Pure: bytes in, { mime, bytes } out.
// v2.2 (PIC, 3-byte ids), v2.3 (big-endian sizes) and v2.4 (syncsafe sizes); the FRONT cover wins, else the first.

const syncsafe = (b, i) => (b[i] << 21) | (b[i + 1] << 14) | (b[i + 2] << 7) | b[i + 3];
const be32 = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];

/** How many bytes the ID3v2 tag at the start of `head` takes (header included), or 0 when there is none. Pure. */
export function tagSize(head) {
  if (!head || head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return 0;   // "ID3"
  const footer = head[5] & 0x10 ? 10 : 0;
  return 10 + syncsafe(head, 6) + footer;
}

// the end of a NUL-terminated string from `i`: one 0x00 for latin1/utf-8, a 0x00 0x00 pair on an even step for UTF-16
function skipString(b, i, enc) {
  if (enc === 1 || enc === 2) { for (let j = i; j + 1 < b.length; j += 2) if (b[j] === 0 && b[j + 1] === 0) return j + 2; return b.length; }
  for (let j = i; j < b.length; j++) if (b[j] === 0) return j + 1;
  return b.length;
}
const mimeOf = (m) => {
  const s = String(m || "").toLowerCase();
  return s === "png" || s.includes("png") ? "image/png" : s === "jpg" || s.includes("jp") ? "image/jpeg" : s.includes("webp") ? "image/webp" : s.startsWith("image/") ? s : "image/jpeg";
};

/** The cover inside an ID3v2 tag: `bytes` is the start of the file (at least the whole tag) → { mime, bytes } or null. Pure. */
export function coverOf(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const size = tagSize(b);
  if (!size) return null;
  const v = b[3], end = Math.min(size, b.length);
  if (v < 2 || v > 4) return null;
  let i = 10;
  if (v >= 3 && b[5] & 0x40) i += v === 4 ? syncsafe(b, 10) : be32(b, 10) + 4;   // an extended header
  let first = null;
  while (i + (v === 2 ? 6 : 10) <= end) {
    const idLen = v === 2 ? 3 : 4;
    const id = String.fromCharCode(...b.subarray(i, i + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break;   // padding
    const len = v === 2 ? (b[i + 3] << 16) | (b[i + 4] << 8) | b[i + 5] : v === 4 ? syncsafe(b, i + 4) : be32(b, i + 4);
    const body = i + (v === 2 ? 6 : 10);
    if (len <= 0 || body + len > end) break;
    if (id === "APIC" || id === "PIC") {
      const f = b.subarray(body, body + len), enc = f[0];
      let j, mime;
      if (id === "PIC") { mime = mimeOf(String.fromCharCode(...f.subarray(1, 4))); j = 4; }
      else { const m = skipString(f, 1, 0); mime = mimeOf(String.fromCharCode(...f.subarray(1, m - 1))); j = m; }
      const type = f[j];
      const data = f.subarray(skipString(f, j + 1, enc));
      if (data.length > 16) {
        const pic = { mime, bytes: data };
        if (type === 3) return pic;   // the front cover
        first ||= pic;
      }
    }
    i = body + len;
  }
  return first;
}

/** A Blob's cover as an image Blob, reading only the tag's bytes (≤ 4 MB), or null. */
export async function coverBlob(blob, cap = 4 * 1024 * 1024) {
  if (!blob || blob.size < 10) return null;
  const head = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
  const size = tagSize(head);
  if (!size || size > cap) return null;
  const pic = coverOf(new Uint8Array(await blob.slice(0, size).arrayBuffer()));
  return pic ? new Blob([pic.bytes], { type: pic.mime }) : null;
}
