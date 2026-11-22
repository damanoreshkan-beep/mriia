export const GENCHAR = {
  task: "/task",
  vision: "/feed/vision",
  body: "/feed/character",
  picture: { route: "/feed/image", quality: "fast", aspect: "portrait", ratio: 0.75, k: 2, seeds: 1e9 },
  side: 1024,
  head: { size: 96, crop: 0.45, type: "image/jpeg", quality: 0.85 },
  whyCap: 80,
};
