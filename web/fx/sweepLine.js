function clamp255(v){ return v < 0 ? 0 : v > 255 ? 255 : (v|0); }

export default {
  id: "sweepLine",
  label: "Sweep Line",
  desc: "回転するライン（単体）",
  params: [
    { key:"baseR", label:"Base R", type:"range", min:0, max:50, step:1, default:20 },
    { key:"angW",  label:"Angular(rad/s)", type:"range", min:0, max:4, step:0.05, default:0.85 },
    { key:"thick", label:"Thickness(mm)", type:"range", min:3, max:80, step:1, default:18 },
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
    const ang = t * params.angW;
    const nx = Math.cos(ang);
    const ny = Math.sin(ang);
    const thickness = Math.max(1e-6, params.thick);

    for (let gi = 0; gi < TOTAL; gi++) {
      const x = worldX[gi] - ctx.originX;
      const y = worldY[gi] - ctx.originY;
      const d = Math.abs(-ny*x + nx*y);
      const a = Math.exp(-(d*d)/(2*thickness*thickness));
      if (a < 0.01) continue;

      const c = 0.5 + 0.5*Math.sin(t*2.0);

      const k = gi*3;
      out[k+0] = clamp255(out[k+0] + 120*a);
      out[k+1] = clamp255(out[k+1] + (40+120*c)*a);
      out[k+2] = clamp255(out[k+2] + 200*a);
    }
  }
};
