import {
  BOARDS,
  BOARD_TOTAL,
  COLS,
  DEFAULT_BOARD_ROTATION_DEG,
  LEDS_PER_BOARD,
  ROWS,
  TAPE_LEDS,
  BOARD_SPACING_MM,
} from "./config.js";
import { deg2rad } from "./math.js";

const TAPE_ENTRY_COL_FROM_LEFT = 1;
const TAPE_ENTRY_ROW_FROM_BOTTOM = 3;

export function getTapeSharedBoardIndex() {
  const rowFromTop = ROWS - TAPE_ENTRY_ROW_FROM_BOTTOM;
  const colFromLeft = TAPE_ENTRY_COL_FROM_LEFT - 1;
  return rowFromTop * COLS + colFromLeft;
}

export function makeLocalLEDs48() {
  const pts = new Array(48);

  fillRing(pts, 0, 30, 92, 0);
  fillRing(pts, 30, 12, 34, 15);
  fillRing(pts, 42, 6, 18, 0);

  return pts;
}

function fillRing(target, offset, count, diameterMm, startDeg) {
  const r = diameterMm / 2;
  for (let i = 0; i < count; i++) {
    const a = deg2rad(startDeg + (360 * i / count));
    target[offset + i] = { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }
}

export function createDefaultBoards() {
  const boards = [];
  const x0 = -((COLS - 1) * BOARD_SPACING_MM) / 2;
  const y0 = ((ROWS - 1) * BOARD_SPACING_MM) / 2;
  const compressedBottomStartX = x0;
  const compressedBottomEndX = x0 + BOARD_SPACING_MM * 3;
  const compressedBottomStep = (compressedBottomEndX - compressedBottomStartX) / Math.max(1, COLS - 1);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const isBottomRow = row === ROWS - 1;
      const cx = isBottomRow
        ? compressedBottomStartX + compressedBottomStep * col
        : x0 + col * BOARD_SPACING_MM;

      boards.push({
        cx,
        cy: y0 - row * BOARD_SPACING_MM,
        rotDeg: DEFAULT_BOARD_ROTATION_DEG,
      });
    }
  }

  return boards;
}

export function createWorldBuffers() {
  return {
    boardWorldX: new Float32Array(BOARD_TOTAL),
    boardWorldY: new Float32Array(BOARD_TOTAL),
    boardWorldB: new Uint16Array(BOARD_TOTAL),
    boardWorldI: new Uint16Array(BOARD_TOTAL),
    tapeWorldX: new Float32Array(TAPE_LEDS),
    tapeWorldY: new Float32Array(TAPE_LEDS),
    tapeWorldI: new Uint16Array(TAPE_LEDS),
  };
}

export function rebuildWorldGeometry(boards, local48, world) {
  for (let b = 0; b < BOARDS; b++) {
    const bd = boards[b];
    const th = deg2rad(bd.rotDeg);
    const c = Math.cos(th);
    const s = Math.sin(th);
    for (let i = 0; i < LEDS_PER_BOARD; i++) {
      const p = local48[i];
      const x = p.x * c - p.y * s + bd.cx;
      const y = p.x * s + p.y * c + bd.cy;
      const gi = b * LEDS_PER_BOARD + i;
      world.boardWorldX[gi] = x;
      world.boardWorldY[gi] = y;
      world.boardWorldB[gi] = b;
      world.boardWorldI[gi] = i;
    }
  }

  const pitchMm = 16;
  const sharedBoard = boards[getTapeSharedBoardIndex()] || boards[0] || { cx: 0, cy: 0 };
  const startX = sharedBoard.cx;
  const startY = sharedBoard.cy;

  for (let i = 0; i < TAPE_LEDS; i++) {
    world.tapeWorldX[i] = startX + i * pitchMm;
    world.tapeWorldY[i] = startY;
    world.tapeWorldI[i] = i;
  }
}

export function resetBoardsInPlace(targetBoards) {
  const defaults = createDefaultBoards();
  targetBoards.length = 0;
  targetBoards.push(...defaults);
}

export function resetBoardInPlace(targetBoards, index) {
  const defaults = createDefaultBoards();
  targetBoards[index] = defaults[index];
}
