import { html } from "htm/preact";
import { useState } from "preact/hooks";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { shell } from "/_rt/shell.js";
import { Icon, Field } from "./ui.js";

const PORT = 8765;
const PATH = "/audit.json";

export function Audit({ t, toast }) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const ready = shell.has("system.audit");

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const value = await shell.call("system.audit", {});
      await shell.call("server.start", { port: PORT, loopback: true, once: true });
      await shell.call("server.put", {
        path: PATH,
        contentType: "application/json",
        base64: btoa(unescape(encodeURIComponent(JSON.stringify(value)))),
      });
      setReport(value);
      await shell.call("bg.start", { title: T(t, "auditNote") });
    } catch (e) {
      toast?.(e?.code || String(e));
    } finally {
      setBusy(false);
    }
  };

  return html`<div class="flex flex-col gap-[var(--ms-gap)] pt-1">
    <${Panel}>
      <div data-audit class="flex flex-col">
        <${Field} label=${T(t, "auditAccess")} value=${report ? String(report.accessibility.length) : "—"} mono
          tone=${report?.accessibility.length ? "warn" : ""} />
        <${Field} label=${T(t, "auditAdmins")} value=${report ? String(report.admins.length) : "—"} mono
          tone=${report?.admins.length ? "warn" : ""} />
        <${Field} label=${T(t, "auditApps")} value=${report ? String(report.apps.length) : "—"} mono />
        <${Field} label=${T(t, "auditVpn")} value=${report ? T(t, report.vpn ? "auditVpnOn" : "auditVpnOff") : "—"} />
        ${report ? html`<${Field} label=${T(t, "auditReport")} value=${`127.0.0.1:${PORT}${PATH}`} mono wrap />` : null}
        ${ready ? null : html`<${Field} label=${T(t, "srvState")} value=${T(t, "auditNeedsApp")} tone="warn" />`}
      </div>
      <button id="audit-run" class="btn btn-sm btn-primary rounded-full w-full gap-2 mt-3" disabled=${busy || !ready} onClick=${run}>
        ${Icon("lucide:shield-alert")}<span>${T(t, "auditRun")}</span>
      </button>
    <//>
  </div>`;
}
