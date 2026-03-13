export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : (v | 0);
}

export function isFiniteNumber(n) {
  return Number.isFinite(n);
}

export function deg2rad(d) {
  return d * Math.PI / 180;
}

export function rad2deg(r) {
  return r * 180 / Math.PI;
}

export function snapValue(v, step) {
  return Math.round(v / step) * step;
}

export function maybeSnap(v, step, enabled) {
  return enabled ? snapValue(v, step) : v;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
