const BUILD_TAG = "blueBase_personInstantOnly_brightness_255_originFallback / 2026-03-10 JST";

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
    out[o + 0] = params.baseRed;
    out[o + 1] = params.baseGreen;
    out[o + 2] = params.baseBlue;
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
      },
    ];
  }

  return [];
}

function renderPeopleAuraReplace(out, geo, params, ctx) {
  const people = resolvePeople(ctx, params);
  if (!people.length) return;

  const R = Math.max(1, Number(params.personRadiusMm) || 500);
  const edge = Math.max(0, Number(params.personSoftEdgeMm) || 0);
  const brightness255 = clamp(Number(params.personBrightness), 0, 255);
  const brightness = brightness255 / 255;

  for (const p of people) {
    const px = Number(p.x);
    const py = Number(p.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

    const col = hexToRgb(p.color || params.personColor || "#00ff88");

    for (let i = 0; i < geo.TOTAL; i++) {
      const dx = geo.worldX[i] - px;
      const dy = geo.worldY[i] - py;
      const d = Math.hypot(dx, dy);
      if (d > R) continue;

      let k = 1.0;
      if (edge > 0) {
        const inner = Math.max(0, R - edge);
        if (d > inner) {
          const u = 1 - (d - inner) / Math.max(1, R - inner);
          k = smooth01(u);
        }
      }

      const o = i * 3;

      // 人物領域は青ベースを完全に消し、その人色だけを出す
      out[o + 0] = clamp255(col.r * k * brightness);
      out[o + 1] = clamp255(col.g * k * brightness);
      out[o + 2] = clamp255(col.b * k * brightness);
    }
  }
}

export default {
  id: "blueBasePersonInstantOnlyBrightness255OriginFallback",
  label: "Blue Base + Person Instant Only (Brightness 0-255, Origin Fallback)",
  desc: "全域を青ベースで点灯し、人の半径内だけをその瞬間の人色へ置き換える。ctx.people が無い場合は originX/originY を人座標として使う。",

  params: [
    { key: "baseRed", label: "Base R", type: "range", min: 0, max: 64, step: 1, default: 0 },
    { key: "baseGreen", label: "Base G", type: "range", min: 0, max: 64, step: 1, default: 0 },
    { key: "baseBlue", label: "Base B", type: "range", min: 0, max: 64, step: 1, default: 12 },
    { key: "personColor", label: "Default Person Color", type: "color", default: "#00ff88" },
    { key: "personBrightness", label: "Person Brightness", type: "range", min: 0, max: 255, step: 1, default: 255 },
    { key: "personRadiusMm", label: "Person Radius mm", type: "range", min: 50, max: 1200, step: 10, default: 500 },
    { key: "personSoftEdgeMm", label: "Person Soft Edge mm", type: "range", min: 0, max: 600, step: 10, default: 180 },
  ],

  init(state, params) {
    state.logged = false;
  },

  render(ctx, out, state, params, geo) {
    if (!state.logged) {
      state.logged = true;
      try {
        console.log(`[FX BUILD] ${BUILD_TAG}`);
        window.__WATER_AURA_BUILD__ = BUILD_TAG;
      } catch {}
    }

    renderBaseBlue(out, geo, params);
    renderPeopleAuraReplace(out, geo, params, ctx);
  },
};