function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export class MotionTracker {
  constructor({
    width = 160,
    height = 120,
    debugCanvas = null,
  } = {}) {
    this.width = width | 0;
    this.height = height | 0;
    this.video = null;
    this.stream = null;

    this._canvas = document.createElement("canvas");
    this._canvas.width = this.width;
    this._canvas.height = this.height;
    this._ctx = this._canvas.getContext("2d", { willReadFrequently: true });

    this._prevGray = new Uint8Array(this.width * this.height);
    this._hasPrev = false;

    this.debugCanvas = debugCanvas;
    this._dbg = debugCanvas ? debugCanvas.getContext("2d") : null;
  }

  get running() { return !!this.stream; }

  async start(videoEl, { facingMode = "user" } = {}) {
    if (!videoEl) throw new Error("video element required");
    this.video = videoEl;

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });

    this.video.srcObject = this.stream;
    await this.video.play();

    this._hasPrev = false;
  }

  stop() {
    if (this.video) {
      try { this.video.pause(); } catch {}
      this.video.srcObject = null;
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
    }
    this.stream = null;
    this._hasPrev = false;
  }

  /**
   * 1フレーム処理。
   * @returns {{present:boolean, xNorm:number, yNorm:number, confidence:number, box?:{x0:number,y0:number,x1:number,y1:number}}}
   */
  processFrame({
    diffThreshold = 18,
    minArea = 650,
  } = {}) {
    if (!this.video || !this.stream) {
      return { present: false, xNorm: 0.5, yNorm: 0.5, confidence: 0 };
    }

    const w = this.width, h = this.height;
    const ctx = this._ctx;

    ctx.drawImage(this.video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const data = img.data;

    let sumX = 0, sumY = 0, count = 0;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;

    const thr = clamp(diffThreshold | 0, 1, 80);

    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = (row + x);
        const k = i * 4;
        const r = data[k + 0], g = data[k + 1], b = data[k + 2];
        const gray = ((r * 3 + g * 4 + b) >> 3) & 0xff;

        const prev = this._prevGray[i];
        this._prevGray[i] = gray;

        if (!this._hasPrev) continue;

        const d = gray > prev ? (gray - prev) : (prev - gray);
        if (d < thr) continue;

        sumX += x;
        sumY += y;
        count++;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }

    this._hasPrev = true;

    const present = count >= (minArea | 0);
    const confidence = clamp(count / (w * h * 0.18), 0, 1);

    const xNorm = present ? clamp((sumX / Math.max(1, count)) / (w - 1), 0, 1) : 0.5;
    const yNorm = present ? clamp((sumY / Math.max(1, count)) / (h - 1), 0, 1) : 0.5;

    if (this._dbg && this.debugCanvas) {
      const dbg = this._dbg;
      const dw = this.debugCanvas.width, dh = this.debugCanvas.height;
      dbg.clearRect(0, 0, dw, dh);
      dbg.drawImage(this.video, 0, 0, dw, dh);

      dbg.save();
      dbg.globalAlpha = 0.9;
      dbg.fillStyle = "rgba(0,0,0,0.35)";
      dbg.fillRect(0, 0, dw, 26);
      dbg.fillStyle = "rgba(255,255,255,0.9)";
      dbg.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      dbg.fillText(`motion: ${present ? "on" : "off"}  area:${count}  conf:${confidence.toFixed(2)}`, 8, 18);
      dbg.restore();

      if (present) {
        const bx0 = (x0 / w) * dw;
        const by0 = (y0 / h) * dh;
        const bx1 = ((x1 + 1) / w) * dw;
        const by1 = ((y1 + 1) / h) * dh;

        dbg.save();
        dbg.strokeStyle = "rgba(125,211,252,0.95)";
        dbg.lineWidth = 2;
        dbg.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);

        const cx = xNorm * dw;
        const cy = yNorm * dh;
        dbg.fillStyle = "rgba(52,211,153,0.95)";
        dbg.beginPath();
        dbg.arc(cx, cy, 6, 0, Math.PI * 2);
        dbg.fill();
        dbg.restore();
      }
    }

    return present
      ? { present, xNorm, yNorm, confidence, box: { x0, y0, x1, y1 } }
      : { present, xNorm: 0.5, yNorm: 0.5, confidence };
  }
}

