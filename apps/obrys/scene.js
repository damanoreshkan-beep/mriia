import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { frameBox } from "/_rt/glb.js";

// the decoders a real-world .glb asks for: Draco and Meshopt geometry (blackout pins the same Draco). NO KTX2Loader:
// the farm's build bundles three from npm and KTX2Loader's chain brought `import "node:buffer"` into dist/obrys/app.js —
// the built page never booted (dist-eye, deploy 40416567565). A KTX2-textured file fails as eParse.
const DRACO_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
const FOV = 40, VIEW_DIR = new THREE.Vector3(0.5, 0.25, 1).normalize();

function shadowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(0,0,0,0.22)"); r.addColorStop(0.5, "rgba(0,0,0,0.07)"); r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function disposeTree(o) {
  o.traverse((n) => {
    n.geometry?.dispose?.();
    for (const m of [].concat(n.material || [])) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose?.();
    }
  });
}

/** The 3D stage on a canvas. `accent` paints the floor ring and the AR reticle. */
export function createViewer(canvas, { accent = "#38D9F5" } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.xr.enabled = true;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(2, 4, 3); scene.add(key);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 1000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.autoRotateSpeed = 1.2;
  let dirty = true;
  controls.addEventListener("change", () => { dirty = true; });
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  // stand = the model + its floor: what AR moves onto a real surface
  const stand = new THREE.Group(); scene.add(stand);
  const holder = new THREE.Group(); stand.add(holder);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.49, 0.5, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.45, depthWrite: false }));
  floor.renderOrder = ring.renderOrder = -1; stand.add(floor, ring);
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.09, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: accent }));
  reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);

  const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);

  let model = null, mixer = null, clips = [], action = null, home = null, hit = null, placed = false;
  let xr = null, arStage = null, seenFrame = false, seenSurface = false, probeAt = 0, modelSize = 0;
  const r2 = (v) => Math.round(v * 100) / 100;
  // what the AR frame really drew and where things stand — the owner's S25 (build 31dfcd3) placed the model 6× and
  // saw nothing; this says whether anything was drawn, how big it is and how far the camera is from it
  function probe() {
    const cam = renderer.xr.getCamera().getWorldPosition(new THREE.Vector3()), at = stand.getWorldPosition(new THREE.Vector3());
    const { triangles, calls } = renderer.info.render;
    return { tris: triangles, calls, size: r2(modelSize), scale: r2(stand.scale.x), dist: r2(cam.distanceTo(at)), dy: r2(at.y - cam.y), stand: stand.visible, reticle: reticle.visible };
  }
  const clock = new THREE.Clock();

  const ro = new ResizeObserver(() => {
    const box = canvas.parentElement.getBoundingClientRect();
    if (!box.width || !box.height || renderer.xr.isPresenting) return;
    renderer.setSize(box.width, box.height, false);
    camera.aspect = box.width / box.height; camera.updateProjectionMatrix(); dirty = true;
  });
  ro.observe(canvas.parentElement);

  renderer.setAnimationLoop((_, frame) => {
    const dt = clock.getDelta();
    if (renderer.xr.isPresenting) {
      if (!seenFrame) { seenFrame = true; arStage?.("frame"); }
      if (frame && hit) {
        const hits = frame.getHitTestResults(hit);
        reticle.visible = hits.length > 0;
        if (reticle.visible && !seenSurface) { seenSurface = true; arStage?.("surface"); probeAt = performance.now() + 1000; }
        if (reticle.visible) {
          reticle.matrix.fromArray(hits[0].getPose(renderer.xr.getReferenceSpace()).transform.matrix);
          if (!placed) { stand.visible = true; stand.position.setFromMatrixPosition(reticle.matrix); }
        }
      }
      mixer?.update(dt);
      renderer.render(scene, camera);
      if (probeAt && performance.now() > probeAt) { probeAt = 0; arStage?.("probe", probe()); }
      return;
    }
    if (mixer && action && !action.paused) { mixer.update(dt); dirty = true; }
    if (controls.autoRotate) dirty = true;
    controls.update(dt);
    if (dirty) { renderer.render(scene, camera); dirty = false; }
  });

  function frame() {
    const box = new THREE.Box3().setFromObject(holder);
    const f = frameBox(box.min.toArray(), box.max.toArray(), FOV, camera.aspect || 1, 1.1);
    const target = new THREE.Vector3(...f.center);
    home = { target, pos: target.clone().addScaledVector(VIEW_DIR, f.distance) };
    camera.near = f.near; camera.far = f.far; camera.updateProjectionMatrix();
    controls.minDistance = f.radius * 0.25; controls.maxDistance = f.distance * 6;
    reset();
  }

  function reset() {
    if (!home) return;
    camera.position.copy(home.pos); controls.target.copy(home.target);
    controls.autoRotate = true; controls.update(); dirty = true;
  }

  /** bytes of a .glb/.gltf → { size: [x, y, z] in metres, clips: [names] }; the model stands centred on the floor */
  async function load(bytes) {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await loader.parseAsync(buf, "");
    if (model) { holder.remove(model); disposeTree(model); }
    mixer?.stopAllAction(); action = null;
    model = gltf.scene || gltf.scenes?.[0];
    if (!model) throw new Error("no scene");
    holder.position.set(0, 0, 0); holder.add(model);
    const box = new THREE.Box3().setFromObject(holder);
    if (box.isEmpty()) throw new Error("empty scene");
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    holder.position.set(-c.x, -box.min.y, -c.z);
    // the ring stays inside the model's own width: framing fits the model, and the floor is nearer the camera than
    // the model's centre, so a ring as wide as the model was cut by the split-screen stage (412×430)
    modelSize = Math.max(size.x, size.y, size.z);
    const foot = Math.max(size.x, size.z);
    floor.scale.setScalar(foot * 1.1); ring.scale.setScalar(foot * 0.8);
    mixer = new THREE.AnimationMixer(model); clips = gltf.animations || [];
    frame();
    return { size: size.toArray(), clips: clips.map((a, i) => a.name || `#${i + 1}`) };
  }

  function play(i) {
    if (!mixer || !clips[i]) return;
    mixer.stopAllAction();
    action = mixer.clipAction(clips[i]).reset().play(); dirty = true;
  }
  function setPaused(p) { if (action) { action.paused = p; dirty = true; } }

  /** the current frame as a PNG with a transparent background */
  function snapshot() {
    renderer.render(scene, camera);
    return new Promise((ok) => canvas.toBlob(ok, "image/png"));
  }

  async function arSupported() {
    try { return !!(await navigator.xr?.isSessionSupported?.("immersive-ar")); } catch { return false; }
  }

  /**
   * WebXR AR on `overlay` (its controls stay tappable through dom-overlay). `onStage(name, ms, info)` reports each
   * step — granted · layer · hit-test · frame · surface · placed — `onEnd` fires whenever the session closes.
   * A session we started NEVER outlives a failed step: the owner's S25 (2026-10-27, build 12119cc) kept one alive
   * after a failure, then got "already an active, immersive XRSession" and, from another tab, 13× "The specified
   * session configuration is not supported" — the device runs one immersive session at a time.
   */
  async function startAR(overlay, { onStage, onEnd } = {}) {
    if (xr) await xr.end().catch(() => {});
    const t0 = performance.now();
    arStage = (name, info) => onStage?.(name, Math.round(performance.now() - t0), info);
    // Every feature OPTIONAL, and a second config without dom-overlay: the S25 (build 5029839) refused the
    // hit-test-required + dom-overlay request 4/4 with NotSupportedError after the permission was granted, and
    // Chromium answers that same message when the overlay's fullscreen fails. Which config ran goes to the log.
    const CONFIGS = [
      { optionalFeatures: ["hit-test", "dom-overlay"], domOverlay: { root: overlay } },
      { optionalFeatures: ["hit-test"] },
    ];
    let session = null, config = 0;
    for (; config < CONFIGS.length; config++) {
      try { session = await navigator.xr.requestSession("immersive-ar", CONFIGS[config]); break; }
      catch (e) { arStage("refused", { config, name: e?.name || "", why: String(e?.message || e).slice(0, 80) }); if (e?.name !== "NotSupportedError" || config === CONFIGS.length - 1) throw e; }
    }
    xr = session; seenFrame = false; seenSurface = false;
    session.addEventListener("end", () => {
      xr = null; hit = null; arStage = null; probeAt = 0; reticle.visible = false;
      stand.visible = true; stand.position.set(0, 0, 0); stand.scale.setScalar(1); controls.enabled = true;
      ro.disconnect(); ro.observe(canvas.parentElement); reset(); onEnd?.();
    }, { once: true });
    arStage("granted", { config, overlay: session.domOverlayState?.type || "none", features: [...(session.enabledFeatures || [])].join(",") });
    try {
      renderer.xr.setReferenceSpaceType("local");
      await renderer.xr.setSession(session);
      arStage("layer");
      // no hit-test (an optional feature the device may not grant): the model stands 1.5 m ahead and 1.2 m below
      // the phone's starting point — a chosen default for a phone held at chest height, not a measured floor
      hit = session.requestHitTestSource
        ? await session.requestHitTestSource({ space: await session.requestReferenceSpace("viewer") }).catch(() => null)
        : null;
      arStage(hit ? "hit-test" : "no-hit-test");
    } catch (e) { session.end().catch(() => {}); throw e; }
    placed = !hit; stand.visible = !hit; controls.enabled = false;
    if (!hit) stand.position.set(0, -1.2, -1.5);
    // glTF says metres, files often mean centimetres (100× — the camera ends up inside) or millimetres (a speck):
    // outside 5 cm … 2.5 m the AR copy is brought to 30 cm / 1 m; the viewer keeps the file's own size
    stand.scale.setScalar(modelSize > 2.5 ? 1 / modelSize : modelSize > 0 && modelSize < 0.05 ? 0.3 / modelSize : 1);
    let firstPlace = true;
    session.addEventListener("select", () => {
      if (!reticle.visible) return;
      placed = true; stand.position.setFromMatrixPosition(reticle.matrix); arStage?.("placed");
      if (firstPlace) { firstPlace = false; probeAt = performance.now() + 1000; }
    });
  }
  const stopAR = () => xr?.end().catch(() => {});

  function dispose() {
    xr?.end().catch(() => {});
    renderer.setAnimationLoop(null); ro.disconnect(); controls.dispose();
    if (model) disposeTree(model);
    draco.dispose(); pmrem.dispose(); scene.environment?.dispose(); renderer.dispose();
  }

  return { load, play, setPaused, reset, snapshot, arSupported, startAR, stopAR, dispose };
}
