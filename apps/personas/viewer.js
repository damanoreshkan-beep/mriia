import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { frameBox } from "/_rt/glb.js";

const FOV = 32, DRACO = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";

/** A turntable for one .glb on `canvas`; untextured meshes get a clay skin. → `dispose()`. */
export function showModel(canvas, url, { onReady, onFail } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(2, 3, 4); scene.add(key);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 1.6; controls.enablePan = false;
  const clay = new THREE.MeshStandardMaterial({ color: 0xd9cfc4, roughness: 0.62, metalness: 0 });
  let model = null, raf = 0, alive = true;
  const fit = () => {
    const box = canvas.parentElement.getBoundingClientRect();
    if (!box.width || !box.height) return;
    renderer.setSize(box.width, box.height, false);
    camera.aspect = box.width / box.height; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit); ro.observe(canvas.parentElement); fit();
  new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(DRACO)).setMeshoptDecoder(MeshoptDecoder).load(url, (g) => {
    if (!alive) return;
    model = g.scene;
    model.traverse((n) => { if (n.isMesh && !n.material?.map) n.material = clay; });
    const b = new THREE.Box3().setFromObject(model);
    const f = frameBox(b.min.toArray(), b.max.toArray(), FOV, camera.aspect || 1, 1.05);
    controls.target.fromArray(f.center);
    camera.near = f.near; camera.far = f.far; camera.updateProjectionMatrix();
    camera.position.set(f.center[0], f.center[1] + f.radius * 0.1, f.center[2] + f.distance);
    scene.add(model);
    onReady?.();
  }, undefined, (e) => { console.warn("[personas] model", e?.message || e); if (alive) onFail?.(); });
  const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
  loop();
  return () => {
    alive = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
    model?.traverse((n) => { n.geometry?.dispose?.(); });
    clay.dispose(); pmrem.dispose(); renderer.dispose();
  };
}
