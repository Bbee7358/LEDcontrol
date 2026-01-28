import { deg2rad } from "./utils/math.js";

export function createRenderer({ dom, view, origin, worldX, worldY, worldI, BOARDS, TOTAL, boards, state }) {
  const { ctx } = dom;

  function drawBackground() {
    const w = window.innerWidth, h = window.innerHeight;
    ctx.fillStyle = "#070a10";
    ctx.fillRect(0, 0, w, h);

    const g1 = ctx.createRadialGradient(w * 0.68, h * 0.20, 0, w * 0.68, h * 0.20, Math.min(w, h) * 0.55);
    g1.addColorStop(0, "rgba(125,211,252,0.08)");
    g1.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, w, h);

    const g2 = ctx.createRadialGradient(w * 0.15, h * 0.40, 0, w * 0.15, h * 0.40, Math.min(w, h) * 0.55);
    g2.addColorStop(0, "rgba(167,139,250,0.06)");
    g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
  }

  function drawGrid() {
    if (!dom.showGrid.checked) return;
    const w = window.innerWidth, h = window.innerHeight;
    const stepMm = Math.max(5, Number(dom.snapMm.value) || 10);

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;

    const topLeft = view.screenToMm(0, 0);
    const botRight = view.screenToMm(w, h);

    const x0 = Math.floor(topLeft.x / stepMm) * stepMm;
    const x1 = Math.ceil(botRight.x / stepMm) * stepMm;
    const y0 = Math.floor(botRight.y / stepMm) * stepMm;
    const y1 = Math.ceil(topLeft.y / stepMm) * stepMm;

    for (let x = x0; x <= x1; x += stepMm) {
      const p = view.mmToScreen(x, 0);
      ctx.beginPath();
      ctx.moveTo(p.sx, 0);
      ctx.lineTo(p.sx, h);
      ctx.stroke();
    }
    for (let y = y0; y <= y1; y += stepMm) {
      const p = view.mmToScreen(0, y);
      ctx.beginPath();
      ctx.moveTo(0, p.sy);
      ctx.lineTo(w, p.sy);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = "rgba(125,211,252,0.20)";
    {
      const p = view.mmToScreen(0, 0);
      ctx.beginPath(); ctx.moveTo(p.sx, 0); ctx.lineTo(p.sx, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p.sy); ctx.lineTo(w, p.sy); ctx.stroke();
    }

    ctx.restore();
  }

  function drawBoardsOutline() {
    const dia = 100;
    for (let b = 0; b < BOARDS; b++) {
      const bd = boards[b];
      const c = view.mmToScreen(bd.cx, bd.cy);

      ctx.save();
      ctx.globalAlpha = (b === state.selectedBoard) ? 0.95 : 0.55;
      ctx.lineWidth = (b === state.selectedBoard) ? 2.0 : 1.0;
      ctx.strokeStyle = (b === state.selectedBoard) ? "rgba(125,211,252,0.45)" : "rgba(255,255,255,0.10)";

      ctx.beginPath();
      ctx.arc(c.sx, c.sy, (dia / 2) * view.view.scale, 0, Math.PI * 2);
      ctx.stroke();

      const th = deg2rad(bd.rotDeg);
      const hx = bd.cx + Math.cos(th) * (dia / 2);
      const hy = bd.cy + Math.sin(th) * (dia / 2);
      const hsp = view.mmToScreen(hx, hy);

      ctx.strokeStyle = (b === state.selectedBoard) ? "rgba(167,139,250,0.55)" : "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(c.sx, c.sy);
      ctx.lineTo(hsp.sx, hsp.sy);
      ctx.stroke();

      ctx.fillStyle = (b === state.selectedBoard) ? "rgba(233,239,250,.9)" : "rgba(233,239,250,.55)";
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      ctx.fillText(`b${b}`, c.sx + 8, c.sy - 10);

      ctx.restore();
    }
  }

  function drawRings() {
    if (!dom.showRings.checked) return;
    const rings = [92, 34, 18];
    for (let b = 0; b < BOARDS; b++) {
      const bd = boards[b];
      const c = view.mmToScreen(bd.cx, bd.cy);

      ctx.save();
      ctx.globalAlpha = (b === state.selectedBoard) ? 0.42 : 0.24;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      for (const d of rings) {
        ctx.beginPath();
        ctx.arc(c.sx, c.sy, (d / 2) * view.view.scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawOriginMarker() {
    if (!dom.showOrigin.checked) return;
    const p = view.mmToScreen(origin.x, origin.y);

    ctx.save();
    ctx.globalAlpha = 0.9;

    ctx.strokeStyle = "rgba(125,211,252,0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.sx - 10, p.sy);
    ctx.lineTo(p.sx + 10, p.sy);
    ctx.moveTo(p.sx, p.sy - 10);
    ctx.lineTo(p.sx, p.sy + 10);
    ctx.stroke();

    ctx.strokeStyle = "rgba(167,139,250,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(233,239,250,.85)";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillText("origin", p.sx + 14, p.sy - 12);

    ctx.restore();
  }

  function drawLEDs(rgb) {
    for (let gi = 0; gi < TOTAL; gi++) {
      const r = rgb[gi * 3 + 0], g = rgb[gi * 3 + 1], b = rgb[gi * 3 + 2];
      const p = view.mmToScreen(worldX[gi], worldY[gi]);

      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.98;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (dom.showIndex.checked) {
        ctx.save();
        ctx.fillStyle = "rgba(233,239,250,.45)";
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        ctx.fillText(String(worldI[gi]), p.sx + 5, p.sy + 3);
        ctx.restore();
      }
    }
  }

  return {
    drawBackground,
    drawGrid,
    drawBoardsOutline,
    drawRings,
    drawOriginMarker,
    drawLEDs,
  };
}
