function clamp255(v){ return v < 0 ? 0 : v > 255 ? 255 : (v|0); }

export default {
  id: "originGlow",
  label: "Origin Glow",
  desc: "原点周辺が光る（単体で完成）",
  params: [
    { key:"baseR", label:"Base R", type:"range", min:0, max:50, step:1, default:20 },
    { key:"radius", label:"Radius(mm)", type:"range", min:10, max:200, step:1, default:55 },
    { key:"glow", label:"Glow", type:"range", min:0, max:255, step:1, default:140 },
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

    const radius = params.radius;
    const inv = 1 / Math.max(1e-6, radius);

    for (let gi = 0; gi < TOTAL; gi++) {
      const x = worldX[gi] - ctx.originX;
      const y = worldY[gi] - ctx.originY;
      const d = Math.hypot(x, y);
      if (d > radius) continue;
      const a = 1 - (d * inv);

      const k = gi*3;
      out[k+0] = clamp255(out[k+0] + 30*a);
      out[k+1] = clamp255(out[k+1] + 40*a);
      out[k+2] = clamp255(out[k+2] + params.glow*a);
    }
  }
};
