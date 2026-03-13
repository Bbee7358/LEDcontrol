const BUILD_TAG = "person_debug / 2026-03-13 JST";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : (v | 0);
}

function hexToRgb(hex) {
  const s = String(hex || "#00ff88").trim();
  const m = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return { r: 0, g: 255, b: 136 };
  const n = parseInt(m[1], 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function smooth01(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function renderBaseBlue(out, geo, params) {
  const r = Number(params.baseRed) || 0;
  const g = Number(params.baseGreen) || 0;
  const b = Number(params.baseBlue) || 0;
  for (let i = 0; i < geo.TOTAL; i++) {
    const o = i * 3;
    out[o + 0] = r;
    out[o + 1] = g;
    out[o + 2] = b;
  }
}

function resolvePeople(ctx, params) {
  const people = Array.isArray(ctx.people) ? ctx.people : [];
  if (people.length) return people;

  const ox = Number(ctx.originX);
  const oy = Number(ctx.originY);
  if (Number.isFinite(ox) && Number.isFinite(oy)) {
    return [{ x: ox, y: oy, color: params.personColor || "#00ff88", __src: "origin" }];
  }

  return [];
}

function findNearestLed(geo, px, py) {
  let bestI = -1;
  let bestD = Infinity;
  for (let i = 0; i < geo.TOTAL; i++) {
    const dx = geo.worldX[i] - px;
    const dy = geo.worldY[i] - py;
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return { index: bestI, dist: bestD };
}

function drawBlinkRed(out, i, t) {
  if (i < 0) return;
  const o = i * 3;
  const v = clamp255(255 * (0.25 + 0.75 * (Math.sin((Number(t) || 0) * 8) * 0.5 + 0.5)));
  out[o + 0] = v;
  out[o + 1] = 0;
  out[o + 2] = 0;
}

function renderPeople(out, geo, params, ctx, state) {
  const people = resolvePeople(ctx, params);
  const R = Math.max(1, Number(params.personRadiusMm) || 500);
  const edge = Math.max(0, Number(params.personSoftEdgeMm) || 0);
  const brightness = clamp(Number(params.personBrightness), 0, 255) / 255;

  if (!people.length) {
    const now = performance.now();
    if (!state.lastLogMs || now - state.lastLogMs > 500) {
      state.lastLogMs = now;
      console.log("[person_debug] no people", {
        originX: ctx.originX,
        originY: ctx.originY,
        people: ctx.people,
        ctxKeys: Object.keys(ctx || {}),
      });
    }
    return;
  }

  for (const p of people) {
    const px = Number(p.x);
    const py = Number(p.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

    const col = hexToRgb(p.color || params.personColor || "#00ff88");
    let hitCount = 0;
    const nearest = findNearestLed(geo, px, py);

    for (let i = 0; i < geo.TOTAL; i++) {
      const dx = geo.worldX[i] - px;
      const dy = geo.worldY[i] - py;
      const d = Math.hypot(dx, dy);
      if (d > R) continue;

      let k = 1;
      if (edge > 0) {
        const inner = Math.max(0, R - edge);
        if (d > inner) {
          const u = 1 - (d - inner) / Math.max(1, R - inner);
          k = smooth01(u);
        }
      }

      const o = i * 3;
      out[o + 0] = clamp255(col.r * k * brightness);
      out[o + 1] = clamp255(col.g * k * brightness);
      out[o + 2] = clamp255(col.b * k * brightness);
      hitCount++;
    }

    const now = performance.now();
    if (!state.lastLogMs || now - state.lastLogMs > 500) {
      state.lastLogMs = now;
      console.log("[person_debug] person resolved", {
        src: p.__src || "people",
        x: px,
        y: py,
        radius: R,
        hitCount,
        nearestLedIndex: nearest.index,
        nearestLedDistMm: Math.round(nearest.dist),
        originX: ctx.originX,
        originY: ctx.originY,
      });
    }

    if (hitCount === 0) {
      drawBlinkRed(out, nearest.index, ctx.t);
    }
  }
}

export default {
  id: "personDebug",
  label: "Person Debug",
  desc: "origin / people の受け渡し確認用。ヒットしない場合は最寄りLEDを赤点滅で表示する。",

  params: [
    { key: "baseRed", label: "Base R", type: "range", min: 0, max: 64, step: 1, default: 0 },
    { key: "baseGreen", label: "Base G", type: "range", min: 0, max: 64, step: 1, default: 0 },
    { key: "baseBlue", label: "Base B", type: "range", min: 0, max: 64, step: 1, default: 12 },
    { key: "personColor", label: "Default Person Color", type: "color", default: "#00ff88" },
    { key: "personBrightness", label: "Person Brightness", type: "range", min: 0, max: 255, step: 1, default: 255 },
    { key: "personRadiusMm", label: "Person Radius mm", type: "range", min: 50, max: 2000, step: 10, default: 500 },
    { key: "personSoftEdgeMm", label: "Person Soft Edge mm", type: "range", min: 0, max: 600, step: 10, default: 180 },
  ],

  init(state) {
    state.logged = false;
    state.lastLogMs = 0;
  },

  render(ctx, out, state, params, geo) {
    if (!state.logged) {
      state.logged = true;
      try {
        console.log("[FX BUILD]", BUILD_TAG);
        console.log("[person_debug] first ctx", {
          originX: ctx.originX,
          originY: ctx.originY,
          people: ctx.people,
          ctxKeys: Object.keys(ctx || {}),
          geoTotal: geo?.TOTAL,
        });
        window.__WATER_AURA_BUILD__ = BUILD_TAG;
      } catch {}
    }

    renderBaseBlue(out, geo, params);
    renderPeople(out, geo, params, ctx, state);
  },
};
