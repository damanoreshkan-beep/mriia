import { html } from "htm/preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Panel, Sheet } from "/_rt/ui.js";
import { Calendar, dayKey } from "/_rt/calendar.js";
import { dayTotals, fmtClock, fmtSec, goalStreak, records, setStats, tempoOf } from "/_rt/zhym.js";
import { $goal, $pick, $sets, loadSets } from "./engine.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""} aria-hidden="true"></iconify-icon>`;
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70 truncate";
const GOALS = [10, 1000];

const Stat = (label, value, unit, attr) => html`<div class="rounded-[var(--ms-r-in)] sf-inset px-3 py-2 min-w-0" ...${attr || {}}>
  <div class=${LABEL}>${label}</div>
  <div class="font-mono text-[length:var(--ms-title)] font-semibold leading-tight truncate tabular-nums">${value}${unit ? html`<span class="text-[length:var(--ms-label)] font-normal text-base-content/70 ml-1">${unit}</span>` : null}</div>
</div>`;

function GoalPanel({ t, done, goal, streak }) {
  const set = (g) => $goal.set(String(Math.max(GOALS[0], Math.min(GOALS[1], g))));
  const share = goal > 0 ? Math.min(1, done / goal) : 0;
  return html`<${Panel} title=${T(t, "goal")} data-goalpanel>
    <div class="flex items-center gap-3">
      <button class="btn btn-circle btn-ghost sf-raised" data-goal-less aria-label=${T(t, "goalLess")} onClick=${() => set(goal - 10)}>${Icon("lucide:minus", "text-lg")}</button>
      <div class="flex-1 text-center min-w-0">
        <div class="font-mono font-bold tabular-nums leading-none whitespace-nowrap text-[clamp(1.75rem,9vw,2.75rem)]"><span data-done>${done}</span><span class="text-base-content/50"> / </span><span data-goal>${goal}</span></div>
      </div>
      <button class="btn btn-circle btn-ghost sf-raised" data-goal-more aria-label=${T(t, "goalMore")} onClick=${() => set(goal + 10)}>${Icon("lucide:plus", "text-lg")}</button>
    </div>
    <div class="h-2 rounded-full sf-inset overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax=${goal} aria-valuenow=${done} aria-label=${T(t, "goal")}>
      <div class="h-full rounded-full" style=${`width:${Math.round(share * 100)}%;background:var(--app-accent)`}></div>
    </div>
    <div class="text-sm text-base-content/80 tabular-nums" data-streak>${T(t, "streak", { n: streak })}</div>
  <//>`;
}

function Tempo({ t, reps }) {
  const tt = reps.map(tempoOf), max = Math.max(1, ...tt.map((x) => x.all)), W = 10, H = 56;
  return html`<div class="flex flex-col gap-1">
    <div class="flex items-center justify-between gap-2">
      <span class=${LABEL}>${T(t, "tempo")}</span>
      <span class="flex items-center gap-2 text-[length:var(--ms-label)] text-base-content/70 shrink-0">
        <span class="inline-flex items-center gap-1"><span class="size-2 rounded-sm" style="background:var(--app-accent)"></span>${T(t, "down")}</span>
        <span class="inline-flex items-center gap-1"><span class="size-2 rounded-sm bg-base-content/35"></span>${T(t, "up")}</span>
      </span>
    </div>
    <svg viewBox=${`0 0 ${reps.length * W} ${H}`} preserveAspectRatio="none" class="w-full h-14 block" aria-hidden="true" data-tempo-bars>
      ${tt.map((x, i) => {
        const hd = x.down / max * H, hu = x.up / max * H;
        return html`<g key=${i}>
          <rect x=${i * W + 1.5} y=${H - hd} width=${W - 3} height=${hd} rx="1.5" style="fill:var(--app-accent)" />
          <rect x=${i * W + 1.5} y=${H - hd - hu} width=${W - 3} height=${Math.max(0, hu - 1)} rx="1.5" class="fill-base-content/35" />
        </g>`;
      })}
    </svg>
  </div>`;
}

function SetBlock({ t, loc, set, n, openScreen }) {
  const s = setStats(set), when = new Date(set.at).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  return html`<${Panel} title=${`${T(t, "setN", { n })} · ${when}`} data-set=${set.id}>
    <div class="grid grid-cols-2 gap-[var(--ms-gap)]">
      ${Stat(T(t, "sReps"), String(s.n))}
      ${Stat(T(t, "sTime"), fmtClock(s.dur))}
      ${Stat(T(t, "sAvg"), fmtSec(s.avg), T(t, "unitS"))}
      ${Stat(T(t, "sRpm"), s.rpm.toFixed(1))}
    </div>
    <${Tempo} t=${t} reps=${set.reps} />
    <div class=${LABEL}>${T(t, "matrix")}</div>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5" data-matrix>
      ${set.reps.map((r, i) => html`<button key=${i} class="zh-frame aspect-square rounded-[var(--ms-r-in)] overflow-hidden"
          data-rep=${i} aria-label=${T(t, "repN", { n: i + 1 })} onClick=${() => { $pick.set({ id: set.id, i, n }); openScreen("rep"); }}>
        ${r.frame ? html`<img src=${r.frame} alt="" loading="lazy" decoding="async" />` : null}
        <span class="absolute left-1 bottom-1 z-[1] font-mono text-[0.625rem] leading-none px-1 py-0.5 rounded bg-black/55 text-white tabular-nums">${i + 1}</span>
        ${r.eyes && r.eyes.state === "closed" ? html`<span class="absolute right-1 top-1 z-[1] text-white drop-shadow">${Icon("lucide:eye-closed", "text-xs")}</span>` : null}
      </button>`)}
    </div>
  <//>`;
}

function RepSheet({ t, loc, open, onClose, sets }) {
  const pick = useStore($pick);
  const set = pick && sets.find((s) => s.id === pick.id), r = set && set.reps[pick.i];
  const tt = r ? tempoOf(r) : null;
  const row = (k, v, attr) => html`<div class="flex items-baseline justify-between gap-3 py-1.5 border-b border-base-content/10 last:border-0" ...${attr || {}}>
    <span class="text-sm text-base-content/75">${k}</span><span class="font-mono tabular-nums text-sm text-right">${v}</span></div>`;
  const pct = (v) => v == null ? "—" : `${Math.round(v * 100)}%`;
  return html`<${Sheet} id="repsheet" open=${open && !!r} onClose=${onClose} locale=${loc} icon="lucide:scan-face"
      title=${r ? T(t, "repN", { n: pick.i + 1 }) : ""} subtitle=${set ? T(t, "setN", { n: pick.n }) : ""}>
    ${r ? html`<div class="flex flex-col gap-[var(--ms-gap)]" data-rep-detail>
      <div class="zh-frame w-44 aspect-square mx-auto rounded-[var(--ms-r)] overflow-hidden">${r.frame ? html`<img src=${r.frame} alt="" />` : null}</div>
      <div>
        ${row(T(t, "rStart"), fmtClock(r.t0))}
        ${row(T(t, "rBottom"), fmtClock(r.tb))}
        ${row(T(t, "rEnd"), fmtClock(r.t1))}
        ${row(T(t, "down"), `${fmtSec(tt.down)} ${T(t, "unitS")}`)}
        ${row(T(t, "up"), `${fmtSec(tt.up)} ${T(t, "unitS")}`)}
        ${row(T(t, "rEyeL"), pct(r.eyes && r.eyes.l))}
        ${row(T(t, "rEyeR"), pct(r.eyes && r.eyes.r))}
        ${r.eyes ? row(T(t, "rEyes"), T(t, `es_${r.eyes.state}`)) : null}
        ${row(T(t, "rGaze"), r.gaze ? T(t, `gaze_${r.gaze.dir}`) : "—")}
        ${row(T(t, "rExpr"), r.expr ? T(t, `expr_${r.expr.id}`) : "—")}
      </div>
    </div>` : null}
  <//>`;
}

export function zhymLog({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), loc = useStore(S.locale), sets = useStore($sets), goal = Number(useStore($goal)) || 0;
  const [picked, setPicked] = useState(null), [month, setMonth] = useState(null);
  useEffect(() => { loadSets(); }, []);

  const totals = useMemo(() => dayTotals(sets), [sets]);
  const rec = useMemo(() => records(sets), [sets]);
  const today = dayKey(Date.now());
  const days = Object.keys(totals).filter((k) => totals[k] > 0).sort();
  const goalPanel = html`<${GoalPanel} t=${t} done=${totals[today] || 0} goal=${goal} streak=${goalStreak(totals, goal, today)} />`;

  if (!days.length) return html`<div class="flex flex-col gap-[var(--ms-gap)]">
    ${goalPanel}
    <div data-empty data-mascot class="text-center text-base-content/75 py-12">${T(t, "noSets")}</div>
  </div>`;

  const sel = picked && totals[picked] ? picked : totals[today] ? today : days[days.length - 1];
  const daySets = sets.filter((s) => s.day === sel).sort((a, b) => a.at - b.at);

  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-log=${sets.length}>
    ${goalPanel}
    <${Panel} title=${T(t, "records")} data-records>
      <div class="grid grid-cols-2 gap-[var(--ms-gap)]">
        ${Stat(T(t, "recTotal"), String(rec.total))}
        ${Stat(T(t, "recBest"), String(rec.bestSet))}
        ${Stat(T(t, "recFast"), rec.fastest ? fmtSec(rec.fastest) : "—", rec.fastest ? T(t, "unitS") : null)}
        ${Stat(T(t, "recDays"), String(rec.days))}
      </div>
    <//>
    <${Panel}>
      <${Calendar} month=${month || sel.slice(0, 7)} onMonth=${setMonth} marks=${totals} value=${sel} pick="marked"
        onPick=${(k) => setPicked(k)} locale=${loc} max=${today.slice(0, 7)} />
    <//>
    ${daySets.length
      ? daySets.map((s, i) => html`<${SetBlock} key=${s.id} t=${t} loc=${loc} set=${s} n=${i + 1} openScreen=${openScreen} />`)
      : html`<div class="text-center text-base-content/75 py-8">${T(t, "noDay")}</div>`}
    <${RepSheet} t=${t} loc=${loc} open=${screen === "rep"} onClose=${closeScreen} sets=${sets} />
  </div>`;
}
