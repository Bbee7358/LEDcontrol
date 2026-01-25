function clamp255(v){ return v < 0 ? 0 : v > 255 ? 255 : (v|0); }

export default {
  id: "boardHop",
  label: "Board Hop",
  desc: "基板単位で巡回（単体）",
  params: [
    { key:"baseR",  label:"Base R", type:"range", min:0, max:50, step:1, default:20 },
    { key:"period", label:"Period(s/board)", type:"range", min:0.2, max:2.0, step:0.05, default:0.85 },
  ],
  init(state, params){},
  render(ctx, out, state, params, geo) {
    const { TOTAL, BOARDS, worldB, worldI } = geo;

    for (let gi = 0; gi < TOTAL; gi++) {
      const k = gi*3;
      out[k+0] = params.baseR;
      out[k+1] = 0;
      out[k+2] = 0;
    }

    const t = ctx.t;
    const period = Math.max(1e-6, params.period);
    const idx = Math.floor(t / period) % BOARDS;

    for (let gi = 0; gi < TOTAL; gi++) {
      if (worldB[gi] !== idx) continue;
      const i = worldI[gi];
      const a = 0.25 + 0.75*(0.5 + 0.5*Math.sin((t*6.0) + i*0.25));

      const k = gi*3;
      out[k+0] = clamp255(out[k+0] + 40*a);
      out[k+1] = clamp255(out[k+1] + 180*a);
      out[k+2] = clamp255(out[k+2] + 80*a);
    }
  }
};
