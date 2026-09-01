export const PRESETS = [
  { id: "still", hue: 205,
    subject: "a vast empty shoreline at the blue hour, one small distant figure facing the water",
    night: "fog over black water, the horizon dissolving, moonless, only the faint glow of the sky on the wet sand",
    day: "morning haze, pale sand, a thin white sun through mist, the sea almost the colour of the sky" },
  { id: "threshold", hue: 35,
    subject: "an old doorway opening from darkness onto light, a worn stone step, a long corridor beyond",
    night: "a single lamp lit in the far room, deep shadows, the doorframe edged with warm light",
    day: "sunlight pouring through the open door onto a dusty floor, motes drifting in the beam" },
  { id: "memory", hue: 40,
    subject: "an empty room of a house where someone lived long ago, a window, a chair, a folded curtain",
    night: "moonlight through lace, dust in a thin beam, faded warm tones like an old photograph",
    day: "afternoon light on a wooden floor, film grain, soft washed colours, the curtain moving" },
  { id: "depth", hue: 190,
    subject: "deep water seen from inside, shafts of light from far above, a slow drifting shape",
    night: "bioluminescent plankton in black water, a single jellyfish glowing, abyssal, silent",
    day: "sunlit turquoise water, light caustics on white sand, bubbles rising toward the surface" },
  { id: "time", hue: 95,
    subject: "ancient ruins reclaimed by a forest, roots over carved stone, a path through moss",
    night: "starlight, a long-exposure sky with star trails above the ruins, cold blue, utterly still",
    day: "golden hour, shafts of sun through leaves, warm stone, a gentle wind in the tall grass" },
  { id: "glow", hue: 42,
    subject: "a lone tree drawn only with thin glowing light filaments and luminous nodes, a hollow wireframe plexus of bright threads and points of light, translucent, nothing solid",
    night: "floating alone in an empty pure black void, no floor, warm amber gold light with clearly visible electric cyan accents, volumetric bloom",
    day: "gilded golden threads on pure white paper, a few teal sparks, delicate fine linework, soft warm glow" },
];
export const LINES = 3;

export const SYSTEM = {
  base: "a full-bleed wallpaper photograph, cinematic, extremely detailed, the subject off-centre with generous empty space around it, no text, no letters, no watermark, no logo, no frame, no border",
  dark: "night, deep darkness, low-key lighting, one source of light, luminous details, black shadows",
  light: "daylight, high-key, airy, bright and soft, pale tones, gentle haze",
};

export const TINTS = {
  still: "hushed and calm, vast negative space, muted tones",
  threshold: "intimate, a quiet contrast of warm light and darkness",
  memory: "nostalgic, faded, soft, like an old photograph",
  depth: "deep, submerged, weightless, silent",
  time: "ancient, patient, overgrown, still",
  glow: "drawn with thin glowing light filaments and luminous nodes, translucent, volumetric bloom",
};

export const presetOf = (id) => PRESETS.find((p) => p.id === id) || PRESETS[0];

/**
 * The whole prompt for one race. `subject` is the scene in English;
 * "70% на 30%, де текст юзера сильніший" — the full scene block buried under the preset's fog).
 * Kept under the edge's 800-character slice.
 */
export function composePrompt(subject, preset, mode, userDriven = false) {
  const m = mode === "light" ? "light" : "dark";
  const style = userDriven ? (TINTS[preset.id] || "") : preset[m === "light" ? "day" : "night"];
  return [subject?.trim() || preset.subject, style, SYSTEM[m], SYSTEM.base].filter(Boolean).join(", ").slice(0, 800);
}

export const mockFrame = (seed, hue, mode) => {
  const l = mode === "light" ? [88, 74, 58] : [34, 18, 6];
  const s = (seed * 2654435761) % 40;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 160"><defs><radialGradient id="g" cx=".${3 + (s % 4)}" cy=".3" r=".9">` +
    `<stop offset="0" stop-color="hsl(${(hue + s) % 360} 55% ${l[0]}%)"/><stop offset=".5" stop-color="hsl(${(hue + 30) % 360} 45% ${l[1]}%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 200) % 360} 40% ${l[2]}%)"/></radialGradient></defs><rect width="90" height="160" fill="url(#g)"/></svg>`)}`;
};
