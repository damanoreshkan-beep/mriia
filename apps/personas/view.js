import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { Panel, Sheet } from "/_rt/ui.js";
import { Scramble, Pixels } from "/_rt/skeleton.js";
import { letterTile } from "/_rt/tile.js";
import { $group, $people, $busy, $error, $mesh, boot, gather, ask, sculpt, redraw, KINDS } from "./state.js";

const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const PILL = "btn rounded-full sf-raised shrink-0 h-[var(--ms-ctl)] min-h-0 gap-2 font-medium ms-press";
const FIELD = "sf-inset flex-1 min-w-0 rounded-[calc(var(--ms-ctl)/2)] border-0 px-3.5 py-2 leading-6 min-h-[var(--ms-ctl)] text-[0.95rem] text-base-content placeholder:text-muted bg-transparent outline-none focus:ring-1 focus:ring-base-content/25";
const CHIP = "btn btn-sm rounded-full sf-raised h-auto min-h-[var(--ms-ctl)] py-1.5 font-normal ms-press max-w-full whitespace-normal text-left [overflow-wrap:anywhere]";
const AMAZON = ["amz1", "amz2", "amz3", "amz4", "amz5"];
const CHIP_KEY = { last: "qLast", annoys: "qAnnoys", spent: "qSpent", hides: "qHides", pitch: "qPitch", price: "qPrice" };

const Icon = (icon, cls = "") => html`<iconify-icon icon=${icon} class=${cls} aria-hidden="true"></iconify-icon>`;
const byline = (p) => `${p.age} · ${p.city}`;
const open = (S, p) => S.detail.set({ id: p.id, name: p.name, byline: byline(p) });
const stars = (n, t) => (n == null ? "" : n === 0 ? T(t, "noPay") : T(t, "starsN", { n }));
let booted = false;
const useBoot = () => useEffect(() => { if (!booted) { booted = true; boot(); } }, []);

function Face({ p, cls = "" }) {
  if (p.photo) return html`<img src=${p.photo} alt="" decoding="async" class=${`object-cover ${cls}`} />`;
  if (p.drawing || (!p.photoFail && !gate)) return html`<div class=${`overflow-hidden ${cls}`}><${Pixels} cls="w-full h-full" /></div>`;
  return html`<img src=${letterTile(p.name, { w: 300, h: 400, hue: 255, sat: 14, light: 24, fontSize: 96 })} alt="" class=${`object-cover ${cls}`} />`;
}

const Note = ({ t }) => html`<p data-note class="flex items-start gap-2 text-sm text-base-content/75">
  ${Icon("lucide:flask-conical", "shrink-0 mt-0.5 text-[var(--app-accent)]")}<span>${T(t, "note")}</span></p>`;

function Guide({ t, S }) {
  const screen = useStore(S.screen);
  return html`<${Sheet} open=${screen === "guide"} onClose=${() => S.screen.set(null)} title=${T(t, "guideTitle")} subtitle=${T(t, "guideSub")} icon="lucide:list-checks">
    <ol data-guide class="flex flex-col gap-3">
      ${AMAZON.map((k, i) => html`<li key=${k} class="flex gap-3 items-baseline"><span class="font-mono text-sm text-base-content/70 w-4 shrink-0">${i + 1}</span><span class="leading-snug">${T(t, k)}</span></li>`)}
    </ol>
  <//>`;
}

function Card({ p, t, S }) {
  const asked = p.turns.filter((x) => x.a).length;
  return html`<button type="button" data-persona=${p.id} onClick=${() => open(S, p)}
    class="relative text-left rounded-[var(--ms-r)] sf-raised overflow-hidden ms-press flex flex-col min-w-0" aria-label=${`${p.name}, ${byline(p)}`}>
    <${Face} p=${p} cls="w-full aspect-[3/4]" />
    ${p.price > 0 ? html`<span data-price class="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-base-100 text-base-content font-mono text-xs">${Icon("lucide:star", "text-[var(--app-accent)]")}${p.price}</span>` : null}
    <div class="p-2.5 flex flex-col gap-0.5 min-w-0">
      <div class="font-semibold leading-tight truncate">${p.name}</div>
      <div class="font-mono text-xs text-base-content/70 truncate">${byline(p)}${asked ? ` · ${T(t, "askedN", { n: asked })}` : ""}</div>
      <div class="text-sm text-base-content/75 leading-snug line-clamp-2">${p.job}</div>
    </div>
  </button>`;
}

const Skeleton = () => html`<div data-skeleton class="grid grid-cols-2 @md:grid-cols-3 gap-[var(--ms-gap)]">
  ${Array.from({ length: 6 }, (_, i) => html`<div key=${i} class="rounded-[var(--ms-r)] sf-raised overflow-hidden flex flex-col">
    <div class="w-full aspect-[3/4]"><${Pixels} cls="w-full h-full" /></div>
    <div class="p-2.5 flex flex-col gap-1 text-base-content/50"><${Scramble} len=${14} /><span class="text-xs"><${Scramble} len=${10} /></span></div>
  </div>`)}
</div>`;

export function people({ t, loc, S, confirm }) {
  useBoot();
  const group = useStore($group), list = useStore($people), busy = useStore($busy), error = useStore($error);
  const [who, setWho] = useState(gate ? group?.who || "" : "");
  const go = (e) => {
    e.preventDefault();
    if (!list.some((p) => p.turns.length)) return gather(who, loc);
    confirm({ title: T(t, "replaceTitle"), body: T(t, "replaceBody"), verb: T(t, "replaceYes"), onConfirm: () => gather(who, loc) });
  };
  return html`<div class="@container flex flex-col gap-[var(--ms-gap)] max-w-3xl mx-auto w-full">
    <${Panel}>
      <form data-ask onSubmit=${go} class="flex flex-col gap-2">
        <label for="who" class=${LABEL}>${T(t, "whoLabel")}</label>
          <textarea rows="1" data-line id="who" class=${FIELD} value=${who} maxlength="200" autocomplete="off" enterkeyhint="go" placeholder=${T(t, "whoHint")} onInput=${(e) => setWho(e.currentTarget.value)}></textarea>
          <button data-gather type="submit" disabled=${!!busy || !who.trim()} class="btn btn-primary rounded-full w-full min-h-[var(--ms-ctl)] h-auto text-base font-bold ms-press">${Icon("lucide:users-round", "text-[length:var(--ms-icon)]")}<span>${T(t, busy ? "gathering" : list.length ? "gatherAgain" : "gather")}</span></button>
      </form>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <${Note} t=${t} />
        <button type="button" data-open-guide onClick=${() => S.screen.set("guide")} class="btn btn-ghost btn-sm rounded-full gap-1.5 ms-press">${Icon("lucide:list-checks")}${T(t, "guideBtn")}</button>
      </div>
    <//>
    ${error ? html`<div role="alert" data-error class="rounded-[var(--ms-r)] sf-inset p-3 text-sm">${T(t, error)}</div>` : null}
    ${busy === "crowd" ? html`<div class=${LABEL}>${T(t, "gathering")}</div><${Skeleton} />`
      : list.length ? html`
        <div class="flex items-baseline justify-between gap-2 min-w-0">
          <h2 class="font-semibold truncate">${group?.who}</h2>
          <span class="font-mono text-xs text-base-content/70 shrink-0">${T(t, "peopleN", { n: list.length })}</span>
        </div>
        <div data-people class="grid grid-cols-2 @md:grid-cols-3 gap-[var(--ms-gap)]">${list.map((p) => html`<${Card} key=${p.id} p=${p} t=${t} S=${S} />`)}</div>`
      : html`<div data-empty class="flex flex-col items-center text-center gap-2 py-10 text-base-content/75">${Icon("lucide:users-round", "text-4xl text-[var(--app-accent)]")}<p class="max-w-xs">${T(t, "emptyPeople")}</p></div>`}
    <${Guide} t=${t} S=${S} />
  </div>`;
}

function Model({ p, t }) {
  const st = useStore($mesh)[p.id] || {};
  const box = useRef(null), canvas = useRef(null);
  const [view, setView] = useState("");
  const [, tick] = useState(0);
  useEffect(() => {
    if (!p.glb || !canvas.current) return;
    let off = null, live = true;
    const url = URL.createObjectURL(p.glb);
    setView("loading");
    import("./viewer.js").then(({ showModel }) => { if (live) off = showModel(canvas.current, url, { onReady: () => setView("ready"), onFail: () => setView("fail") }); }).catch(() => setView("fail"));
    return () => { live = false; off?.(); URL.revokeObjectURL(url); };
  }, [p.glb]);
  useEffect(() => { if (st.phase !== "working") return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [st.phase]);
  if (p.glb) return html`<div ref=${box} data-model class="relative w-full aspect-square rounded-[var(--ms-r)] sf-inset overflow-hidden touch-none">
    <canvas ref=${canvas} class="w-full h-full block" aria-label=${T(t, "modelAria", { name: p.name })}></canvas>
    ${view === "fail" ? html`<p class="absolute inset-0 grid place-items-center text-sm text-base-content/75">${T(t, "eModelView")}</p>` : null}
  </div>`;
  if (st.phase === "working") {
    const s = Math.max(0, Math.round((Date.now() - (st.t0 || Date.now())) / 1000));
    return html`<div data-sculpting role="status" class="rounded-[var(--ms-r)] sf-inset p-3 flex items-center gap-3">
      <div class="w-12 h-12 rounded-xl overflow-hidden shrink-0"><${Pixels} cls="w-full h-full" /></div>
      <div class="flex-1 min-w-0"><div class="font-medium">${T(t, st.stage === "queued" ? "meshQueued" : "meshShaping")}</div>
        <div class="font-mono text-xs text-base-content/70">${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} · ${T(t, "meshTime")}</div></div>
    </div>`;
  }
  return html`<div class="flex flex-col gap-1.5">
    ${st.phase === "error" ? html`<p role="alert" class="text-sm text-base-content/80">${T(t, st.code || "eMesh")}</p>` : null}
    <button type="button" data-sculpt disabled=${!p.photo} onClick=${() => sculpt(p.id)} class=${`${PILL} self-start`}>${Icon("lucide:box")}${T(t, st.phase === "error" ? "meshRetry" : "meshGo")}</button>
  </div>`;
}

function Fact({ icon, label, text }) {
  return text ? html`<div class="flex gap-2.5 items-start py-2 border-b border-base-content/10 last:border-0">
    ${Icon(icon, "shrink-0 mt-0.5 text-[var(--app-accent)]")}
    <div class="min-w-0"><div class=${LABEL}>${label}</div><div class="leading-snug [overflow-wrap:anywhere]">${text}</div></div>
  </div>` : null;
}

export function interview({ item, t, loc }) {
  const list = useStore($people), group = useStore($group);
  const p = list.find((x) => x.id === item.id);
  const [draft, setDraft] = useState("");
  const input = useRef(null), tail = useRef(null);
  const waiting = !!p?.turns.some((x) => x.pending);
  const count = p?.turns.length || 0;
  const follow = useRef(false);
  useEffect(() => { if (follow.current) tail.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [count, waiting]);
  if (!p) return null;
  const send = (text, kind) => { follow.current = true; ask(p.id, text, kind, loc); setDraft(""); };
  const chip = (kind) => {
    if (kind === "pitch" && !group?.idea) { setDraft(T(t, "pitchLead")); input.current?.focus(); return; }
    send(kind === "pitch" ? T(t, "pitchQ", { idea: group.idea }) : T(t, CHIP_KEY[kind]), kind);
  };
  const submit = (e) => {
    e.preventDefault();
    const lead = T(t, "pitchLead");
    const text = draft.trim();
    if (!text || text === lead.trim()) return;
    send(text, text.startsWith(lead.trim()) ? "pitch" : "");
  };
  return html`<div data-interview class="flex flex-col gap-[var(--ms-gap)]">
    <div class="flex gap-[var(--ms-gap)] items-start">
      <${Face} p=${p} cls="w-28 aspect-[3/4] rounded-[var(--ms-r)] shrink-0 sf-raised" />
      <div class="min-w-0 flex flex-col gap-1.5">
        <div class="leading-snug">${p.job}</div>
        ${p.price != null ? html`<div data-stated class="inline-flex items-center gap-1.5 font-mono text-sm">${Icon("lucide:star", "text-[var(--app-accent)]")}${stars(p.price, t)}</div>` : null}
        ${!p.photo && p.photoFail && !gate ? html`<button type="button" onClick=${() => redraw(p.id)} class="btn btn-ghost btn-xs rounded-full self-start gap-1">${Icon("lucide:refresh-cw")}${T(t, "photoRetry")}</button>` : null}
      </div>
    </div>
    <${Panel}>
      <${Fact} icon="lucide:wallet" label=${T(t, "fMoney")} text=${p.money} />
      <${Fact} icon="lucide:smartphone" label=${T(t, "fMedia")} text=${p.media} />
      <${Fact} icon="lucide:receipt" label=${T(t, "fSpends")} text=${p.spends} />
      <${Fact} icon="lucide:eye-off" label=${T(t, "fHides")} text=${p.hides} />
    <//>
    <${Model} p=${p} t=${t} />
    <${Note} t=${t} />
    ${p.turns.length ? html`<div data-turns class="flex flex-col gap-4 py-1">
      ${p.turns.map((x, i) => html`<div key=${i} data-turn class="flex flex-col gap-1.5">
        <div class="flex items-start gap-2 text-sm text-base-content/75"><span class="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style="background:var(--app-accent)"></span><span class="[overflow-wrap:anywhere]">${x.q}</span></div>
        ${x.pending ? html`<div class="text-base-content/50"><${Scramble} len=${42} /></div>`
          : x.failed ? html`<div role="alert" class="text-sm text-base-content/75">${T(t, "eAsk")}</div>`
          : html`<p data-answer class="text-[1.05rem] leading-relaxed [overflow-wrap:anywhere]">${x.a}</p>`}
      </div>`)}
    </div>` : null}
    <div ref=${tail} data-chips class="flex flex-wrap gap-2">
      ${KINDS.map((k) => html`<button key=${k} type="button" data-chip=${k} disabled=${waiting} onClick=${() => chip(k)} class=${CHIP}>${T(t, CHIP_KEY[k] + "Chip")}</button>`)}
    </div>
    <form data-composer onSubmit=${submit} class="flex gap-2 items-center">
      <textarea rows="1" data-line ref=${input} class=${FIELD} value=${draft} maxlength="600" autocomplete="off" enterkeyhint="send" aria-label=${T(t, "askLabel")} placeholder=${T(t, "askHint")} onInput=${(e) => setDraft(e.currentTarget.value)}></textarea>
      <button type="submit" data-send disabled=${waiting || !draft.trim()} aria-label=${T(t, "send")} class="btn btn-primary btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ms-press">${Icon("lucide:arrow-up", "text-lg")}</button>
    </form>
  </div>`;
}

export function compare({ t, S }) {
  useBoot();
  const list = useStore($people), group = useStore($group);
  if (!list.length) return html`<div data-empty class="flex flex-col items-center text-center gap-3 py-10 text-base-content/75 max-w-3xl mx-auto">
    ${Icon("lucide:columns-3", "text-4xl text-[var(--app-accent)]")}<p class="max-w-xs">${T(t, "emptyCompare")}</p>
    <button type="button" data-to-people onClick=${() => S.tab.set("people")} class=${PILL}>${T(t, "toPeople")}</button>
  </div>`;
  const asked = list.filter((p) => p.turns.some((x) => x.a));
  const priced = list.filter((p) => p.price != null).map((p) => p.price).sort((a, b) => a - b);
  const median = priced.length ? priced[Math.floor((priced.length - 1) / 2)] : null;
  const pay = priced.filter((n) => n > 0).length;
  const rows = [...list].sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
  const Stat = (label, value, attr) => html`<div ...${{ [attr]: "" }} class="flex flex-col gap-0.5 min-w-0"><span class=${LABEL}>${label}</span><span class="font-mono text-xl font-semibold tabular-nums">${value}</span></div>`;
  return html`<div class="flex flex-col gap-[var(--ms-gap)] max-w-3xl mx-auto w-full">
    <${Panel} title=${group?.who}>
      <div class="grid grid-cols-3 gap-[var(--ms-gap)]">
        ${Stat(T(t, "sAsked"), `${asked.length}/${list.length}`, "data-s-asked")}
        ${Stat(T(t, "sPay"), `${pay}/${priced.length}`, "data-s-pay")}
        ${Stat(T(t, "sMedian"), median == null ? "—" : median, "data-s-median")}
      </div>
      ${group?.idea ? html`<p class="text-sm text-base-content/75 [overflow-wrap:anywhere]"><span class=${LABEL}>${T(t, "idea")}</span> ${group.idea}</p>` : null}
    <//>
    <ul data-compare class="flex flex-col gap-[var(--ms-gap)]">
      ${rows.map((p) => html`<li key=${p.id}><button type="button" data-row=${p.id} onClick=${() => open(S, p)} class="w-full text-left rounded-[var(--ms-r)] sf-raised p-3 flex gap-3 items-start ms-press">
        <${Face} p=${p} cls="w-12 h-12 rounded-full shrink-0" />
        <div class="flex-1 min-w-0 flex flex-col gap-1">
          <div class="flex items-baseline justify-between gap-2 min-w-0">
            <span class="font-semibold truncate">${p.name}</span>
            <span class="font-mono text-sm shrink-0 inline-flex items-center gap-1">${p.price === 0 ? html`<span class="text-base-content/75">${T(t, "noPay")}</span>` : p.price != null ? html`${Icon("lucide:star", "text-[var(--app-accent)]")}${p.price}` : html`<span class="text-base-content/70">${T(t, "noPrice")}</span>`}</span>
          </div>
          <div class="font-mono text-xs text-base-content/70 truncate">${byline(p)}</div>
          ${p.quote ? html`<p data-quote class="leading-snug [overflow-wrap:anywhere]">«${p.quote}»</p>` : html`<p class="text-sm text-base-content/70">${T(t, "noQuote")}</p>`}
        </div>
      </button></li>`)}
    </ul>
    <${Note} t=${t} />
  </div>`;
}
