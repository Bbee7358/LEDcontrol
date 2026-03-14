export const ROWS = 5;
export const COLS = 6;
export const BOARDS = ROWS * COLS;

export const LEDS_PER_BOARD = 48;
export const BOARD_TOTAL = BOARDS * LEDS_PER_BOARD;

export const TAPE_PIN = 11;
export const TAPE_LEDS = 300;

export const TOTAL = BOARD_TOTAL + TAPE_LEDS;
export const FRAME_LEN = TOTAL * 3;

export const BAUD = 1000000;
export const ORIGIN_FOLLOW_INTERVAL_SEC = 0.08;

export const BOARD_SPACING_MM = 400;
export const DEFAULT_BOARD_ROTATION_DEG = 225;
