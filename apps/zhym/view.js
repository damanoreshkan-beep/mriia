import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { CamStage } from "/_rt/camstage.js";
import { gate } from "/_rt/gate.js";
import { dayKey } from "/_rt/calendar.js";
import { dayTotals, fmtClock, fmtSec, tempoOf } from "/_rt/zhym.js";
import { $cam, $count, $goal, $last, $meter, $pos, $run, $sets, attach, loadSets, start, stop } from "./engine.js";

export { zhymLog } from "./log.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""} aria-hidden="true"></iconify-icon>`;
const STILL = new URL("assets/mock-still.webp", import.meta.url).href;

export function zhymSet({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const cam = useStore($cam), run = useStore($run), count = useStore($count), last = useStore($last);
  const pos = useStore($pos), meter = useStore($meter), sets = useStore($sets), goal = Number(useStore($goal)) || 0;
  const [dur, setDur] = useState(gate ? 161374.21 : 0);
  const clockRef = useRef();

  useEffect(() => { loadSets(); }, []);
  useEffect(() => {
    const el = clockRef.current;
    if (!el || !run) return;
    let id = 0;
    const tick = () => { el.textContent = fmtClock(performance.now() - run.t0); id = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(id);
  }, [run]);

  const today = (dayTotals(sets)[dayKey(Date.now())] || 0) + (run && !gate ? count : 0);
  const tempo = last ? tempoOf(last) : null;
  const finish = async () => {
    const d = run ? performance.now() - run.t0 : 0;
    const n = await stop();
    setDur(d);
    toast?.(n ? T(t, "savedN", { n }) : T(t, "noReps"));
  };

  const verb = run
    ? html`<button class="btn btn-lg rounded-full min-w-48 gap-2 btn-neutral" data-stop onClick=${finish}>${Icon("lucide:square", "text-xl")}${T(t, "stop")}</button>`
    : html`<button class="btn btn-primary btn-lg rounded-full min-w-48 gap-2" data-start disabled=${!cam} onClick=${start}>${Icon("lucide:play", "text-xl")}${T(t, "start")}</button>`;

  return html`<div class="ms-stage z-20 bg-base-200 flex flex-col" data-zhym data-running=${run ? "1" : "0"}>
    <div class="relative flex-1 min-h-0 overflow-hidden bg-black">
      <${CamStage} loc=${loc} reason=${T(t, "primeReason")} onSettings=${() => S.screen.set("perms")}
          facing="user" still=${gate ? STILL : null} show=${true} fullscreen=${false} gestures=${false} primeFull=${true}
          picClassName="opacity-55 grayscale -scale-x-100"
          onVideo=${(el, o) => attach(el, o)}>
        <div class="zh-tint absolute inset-0 pointer-events-none" aria-hidden="true"></div>
        <div class="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-[clamp(0.25rem,1.5vh,0.75rem)] px-4 text-center pointer-events-none zh-ink">
          <div class="font-mono font-bold tabular-nums leading-none text-white text-[clamp(4.5rem,26vmin,12rem)] [@media(max-height:460px)]:text-[3.25rem]" data-count data-live aria-label=${T(t, "reps")}>${count}</div>
          <div class="text-base text-white/80 tabular-nums" data-today>${run || gate ? T(t, "ofGoal", { n: today, g: goal }) : T(t, "noFace")}</div>
          <div ref=${clockRef} class="font-mono tabular-nums text-white text-[clamp(1.5rem,7.5vmin,2.75rem)] leading-tight" data-clock>${fmtClock(run ? 0 : dur)}</div>
          ${tempo ? html`<div class="flex items-center gap-4 font-mono tabular-nums text-white/90 text-sm [@media(max-height:460px)]:hidden" data-tempo>
            <span class="inline-flex items-center gap-1">${Icon("lucide:arrow-down", "text-base")}${fmtSec(tempo.down)} ${T(t, "unitS")}</span>
            <span class="inline-flex items-center gap-1">${Icon("lucide:arrow-up", "text-base")}${fmtSec(tempo.up)} ${T(t, "unitS")}</span>
          </div>` : null}
          ${meter ? html`<div class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-white/70 [@media(max-height:520px)]:hidden" data-meter>
            ${T(t, "tick", { v: Math.round(meter.tick * 1000) })}${meter.fps ? html` · ${T(t, "fps", { v: meter.fps })}` : null}
          </div>` : null}
        </div>
        ${run || gate ? html`<div class="absolute right-3 top-[20%] bottom-[20%] w-1.5 rounded-full bg-white/20 z-[2] pointer-events-none" aria-hidden="true" data-rail>
          ${pos != null ? html`<span class="absolute left-1/2 -translate-x-1/2 size-3.5 rounded-full bg-white shadow" style=${`top:calc(${Math.round(pos * 100)}% - 0.4375rem)`}></span>` : null}
        </div>` : null}
      <//>
    </div>
    <div class="shrink-0 p-3 flex justify-center">${verb}</div>
  </div>`;
}
