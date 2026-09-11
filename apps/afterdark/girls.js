export const GIRLS = [
  { id: "kaya",       name: "Kaya",       danceKey: "dNorthern", tint: "#FF3EB5" },
  { id: "michelle",   name: "Michelle",   danceKey: "dHouse",    tint: "#39FF6A" },
  { id: "arissa",     name: "Arissa",     danceKey: "dSnake",    tint: "#F5B942" },
  { id: "eve",        name: "Eve",        danceKey: "dShuffle",  tint: "#7C5CFF" },
  { id: "sophie",     name: "Sophie",     danceKey: "dRobot",    tint: "#22D3EE" },
  { id: "nightshade", name: "Nightshade", danceKey: "dTwist",    tint: "#FF6AD5" },
  { id: "louise",     name: "Louise",     danceKey: "dWave",     tint: "#4ADE80" },
  { id: "kachujin",   name: "Kachujin",   danceKey: "dSalsa",    tint: "#FB7185" },
  { id: "jolleen",    name: "Jolleen",    danceKey: "dBboy",     tint: "#FBBF24" },
  { id: "pirate",     name: "Pirate",     danceKey: "dHiphop",   tint: "#38BDF8" },
  { id: "akai",       name: "Akai",       danceKey: "dArms",     tint: "#F472B6" },
];

export const girlIndex = (id) => { const i = GIRLS.findIndex((g) => g.id === id); return i < 0 ? 0 : i; };
export const girlById = (id) => GIRLS[girlIndex(id)];
export const glbUrl = (id) => new URL(`assets/${id}.glb`, import.meta.url).href;

export function trioFor(id) {
  const n = GIRLS.length, i = girlIndex(id);
  return [GIRLS[(i - 1 + n) % n].id, GIRLS[i].id, GIRLS[(i + 1) % n].id];
}
