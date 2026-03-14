const BUILD_TAG = "person_debug / 2026-03-13 JST";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : (v | 0);
}

function normalizeColor(input, fallbackHex = "#00ff88") {
  if (input && typeof input === "object") {
    return {
      r: clamp255(input.r ?? 0),
      g: clamp255(input.g ?? 255),
      b: clamp255(input.b ?? 136),
    };
  }
  return hexToRgb(input || fallbackHex);
}

function addColor(out, offset, r, g, b) {
  out[offset + 0] = clamp255(out[offset + 0] + r);
  out[offset + 1] = clamp255(out[offset + 1] + g);
  out[offset + 2] = clamp255(out[offset + 2] + b);
}

function ensureWaveBuffers(state, total) {
  if (!state.waveMask || state.waveMask.length !== total) {
    state.waveMask = new Float32Array(total);
  }
  if (!state.waveAdd || state.waveAdd.length !== total * 3) {
    state.waveAdd = new Float32Array(total * 3);
  }
  state.waveMask.fill(0);
  state.waveAdd.fill(0);
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

function renderTapeArrivalRipple(out, geo, params, ctx, state) {
  const arrivals = Array.isArray(ctx.tapeArrivals) ? ctx.tapeArrivals : [];
  for (const arrival of arrivals) {
    state.pulses.push({
      startSec: Number(arrival?.timeSec) || Number(ctx.t) || 0,
      color: normalizeColor(arrival?.color, params.personColor || "#00ff88"),
    });
  }

  const sourceX = Number.isFinite(ctx.sharedEntryX) ? ctx.sharedEntryX : Number(ctx.originX) || 0;
  const sourceY = Number.isFinite(ctx.sharedEntryY) ? ctx.sharedEntryY : Number(ctx.originY) || 0;
  const speed = Math.max(1, Number(params.waveSpeed) || 420);
  const width = Math.max(1, Number(params.waveWidth) || 52);
  const spacing = Math.max(1, Number(params.waveSpacing) || 88);
  const ringCount = Math.max(1, Math.round(Number(params.waveCount) || 4));
  const decaySec = Math.max(0.05, Number(params.waveDecaySec) || 1.15);
  const ringGain = Math.max(0, Number(params.waveGain) || 235);
  const ringFalloff = clamp(Number(params.waveFalloff) || 0.58, 0.05, 0.99);
  const coreRadius = Math.max(1, Number(params.waveCoreRadius) || 44);
  const coreGain = Math.max(0, Number(params.waveCoreGain) || 120);
  const tailGlow = Math.max(0, Number(params.waveTailGlow) || 22);
  const baseCut = clamp(Number(params.waveBaseCut) || 0.88, 0, 1);
  const baseFloor = clamp(Number(params.waveBaseFloor) || 0.12, 0, 1);

  const active = [];
  ensureWaveBuffers(state, geo.TOTAL);
  const waveMask = state.waveMask;
  const waveAdd = state.waveAdd;

  for (const pulse of state.pulses) {
    const ageSec = Number(ctx.t) - pulse.startSec;
    if (ageSec < 0) continue;

    const fade = Math.exp(-ageSec / decaySec);
    const radius = ageSec * speed;
    const color = normalizeColor(pulse.color, params.personColor || "#00ff88");

    if (fade > 0.01) active.push(pulse);

    for (let i = 0; i < geo.TOTAL; i++) {
      const dx = geo.worldX[i] - sourceX;
      const dy = geo.worldY[i] - sourceY;
      const dist = Math.hypot(dx, dy);

      let ringSum = 0;
      for (let ringIndex = 0; ringIndex < ringCount; ringIndex++) {
        const ringRadius = radius - ringIndex * spacing;
        if (ringRadius < -width * 2) continue;
        const ringAlpha = Math.exp(-((dist - ringRadius) ** 2) / (2 * width * width));
        ringSum += ringAlpha * Math.pow(ringFalloff, ringIndex);
      }

      const ringGlow = ringSum * fade;
      const coreAlpha = Math.exp(-(dist * dist) / (2 * coreRadius * coreRadius)) * fade * 0.8;
      const tailAlpha = dist <= radius
        ? Math.exp(-(radius - dist) / Math.max(1, width * 1.1)) * fade * 0.45
        : 0;

      if (ringGlow < 0.002 && coreAlpha < 0.002 && tailAlpha < 0.002) continue;

      const strength =
        (ringGlow * ringGain / 255) +
        (coreAlpha * coreGain / 255) +
        (tailAlpha * tailGlow / 255);
      const mask = clamp(ringGlow * 1.05 + coreAlpha * 0.9 + tailAlpha * 0.6, 0, 1);
      const o = i * 3;
      if (mask > waveMask[i]) waveMask[i] = mask;
      waveAdd[o + 0] += color.r * strength;
      waveAdd[o + 1] += color.g * strength;
      waveAdd[o + 2] += color.b * strength;
    }
  }

  for (let i = 0; i < geo.TOTAL; i++) {
    const mask = waveMask[i];
    if (mask <= 0.001) continue;

    const keep = Math.max(baseFloor, 1 - mask * baseCut);
    const o = i * 3;
    out[o + 0] = clamp255(out[o + 0] * keep);
    out[o + 1] = clamp255(out[o + 1] * keep);
    out[o + 2] = clamp255(out[o + 2] * keep);
    addColor(out, o, waveAdd[o + 0], waveAdd[o + 1], waveAdd[o + 2]);
  }

  state.pulses = active.slice(-12);
}

export default {
  id: "personDebug",
  label: "Person Debug",
  desc: "origin / people の受け渡し確認に加え、LED tape の球が到達した瞬間に多重波紋を重ねる。",

  params: [
    { key: "baseRed", label: "Base R", type: "range", min: 0, max: 64, step: 1, default: 0 },
    { key: "baseGreen", label: "Base G", type: "range", min: 0, max: 64, step: 1, default: 0 },
    { key: "baseBlue", label: "Base B", type: "range", min: 0, max: 64, step: 1, default: 12 },
    { key: "personColor", label: "Default Person Color", type: "color", default: "#00ff88" },
    { key: "personBrightness", label: "Person Brightness", type: "range", min: 0, max: 255, step: 1, default: 255 },
    { key: "personRadiusMm", label: "Person Radius mm", type: "range", min: 50, max: 2000, step: 10, default: 500 },
    { key: "personSoftEdgeMm", label: "Person Soft Edge mm", type: "range", min: 0, max: 600, step: 10, default: 180 },
    { key: "waveSpeed", label: "Wave Speed (mm/s)", type: "range", min: 40, max: 1400, step: 10, default: 420 },
    { key: "waveWidth", label: "Wave Width (mm)", type: "range", min: 10, max: 320, step: 5, default: 52 },
    { key: "waveSpacing", label: "Ring Spacing (mm)", type: "range", min: 20, max: 320, step: 5, default: 88 },
    { key: "waveCount", label: "Ring Count", type: "range", min: 1, max: 6, step: 1, default: 4 },
    { key: "waveDecaySec", label: "Decay (s)", type: "range", min: 0.2, max: 4, step: 0.05, default: 1.15 },
    { key: "waveGain", label: "Ring Gain", type: "range", min: 0, max: 255, step: 1, default: 235 },
    { key: "waveFalloff", label: "Ring Falloff", type: "range", min: 0.2, max: 0.95, step: 0.05, default: 0.58 },
    { key: "waveCoreRadius", label: "Core Radius (mm)", type: "range", min: 10, max: 220, step: 5, default: 44 },
    { key: "waveCoreGain", label: "Core Gain", type: "range", min: 0, max: 255, step: 1, default: 120 },
    { key: "waveTailGlow", label: "Tail Glow", type: "range", min: 0, max: 255, step: 1, default: 22 },
    { key: "waveBaseCut", label: "Base Cut Under Wave", type: "range", min: 0, max: 1, step: 0.01, default: 0.88 },
    { key: "waveBaseFloor", label: "Base Floor Under Wave", type: "range", min: 0, max: 1, step: 0.01, default: 0.12 },
  ],

  init(state) {
    state.logged = false;
    state.lastLogMs = 0;
    state.pulses = [];
    state.waveMask = null;
    state.waveAdd = null;
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
    renderTapeArrivalRipple(out, geo, params, ctx, state);
  },
};
