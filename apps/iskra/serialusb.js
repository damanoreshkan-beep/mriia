import { shell } from "/_rt/shell.js";
import { report } from "/_rt/telemetry.js";   

const CH9102 = { vid: 0x1a86, pid: 0x55d4 };
const DATA_IFACE = 1;   

const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));

export const usbSerialAvailable = () => shell.has("usb.serOpen");

export async function makeUsbSerialPort({ vid = CH9102.vid, pid = CH9102.pid } = {}) {
  await shell.call("usb.open", { vid, pid, iface: DATA_IFACE });   
  await shell.call("usb.serOpen", { baud: 115200 });               
  let sigDtr = false, sigRts = false, alive = false;
  let rxTotal = 0, rxSeen = false;   

  const port = {
    getInfo: () => ({ usbVendorId: vid, usbProductId: pid }),

    async open({ baudRate = 115200 } = {}) {
      await shell.call("usb.serParams", { baud: baudRate });
      rxTotal = 0; rxSeen = false;
      alive = true;
      port.readable = new ReadableStream({
        async pull(ctrl) {
          if (!alive) { ctrl.close(); return; }
          try {
            const r = await shell.call("usb.serRead", { length: 64, timeout: 40 });
            const bytes = r?.data ? fromHex(r.data) : new Uint8Array(0);
            if (bytes.length) {
              rxTotal += bytes.length;
              if (!rxSeen) { rxSeen = true; report("usb.rx", { first: bytes.length, hex: r.data.slice(0, 24) }, "info"); }
              ctrl.enqueue(bytes);
            }
          } catch {  }
        },
        cancel() { alive = false; },
      });
      port.writable = new WritableStream({
        async write(chunk) {
          const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
          await shell.call("usb.serWrite", { data: toHex(u8), timeout: 2000 });
        },
      });
    },

    async setSignals({ dataTerminalReady, requestToSend } = {}) {
      if (dataTerminalReady !== undefined) sigDtr = !!dataTerminalReady;
      if (requestToSend !== undefined) sigRts = !!requestToSend;
      report("usb.sig", { dtr: sigDtr, rts: sigRts }, "info");   
      await shell.call("usb.serSignals", { dtr: sigDtr, rts: sigRts });
    },

    async close() {
      alive = false;
      report("usb.totals", { rx: rxTotal, rxSeen }, "info");   
      try { await shell.call("usb.close", {}); } catch {  }
    },
  };
  return port;
}
