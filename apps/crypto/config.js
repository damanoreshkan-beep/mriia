export const CONFIG = {
  socket: "wss://stream.binance.com:9443/stream?streams=",
  reconnectMs: 2000,
  pairs: [
    ["BTCUSDT", "BTC", "Bitcoin", 62000], ["ETHUSDT", "ETH", "Ethereum", 1770], ["SOLUSDT", "SOL", "Solana", 76],
    ["XRPUSDT", "XRP", "XRP", 1.08], ["BNBUSDT", "BNB", "BNB", 560], ["DOGEUSDT", "DOGE", "Dogecoin", 0.07],
    ["ADAUSDT", "ADA", "Cardano", 0.35], ["AVAXUSDT", "AVAX", "Avalanche", 22], ["LINKUSDT", "LINK", "Chainlink", 11],
    ["DOTUSDT", "DOT", "Polkadot", 4], ["TRXUSDT", "TRX", "TRON", 0.24], ["LTCUSDT", "LTC", "Litecoin", 65],
    ["TONUSDT", "TON", "Toncoin", 3.2], ["NEARUSDT", "NEAR", "NEAR", 2.5], ["ATOMUSDT", "ATOM", "Cosmos", 4.2],
    ["UNIUSDT", "UNI", "Uniswap", 7], ["XLMUSDT", "XLM", "Stellar", 0.1], ["ARBUSDT", "ARB", "Arbitrum", 0.35],
  ],
};
