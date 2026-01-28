import { dist2, rad2deg } from "../utils/math.js";

export function initPointerHandlers({ dom, state, view, boards, BOARDS, rebuildWorld, syncSelectedUI, setOriginAtWorld }) {
  const mouse = state.mouse;
  const drag = state.drag;

  function pickBoardAt(sx, sy) {
    const mm = view.screenToMm(sx, sy);
    let best = 0, bestD = Infinity;
    for (let b = 0; b < BOARDS; b++) {
      const d = dist2(mm.x, mm.y, boards[b].cx, boards[b].cy);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (bestD <= 60 * 60) return best;
    return null;
  }

  function onPointerMove(e) {
    const rect = dom.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    mouse.sx = sx; mouse.sy = sy;

    const mm = view.screenToMm(sx, sy);
    state.lastMouseMm.x = mm.x;
    state.lastMouseMm.y = mm.y;

    dom.mouseInfo.textContent = `x: ${mm.x.toFixed(1)} mm / y: ${mm.y.toFixed(1)} mm`;

    if (!mouse.down || !mouse.dragging) return;

    const step = Math.max(1, Number(dom.snapMm.value) || 10);
    const snapEnabled = dom.snapOn.checked && !e.altKey;

    const bd = boards[drag.board];

    if (drag.mode === "move") {
      const dx = mm.x - drag.startMmX;
      const dy = mm.y - drag.startMmY;
      let nx = drag.startCx + dx;
      let ny = drag.startCy + dy;
      nx = snapEnabled ? Math.round(nx / step) * step : nx;
      ny = snapEnabled ? Math.round(ny / step) * step : ny;

      bd.cx = nx;
      bd.cy = ny;
    } else {
      const ang = Math.atan2(mm.y - bd.cy, mm.x - bd.cx);
      let dAng = ang - drag.startAngle;
      let nRot = drag.startRot + rad2deg(dAng);
      if (snapEnabled) nRot = Math.round(nRot / 5) * 5;
      bd.rotDeg = nRot;
    }

    rebuildWorld();
    if (drag.board === state.selectedBoard) syncSelectedUI();
  }

  function onPointerDown(e) {
    const rect = dom.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const mm = view.screenToMm(sx, sy);

    if (e.ctrlKey || e.metaKey) {
      setOriginAtWorld(mm.x, mm.y, e);
      return;
    }

    const picked = pickBoardAt(sx, sy);
    if (picked !== null) {
      state.selectedBoard = picked;
      dom.selBoard.value = String(state.selectedBoard);
      syncSelectedUI();
    }

    mouse.down = true;
    mouse.dragging = true;

    drag.board = state.selectedBoard;
    drag.mode = e.shiftKey ? "rot" : "move";

    const bd = boards[drag.board];
    drag.startCx = bd.cx;
    drag.startCy = bd.cy;
    drag.startRot = bd.rotDeg;
    drag.startMmX = mm.x;
    drag.startMmY = mm.y;
    drag.startAngle = Math.atan2(mm.y - bd.cy, mm.x - bd.cx);
  }

  function onPointerUp() {
    mouse.down = false;
    mouse.dragging = false;
  }

  dom.canvas.addEventListener("pointermove", onPointerMove);
  dom.canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      boards[state.selectedBoard] = { cx: 0, cy: 0, rotDeg: 0 };
      rebuildWorld();
      syncSelectedUI();
    }
  });
}
