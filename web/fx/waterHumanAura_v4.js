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
  desc: "全域を常時青12で点灯し、その上に水面下の揺らぎと波紋。人物半径500mmのみ人物色で表示",
  params: [
    { key:"baseBlue",        label:"Base Blue",           type:"range", min:0,    max:40,   step:1,    default:12 },
    { key:"underBlueGain",   label:"Under Blue Gain",     type:"range", min:0,    max:24,   step:1,    default:3 },
    { key:"underWhiteGain",  label:"Under White Gain",    type:"range", min:0,    max:16,   step:1,    default:1 },
    { key:"dropMinGap",      label:"Drop Min Gap(s)",     type:"range", min:1.0,  max:8.0,  step:0.1,  default:3.0 },
    { key:"dropMaxGap",      label:"Drop Max Gap(s)",     type:"range", min:1.0,  max:12.0, step:0.1,  default:8.0 },
    { key:"dropTripletGap",  label:"Triplet Gap(s)",      type:"range", min:0.08, max:0.80, step:0.01, default:0.22 },
    { key:"rippleSpeed",     label:"Ripple Speed(mm/s)",  type:"range", min:40,   max:900,  step:1,    default:220 },
    { key:"rippleWidth",     label:"Ripple Width(mm)",    type:"range", min:8,    max:120,  step:1,    default:28 },
    { key:"rippleLife",      label:"Ripple Life(s)",      type:"range", min:0.6,  max:6.0,  step:0.01, default:2.8 },
    { key:"rippleBlueGain",  label:"Ripple Blue Gain",    type:"range", min:0,    max:48,   step:1,    default:14 },
    { key:"rippleWhiteGain", label:"Ripple White Gain",   type:"range", min:0,    max:32,   step:1,    default:6 },
    { key:"personColor",     label:"Fallback Person Color", type:"color",                     default:"#00ff88" },
    { key:"personRadius",    label:"Person Radius(mm)",   type:"range", min:80,   max:900,  step:1,    default:500 },
    { key:"personSoftness",  label:"Person Softness(mm)", type:"range", min:20,   max:500,  step:1,    default:160 },
    { key:"personMix",       label:"Person Mix",          type:"range", min:0.0,  max:1.0,  step:0.01, default:1.0 }
  ],

  init(state, params) {
    state.seed = 246813579;
    state.drops = [];
    state.nextDropAt = 0;
    state.prevPeople = new Map();
  },

  render(ctx, out, state, params, geo) {
    const { TOTAL, worldX, worldY } = geo;
    const t = ctx.t || 0;

    const rnd = () => {
      state.seed = (1664525 * state.seed + 1013904223) >>> 0;
      return state.seed / 4294967296;
    };

    const minGap = Math.max(0.2, +params.dropMinGap || 3.0);
    const maxGap = Math.max(minGap, +params.dropMaxGap || 8.0);
    const tripletGap = Math.max(0.02, +params.dropTripletGap || 0.22);
    const rippleSpeed = Math.max(1, +params.rippleSpeed || 220);
    const rippleWidth = Math.max(1, +params.rippleWidth || 28);
    const rippleLife = Math.max(0.1, +params.rippleLife || 2.8);

    if (!state.nextDropAt || t >= state.nextDropAt) {
      const cx = (rnd() * 2 - 1) * 700;
      const cy = (rnd() * 2 - 1) * 320;
      for (let i = 0; i < 3; i++) {
        state.drops.push({
          x: cx + (rnd() * 2 - 1) * 55,
          y: cy + (rnd() * 2 - 1) * 55,
          t0: t + i * tripletGap,
          amp: 0.75 + rnd() * 0.35
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

    // 人データが来た時だけ人エフェクトを出す。
    // 人データ未入力時は、常時青 + 水面下 + 波紋のみ。
    const peopleInput = Array.isArray(ctx.people) ? ctx.people : [];

    const nextPrev = new Map();
    const activePeople = [];
    for (let i = 0; i < peopleInput.length; i++) {
      const p = peopleInput[i] || {};
      const id = p.id ?? `p-${i}`;
      const x = Number.isFinite(Number(p.x)) ? Number(p.x) : null;
      const y = Number.isFinite(Number(p.y)) ? Number(p.y) : null;
      if (x == null || y == null) continue;

      const color = typeof p.color === "string" ? p.color : (params.personColor || "#00ff88");
      const prev = state.prevPeople.get(id);
      const gx = prev ? (prev.x * 0.70 + x * 0.30) : x;
      const gy = prev ? (prev.y * 0.70 + y * 0.30) : y;

      nextPrev.set(id, { x: gx, y: gy, color });
      activePeople.push({ id, x: gx, y: gy, rgb: hexToRgb(color) });
    }
    state.prevPeople = nextPrev;

    const baseBlue = Math.max(0, +params.baseBlue || 12);
    const underBlueGain = Math.max(0, +params.underBlueGain || 3);
    const underWhiteGain = Math.max(0, +params.underWhiteGain || 1);
    const rippleBlueGain = Math.max(0, +params.rippleBlueGain || 14);
    const rippleWhiteGain = Math.max(0, +params.rippleWhiteGain || 6);

    const personRadius = Math.max(1, +params.personRadius || 500);
    const personSoftness = Math.max(1, +params.personSoftness || 160);
    const personMixMax = Math.max(0, Math.min(1, +params.personMix || 1.0));

    for (let gi = 0; gi < TOTAL; gi++) {
      const x = worldX[gi];
      const y = worldY[gi];
      const k = gi * 3;

      // 1) 全域の土台を常時青で固定
      let baseR = 0;
      let baseG = 0;
      let baseB = baseBlue;

      // 2) 水面下のゆらぎを常時青の上に追加
      const w1 = Math.sin(x * 0.010 + t * 0.80);
      const w2 = Math.sin(y * 0.013 - t * 0.58 + 1.2);
      const w3 = Math.sin((x + y) * 0.007 + t * 1.05 + 0.6);
      const shimmer = ((w1 * 0.42 + w2 * 0.33 + w3 * 0.25) * 0.5 + 0.5);
      const underBlue = shimmer * underBlueGain;
      const underWhite = shimmer * underWhiteGain;

      baseR += underWhite;
      baseG += underWhite;
      baseB += underBlue + underWhite;

      // 3) 波紋も青ベースに追加
      let ripple = 0;
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
        const twinkle = 0.7 + 0.3 * Math.sin(rr * 0.085 - age * 6.8 + d.amp * 5.7);
        ripple += ring * fade * twinkle * d.amp;
      }

      baseR += ripple * rippleWhiteGain;
      baseG += ripple * rippleWhiteGain;
      baseB += ripple * (rippleBlueGain + rippleWhiteGain);

      // 4) デフォルトは常にベース色をそのまま表示
      let R = baseR;
      let G = baseG;
      let B = baseB;

      // 5) 人の半径500mm内だけ、青を混ぜずに人物色へ差し替える
      //    ここでは「青の上に加算」ではなく「人物色を上書き」する。
      let bestMix = 0;
      let bestRgb = null;
      for (let i = 0; i < activePeople.length; i++) {
        const p = activePeople[i];
        const dx = x - p.x;
        const dy = y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > personRadius + personSoftness) continue;

        const edge = 1 - smoothstep(personRadius, personRadius + personSoftness, d);
        const core = 1 - smoothstep(personRadius * 0.72, personRadius, d);
        const mix = Math.max(edge * 0.78, core) * personMixMax;
        if (mix > bestMix) {
          bestMix = mix;
          bestRgb = p.rgb;
        }
      }

      if (bestRgb && bestMix > 0) {
        // 青土台を混ぜず、人物色そのものへ置き換える。
        // ただし水面/波紋の質感を少しだけ残すため、人物色にわずかにベースを混ぜる。
        const textureMix = 0.12;
        const targetR = bestRgb[0] * (1 - textureMix) + baseR * textureMix;
        const targetG = bestRgb[1] * (1 - textureMix) + baseG * textureMix;
        const targetB = bestRgb[2] * (1 - textureMix) + baseB * textureMix;

        R = targetR * bestMix + baseR * (1 - bestMix);
        G = targetG * bestMix + baseG * (1 - bestMix);
        B = targetB * bestMix + baseB * (1 - bestMix);
      }

      out[k + 0] = clamp255(Math.round(R));
      out[k + 1] = clamp255(Math.round(G));
      out[k + 2] = clamp255(Math.round(B));
    }
  }
};
