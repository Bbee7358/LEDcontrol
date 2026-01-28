import { FRAME_LEN } from "../constants.js";
import { clamp255 } from "../utils/math.js";

export function createEffects({ registry, order, origin, GEO }) {
  function buildDefaultParams(fxId) {
    const fx = registry[fxId];
    const obj = {};
    for (const p of (fx?.params || [])) obj[p.key] = p.default;
    return obj;
  }

  let activeId = order[0] || "red20";
  let activeParams = buildDefaultParams(activeId);
  let baseState = {};
  let baseLastT = 0;

  function resetBaseState() {
    baseState = {};
    baseLastT = 0;
    const fx = registry[activeId];
    if (fx && fx.init) fx.init(baseState, activeParams);
  }

  function setActive(id) {
    if (!registry[id]) id = order[0];
    activeId = id;
    activeParams = buildDefaultParams(activeId);
    resetBaseState();
  }
  function setParams(next) { activeParams = { ...activeParams, ...next }; }
  function resetParams() { activeParams = buildDefaultParams(activeId); }
  function resetState() { resetBaseState(); layers.length = 0; }

  const layers = [];
  const tmpLayer = new Uint8Array(FRAME_LEN);

  const LAYER_MAX = 24;
  const LIFE_SEC = 1.6;
  const FADEOUT_SEC = 0.7;
  const LAYER_INTENSITY = 1.0;

  function spawnLayerFromCurrent(nowSec) {
    const id = activeId;
    const params = { ...activeParams };

    if ("baseR" in params) params.baseR = 0;

    const st = {};
    const fx = registry[id];
    if (fx && fx.init) fx.init(st, params);

    layers.push({
      id,
      params,
      state: st,
      born: nowSec,
      lastT: 0,
      originX: origin.x,
      originY: origin.y,
      timeBase: "abs",
    });

    if (layers.length > LAYER_MAX) layers.splice(0, layers.length - LAYER_MAX);
  }

  function spawnLayer(fxId, params, originX, originY, { nowSec = null, timeBase = "rel" } = {}) {
    const fx = registry[fxId];
    if (!fx) return;

    const p = params ? { ...params } : buildDefaultParams(fxId);
    if ("baseR" in p) p.baseR = 0;

    const st = {};
    if (fx.init) fx.init(st, p);

    const t0 = (nowSec != null) ? nowSec : (performance.now() / 1000);

    layers.push({
      id: fxId,
      params: p,
      state: st,
      born: t0,
      lastT: 0,
      originX,
      originY,
      timeBase: (timeBase === "abs") ? "abs" : "rel",
    });

    if (layers.length > LAYER_MAX) layers.splice(0, layers.length - LAYER_MAX);
  }

  function layerAlpha(age) {
    if (age >= LIFE_SEC) return 0;
    const fadeStart = Math.max(0, LIFE_SEC - FADEOUT_SEC);
    if (age <= fadeStart) return 1;
    const t = (age - fadeStart) / Math.max(1e-6, FADEOUT_SEC);
    return Math.max(0, 1 - t);
  }

  function mixLayerInto(out, layerRgb, a) {
    if (a <= 0) return;
    const k = a * LAYER_INTENSITY;
    for (let i = 0; i < out.length; i++) {
      out[i] = clamp255(out[i] + layerRgb[i] * k);
    }
  }

  function renderFrame(nowSec, outRGB) {
    const baseDt = baseLastT ? (nowSec - baseLastT) : (1 / 60);
    baseLastT = nowSec;

    const baseCtx = { t: nowSec, dt: baseDt, originX: origin.x, originY: origin.y };
    outRGB.fill(0);
    const baseFx = registry[activeId];
    if (baseFx) baseFx.render(baseCtx, outRGB, baseState, activeParams, GEO);

    for (let idx = layers.length - 1; idx >= 0; idx--) {
      const L = layers[idx];
      const age = nowSec - L.born;
      const a = layerAlpha(age);
      if (a <= 0) { layers.splice(idx, 1); continue; }

      const dt = L.lastT ? (nowSec - L.lastT) : (1 / 60);
      L.lastT = nowSec;

      const lt = (L.timeBase === "rel") ? age : nowSec;
      const ctxObj = { t: lt, dt, originX: L.originX, originY: L.originY };

      tmpLayer.fill(0);
      const fx = registry[L.id];
      if (fx) fx.render(ctxObj, tmpLayer, L.state, L.params, GEO);

      mixLayerInto(outRGB, tmpLayer, a);
    }

    return outRGB;
  }

  function onOriginChanged() {}
  function getRegistry() { return registry; }
  function getOrder() { return order.slice(); }
  function getActiveId() { return activeId; }
  function getActiveParams() { return { ...activeParams }; }

  resetBaseState();

  return {
    renderFrame,
    setActive,
    setParams,
    resetParams,
    resetState,
    getRegistry,
    getOrder,
    getActiveId,
    getActiveParams,
    onOriginChanged,
    spawnLayerFromCurrent,
    spawnLayer,
  };
}
