export const BOARDS = 10;
export const LEDS_PER_BOARD = 48;
export const TOTAL = BOARDS * LEDS_PER_BOARD;
export const FRAME_LEN = TOTAL * 3;
export const BAUD = 1_000_000;
export const POST_OPEN_DELAY_MS = 650;
export const ORIGIN_FOLLOW_INTERVAL_SEC = 0.08;

export const TRACK_CENTER_RATIO = 0.6;

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 25.0;

export const TRACK_TRAIL_MAX = 6;
export const TRACK_TRAIL_DECAY = 0.72;
export const SSE_STALE_MS = 1500;
