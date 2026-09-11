
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GIRLS, glbUrl } from "./girls.js";
import { DEFAULT_MOVES, moveUrl, tiersFor } from "./dances.js";

const DRACO_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = (x) => x - Math.floor(x);
const TARGET_H = 1.7;
const ORDER = GIRLS.map((g) => g.id);
const IDLE_URL = new URL("assets/clip-idle.glb", import.meta.url).href;   
const LOCK = 0.3;                                                    

const C_KEY = 0xffe9f4, C_MAG = 0xff3eb5, C_GRN = 0x39ff6a, C_GOLD = 0xf5b942, C_VIO = 0x8b5cf6;
const BAR_COLORS = [new THREE.Color(C_MAG), new THREE.Color(C_VIO), new THREE.Color(C_GRN), new THREE.Color(C_GOLD)];

const FLOOR_VERT = `varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAG = `precision highp float; varying vec2 vP;
uniform float uTime, uBeat, uBar, uPulse, uConf, uCalm; uniform vec3 uColor, uColor2;
void main(){
  float beat = 0.25 + 0.9 * max(uPulse, exp(-uBeat * 5.0) * uConf);
  vec2 g = abs(fract(vP * 0.9 + vec2(0.0, uTime * 0.18)) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.07, min(g.x, g.y));
  vec2 c = vP - vec2(0.0, -0.8);
  float r = length(c);
  float ring = exp(-pow((r - uBar * 6.0) * 1.6, 2.0)) * (1.0 - uBar) * uConf;
  float fade = smoothstep(7.5, 1.0, r);
  vec3 col = mix(uColor, uColor2, smoothstep(0.0, 1.0, uBar));
  float a = (line * beat * 0.32 + ring * 0.55) * fade * (1.0 - 0.8 * uCalm);
  gl_FragColor = vec4(col * a, 1.0);
}`;

export function createDanceStage(canvas, getEnv, onStatus = () => {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch (e) { onStatus("failed", String(e && e.message || e).slice(0, 80)); return { ok: false, setCast() {}, setMoves() {}, dispose() {} }; }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const DPR = Math.min(1.75, globalThis.devicePixelRatio || 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const hemi = new THREE.HemisphereLight(0x9a7ad8, 0x161022, 0.95); scene.add(hemi);
  const key = new THREE.DirectionalLight(C_KEY, 2.0); key.position.set(0.5, 3.5, 4); scene.add(key);
  const magenta = new THREE.DirectionalLight(C_MAG, 0.9); magenta.position.set(-4, 2.2, 2); scene.add(magenta);
  const green = new THREE.DirectionalLight(C_GRN, 0.9); green.position.set(4, 2.2, 2); scene.add(green);
  const gold = new THREE.DirectionalLight(C_GOLD, 0.7); gold.position.set(0, 3, -4); scene.add(gold);
  const violet = new THREE.DirectionalLight(C_VIO, 0.7); violet.position.set(-1, 3.2, -3); scene.add(violet);
  const washes = [magenta, green, gold, violet];

  const radial = (inner, outer) => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"), grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, inner); grad.addColorStop(1, outer); g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: 0x07040c, roughness: 0.75, metalness: 0.25, transparent: true, opacity: 0.85, alphaMap: radial("#ffffff", "#000000") }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.002, -2); scene.add(floor);
  const gridU = { uTime: { value: 0 }, uBeat: { value: 0 }, uBar: { value: 0 }, uPulse: { value: 0 }, uConf: { value: 0 }, uCalm: { value: 0 }, uColor: { value: BAR_COLORS[0].clone() }, uColor2: { value: BAR_COLORS[1].clone() } };
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.ShaderMaterial({ uniforms: gridU, vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  grid.rotation.x = -Math.PI / 2; grid.position.set(0, 0.003, -1.5); scene.add(grid);
  const lightPool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: radial("rgba(255,62,181,0.30)", "rgba(255,62,181,0)"), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  lightPool.rotation.x = -Math.PI / 2; lightPool.position.set(0, 0.004, -0.6); scene.add(lightPool);
  const shadowMat = new THREE.MeshBasicMaterial({ map: radial("rgba(0,0,0,0.6)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false });

  const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader().setDRACOLoader(draco);

  const pool = new Map();
  const loading = new Set();
  const hipsOf = (obj) => { let h = null; obj.traverse((o) => { if (!h && /hips$/i.test(o.name)) h = o; }); return h ? { bone: h, y: h.position.y } : { bone: null, y: 0 }; };
  const retargetHips = (clip, srcY, dstY) => {
    if (!srcY || !dstY || Math.abs(srcY - dstY) < 1e-4) return clip;
    const c = clip.clone(), r = dstY / srcY;
    for (const t of c.tracks) if (/hips\.position$/i.test(t.name)) for (let i = 0; i < t.values.length; i++) t.values[i] *= r;
    return c;
  };
  const poolEntry = (clip, hipsY) => ({ clip, hipsY });
  function loadClip(id, url) {
    if (pool.has(id) || loading.has(id)) return;
    loading.add(id);
    loader.loadAsync(url).then((g) => { loading.delete(id); if (!dead && g.animations[0]) { pool.set(id, poolEntry(g.animations[0], hipsOf(g.scene).y)); assignMoves(); } }).catch(() => { loading.delete(id); });
  }
  loadClip("idle", IDLE_URL);                                      

  const _v = new THREE.Vector3();
  const cast = new Map();       
  let order = [];
  let dead = false, loaded = 0, camDist = 6, camY = 1.05, lookY = 0.95;
  let tiers = tiersFor(DEFAULT_MOVES), moves = DEFAULT_MOVES.slice();

  function disposeEntry(e) {
    if (!e || !e.root) return;
    if (e.shadow) { scene.remove(e.shadow); e.shadow.geometry.dispose(); e.shadow = null; }
    scene.remove(e.root); e.mixer?.stopAllAction();
    e.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? [].concat(o.material) : [];
      for (const m of mats) { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose?.(); }
    });
  }

  function computeLayout() {
    const w = globalThis.innerWidth || 1, h = globalThis.innerHeight || 1, aspect = w / h;
    camera.aspect = aspect;
    const n = order.length || 1;
    const cols = Math.max(1, Math.min(n, Math.round(2 + aspect * 2.8)));
    const rows = Math.ceil(n / cols);
    const sx = 1.0, sz = 1.2;
    order.forEach((id, i) => {
      const e = cast.get(id); if (!e) return;
      const r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols), c = i - r * cols;
      e.tx = (c - (inRow - 1) / 2) * sx + (r % 2 ? sx * 0.5 : 0);
      e.tz = -r * sz;
      e.yaw = e.tx < -0.15 ? 0.14 : e.tx > 0.15 ? -0.14 : 0;
    });
    const frontW = Math.min(cols, n) * sx + 0.8, spanH = 2.35 + (rows - 1) * 0.3, vFov = camera.fov * Math.PI / 180;
    const distW = (frontW / 2) / (Math.tan(vFov / 2) * aspect), distH = (spanH / 2) / Math.tan(vFov / 2);
    camDist = Math.max(distW, distH) * 1.04 + (rows - 1) * sz * 0.5;
    camY = 1.0 + (rows - 1) * 0.55; lookY = 0.85 + (rows - 1) * 0.12;
    applyPositions();
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(DPR);
    renderer.setSize(w, h, false);
  }

  function applyPositions() {
    for (const id of order) {
      const e = cast.get(id); if (!e || !e.root) continue;
      e.root.position.x = e.tx + e.centerDX; e.root.position.z = e.tz; e.root.rotation.y = e.yaw;
      if (e.shadow) e.shadow.position.set(e.tx, 0.006, e.tz);
    }
  }

  function playMove(e, id, fade = 0.5) {
    if (!e || !e.mixer || e.current === id) return;
    const src = pool.get(id); if (!src) return;
    let a = e.actions.get(id);
    if (!a) { a = e.mixer.clipAction(retargetHips(src.clip, src.hipsY, e.hipsY)); a.setLoop(THREE.LoopRepeat, Infinity); e.actions.set(id, a); }
    a.enabled = true; a.setEffectiveWeight(1); a.reset(); a.play();
    if (e.currentAction && e.currentAction !== a) a.crossFadeFrom(e.currentAction, fade, true);
    e.currentAction = a; e.current = id;
  }

  let tier = "groove", lastTierAt = 0, rotation = 0;
  function assignMoves(fade = 0.5) {
    const list = tiers[tier] || tiers.groove;
    order.forEach((id, i) => {
      const e = cast.get(id); if (!e || !e.mixer) return;
      const want = list[(i + rotation) % list.length];
      playMove(e, pool.has(want) ? want : (pool.has(id) ? id : e.current), fade);
    });
  }

  async function loadGirl(id) {
    const e = { root: null, mixer: null, actions: new Map(), current: null, currentAction: null, token: 0, tx: 0, tz: 0, yaw: 0, centerDX: 0, baseY: 0, baseScale: 1, nextSwap: performance.now() + 4000 + Math.random() * 7000, nextSwapBar: 2 + ((Math.random() * 4) | 0) };
    cast.set(id, e);
    const token = ++e.token;
    let gltf;
    try { gltf = await loader.loadAsync(glbUrl(id)); } catch (err) { onStatus("failed", `${id}: ${String(err && err.message || err).slice(0, 80)}`); return; }
    if (dead || cast.get(id) !== e || e.token !== token) return;
    const root = gltf.scene;
    root.scale.setScalar(1);
    let box = new THREE.Box3().setFromObject(root);
    const s = TARGET_H / (box.getSize(new THREE.Vector3()).y || TARGET_H);
    root.scale.setScalar(s);
    box = new THREE.Box3().setFromObject(root);
    e.centerDX = -(box.min.x + box.max.x) / 2;
    e.baseY = -box.min.y; root.position.y = e.baseY;
    root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    e.mixer = new THREE.AnimationMixer(root);
    const hips = hipsOf(root); e.hips = hips.bone; e.hipsY = hips.y;            
    e.feet = []; root.traverse((o) => { if (/(Toe_End|ToeBase|Foot)$/i.test(o.name)) e.feet.push(o); });
    if (gltf.animations[0] && !pool.has(id)) pool.set(id, poolEntry(gltf.animations[0], e.hipsY));   
    e.baseScale = s; e.root = root;
    scene.add(root);
    e.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), shadowMat);
    e.shadow.rotation.x = -Math.PI / 2; scene.add(e.shadow);
    computeLayout();
    playMove(e, pool.has(id) ? id : (pool.keys().next().value), 0);              
    assignMoves(0);                                                              
    if (++loaded === 1) onStatus("ready", id);
  }

  function setCast(ids) {
    const want = ORDER.filter((id) => ids.includes(id));
    if (!want.length) return;
    for (const id of [...cast.keys()]) if (!want.includes(id)) { disposeEntry(cast.get(id)); cast.delete(id); }
    order = want;
    for (const id of want) if (!cast.has(id)) loadGirl(id);
    computeLayout();
  }

  function setMoves(ids) {
    const want = ids.filter((id) => moveUrl(id));
    if (!want.length) return;
    moves = want; tiers = tiersFor(moves);
    for (const id of moves) loadClip(id, moveUrl(id));
    assignMoves(0.6);
  }
  setMoves(moves);

  let prevPulse = 0, kick = 0, sEnergy = 0, calm = 0, last = 0, raf = 0, t0 = 0;
  let lastBar = -1, lastPhrase = -1, colorIdx = 0;
  function frame() {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const env = getEnv() || {};
    const pulse = clamp(env.pulse || 0, 0, 1);
    const active = env.playing !== false;                                        
    const now = performance.now();
    if (!t0) t0 = now;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;

    const conf = clamp(env.confidence || 0, 0, 1), locked = active && conf > LOCK;
    const beatA = frac(env.beatA || 0), barA = frac(env.barA || 0), beatIndex = env.beatIndex | 0;
    const bar = Math.floor(beatIndex / 4), phrase = Math.floor(beatIndex / 16);
    const barTick = locked && bar !== lastBar; if (locked) lastBar = bar;
    const phraseTick = locked && phrase !== lastPhrase; if (locked) lastPhrase = phrase;
    if (barTick) colorIdx = bar % BAR_COLORS.length;

    if (!still && active && pulse > prevPulse + 0.05 && pulse > 0.26) kick = 1; else kick *= Math.pow(0.008, dt);
    kick = clamp(kick, 0, 1); prevPulse = pulse;
    const lit = still ? 0 : (locked ? conf : 0);                                 
    const beatEnv = Math.exp(-beatA * 6) * lit;                                  
    const hit = Math.max(kick, beatEnv);                                          
    sEnergy += ((env.energy ?? pulse) - sEnergy) * clamp(dt * 3, 0, 1);
    calm += (((tier === "calm") ? 1 : 0) - calm) * clamp(dt * 4, 0, 1);

    const target = !active ? "calm" : sEnergy < 0.14 ? "light" : sEnergy < 0.36 ? "groove" : "drive";
    const dwell = (target === "calm" || tier === "calm") ? 500 : 5000;
    const may = (target === "calm" || tier === "calm") ? now - lastTierAt > dwell : (locked ? phraseTick : now - lastTierAt > dwell);
    if (target !== tier && may) { tier = target; lastTierAt = now; rotation++; assignMoves(0.6); }

    const kEff = kick * (1 - calm * 0.85);
    const drive = tier === "drive" ? 1 : tier === "groove" ? 0.35 : 0;
    const dip = 1 - 0.55 * lit * (barA > 0.86 ? (barA - 0.86) / 0.14 : 0);       
    const slam = lit * Math.exp(-barA * 4);                                       
    const chase = beatIndex & 3;
    for (let i = 0; i < 4; i++) {
      const lead = chase === i ? 1 : 0.22;
      const on = Math.max(pulse * 0.8, beatEnv * lead, slam * 0.5);
      const idle = 0.55 * (1 - lit) + 0.12 * lit;                                
      washes[i].intensity = ((idle + 2.6 * on) * dip) * (1 - calm) + 0.45 * calm;
    }
    const strobe = drive * lit * Math.exp(-beatA * 18) * (0.5 + 0.5 * Math.min(1, sEnergy * 2));
    key.intensity = (2.0 * (1 - 0.5 * lit * (1 - beatEnv)) + 0.7 * pulse + 5.5 * strobe) * dip * (1 - calm * 0.4) + 0.8 * calm;
    hemi.intensity = (0.95 * (1 - 0.45 * lit * (1 - Math.max(beatEnv, slam)))) * dip * (1 - calm * 0.3) + 0.3 * calm;
    lightPool.material.opacity = (0.3 + 0.7 * hit) * dip * (1 - calm * 0.7);      
    lightPool.scale.setScalar(1 + 0.12 * hit);
    gridU.uTime.value = (now - t0) / 1000; gridU.uBeat.value = beatA; gridU.uBar.value = barA; gridU.uPulse.value = pulse;
    gridU.uConf.value = locked ? conf : 0.35; gridU.uCalm.value = calm;
    gridU.uColor.value.copy(BAR_COLORS[colorIdx]); gridU.uColor2.value.copy(BAR_COLORS[(colorIdx + 1) % BAR_COLORS.length]);

    const sq = 1 - 0.055 * kEff, ex = 1 + 0.05 * kEff, hop = 0.055 * kEff;
    const list = tiers[tier] || tiers.groove;
    for (const id of order) {
      const e = cast.get(id); if (!e || !e.mixer || !e.root) continue;
      const due = locked ? (barTick && bar >= e.nextSwapBar) : now > e.nextSwap;
      if (active && tier !== "calm" && list.length > 1 && due) {
        let m = e.current; for (let k = 0; k < 4 && (m === e.current || !pool.has(m)); k++) m = list[(Math.random() * list.length) | 0];
        playMove(e, m, 0.7); e.nextSwap = now + 7000 + Math.random() * 7000; e.nextSwapBar = bar + 4 + ((Math.random() * 4) | 0);
      }
      e.mixer.timeScale = 1; e.mixer.update(dt);
      e.root.scale.set(e.baseScale * ex, e.baseScale * sq, e.baseScale * ex);
      if (e.feet && e.feet.length) {
        e.root.position.y = 0; e.root.updateMatrixWorld(true);
        let low = Infinity; for (const f of e.feet) { f.getWorldPosition(_v); if (_v.y < low) low = _v.y; }
        e.root.position.y = (Number.isFinite(low) ? -low : e.baseY) + hop;
      } else e.root.position.y = e.baseY + hop;
      if (e.hips && e.shadow) { e.root.updateMatrixWorld(); e.hips.getWorldPosition(_v); e.shadow.position.x = _v.x; e.shadow.position.z = _v.z; }
    }

    const tx = env.tiltX || 0, ty = env.tiltY || 0;
    camera.position.set(tx * 0.24, camY - ty * 0.18, camDist);
    camera.lookAt(0, lookY, 0);
    renderer.render(scene, camera);
  }

  computeLayout();
  addEventListener("resize", computeLayout);
  frame();

  return {
    ok: true,
    setCast,
    setMoves,
    dispose() {
      dead = true; cancelAnimationFrame(raf); removeEventListener("resize", computeLayout);
      for (const e of cast.values()) disposeEntry(e);
      grid.geometry.dispose(); grid.material.dispose();
      try { renderer.dispose(); renderer.forceContextLoss?.(); } catch {  }
    },
  };
}
