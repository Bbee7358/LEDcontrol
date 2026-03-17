#include <Arduino.h>
#include <Adafruit_NeoPixel.h>

// ============================================================
// 5x6 board layout receiver for RP2040 / Arduino (Pico etc.)
//
// Assumptions:
// - 30 boards total
// - 48 NeoPixels per board
// - Board numbering is row-major: left->right, top->bottom
// - 5 outputs, one output per row
//   Row 1: boards 00-05  -> PIN0
//   Row 2: boards 06-11  -> PIN1
//   Row 3: boards 12-17  -> PIN2
//   Row 4: boards 18-23  -> PIN3
//   Row 5: boards 24-29  -> PIN4
// - Host sends one full RGB frame in this order:
//   board00[48], board01[48], ... board29[48]
// - Rotation (135 deg) is handled on the layout / sender side.
//   Firmware only routes LEDs by row/output.
//
// Packet format:
//   'N' 'P' + len(u16 LE) + seq(u16 LE) + payload[len]
//   payload = RGB byte stream, 3 bytes per pixel
// ============================================================

// ===== Serial =====
static const uint32_t BAUD = 1000000;
static const uint32_t READ_TIMEOUT_MS = 80;

// ===== Layout =====
static const uint8_t ROWS = 5;
static const uint8_t COLS = 6;
static const uint8_t BOARDS = ROWS * COLS;       // 30
static const uint16_t LEDS_PER_BOARD = 48;
static const uint16_t LEDS_PER_ROW = COLS * LEDS_PER_BOARD; // 288
static const uint16_t BOARD_TOTAL = BOARDS * LEDS_PER_BOARD; // 1440
static const uint16_t TAPE_LEDS = 0;
static const uint16_t TOTAL = BOARD_TOTAL + TAPE_LEDS;      // 1590
static const uint16_t FRAME_LEN = TOTAL * 3;                // 4770 bytes

// ===== Pins =====
static const uint8_t PIN0 = 0;
static const uint8_t PIN1 = 1;
static const uint8_t PIN2 = 2;
static const uint8_t PIN3 = 3;
static const uint8_t PIN4 = 4;
static const uint8_t PIN_TAPE = 11;

Adafruit_NeoPixel strip0(LEDS_PER_ROW, PIN0, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel strip1(LEDS_PER_ROW, PIN1, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel strip2(LEDS_PER_ROW, PIN2, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel strip3(LEDS_PER_ROW, PIN3, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel strip4(LEDS_PER_ROW, PIN4, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel stripTape(TAPE_LEDS, PIN_TAPE, NEO_GRB + NEO_KHZ800);

static Adafruit_NeoPixel* const strips[ROWS] = {
  &strip0, &strip1, &strip2, &strip3, &strip4
};

// ===== Double buffer =====
static uint8_t bufA[FRAME_LEN];
static uint8_t bufB[FRAME_LEN];
static uint8_t* frontBuf = bufA;
static uint8_t* backBuf  = bufB;

static uint16_t lastSeq = 0;
static bool hasFrame = false;

static bool readExact(uint8_t* dst, size_t n) {
  size_t got = 0;
  uint32_t start = millis();
  while (got < n) {
    if (Serial.available()) {
      int c = Serial.read();
      if (c >= 0) {
        dst[got++] = (uint8_t)c;
        start = millis();
      }
    } else {
      if (millis() - start > READ_TIMEOUT_MS) return false;
      delayMicroseconds(200);
    }
  }
  return true;
}

static void discardBytes(uint16_t len) {
  uint8_t dump[64];
  while (len) {
    uint16_t chunk = len > sizeof(dump) ? sizeof(dump) : len;
    if (!readExact(dump, chunk)) return;
    len -= chunk;
  }
}

static void showBootPattern() {
  // 起動確認用: 各行ごとに少し色を変える
  for (uint16_t i = 0; i < LEDS_PER_ROW; i++) strip0.setPixelColor(i, strip0.Color(20, 0, 0));
  for (uint16_t i = 0; i < LEDS_PER_ROW; i++) strip1.setPixelColor(i, strip1.Color(20, 10, 0));
  for (uint16_t i = 0; i < LEDS_PER_ROW; i++) strip2.setPixelColor(i, strip2.Color(0, 20, 0));
  for (uint16_t i = 0; i < LEDS_PER_ROW; i++) strip3.setPixelColor(i, strip3.Color(0, 0, 20));
  for (uint16_t i = 0; i < LEDS_PER_ROW; i++) strip4.setPixelColor(i, strip4.Color(12, 0, 12));
  strip0.show();
  strip1.show();
  strip2.show();
  strip3.show();
  strip4.show();
  for (uint16_t i = 0; i < TAPE_LEDS; i++) stripTape.setPixelColor(i, stripTape.Color(0, 8, 16));
  stripTape.show();
}

static inline void applyRowToStrip(Adafruit_NeoPixel& strip, const uint8_t* rgb, uint16_t ledCount) {
  for (uint16_t i = 0; i < ledCount; i++) {
    const uint16_t p = i * 3;
    const uint8_t r = rgb[p + 0];
    const uint8_t g = rgb[p + 1];
    const uint8_t b = rgb[p + 2];
    strip.setPixelColor(i, strip.Color(r, g, b));
  }
  strip.show();
}

// payload layout:
// row0: LEDs [0 .. 287]
// row1: LEDs [288 .. 575]
// row2: LEDs [576 .. 863]
// row3: LEDs [864 .. 1151]
// row4: LEDs [1152 .. 1439]
static void applyFrame(const uint8_t* rgb) {
  const uint32_t rowBytes = (uint32_t)LEDS_PER_ROW * 3U; // 864
  const uint32_t boardBytes = rowBytes * ROWS;

  applyRowToStrip(strip0, rgb + rowBytes * 0U, LEDS_PER_ROW);
  applyRowToStrip(strip1, rgb + rowBytes * 1U, LEDS_PER_ROW);
  applyRowToStrip(strip2, rgb + rowBytes * 2U, LEDS_PER_ROW);
  applyRowToStrip(strip3, rgb + rowBytes * 3U, LEDS_PER_ROW);
  applyRowToStrip(strip4, rgb + rowBytes * 4U, LEDS_PER_ROW);
  applyRowToStrip(stripTape, rgb + boardBytes, TAPE_LEDS);
}

void setup() {
  Serial.begin(BAUD);
  delay(500);

  strip0.begin();
  strip1.begin();
  strip2.begin();
  strip3.begin();
  strip4.begin();
  stripTape.begin();

  strip0.show();
  strip1.show();
  strip2.show();
  strip3.show();
  strip4.show();
  stripTape.show();

  showBootPattern();
}

void loop() {
  // ヘッダ探索 "N" "P"
  while (Serial.available() >= 2) {
    int a = Serial.read();
    if (a != 'N') continue;
    int b = Serial.read();
    if (b != 'P') continue;

    uint8_t meta[4];
    if (!readExact(meta, 4)) return;

    const uint16_t len = (uint16_t)meta[0] | ((uint16_t)meta[1] << 8);
    const uint16_t seq = (uint16_t)meta[2] | ((uint16_t)meta[3] << 8);

    if (len != FRAME_LEN) {
      if (len > 8192) return; // 安全策
      discardBytes(len);
      continue;
    }

    if (!readExact(backBuf, FRAME_LEN)) {
      // 途中受信は破棄
      continue;
    }

    uint8_t* tmp = frontBuf;
    frontBuf = backBuf;
    backBuf = tmp;

    lastSeq = seq;
    hasFrame = true;

    applyFrame(frontBuf);
    return; // 1 loop = 1 frame
  }

  delayMicroseconds(300);
}
