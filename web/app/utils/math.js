export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function isFiniteNumber(n) {
  return Number.isFinite(n);
}

export const lerp = (a, b, t) => a + (b - a) * t;

export function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : (v | 0);
}

export const deg2rad = (d) => d * Math.PI / 180;
export const rad2deg = (r) => r * 180 / Math.PI;

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}
