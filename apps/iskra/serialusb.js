import { shell } from "/_rt/shell.js";

const CH9102 = { vid: 0x1a86, pid: 0x55d4 };
const DATA_IFACE = 1, CTRL_IFACE = 0;
const EP_OUT = 0x02, EP_IN = 0x82;

const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));

export const usbSerialAvailable = () => shell.has("usb.open") && shell.has("usb.bulk") && shell.has("usb.control");

export async function makeUsbSerialPort({ vid = CH9102.vid, pid = CH9102.pid } = {}) {
  const r = await shell.call("usb.open", { vid, pid, iface: DATA_IFACE });
  if (!r?.opened) throw new Error("usb.open failed");
  let alive = false;
  let sigDtr = false, sigRts = false;

  async function setLineCoding(baud) {
    const d = new Uint8Array(7);                 
    new DataView(d.buffer).setUint32(0, baud >>> 0, true); d[6] = 8;
    await shell.call("usb.control", { reqType: 0x21, request: 0x20, value: 0, index: CTRL_IFACE, length: 7, data: toHex(d) });
  }
  async function setControlLineState(dtr, rts) {
    const w = (dtr ? 1 : 0) | (rts ? 2 : 0);     
    await shell.call("usb.control", { reqType: 0x21, request: 0x22, value: w, index: CTRL_IFACE, length: 0, data: "" });
  }

  const port = {
    getInfo: () => ({ usbVendorId: vid, usbProductId: pid }),

    async open({ baudRate = 115200 } = {}) {
      await setLineCoding(baudRate);
      alive = true;
      port.readable = new ReadableStream({
        async pull(ctrl) {
          if (!alive) { ctrl.close(); return; }
          try {
            const rr = await shell.call("usb.bulk", { ep: EP_IN, length: 64, timeout: 200 });
            const bytes = rr?.data ? fromHex(rr.data) : new Uint8Array(0);
            if (bytes.length) ctrl.enqueue(bytes);
          } catch {  }
        },
        cancel() { alive = false; },
      });
      port.writable = new WritableStream({
        async write(chunk) {
          const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
          await shell.call("usb.bulk", { ep: EP_OUT, data: toHex(u8), timeout: 2000 });
        },
      });
    },

    async setSignals({ dataTerminalReady, requestToSend } = {}) {
      if (dataTerminalReady !== undefined) sigDtr = !!dataTerminalReady;
      if (requestToSend !== undefined) sigRts = !!requestToSend;
      await setControlLineState(sigDtr, sigRts);
    },

    async close() {
      alive = false;
      try { await shell.call("usb.close", {}); } catch {  }
    },
  };
  return port;
}
