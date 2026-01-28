import { deg2rad } from "./utils/math.js";

export function createGeometry({ BOARDS, LEDS_PER_BOARD, TOTAL, FRAME_LEN }) {
  function makeLocalLEDs48() {
    const pts = new Array(48);

    // 外周: dia92, 30, start 0deg, CCW -> index 0..29
    {
      const dia = 92, n = 30, startDeg = 0;
      const r = dia / 2;
      for (let i = 0; i < n; i++) {
        const a = deg2rad(startDeg + (360 * i / n));
        pts[i] = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      }
    }
    // 中: dia34, 12, start 15deg, CCW -> index 30..41
    {
      const dia = 34, n = 12, startDeg = 15;
      const r = dia / 2;
      for (let i = 0; i < n; i++) {
        const a = deg2rad(startDeg + (360 * i / n));
        pts[30 + i] = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      }
    }
    // 内: dia18, 6, start 0deg, CCW -> index 42..47
    {
      const dia = 18, n = 6, startDeg = 0;
      const r = dia / 2;
      for (let i = 0; i < n; i++) {
        const a = deg2rad(startDeg + (360 * i / n));
        pts[42 + i] = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      }
    }

    return pts;
  }

  const local48 = makeLocalLEDs48();

  const boards = [];
  function resetAllBoards() {
    boards.length = 0;
    const spacing = 140; // mm
    const startX = -((BOARDS - 1) * spacing) / 2;
    for (let b = 0; b < BOARDS; b++) {
      boards.push({ cx: startX + b * spacing, cy: 0, rotDeg: 0 });
    }
  }
  resetAllBoards();

  const worldX = new Float32Array(TOTAL);
  const worldY = new Float32Array(TOTAL);
  const worldB = new Uint16Array(TOTAL);
  const worldI = new Uint16Array(TOTAL);

  function rebuildWorld() {
    for (let b = 0; b < BOARDS; b++) {
      const bd = boards[b];
      const th = deg2rad(bd.rotDeg);
      const c = Math.cos(th), s = Math.sin(th);
      for (let i = 0; i < LEDS_PER_BOARD; i++) {
        const p = local48[i];
        const x = p.x * c - p.y * s + bd.cx;
        const y = p.x * s + p.y * c + bd.cy;
        const gi = b * LEDS_PER_BOARD + i;
        worldX[gi] = x;
        worldY[gi] = y;
        worldB[gi] = b;
        worldI[gi] = i;
      }
    }
  }
  rebuildWorld();

  const GEO = {
    worldX, worldY, worldB, worldI,
    TOTAL, FRAME_LEN, BOARDS, LEDS_PER_BOARD,
  };

  return {
    boards,
    worldX,
    worldY,
    worldB,
    worldI,
    GEO,
    local48,
    resetAllBoards,
    rebuildWorld,
  };
}
