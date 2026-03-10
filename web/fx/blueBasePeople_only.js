function clamp255(v){ return v < 0 ? 0 : v > 255 ? 255 : (v|0); }

function hexToRgb(hex) {
  let s = String(hex || "#00ff00").trim();
  if (s.startsWith("#")) s = s.slice(1);
  if (s.length === 3) s = s.split("").map(ch => ch + ch).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return { r: 0, g: 255, b: 0 };
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

const BUILD_TAG = "blueBasePeople_only_v1 / 2026-03-10";
console.log(`[FX BUILD] ${BUILD_TAG}`);
window.__BLUE_BASE_PEOPLE_BUILD__ = BUILD_TAG;

export default {
  id: "blueBasePeopleOnly",
  label: "Blue Base + People Only",
  desc: "全域を常時青12で点灯し、人の半径500mmだけ人物色に差し替える。波紋なし。",
  params: [
    { key:"baseBlue",      label:"Base Blue", type:"range", min:0, max:255, step:1, default:12 },
    { key:"personRadiusMm",label:"Person Radius(mm)", type:"range", min:50, max:1500, step:10, default:500 },
    { key:"personFeatherMm",label:"Feather(mm)", type:"range", min:0, max:500, step:5, default:120 },
    { key:"personColor",   label:"Fallback Person Color", type:"color", default:"#00ff00" },
    { key:"debugBlink",    label:"Debug Blink", type:"checkbox", default:true },
  ],
  init(state, params){
    state.startedAt = 0;
  },
  render(ctx, out, state, params, geo) {
    const { TOTAL, worldX, worldY } = geo;
    const baseBlue = clamp255(Number(params.baseBlue) || 12);
    const radius = Math.max(1, Number(params.personRadiusMm) || 500);
    const feather = Math.max(0, Number(params.personFeatherMm) || 120);
    const fallbackColor = hexToRgb(params.personColor || "#00ff00");

    // 1) まず必ず全LEDを青12で埋める
    for (let gi = 0; gi < TOTAL; gi++) {
      const k = gi * 3;
      out[k + 0] = 0;
      out[k + 1] = 0;
      out[k + 2] = baseBlue;
    }

    // 2) 人がいれば、その半径内だけ人物色へ差し替え
    const people = Array.isArray(ctx.people) ? ctx.people : [];
    for (const p of people) {
      const px = Number(p?.x);
      const py = Number(p?.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

      const c = (typeof p?.color === "string") ? hexToRgb(p.color) : fallbackColor;

      for (let gi = 0; gi < TOTAL; gi++) {
        const dx = worldX[gi] - px;
        const dy = worldY[gi] - py;
        const d = Math.hypot(dx, dy);
        if (d > radius + feather) continue;

        let a = 1;
        if (feather > 0 && d > radius) {
          a = 1 - (d - radius) / feather;
          if (a <= 0) continue;
        }

        const k = gi * 3;

        // 半径内は青を足さず、人物色へ置換する
        out[k + 0] = clamp255(Math.round(c.r * a + out[k + 0] * (1 - a)));
        out[k + 1] = clamp255(Math.round(c.g * a + out[k + 1] * (1 - a)));
        out[k + 2] = clamp255(Math.round(c.b * a + out[k + 2] * (1 - a)));
      }
    }

    // 3) 新版読み込み確認用: 2.5秒ごとに0.18秒だけ先頭4LEDをマゼンタ点滅
    if (params.debugBlink) {
      const t = Number(ctx.t) || 0;
      const phase = t % 2.5;
      if (phase < 0.18) {
        const n = Math.min(4, TOTAL);
        for (let gi = 0; gi < n; gi++) {
          const k = gi * 3;
          out[k + 0] = 255;
          out[k + 1] = 0;
          out[k + 2] = 255;
        }
      }
    }
  }
};
