import { loadEffects } from "../fx/loader.js";
import { BOARDS, LEDS_PER_BOARD, TOTAL, FRAME_LEN } from "./constants.js";
import { getDom } from "./dom.js";
import { createView } from "./view.js";
import { createGeometry } from "./geometry.js";
import { createOrigin } from "./origin.js";
import { createEffects } from "./fx/effects.js";
import { initFxUI } from "./fx/ui.js";
import { initLayoutIO } from "./layout/io.js";
import { initPointerHandlers } from "./input/mouse.js";
import { createSerial } from "./serial.js";
import { createRenderer } from "./render.js";
import { createColorProcessor } from "./color.js";
import { initTracking } from "./tracking/index.js";
import { initUI } from "./ui.js";
import { initLoop } from "./loop.js";

export async function boot() {
  const dom = getDom();

  const state = {
    running: false,
    rafId: null,
    lastTick: 0,
    lastDraw: 0,
    port: null,
    writer: null,
    sendInFlight: false,
    seq: 0,
    drops: 0,
    followOriginWithMouse: false,
    lastFollowUpdateT: 0,
    lastMouseMm: { x: 0, y: 0 },
    mouse: { sx: 0, sy: 0, down: false, dragging: false },
    drag: {
      board: 0,
      mode: "move",
      startCx: 0,
      startCy: 0,
      startRot: 0,
      startMmX: 0,
      startMmY: 0,
      startAngle: 0,
    },
    selectedBoard: 0,
    frameLen: FRAME_LEN,
    setStatus: null,
    setOriginAtWorld: null,
    stop: () => {},
    boards: null,
  };

  const view = createView({ canvas: dom.canvas, ctx: dom.ctx, mm2px: dom.mm2px });
  view.attachZoomControls({ btnZoomIn: dom.btnZoomIn, btnZoomOut: dom.btnZoomOut, btnZoomReset: dom.btnZoomReset });

  const geometry = createGeometry({ BOARDS, LEDS_PER_BOARD, TOTAL, FRAME_LEN });
  state.boards = geometry.boards;

  const color = createColorProcessor({
    dom,
    worldX: geometry.worldX,
    worldB: geometry.worldB,
    worldI: geometry.worldI,
    TOTAL,
    BOARDS,
  });

  const FX_REGISTRY = await loadEffects();
  const FX_ORDER = Object.keys(FX_REGISTRY);
  if (FX_ORDER.length === 0) {
    alert("FXがロードできませんでした。fx/manifest.json か fx/*.js を確認してください。");
  }

  const origin = { x: 0, y: 0 };
  const effects = createEffects({ registry: FX_REGISTRY, order: FX_ORDER, origin, GEO: geometry.GEO });

  const originWrap = createOrigin({ dom, effects, state, origin });
  state.setOriginAtWorld = originWrap.setOriginAtWorld;

  const ui = initUI({ dom, state, view, geometry, color });
  state.setStatus = ui.setStatus;

  const fxUI = initFxUI({ dom, effects });

  initLayoutIO({
    dom,
    effects,
    origin: originWrap.origin,
    boards: geometry.boards,
    BOARDS,
    LEDS_PER_BOARD,
    TOTAL,
    rebuildWorld: geometry.rebuildWorld,
    syncSelectedUI: ui.syncSelectedUI,
    rebuildFxParamsUI: fxUI.rebuildFxParamsUI,
    state,
    setStatus: ui.setStatus,
    syncOriginUI: originWrap.syncOriginUI,
  });

  const tracking = initTracking({
    dom,
    effects,
    origin: originWrap.origin,
    boards: geometry.boards,
    BOARDS,
    state,
    syncOriginUI: originWrap.syncOriginUI,
  });

  initPointerHandlers({
    dom,
    state,
    view,
    boards: geometry.boards,
    BOARDS,
    rebuildWorld: geometry.rebuildWorld,
    syncSelectedUI: ui.syncSelectedUI,
    setOriginAtWorld: originWrap.setOriginAtWorld,
  });

  const renderer = createRenderer({
    dom,
    view,
    origin: originWrap.origin,
    worldX: geometry.worldX,
    worldY: geometry.worldY,
    worldI: geometry.worldI,
    BOARDS,
    TOTAL,
    boards: geometry.boards,
    state,
  });

  const serial = createSerial({ dom, state, setStatus: ui.setStatus });

  if ("serial" in navigator) {
    navigator.serial.addEventListener("disconnect", (e) => {
      if (state.port && e.port === state.port) serial.disconnect();
    });
  }

  initLoop({ dom, state, effects, tracking, renderer, color, serial });

  return { dom, state, view, geometry, effects, tracking, serial };
}
