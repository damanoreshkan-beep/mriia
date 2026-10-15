import { createEngine } from "/_rt/audio.js";
import { spectralFlux, createBeatState, stepBeat } from "/_rt/afterbeat.js";
import { bassEnergy, stepPulse, idleGroove } from "/_rt/afterdark.js";
import { dbToGain } from "/_rt/scifi.js";

// ONE LEVEL (owner 2026-10-15: «вирівняй звук і прибери цю логіку яка розподіляє звук між музикою ефектами і так
// далі»): every effect and the music are brought to the same loudness from their measured LUFS (ebur128), one bus,
// no per-role targets, no music / effects / city faders. What still moves a sound is the game itself — a bed's
// intensity per frame in stage.js (the horde by distance, the heartbeat when it is close) — and the one mute.
const LEVEL = -20;
export const SFX = {
  run: { loop: true, lufs: -19.4 },
  jump: { lufs: -20.9, spread: 0.06 }, land: { lufs: -27.3, spread: 0.08 }, slide: { lufs: -25.1 }, lane: { lufs: -14.7, spread: 0.12 },
  coin: { lufs: -19.8, spread: 0.1 }, stumble: { lufs: -19.9 },
  "hit-wood": { lufs: -14.0 }, "hit-metal": { lufs: -14.2 }, "hit-car": { lufs: -17.4 },
  "zombie-growl-1": { lufs: -16.4, spread: 0.1 }, "zombie-growl-2": { lufs: -15.4, spread: 0.1 }, "zombie-scream": { lufs: -13.2 },
  horde: { loop: true, lufs: -14.3 }, "horde-run": { loop: true, lufs: -15.8 },
  bite: { lufs: -14.3 }, fall: { lufs: -15.9 }, heartbeat: { loop: true, lufs: -15.7 },
  wind: { loop: true, lufs: -16.4 }, "lamp-hum": { loop: true, lufs: -14.7 }, "lamp-pop": { lufs: -17.4 }, siren: { lufs: -14.3 }, crow: { lufs: -13.3 },
  "whoosh-start": { lufs: -15.1 }, over: { lufs: -15.2 },
  "shot-pistol": { lufs: -18.3, spread: 0.05 }, "shot-shotgun": { lufs: -18.7, spread: 0.04 }, "shot-smg": { lufs: -18.4, spread: 0.06 },
  reload: { lufs: -22.6 }, "zombie-hit": { lufs: -16.8, spread: 0.1 }, "zombie-die": { lufs: -14.5, spread: 0.08 },
  can: { lufs: -10.9 }, boost: { loop: true, lufs: -14.5 }, bats: { lufs: -13.9 },
};
const gainOf = (spec) => dbToGain(LEVEL - spec.lufs);
// the rave stream rides 6 dB over the effects (owner 2026-10-15: «зроби музику радіо більш виразнішою, там же рейв
// пісні класно слухати»): at the common level the beds — wind, steps, the horde — covered it. Measured at −9.8 LUFS,
// so at −14 its peaks stay under the brickwall (−3 dBFS) and the kick is not squashed.
const MUSIC_LEVEL = LEVEL + 6;
const MUSIC = dbToGain(MUSIC_LEVEL - -9.8);
const url = (name) => new URL(`assets/sfx-${name}.mp3`, import.meta.url).href;
const STREAM = "https://streams.rautemusik.fm/techno/mp3-192";
const IDLE_BPM = 126;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = (x) => x - Math.floor(x);

/** The game's sound engine, or null where Web Audio does not exist (the gate). `muted()` reads the one switch. */
export function createSound({ muted }) {
  const eng = createEngine({ master: 0.85, noise: false });
  if (!eng) return null;
  const { ctx, master } = eng;
  const buffers = new Map(), loops = new Map();
  let loaded = false, loading = null;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.003; limiter.release.value = 0.25;
  master.disconnect(); master.connect(limiter); limiter.connect(ctx.destination);
  const musicGain = ctx.createGain(); musicGain.gain.value = MUSIC; musicGain.connect(master);

  async function load() {
    if (loading) return loading;
    loading = Promise.all(Object.keys(SFX).map(async (name) => {
      try { const ab = await (await fetch(url(name))).arrayBuffer(); buffers.set(name, await ctx.decodeAudioData(ab)); }
      catch { }
    })).then(() => { loaded = true; });
    return loading;
  }
  function play(name, { gain = 1, rate = 1 } = {}) {
    const buf = buffers.get(name), spec = SFX[name]; if (!buf || !spec || muted()) return;
    const s = ctx.createBufferSource(); s.buffer = buf;
    s.playbackRate.value = rate * (1 + (spec.spread ? (Math.random() - 0.5) * 2 * spec.spread : 0));
    const g = ctx.createGain(); g.gain.value = gainOf(spec) * gain;
    s.connect(g); g.connect(master); s.start();
  }
  function bed(name) {
    if (loops.has(name)) return loops.get(name);
    const buf = buffers.get(name), spec = SFX[name]; if (!buf || !spec) return null;
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(g); g.connect(master); s.start();
    const h ={ s, g, full: gainOf(spec) };
    loops.set(name, h);
    return h;
  }
  const bedTo = (name, gain, rate = 1, k = 0.15) => { const h = bed(name); if (!h) return; const want = muted() ? 0 : gain * h.full; h.g.gain.value += (want - h.g.gain.value) * k; if (Math.abs(h.s.playbackRate.value - rate) > 0.005) h.s.playbackRate.value = rate; };
  function stopBeds() { for (const h of loops.values()) { try { h.s.stop(); } catch { } } loops.clear(); }

  let el = null, src = null, an = null, beatAn = null, freq = null, fdb = null, mag = null, magPrev = null, live = false;
  const beat = { state: createBeatState(), pulseState: null, bpm: IDLE_BPM, phase: 0, confidence: 0, pulse: 0, energy: 0, tick: 0, last: 0 };
  function music(on) { stream(on); }
  function stream(on) {
    if (!on) { if (el) { try { el.pause(); el.removeAttribute("src"); el.load(); } catch { } } el = null; live = false; return; }
    if (el) { el.play().catch(() => {}); return; }
    const a = document.createElement("audio");
    a.crossOrigin = "anonymous"; a.preload = "none"; a.volume = 1;
    a.onplaying = () => { if (el === a) live = true; };
    a.onerror = a.onended = a.onstalled = () => { if (el === a) live = false; };
    el = a;
    try {
      src = ctx.createMediaElementSource(a);
      if (!an) { an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.4; freq = new Uint8Array(an.frequencyBinCount); }
      if (!beatAn) { beatAn = ctx.createAnalyser(); beatAn.fftSize = 1024; beatAn.smoothingTimeConstant = 0; fdb = new Float32Array(beatAn.frequencyBinCount); mag = new Float32Array(beatAn.frequencyBinCount); magPrev = new Float32Array(beatAn.frequencyBinCount); }
      src.connect(an); src.connect(beatAn); src.connect(musicGain);
    } catch { }
    a.src = STREAM;
    a.play().catch(() => { live = false; });
  }
  function tick(nowMs) {
    const dt = beat.last ? Math.min(0.1, (nowMs - beat.last) / 1000) : 0; beat.last = nowMs;
    master.gain.value += ((muted() ? 0 : 0.85) - master.gain.value) * 0.1;
    if (live && an) {
      an.getByteFrequencyData(freq);
      beat.energy = bassEnergy(freq);
      beat.pulseState = stepPulse(beat.pulseState, beat.energy);
      beat.pulse = beat.pulseState.pulse;
      beatAn.getFloatFrequencyData(fdb);
      for (let i = 0; i < fdb.length; i++) { const v = (fdb[i] + 100) / 70; mag[i] = v > 0 ? (v < 1 ? v : 1) : 0; }
      const b = stepBeat(beat.state, spectralFlux(mag, magPrev), nowMs / 1000);
      const t = mag; mag = magPrev; magPrev = t;
      beat.state = b.state; beat.bpm = b.bpm; beat.confidence = b.confidence;
      const lead = (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + 1 / 60;
      beat.phase = frac(b.beatPhase + lead * b.bpm / 60);
    } else {
      beat.tick += dt; beat.pulse = idleGroove(beat.tick); beat.energy = beat.pulse;
      beat.bpm = IDLE_BPM; beat.confidence = 0; beat.phase = frac(beat.tick * IDLE_BPM / 60);
    }
    return beat;
  }

  return {
    load, play, bedTo, stopBeds, music, tick, beat,
    get ready() { return loaded; },
    get live() { return live; },
    resume: () => ctx.resume(),
    dispose() { stopBeds(); music(false); try { ctx.close(); } catch { } },
  };
}
