#include <Arduino.h>
#include <Adafruit_NeoPixel.h>

// ===== 設定 =====
static const uint32_t BAUD = 1000000;

static const uint8_t  PIN0 = 0;
static const uint16_t NUM0 = 240; // GP0側

static const uint8_t  PIN1 = 1;
static const uint16_t NUM1 = 240; // GP1側

static const uint16_t TOTAL = NUM0 + NUM1;      // 480
static const uint16_t FRAME_LEN = TOTAL * 3;    // 1440 bytes

static const uint32_t READ_TIMEOUT_MS = 80;     // 30fps想定の余裕

Adafruit_NeoPixel strip0(NUM0, PIN0, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel strip1(NUM1, PIN1, NEO_GRB + NEO_KHZ800);

// ダブルバッファ
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

static void showDefaultRed() {
  for (uint16_t i = 0; i < NUM0; i++) strip0.setPixelColor(i, strip0.Color(20, 0, 0));
  for (uint16_t i = 0; i < NUM1; i++) strip1.setPixelColor(i, strip1.Color(20, 0, 0));
  strip0.show();
  strip1.show();
}

// payloadは global index 0..479 の RGB 配列
// 0..239 -> GP0, 240..479 -> GP1
static void applyFrame(const uint8_t* rgb) {
  // GP0 (0..239)
  for (uint16_t i = 0; i < NUM0; i++) {
    uint8_t r = rgb[i * 3 + 0];
    uint8_t g = rgb[i * 3 + 1];
    uint8_t b = rgb[i * 3 + 2];
    strip0.setPixelColor(i, strip0.Color(r, g, b));
  }

  // GP1 (240..479)
  const uint8_t* rgb1 = rgb + (NUM0 * 3);
  for (uint16_t i = 0; i < NUM1; i++) {
    uint8_t r = rgb1[i * 3 + 0];
    uint8_t g = rgb1[i * 3 + 1];
    uint8_t b = rgb1[i * 3 + 2];
    strip1.setPixelColor(i, strip1.Color(r, g, b));
  }

  strip0.show();
  strip1.show();
}

void setup() {
  Serial.begin(BAUD);
  delay(500);

  strip0.begin();
  strip1.begin();
  strip0.show();
  strip1.show();

  showDefaultRed();
}

void loop() {
  // ヘッダ探索 "N" "P"
  while (Serial.available() >= 2) {
    int a = Serial.read();
    if (a != 'N') continue;
    int b = Serial.read();
    if (b != 'P') continue;

    // len(u16LE) + seq(u16LE)
    uint8_t meta[4];
    if (!readExact(meta, 4)) return;

    uint16_t len = (uint16_t)meta[0] | ((uint16_t)meta[1] << 8);
    uint16_t seq = (uint16_t)meta[2] | ((uint16_t)meta[3] << 8);

    if (len != FRAME_LEN) {
      if (len > 4096) return; // 安全策
      discardBytes(len);
      continue;
    }

    if (!readExact(backBuf, FRAME_LEN)) {
      // 途中受信は破棄（チラつき防止）
      continue;
    }

    // swap
    uint8_t* tmp = frontBuf;
    frontBuf = backBuf;
    backBuf  = tmp;

    // 欠落検知したければここ（任意）
    // uint16_t expected = (uint16_t)(lastSeq + 1);
    // if (hasFrame && seq != expected) { /* drop */ }

    lastSeq = seq;
    hasFrame = true;

    applyFrame(frontBuf);
    return; // 1ループ1フレーム
  }

  delayMicroseconds(300);
}
