
const CH9102 = { vid: 0x1a86, pid: 0x55d4 };
const EP_NUM = 2;          
const CTRL_IFACE = 0;      
const DATA_IFACE = 1;      

export const usbSerialAvailable = () => typeof navigator !== "undefined" && !!navigator.usb;

export async function makeUsbSerialPort({ vid = CH9102.vid, pid = CH9102.pid } = {}) {
  const dev = await navigator.usb.requestDevice({ filters: [{ vendorId: vid, productId: pid }, { vendorId: vid }] });

  async function setLineCoding(baud) {
    const d = new Uint8Array(7);
    new DataView(d.buffer).setUint32(0, baud >>> 0, true);
    d[6] = 8;
    await dev.controlTransferOut({ requestType: "class", recipient: "interface", request: 0x20, value: 0, index: CTRL_IFACE }, d);
  }
  async function setControlLineState(dtr, rts) {
    const w = (dtr ? 1 : 0) | (rts ? 2 : 0);
    await dev.controlTransferOut({ requestType: "class", recipient: "interface", request: 0x22, value: w, index: CTRL_IFACE });
  }

  let alive = false;
  const port = {
    getInfo: () => ({ usbVendorId: vid, usbProductId: pid }),

    async open({ baudRate = 115200 } = {}) {
      if (!dev.opened) await dev.open();
      if (!dev.configuration) await dev.selectConfiguration(1);
      for (const i of [CTRL_IFACE, DATA_IFACE]) { try { await dev.claimInterface(i); } catch {  } }
      await setLineCoding(baudRate);
      alive = true;

      port.readable = new ReadableStream({
        async pull(ctrl) {
          if (!alive) { ctrl.close(); return; }
          try {
            const r = await dev.transferIn(EP_NUM, 64);
            if (r.data && r.data.byteLength) ctrl.enqueue(new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength));
          } catch {  }
        },
        cancel() { alive = false; },
      });
      port.writable = new WritableStream({
        async write(chunk) { await dev.transferOut(EP_NUM, chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)); },
      });
    },

    async setSignals({ dataTerminalReady, requestToSend } = {}) {
      await setControlLineState(!!dataTerminalReady, !!requestToSend);
    },

    async close() {
      alive = false;
      try { await dev.close(); } catch {  }
    },
  };
  return port;
}
