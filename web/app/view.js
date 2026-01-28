import { clamp } from "./utils/math.js";
import { ZOOM_MIN, ZOOM_MAX } from "./constants.js";

export function createView({ canvas, ctx, mm2px }) {
  let DPR = 1;
  const view = {
    cx: 0,
    cy: 0,
    scale: 2.2,
  };

  function resize() {
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(window.innerWidth * DPR);
    canvas.height = Math.floor(window.innerHeight * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function mmToScreen(x_mm, y_mm) {
    const w = window.innerWidth, h = window.innerHeight;
    const sx = w * 0.5 + (x_mm - view.cx) * view.scale;
    const sy = h * 0.58 - (y_mm - view.cy) * view.scale;
    return { sx, sy };
  }

  function screenToMm(sx, sy) {
    const w = window.innerWidth, h = window.innerHeight;
    const x = view.cx + (sx - w * 0.5) / view.scale;
    const y = view.cy - (sy - h * 0.58) / view.scale;
    return { x, y };
  }

  function setZoom(newScale, anchorSx = window.innerWidth * 0.5, anchorSy = window.innerHeight * 0.58) {
    newScale = clamp(newScale, ZOOM_MIN, ZOOM_MAX);

    const before = screenToMm(anchorSx, anchorSy);
    view.scale = newScale;
    const after = screenToMm(anchorSx, anchorSy);

    view.cx += (before.x - after.x);
    view.cy += (before.y - after.y);

    mm2px.value = String(view.scale.toFixed(2));
  }

  function attachZoomControls({ btnZoomIn, btnZoomOut, btnZoomReset }) {
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const factor = Math.pow(1.14, -e.deltaY / 100);
      setZoom(view.scale * factor, sx, sy);
    }, { passive: false });

    btnZoomIn.addEventListener("click", () => setZoom(view.scale * 1.25));
    btnZoomOut.addEventListener("click", () => setZoom(view.scale / 1.25));
    btnZoomReset.addEventListener("click", () => setZoom(2.2));
  }

  window.addEventListener("resize", resize);
  resize();

  return {
    view,
    resize,
    mmToScreen,
    screenToMm,
    setZoom,
    attachZoomControls,
    getDpr: () => DPR,
  };
}
