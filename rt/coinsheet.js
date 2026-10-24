import { html } from "htm/preact";
import { useStore } from "@nanostores/preact";
import { PaySheet } from "@microspec/core/runtime/paysheet.js";
import { T, sys } from "@microspec/core/runtime/i18n.js";
import { bestValue } from "./coins.js";
import { farmMethods, sheetPacks } from "./pay.js";

/**
 * The farm's top-up: the core's pay sheet with the farm's packs and ways to pay (rt/pay.js). `wallet` is the app's
 * makeWallet(); TON appears once the edge offers it to this account. `coinClass` is kept for the callers' signature.
 */
export function CoinSheet({ t, loc, open, onClose, wallet, coinClass: _coinClass }) {
  useStore(wallet.$wallet);   // re-render when the wallet (and its TON offer) changes
  const best = bestValue();
  const packs = sheetPacks().map((p) => (p.id === best ? { ...p, badge: T(t, "bestValue") } : p));
  return html`<${PaySheet} open=${open} onClose=${onClose} locale=${loc} title=${T(t, "topUpTitle")} unit=${sys("payCoins", loc)}
    packs=${packs} best=${best} methods=${farmMethods(wallet, loc)} onPaid=${() => wallet.refresh()} />`;
}
