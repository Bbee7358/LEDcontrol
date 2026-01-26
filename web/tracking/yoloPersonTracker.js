import * as ort from "onnxruntime-web";

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function iou(a, b) {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  const inter = w * h;
  const ua = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter;
  return ua > 1e-9 ? inter / ua : 0;
}

function nms(boxes, iouThr = 0.45, topK = 20) {
  const sorted = boxes.slice().sort((p, q) => q.score - p.score);
  const keep = [];
  for (const b of sorted) {
    let ok = true;
    for (const k of keep) {
      if (iou(b, k) > iouThr) { ok = false; break; }
    }
    if (ok) keep.push(b);
    if (keep.length >= topK) break;
  }
  return keep;
}

export class YoloPersonTracker {
  constructor({
    modelUrl = "/models/yolov8n.onnx",
    inputSize = 640,
    minScore = 0.35,
    debugCanvas = null,
  } = {}) {
    this.modelUrl = modelUrl;
    this.inputSize = inputSize | 0;
    this.minScore = minScore;

    this.session = null;
    this.inputName = null;
    this.outputName = null;

    this._prepCanvas = document.createElement("canvas");
    this._prepCanvas.width = this.inputSize;
    this._prepCanvas.height = this.inputSize;
    this._prepCtx = this._prepCanvas.getContext("2d", { willReadFrequently: true });

    this.debugCanvas = debugCanvas;
    this._dbg = debugCanvas ? debugCanvas.getContext("2d") : null;

    this._busy = false;
    this._lastInferSec = 0;
    this._lastDet = null;

    // tracking state (single person)
    this._track = {
      has: false,
      box: { x0: 0, y0: 0, x1: 0, y1: 0 },
      vx: 0,
      vy: 0,
      lastSec: 0,
      miss: 0,
    };
  }

  get ready() { return !!this.session; }

  async load() {
    if (this.session) return;

    // wasm files are served from public/onnxruntime/ (postinstall copies them)
    ort.env.wasm.wasmPaths = new URL("./onnxruntime/", window.location.href).toString();
    ort.env.wasm.numThreads = 1;

    this.session = await ort.InferenceSession.create(this.modelUrl, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    this.inputName = this.session.inputNames[0];
    this.outputName = this.session.outputNames[0];
  }

  reset() {
    this._busy = false;
    this._lastInferSec = 0;
    this._lastDet = null;
    this._track.has = false;
    this._track.miss = 0;
  }

  /**
   * 非同期推論の結果を返す（推論は内部で間引き）。
   * @returns {{present:boolean, xNorm:number, yNorm:number, confidence:number, boxNorm?:{x0:number,y0:number,x1:number,y1:number}}}
   */
  tick(videoEl, nowSec, {
    inferFps = 12,
    iouMatch = 0.20,
    smooth = 0.25,
  } = {}) {
    if (!this.session || !videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
      return { present: false, xNorm: 0.5, yNorm: 0.5, confidence: 0 };
    }

    // kick inference if interval reached
    const interval = 1 / Math.max(1, inferFps);
    if (!this._busy && (nowSec - this._lastInferSec >= interval)) {
      this._busy = true;
      this._lastInferSec = nowSec;
      this._infer(videoEl).then((det) => {
        this._lastDet = det;
      }).catch((e) => {
        console.warn("[YOLO] infer failed", e);
        this._lastDet = null;
      }).finally(() => {
        this._busy = false;
      });
    }

    const det = this._lastDet;
    const tr = this._track;

    const dt = tr.lastSec ? Math.max(1e-3, nowSec - tr.lastSec) : (1 / 60);
    tr.lastSec = nowSec;

    // predict
    if (tr.has) {
      tr.box.x0 = clamp(tr.box.x0 + tr.vx * dt, 0, 1);
      tr.box.x1 = clamp(tr.box.x1 + tr.vx * dt, 0, 1);
      tr.box.y0 = clamp(tr.box.y0 + tr.vy * dt, 0, 1);
      tr.box.y1 = clamp(tr.box.y1 + tr.vy * dt, 0, 1);
    }

    let present = false;
    let conf = 0;

    if (det && det.present) {
      present = true;
      conf = det.confidence;

      if (!tr.has) {
        tr.box = { ...det.boxNorm };
        tr.vx = 0; tr.vy = 0;
        tr.has = true;
        tr.miss = 0;
      } else {
        const m = iou(tr.box, det.boxNorm);
        if (m >= iouMatch || tr.miss >= 2) {
          const pcx = (tr.box.x0 + tr.box.x1) * 0.5;
          const pcy = (tr.box.y0 + tr.box.y1) * 0.5;
          const dcx = (det.boxNorm.x0 + det.boxNorm.x1) * 0.5;
          const dcy = (det.boxNorm.y0 + det.boxNorm.y1) * 0.5;

          const sv = 0.35;
          tr.vx = lerp(tr.vx, (dcx - pcx) / dt, sv);
          tr.vy = lerp(tr.vy, (dcy - pcy) / dt, sv);

          const s = clamp(smooth, 0, 1);
          tr.box.x0 = lerp(tr.box.x0, det.boxNorm.x0, s);
          tr.box.y0 = lerp(tr.box.y0, det.boxNorm.y0, s);
          tr.box.x1 = lerp(tr.box.x1, det.boxNorm.x1, s);
          tr.box.y1 = lerp(tr.box.y1, det.boxNorm.y1, s);

          tr.miss = 0;
        } else {
          tr.miss++;
        }
      }
    } else {
      if (tr.has) tr.miss++;
      if (tr.miss >= 10) tr.has = false;
    }

    const box = tr.has ? tr.box : (det?.boxNorm ?? null);
    const xNorm = box ? clamp((box.x0 + box.x1) * 0.5, 0, 1) : 0.5;
    const yNorm = box ? clamp((box.y0 + box.y1) * 0.5, 0, 1) : 0.5;
    const confidence = tr.has ? Math.max(conf, det?.confidence ?? 0) : (det?.confidence ?? 0);

    if (this._dbg && this.debugCanvas) {
      this._drawDebug(videoEl, det?.boxNorm ?? null, tr.has ? tr.box : null, confidence);
    }

    return tr.has
      ? { present: true, xNorm, yNorm, confidence, boxNorm: { ...tr.box } }
      : { present: false, xNorm, yNorm, confidence: confidence || 0 };
  }

  _drawDebug(videoEl, detBox, trackBox, conf) {
    const dbg = this._dbg;
    const dw = this.debugCanvas.width, dh = this.debugCanvas.height;
    dbg.clearRect(0, 0, dw, dh);
    dbg.drawImage(videoEl, 0, 0, dw, dh);

    dbg.save();
    dbg.globalAlpha = 0.9;
    dbg.fillStyle = "rgba(0,0,0,0.35)";
    dbg.fillRect(0, 0, dw, 26);
    dbg.fillStyle = "rgba(255,255,255,0.9)";
    dbg.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    dbg.fillText(`yolo: ${trackBox ? "on" : "idle"}  conf:${(conf ?? 0).toFixed(2)}`, 8, 18);
    dbg.restore();

    const drawBox = (b, color) => {
      if (!b) return;
      const x0 = b.x0 * dw;
      const y0 = b.y0 * dh;
      const x1 = b.x1 * dw;
      const y1 = b.y1 * dh;
      dbg.save();
      dbg.strokeStyle = color;
      dbg.lineWidth = 2;
      dbg.strokeRect(x0, y0, x1 - x0, y1 - y0);
      const cx = (x0 + x1) * 0.5;
      const cy = (y0 + y1) * 0.5;
      dbg.fillStyle = color;
      dbg.beginPath();
      dbg.arc(cx, cy, 5.5, 0, Math.PI * 2);
      dbg.fill();
      dbg.restore();
    };

    drawBox(detBox, "rgba(125,211,252,0.95)");
    drawBox(trackBox, "rgba(52,211,153,0.95)");
  }

  async _infer(videoEl) {
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    const S = this.inputSize;
    const ctx = this._prepCtx;

    // letterbox
    const scale = Math.min(S / w, S / h);
    const nw = Math.round(w * scale);
    const nh = Math.round(h * scale);
    const px = Math.floor((S - nw) / 2);
    const py = Math.floor((S - nh) / 2);

    ctx.save();
    ctx.fillStyle = "rgb(114,114,114)";
    ctx.fillRect(0, 0, S, S);
    ctx.drawImage(videoEl, 0, 0, w, h, px, py, nw, nh);
    ctx.restore();

    const img = ctx.getImageData(0, 0, S, S);
    const data = img.data;

    const chw = new Float32Array(1 * 3 * S * S);
    const area = S * S;
    for (let i = 0; i < area; i++) {
      const k = i * 4;
      const r = data[k + 0] / 255;
      const g = data[k + 1] / 255;
      const b = data[k + 2] / 255;
      chw[i + 0 * area] = r;
      chw[i + 1 * area] = g;
      chw[i + 2 * area] = b;
    }

    const input = new ort.Tensor("float32", chw, [1, 3, S, S]);
    const feeds = { [this.inputName]: input };
    const out = await this.session.run(feeds);
    const y = out[this.outputName];

    const boxes = this._postprocess(y, { w, h, scale, px, py });
    const keep = nms(boxes, 0.45, 20);
    const best = keep[0];

    if (!best) return { present: false, xNorm: 0.5, yNorm: 0.5, confidence: 0 };

    return {
      present: true,
      confidence: best.score,
      boxNorm: {
        x0: clamp(best.x0 / w, 0, 1),
        y0: clamp(best.y0 / h, 0, 1),
        x1: clamp(best.x1 / w, 0, 1),
        y1: clamp(best.y1 / h, 0, 1),
      }
    };
  }

  _postprocess(outTensor, { w, h, scale, px, py }) {
    const data = outTensor.data;
    const dims = outTensor.dims;

    // support common YOLO export layouts:
    // [1, 84, 8400] or [1, 8400, 84]
    if (!Array.isArray(dims) || dims.length < 3) return [];

    const d1 = dims[1] | 0;
    const d2 = dims[2] | 0;

    let rows, cols, transposed;
    // cols = attributes, rows = anchors
    if (d1 <= 100 && d2 >= 1000) {
      cols = d1; rows = d2; transposed = true;  // [1, attrs, anchors]
    } else {
      rows = d1; cols = d2; transposed = false; // [1, anchors, attrs]
    }

    const hasObj = (cols === 85);
    const numClasses = cols - 4 - (hasObj ? 1 : 0);
    if (numClasses <= 0) return [];

    const minScore = this.minScore;
    const S = this.inputSize;
    const personId = 0;

    const boxes = [];
    for (let r = 0; r < rows; r++) {
      const get = (c) => {
        return transposed ? data[c * rows + r] : data[r * cols + c];
      };

      const cx = get(0);
      const cy = get(1);
      const bw = get(2);
      const bh = get(3);
      if (!(bw > 0 && bh > 0)) continue;

      const obj = hasObj ? get(4) : 1.0;

      // person score only
      const clsIdx = 4 + (hasObj ? 1 : 0) + personId;
      const cls = get(clsIdx);
      const score = obj * cls;
      if (score < minScore) continue;

      // model space -> original image space
      let x0 = (cx - bw * 0.5) - px;
      let y0 = (cy - bh * 0.5) - py;
      let x1 = (cx + bw * 0.5) - px;
      let y1 = (cy + bh * 0.5) - py;

      x0 /= scale; x1 /= scale;
      y0 /= scale; y1 /= scale;

      // clamp
      x0 = clamp(x0, 0, w);
      x1 = clamp(x1, 0, w);
      y0 = clamp(y0, 0, h);
      y1 = clamp(y1, 0, h);

      // reject too small
      const aw = x1 - x0;
      const ah = y1 - y0;
      if (aw < 6 || ah < 6) continue;

      // reject obviously bad numbers
      if (!Number.isFinite(x0 + y0 + x1 + y1)) continue;
      if (cx < -S || cy < -S || cx > S * 2 || cy > S * 2) continue;

      boxes.push({ x0, y0, x1, y1, score });
    }

    return boxes;
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

