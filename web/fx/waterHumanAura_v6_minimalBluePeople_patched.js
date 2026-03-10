const BUILD_TAG = "waterHumanAura_v6_minimalBluePeople_patched / 2026-03-10 JST";

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

export default {
  id: "waterHumanAura",
  label: "Blue Base + People (Minimal / origin fallback)",
  desc: "全域を青10で点灯し、人の半径500mmだけベース青を消して人物色へ完全差し替え。people未入力時はoriginを1人分の座標として使う",
  params: [
    { key:"baseBlue", label:"Base Blue", type:"range", min:0, max:64, step:1, default:10 },
    { key:"personRadiusMm", label:"Person Radius(mm)", type:"range", min:50, max:1500, step:10, default:500 },
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

    const baseBlue = clamp255(Number(params.baseBlue) || 10);
    const radius = Math.max(1, Number(params.personRadiusMm) || 500);
    const fallbackColor = hexToRgb(params.personColor || "#00ff88");

    const peopleInput = Array.isArray(ctx.people) ? ctx.people : [];
    const people = peopleInput.length > 0
      ? peopleInput
      : [{ x: Number(ctx.originX) || 0, y: Number(ctx.originY) || 0, color: params.personColor || "#00ff88", __fromOrigin: true }];

    for (let gi = 0; gi < TOTAL; gi++) {
      const k = gi * 3;
      out[k + 0] = 0;
      out[k + 1] = 0;
      out[k + 2] = baseBlue;
    }

    for (let gi = 0; gi < TOTAL; gi++) {
      const x = worldX[gi];
      const y = worldY[gi];

      let chosen = null;
      let bestD = Infinity;

      for (let i = 0; i < people.length; i++) {
        const p = people[i] || {};
        const px = Number(p.x);
        const py = Number(p.y);
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

        const dx = x - px;
        const dy = y - py;
        const d = Math.hypot(dx, dy);
        if (d > radius) continue;

        if (d < bestD) {
          bestD = d;
          chosen = hexToRgb(p.color || params.personColor || "#00ff88");
        }
      }

      if (chosen) {
        const k = gi * 3;
        out[k + 0] = clamp255(chosen.r);
        out[k + 1] = clamp255(chosen.g);
        out[k + 2] = clamp255(chosen.b);
      }
    }

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
