const BUILD_TAG = "blueBase_personNoTrail / 2026-03-10 JST";

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

function ensureState(state, geo, params, ctx) {
  if (!state.__inited) {
    state.__inited = true;
    state.nextDropAt = ctx.t + randRange(params.dropMinGap, params.dropMaxGap);
    state.ripples = [];
    state.buildLogged = false;
  }

  if (!state.buildLogged) {
    state.buildLogged = true;
    try {
      console.log(`[FX BUILD] ${BUILD_TAG}`);
      window.__WATER_AURA_BUILD__ = BUILD_TAG;
    } catch {}
  }
}

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

function spawnTripleDrop(state, geo, params, nowT) {
  const idx = Math.floor(Math.random() * geo.TOTAL);
  const x = geo.worldX[idx];
  const y = geo.worldY[idx];

  const d0 = 0.00;
  const d1 = randRange(0.20, 0.38);
  const d2 = d1 + randRange(0.20, 0.38);

  state.ripples.push(
    { x, y, t0: nowT + d0, speed: params.rippleSpeed * 0.94, width: params.rippleWidth, amp: params.rippleAmp * 1.00 },
    { x, y, t0: nowT + d1, speed: params.rippleSpeed * 1.00, width: params.rippleWidth, amp: params.rippleAmp * 0.92 },
    { x, y, t0: nowT + d2, speed: params.rippleSpeed * 1.06, width: params.rippleWidth, amp: params.rippleAmp * 0.84 },
  );

  state.nextDropAt = nowT + randRange(params.dropMinGap, params.dropMaxGap);
}

function renderBaseBlue(out, geo, params) {
  for (let i = 0; i < geo.TOTAL; i++) {
    const o = i * 3;
    out[o + 0] = params.baseRed;
    out[o + 1] = params.baseGreen;
    out[o + 2] = params.baseBlue;
  }
}

function renderWaterUnderGlow(out, geo, params, ctx) {
  const t = ctx.t;

  for (let i = 0; i < geo.TOTAL; i++) {
    const x = geo.worldX[i];
    const y = geo.worldY[i];
    const o = i * 3;

    const n1 = Math.sin(x * 0.0065 + t * 0.90 + Math.sin(y * 0.0028 - t * 0.33) * 0.8);
    const n2 = Math.sin(y * 0.0074 - t * 0.74 + Math.cos(x * 0.0022 + t * 0.21) * 0.9);
    const n3 = Math.sin((x + y) * 0.0030 - t * 0.58);

    const wave = (n1 * 0.50 + n2 * 0.34 + n3 * 0.16 + 1.0) * 0.5;
    const flick = Math.pow(wave, 1.8);

    // 青の常時点灯の上に、少しだけ青白い揺らぎを足す
    const addBlue  = params.underBlueMax  * flick;
    const addGreen = params.underGreenMax * flick * 0.35;
    const addRed   = params.underRedMax   * flick * 0.12;

    out[o + 0] = clamp255(out[o + 0] + addRed);
    out[o + 1] = clamp255(out[o + 1] + addGreen);
    out[o + 2] = clamp255(out[o + 2] + addBlue);
  }
}

function renderRipples(out, geo, state, params, ctx) {
  const t = ctx.t;
  const alive = [];

  for (const rp of state.ripples) {
    const age = t - rp.t0;
    if (age < -0.6) {
      alive.push(rp);
      continue;
    }
    if (age < 0) {
      alive.push(rp);
      continue;
    }

    const radius = age * rp.speed;
    const maxLifeR = params.rippleMaxRadius;
    if (radius <= maxLifeR) alive.push(rp);

    const lifeFade = 1 - clamp(radius / maxLifeR, 0, 1);
    const amp = rp.amp * Math.pow(lifeFade, 1.35);
    if (amp <= 0.001) continue;

    const width = rp.width;

    for (let i = 0; i < geo.TOTAL; i++) {
      const dx = geo.worldX[i] - rp.x;
      const dy = geo.worldY[i] - rp.y;
      const d = Math.hypot(dx, dy);
      const ring = Math.abs(d - radius);
      if (ring > width * 2.0) continue;

      const ringShape = Math.exp(-(ring * ring) / (2 * width * width));
      const sparkle = 0.68 + 0.32 * Math.sin(d * 0.055 - t * 8.0);
      const a = amp * ringShape * sparkle;
      const o = i * 3;

      // 波紋は白ではなく、青寄りのきらめきとして加算
      out[o + 0] = clamp255(out[o + 0] + params.rippleRedAdd   * a);
      out[o + 1] = clamp255(out[o + 1] + params.rippleGreenAdd * a);
      out[o + 2] = clamp255(out[o + 2] + params.rippleBlueAdd  * a);
    }
  }

  state.ripples = alive;
}

function renderPeopleAuraReplace(out, geo, params, ctx) {
  const people = Array.isArray(ctx.people) ? ctx.people : [];
  if (!people.length) return;

  const R = params.personRadiusMm;
  const edge = Math.max(1, params.personSoftEdgeMm);

  for (const p of people) {
    const col = hexToRgb(p.color || params.personColor || "#00ff88");

    for (let i = 0; i < geo.TOTAL; i++) {
      const dx = geo.worldX[i] - p.x;
      const dy = geo.worldY[i] - p.y;
      const d = Math.hypot(dx, dy);
      if (d > R) continue;

      const inner = Math.max(0, R - edge);
      let k;
      if (d <= inner) {
        k = 1.0;
      } else {
        const u = 1 - (d - inner) / Math.max(1, R - inner);
        k = smooth01(u);
      }

      const o = i * 3;

      // 人物領域は青ベースを混ぜず、その人の色へ置き換える
      out[o + 0] = clamp255(col.r * k);
      out[o + 1] = clamp255(col.g * k);
      out[o + 2] = clamp255(col.b * k);
    }
  }
}

function renderVersionMarker(out, geo, params, ctx) {
  if (!params.debugVersionMarker) return;

  // 2.5秒ごとに0.35秒だけ、最初の8LEDをマゼンタで強く点滅
  // これが見えれば「新しい版が確実に読み込まれている」と判断できる
  const phase = ctx.t % params.debugMarkerPeriodSec;
  if (phase > params.debugMarkerFlashSec) return;

  const n = Math.min(params.debugMarkerCount, geo.TOTAL);
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    out[o + 0] = 255;
    out[o + 1] = 0;
    out[o + 2] = 255;
  }
}

export default {
  id: "waterHumanAura",
  label: "Blue Base + Person No Trail",
  desc: "全域を青ベースで点灯し、人の半径50cmは青を混ぜずにその人の色だけを表示する。残像前提の加算はしない。",

  params: [
    { key: "baseRed",   label: "Base R", type: "range", min: 0, max: 64, step: 1, default: 0 },
    { key: "baseGreen", label: "Base G", type: "range", min: 0, max: 64, step: 1, default: 0 },
    { key: "baseBlue",  label: "Base B", type: "range", min: 0, max: 64, step: 1, default: 12 },

    { key: "underRedMax",   label: "Under Red Max", type: "range", min: 0, max: 24, step: 1, default: 1 },
    { key: "underGreenMax", label: "Under Green Max", type: "range", min: 0, max: 24, step: 1, default: 3 },
    { key: "underBlueMax",  label: "Under Blue Max", type: "range", min: 0, max: 40, step: 1, default: 8 },

    { key: "dropMinGap", label: "Drop Min Gap", type: "range", min: 1, max: 12, step: 0.1, default: 3.0 },
    { key: "dropMaxGap", label: "Drop Max Gap", type: "range", min: 1, max: 12, step: 0.1, default: 8.0 },
    { key: "rippleSpeed", label: "Ripple Speed", type: "range", min: 50, max: 1200, step: 10, default: 260 },
    { key: "rippleWidth", label: "Ripple Width", type: "range", min: 10, max: 180, step: 2, default: 42 },
    { key: "rippleAmp", label: "Ripple Amp", type: "range", min: 1, max: 80, step: 1, default: 18 },
    { key: "rippleMaxRadius", label: "Ripple Max Radius", type: "range", min: 100, max: 3000, step: 20, default: 1700 },
    { key: "rippleRedAdd", label: "Ripple R Add", type: "range", min: 0, max: 80, step: 1, default: 2 },
    { key: "rippleGreenAdd", label: "Ripple G Add", type: "range", min: 0, max: 80, step: 1, default: 5 },
    { key: "rippleBlueAdd", label: "Ripple B Add", type: "range", min: 0, max: 120, step: 1, default: 22 },

    { key: "personColor", label: "Default Person Color", type: "color", default: "#00ff88" },
    { key: "personRadiusMm", label: "Person Radius mm", type: "range", min: 50, max: 1200, step: 10, default: 500 },
    { key: "personSoftEdgeMm", label: "Person Soft Edge mm", type: "range", min: 0, max: 600, step: 10, default: 180 },

    { key: "debugVersionMarker", label: "Debug Marker", type: "checkbox", default: false },
    { key: "debugMarkerPeriodSec", label: "Marker Period sec", type: "range", min: 0.5, max: 10, step: 0.1, default: 2.5 },
    { key: "debugMarkerFlashSec", label: "Marker Flash sec", type: "range", min: 0.05, max: 2, step: 0.05, default: 0.35 },
    { key: "debugMarkerCount", label: "Marker LED Count", type: "range", min: 1, max: 32, step: 1, default: 8 },
  ],

  init(state, params) {
    state.__inited = false;
  },

  render(ctx, out, state, params, geo) {
    ensureState(state, geo, params, ctx);

    // 1) 常時青点灯を必ず先に全面へ入れる
    renderBaseBlue(out, geo, params);

    // 2) 水面下のゆらぎ
    renderWaterUnderGlow(out, geo, params, ctx);

    // 3) ランダム水滴 → 波紋
    if (ctx.t >= state.nextDropAt) {
      spawnTripleDrop(state, geo, params, ctx.t);
    }
    renderRipples(out, geo, state, params, ctx);

    // 4) 人の半径50cmは、その人色へ差し替え
    renderPeopleAuraReplace(out, geo, params, ctx);

    // 5) デバッグ版確認用マーカー
    renderVersionMarker(out, geo, params, ctx);
  },
};
