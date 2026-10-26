import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { report } from "/_rt/telemetry.js";
import { hasWebGL2 } from "/_rt/glstage.js";
import { downloadBlob } from "/_rt/apk.js";
import { Island, Stage, Sheet, Transport, Row } from "/_rt/ui.js";
import { fmtCount, fmtBytes, fmtDims, linkOf } from "/_rt/glb.js";
import * as M from "./state.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const ACCENT = "#38D9F5";
const CSS = `.ob-glow{filter:drop-shadow(0 0 22px color-mix(in oklch,var(--app-accent) 55%,transparent))}
.ob-breathe{animation:obBreathe 2.4s ease-in-out infinite}
@keyframes obBreathe{0%,100%{opacity:.55;transform:scale(.96)}50%{opacity:1;transform:scale(1)}}
.ob-bar{height:2px;border-radius:2px;background:var(--app-accent);box-shadow:0 0 12px 1px color-mix(in oklch,var(--app-accent) 60%,transparent);transition:width var(--t-state) var(--ease-out)}
.ob-ar{display:none}
.ob-ar:xr-overlay,.ob-ar.on{display:flex}
@media (prefers-reduced-motion:reduce){.ob-breathe{animation:none}}`;
const ghost = "btn btn-ghost rounded-full gap-2 px-4 shrink-0 ms-press";
const primary = "btn btn-primary rounded-full gap-2 px-5 shrink-0 ms-press";
const mono = "font-mono text-[length:var(--ms-label)] uppercase tracking-[0.16em] tabular-nums";

export function obrys({ S, screen, openScreen, closeScreen, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const st = useStore(M.$st), mine = useStore(M.$mine), ar = useStore(M.$ar);
  const canvasRef = useRef(null), fileRef = useRef(null), arRef = useRef(null);
  const [gl] = useState(() => hasWebGL2());
  const [link, setLink] = useState("");
  const ready = st.phase === "ready", s = st.stats;

  // the stage is three.js, loaded only where a WebGL2 context answers (preflight's canvas stub answers null)
  useEffect(() => {
    if (!gl) return () => {};
    let v = null, gone = false;
    (async () => {
      try {
        const { createViewer } = await import("./scene.js");
        if (gone || !canvasRef.current) return;
        v = createViewer(canvasRef.current, { accent: ACCENT });
        M.attach(v);
        const ok = await v.arSupported();
        if (!gone) M.$ar.set({ ...M.$ar.get(), ok });
      } catch (e) { report("obrys.stage", { why: String(e?.message || e).slice(0, 120) }); }
    })();
    return () => { gone = true; if (v) { M.detach(v); v.dispose(); } };
  }, []);

  // a sheet that closes because ANOTHER one opened (src → mine) must not pop the new route
  const shut = (id) => () => { if (screen === id) closeScreen(); };
  const pickFile = () => { closeScreen(); fileRef.current?.click(); };
  const onFile = (e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ""; M.openFile(f); };
  const openMine = () => { M.loadMine(); openScreen("mine"); };
  const openLink = () => openScreen("link");
  const submitLink = (e) => {
    e.preventDefault();
    const url = linkOf(link);
    if (!url) { toast?.(T(t, "eLink")); return; }
    closeScreen(); M.openUrl(url);
  };
  const snap = async () => {
    const blob = await M.stage()?.snapshot();
    if (!blob) return;
    downloadBlob(blob, `${st.name || "obrys"}.png`); toast?.(T(t, "saved"));
  };
  const startAR = async () => {
    const v = M.stage();
    if (!v) return;
    try {
      await v.startAR(arRef.current, () => M.$ar.set({ ...M.$ar.get(), on: false }));
      M.$ar.set({ ...M.$ar.get(), on: true });
    } catch (e) { toast?.(T(t, "eAR")); report("obrys.ar", { why: String(e?.message || e).slice(0, 120) }); }
  };

  const center = () => {
    if (ready) return gl ? null : html`<div class="absolute inset-0 flex items-center justify-center p-6 text-center"><p data-nogl class="text-sm text-base-content/70 max-w-xs">${T(t, "noGL")}</p></div>`;
    const loading = st.phase === "loading";
    return html`<div class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div aria-hidden="true" class=${`ob-glow text-[var(--app-accent)] ${loading ? "ob-breathe" : ""}`}>${Icon("lucide:box", "text-[length:clamp(3.5rem,14vh,6.5rem)]")}</div>
      ${loading
        ? html`<div data-loading role="status" class="flex flex-col items-center gap-2 w-48 max-w-full">
            <span class=${`${mono} text-base-content/70`}>${st.pct != null ? `${T(t, "loading")} ${st.pct}%` : T(t, "reading")}</span>
            <div class="w-full h-0.5 rounded bg-base-content/10 overflow-hidden"><div class="ob-bar" style=${`width:${st.pct ?? 100}%`}></div></div>
          </div>`
        : html`<div data-empty class="flex flex-col items-center gap-1">
            <p class="text-[length:var(--ms-title)] font-semibold text-balance">${T(t, "emptyTitle")}</p>
            <p class=${`${mono} text-muted whitespace-nowrap`}>.glb · .gltf</p>
          </div>`}
    </div>`;
  };

  // a narrow island (split screen) keeps the two secondary sources as glyphs: compact by demotion, never deletion
  const sources = html`<div class="@container flex flex-col gap-2 w-full">
    <button data-file class=${`${primary} w-full`} onClick=${pickFile}>${Icon("lucide:folder-open", "text-xl")}<span>${T(t, "openFile")}</span></button>
    <div class="flex gap-2">
      <button data-mine aria-label=${T(t, "mine")} class=${`${ghost} flex-1 min-w-0`} onClick=${openMine}>${Icon("lucide:boxes", "text-lg")}<span class="truncate @max-[18rem]:hidden">${T(t, "mine")}</span></button>
      <button data-link aria-label=${T(t, "link")} class=${`${ghost} flex-1 min-w-0`} onClick=${openLink}>${Icon("lucide:link", "text-lg")}<span class="truncate @max-[18rem]:hidden">${T(t, "link")}</span></button>
    </div>
  </div>`;

  const clipName = st.clips[st.clip] || "";
  const actions = [
    { id: "open", icon: "lucide:folder-open", label: T(t, "openOther"), onClick: () => openScreen("src"), attr: { "data-open": true } },
    { id: "shot", icon: "lucide:camera", label: T(t, "snapshot"), onClick: snap, disabled: !gl || !st.size, attr: { "data-shot": true } },
    ...(ar.ok ? [{ id: "ar", icon: "lucide:scan", label: T(t, "ar"), onClick: startAR, tone: "accent", attr: { "data-ar": true } }] : []),
    { id: "reset", icon: "lucide:rotate-ccw", label: T(t, "resetView"), onClick: () => M.stage()?.reset(), disabled: !gl || !st.size, attr: { "data-reset": true } },
  ];

  const facts = s ? [
    ["triangles", fmtCount(s.triangles, loc)], ["vertices", fmtCount(s.vertices, loc)],
    ["meshes", fmtCount(s.meshes, loc)], ["materials", fmtCount(s.materials, loc)], ["textures", fmtCount(s.textures, loc)],
    ["animations", s.animations.length ? s.animations.join(", ") : "—"],
    ["dims", st.size ? fmtDims(st.size, loc) : "—"], ["fileSize", st.bytes ? fmtBytes(st.bytes, loc) : "—"],
    ["generator", s.generator || "—"], ["extensions", s.extensions.length ? s.extensions.join(", ") : "—"],
  ] : [];

  return html`<${Fragment}>
    <style>${CSS}</style>
    <input ref=${fileRef} type="file" class="hidden" tabindex="-1" aria-hidden="true" onChange=${onFile} />
    <div class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)] ms-side">
      <${Stage}>
        <div data-viewer data-phase=${st.phase} class="@container absolute inset-0 rounded-[var(--ms-r)] overflow-hidden">
          <canvas ref=${canvasRef} aria-label=${st.name || T(t, "title")} class=${`absolute inset-0 w-full h-full ${ready ? "" : "invisible"}`}></canvas>
          ${center()}
          ${ready && s ? html`<button data-stats aria-label=${T(t, "details")} onClick=${() => openScreen("info")}
              class="absolute top-2 left-2 max-w-[calc(100%-1rem)] ms-press rounded-full bg-base-100 sf-raised px-3 py-1.5 flex items-center gap-2 whitespace-nowrap font-mono text-[length:var(--ms-label)] tabular-nums text-base-content/80 ms-reveal">
              ${Icon("lucide:triangle", "text-sm text-[var(--app-accent)] shrink-0")}<span>${fmtCount(s.triangles, loc)}</span>
              ${st.bytes ? html`<span class="text-base-content/40 @max-[13rem]:hidden">·</span><span class="@max-[13rem]:hidden">${fmtBytes(st.bytes, loc)}</span>` : null}
              ${Icon("lucide:info", "text-sm text-base-content/50 shrink-0 @max-[13rem]:hidden")}
            </button>` : null}
        </div>
      <//>
      <div class="ms-side-main shrink-0 flex flex-col justify-center">
        <${Island} className="w-full max-w-xl mx-auto flex flex-col gap-[var(--ms-gap)]">
          ${ready
            ? html`<div data-model data-clips=${st.clips.length} data-playing=${st.playing ? "true" : "false"}>
                ${st.clips.length ? html`<${Transport} form locale=${loc} title=${st.name || T(t, "untitled")} subtitle=${clipName || null}
                  playing=${st.playing} onToggle=${st.clips.length ? M.togglePlay : undefined}
                  onPrev=${st.clips.length > 1 ? () => M.playClip(st.clip - 1) : undefined}
                  onNext=${st.clips.length > 1 ? () => M.playClip(st.clip + 1) : undefined}
                  actions=${actions} keep=${2}
                  moreOpen=${screen === "more"} onMore=${() => openScreen("more")} onMoreClose=${closeScreen} />`
                // no clips: the Transport's play button would be a dead control, so the same actions stand alone
                : html`<div class="flex flex-col items-center gap-2 min-w-0">
                    <p class="font-semibold text-[length:var(--ms-title)] truncate max-w-full">${st.name || T(t, "untitled")}</p>
                    <div class="flex items-center justify-center gap-1">${actions.map((a) => html`<button ...${a.attr} aria-label=${a.label} title=${a.label}
                      class=${`btn btn-ghost btn-circle ms-press ${a.tone === "accent" ? "text-[var(--app-accent)]" : ""}`} disabled=${a.disabled} onClick=${a.onClick}>${Icon(a.icon, "text-xl")}</button>`)}</div>
                  </div>`}
              </div>`
            : sources}
          ${st.phase === "error" ? html`<p data-error role="alert" class="text-sm text-error px-1 text-center">${T(t, st.error)}</p>` : null}
        <//>
      </div>
    </div>

    <${Sheet} id="srcsheet" open=${screen === "src"} onClose=${shut("src")} title=${T(t, "openOther")} icon="lucide:folder-open" locale=${loc}>
      ${sources}
    <//>

    <${Sheet} id="minesheet" open=${screen === "mine"} onClose=${shut("mine")} title=${T(t, "mine")} icon="lucide:boxes" locale=${loc}>
      ${!mine || mine.list === null
        ? html`<div class="flex flex-col gap-2" aria-hidden="true">${[0, 1, 2].map(() => html`<div class="skeleton h-14 rounded-[var(--ms-r)]"></div>`)}</div>`
        : !mine.signedIn
          ? html`<div class="flex flex-col items-center gap-3 py-4 text-center">
              <p class="text-sm text-base-content/70">${T(t, "mineSignIn")}</p>
              <button data-signin class=${primary} onClick=${() => S.screen.set("signin")}>${T(t, "signIn")}</button>
            </div>`
          : mine.list === false
            ? html`<p role="alert" class="text-sm text-error py-4 text-center">${T(t, "eNetwork")}</p>`
            : !mine.list.length
              ? html`<p data-mine-empty class="text-sm text-base-content/70 py-4 text-center">${T(t, "mineEmpty")}</p>`
              : html`<ul data-mine-list class="flex flex-col gap-1">${mine.list.map((c) => html`<li>
                  <button class="w-full flex items-center gap-3 p-2 rounded-[var(--ms-r)] text-left hover:bg-base-content/5 ms-press"
                    onClick=${() => { closeScreen(); M.openUrl(c.glb, c.name, "farm"); }}>
                    ${c.avatar
                      ? html`<img src=${c.avatar} alt="" class="w-12 h-12 rounded-full object-cover bg-base-200 shrink-0" />`
                      : html`<span class="w-12 h-12 rounded-full bg-base-200 flex items-center justify-center shrink-0">${Icon("lucide:box", "text-xl text-[var(--app-accent)]")}</span>`}
                    <span class="flex-1 min-w-0 truncate font-medium">${c.name || T(t, "untitled")}</span>
                    ${Icon("lucide:chevron-right", "text-lg text-base-content/40")}
                  </button>
                </li>`)}</ul>`}
    <//>

    <${Sheet} id="linksheet" open=${screen === "link"} onClose=${shut("link")} title=${T(t, "link")} icon="lucide:link" locale=${loc}>
      <form class="flex flex-col gap-[var(--ms-gap)]" onSubmit=${submitLink}>
        <textarea data-line data-url rows="1" inputmode="url" enterkeyhint="go" autocomplete="off" spellcheck="false"
          aria-label=${T(t, "linkLabel")} placeholder="https://…/model.glb" class="textarea w-full rounded-[var(--ms-r)] font-mono text-sm"
          value=${link} onInput=${(e) => setLink(e.currentTarget.value)}></textarea>
        <button data-go type="submit" class=${`${primary} self-end`} disabled=${!link.trim()}>${Icon("lucide:download", "text-xl")}<span>${T(t, "openLink")}</span></button>
      </form>
    <//>

    <${Sheet} id="infosheet" open=${screen === "info"} onClose=${shut("info")} title=${st.name || T(t, "untitled")} subtitle=${T(t, "details")} icon="lucide:triangle" locale=${loc}>
      <dl data-info class="flex flex-col">${facts.map(([k, v]) => html`<${Row} className="justify-between py-2 border-b border-base-content/10 last:border-0">
        <dt class=${`${mono} text-muted shrink-0`}>${T(t, k)}</dt>
        <dd class="font-mono text-sm tabular-nums text-right min-w-0 break-words">${v}</dd>
      <//>`)}</dl>
    <//>

    <div ref=${arRef} data-ar-overlay class=${`ob-ar fixed inset-0 z-[80] flex-col justify-end items-center gap-3 p-6 pb-10 pointer-events-none ${ar.on ? "on" : ""}`}>
      <p class=${`${mono} rounded-full bg-black/60 text-white px-4 py-2`}>${T(t, "arHint")}</p>
      <button data-ar-exit class="btn rounded-full gap-2 px-5 pointer-events-auto ms-press" onbeforexrselect=${(e) => e.preventDefault()} onClick=${() => M.stage()?.stopAR()}>
        ${Icon("lucide:x", "text-lg")}<span>${T(t, "arExit")}</span>
      </button>
    </div>
  </${Fragment}>`;
}
