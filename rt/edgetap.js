// Stories-style slide taps (owner 2026-10-12, mirage: «замінити кнопки тапами по краю, як у сторіз»): a tap in the
// left third goes back, in the right third goes forward, in the middle does the surface's own thing (open, close).
// `x` is the tap's offset inside the surface; a synthetic click (keyboard, element.click()) carries clientX 0, so the
// caller passes null for it and the tap counts as the middle, never as "back".
export const EDGE = 0.3;
export function edgeStep(x, width, edge = EDGE) {
  if (x == null || !(width > 0)) return 0;
  return x < width * edge ? -1 : x > width * (1 - edge) ? 1 : 0;
}
