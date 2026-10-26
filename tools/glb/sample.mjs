// obrys's sample model — the gate's fixture and the ?mock screen: an amber core, three tilted cyan rings, one
// node orbiting on each, two clips ("Orbit", "Pulse"). Built with the library, never hand-packed bytes.
//   deno run -A tools/glb/sample.mjs apps/obrys/assets/sample.glb
import { Document, NodeIO } from "npm:@gltf-transform/core@4.1.1";

const out = Deno.args[0] || "apps/obrys/assets/sample.glb";
const doc = new Document();
const buffer = doc.createBuffer();
const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);

function mesh(name, material, { pos, nrm, idx }) {
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", acc("VEC3", new Float32Array(pos)))
    .setAttribute("NORMAL", acc("VEC3", new Float32Array(nrm)))
    .setIndices(acc("SCALAR", new Uint16Array(idx)))
    .setMaterial(material);
  return doc.createMesh(name).addPrimitive(prim);
}

function sphere(r, w = 32, h = 20) {
  const pos = [], nrm = [], idx = [];
  for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) {
    const u = (x / w) * Math.PI * 2, v = (y / h) * Math.PI;
    const n = [-Math.cos(u) * Math.sin(v), Math.cos(v), Math.sin(u) * Math.sin(v)];
    nrm.push(...n); pos.push(...n.map((c) => c * r));
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = y * (w + 1) + x, b = a + w + 1;
    if (y !== 0) idx.push(a, b, a + 1);
    if (y !== h - 1) idx.push(a + 1, b, b + 1);
  }
  return { pos, nrm, idx };
}

// a ring in the XZ plane (its axis is +Y), so a spinner turning about Y runs along it
function torus(R, r, seg = 128, side = 12) {
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i <= seg; i++) for (let j = 0; j <= side; j++) {
    const u = (i / seg) * Math.PI * 2, v = (j / side) * Math.PI * 2;
    const c = [Math.cos(u), 0, Math.sin(u)], n = [c[0] * Math.cos(v), Math.sin(v), c[2] * Math.cos(v)];
    nrm.push(...n); pos.push(c[0] * R + n[0] * r, n[1] * r, c[2] * R + n[2] * r);
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < side; j++) {
    const a = i * (side + 1) + j, b = a + side + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { pos, nrm, idx };
}

const quat = (axis, deg) => { const h = (deg * Math.PI) / 360, s = Math.sin(h); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)]; };
const mul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

const amber = doc.createMaterial("Core").setBaseColorFactor([1, 0.72, 0.26, 1]).setEmissiveFactor([1, 0.55, 0.12])
  .setMetallicFactor(0).setRoughnessFactor(0.35);
const cyan = doc.createMaterial("Ring").setBaseColorFactor([0.13, 0.83, 0.93, 1]).setEmissiveFactor([0.1, 0.7, 0.85])
  .setMetallicFactor(0).setRoughnessFactor(0.4).setDoubleSided(true);
const coreMesh = mesh("Core", amber, sphere(0.09));
const ringMesh = mesh("Ring", cyan, torus(0.25, 0.004));
const nodeMesh = mesh("Node", cyan, sphere(0.022, 20, 12));

const root = doc.createNode("Obrys").setTranslation([0, 0.3, 0]);
const core = doc.createNode("Core").setMesh(coreMesh);
root.addChild(core);
const TILTS = [quat([1, 0, 0], 72), mul(quat([0, 0, 1], 60), quat([1, 0, 0], 72)), mul(quat([0, 0, 1], -60), quat([1, 0, 0], 72))];
const spinners = TILTS.map((tilt, i) => {
  const pivot = doc.createNode(`Ring ${i + 1}`).setRotation(tilt).setMesh(ringMesh);
  const spin = doc.createNode(`Orbit ${i + 1}`);
  spin.addChild(doc.createNode(`Node ${i + 1}`).setMesh(nodeMesh).setTranslation([0.25, 0, 0]));
  pivot.addChild(spin); root.addChild(pivot);
  return spin;
});
doc.createScene("Obrys").addChild(root);

// Orbit: 6 s loop, spinner i makes i+1 turns, keyed every quarter turn (slerp between 90° keys stays on course)
const orbit = doc.createAnimation("Orbit");
spinners.forEach((spin, i) => {
  const turns = i + 1, keys = turns * 4, T = 6, times = [], rots = [];
  for (let k = 0; k <= keys; k++) { times.push((k / keys) * T); rots.push(...quat([0, 1, 0], -k * 90)); }
  const sampler = doc.createAnimationSampler().setInput(acc("SCALAR", new Float32Array(times))).setOutput(acc("VEC4", new Float32Array(rots))).setInterpolation("LINEAR");
  orbit.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(spin).setTargetPath("rotation").setSampler(sampler));
});
const pulse = doc.createAnimation("Pulse");
const ps = doc.createAnimationSampler()
  .setInput(acc("SCALAR", new Float32Array([0, 0.8, 1.6])))
  .setOutput(acc("VEC3", new Float32Array([1, 1, 1, 1.18, 1.18, 1.18, 1, 1, 1])))
  .setInterpolation("LINEAR");
pulse.addSampler(ps).addChannel(doc.createAnimationChannel().setTargetNode(core).setTargetPath("scale").setSampler(ps));

doc.getRoot().getAsset().generator = "Obrys sample (glTF-Transform)";
const bytes = await new NodeIO().writeBinary(doc);
await Deno.writeFile(out, bytes);
const back = await new NodeIO().readBinary(bytes);
console.log(`${out}: ${bytes.length} bytes, ${back.getRoot().listMeshes().length} meshes, ${back.getRoot().listNodes().length} nodes, ${back.getRoot().listAnimations().length} clips`);
