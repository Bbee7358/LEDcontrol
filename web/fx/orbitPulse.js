function clamp255(v){ return v < 0 ? 0 : v > 255 ? 255 : (v|0); }

export default {
  id: "orbitPulse",
  label: "Orbit Pulse",
  desc: "原点周りを回る点（単体）",
  params: [
    { key:"baseR", label:"Base R", type:"range", min:0, max:50, step:1, default:20 },
    { key:"R",     label:"Radius(mm)", type:"range", min:0, max:400, step:1, default:140 },
    { key:"w",     label:"Angular(rad/s)", type:"range", min:0, max:6, step:0.05, default:1.2 },
    { key:"sigma", label:"Sigma(mm)", type:"range", min:5, max:120, step:1, default:28 },
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
    const R = params.R;
    const w = params.w;
    const px = Math.cos(t*w) * R;
    const py = Math.sin(t*w) * R;
    const sigma = Math.max(1e-6, params.sigma);

    for (let gi = 0; gi < TOTAL; gi++) {
      const dx = (worldX[gi] - ctx.originX) - px;
      const dy = (worldY[gi] - ctx.originY) - py;
      const a = Math.exp(-(dx*dx+dy*dy)/(2*sigma*sigma));
      if (a < 0.01) continue;

      const k = gi*3;
      out[k+0] = clamp255(out[k+0] + 40*a);
      out[k+1] = clamp255(out[k+1] + 160*a);
      out[k+2] = clamp255(out[k+2] + 120*a);
    }
  }
};
