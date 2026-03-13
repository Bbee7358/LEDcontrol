// 30-board layout mapping for Raspberry Pi 4 outputs
// Layout rule:
// - 4 rows x 8 columns base
// - Column 1 only has boards at rows 2 and 3
// - Rows board counts: 7, 8, 8, 7
// - Numbering: left -> right, top -> bottom
// - One row = one output pin

const LEDS_PER_BOARD = 48;
const ROW_PIN_NAMES = ["GPIO0", "GPIO1", "GPIO2", "GPIO3"];

function buildBoardLayout() {
  const spacing = 600;
  const rows = 4;
  const cols = 8;
  const firstColMask = [false, true, true, false];

  const x0 = -((cols - 1) * spacing) / 2;
  const y0 = ((rows - 1) * spacing) / 2;

  const boards = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const hasBoard = (col === 0) ? firstColMask[row] : true;
      if (!hasBoard) continue;
      boards.push({
        cx: x0 + col * spacing,
        cy: y0 - row * spacing,
        row,
        col,
      });
    }
  }
  return boards;
}

function buildOutputMap() {
  const boards = buildBoardLayout();

  // top -> bottom, left -> right
  boards.sort((a, b) => {
    if (b.cy !== a.cy) return b.cy - a.cy;
    return a.cx - b.cx;
  });

  const rowGroups = [[], [], [], []];
  boards.forEach((b) => rowGroups[b.row].push(b));
  rowGroups.forEach(group => group.sort((a, b) => a.cx - b.cx));

  let boardNumber = 0;
  let globalLedStart = 0;

  const outputs = rowGroups.map((group, pinIndex) => {
    const boardsOnPin = group.map((b) => {
      const item = {
        boardNumber,
        pinIndex,
        pinName: ROW_PIN_NAMES[pinIndex],
        row: b.row + 1,
        col: b.col + 1,
        cx: b.cx,
        cy: b.cy,
        ledsPerBoard: LEDS_PER_BOARD,
        ledStart: globalLedStart,
        ledEnd: globalLedStart + LEDS_PER_BOARD - 1,
      };
      boardNumber += 1;
      globalLedStart += LEDS_PER_BOARD;
      return item;
    });

    return {
      pinIndex,
      pinName: ROW_PIN_NAMES[pinIndex],
      boardCount: boardsOnPin.length,
      ledCount: boardsOnPin.length * LEDS_PER_BOARD,
      ledStart: boardsOnPin.length ? boardsOnPin[0].ledStart : -1,
      ledEnd: boardsOnPin.length ? boardsOnPin[boardsOnPin.length - 1].ledEnd : -1,
      boards: boardsOnPin,
    };
  });

  return {
    ledsPerBoard: LEDS_PER_BOARD,
    totalBoards: boardNumber,
    totalLeds: globalLedStart,
    outputs,
  };
}

const OUTPUT_MAP = buildOutputMap();

function printSummary(map = OUTPUT_MAP) {
  console.log(`Total boards: ${map.totalBoards}`);
  console.log(`Total LEDs:   ${map.totalLeds}`);
  console.log("");
  map.outputs.forEach((out) => {
    console.log(`${out.pinName} / pin ${out.pinIndex}`);
    console.log(`  boards: ${out.boardCount}`);
    console.log(`  leds:   ${out.ledCount} (${out.boardCount} x ${LEDS_PER_BOARD})`);
    console.log(`  range:  ${out.ledStart} - ${out.ledEnd}`);
    out.boards.forEach((b) => {
      console.log(`    board ${String(b.boardNumber).padStart(2, "0")}  row ${b.row} col ${b.col}  LEDs ${b.ledStart}-${b.ledEnd}`);
    });
    console.log("");
  });
}

// Example for sending one row per GPIO pin:
function buildPinBuffersFromFrame(fullRgbFrame, map = OUTPUT_MAP) {
  const pinBuffers = map.outputs.map((out) => new Uint8Array(out.ledCount * 3));

  map.outputs.forEach((out, pinIndex) => {
    let dst = 0;
    out.boards.forEach((b) => {
      const srcStart = b.ledStart * 3;
      const srcEnd = (b.ledEnd + 1) * 3;
      pinBuffers[pinIndex].set(fullRgbFrame.subarray(srcStart, srcEnd), dst);
      dst += (b.ledEnd - b.ledStart + 1) * 3;
    });
  });

  return pinBuffers;
}

// Export for browser / Node.js
if (typeof window !== "undefined") {
  window.OUTPUT_MAP_30BOARDS_4PINS = OUTPUT_MAP;
  window.printOutputMap30Boards4Pins = () => printSummary(OUTPUT_MAP);
  window.buildPinBuffersFromFrame30Boards4Pins = (fullRgbFrame) => buildPinBuffersFromFrame(fullRgbFrame, OUTPUT_MAP);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LEDS_PER_BOARD,
    OUTPUT_MAP,
    buildOutputMap,
    printSummary,
    buildPinBuffersFromFrame,
  };
}
