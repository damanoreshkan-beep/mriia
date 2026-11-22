export const TASK = {
  stream: "/task",
  pace: { base: 1000, cap: 15000 },
  liveEvery: 1000,
  fallbackType: "application/octet-stream",
  tus: {
    client: "https://esm.sh/tus-js-client@4.3.1/lib.esm/browser/index.js",
    chunkSize: 4194304,
    retryDelays: [0, 1000, 3000, 5000, 10000, 15000],
    retryTail: { delay: 15000, count: 200 },
    retryOn: [409, 423, 429],
    retryFrom: 500,
    fingerprint: "ms-up",
    errorCap: 200,
  },
};
