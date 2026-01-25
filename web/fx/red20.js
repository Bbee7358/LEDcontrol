export default {
  id: "red20",
  label: "Base: Red20",
  desc: "全LEDを赤20で点灯",
  params: [],
  init(state, params){},
  render(ctx, out, state, params, geo) {
    const { TOTAL } = geo;
    for (let gi = 0; gi < TOTAL; gi++) {
      const k = gi*3;
      out[k+0] = 20;
      out[k+1] = 0;
      out[k+2] = 0;
    }
  }
};
