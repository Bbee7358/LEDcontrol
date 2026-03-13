const BUILD_TAG = "blueBase_personInstantOnly_brightness_debugOrigin / 2026-03-13 JST";

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
  for (let i = 0; i < geo.TOTAL; i++) {
    const o = i * 3;
    out[o + 0] = Number(params.baseRed) || 0;
    out[o + 1] = Number(params.baseGreen) || 0;
    out[o + 2] = Number(params.baseBlue) || 0;
  }
}

function resolvePeople(ctx, params) {
  const inputPeople = Array.isArray(ctx.people) ? ctx.people : [];
  if (inputPeople.length) return inputPeople;

  const ox = Number(ctx.originX);
  const oy = Number(ctx.originY);

  if (Number.isFinite(ox) && Number.isFinite(oy)) {
    return [
      {
        x: ox,
        y: oy,
        color: params.personColor || "#00ff88",
        __from: "originFallback",
      },
    ];
  }

  return [];
}

function findNearestLedIndex(geo, px, py) {
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

function drawNearestLedDebug(out, idx, tSec) {
  if (idx < 0) return;
  const o = idx * 3;
  const blink = (Math.sin(tSec * 8.0) * 0.5 + 0.5);
  out[o + 0] = clamp255(255 * blink);
  out[o + 1] = 0;
  out[o + 2] = 0;
}

function renderPeopleAuraReplace(out, geo, params, ctx, state) {
  const people = resolvePeople(ctx, params);

  if (!people.length) {
    if (params.debugLog) {
      const now = performance.now();
      if (!state.lastDebugLogMs || now - state.lastDebugLogMs > 500) {
        state.lastDebugLogMs = now;
        console.log("[FX DEBUG] no people and no valid origin", {
          originX: ctx.originX,
          originY: ctx.originY,
          people: ctx.people,
          ctxKeys: Object.keys(ctx || {}),
        });
      }
    }
    return;
  }

  const R = Math.max(1, Number(params.personRadiusMm) || 500);
  const edge = Math.max(0, Number(params.personSoftEdgeMm) || 0);
  const brightness255 = clamp(Number(params.personBrightness), 0, 255);
  const brightness = brightness255 / 255;

  let totalHitCount = 0;

  for (const p of people) {
    const px = Number(p.x);
    const py = Number(p.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

    const col = hexToRgb(p.color || params.personColor || "#00ff88");

    let hitCount = 0;
    let nearest = { index: -1, dist: Infinity };

    for (let i = 0; i < geo.TOTAL; i++) {
      const dx = geo.worldX[i] - px;
      const dy = geo.worldY[i] - py;
      const d = Math.hypot(dx, dy);

      if (d < nearest.dist) {
        nearest.dist = d;
        nearest.index = i;
      }

      if (d > R) continue;
      hitCount++;

      let k = 1.0;
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
    }

    totalHitCount += hitCount;

    if (params.debugLog) {
      const now = performance.now();
      if (!state.lastDebugLogMs || now - state.lastDebugLogMs > 500) {
        state.lastDebugLogMs = now;
        console.log("[FX DEBUG] resolved person", {
          from: p.__from || "people",
          x: px,
          y: py,
          radius: R,
          hitCount,
          nearestLedIndex: nearest.index,
          nearestLedDistMm: Math.round(nearest.dist * 10) / 10,
          originX: ctx.originX,
          originY: ctx.originY,
          peopleLen: Array.isArray(ctx.people) ? ctx.people.length : 0,
          totalLeds: geo.TOTAL,
        });
      }
    }

    if (hitCount === 0 && params.debugNearestLed) {
      drawNearestLedDebug(out, nearest.index, Number(ctx.t) || 0);
    }
  }

  if (params.debugForceNearestLedWhenNoHit && totalHitCount === 0 && people[0]) {
    const px = Number(people[0].x);
    const py = Number(people[0].y);
    const nearest = findNearestLedIndex(geo, px, py);
    drawNearestLedDebug(out, nearest.index, Number(ctx.t) || 0);
  }
}

export default {
  id: "blueBasePersonInstantOnlyBrightnessDebugOrigin",
  label: "Blue Base + Person Instant Only (Debug Origin)",
  desc: "origin/people の受け渡し確認用。半径内にLEDが無い場合は最寄りLEDを赤点滅で表示できる。",

  params: [
    { key: "baseRed", label: "Base R", type: "range", min: 0, max: 64, step: 1, default: 0 },
    { key: "baseGreen", label: "Base G", type: "range", min: 0, max: 64, step: 1, default: 0 },
    { key: "baseBlue", label: "Base B", type: "range", min: 0, max: 64, step: 1, default: 12 },

    { key: "personColor", label: "Default Person Color", type: "color", default: "#00ff88" },
    { key: "personBrightness", label: "Person Brightness", type: "range", min: 0, max: 255, step: 1, default: 255 },
    { key: "personRadiusMm", label: "Person Radius mm", type: "range", min: 50, max: 2000, step: 10, default: 500 },
    { key: "personSoftEdgeMm", label: "Person Soft Edge mm", type: "range", min: 0, max: 600, step: 10, default: 180 },

    { key: "debugLog", label: "Debug Log", type: "checkbox", default: true },
    { key: "debugNearestLed", label: "Show nearest LED when no hit", type: "checkbox", default: true },
    { key: "debugForceNearestLedWhenNoHit", label: "Force nearest LED blink if radius misses", type: "checkbox", default: true },
  ],

  init(state, params) {
    state.logged = false;
    state.lastDebugLogMs = 0;
  },

  render(ctx, out, state, params, geo) {
    if (!state.logged) {
      state.logged = true;
      try {
        console.log(`[FX BUILD] ${BUILD_TAG}`);
        console.log("[FX DEBUG] first ctx snapshot", {
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
    renderPeopleAuraReplace(out, geo, params, ctx, state);
  },
};