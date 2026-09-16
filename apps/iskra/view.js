import { html } from "htm/preact";
import { useState, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const FW_URL = VPS_PROXY + "/m5fw";   
const ESPTOOL = "https://esm.sh/esptool-js@0.6.1";
const CH_VENDOR = 0x1a86;   
const FLASH_ADDR = 0x0;     
const BAUD = 115200;

const R = 54, C = 2 * Math.PI * R;   
const supported = () => typeof navigator !== "undefined" && "serial" in navigator;

export function iskra({ S, toast }) {
  const t = useStore(S.t);
  const [phase, setPhase] = useState("idle");
  const [pct, setPct] = useState(0);
  const [chip, setChip] = useState(null);
  const [msg, setMsg] = useState(null);   
  const busyRef = useRef(false);

  const flash = async () => {
    if (busyRef.current || !supported()) return;
    busyRef.current = true;
    setPhase("flashing"); setPct(0); setChip(null); setMsg(T(t, "connecting"));
    let transport;
    try {
      const { ESPLoader, Transport } = await import(ESPTOOL);
      const port = await navigator.serial.requestPort({ filters: [{ usbVendorId: CH_VENDOR }] });
      transport = new Transport(port, true);
      const term = { clean() {}, writeLine: (d) => setMsg(d), write() {} };
      const esploader = new ESPLoader({ transport, baudrate: BAUD, terminal: term });
      const name = await esploader.main();
      setChip(name); setMsg(null);
      const bytes = new Uint8Array(await (await fetch(FW_URL)).arrayBuffer());   
      await esploader.writeFlash({
        fileArray: [{ data: bytes, address: FLASH_ADDR }],
        flashSize: "keep", flashMode: "keep", flashFreq: "keep",
        eraseAll: false, compress: true,
        reportProgress: (_i, written, total) => setPct(total ? written / total : 0),
      });
      await esploader.after();   
      setPct(1); setPhase("done"); toast?.(T(t, "toastDone"));
    } catch (e) {
      if (e && (e.name === "NotFoundError" || e.name === "AbortError")) { setPhase("idle"); setMsg(null); }
      else { setMsg(String(e?.message || e)); setPhase("error"); }
    } finally {
      try { await transport?.disconnect(); } catch {  }
      busyRef.current = false;
    }
  };

  if (!gate && !supported()) {
    return html`<div class="isk-stage">
      <div data-dev data-phase="unsupported" class="isk-dev">
        <div class="isk-core">${Icon("lucide:monitor-x", "isk-glyph")}</div>
      </div>
      <div class="isk-card">
        <div class="isk-msg">${T(t, "unsupportedTitle")}</div>
        <div class="isk-hint">${T(t, "unsupportedHint")}</div>
      </div>
    </div>`;
  }

  const busy = phase === "flashing", done = phase === "done", err = phase === "error";
  const devCls = `isk-dev ${busy ? "is-busy" : done ? "is-done" : err ? "is-err" : ""}`.trim();
  const showPct = busy;   
  const glyph = done ? "lucide:check" : err ? "lucide:zap-off" : "lucide:zap";
  const btnLabel = busy ? T(t, "flashing", { p: Math.round(pct * 100) })
    : done ? T(t, "flashAgain") : err ? T(t, "retry") : T(t, "flash");
  const btnIcon = done ? "lucide:check" : err ? "lucide:rotate-ccw" : "lucide:zap";
  const phaseLine = busy ? (chip ? T(t, "chipLine", { chip }) : T(t, "connecting"))
    : done ? T(t, "doneTitle") : err ? T(t, "errorTitle") : "";
  const hintLine = idleHint(t, phase);

  return html`<div class="isk-stage">
    <div data-dev data-phase=${phase} class=${devCls}>
      <svg class="isk-ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="isk-track" cx="60" cy="60" r=${R}></circle>
        <circle class="isk-fill" cx="60" cy="60" r=${R}
          style=${`stroke-dasharray:${C};stroke-dashoffset:${C * (1 - (done ? 1 : pct))}`}></circle>
      </svg>
      <div class="isk-core">
        ${showPct
          ? html`<div class="isk-pct">${Math.round(pct * 100)}<span>%</span></div>`
          : Icon(glyph, "isk-glyph")}
      </div>
    </div>

    <div class="isk-status">
      ${phaseLine ? html`<div class=${`isk-phase ${err ? "isk-bad" : ""}`.trim()}>${phaseLine}</div>` : null}
      ${hintLine ? html`<div class="isk-hint">${hintLine}</div>` : null}
      ${msg && (busy || err) ? html`<div class=${`isk-chip ${err ? "isk-bad" : ""}`.trim()}>${msg}</div>` : null}
    </div>

    <div class="isk-actions">
      <button id="flash-btn" disabled=${busy} onClick=${flash} class="btn btn-primary rounded-2xl isk-go">
        ${Icon(btnIcon, "")}${btnLabel}
      </button>
      <div class="isk-dev-name">${T(t, "deviceName")} · ${T(t, "firmwareName")}</div>
    </div>
  </div>`;
}

function idleHint(t, phase) {
  if (phase === "idle") return T(t, "hint");
  if (phase === "done") return T(t, "doneHint");
  if (phase === "error") return T(t, "errorHint");
  return "";
}
