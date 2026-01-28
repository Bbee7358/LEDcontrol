import { clamp, clamp255 } from "./utils/math.js";

export function createColorProcessor({ dom, worldX, worldB, worldI, TOTAL, BOARDS }) {
  let gammaLUT = new Uint8Array(256);

  function rebuildGammaLUT() {
    const g = parseFloat(dom.gamma.value);
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      gammaLUT[i] = clamp255(Math.round(Math.pow(x, g) * 255));
    }
  }

  function applyGainGamma(rgb) {
    const G = Math.max(0, Math.min(1, Number(dom.gain.value)));
    if (G !== 1) {
      for (let i = 0; i < rgb.length; i++) rgb[i] = clamp255(Math.round(rgb[i] * G));
    }
    for (let i = 0; i < rgb.length; i++) rgb[i] = gammaLUT[rgb[i]];
  }

  function applyLook(rgb) {
    if (!dom.lookOn.checked) return;

    const hueDeg = Number(dom.lookHue.value) || 0;
    const sat = Math.max(0, Number(dom.lookSat.value) || 1);
    if (hueDeg === 0 && sat === 1) return;

    const a = (hueDeg * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);

    for (let i = 0; i < rgb.length; i += 3) {
      const r = rgb[i + 0];
      const g = rgb[i + 1];
      const b = rgb[i + 2];

      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const I = 0.596 * r - 0.274 * g - 0.322 * b;
      const Q = 0.211 * r - 0.523 * g + 0.312 * b;

      const I2 = (I * ca - Q * sa) * sat;
      const Q2 = (I * sa + Q * ca) * sat;

      const rr = y + 0.956 * I2 + 0.621 * Q2;
      const gg = y - 0.272 * I2 - 0.647 * Q2;
      const bb = y - 1.106 * I2 + 1.703 * Q2;

      rgb[i + 0] = clamp255(Math.round(rr));
      rgb[i + 1] = clamp255(Math.round(gg));
      rgb[i + 2] = clamp255(Math.round(bb));
    }
  }

  function applyBoardPanelGlow(rgb, boardId, tNowSec, { strength = 1.0, yNorm = 0.5 } = {}) {
    if (boardId == null) return;
    if (!(boardId >= 0 && boardId < BOARDS)) return;
    if (!dom.panelLight.checked) return;

    const s = Math.max(0, Math.min(1, strength));
    if (s <= 0) return;

    const yk = Math.max(0, Math.min(1, yNorm));
    const hue = (0.62 + 0.16 * (0.5 - yk) + 0.06 * Math.sin(tNowSec * 0.7 + boardId * 0.9));
    const sat = 0.95;

    const hsvToRgb = (h, ss, v) => {
      h = ((h % 1) + 1) % 1;
      const i = Math.floor(h * 6);
      const f = h * 6 - i;
      const p = v * (1 - ss);
      const q = v * (1 - f * ss);
      const t = v * (1 - (1 - f) * ss);
      let r, g, b;
      switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        default: r = v; g = p; b = q; break;
      }
      return [r * 255, g * 255, b * 255];
    };

    const mix = 0.5 + 0.5 * Math.sin(tNowSec * 0.9 + boardId * 0.4);
    const c1 = hsvToRgb(hue, sat, 1.0);
    const c2 = hsvToRgb(hue + 0.18, sat, 1.0);
    const baseR = c1[0] * (1 - mix) + c2[0] * mix;
    const baseG = c1[1] * (1 - mix) + c2[1] * mix;
    const baseB = c1[2] * (1 - mix) + c2[2] * mix;

    for (let gi = 0; gi < TOTAL; gi++) {
      if (worldB[gi] !== boardId) continue;

      const li = worldI[gi] | 0;
      const ringW = (li < 30) ? 0.62 : (li < 42) ? 0.82 : 1.0;

      const pulse = 0.65 + 0.35 * Math.sin(tNowSec * 6.0 - li * 0.22);
      const sparkleGate = Math.sin(li * 12.9898 + tNowSec * 8.0 + boardId * 1.7);
      const sparkle = sparkleGate > 0.985 ? 1.0 : 0.0;

      const v = (0.35 + 0.65 * pulse) * ringW * (1 + 0.65 * sparkle) * (0.75 + 0.25 * s);

      const k = gi * 3;
      rgb[k + 0] = clamp255(rgb[k + 0] + baseR * v * s);
      rgb[k + 1] = clamp255(rgb[k + 1] + baseG * v * s);
      rgb[k + 2] = clamp255(rgb[k + 2] + baseB * v * s);
    }
  }

  function applyTrackingStripe(rgb, xMm, tNowSec, { strength = 1.0, palette = "blue" } = {}) {
    if (!dom.panelLight.checked) return;
    const s = Math.max(0, Math.min(1, strength));
    if (s <= 0) return;

    const coreSigma = 28;
    const glowSigma = 110;
    const invCore = 1 / Math.max(1e-6, coreSigma * coreSigma * 2);
    const invGlow = 1 / Math.max(1e-6, glowSigma * glowSigma * 2);

    const breath = 0.86 + 0.14 * Math.sin(tNowSec * 2.2);
    for (let gi = 0; gi < TOTAL; gi++) {
      const dx = Math.abs(worldX[gi] - xMm);
      const wCore = Math.exp(-(dx * dx) * invCore);
      const wGlow = Math.exp(-(dx * dx) * invGlow);
      if (wGlow < 0.01) continue;

      const shimmer = 0.92 + 0.08 * Math.sin(tNowSec * 4.2 + dx * 0.10);
      const w = (0.95 * wCore + 0.55 * wGlow) * breath * shimmer;

      const t = clamp(dx / (glowSigma * 1.15), 0, 1);
      const midT = t < 0.5 ? (t / 0.5) : ((t - 0.5) / 0.5);
      let rBase, gBase, bBase;
      if (palette === "greenorange") {
        if (t < 0.5) {
          rBase = 60 * (1 - midT) + 120 * midT;
          gBase = 255 * (1 - midT) + 200 * midT;
          bBase = 70 * (1 - midT) + 30 * midT;
        } else {
          rBase = 120 * (1 - midT) + 255 * midT;
          gBase = 200 * (1 - midT) + 120 * midT;
          bBase = 30 * (1 - midT) + 40 * midT;
        }
      } else {
        if (t < 0.5) {
          rBase = 220 * (1 - midT) + 70 * midT;
          gBase = 40 * (1 - midT) + 80 * midT;
          bBase = 255;
        } else {
          rBase = 70 * (1 - midT) + 40 * midT;
          gBase = 80 * (1 - midT) + 200 * midT;
          bBase = 255;
        }
      }

      const rAdd = rBase * s * w;
      const gAdd = gBase * s * w;
      const bAdd = bBase * s * (0.70 * wCore + 0.90 * wGlow) * shimmer;

      const k = gi * 3;
      rgb[k + 0] = clamp255(rgb[k + 0] + rAdd);
      rgb[k + 1] = clamp255(rgb[k + 1] + gAdd);
      rgb[k + 2] = clamp255(rgb[k + 2] + bAdd);
    }
  }

  return {
    rebuildGammaLUT,
    applyGainGamma,
    applyLook,
    applyBoardPanelGlow,
    applyTrackingStripe,
    getGammaLUT: () => gammaLUT,
  };
}
