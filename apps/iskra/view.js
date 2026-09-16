import { html } from "htm/preact";
import { useState, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { usbSerialAvailable, makeUsbSerialPort } from "./serialusb.js";
import { buildApk, apkFilename, downloadBlob } from "/_rt/apk.js";
import { report } from "/_rt/telemetry.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const FW_URL = VPS_PROXY + "/m5fw";   
const ESPTOOL = "https://esm.sh/esptool-js@0.6.1";
const CH_VENDOR = 0x1a86;   
const FLASH_ADDR = 0x0;     
const BAUD = 115200;

const R = 54, C = 2 * Math.PI * R;   
const inApk = () => usbSerialAvailable();

export function iskra({ S, toast }) {
  const t = useStore(S.t);
  const [phase, setPhase] = useState("idle");
  const [pct, setPct] = useState(0);
  const [chip, setChip] = useState(null);
  const [msg, setMsg] = useState(null);   
  const busyRef = useRef(false);
  const [apkBusy, setApkBusy] = useState(false);   

  const flash = async () => {
    if (busyRef.current || !inApk()) return;
    busyRef.current = true;
    setPhase("flashing"); setPct(0); setChip(null); setMsg(T(t, "connecting"));
    report("flash.start", { via: "shellusb" }, "info");
    let transport;
    try {
      const { ESPLoader, Transport } = await import(ESPTOOL);
      const term = { clean() {}, writeLine: (d) => { setMsg(d); report("flash.esptool", { line: String(d).slice(0, 120) }, "info"); }, write() {} };
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const mkReset = (dsl) => (tr) => ({
        async reset() {
          for (const cmd of dsl.split("|")) {
            const k = cmd[0], v = cmd.slice(1);
            if (k === "W") await sleep(Number(v));
            else if (k === "D") await tr.setDTR(v === "1");
            else if (k === "R") await tr.setRTS(v === "1");
          }
        },
      });
      const DSLS = [
        "D0|R1|W100|D1|R0",            
        "D0|R1|W100|D1|R0|W50|D0",     
        "R0|D1|W100|R1|D0",            
        "D1|R0|W100|D0|R1",            
      ];
      let esploader = null, name = null;
      for (let i = 0; i < DSLS.length; i++) {
        try { await transport?.disconnect(); } catch {  }
        const port = await makeUsbSerialPort({ vid: CH_VENDOR });   
        transport = new Transport(port, true);
        report("reset.try", { i }, "info");
        setMsg(T(t, "connecting"));
        const el = new ESPLoader({ transport, baudrate: BAUD, terminal: term, resetConstructors: { classicReset: mkReset(DSLS[i]) } });
        try { name = await el.main(); esploader = el; report("reset.hit", { i }, "info"); break; }
        catch (e) { report("reset.miss", { i, msg: String(e?.message || e).slice(0, 40) }, "info"); }
      }
      if (!esploader) throw new Error("Failed to connect with the device");
      report("flash.port", { via: "shellusb" }, "info");
      report("flash.sync", { chip: name }, "info");
      setChip(name); setMsg(null);
      const bytes = new Uint8Array(await (await fetch(FW_URL)).arrayBuffer());   
      report("flash.fw", { bytes: bytes.length }, "info");
      await esploader.writeFlash({
        fileArray: [{ data: bytes, address: FLASH_ADDR }],
        flashSize: "keep", flashMode: "keep", flashFreq: "keep",
        eraseAll: false, compress: true,
        reportProgress: (_i, written, total) => setPct(total ? written / total : 0),
      });
      await esploader.after();   
      report("flash.done", {}, "info");
      setPct(1); setPhase("done"); toast?.(T(t, "toastDone"));
    } catch (e) {
      if (e && (e.name === "NotFoundError" || e.name === "AbortError")) { setPhase("idle"); setMsg(null); report("flash.cancel", {}, "info"); }
      else { setMsg(String(e?.message || e)); setPhase("error"); report("flash.error", { name: e?.name || "", msg: String(e?.message || e).slice(0, 160) }); }
    } finally {
      try { await transport?.disconnect(); } catch {  }
      busyRef.current = false;
    }
  };

  const getApk = async () => {
    if (apkBusy) return;
    setApkBusy(true);
    try {
      const name = T(t, "title");
      const blob = await buildApk({ url: location.href.split("#")[0].split("?")[0], name });
      downloadBlob(blob, apkFilename(name));
    } catch (e) { toast?.(String(e?.message || e)); }
    finally { setApkBusy(false); }
  };

  if (!gate && !inApk()) {
    return html`<div class="isk-stage">
      <div data-dev data-phase="browser" class="isk-dev">
        <div class="isk-core">${Icon("lucide:smartphone", "isk-glyph")}</div>
      </div>
      <div class="isk-card">
        <div class="isk-msg">${T(t, "unsupportedTitle")}</div>
        <div class="isk-hint">${T(t, "unsupportedHint")}</div>
        <button id="apk-btn" disabled=${apkBusy} onClick=${getApk} class="btn btn-primary rounded-2xl isk-go">
          ${Icon("lucide:download", "")}${apkBusy ? T(t, "apkBuilding") : T(t, "getApk")}
        </button>
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
