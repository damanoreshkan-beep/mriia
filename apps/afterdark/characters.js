export const CHARACTERS = [
  { id: "kaya",       name: "Kaya",       tint: "#FF3EB5" },
  { id: "michelle",   name: "Michelle",   tint: "#39FF6A" },
  { id: "arissa",     name: "Arissa",     tint: "#F5B942" },
  { id: "eve",        name: "Eve",        tint: "#7C5CFF" },
  { id: "sophie",     name: "Sophie",     tint: "#22D3EE" },
  { id: "nightshade", name: "Nightshade", tint: "#FF6AD5" },
  { id: "louise",     name: "Louise",     tint: "#4ADE80" },
  { id: "kachujin",   name: "Kachujin",   tint: "#FB7185" },
  { id: "jolleen",    name: "Jolleen",    tint: "#FBBF24" },
  { id: "pirate",     name: "Pirate",     tint: "#38BDF8" },
  { id: "akai",       name: "Akai",       tint: "#F472B6" },
];

export const charIndex = (id) => { const i = CHARACTERS.findIndex((g) => g.id === id); return i < 0 ? 0 : i; };
export const charById = (id) => CHARACTERS[charIndex(id)];
export const glbUrl = (id) => new URL(`assets/${id}.glb`, import.meta.url).href;
export const avatarUrl = (id) => new URL(`assets/av-${id}.png`, import.meta.url).href;   

export function trioFor(id) {
  const n = CHARACTERS.length, i = charIndex(id);
  return [CHARACTERS[(i - 1 + n) % n].id, CHARACTERS[i].id, CHARACTERS[(i + 1) % n].id];
}
