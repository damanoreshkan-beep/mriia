export const EDGE = 0.3;
export function edgeStep(x, width, edge = EDGE) {
  if (x == null || !(width > 0)) return 0;
  return x < width * edge ? -1 : x > width * (1 - edge) ? 1 : 0;
}
