export const CONFIG = {
  task: "/task",
  maxImage: 9_000_000,
  base: { make: "/image", edit: "/image/edit", blend: "/image/blend", style: "/image/style" },
  route: { make: "/feed/image", edit: "/feed/image/edit", blend: "/feed/image/blend", style: "/feed/image/style" },
  vision: { route: "/feed/vision", maxTokens: 400, codes: { 429: "eRate", 413: "eBig", 502: "eReadBusy" }, refused: "eRead", offline: "eNetwork" },
  upscale: { route: "/feed/image/upscale", base: "/image/upscale", quality: "hd" },
};
