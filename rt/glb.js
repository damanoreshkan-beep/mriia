// glTF 2.0 facts for obrys, read from the file itself — no three.js, so the numbers reach the DOM (and the gate)
// even where WebGL does not. Binary layout: 12-byte header (magic "glTF", version, length), then chunks of
// (length, type, bytes); the first chunk is JSON (spec §4.4).

const MAGIC = 0x46546c67, JSON_CHUNK = 0x4e4f534a;

/** A .glb or a .gltf (JSON text) → its parsed glTF JSON plus `{ binary, version }`, or null when it is neither. Pure. */
export function readGltf(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.byteLength >= 20) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) === MAGIC) {
      const version = dv.getUint32(4, true), len = dv.getUint32(12, true);
      if (version !== 2 || dv.getUint32(16, true) !== JSON_CHUNK || 20 + len > u8.byteLength) return null;
      try { return { json: JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + len))), binary: true, version }; } catch { return null; }
    }
  }
  let i = 0; while (i < u8.length && u8[i] <= 32) i++;
  if (u8[i] !== 0x7b) return null;
  try { const json = JSON.parse(new TextDecoder().decode(u8)); return json?.asset ? { json, binary: false, version: 2 } : null; } catch { return null; }
}

// triangles a primitive draws: mode 4 (default) = n/3, strip 5 / fan 6 = n-2, points and lines = 0
const trisOf = (mode, n) => (mode == null || mode === 4 ? Math.floor(n / 3) : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0);

/**
 * The counts a viewer shows. Triangles and vertices are per INSTANCE: a mesh drawn by three nodes counts three
 * times, as the GPU draws it. `external` = buffers/images that point outside the file (a lone .gltf cannot
 * resolve them). Pure.
 */
export function gltfStats(json) {
  const j = json || {}, acc = j.accessors || [], meshes = j.meshes || [];
  const uses = new Map();
  for (const n of j.nodes || []) if (n.mesh != null) uses.set(n.mesh, (uses.get(n.mesh) || 0) + 1);
  let triangles = 0, vertices = 0, primitives = 0;
  meshes.forEach((m, mi) => {
    const k = uses.get(mi) || 0;
    for (const p of m.primitives || []) {
      primitives++;
      const v = acc[p.attributes?.POSITION]?.count || 0, n = p.indices != null ? acc[p.indices]?.count || 0 : v;
      vertices += v * k; triangles += trisOf(p.mode, n) * k;
    }
  });
  const ext = [...new Set([...(j.extensionsUsed || []), ...(j.extensionsRequired || [])])];
  const external = [...(j.buffers || []), ...(j.images || [])].filter((b) => b.uri && !/^data:/.test(b.uri)).length;
  return {
    triangles, vertices, primitives,
    meshes: meshes.length, nodes: (j.nodes || []).length, materials: (j.materials || []).length,
    textures: (j.textures || []).length, animations: (j.animations || []).map((a, i) => a.name || `#${i + 1}`),
    generator: String(j.asset?.generator || ""), extensions: ext, external,
  };
}

/**
 * Where the camera stands to see a box whole: the bounding sphere fitted inside the NARROWER of the two fields of
 * view (portrait phones are narrow), times `margin`. `fov` is the vertical field in degrees. Pure.
 */
export function frameBox(min, max, fov, aspect, margin = 1.2) {
  const center = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
  const radius = Math.max(1e-6, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  const v = (fov * Math.PI) / 180, h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  const distance = (radius / Math.sin(Math.min(v, h) / 2)) * margin;
  return { center, radius, distance, near: distance / 100, far: distance * 100 };
}

/** A count in the reader's language, compact: 1 460 000 → "1,5 млн" / "1.5M". Pure. */
export const fmtCount = (n, loc) => new Intl.NumberFormat(loc === "uk" ? "uk" : "en", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n || 0);

/** Bytes as KB / MB with the reader's unit words. Pure. */
export function fmtBytes(n, loc) {
  const uk = loc === "uk", mb = n >= 1048576;
  const v = n / (mb ? 1048576 : 1024);
  const num = new Intl.NumberFormat(uk ? "uk" : "en", { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v);
  return `${num} ${mb ? (uk ? "МБ" : "MB") : (uk ? "КБ" : "KB")}`;
}

/** A box's size in glTF metres → "52 × 50 × 48 cm" (cm under 1 m, else m). Pure. */
export function fmtDims(size, loc) {
  const uk = loc === "uk", big = Math.max(...size) >= 1;
  const nf = new Intl.NumberFormat(uk ? "uk" : "en", { maximumFractionDigits: big ? 2 : 1 });
  return `${size.map((s) => nf.format(big ? s : s * 100)).join(" × ")} ${big ? (uk ? "м" : "m") : (uk ? "см" : "cm")}`;
}

/** What was typed as a link → an http(s) address (a bare host gets https://), or "" when it cannot be one. Pure. */
export function linkOf(text) {
  const s = String(text || "").trim();
  if (!s || /\s/.test(s)) return "";
  try { const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`); return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.href : ""; } catch { return ""; }
}

/** A file name or URL → the model's name: last path segment, no query, no extension, decoded. Pure. */
export function modelName(s) {
  let last = String(s || "").split(/[?#]/)[0].split("/").filter(Boolean).pop() || "";
  try { last = decodeURIComponent(last); } catch { }
  return last.replace(/\.(glb|gltf)$/i, "").trim();
}
