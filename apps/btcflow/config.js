export const CONFIG = {
  priceUrl: "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",
  pricePollMs: 60000,
  socket: "wss://ws.blockchain.info/inv",
  subscribe: { op: "unconfirmed_sub" },
  reconnectMs: 2000,
};
