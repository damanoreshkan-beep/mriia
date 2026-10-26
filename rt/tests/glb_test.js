import { assert, assertEquals } from "jsr:@std/assert@1";
import { readGltf, gltfStats, frameBox, fmtCount, fmtBytes, fmtDims, modelName, linkOf } from "../glb.js";

const glbOf = (json, { version = 2, pad = true } = {}) => {
  let txt = new TextEncoder().encode(JSON.stringify(json));
  if (pad && txt.length % 4) { const p = new Uint8Array(txt.length + 4 - (txt.length % 4)).fill(0x20); p.set(txt); txt = p; }
  const out = new Uint8Array(20 + txt.length), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, version, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, txt.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(txt, 20);
  return out;
};

Deno.test("glb readGltf: a .glb header, a .gltf text, and everything else is null", () => {
  const g = readGltf(glbOf({ asset: { version: "2.0" } }));
  assertEquals(g.binary, true); assertEquals(g.json.asset.version, "2.0");
  assertEquals(readGltf(glbOf({ asset: {} }, { version: 1 })), null, "glTF 1 is refused");
  const t = readGltf(new TextEncoder().encode('  {"asset":{"version":"2.0"}}'));
  assertEquals(t.binary, false);
  assertEquals(readGltf(new TextEncoder().encode('{"not":"gltf"}')), null);
  assertEquals(readGltf(new Uint8Array([1, 2, 3])), null);
  const cut = glbOf({ asset: {} }).subarray(0, 24);
  assertEquals(readGltf(cut), null, "a truncated JSON chunk is null, not a throw");
});

Deno.test("glb gltfStats: triangles per instance, modes, extensions, external refs", () => {
  const json = {
    asset: { generator: "Hunyuan3D" },
    accessors: [{ count: 300 }, { count: 900 }, { count: 10 }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] },
      { primitives: [{ attributes: { POSITION: 2 }, mode: 5 }, { attributes: { POSITION: 2 }, mode: 1 }] },
    ],
    nodes: [{ mesh: 0 }, { mesh: 0 }, { mesh: 1 }, {}],
    materials: [{}], animations: [{ name: "Run" }, {}],
    extensionsUsed: ["KHR_draco_mesh_compression"], extensionsRequired: ["KHR_draco_mesh_compression"],
    buffers: [{ uri: "scene.bin" }, { uri: "data:application/octet-stream;base64,AA==" }],
  };
  const s = gltfStats(json);
  assertEquals(s.triangles, 300 * 2 + 8, "mesh 0 twice (900/3) + a strip of 10 (8) + lines (0)");
  assertEquals(s.vertices, 300 * 2 + 10 + 10);
  assertEquals([s.meshes, s.nodes, s.primitives, s.materials], [2, 4, 3, 1]);
  assertEquals(s.animations, ["Run", "#2"]);
  assertEquals(s.extensions, ["KHR_draco_mesh_compression"]);
  assertEquals(s.external, 1);
  assertEquals(s.generator, "Hunyuan3D");
  assertEquals(gltfStats(null).triangles, 0);
});

Deno.test("glb the committed sample: its numbers as the screen shows them", async () => {
  const buf = await Deno.readFile(new URL("../../apps/obrys/assets/sample.glb", import.meta.url));
  const g = readGltf(buf);
  assert(g?.binary);
  const s = gltfStats(g.json);
  assertEquals(s.animations, ["Orbit", "Pulse"]);
  assertEquals([s.meshes, s.materials, s.external], [3, 2, 0]);
  assert(s.triangles > 10000, `${s.triangles} triangles`);
});

Deno.test("glb frameBox: the sphere fits the narrower field, portrait stands further back", () => {
  const wide = frameBox([-1, -1, -1], [1, 1, 1], 45, 2), tall = frameBox([-1, -1, -1], [1, 1, 1], 45, 0.5);
  assertEquals(wide.center, [0, 0, 0]);
  assert(Math.abs(wide.radius - Math.sqrt(3)) < 1e-9);
  assert(Math.abs(wide.distance - (Math.sqrt(3) / Math.sin((22.5 * Math.PI) / 180)) * 1.2) < 1e-9, "landscape: the vertical field decides");
  assert(tall.distance > wide.distance, "portrait: the horizontal field decides");
  assert(tall.near < tall.distance && tall.far > tall.distance);
  assert(frameBox([0, 0, 0], [0, 0, 0], 45, 1).distance > 0, "a point still yields a camera");
});

Deno.test("glb formats: counts, bytes, dims, names in both locales", () => {
  assertEquals(fmtCount(1460000, "en"), "1.5M");
  assert(/1,5\s?млн/.test(fmtCount(1460000, "uk")), fmtCount(1460000, "uk"));
  assertEquals(fmtCount(9600, "en"), "9,600");
  assertEquals(fmtBytes(26.2 * 1048576, "en"), "26 MB");
  assertEquals(fmtBytes(96716, "uk"), "94 КБ");
  assertEquals(fmtBytes(3.4 * 1048576, "uk"), "3,4 МБ");
  assertEquals(fmtDims([0.52, 0.5, 0.48], "en"), "52 × 50 × 48 cm");
  assertEquals(fmtDims([1.7, 0.6, 0.35], "uk"), "1,7 × 0,6 × 0,35 м");
  assertEquals(modelName("https://x.org/a/My%20Robot.glb?v=2"), "My Robot");
  assertEquals(modelName("angel.GLTF"), "angel");
  assertEquals(modelName(""), "");
});

Deno.test("glb linkOf: http(s) only, a bare host becomes https, junk is empty", () => {
  assertEquals(linkOf(" example.com/a.glb "), "https://example.com/a.glb");
  assertEquals(linkOf("http://x.org/m.glb"), "http://x.org/m.glb");
  assertEquals(linkOf("javascript:alert(1)"), "");
  assertEquals(linkOf("file:///etc/passwd"), "");
  assertEquals(linkOf("робот"), "");
  assertEquals(linkOf("two words.glb"), "");
  assertEquals(linkOf(""), "");
});
