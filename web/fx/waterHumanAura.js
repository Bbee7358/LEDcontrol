function clamp255(v){ return v < 0 ? 0 : v > 255 ? 255 : (v|0); }

function hexToRgb(hex) {
  const s = String(hex || "#00ff88").trim();
  const m = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return [0, 255, 136];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function gauss(d, sigma) {
  const s = Math.max(1e-6, sigma);
  return Math.exp(-(d * d) / (2 * s * s));
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export default {
  id: "waterHumanAura",
  label: "Water + Human Aura",
  desc: "青の常時点灯の上に水面下ゆらぎ。人物は半径500mmだけ指定色でぼんやり発光",
  params: [
    { key:"baseBlue",        label:"Base Blue",          type:"range", min:0,    max:40,   step:1,    default:12 },
    { key:"baseGreen",       label:"Base Green",         type:"range", min:0,    max:20,   step:1,    default:3  },
    { key:"baseWhiteTint",   label:"Base White Tint",    type:"range", min:0,    max:12,   step:1,    default:1  },
    { key:"underSigma",      label:"Under Sigma(mm)",    type:"range", min:40,   max:450,  step:1,    default:180 },
    { key:"underAmount",     label:"Under Amount",       type:"range", min:0.00, max:1.50, step:0.01, default:0.38 },
    { key:"dropMinGap",      label:"Drop Min Gap(s)",    type:"range", min:1.0,  max:8.0,  step:0.1,  default:3.0 },
    { key:"dropMaxGap",      label:"Drop Max Gap(s)",    type:"range", min:1.0,  max:12.0, step:0.1,  default:8.0 },
    { key:"dropTripletGap",  label:"Triplet Gap(s)",     type:"range", min:0.08, max:0.80, step:0.01, default:0.22 },
    { key:"rippleSpeed",     label:"Ripple Speed(mm/s)", type:"range", min:40,   max:900,  step:1,    default:220 },
    { key:"rippleWidth",     label:"Ripple Width(mm)",   type:"range", min:8,    max:120,  step:1,    default:26 },
    { key:"rippleLife",      label:"Ripple Life(s)",     type:"range", min:0.6,  max:6.0,  step:0.01, default:2.8 },
    { key:"ripplePeak",      label:"Ripple Peak",        type:"range", min:0.0,  max:2.0,  step:0.01, default:0.90 },
    { key:"personColor",     label:"Person Color",       type:"color",                       default:"#00ff88" },
    { key:"personRadius",    label:"Person Radius(mm)",  type:"range", min:80,   max:900,  step:1,    default:500 },
    { key:"personSoftness",  label:"Person Softness(mm)",type:"range", min:20,   max:500,  step:1,    default:180 },
    { key:"personStrength",  label:"Person Strength",    type:"range", min:0.0,  max:1.5,  step:0.01, default:0.95 },
    { key:"personCoreBoost", label:"Person Core Boost",  type:"range", min:0.0,  max:1.5,  step:0.01, default:0.25 }
  ],

  init(state, params) {
    state.seed = 246813579;
    state.drops = [];
    state.nextDropAt = 0;
    state.prevPeople = new Map();
    state.followGlow = new Map();
  },

  render(ctx, out, state, params, geo) {
    const { TOTAL, worldX, worldY } = geo;
    const t = ctx.t || 0;
    const dt = Math.max(1/120, Math.min(0.2, ctx.dt || 1/60));

    const rnd = () => {
      state.seed = (1664525 * state.seed + 1013904223) >>> 0;
      return state.seed / 4294967296;
    };

    const minGap = Math.max(0.2, +params.dropMinGap || 3.0);
    const maxGap = Math.max(minGap, +params.dropMaxGap || 8.0);
    const tripletGap = Math.max(0.02, +params.dropTripletGap || 0.22);
    const rippleSpeed = Math.max(1, +params.rippleSpeed || 220);
    const rippleWidth = Math.max(1, +params.rippleWidth || 26);
    const rippleLife = Math.max(0.1, +params.rippleLife || 2.8);
    const ripplePeak = Math.max(0, +params.ripplePeak || 0.9);

    if (!state.nextDropAt || t >= state.nextDropAt) {
      const cx = (rnd() * 2 - 1) * 700;
      const cy = (rnd() * 2 - 1) * 320;
      for (let i = 0; i < 3; i++) {
        state.drops.push({
          x: cx + (rnd() * 2 - 1) * 55,
          y: cy + (rnd() * 2 - 1) * 55,
          t0: t + i * tripletGap,
          amp: 0.72 + rnd() * 0.38
        });
      }
      state.nextDropAt = t + minGap + rnd() * (maxGap - minGap);
    }

    if (state.drops.length) {
      const keep = [];
      for (let i = 0; i < state.drops.length; i++) {
        const d = state.drops[i];
        if ((t - d.t0) <= rippleLife) keep.push(d);
      }
      state.drops = keep;
    }

    const peopleInput = Array.isArray(ctx.people) && ctx.people.length
      ? ctx.people
      : [{ id:"fallback-person", x: ctx.originX || 0, y: ctx.originY || 0, color: params.personColor || "#00ff88" }];

    const nextPrev = new Map();
    const activePeople = [];

    for (let i = 0; i < peopleInput.length; i++) {
      const p = peopleInput[i] || {};
      const id = p.id ?? `p-${i}`;
      const x = Number.isFinite(Number(p.x)) ? Number(p.x) : 0;
      const y = Number.isFinite(Number(p.y)) ? Number(p.y) : 0;
      const color = typeof p.color === "string" ? p.color : (params.personColor || "#00ff88");

      const prev = state.prevPeople.get(id);
      const gx = prev ? (prev.x * 0.65 + x * 0.35) : x;
      const gy = prev ? (prev.y * 0.65 + y * 0.35) : y;

      nextPrev.set(id, { x: gx, y: gy, color });
      activePeople.push({ id, x: gx, y: gy, color, rgb: hexToRgb(color) });
    }
    state.prevPeople = nextPrev;

    const baseBlue = Math.max(0, +params.baseBlue || 12);
    const baseGreen = Math.max(0, +params.baseGreen || 3);
    const baseWhiteTint = Math.max(0, +params.baseWhiteTint || 1);
    const underSigma = Math.max(1, +params.underSigma || 180);
    const underAmount = Math.max(0, +params.underAmount || 0.38);

    const personRadius = Math.max(1, +params.personRadius || 500);
    const personSoftness = Math.max(1, +params.personSoftness || 180);
    const personStrength = Math.max(0, +params.personStrength || 0.95);
    const personCoreBoost = Math.max(0, +params.personCoreBoost || 0.25);

    for (let gi = 0; gi < TOTAL; gi++) {
      const x = worldX[gi];
      const y = worldY[gi];
      const k = gi * 3;

      // 1) 青の常時点灯
      let baseR = baseWhiteTint;
      let baseG = baseGreen;
      let baseB = baseBlue;

      // 2) 水面下のゆらぎ（青ベースにわずかに白を足す）
      const w1 = Math.sin(x * 0.012 + t * 0.85);
      const w2 = Math.sin(y * 0.015 - t * 0.62 + 1.4);
      const w3 = Math.sin((x + y) * 0.008 + t * 1.10 + 0.7);
      const slow = (w1 * 0.42 + w2 * 0.33 + w3 * 0.25) * 0.5 + 0.5;
      const localBreathe = gauss(Math.sin(x * 0.006 + t * 0.4) * 120 + Math.cos(y * 0.005 - t * 0.37) * 100, underSigma);
      const under = underAmount * (0.45 + 0.55 * slow) * (0.65 + 0.35 * localBreathe);

      baseR += 1.6 * under;
      baseG += 1.4 * under;
      baseB += 2.8 * under;

      // 3) ランダム水滴 → 波紋（白寄りのきらめき）
      let rippleGlow = 0;
      for (let i = 0; i < state.drops.length; i++) {
        const d = state.drops[i];
        const age = t - d.t0;
        if (age < 0 || age > rippleLife) continue;

        const dx = x - d.x;
        const dy = y - d.y;
        const rr = Math.hypot(dx, dy);
        const ringR = age * rippleSpeed;
        const ring = gauss(rr - ringR, rippleWidth);
        const fade = Math.max(0, 1 - age / rippleLife);
        const sparkle = 0.65 + 0.35 * Math.sin(rr * 0.09 - age * 7.0 + d.amp * 6.0);
        rippleGlow += ring * fade * sparkle * d.amp;
      }
      rippleGlow *= ripplePeak;

      baseR += 10.0 * rippleGlow;
      baseG += 10.0 * rippleGlow;
      baseB += 11.0 * rippleGlow;

      // 4) 人の指定色オーラ
      //    加算で白飛びさせず、ベース→人物色へ寄せる方式
      let personMix = 0;
      let personR = 0;
      let personG = 0;
      let personB = 0;

      for (let i = 0; i < activePeople.length; i++) {
        const p = activePeople[i];
        const dx = x - p.x;
        const dy = y - p.y;
        const d = Math.hypot(dx, dy);

        if (d > personRadius + personSoftness) continue;

        const inCore = 1 - smoothstep(personRadius * 0.72, personRadius, d);
        const edge = 1 - smoothstep(personRadius, personRadius + personSoftness, d);
        const mix = Math.max(inCore * (1 + personCoreBoost), edge) * personStrength;
        if (mix <= 0.001) continue;

        if (mix > personMix) personMix = mix;
        personR += p.rgb[0] * mix;
        personG += p.rgb[1] * mix;
        personB += p.rgb[2] * mix;
      }

      let R = baseR;
      let G = baseG;
      let B = baseB;

      if (personMix > 0) {
        const inv = 1 / Math.max(1e-6, personMix);
        const targetR = personR * inv;
        const targetG = personG * inv;
        const targetB = personB * inv;

        const mix = Math.max(0, Math.min(1, personMix));
        R = R * (1 - mix) + targetR * mix;
        G = G * (1 - mix) + targetG * mix;
        B = B * (1 - mix) + targetB * mix;
      }

      out[k + 0] = clamp255(Math.round(R));
      out[k + 1] = clamp255(Math.round(G));
      out[k + 2] = clamp255(Math.round(B));
    }
  }
};
