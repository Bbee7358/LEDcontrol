function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : (v | 0);
}

function normalizeColor(input, fallback) {
  const src = input || fallback || { r: 64, g: 180, b: 255 };
  return {
    r: clamp255(src.r ?? 64),
    g: clamp255(src.g ?? 180),
    b: clamp255(src.b ?? 255),
  };
}

function addColor(out, offset, r, g, b) {
  out[offset + 0] = clamp255(out[offset + 0] + r);
  out[offset + 1] = clamp255(out[offset + 1] + g);
  out[offset + 2] = clamp255(out[offset + 2] + b);
}

export default {
  id: "tapeArrivalRipple",
  label: "Tape Arrival Ripple",
  desc: "LED tape 0番に光が到達した瞬間、共有基板位置から波紋が全体へ広がる。",

  params: [
    { key: "baseR", label: "Base R", type: "range", min: 0, max: 48, step: 1, default: 0 },
    { key: "baseG", label: "Base G", type: "range", min: 0, max: 64, step: 1, default: 10 },
    { key: "baseB", label: "Base B", type: "range", min: 0, max: 96, step: 1, default: 18 },
    { key: "speed", label: "Wave Speed (mm/s)", type: "range", min: 40, max: 1400, step: 10, default: 420 },
    { key: "width", label: "Wave Width (mm)", type: "range", min: 10, max: 320, step: 5, default: 52 },
    { key: "spacing", label: "Ring Spacing (mm)", type: "range", min: 20, max: 320, step: 5, default: 88 },
    { key: "ringCount", label: "Ring Count", type: "range", min: 1, max: 6, step: 1, default: 4 },
    { key: "decaySec", label: "Decay (s)", type: "range", min: 0.2, max: 4, step: 0.05, default: 1.15 },
    { key: "ringGain", label: "Ring Gain", type: "range", min: 0, max: 255, step: 1, default: 235 },
    { key: "ringFalloff", label: "Ring Falloff", type: "range", min: 0.2, max: 0.95, step: 0.05, default: 0.58 },
    { key: "coreRadius", label: "Core Radius (mm)", type: "range", min: 10, max: 220, step: 5, default: 44 },
    { key: "coreGain", label: "Core Gain", type: "range", min: 0, max: 255, step: 1, default: 120 },
    { key: "tailGlow", label: "Tail Glow", type: "range", min: 0, max: 255, step: 1, default: 22 },
  ],

  init(state) {
    state.pulses = [];
  },

  render(ctx, out, state, params, geo) {
    const baseR = Number(params.baseR) || 0;
    const baseG = Number(params.baseG) || 0;
    const baseB = Number(params.baseB) || 0;

    for (let i = 0; i < geo.TOTAL; i++) {
      const o = i * 3;
      out[o + 0] = baseR;
      out[o + 1] = baseG;
      out[o + 2] = baseB;
    }

    const arrivals = Array.isArray(ctx.tapeArrivals) ? ctx.tapeArrivals : [];
    for (const arrival of arrivals) {
      state.pulses.push({
        startSec: Number(arrival?.timeSec) || ctx.t,
        color: normalizeColor(arrival?.color, ctx.originColor),
      });
    }

    const sourceX = Number.isFinite(ctx.sharedEntryX) ? ctx.sharedEntryX : Number(ctx.originX) || 0;
    const sourceY = Number.isFinite(ctx.sharedEntryY) ? ctx.sharedEntryY : Number(ctx.originY) || 0;
    const speed = Math.max(1, Number(params.speed) || 420);
    const width = Math.max(1, Number(params.width) || 52);
    const spacing = Math.max(1, Number(params.spacing) || 88);
    const ringCount = Math.max(1, Math.round(Number(params.ringCount) || 4));
    const decaySec = Math.max(0.05, Number(params.decaySec) || 1.15);
    const ringGain = Math.max(0, Number(params.ringGain) || 235);
    const ringFalloff = clamp(Number(params.ringFalloff) || 0.58, 0.05, 0.99);
    const coreRadius = Math.max(1, Number(params.coreRadius) || 44);
    const coreGain = Math.max(0, Number(params.coreGain) || 120);
    const tailGlow = Math.max(0, Number(params.tailGlow) || 22);

    const active = [];

    for (const pulse of state.pulses) {
      const ageSec = ctx.t - pulse.startSec;
      if (ageSec < 0) continue;

      const fade = Math.exp(-ageSec / decaySec);
      const radius = ageSec * speed;
      const color = normalizeColor(pulse.color, ctx.originColor);

      if (fade > 0.01) {
        active.push(pulse);
      }

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

        const o = i * 3;
        const strength =
          (ringGlow * ringGain / 255) +
          (coreAlpha * coreGain / 255) +
          (tailAlpha * tailGlow / 255);
        addColor(
          out,
          o,
          color.r * strength,
          color.g * strength,
          color.b * strength
        );
      }
    }

    state.pulses = active.slice(-12);
  },
};
