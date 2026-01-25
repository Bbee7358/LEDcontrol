function clamp255(v){ return v < 0 ? 0 : v > 255 ? 255 : (v|0); }

export default {
  id: "ripple",
  label: "Ripple",
  desc: "原点から波紋（単体）",
  params: [
    { key:"baseR",  label:"Base R", type:"range", min:0, max:50, step:1, default:20 },
    { key:"speed",  label:"Speed(mm/s)", type:"range", min:10, max:600, step:1, default:190 },
    { key:"period", label:"Period(s)", type:"range", min:0.2, max:3.0, step:0.05, default:1.10 },
    { key:"width",  label:"Width(s)", type:"range", min:0.01, max:0.40, step:0.01, default:0.095 },
  ],
  init(state, params){},
  render(ctx, out, state, params, geo) {
    const { TOTAL, worldX, worldY } = geo;

    for (let gi = 0; gi < TOTAL; gi++) {
      const k = gi*3;
      out[k+0] = params.baseR;
      out[k+1] = 0;
      out[k+2] = 0;
    }

    const t = ctx.t;
    const speed  = Math.max(1e-6, params.speed);
    const period = Math.max(1e-6, params.period);
    const width  = Math.max(1e-6, params.width);

    for (let gi = 0; gi < TOTAL; gi++) {
      const x = worldX[gi] - ctx.originX;
      const y = worldY[gi] - ctx.originY;
      const r = Math.hypot(x, y);

      const phase = (r / speed) - t;
      const p = ((phase % period) + period) % period;
      const d = Math.min(p, period - p);
      const a = Math.exp(-(d*d)/(2*width*width));
      if (a < 0.02) continue;

      const k = gi*3;
      out[k+0] = clamp255(out[k+0] + 50*a);
      out[k+1] = clamp255(out[k+1] + 90*a);
      out[k+2] = clamp255(out[k+2] + 180*a);
    }
  }
};
