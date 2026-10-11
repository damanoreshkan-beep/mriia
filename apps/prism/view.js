import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Segmented, Sheet } from "/_rt/ui.js";
import { downloadUrl, shareFile } from "/_rt/apk.js";
import { Chooser, Camera } from "/_rt/intake.js";
import { takeShared } from "/_rt/share.js";
import { session } from "/_rt/auth.js";
import * as M from "./state.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const label = "font-mono uppercase tracking-wide font-semibold text-[length:var(--ms-label)] text-base-content/70";

// A picture shared INTO Prism from the gallery (spec share.files) lands as the source, already on its way.
takeShared((s) => { const f = (s.files || []).find((x) => /^image\//.test(x.type)); if (f) M.setSource(URL.createObjectURL(f)); });

// one material's tile: the theme's fox until the picture is drawn in it, the picture once it is
function Tile({ t, name, fox, tile, onOpen, onRetry, own }) {
  const st = tile?.state || "idle";
  const shown = st === "done" ? tile.url : fox;
  return html`<div data-tile=${own ? "own" : "mat"} data-state=${st} class=${`pr-tile relative overflow-hidden rounded-[var(--ms-r-in)] sf-raised sf-e2 ${st === "work" ? "pr-work" : ""}`}>
    <button type="button" class="absolute inset-0 w-full h-full ms-press" aria-label=${st === "done" ? `${T(t, "open")}: ${name}` : name} disabled=${st !== "done"} onClick=${onOpen}>
      <img src=${shown} alt="" loading="lazy" decoding="async" class=${`w-full h-full object-cover ${st === "done" ? "pr-in" : "opacity-70"}`} />
    </button>
    <div class="pr-cap absolute inset-x-0 bottom-0 px-2.5 pb-2 pt-6 flex items-end justify-between gap-2 pointer-events-none">
      <span class="text-[0.8rem] font-semibold text-white truncate">${name}</span>
      ${st === "work" ? html`<span class="font-mono text-[0.62rem] uppercase tracking-wider text-white/85 shrink-0">${T(t, "drawing")}</span>` : null}
    </div>
    ${st === "fail" ? html`<button type="button" data-retry class="absolute top-2 right-2 btn btn-xs rounded-full sf-raised gap-1 ms-press" onClick=${onRetry}>${Icon("lucide:rotate-ccw", "text-sm")}${T(t, "retry")}</button>` : null}
  </div>`;
}

export function prism({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen), theme = useStore(S.theme), materials = useStore(S.materials);
  const src = useStore(M.$src), tiles = useStore(M.$tiles), styles = useStore(M.$styles), err = useStore(M.$err), sess = useStore(session);
  const [camera, setCamera] = useState(false);
  const [mode, setMode] = useState(theme === "signal-light" ? "light" : "dark");   // «за поточною темою»
  useEffect(() => { setMode(theme === "signal-light" ? "light" : "dark"); }, [theme]);
  useEffect(() => { M.loadStyles(); }, [sess?.sid]);

  const nameOf = (themeId) => { const m = materials.find((x) => x.id === themeId); return m?.name?.[loc] || m?.name?.en || themeId; };
  const keys = [...M.MATERIALS.map((m) => m.id), ...styles.map((s) => `own:${s.id}`)];
  const states = keys.map((k) => tiles[M.tileKey(mode, k)]?.state);
  const working = states.some((s) => s === "work");
  const done = states.filter((s) => s === "done").length;
  const viewKey = screen?.startsWith?.("view:") ? screen.slice(5) : null;
  const viewTile = viewKey ? tiles[M.tileKey(mode, viewKey)] : null;
  const viewName = viewKey ? (viewKey.startsWith("own:") ? styles.find((s) => `own:${s.id}` === viewKey)?.name : nameOf(M.MATERIALS.find((m) => m.id === viewKey)?.theme)) : "";
  const fileName = () => `prism-${viewKey?.replace(/^own:/, "") || "x"}-${mode}.png`;
  const save = async () => { if (!viewTile?.url) return; try { await downloadUrl(viewTile.url, fileName()); toast?.(T(t, "saved")); } catch { toast?.(T(t, "eFailed")); } };
  const share = async () => { if (!viewTile?.url) return; try { const r = await shareFile(viewTile.blob || await (await fetch(viewTile.url)).blob(), fileName()); if (r === "saved") toast?.(T(t, "saved")); } catch { toast?.(T(t, "eFailed")); } };

  if (camera) return html`<div class="relative h-full min-h-0"><${Camera} loc=${loc} reason=${T(t, "primeReason")} privacy=${T(t, "primePrivacy")} onSettings=${() => S.screen.set("perms")}
    onCapture=${(u) => { setCamera(false); M.setSource(u); }} onClose=${() => setCamera(false)} /></div>`;

  return html`<div data-prism data-mode=${mode} data-done=${done} class="flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]">
    ${!src ? html`<section data-empty class="flex flex-col gap-[var(--ms-gap)]">
        <div class="flex flex-col gap-1 px-1 pt-2">
          <h2 class="text-[1.6rem] font-bold leading-tight tracking-tight">${T(t, "heroTitle")}</h2>
          <p class="text-sm text-base-content/70 leading-relaxed">${T(t, "heroBody")}</p>
        </div>
        <div class="relative min-h-[16rem] rounded-[var(--ms-r)] sf-inset overflow-hidden"><${Chooser} loc=${loc} onPick=${M.setSource} onCamera=${() => setCamera(true)} /></div>
      </section>`
      : html`<section data-source class="card sf-raised sf-e2 rounded-[var(--ms-r)]"><div class="card-body p-3 gap-3">
        <div class="flex items-center gap-3">
          <img src=${src} alt=${T(t, "yourPicture")} class="w-16 h-16 rounded-[var(--ms-r-in)] object-cover shrink-0 sf-inset" />
          <div class="min-w-0 flex-1">
            <div class="font-semibold leading-tight">${T(t, "yourPicture")}</div>
            <div data-count class="text-sm text-base-content/70 tabular-nums">${working ? T(t, "drawingN", { n: done, of: keys.length }) : done ? T(t, "doneN", { n: done, of: keys.length }) : T(t, "readyHint")}</div>
          </div>
          <button type="button" data-new aria-label=${T(t, "newPicture")} class="btn btn-ghost btn-circle w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 shrink-0 ms-press" onClick=${M.clearSource}>${Icon("lucide:image-plus", "text-[length:var(--ms-icon)]")}</button>
        </div>
        <div class="flex items-center gap-2">
          <${Segmented} attr="data-mode" label=${T(t, "modeLabel")} value=${mode} onChange=${setMode}
            items=${[{ id: "dark", label: T(t, "modeDark"), icon: "lucide:moon" }, { id: "light", label: T(t, "modeLight"), icon: "lucide:sun" }]} />
          <button type="button" data-split disabled=${working} onClick=${() => M.splitAll(mode)}
            class="btn btn-primary rounded-full flex-1 min-w-0 h-[var(--ms-ctl)] min-h-0 gap-2 sf-e3 ms-press">${Icon("lucide:sparkles", "text-[length:var(--ms-icon)]")}<span class="truncate">${T(t, done ? "again" : "split")}</span></button>
        </div>
        ${err ? html`<p data-err role="alert" class="text-sm text-error">${T(t, err)}</p>` : null}
      </div></section>`}

    <section aria-label=${T(t, "styles")} class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between px-1"><span class=${label}>${T(t, "styles")}</span><span class=${`${label} tabular-nums`}>${keys.length}</span></div>
      <div data-grid class="pr-grid ms-stagger grid gap-[var(--ms-gap)]">
        ${M.MATERIALS.map((m, i) => html`<div key=${m.id} style=${`--i:${i}`}><${Tile} t=${t} name=${nameOf(m.theme)} fox=${M.foxOf(m.theme)} tile=${tiles[M.tileKey(mode, m.id)]}
          onOpen=${() => S.screen.set(`view:${m.id}`)} onRetry=${() => M.redraw(mode, m.id)} /></div>`)}
        ${styles.map((s, i) => html`<div key=${s.id} style=${`--i:${M.MATERIALS.length + i}`}><${Tile} own t=${t} name=${s.name} fox=${s.thumb || M.foxOf("plain")} tile=${tiles[M.tileKey(mode, `own:${s.id}`)]}
          onOpen=${() => S.screen.set(`view:own:${s.id}`)} onRetry=${() => M.redraw(mode, `own:${s.id}`)} /></div>`)}
        <button type="button" data-add-style class="pr-add rounded-[var(--ms-r-in)] flex flex-col items-center justify-center gap-2 text-base-content/70 ms-press" onClick=${() => S.screen.set("style")}>
          ${Icon("lucide:plus", "text-2xl")}<span class="text-sm font-semibold">${T(t, "ownStyle")}</span>
        </button>
      </div>
    </section>

    ${viewKey && viewTile?.url ? html`<div data-lightbox class="fixed inset-0 z-50 bg-black flex flex-col ms-reveal">
      <div class="flex items-center gap-2 px-3 pt-[max(.75rem,env(safe-area-inset-top))] pb-2 text-white">
        <span class="flex-1 min-w-0 truncate font-semibold">${viewName}</span>
        <button type="button" data-save aria-label=${T(t, "save")} class="btn btn-circle btn-ghost text-white ms-press" onClick=${save}>${Icon("lucide:download", "text-xl")}</button>
        <button type="button" data-share aria-label=${T(t, "share")} class="btn btn-circle btn-ghost text-white ms-press" onClick=${share}>${Icon("lucide:share-2", "text-xl")}</button>
        <button type="button" data-close aria-label=${T(t, "close")} class="btn btn-circle btn-ghost text-white ms-press" onClick=${() => S.screen.set(null)}>${Icon("lucide:x", "text-xl")}</button>
      </div>
      <div class="flex-1 min-h-0 flex items-center justify-center p-2"><img src=${viewTile.url} alt=${viewName} class="max-w-full max-h-full object-contain" /></div>
    </div>` : null}

    <${StyleSheet} t=${t} loc=${loc} mode=${mode} open=${screen === "style"} styles=${styles} signedIn=${!!sess} onClose=${() => S.screen.set(null)} toast=${toast} />
  </div>`;
}

// «Свій стиль»: a name and the words for the substance → the fox drawn in it → saved to the account
function StyleSheet({ t, loc, mode, open, styles, signedIn, onClose, toast }) {
  const [name, setName] = useState(""), [prompt, setPrompt] = useState("");
  const [fox, setFox] = useState(null), [busy, setBusy] = useState(""), [err, setErr] = useState("");
  useEffect(() => { if (!open) { setFox(null); setErr(""); setBusy(""); } }, [open]);
  const canDraw = name.trim() && prompt.trim().length >= 3 && !busy;
  const draw = async () => {
    setBusy("draw"); setErr(""); setFox(null);
    try { setFox(await M.foxIn(prompt.trim(), mode)); } catch (e) { setErr(e.code || "eFailed"); } finally { setBusy(""); }
  };
  const save = async () => {
    setBusy("save"); setErr("");
    try { await M.saveStyle({ name: name.trim(), prompt: prompt.trim(), thumb: fox.thumb }); toast?.(T(t, "styleSaved")); setName(""); setPrompt(""); onClose(); }
    catch (e) { setErr(e.code === "full" ? "eFull" : "eFailed"); } finally { setBusy(""); }
  };
  return html`<${Sheet} id="style" open=${open} onClose=${onClose} title=${T(t, "ownStyle")} icon="lucide:wand-sparkles" locale=${loc}>
    <div data-style-sheet class="flex flex-col gap-[var(--ms-gap)]">
      <p class="text-sm text-base-content/70 leading-relaxed">${T(t, "ownHint")}</p>
      <label class="flex flex-col gap-1"><span class=${label}>${T(t, "styleName")}</span>
        <textarea data-line data-style-name rows="1" maxlength="40" value=${name} placeholder=${T(t, "styleNamePh")} onInput=${(e) => setName(e.target.value)}
          class="textarea sf-inset rounded-[var(--ms-r-in)] min-h-0 h-[var(--ms-ctl)] leading-[1.6] resize-none"></textarea></label>
      <label class="flex flex-col gap-1"><span class=${label}>${T(t, "stylePrompt")}</span>
        <textarea data-style-prompt rows="3" maxlength="300" value=${prompt} placeholder=${T(t, "stylePromptPh")} onInput=${(e) => setPrompt(e.target.value)}
          class="textarea sf-inset rounded-[var(--ms-r-in)] leading-relaxed resize-none"></textarea></label>
      <div class="flex items-center gap-3">
        <div data-fox class=${`w-24 h-24 rounded-[var(--ms-r-in)] overflow-hidden shrink-0 sf-inset ${busy === "draw" ? "pr-work" : ""}`}>
          <img src=${fox?.url || M.foxOf("plain")} alt=${T(t, "foxAlt")} class=${`w-full h-full object-cover ${fox ? "pr-in" : "opacity-60"}`} />
        </div>
        <p class="text-sm text-base-content/70 leading-snug">${busy === "draw" ? T(t, "foxDrawing") : fox ? T(t, "foxReady") : T(t, "foxHint")}</p>
      </div>
      ${err ? html`<p role="alert" class="text-sm text-error">${T(t, err)}</p>` : null}
      <div class="flex gap-2">
        <button type="button" data-draw-fox disabled=${!canDraw} onClick=${draw} class="btn rounded-full flex-1 sf-raised gap-2 ms-press">${Icon("lucide:wand-sparkles", "text-lg")}${T(t, fox ? "foxAgain" : "foxDraw")}</button>
        <button type="button" data-save-style disabled=${!fox || !!busy || !signedIn} onClick=${save} class="btn btn-primary rounded-full flex-1 gap-2 sf-e3 ms-press">${Icon("lucide:bookmark-plus", "text-lg")}${T(t, "saveStyle")}</button>
      </div>
      ${!signedIn ? html`<p class="text-xs text-base-content/70">${T(t, "signInToSave")}</p>` : null}
      ${styles.length ? html`<div class="flex flex-col gap-1 pt-2">
        <span class=${label}>${T(t, "myStyles")}</span>
        ${styles.map((s) => html`<div key=${s.id} data-own-style class="flex items-center gap-3 min-h-[3rem]">
          <img src=${s.thumb || M.foxOf("plain")} alt="" class="w-10 h-10 rounded-[var(--ms-r-in)] object-cover shrink-0" />
          <div class="min-w-0 flex-1"><div class="text-sm font-semibold truncate">${s.name}</div><div class="text-xs text-base-content/70 truncate">${s.prompt}</div></div>
          <button type="button" data-del-style aria-label=${`${T(t, "deleteStyle")}: ${s.name}`} class="btn btn-ghost btn-circle w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 text-base-content/70 ms-press" onClick=${() => M.deleteStyle(s.id)}>${Icon("lucide:trash-2", "text-lg")}</button>
        </div>`)}
      </div>` : null}
    </div>
  <//>`;
}
