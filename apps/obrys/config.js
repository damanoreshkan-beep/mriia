export const CONFIG = {
  download: { maxPct: 99, codes: { 404: "eGone" }, refused: "eNetwork", offline: "eNetwork", blocked: { url: "eCors" }, unread: "eRead" },
  ar: {
    mode: "immersive-ar",
    sessions: [{ features: ["hit-test", "dom-overlay"], overlay: true }, { features: ["hit-test"], overlay: false }],
    fallbackOn: "NotSupportedError",
    whyChars: 80,
  },
};
