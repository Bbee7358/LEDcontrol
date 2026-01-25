#include <Arduino.h>
#include <Adafruit_NeoPixel.h>

// ===== 設定 =====
static const uint8_t  LED_PIN  = 0;     // Pico GP0
static const uint16_t NUM_LEDS = 192;    // 最小構成：1基板=48
static const uint32_t BAUD     = 115200;

// ===== NeoPixel =====
Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

// ===== 受信バッファ =====
static const uint16_t FRAME_LEN = NUM_LEDS * 3;
uint8_t frameBuf[FRAME_LEN];

static bool readExact(uint8_t* dst, size_t n) {
  size_t got = 0;
  uint32_t start = millis();
  while (got < n) {
    if (Serial.available()) {
      int c = Serial.read();
      if (c < 0) continue;
      dst[got++] = (uint8_t)c;
      start = millis();
    } else {
      // タイムアウト（フリーズ回避）
      if (millis() - start > 200) return false;
      delay(1);
    }
  }
  return true;
}

static void applyFrame(const uint8_t* rgb, uint16_t nBytes) {
  // nBytes は 3*NUM_LEDS 前提
  for (uint16_t i = 0; i < NUM_LEDS; i++) {
    uint8_t r = rgb[i * 3 + 0];
    uint8_t g = rgb[i * 3 + 1];
    uint8_t b = rgb[i * 3 + 2];
    strip.setPixelColor(i, strip.Color(r, g, b));
  }
  strip.show();
}

void setup() {
  Serial.begin(BAUD);
  // USB Serial の立ち上がり待ち（環境により不要/必要）
  delay(800);

  strip.begin();
  strip.show();

  // 起動確認：赤(20/255)で点灯（あなたのデフォルト要望に合わせる）
  for (uint16_t i = 0; i < NUM_LEDS; i++) strip.setPixelColor(i, strip.Color(20, 0, 0));
  strip.show();
}

void loop() {
  // ヘッダ探索："N" "P"
  while (Serial.available() >= 2) {
    int a = Serial.read();
    if (a != 'N') continue;
    int b = Serial.read();
    if (b != 'P') continue;

    // len (uint16 little-endian)
    uint8_t lenBytes[2];
    if (!readExact(lenBytes, 2)) return;
    uint16_t len = (uint16_t)lenBytes[0] | ((uint16_t)lenBytes[1] << 8);

    // 最小構成は len==FRAME_LEN のみ受理（ズレたら捨てる）
    if (len != FRAME_LEN) {
      // len 分読み捨て（ただし大きすぎるのは安全のため中断）
      if (len > 4096) return;
      uint8_t dump[32];
      uint16_t left = len;
      while (left) {
        uint16_t chunk = left > sizeof(dump) ? sizeof(dump) : left;
        if (!readExact(dump, chunk)) break;
        left -= chunk;
      }
      continue;
    }

    if (!readExact(frameBuf, FRAME_LEN)) return;
    applyFrame(frameBuf, FRAME_LEN);
    return;
  }

  delay(1);
}
