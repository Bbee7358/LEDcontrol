export default {
  id: "allBlue",
  label: "All Blue",
  desc: "全480LEDを常時青(B=12)で点灯するだけの最小FX。originやpeopleは一切使わない。",
  params: [
    { key: "blue", label: "Blue", type: "range", min: 0, max: 255, step: 1, default: 12 }
  ],
  init(state, params) {},
  render(ctx, out, state, params, geo) {
    const { TOTAL } = geo;
    const b = Math.max(0, Math.min(255, (params.blue | 0)));
    for (let gi = 0; gi < TOTAL; gi++) {
      const k = gi * 3;
      out[k + 0] = 0;
      out[k + 1] = 0;
      out[k + 2] = b;
    }
  }
};
