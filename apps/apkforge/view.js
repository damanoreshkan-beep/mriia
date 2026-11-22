import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { siteName } from "/_rt/sitelabel.js";
import { buildApk, fetchSiteIconPng, letterTilePng, adaptiveFromTile, downloadBlob, apkFilename } from "/_rt/apk.js";
import { gate } from "/_rt/gate.js";
import { Effect } from "/_rt/fx.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const accent = () => (getComputedStyle(document.documentElement).getPropertyValue("--app-accent").trim() || "#F2B84B");
const SEED_URL = "https://anubis.world";

const tried = (fx) => Effect.tryPromise({ try: async () => fx(), catch: (e) => e });
const orElse = (fx, fallback) => tried(fx).pipe(Effect.catch(() => Effect.succeed(fallback)));
const siteIcon = (url, name) => gate ? tried(() => letterTilePng(name || "A", accent()))
  : tried(() => fetchSiteIconPng(url)).pipe(Effect.flatMap((png) => png ? Effect.succeed(png) : tried(() => letterTilePng(name || url, accent()))));
const tileFor = (icon, name) => icon ? Effect.succeed(icon) : orElse(() => letterTilePng(name, accent()), icon);
const layersFor = (iconB64) => orElse(() => adaptiveFromTile(iconB64, accent()), {});
const forgeApk = (url, name, icon) => tileFor(icon, name).pipe(
  Effect.flatMap((iconB64) => gate ? Effect.void : layersFor(iconB64).pipe(
    Effect.flatMap((layers) => tried(() => buildApk({ url, name: name.trim(), iconB64, fgB64: layers.fg, bg: layers.bg }))),
    Effect.tap((blob) => Effect.sync(() => downloadBlob(blob, apkFilename(name)))),
  )),
);

export function forge({ S, toast }) {
  const t = useStore(S.t);
  const [url, setUrl] = useState(gate ? SEED_URL : "");
  const [name, setName] = useState(gate ? "Anubis World" : "");
  const [icon, setIcon] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState(null);
  const editedName = useRef(gate);

  useEffect(() => {
    if (!url || editedName.current) return;
    try { setName(siteName(url)); } catch { }
  }, [url]);

  useEffect(() => {
    if (!url) { setIcon(null); return; }
    const fiber = Effect.runFork(siteIcon(url, name).pipe(
      Effect.tap((png) => Effect.sync(() => setIcon(png || null))),
      Effect.catchCause(() => Effect.sync(() => setIcon(null))),
    ));
    return () => fiber.interruptUnsafe();
  }, [gate ? name : url]);

  const valid = /^https?:\/\/.+/i.test(url) && !!name.trim();

  const generate = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr(null); setDone(null);
    await Effect.runPromise(forgeApk(url, name, icon).pipe(
      Effect.tap(() => Effect.sync(() => { setDone(apkFilename(name)); toast?.(T(t, "forgeDone")); })),
      Effect.catchCause(() => Effect.sync(() => setErr(T(t, "forgeErr")))),
      Effect.ensuring(Effect.sync(() => setBusy(false))),
    ));
  };

  return html`<div data-forge-screen data-busy=${busy ? "1" : "0"} data-done=${done ? "1" : "0"} data-valid=${valid ? "1" : "0"} class="flex flex-col gap-[var(--ms-gap)] max-w-md w-full mx-auto">
    ${""}
    <${Panel} data-forge className="shrink-0">
      <div class="flex items-center gap-[var(--ms-gap)]">
        <div class="size-14 rounded-[var(--ms-r-in)] overflow-hidden sf-inset shrink-0 grid place-items-center">
          ${icon
            ? html`<img data-icon src=${`data:image/png;base64,${icon}`} class="size-full object-cover" alt="" />`
            : Icon("lucide:package", "text-2xl text-muted")}
        </div>
        <div class="min-w-0 flex-1">
          <div class="font-semibold truncate">${name || T(t, "forgeNamePlaceholder")}</div>
          <div class="font-mono text-[length:var(--ms-label)] text-muted truncate">${url || T(t, "forgeUrlPlaceholder")}</div>
        </div>
      </div>
    <//>

    ${""}
    <textarea rows="1" data-line inputmode="url" autocapitalize="off" spellcheck="false" value=${url} onInput=${(e) => setUrl(e.target.value)}
      placeholder=${T(t, "forgeUrlPlaceholder")} aria-label=${T(t, "forgeUrlLabel")}
      class="input w-full sf-inset border-0 rounded-[var(--ms-r)] font-mono text-sm shrink-0"></textarea>

    <textarea rows="1" data-line value=${name} onInput=${(e) => { editedName.current = true; setName(e.target.value); }}
      placeholder=${T(t, "forgeNamePlaceholder")} aria-label=${T(t, "forgeNameLabel")}
      class="input w-full sf-inset border-0 rounded-[var(--ms-r)] text-sm shrink-0"></textarea>

    ${""}
    ${done
      ? html`<div data-built class="shrink-0 flex items-start gap-2 rounded-[var(--ms-r)] sf-inset px-[var(--ms-pad)] py-2.5 text-sm leading-snug text-muted">
          ${Icon("lucide:shield-alert", "text-[length:var(--ms-icon)] shrink-0 text-warning")}<span>${T(t, "forgeNote")}</span>
        </div>`
      : null}

    ${""}
    <button data-generate disabled=${!valid || busy} onClick=${generate}
      class="btn btn-primary rounded-full w-full gap-2 shrink-0">
      ${busy
        ? html`<span data-building>${T(t, "forgeGenerating")}</span><span class="af-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>`
        : html`${Icon("lucide:download")}<span>${done ? T(t, "forgeDone") : T(t, "forgeGenerate")}</span>`}
    </button>
    ${err ? html`<div data-err class="text-center text-sm text-error shrink-0">${err}</div>` : null}
  </div>`;
}
