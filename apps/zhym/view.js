import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { CamStage } from "/_rt/camstage.js";
import { Scramble } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";
import { dayKey } from "/_rt/calendar.js";
import { dayTotals, fmtClock, fmtSec, tempoOf } from "/_rt/zhym.js";
import { $count, $goal, $last, $meter, $model, $pos, $read, $run, $sets, attach, loadSets, prepare, start, stop } from "./engine.js";

export { zhymLog } from "./log.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""} aria-hidden="true"></iconify-icon>`;
const STILL = new URL("assets/mock-still.webp", import.meta.url).href;
const GAZE_ICON = { c: "lucide:crosshair", u: "lucide:arrow-up", d: "lucide:arrow-down", l: "lucide:arrow-left", r: "lucide:arrow-right", ul: "lucide:arrow-up-left", ur: "lucide:arrow-up-right", dl: "lucide:arrow-down-left", dr: "lucide:arrow-down-right" };
const EYES_KEY = { open: "eyesOpen", closed: "eyesClosed", winkL: "winkL", winkR: "winkR" };

function Chips({ t, read }) {
  if (!read) return null;
  const eyes = read.eyes && read.eyes.state || "open", dir = read.gaze && read.gaze.dir || "c", ex = read.expr && read.expr.id || "calm";
  const chip = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 bg-black/45 backdrop-blur text-white text-sm font-medium whitespace-nowrap";
  return html`<div class="flex flex-wrap justify-center gap-1.5 [@media(max-height:460px)]:hidden" data-chips>
    <span class=${chip} data-eyes=${eyes}>${Icon(eyes === "open" ? "lucide:eye" : "lucide:eye-closed", "text-base")}${T(t, EYES_KEY[eyes])}</span>
    ${eyes === "closed" ? null : html`<span class=${chip} data-gaze=${dir}>${Icon(GAZE_ICON[dir] || GAZE_ICON.c, "text-base")}${T(t, `gaze_${dir}`)}</span>`}
    <span class=${chip} data-expr=${ex}>${Icon("lucide:scan-face", "text-base")}${T(t, `expr_${ex}`)}</span>
  </div>`;
}

export function zhymSet({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const model = useStore($model), run = useStore($run), count = useStore($count), last = useStore($last);
  const read = useStore($read), pos = useStore($pos), meter = useStore($meter), sets = useStore($sets), goal = Number(useStore($goal)) || 0;
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

  const status = model === "loading"
    ? html`<${Scramble} text=${T(t, "loading")} cls="text-white/80" />`
    : model === "error" ? html`<span class="text-white" data-error>${T(t, "eFace")}</span>`
    : !read && !gate ? html`<span class="text-white/80">${T(t, "noFace")}</span>`
    : html`<span class="text-white/80 tabular-nums" data-today>${T(t, "ofGoal", { n: today, g: goal })}</span>`;

  const verb = model === "error"
    ? html`<button class="btn btn-primary btn-lg rounded-full min-w-48 gap-2" data-retry onClick=${prepare}>${Icon("lucide:rotate-ccw", "text-xl")}${T(t, "retry")}</button>`
    : run
    ? html`<button class="btn btn-lg rounded-full min-w-48 gap-2 btn-neutral" data-stop onClick=${finish}>${Icon("lucide:square", "text-xl")}${T(t, "stop")}</button>`
    : html`<button class="btn btn-primary btn-lg rounded-full min-w-48 gap-2" data-start disabled=${model !== "ready"} onClick=${start}>${Icon("lucide:play", "text-xl")}${T(t, "start")}</button>`;

  return html`<div class="ms-stage z-20 bg-base-200 flex flex-col" data-zhym data-running=${run ? "1" : "0"}>
    <div class="relative flex-1 min-h-0 overflow-hidden bg-black">
      <${CamStage} loc=${loc} reason=${T(t, "primeReason")} onSettings=${() => S.screen.set("perms")}
          facing="user" still=${gate ? STILL : null} show=${true} fullscreen=${false} gestures=${false} primeFull=${true}
          picClassName="opacity-55 grayscale -scale-x-100"
          onVideo=${(el, o) => attach(el, o)}>
        <div class="zh-tint absolute inset-0 pointer-events-none" aria-hidden="true"></div>
        <div class="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-[clamp(0.25rem,1.5vh,0.75rem)] px-4 text-center pointer-events-none zh-ink">
          <${Chips} t=${t} read=${read} />
          <div class="font-mono font-bold tabular-nums leading-none text-white text-[clamp(4.5rem,26vmin,12rem)] [@media(max-height:460px)]:text-[3.25rem]" data-count data-live aria-label=${T(t, "reps")}>${count}</div>
          <div class="text-base">${status}</div>
          <div ref=${clockRef} class="font-mono tabular-nums text-white text-[clamp(1.5rem,7.5vmin,2.75rem)] leading-tight" data-clock>${fmtClock(run ? 0 : dur)}</div>
          ${tempo ? html`<div class="flex items-center gap-4 font-mono tabular-nums text-white/90 text-sm [@media(max-height:460px)]:hidden" data-tempo>
            <span class="inline-flex items-center gap-1">${Icon("lucide:arrow-down", "text-base")}${fmtSec(tempo.down)} ${T(t, "unitS")}</span>
            <span class="inline-flex items-center gap-1">${Icon("lucide:arrow-up", "text-base")}${fmtSec(tempo.up)} ${T(t, "unitS")}</span>
          </div>` : null}
          ${meter ? html`<div class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-white/70 [@media(max-height:520px)]:hidden" data-meter>
            ${T(t, "tick", { v: Math.round(meter.tick * 1000) })}${meter.fps ? html` · ${T(t, "fps", { v: meter.fps })}` : null} · ${meter.delegate}
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
