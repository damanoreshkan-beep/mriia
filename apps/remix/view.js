import { html } from "htm/preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { Panel, Transport } from "/_rt/ui.js";
import { advance } from "/_rt/player.js";
import { shapeOf, pathOf, scalePath, shaper } from "/_rt/shape.js";
import { askAI } from "/_rt/ai-core.js";
import { takeShared, firstLink } from "/_rt/share.js";
import { videoId, clock, byline } from "/_rt/muzak.js";
import { report } from "/_rt/telemetry.js";
import { haptic } from "/_rt/sensors.js";
import { useLikes, LikesConnect, LikesHead, LikeRow, LikesSkeleton } from "/_rt/ytlikes.js";
import { STEPS, DEFAULT_STEP, ORIGINAL_AT, carryTime, remixFile, roomKey, presetLine, whyKeys, parseTags, groundSong, errorKey, FIXTURE_LINK, FIXTURE_META, FIXTURE_ANALYSIS, FIXTURE_TAGS } from "/_rt/remix.js";
import { startTask, followTask, fetchResumable, taskKey, taskCall } from "/_rt/task.js";

const Icon = (icon, cls = "") => html`<iconify-icon icon=${icon} class=${cls}></iconify-icon>`;
const STAGES = ["listen", "fetch", "measure", "mix"];
const STAGE_UI = { listen: ["lucide:ear", "listening"], fetch: ["lucide:cloud-download", "stageFetch"], measure: ["lucide:audio-waveform", "stageMeasure"], mix: ["lucide:sparkles", "mixing"] };
const LATER_ICONS = ["lucide:wifi-off", "lucide:audio-lines", "lucide:x", ...Object.values(STAGE_UI).map(([i]) => i)];
const $link = atom(gate ? FIXTURE_LINK : "");
const $meta = atom(gate ? FIXTURE_META : null);
const $busy = atom("");          
const $offline = atom(!gate && globalThis.navigator?.onLine === false);   
if (!gate) { addEventListener("offline", () => $offline.set(true)); addEventListener("online", () => $offline.set(false)); }
const $err = atom("");
const MIXED = Object.fromEntries(["deep", "slowed", "nightcore"].map((v) => [v, { state: "ready" }]));
const $ana = atom(gate ? FIXTURE_ANALYSIS : null);   
const $tags = atom(gate ? FIXTURE_TAGS : null);      
const $tracks = atom(gate ? MIXED : {});             
const $step = gate ? atom(DEFAULT_STEP) : persistentAtom("remix:step", DEFAULT_STEP);
const $cur = atom(gate ? DEFAULT_STEP : "");         
const $playing = atom(false);
const $pos = atom(0), $dur = atom(0);
let seq = 0, audio = null, loaded = "";               
const runs = new Set();                              
const $kept = atom({});                              
const $repeat = persistentAtom("remix:repeat", "all");
const flipRepeat = () => $repeat.set($repeat.get() === "one" ? "all" : "one");
const shownRepeat = (r) => (r === "one" ? "one" : "off");
takeShared((s) => {
  const link = firstLink(s) || String(s.text || "").trim();
  if (!link) return;
  try { const u = new URL(location.href); u.searchParams.set("tab", "mix"); window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash); } catch { }
  $link.set(link); find(link);
});

function reset() { for (const ac of runs) ac.abort(); runs.clear(); stop(); $ana.set(null); $tags.set(null); for (const t of Object.values($tracks.get())) if (t.url) URL.revokeObjectURL(t.url); $tracks.set({}); $cur.set(""); $kept.set({}); }

async function find(link) {
  const id = videoId(link);
  if (!id) { report("link.reject", { link: String(link || "").slice(0, 120) }, "info"); $err.set("errLink"); $meta.set(null); reset(); return; }
  const my = ++seq;
  $err.set(""); $busy.set("meta"); reset();
  if (gate) { $meta.set(FIXTURE_META); $busy.set(""); return; }
  try {
    const r = await fetch(`${VPS_PROXY}/music/meta?url=${encodeURIComponent(link)}`, { signal: AbortSignal.timeout(40000) });
    if (my !== seq) return;
    if (!r.ok) { report("meta.fail", { status: r.status }); $meta.set(null); const k = errorKey(r.status); if (k) $err.set(k); return; }
    $meta.set(await r.json());
  } catch (e) { report("meta.throw", { err: String(e?.message || e).slice(0, 120) }); if (my === seq) { $meta.set(null); $err.set("errMeta"); } }
  finally { if (my === seq) $busy.set(""); }
}

async function askTags(meta, locale) {
  const { text } = groundSong(meta);
  try {
    const r = await Promise.race([askAI(text, locale, "remix"), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 15000))]);
    return parseTags(r?.text);
  } catch { return null; }
}

async function mix(link, meta, locale) {
  if ($busy.get()) return;
  const my = ++seq;
  $err.set(""); reset();
  const v = $step.get();
  if (gate) { $tags.set(FIXTURE_TAGS); $ana.set(FIXTURE_ANALYSIS); $tracks.set(MIXED); $cur.set(MIXED[v] ? v : DEFAULT_STEP); return; }
  $tracks.set({ [v]: { state: "wait" } });
  $busy.set("listen");
  const tags = await askTags(meta, locale);
  if (my !== seq) return;
  $tags.set(tags);
  await make(v, link, my);
}

async function make(v, link, my = seq) {
  const first = !$ana.get();
  const ac = new AbortController(), signal = ac.signal;
  runs.add(ac);
  const mark = (t) => { if (my === seq) $tracks.set({ ...$tracks.get(), [v]: t }); };
  const fail = (status) => {
    if (my !== seq) return;
    if (!first) return mark({ state: "err" });
    const k = errorKey(status); $err.set(k === "errMeta" ? "errMix" : k); $tracks.set({}); $busy.set("");
  };
  mark({ state: "wait" });
  let file = null;
  try {
    const tags = $tags.get();
    const { id } = await startTask("/music/task", { url: link, genre: tags?.genre || "", vocal: tags?.vocal || "", v, k: taskKey() }, { signal });
    await followTask(id, (ev) => {
      if (my !== seq) return;
      if (ev.t === "stage") { if (first) $busy.set(ev.s === "measure" ? "measure" : "fetch"); }
      else if (ev.t === "analysis") { if (!$ana.get()) $ana.set(ev); if (first) $busy.set("mix"); }
      else if (ev.t === "render" && ev.v === v) mark({ state: "render" });
      else if (ev.t === "ready" && ev.v === v) file = (async () => {
        try {
          let pct = 0;
          mark({ state: "dl", pct });
          const onProgress = (got, total) => { const p = total ? Math.min(100, Math.floor(got * 100 / total)) : 0; if (p !== pct) { pct = p; mark({ state: "dl", pct }); } };
          const url = URL.createObjectURL(await fetchResumable(`${VPS_PROXY}/task/${id}/${v}`, { signal, size: ev.bytes, onProgress }));
          if (my !== seq) { URL.revokeObjectURL(url); return; }
          mark({ state: "ready", url });
          if ($step.get() === v) show(v);   
        } catch (e) { if (!signal.aborted) { report("remix.fail", { v, status: e?.status, err: String(e?.message || e).slice(0, 120) }); mark({ state: "err" }); } }
      })();
      else if (ev.t === "fail" && ev.v) { report("remix.fail", { v: ev.v, err: String(ev.error || "").slice(0, 120) }); mark({ state: "err" }); }
      else if (ev.t === "fail") { report("task.fail", { status: ev.status, err: String(ev.error || "").slice(0, 120) }); fail(ev.status); }
    }, { signal });
    await file;
  } catch (e) {
    if (signal.aborted || my !== seq) return;
    report("task.throw", { status: e?.status, err: String(e?.message || e).slice(0, 120) });
    fail(e?.status);
    return;
  } finally { runs.delete(ac); }
  if (my === seq && first) $busy.set("");
}

function select(v, link) {
  $step.set(v);
  const t = $tracks.get()[v];
  if (!$ana.get() && !Object.keys($tracks.get()).length) return;
  report("step.pick", { v }, "info");   
  if (t?.state === "ready") return show(v);
  if (t && t.state !== "err") return;   
  if (gate) { $tracks.set({ ...$tracks.get(), [v]: { state: "ready" } }); return show(v); }
  make(v, link);
}
function show(v) { if ($playing.get()) play(v); else $cur.set(v); }

function ensure() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.addEventListener("timeupdate", () => $pos.set(Math.round(audio.currentTime * 1000)));
  audio.addEventListener("durationchange", () => $dur.set(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0));
  audio.addEventListener("pause", () => $playing.set(false));
  audio.addEventListener("play", () => $playing.set(true));
  audio.addEventListener("ended", () => walk(1, false));
  return audio;
}
function stop() { if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); } loaded = ""; $playing.set(false); $pos.set(0); $dur.set(0); }
function play(v, carry = true) {
  const t = $tracks.get()[v];
  if (!t || t.state !== "ready") return false;
  if (gate) { $cur.set(v); $playing.set(true); return true; }
  const a = ensure();
  if (loaded !== v) {
    const P = $ana.get()?.presets || {};
    const at = carry && loaded ? carryTime(a.currentTime || 0, P[loaded]?.speed, P[v]?.speed) : 0;
    a.src = t.url; loaded = v;
    if (at) a.currentTime = at;
    $pos.set(Math.round(at * 1000));
  }
  $cur.set(v);
  a.play().catch(() => $playing.set(false));
  return true;
}
function toggle() {
  if ($playing.get()) { if (gate) $playing.set(false); else audio?.pause(); return; }
  play($cur.get() || $step.get());
}
function walk(dir, manual = true) {
  const made = STEPS.filter((v) => $tracks.get()[v]?.state === "ready");
  const next = advance(made.indexOf($cur.get()), made.length, { step: dir, repeat: $repeat.get(), manual });
  if (next < 0) return;
  const v = made[next];
  $step.set(v);
  if ($playing.get() || !manual) play(v, manual); else $cur.set(v);
}
function seek(ms) { if (audio && !gate) audio.currentTime = ms / 1000; $pos.set(ms); }

async function keep(v, link, toast, t) {
  if ($kept.get()[v]) return;
  $kept.set({ ...$kept.get(), [v]: "busy" });
  try {
    if (!gate) {
      const tags = $tags.get();
      await taskCall("/library/keeptask", { url: link, v, genre: tags?.genre || "", vocal: tags?.vocal || "" });   
    }
    $kept.set({ ...$kept.get(), [v]: "done" });
    toast?.(T(t, "kept"));
  } catch { $kept.set({ ...$kept.get(), [v]: "" }); $err.set("errKeep"); }
}

function Orb({ v }) {
  const orb = useRef(), fill = useRef(), rim = useRef(), form = useRef();
  useLayoutEffect(() => {
    let w = orb.current.offsetWidth, last = "";
    const lay = (d) => {
      last = d;
      if (w) fill.current.style.clipPath = `path("${scalePath(d, w)}")`;
      for (const p of rim.current.children) p.setAttribute("d", d);
    };
    form.current = shaper(shapeOf(v), lay);
    const ro = new ResizeObserver(() => { const nw = orb.current?.offsetWidth || 0; if (nw !== w) { w = nw; if (last) lay(last); } });
    ro.observe(orb.current);
    return () => { ro.disconnect(); form.current.stop(); };
  }, []);
  useLayoutEffect(() => { form.current?.to(shapeOf(v)); }, [v]);
  return html`<div ref=${orb} data-orb data-form=${shapeOf(v)} class="rx-orb" aria-hidden="true">
    <div ref=${fill} class="rx-fill"></div>
    <svg ref=${rim} class="rx-rim" viewBox="0 0 1 1"><path class="b1" /><path class="b2" /><path class="e" /></svg>
  </div>`;
}
function Stepper({ t, step, tracks, onPreview, onPick }) {
  const i = Math.max(0, STEPS.indexOf(step)), n = STEPS.length - 1;
  const at = (k) => `calc(var(--rx-k) / 2 + (100% - var(--rx-k)) * ${k / n})`;
  const lo = Math.min(i, ORIGINAL_AT), hi = Math.max(i, ORIGINAL_AT);
  const of = (e) => STEPS[Number(e.currentTarget.value)] || DEFAULT_STEP;
  return html`<div class="rx-stepper flex flex-col gap-1">
    <div data-stepper class="rx-st">
      <i class="rx-st-line"></i>
      <i class="rx-st-lit" style=${`left:${at(lo)};width:calc((100% - var(--rx-k)) * ${(hi - lo) / n})`}></i>
      <i class="rx-st-one" style=${`left:${at(ORIGINAL_AT)}`}></i>
      ${STEPS.map((v, k) => {
        const s = tracks[v]?.state || "";
        return html`<i key=${v} data-node=${v} data-state=${s || null} data-on=${k === i ? "true" : null}
          class=${`rx-st-node ${["wait", "render", "dl"].includes(s) ? "animate-pulse" : ""}`} style=${`left:${at(k)}`}><svg viewBox="0 0 1 1" aria-hidden="true"><path d=${pathOf(shapeOf(v))} /></svg></i>`;
      })}
      <input type="range" data-step-range min="0" max=${n} step="1" value=${i} data-haptic="off"
        aria-label=${T(t, "aStep")} aria-valuetext=${T(t, `v_${step}`)}
        onInput=${(e) => { const v = of(e); if (v !== step) { haptic.tick(); onPreview(v); } }} onChange=${(e) => onPick(of(e))} />
    </div>
    <div aria-hidden="true" class="relative h-4 font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-base-content/70 whitespace-nowrap">
      <span class="absolute left-0">${T(t, "slowEnd")}</span>
      <span class="absolute -translate-x-1/2" style=${`left:${at(ORIGINAL_AT)}`}>1×</span>
      <span class="absolute right-0">${T(t, "fastEnd")}</span>
    </div>
  </div>`;
}

const songMeta = (s) => ({ id: s.id, title: s.title, artist: s.artist || "", duration: s.dur || 0, cover: s.cover || null });
function pickLiked(s, S, locale) {
  $err.set(""); $busy.set("");   
  $link.set(s.url); $meta.set(songMeta(s));
  S.tab.set("mix");
  mix(s.url, $meta.get(), locale);
}

export function likes({ S, toast, confirm }) {
  const t = useStore(S.t), locale = useStore(S.locale), meta = useStore($meta), busy = useStore($busy);
  const { l, busy: lBusy, err, songs, on, reading, tail } = useLikes();
  return html`<div data-likes data-connected=${on ? "true" : l ? "false" : null} data-songs=${on ? songs.length : null}
    class="flex flex-col gap-[calc(var(--ms-gap)*2)] p-[var(--ms-pad)]">
    ${err ? html`<div data-err role="alert" class="text-sm text-error">${T(t, err)}</div>` : null}
    ${reading ? html`<${LikesSkeleton} />`
    : !on ? html`<${LikesConnect} t=${t} app="remix" expired=${l?.expired} />`
    : html`<section aria-labelledby="rx-likes" class="flex flex-col gap-[var(--ms-gap)]">
      <${LikesHead} t=${t} l=${l} id="rx-likes" toast=${toast} confirm=${confirm} />
      <div class="flex flex-col gap-1">
        ${songs.map((s) => html`<${LikeRow} key=${s.id} s=${s} here=${meta?.id === s.id} busy=${meta?.id === s.id && !!busy}
          label=${`${T(t, "aRemix")}: ${s.title}`} onPick=${() => pickLiked(s, S, locale)} attr=${{ "data-pick-song": s.id }} />`)}
        ${lBusy === "more" ? html`<${LikesSkeleton} n=${2} />` : null}
      </div>
      ${l.next ? html`<div ref=${tail} data-tail aria-hidden="true" class="h-px"></div>` : null}
      ${!songs.length ? html`<div data-none class="py-6 flex flex-col items-center gap-1 text-center">
        <div class="font-semibold text-sm">${T(t, "likesEmpty")}</div><div class="text-sm text-base-content/70">${T(t, "likesEmptyHint")}</div>
      </div>` : null}
    </section>`}
  </div>`;
}

export function remix({ S, toast }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const link = useStore($link), meta = useStore($meta), busy = useStore($busy), err = useStore($err);
  const ana = useStore($ana), tags = useStore($tags), tracks = useStore($tracks), cur = useStore($cur), kept = useStore($kept), step = useStore($step);
  const playing = useStore($playing), pos = useStore($pos), dur = useStore($dur), offline = useStore($offline), repeat = useStore($repeat);
  const input = useRef();
  useEffect(() => { if (!gate && !meta) input.current?.focus(); }, []);
  const paste = async () => {
    try { const text = (await navigator.clipboard.readText()).trim(); if (text) { $link.set(text); find(text); } else report("paste.empty", null, "info"); }
    catch (e) { report("paste.fail", { err: String(e?.name || e).slice(0, 60) }); input.current?.focus(); }
  };
  const started = Object.keys(tracks).length > 0;
  const anyReady = STEPS.some((v) => tracks[v]?.state === "ready");
  const words = ana ? whyKeys(ana.why).map((k) => T(t, k)) : [];
  const st = tracks[step]?.state || "", p = ana?.presets?.[step], pct = tracks[step]?.pct || 0;

  const linkPanel = html`<${Panel} title=${T(t, "link")}>
      <form class="flex items-center gap-2" onSubmit=${(e) => { e.preventDefault(); find(link); }}>
        <textarea rows="1" data-line ref=${input} data-link inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"
          class="input input-bordered sf-inset min-w-0 flex-1 font-mono text-sm"
          placeholder=${T(t, "linkPlaceholder")} value=${link}
          onInput=${(e) => { $link.set(e.target.value); if ($err.get()) $err.set(""); }}></textarea>
        <button type="button" data-paste aria-label=${T(t, "aPaste")} onClick=${paste}
          class="btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 text-base-content/70">${Icon("lucide:clipboard-paste", "text-[length:var(--ms-icon)]")}</button>
        <button type="submit" data-find aria-label=${T(t, "aFind")} disabled=${!link || busy === "meta"}
          class="btn btn-primary btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 sf-e3">${Icon("lucide:search", "text-[length:var(--ms-icon)]")}</button>
      </form>
    <//>`;

  return html`<div data-remix data-busy=${busy || null} data-song=${meta ? meta.id : null} data-playing=${playing ? "true" : null} class="flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]">
    ${err ? html`<div data-err role="alert" class="text-sm text-error px-1">${T(t, err)}</div>` : null}
    ${meta ? null : linkPanel}

    ${busy === "meta" ? html`<${Panel} title=${T(t, "song")}>
      <div class="flex gap-[var(--ms-gap)] items-start">
        <div class="skeleton w-28 h-28 shrink-0 rounded-[var(--ms-r-in)]"></div>
        <div class="flex-1 flex flex-col gap-2 pt-1"><div class="skeleton h-5 w-3/4"></div><div class="skeleton h-4 w-1/2"></div><div class="skeleton h-4 w-16"></div></div>
      </div>
    <//>` : meta ? html`<${Panel} title=${T(t, "song")}>
      <div class="flex gap-[var(--ms-gap)] items-start">
        <div data-cover class="relative w-28 h-28 shrink-0 rounded-[var(--ms-r-in)] overflow-hidden sf-raised sf-e2 bg-base-200 flex items-center justify-center text-base-content/40">
          ${Icon("lucide:disc-3", "text-3xl")}
          ${meta.cover ? html`<img src=${meta.cover} alt="" class="absolute inset-0 w-full h-full object-cover" onError=${(e) => { e.target.remove(); }} />` : null}
        </div>
        <div class="min-w-0 flex-1 flex flex-col gap-1">
          <div data-song-title class="font-semibold text-[length:var(--ms-title)] leading-tight break-words">${meta.title}</div>
          <div class="text-sm text-base-content/70 leading-snug break-words">${byline(meta)}</div>
          <div class="font-mono text-xs tabular-nums text-base-content/70">${clock(meta.duration)}</div>
        </div>
      </div>
      ${ana ? html`<div data-readout class="font-mono text-xs tabular-nums text-base-content/70 leading-relaxed text-balance">${[ana.bpm ? `${Math.round(ana.bpm)} BPM` : "", ...words].filter(Boolean).join(" · ")}</div>` : started ? html`<div class="skeleton h-3 w-2/3"></div>` : null}
      ${tags?.why ? html`<div data-why class="text-sm text-base-content/70 leading-snug">${tags.why}</div>` : null}
      ${busy && busy !== "meta" ? (() => {
        const i = Math.max(0, STAGES.indexOf(busy));
        const [ic, key] = offline ? ["lucide:wifi-off", "offlineWait"] : STAGE_UI[STAGES[i]];
        return html`<div data-stage=${offline ? "offline" : STAGES[i]} role="status" class="relative flex flex-col gap-2 px-1">
          <span aria-hidden="true" class="absolute w-px h-px overflow-hidden opacity-0 pointer-events-none">${LATER_ICONS.map((ic) => Icon(ic))}</span>
          <div class=${`flex items-center gap-2 min-h-[var(--ms-ctl)] text-sm ${offline ? "text-warning" : "text-base-content/70"}`}>
            ${Icon(ic, `shrink-0 text-[length:var(--ms-icon)] ${offline ? "" : "animate-pulse"}`)}<span class="flex-1 leading-snug">${T(t, key)}</span>
            <span class="shrink-0 font-mono text-xs tabular-nums text-base-content/50">${i + 1}/${STAGES.length}</span>
          </div>
          <div aria-hidden="true" class="grid grid-cols-4 gap-1">${STAGES.map((s, k) => html`<span key=${s}
            class=${`h-1 rounded-full transition-colors duration-500 ${k < i ? "bg-[var(--app-accent)]" : k === i ? `bg-[var(--app-accent)] ${offline ? "opacity-40" : "animate-pulse"}` : "bg-base-content/15"}`}></span>`)}</div>
        </div>`;
      })() : null}
    <//>` : null}

    ${meta && busy !== "meta" ? html`<${Panel} title=${T(t, "remixes")}>
      <div data-track=${step} data-state=${st || null} class="relative flex items-center gap-2 min-h-[var(--ms-ctl)] pb-1">
        <div class="min-w-0 flex-1 flex flex-col leading-tight px-1">
          <span data-step-name class="font-semibold truncate">${T(t, `v_${step}`)}</span>
          ${p ? html`<span data-step-line class="flex flex-wrap gap-x-2 text-xs text-base-content/70 leading-snug"><span class="font-mono tabular-nums">${presetLine(p)}</span><span>${T(t, roomKey(p))}</span></span>`
            : st === "err" ? html`<span class="text-xs text-error">${T(t, "failed")}</span>`
            : started ? html`<span class="skeleton h-3 w-28 mt-1"></span>` : null}
        </div>
        ${st === "ready" ? html`
          <button data-keep=${step} aria-label=${T(t, kept[step] === "done" ? "keptA" : "aKeep")} disabled=${kept[step] === "busy"} onClick=${() => keep(step, link, toast, t)}
            class=${`btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ${kept[step] === "done" ? "text-primary" : "text-base-content/70"} ${kept[step] === "busy" ? "animate-pulse" : ""}`}>${Icon(kept[step] === "done" ? "lucide:library-big" : "lucide:library", "text-[length:var(--ms-icon)]")}</button>
          ${gate ? html`<button data-save=${step} aria-label=${T(t, "aSave")} onClick=${() => toast?.(T(t, "saved"))}
              class="btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 text-base-content/70">${Icon("lucide:download", "text-[length:var(--ms-icon)]")}</button>`
            : html`<a data-save=${step} href=${tracks[step].url} download=${remixFile(meta, step)} aria-label=${T(t, "aSave")}
              onClick=${() => toast?.(T(t, "saved"))} class="btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 text-base-content/70">${Icon("lucide:download", "text-[length:var(--ms-icon)]")}</a>`}`
        : st ? html`<span data-save=${step} role="status" aria-label=${st === "dl" ? `${T(t, "receiving")} ${pct}%` : T(t, st === "err" ? "failed" : st === "render" ? "rendering" : "waiting")}
            class="shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] grid place-items-center text-base-content/70">${st === "dl"
              ? html`<span class="font-mono text-[11px] tabular-nums text-base-content">${pct}%</span>`
              : Icon({ err: "lucide:x", render: "lucide:audio-lines" }[st] || "lucide:hourglass", `text-[length:var(--ms-icon)] ${st === "render" ? "animate-pulse" : ""}`)}</span>` : null}
        ${st === "render" ? html`<span data-progress="render" aria-hidden="true" class="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--app-accent)] animate-pulse"></span>`
          : st === "dl" ? html`<progress data-progress="dl" aria-hidden="true" max="100" value=${pct} class="progress absolute inset-x-0 -bottom-px h-0.5 rounded-none text-[var(--app-accent)]"></progress>` : null}
      </div>
      <${Stepper} t=${t} step=${step} tracks=${tracks} onPreview=${(v) => $step.set(v)} onPick=${(v) => select(v, link)} />
      ${!started ? html`<button data-mix onClick=${() => mix(link, meta, locale)}
        class="btn btn-primary w-full h-[var(--ms-ctl)] min-h-0 gap-2 sf-e3">
        ${Icon("lucide:sparkles", "text-[length:var(--ms-icon)]")}<span>${T(t, "mix")}</span>
      </button>` : null}
      
      ${anyReady ? html`<div data-player class="flex flex-col items-center gap-[var(--ms-gap)] pt-2">
        <${Orb} v=${cur || step} />
        <${Transport} form locale=${locale} playing=${playing} onToggle=${toggle} className="w-full pt-1"
          onPrev=${() => walk(-1)} onNext=${() => walk(1)} pos=${pos} dur=${dur} onSeek=${seek} repeat=${shownRepeat(repeat)} onRepeat=${flipRepeat} />
      </div>` : null}
    <//>` : null}
    ${meta ? linkPanel : null}
  </div>`;
}
