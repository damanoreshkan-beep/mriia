import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { audioSupported, createEngine, midiToFreq } from "/_rt/audio.js";
import { blow, fingeredSemitone, handCovered } from "/_rt/wind.js";
import { haptic } from "/_rt/sensors.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const TONIC = 72;
const SCALE = [11, 9, 7, 5, 4, 2, 0];
const HOLES = 6;
const TOP = 28, GAP = 11.4;
const HIT = 0.052;
const NAMES = ["До", "До♯", "Ре", "Ре♯", "Мі", "Фа", "Фа♯", "Соль", "Соль♯", "Ля", "Ля♯", "Сі"];
const LAT = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";

const semitoneFor = (covered) => fingeredSemitone(covered, SCALE);

export function sopilka({ S }) {
  const t = useStore(S.t);
  const [covered, setCovered] = useState(() => new Set());
  const [blowing, setBlowing] = useState(false);
  const [over, setOver] = useState(false);
  const eng = useRef(null), voice = useRef(null), pipe = useRef(null);
  const ptrs = useRef(new Map());
  const overRef = useRef(false); overRef.current = over;

  const ensure = () => {
    if (!audioSupported) return null;
    if (!eng.current) eng.current = createEngine({ master: 0.8 });
    eng.current.resume();
    return eng.current;
  };
  const freqOf = (set) => midiToFreq(TONIC + semitoneFor(set) + (overRef.current ? 12 : 0));

  useEffect(() => () => { try { voice.current?.stop(); } catch { } if (eng.current) eng.current.close(); }, []);
  useEffect(() => { if (voice.current) voice.current.setFreq(freqOf(covered)); }, [over]);

  const holeAt = (clientY) => {
    const el = pipe.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    const rel = (clientY - r.top) / r.height;
    if (rel < 0 || rel > 1) return null;
    for (let i = 0; i < HOLES; i++) {
      const c = (TOP + i * GAP) / 100;
      if (Math.abs(rel - c) <= HIT) return i;
    }
    return null;
  };
  const sync = () => {
    const set = handCovered([...ptrs.current.values()].filter((v) => v != null));
    setCovered(set);
    if (voice.current) voice.current.setFreq(freqOf(set));
    return set;
  };

  const down = (e) => {
    const el = pipe.current;
    const r = el?.getBoundingClientRect();
    if (!r || e.clientY < r.top || e.clientY > r.bottom) return;
    ptrs.current.set(e.pointerId, holeAt(e.clientY));
    el.setPointerCapture?.(e.pointerId);
    const set = sync();
    haptic.tick();
    if (!voice.current) {
      const en = ensure(); setBlowing(true);
      if (en) voice.current = blow(en.ctx, en.master, freqOf(set));
    }
  };
  const move = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    const h = holeAt(e.clientY);
    if (ptrs.current.get(e.pointerId) === h) return;
    ptrs.current.set(e.pointerId, h);
    sync(); haptic.tick();
  };
  const up = (e) => {
    if (!ptrs.current.delete(e.pointerId)) return;
    if (ptrs.current.size === 0) {
      voice.current?.stop(); voice.current = null;
      setBlowing(false); setCovered(new Set());
      return;
    }
    sync();
  };

  const semi = blowing ? ((semitoneFor(covered) % 12) + 12) % 12 : null;
  const oct = over ? 6 : 5;

  return html`<div class="flex flex-col items-center gap-[var(--ms-gap)]" data-note=${semi == null ? "" : LAT[semi]} data-blowing=${blowing} data-octave=${oct}>
    ${""}
    <div class="text-center min-h-16">
      <div class=${LABEL}>${T(t, "note")}</div>
      <div class="text-4xl font-bold leading-none tabular-nums">
        ${semi == null ? "—" : NAMES[semi]}
      </div>
      <div class="text-xs text-muted mt-1 font-mono h-4">${semi == null ? "" : `${LAT[semi]}${oct}`}</div>
    </div>

    ${/* No free form here (owner 2026-10-11: «розповсюджувати нову дизайн систему»): the pipe IS the instrument's
         form — a turned wooden tube, its holes round because a bore is — and the playable surface stays exactly
         the surface. The note above changes many times a second, which a shape.js morph must never follow. */""}
    <div ref=${pipe} data-pipe
      class="so-pipe relative w-24 rounded-full sf-e3 touch-none select-none cursor-pointer"
      style="height:min(60svh,29rem)"
      onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
      <div class="absolute inset-x-0 flex justify-center" style="top:9%">
        <div class="so-window w-8 h-1.5 rounded-full"></div>
      </div>
      ${/* a hole answers a finger at once, no fade: covered/open flips hundreds of times a minute and is the
           pitch you hear, so it is never animated (motion rule: 100+ a day → no motion) */""}
      ${Array.from({ length: HOLES }, (_, i) => html`<div key=${i} data-hole=${i} aria-hidden="true"
        class=${`absolute left-1/2 -translate-x-1/2 w-7 h-7 rounded-full ${covered.has(i) ? "so-pad" : "so-bore"}`}
        style=${`top:calc(${TOP + i * GAP}% - 0.875rem)`}></div>`)}
    </div>

    ${/* overblow is a held register, so it reads in the material: raised at rest, pressed into the face while on,
         its wind glyph lit (head.html). No Transport and no «одна по колу»: an instrument has nothing to play,
         pause or go on to — sound is a finger on the pipe. */""}
    <button id="over" data-over aria-pressed=${over} class=${`btn rounded-full h-[var(--ms-ctl)] min-h-0 px-4 gap-2 ms-press ${over ? "sf-pressed" : "sf-raised"}`}
      data-haptic="bump" onClick=${() => setOver((v) => !v)}>${Icon("lucide:wind", "so-wind text-base")}${T(t, "overblow")}</button>
    ${!audioSupported ? html`<div class="text-sm text-muted text-center">${T(t, "noAudio")}</div>` : null}
  </div>`;
}
