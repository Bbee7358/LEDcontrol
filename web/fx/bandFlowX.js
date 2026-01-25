function clamp255(v){ return v < 0 ? 0 : v > 255 ? 255 : (v|0); }

export default {
  id: "bandFlowX",
  label: "Band Flow X",
  desc: "X方向の帯が流れる（単体）",
  params: [
    { key:"baseR", label:"Base R", type:"range", min:0, max:50, step:1, default:20 },
    { key:"speed", label:"Speed(mm/s)", type:"range", min:0, max:600, step:1, default:240 },
    { key:"sigma", label:"Sigma(mm)", type:"range", min:5, max:120, step:1, default:35 },
    { key:"span",  label:"Span(mm)", type:"range", min:50, max:2000, step:10, default:520 },
  ],
  init(state, params){},
  render(ctx, out, state, params, geo) {
    const { TOTAL, worldX } = geo;

    for (let gi = 0; gi < TOTAL; gi++) {
      const k = gi*3;
      out[k+0] = params.baseR;
      out[k+1] = 0;
      out[k+2] = 0;
    }

    const t = ctx.t;
    const speed = params.speed;
    const sigma = Math.max(1e-6, params.sigma);
    const span  = Math.max(1e-6, params.span);
    const head = (-span*0.5) + ((t * speed) % span);

    for (let gi = 0; gi < TOTAL; gi++) {
      const dx = (worldX[gi] - ctx.originX) - head;
      const a = Math.exp(-(dx*dx)/(2*sigma*sigma));
      if (a < 0.01) continue;

      const k = gi*3;
      out[k+0] = clamp255(out[k+0] + 80*a);
      out[k+1] = clamp255(out[k+1] + 30*a);
      out[k+2] = clamp255(out[k+2] + 160*a);
    }
  }
};
