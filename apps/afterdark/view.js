
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { persistentAtom } from "@nanostores/persistent";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { wakeLock } from "/_rt/sensors.js";
import { holdAudio } from "/_rt/mediasession.js";
import { gate } from "/_rt/gate.js";
import { Island, Transport } from "/_rt/ui.js";
import { GlStage } from "/_rt/glstage.js";
import { retryDelay, progressCheck } from "/_rt/tide.js";
import { bassEnergy, stepPulse, idleGroove, integratePhase, GIRLS, girlById } from "/_rt/afterdark.js";

const STREAM = "https://streams.rautemusik.fm/techno/mp3-192";
const AC = typeof AudioContext !== "undefined" ? AudioContext : (typeof globalThis !== "undefined" && globalThis.webkitAudioContext) || null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const spriteUrl = (id) => new URL(`girls/${id}.png`, import.meta.url).href;
const depthUrl = (id) => new URL(`girls/${id}-depth.png`, import.meta.url).href;

const $girl = persistentAtom("afterdark:girl", GIRLS[0].id);
const $muted = persistentAtom("afterdark:muted", "0");
const $entered = atom(gate);
const $playing = atom(false);
const $state = atom("idle");                                     
const muted = () => $muted.get() === "1";

let el = null, ctx = null, src = null, analyser = null, freq = null, np = null, wl = null;
let attempt = 0, retryTimer = null, stallTimer = null, connectTimer = null, liveTimer = null, mark = null;

function attach(a) {
  if (src) { try { src.disconnect(); } catch {  } src = null; }
  if (!AC) return;
  try {
    ctx ||= new AC();
    ctx.resume();
    src = ctx.createMediaElementSource(a);
    if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.4; freq = new Uint8Array(analyser.frequencyBinCount); analyser.connect(ctx.destination); }
    src.connect(analyser);
  } catch { src = null; }
}

function hold() {
  if (!np) np = holdAudio({ title: "rautemusik", artist: "techno", onPlay: () => { if (!$playing.get()) start(); }, onPause: () => stop(), resumeCtx: () => ctx?.resume() });
  np.setPlaying("rautemusik");
}

function play({ reconnect = false } = {}) {
  if (gate || typeof Audio === "undefined") { $playing.set(true); $state.set("live"); hold(); return; }
  if (!reconnect) attempt = 0;
  clearTimeout(retryTimer); clearTimeout(stallTimer); clearTimeout(connectTimer);
  const old = el;
  if (old) { try { old.pause(); old.removeAttribute("src"); old.load(); } catch {  } }
  const a = document.createElement("audio");
  a.preload = "none";
  a.crossOrigin = "anonymous";                                   
  a.src = STREAM;
  a.volume = muted() ? 0 : 1;
  el = a;
  $state.set(reconnect ? "reconnecting" : "connecting");
  let hadAudio = false;
  const armStall = () => { clearTimeout(stallTimer); stallTimer = setTimeout(() => { if (el === a && $state.get() !== "live") lost(a); }, 8000); };
  a.onplaying = () => { if (el !== a) return; attempt = 0; hadAudio = true; clearTimeout(connectTimer); clearTimeout(stallTimer); $state.set("live"); a.volume = muted() ? 0 : 1; };
  a.onwaiting = a.onstalled = () => { if (el !== a) return; if (hadAudio) { $state.set("reconnecting"); armStall(); } };
  a.onended = () => { if (el === a) lost(a); };
  a.onerror = () => { if (el === a) lost(a); };
  connectTimer = setTimeout(() => { if (el === a && $state.get() !== "live") lost(a); }, 12000);
  attach(a);
  const p = a.play();
  if (p && p.catch) p.catch((err) => { if (el !== a) return; if (err && err.name === "NotAllowedError") { stop(); return; } lost(a); });
  $playing.set(true);
  if (!wl) wl = wakeLock.acquire();
  hold();
  mark = null;
  if (!liveTimer) liveTimer = setInterval(probe, 4000);
}

function lost(a) {
  if (el !== a || !$playing.get()) return;
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  $state.set(online ? "reconnecting" : "offline");
  el = null; try { a.pause(); a.removeAttribute("src"); a.load(); } catch {  }
  clearTimeout(connectTimer); clearTimeout(stallTimer); clearTimeout(retryTimer);
  const wait = retryDelay(attempt); attempt += 1;
  retryTimer = setTimeout(() => { retryTimer = null; if ($playing.get()) play({ reconnect: true }); }, wait);
}
function probe() {
  if (gate || !$playing.get() || !el || $state.get() !== "live") return;
  const r = progressCheck({ time: el.currentTime, mark, now: performance.now() });
  mark = r.mark;
  if (r.dead) lost(el);
}
function relink() {
  if (!$playing.get() || gate) return;
  if ($state.get() !== "live") { clearTimeout(retryTimer); retryTimer = null; play({ reconnect: true }); return; }
  probe();
}
if (typeof addEventListener !== "undefined") {
  addEventListener("online", relink);
  try { navigator.connection?.addEventListener?.("change", relink); } catch {  }
}

function stop() {
  $playing.set(false); $state.set("idle");
  clearTimeout(connectTimer); clearTimeout(retryTimer); clearTimeout(stallTimer);
  attempt = 0;
  if (el) { const o = el; el = null; try { o.pause(); o.removeAttribute("src"); o.load(); } catch {  } }
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  mark = null;
  if (wl) { wl.release(); wl = null; }
  if (np) { np.release(); np = null; }
}
const start = () => play({});
const toggle = () => { $playing.get() ? stop() : start(); };
function setMuted(m) { $muted.set(m ? "1" : "0"); if (el) { try { el.volume = m ? 0 : 1; } catch {  } } }
function selectGirl(id) {
  if (id === $girl.get()) return;
  env.girlFade = 0; env.girlFadeTo = 1;                          
  $girl.set(id);
}

const env = { last: 0, tick: 0, pulseState: { pulse: 0, baseline: 0 }, dph: 0, sph: 0, girlFade: gate ? 1 : 0, girlFadeTo: 1, tiltX: 0, tiltY: 0, ttx: 0, tty: 0, mode: "auto" };
function vary() {
  const now = performance.now();
  const dt = env.last ? Math.min(0.1, (now - env.last) / 1000) : 0; env.last = now;
  let pulse;
  if (analyser && src && $playing.get() && $state.get() === "live") {
    analyser.getByteFrequencyData(freq);
    env.pulseState = stepPulse(env.pulseState, bassEnergy(freq));
    pulse = env.pulseState.pulse;
  } else {
    env.tick += dt; pulse = idleGroove(env.tick);
  }
  env.dph += dt * 2.1;                                           
  env.sph = integratePhase(env.sph, dt, pulse);
  env.girlFade += (env.girlFadeTo - env.girlFade) * 0.14;
  return [pulse, env.dph, env.sph, clamp(env.girlFade, 0, 1)];
}
function ink() {
  if (env.mode === "auto") { const t = env.tick; env.ttx = Math.sin(t * 0.5) * 0.5; env.tty = Math.sin(t * 0.33) * 0.3; }
  env.tiltX += (env.ttx - env.tiltX) * 0.06;
  env.tiltY += (env.tty - env.tiltY) * 0.06;
  return [env.tiltX, env.tiltY, 0, 0];
}
function armOrient() {
  env.mode = "orient";
  addEventListener("deviceorientation", (e) => { if (e.gamma == null && e.beta == null) return; env.mode = "orient"; env.ttx = clamp(e.gamma / 35, -1, 1); env.tty = clamp((e.beta - 45) / 35, -1, 1); });
}
function requestTilt() {
  try {
    const D = typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : null;
    if (D && typeof D.requestPermission === "function") D.requestPermission().then((s) => { s === "granted" ? armOrient() : (env.mode = "pointer"); }).catch(() => { env.mode = "pointer"; });
    else if (D) armOrient();
    else env.mode = "pointer";
  } catch { env.mode = "pointer"; }
}
async function enter() {
  $entered.set(true);
  try { if (AC) { ctx ||= new AC(); await ctx.resume(); } } catch {  }
  requestTilt();
  start();
}

const CSS = `
header.navbar{background:rgba(10,6,18,.9);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.07)}
header.navbar [data-title],header.navbar [data-battery]{color:rgba(255,255,255,.92)!important}
.ad-dot{width:.5rem;height:.5rem;border-radius:9999px;background:var(--app-accent);box-shadow:0 0 8px var(--app-accent)}
[data-rave][data-state="live"] .ad-dot{animation:adPulse .46s ease-in-out infinite}
[data-rave][data-state="connecting"] .ad-dot,[data-rave][data-state="reconnecting"] .ad-dot{animation:adBlink 1s steps(2) infinite}
@keyframes adPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.9);opacity:.55}}
@keyframes adBlink{0%{opacity:1}50%{opacity:.25}}
.ad-enter-ring{box-shadow:0 0 0 1px rgba(255,255,255,.18),0 0 40px 0 color-mix(in oklch,var(--app-accent) 55%,transparent)}
@keyframes adBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
[data-enter] .ad-enter-ring{animation:adBreath 2.6s ease-in-out infinite}
@media(prefers-reduced-motion:reduce){.ad-dot,[data-enter] .ad-enter-ring{animation:none!important}}`;


export function afterdark({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const girlId = useStore($girl);
  const playing = useStore($playing);
  const state = useStore($state);
  const entered = useStore($entered);
  const mute = useStore($muted) === "1";
  const voidRef = useRef();

  
  useEffect(() => { if (gate) start(); return () => {}; }, []);

  const stateLine = state === "connecting" ? T(t, "connecting") : state === "reconnecting" ? T(t, "reconnecting") : state === "offline" ? T(t, "offline") : state === "live" ? T(t, "live") : T(t, "idle");
  const onToggle = () => (entered ? toggle() : enter());
  const onPointer = (e) => { if (env.mode === "orient") return; env.mode = "pointer"; const r = e.currentTarget.getBoundingClientRect(); env.ttx = clamp((e.clientX - r.left) / r.width * 2 - 1, -1, 1); env.tty = clamp((e.clientY - r.top) / r.height * 2 - 1, -1, 1); };

  return html`<${Fragment}>
    <style>${CSS}</style>
    
    <div class="fixed inset-0 -z-10" style="background:radial-gradient(120% 90% at 50% 8%, #1A0A22 0%, #0C0614 46%, #050308 100%)"></div>
    <${GlStage} shader=${new URL("afterdark.frag", import.meta.url)} seed=${(girlById(girlId).id.charCodeAt(0) % 13) / 13}
      cam=${() => girlEl(girlId)} tex2=${depthUrl(girlId)} vary=${vary} ink=${ink} zClass="z-0" />

    <div data-rave data-state=${state} data-active-girl=${girlId} data-entered=${entered ? "yes" : "no"}
      class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
      
      <div class="shrink-0 flex justify-center">
        <${Island} tone="dark" className="flex items-center gap-2.5 !py-1.5 !px-3.5 rounded-full">
          <span class="ad-dot shrink-0"></span>
          <span class="font-mono uppercase tracking-wider text-[length:var(--ms-label)] text-white/90">${T(t, "station")}</span>
          <span class="w-px h-3 bg-white/20"></span>
          <span class="font-mono uppercase tracking-wider text-[length:var(--ms-label)] text-white/65">${T(t, "genre")}</span>
          <span class="font-mono uppercase tracking-wider text-[length:var(--ms-label)] text-white/80 tabular-nums" aria-live="polite">· ${stateLine}</span>
        </${Island}>
      </div>

      
      <div ref=${voidRef} class="flex-1 min-h-0 relative" onPointerMove=${onPointer}>
        ${!entered ? html`<div class="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
          <button data-enter aria-label=${T(t, "enter")} onClick=${enter}
            class="pointer-events-auto flex flex-col items-center gap-3 select-none group">
            <span class="ad-enter-ring w-24 h-24 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white">
              <iconify-icon icon="lucide:play" class="text-4xl translate-x-0.5"></iconify-icon>
            </span>
            <span class="font-mono uppercase tracking-[0.28em] text-sm text-white/90">${T(t, "enter")}</span>
          </button>
        </div>` : null}
      </div>

      
      <${Island} tone="dark" className="shrink-0 flex flex-col gap-[var(--ms-gap)] max-w-md w-full mx-auto">
        <div class="flex items-center justify-center gap-3" role="group" aria-label=${T(t, "dancers")}>
          ${GIRLS.map((g) => {
            const on = g.id === girlId;
            return html`<button key=${g.id} data-girl=${g.id} type="button" aria-pressed=${on ? "true" : "false"}
              aria-label=${T(t, g.key)} onClick=${() => selectGirl(g.id)}
              class=${`relative w-12 h-12 rounded-full overflow-hidden shrink-0 transition-transform ${on ? "ring-2 ring-[var(--app-accent)] scale-105" : "ring-1 ring-white/15 opacity-70 hover:opacity-100"}`}
              style="background:#0C0614">
              <img src=${spriteUrl(g.id)} alt="" loading="lazy" decoding="async"
                class="absolute inset-0 w-full h-full object-cover" style="object-position:50% 16%" />
            </button>`;
          })}
        </div>
        
        <${Transport} locale=${loc} playing=${playing} onToggle=${onToggle} stopIcon=${true}
          actions=${[
            { id: "mute", icon: mute ? "lucide:volume-x" : "lucide:volume-2", label: T(t, mute ? "aUnmute" : "aMute"), active: mute, pressed: mute, onClick: () => setMuted(!mute), attr: { "data-mute": "" } },
          ]} />
      </${Island}>
    </div>
  </${Fragment}>`;
}



const imgs = {};
function girlEl(id) {
  if (typeof Image === "undefined") return null;
  if (!imgs[id]) { const im = new Image(); im.decoding = "async"; im.src = spriteUrl(id); imgs[id] = im; }
  return imgs[id];
}
