export const CONFIG = {
  sampleRate: 2_000_000,
  basebandFilter: 1_750_000,
  txOffset: 250_000,
  maxTransfer: 262144,
  maxBytes: 32_000_000,
  rx: { amp: false, lnaGain: 24, vgaGain: 30, idleMode: 0, frameGapUs: 3000 },
  tx: { amp: false, vgaGain: 30, repeats: 8, gapUs: 15_000, tailMs: 200 },
};
