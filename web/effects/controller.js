import { clamp255 } from "../math.js";

export function createEffectsController({ registry, origin, geo }) {
  const order = Object.keys(registry);

  function buildDefaultParams(fxId) {
    const fx = registry[fxId];
    const obj = {};
    for (const p of (fx?.params || [])) {
      obj[p.key] = p.default;
    }
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
    if (fx?.init) {
      fx.init(baseState, activeParams);
    }
  }

  function setActive(id) {
    if (!registry[id]) {
      id = order[0];
    }
    activeId = id;
    activeParams = buildDefaultParams(activeId);
    resetBaseState();
  }

  function setParams(next) {
    activeParams = { ...activeParams, ...next };
  }

  function resetParams() {
    activeParams = buildDefaultParams(activeId);
  }

  function resetState() {
    resetBaseState();
  }

  function renderFrame(nowSec, outRGB) {
    const baseDt = baseLastT ? (nowSec - baseLastT) : (1 / 60);
    baseLastT = nowSec;

    outRGB.fill(0);
    const baseFx = registry[activeId];
    if (baseFx) {
      const baseCtx = { t: nowSec, dt: baseDt, originX: origin.x, originY: origin.y };
      baseFx.render(baseCtx, outRGB, baseState, activeParams, geo);
    }

    for (let i = 0; i < outRGB.length; i++) {
      outRGB[i] = clamp255(outRGB[i]);
    }

    return outRGB;
  }

  resetBaseState();

  return {
    getActiveId() {
      return activeId;
    },
    getActiveParams() {
      return { ...activeParams };
    },
    getOrder() {
      return order.slice();
    },
    getRegistry() {
      return registry;
    },
    onOriginChanged() {},
    renderFrame,
    resetParams,
    resetState,
    setActive,
    setParams,
  };
}
