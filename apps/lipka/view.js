import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { Island, Stage } from "/_rt/ui.js";
import { downloadUrl } from "/_rt/apk.js";
import { Chooser, Camera } from "/_rt/intake.js";
import * as M from "./state.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const mb = (n, loc) => `${(n / 1048576).toLocaleString(loc, { maximumFractionDigits: 1 })} ${loc === "uk" ? "МБ" : "MB"}`;
const tool = "btn btn-ghost btn-sm btn-circle text-base-content/70";
const CSS = `.lp-scan{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--app-accent),transparent);box-shadow:0 0 18px 4px color-mix(in oklch,var(--app-accent) 55%,transparent);animation:lpScan 2.6s ease-in-out infinite}
@keyframes lpScan{0%{top:2%}50%{top:98%}100%{top:2%}}
@media (prefers-reduced-motion:reduce){.lp-scan{animation:none}}`;

// The owner, 2026-10-17: «не треба three js, просто скачати файл», «максимально просто» — the photo is the
// whole stage, and the one thing the app hands over is the .glb.
export function lipka({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const st = useStore(M.$st);
  const working = st.phase === "working", done = st.phase === "done" && !!st.out;
  const ctx = { t, loc };
  const [, tick] = useState(0);
  useEffect(() => { if (!working) return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [working]);
  const elapsed = st.t0 ? Math.round((Date.now() - st.t0) / 1000) : 0;

  const save = async () => { if (!st.out) return; try { await downloadUrl(st.out.url, `lipka-${Date.now()}.glb`); toast?.(T(t, "saved")); } catch { toast?.(T(t, "eNetwork")); } };

  const stage = () => {
    if (st.phase === "empty") return html`<${Chooser} loc=${loc} onPick=${M.setSource} onCamera=${() => M.patch({ phase: "camera" })} />`;
    if (st.phase === "camera") return html`<${Camera} loc=${loc} reason=${T(t, "primeReason")} privacy=${T(t, "primePrivacy")} onSettings=${() => S.screen.set("perms")} onCapture=${M.setSource} onClose=${() => M.patch({ phase: "empty" })} />`;
    return html`<div class="absolute inset-0 flex items-center justify-center p-[var(--ms-gap)] pb-6">
      <div class="relative max-w-full max-h-full">
        <img data-photo src=${st.src} alt="" class=${`max-w-full max-h-full rounded-[var(--ms-r)] object-contain sf-raised ${working ? "opacity-70" : ""} transition-opacity duration-[var(--t-state)] ease-[var(--ease-out)]`} />
        ${working ? html`<${Fragment}>
          <div aria-hidden="true" class="absolute inset-0 rounded-[var(--ms-r)] overflow-hidden pointer-events-none"><div class=${gate ? "" : "lp-scan"}></div></div>
          <div data-working class="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none text-white">
            <div class="rounded-full bg-black/55 px-4 py-2"><span class="font-mono text-[0.72rem] uppercase tracking-[0.18em] tabular-nums">${T(t, M.liveOf(st.live))} · ${fmt(elapsed)}</span></div>
          </div>
        </${Fragment}>` : null}
        ${done ? html`<div data-ready class="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none ms-reveal">
          <div class="rounded-full bg-black/60 px-4 py-2 flex items-center gap-2 text-white">${Icon("lucide:box", "text-base text-[var(--app-accent)]")}<span class="font-mono text-[0.72rem] uppercase tracking-[0.18em] tabular-nums">${T(t, "ready")} · ${mb(st.out.bytes, loc)}</span></div>
        </div>` : null}
      </div>
    </div>`;
  };

  const primary = "btn btn-primary rounded-full gap-2 px-5 shrink-0 ms-press";
  return html`<${Fragment}>
    <style>${CSS}</style>
    <div class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)] ms-side">
      <${Stage}>${stage()}<//>
      <div class="ms-side-main shrink-0 flex flex-col justify-center">
      <${Island} className="w-full max-w-xl mx-auto flex flex-col gap-[var(--ms-gap)]">
        <div class="flex items-center gap-1.5 min-w-0">
          ${st.src ? html`<button data-new aria-label=${T(t, "newPhoto")} title=${T(t, "newPhoto")} class=${`${tool} ms-press`} disabled=${working} onClick=${M.clearSource}>${Icon("lucide:image-plus", "text-lg")}</button>` : null}
          <div class="flex-1"></div>
          ${done
            ? html`<button data-save class=${primary} onClick=${save}>${Icon("lucide:download", "text-xl")}<span>${T(t, "download")}</span></button>`
            : html`<button data-go aria-busy=${working ? "true" : null} class=${primary} disabled=${!st.src || st.phase === "camera" || working} onClick=${() => M.sculpt(ctx)}>${Icon("lucide:box", "text-xl")}<span>${working ? T(t, "working") : T(t, "go")}</span></button>`}
        </div>
        ${st.error ? html`<p data-error role="alert" class="text-sm text-error px-1">${T(t, st.error)}</p>` : null}
      <//>
      </div>
    </div>
  </${Fragment}>`;
}
