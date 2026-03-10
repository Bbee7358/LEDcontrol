const BUILD_TAG = "waterHumanAura_v6_minimalBluePeople / 2026-03-10 JST";

function clamp255(v){ return v < 0 ? 0 : v > 255 ? 255 : (v|0); }
function hexToRgb(hex) {
  if (typeof hex !== "string") return { r: 0, g: 255, b: 136 };
  let s = hex.trim();
  if (s.startsWith("#")) s = s.slice(1);
  if (s.length === 3) s = s.split("").map(ch => ch + ch).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return { r: 0, g: 255, b: 136 };
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function smoothstep01(x) {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

export default {
  id: "waterHumanAura",
  label: "Blue Base + People (Minimal)",
  desc: "全域を常時青12で点灯し、人物半径500mmだけ人物色に差し替える最小版",
  params: [
    { key:"baseBlue", label:"Base Blue", type:"range", min:0, max:64, step:1, default:12 },
    { key:"personRadiusMm", label:"Person Radius(mm)", type:"range", min:50, max:1500, step:10, default:500 },
    { key:"personSoftnessMm", label:"Person Soft Edge(mm)", type:"range", min:0, max:500, step:5, default:120 },
    { key:"personColor", label:"Fallback Person Color", type:"color", default:"#00ff88" },
    { key:"debugMarker", label:"Debug Marker", type:"checkbox", default:true }
  ],

  init(state, params) {
    state.build = BUILD_TAG;
    state.logged = false;
  },

  render(ctx, out, state, params, geo) {
    const { TOTAL, worldX, worldY } = geo;

    if (!state.logged) {
      console.log("[FX BUILD]", BUILD_TAG);
      window.__WATER_AURA_BUILD__ = BUILD_TAG;
      state.logged = true;
    }

    const baseBlue = clamp255(Number(params.baseBlue) || 12);
    const radius = Math.max(1, Number(params.personRadiusMm) || 500);
    const soft = Math.max(0, Number(params.personSoftnessMm) || 120);
    const fallbackColor = hexToRgb(params.personColor || "#00ff88");
    const people = Array.isArray(ctx.people) ? ctx.people : [];

    // 1) まず全域を必ず青12で埋める
    for (let gi = 0; gi < TOTAL; gi++) {
      const k = gi * 3;
      out[k + 0] = 0;
      out[k + 1] = 0;
      out[k + 2] = baseBlue;
    }

    // 2) 人物がいる範囲だけ、その人の色に「差し替える」
    //    青との加算はしない。人物圏内では青ベースを上書きする。
    for (let gi = 0; gi < TOTAL; gi++) {
      const x = worldX[gi];
      const y = worldY[gi];

      let bestA = 0;
      let bestColor = null;

      for (let i = 0; i < people.length; i++) {
        const p = people[i] || {};
        const px = Number(p.x);
        const py = Number(p.y);
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

        const dx = x - px;
        const dy = y - py;
        const d = Math.hypot(dx, dy);
        if (d > radius) continue;

        let a;
        if (soft <= 0) {
          a = 1;
        } else {
          const inner = Math.max(0, radius - soft);
          if (d <= inner) a = 1;
          else a = 1 - smoothstep01((d - inner) / Math.max(1e-6, soft));
        }

        if (a > bestA) {
          bestA = a;
          bestColor = hexToRgb(p.color || params.personColor || "#00ff88");
        }
      }

      if (bestA > 0 && bestColor) {
        const k = gi * 3;
        // 差し替え寄り。中心部では完全に人物色、端はなめらかに遷移。
        out[k + 0] = clamp255(Math.round(bestColor.r * bestA));
        out[k + 1] = clamp255(Math.round(bestColor.g * bestA));
        out[k + 2] = clamp255(Math.round(baseBlue * (1 - bestA) + bestColor.b * bestA));
      }
    }

    // 3) 読み込み確認用。先頭8LEDが短くマゼンタ点滅
    if (params.debugMarker) {
      const cycle = 2.5;
      const onWindow = 0.30;
      const tt = ((ctx.t % cycle) + cycle) % cycle;
      if (tt < onWindow) {
        const n = Math.min(8, TOTAL);
        for (let gi = 0; gi < n; gi++) {
          const k = gi * 3;
          out[k + 0] = 80;
          out[k + 1] = 0;
          out[k + 2] = 80;
        }
      }
    }
  }
};
