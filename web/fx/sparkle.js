function clamp255(v){ return v < 0 ? 0 : v > 255 ? 255 : (v|0); }

export default {
  id: "sparkle",
  label: "Sparkle",
  desc: "ランダムきらめき（状態あり・単体）",
  params: [
    { key:"baseR",  label:"Base R", type:"range", min:0, max:50, step:1, default:20 },
    { key:"rate",   label:"Rate(/s)", type:"range", min:0, max:120, step:1, default:18 },
    { key:"decay",  label:"Decay", type:"range", min:0.5, max:20, step:0.1, default:6.0 },
  ],
  init(state, params) {
    // 遅延確保（TOTALがgeoにあるため、renderで必要なら作る）
    state.spark = null;
  },
  render(ctx, out, state, params, geo) {
    const { TOTAL } = geo;

    for (let gi = 0; gi < TOTAL; gi++) {
      const k = gi*3;
      out[k+0] = params.baseR;
      out[k+1] = 0;
      out[k+2] = 0;
    }

    if (!state.spark || state.spark.length !== TOTAL) {
      state.spark = new Float32Array(TOTAL);
    }

    const dt = Math.max(0, Math.min(0.05, ctx.dt || 0.016));
    const decayMul = Math.exp(-dt * params.decay);

    for (let gi = 0; gi < TOTAL; gi++) state.spark[gi] *= decayMul;

    const spawns = Math.max(0, Math.floor(params.rate * (dt || 0.016)));
    for (let k = 0; k < spawns; k++) {
      const gi = (Math.random() * TOTAL) | 0;
      state.spark[gi] = Math.min(1, state.spark[gi] + 0.9);
    }

    for (let gi = 0; gi < TOTAL; gi++) {
      const a = state.spark[gi];
      if (a < 0.02) continue;

      const k = gi*3;
      out[k+0] = clamp255(out[k+0] + 180*a);
      out[k+1] = clamp255(out[k+1] + 220*a);
      out[k+2] = clamp255(out[k+2] + 255*a);
    }
  }
};
