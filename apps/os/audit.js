import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { shell } from "/_rt/shell.js";
import { Icon, Field } from "./ui.js";

const PORT = 8765;

export function Audit({ t, toast }) {
  const [srv, setSrv] = useState(null);
  const [set, setSet] = useState(null);
  const [report, setReport] = useState(null);
  const [bright, setBright] = useState(50);
  const [vol, setVol] = useState(50);
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState(null);
  const ready = shell.has("server.start") && shell.has("control.settings");
  const live = !!srv?.running;

  const refresh = async () => {
    try { setSrv(await shell.call("server.status", {})); } catch { setSrv(null); }
    if (shell.has("control.settings")) {
      try { const s = await shell.call("control.settings", {}); setSet(s); setBright(s.brightness ?? 50); } catch { }
    }
    if (shell.has("control.overlay")) {
      try { setOverlay((await shell.call("control.overlay", {})).granted); } catch { }
    }
  };
  useEffect(() => {
    refresh();
    const back = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, []);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await shell.call("server.start", { port: PORT, loopback: true, mcp: true });
      await shell.call("bg.start", { title: T(t, "bridgeNote") });
      await refresh();
      try { setReport(await shell.call("system.audit", {})); } catch { }
    } catch (e) { toast?.(e?.code || String(e)); } finally { setBusy(false); }
  };

  const stop = async () => {
    setBusy(true);
    try { await shell.call("server.stop", {}); await refresh(); } catch (e) { toast?.(e?.code || String(e)); } finally { setBusy(false); }
  };

  const copyToken = async () => {
    try { await shell.call("control.clip", { text: srv.token }); toast?.(T(t, "bridgeCopied")); } catch (e) { toast?.(String(e?.code || e)); }
  };
  const askOverlay = async () => { try { await shell.call("control.overlay", { ask: true }); } catch (e) { toast?.(String(e?.code || e)); } };

  const setBrightness = async (v) => {
    setBright(v);
    try { await shell.call("control.brightness", { percent: v }); } catch (e) { toast?.(e?.code === "needsSettings" ? T(t, "bridgeGrant") : String(e?.code || e)); }
  };
  const setVolume = async (v) => { setVol(v); try { await shell.call("control.volume", { stream: "music", percent: v }); } catch (e) { toast?.(String(e?.code || e)); } };
  const torch = async (on) => { try { await shell.call("control.torch", { on }); } catch (e) { toast?.(String(e?.code || e)); } };

  return html`<div class="flex flex-col gap-[var(--ms-gap)] pt-1">
    <${Panel} title=${T(t, "bridgeTitle")}>
      <div data-audit class="flex flex-col">
        <${Field} label=${T(t, "bridgeState")} value=${live ? T(t, "bridgeOn") : T(t, "bridgeOff")} tone=${live ? "ok" : ""} />
        ${live ? html`<${Field} label=${T(t, "bridgeUrl")} value=${`127.0.0.1:${PORT}/mcp`} mono wrap />` : null}
        ${live && srv?.token ? html`<${Field} label=${T(t, "bridgeToken")} value=${srv.token} mono wrap />` : null}
        ${overlay === null ? null : html`<${Field} label=${T(t, "bridgeOverlay")} value=${T(t, overlay ? "bridgeOverlayOn" : "bridgeOverlayOff")} tone=${overlay ? "ok" : "warn"} />`}
        ${ready ? null : html`<${Field} label=${T(t, "bridgeState")} value=${T(t, "bridgeNeedsApp")} tone="warn" />`}
      </div>
      <button id="bridge-toggle" class=${`btn btn-sm rounded-full w-full gap-2 mt-3 ${live ? "" : "btn-primary"}`}
          disabled=${busy || !ready} onClick=${live ? stop : start}>
        ${Icon(live ? "lucide:plug-zap" : "lucide:plug")}<span>${T(t, live ? "bridgeStop" : "bridgeStart")}</span>
      </button>
      ${live && srv?.token ? html`<button id="bridge-copy" class="btn btn-sm rounded-full w-full gap-2 mt-2" onClick=${copyToken}>
        ${Icon("lucide:copy")}<span>${T(t, "bridgeCopy")}</span>
      </button>` : null}
      ${overlay === false ? html`<button id="bridge-overlay" class="btn btn-sm rounded-full w-full gap-2 mt-2" onClick=${askOverlay}>
        ${Icon("lucide:app-window")}<span>${T(t, "bridgeOverlayAsk")}</span>
      </button>` : null}
    <//>

    <${Panel} title=${T(t, "ctrlTitle")}>
      <label class="flex flex-col gap-1.5 py-2">
        <span class="text-xs uppercase tracking-wider text-muted">${T(t, "ctrlBrightness")} · ${bright}%</span>
        <input type="range" min="0" max="100" value=${bright} disabled=${!shell.has("control.brightness")}
          onChange=${(e) => setBrightness(Number(e.target.value))} class="range range-primary range-sm" />
      </label>
      <label class="flex flex-col gap-1.5 py-2">
        <span class="text-xs uppercase tracking-wider text-muted">${T(t, "ctrlVolume")} · ${vol}%</span>
        <input type="range" min="0" max="100" value=${vol} disabled=${!shell.has("control.volume")}
          onChange=${(e) => setVolume(Number(e.target.value))} class="range range-primary range-sm" />
      </label>
      <div class="flex gap-2 pt-1">
        <button class="btn btn-sm rounded-full flex-1 gap-2" disabled=${!shell.has("control.torch")} onClick=${() => torch(true)}>
          ${Icon("lucide:flashlight")}<span>${T(t, "ctrlTorchOn")}</span>
        </button>
        <button class="btn btn-sm rounded-full flex-1 gap-2" disabled=${!shell.has("control.torch")} onClick=${() => torch(false)}>
          ${Icon("lucide:flashlight-off")}<span>${T(t, "ctrlTorchOff")}</span>
        </button>
      </div>
    <//>

    <${Panel} title=${T(t, "auditTitle")}>
      <div class="flex flex-col">
        <${Field} label=${T(t, "auditAccess")} value=${report ? String(report.accessibility.length) : "—"} mono tone=${report?.accessibility.length ? "warn" : ""} />
        <${Field} label=${T(t, "auditAdmins")} value=${report ? String(report.admins.length) : "—"} mono tone=${report?.admins.length ? "warn" : ""} />
        <${Field} label=${T(t, "auditApps")} value=${report ? String(report.apps.length) : "—"} mono />
        <${Field} label=${T(t, "auditVpn")} value=${report ? T(t, report.vpn ? "auditVpnOn" : "auditVpnOff") : "—"} />
      </div>
    <//>
  </div>`;
}
