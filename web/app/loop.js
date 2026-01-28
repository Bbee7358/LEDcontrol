import { ORIGIN_FOLLOW_INTERVAL_SEC, TRACK_TRAIL_DECAY } from "./constants.js";

export function initLoop({ dom, state, effects, tracking, renderer, color, serial }) {
  const frameBuf = new Uint8Array(state.frameLen);

  function start() {
    if (!state.writer) return;
    state.running = true;
    dom.btnStart.disabled = true;
    dom.btnStop.disabled = false;
    state.setStatus("running", `fps: ${dom.fps.value}  seq: ${String(state.seq).padStart(4, "0")}`);
    state.lastTick = 0;
    state.rafId = requestAnimationFrame(loop);
  }

  function stop() {
    state.running = false;
    dom.btnStart.disabled = !state.writer;
    dom.btnStop.disabled = true;
    state.setStatus(state.writer ? "connected" : "idle",
      `fps: ${state.writer ? dom.fps.value : "--"}  seq: ${state.writer ? String(state.seq).padStart(4, "0") : "----"}`);
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }

  dom.btnStart.addEventListener("click", start);
  dom.btnStop.addEventListener("click", stop);

  function maybeUpdateOriginFollow(tNowSec) {
    if (!state.followOriginWithMouse) return;
    const dt = tNowSec - state.lastFollowUpdateT;
    if (dt < ORIGIN_FOLLOW_INTERVAL_SEC) return;

    state.lastFollowUpdateT = tNowSec;
    state.setOriginAtWorld(state.lastMouseMm.x, state.lastMouseMm.y, { altKey: false });
    effects.spawnLayerFromCurrent(tNowSec);
  }

  function loop(ts) {
    const targetFps = Math.max(10, Math.min(60, Number(dom.fps.value) || 30));
    const interval = 1000 / targetFps;

    if (!state.lastTick) state.lastTick = ts;
    const doFrame = (ts - state.lastTick >= interval);

    const drawInterval = 1000 / 30;
    const doDraw = (!state.lastDraw || (ts - state.lastDraw >= drawInterval));

    const tNowSec = performance.now() / 1000;
    tracking.updateTracking(tNowSec);
    maybeUpdateOriginFollow(tNowSec);

    let frame = null;

    if (doFrame && state.running) {
      state.lastTick = ts;
      frame = effects.renderFrame(tNowSec, frameBuf);
      if (tracking.trackState.trackHold.has) {
        for (let i = 0; i < tracking.trackState.trackTrail.length; i++) {
          const idx = tracking.trackState.trackTrail.length - 1 - i;
          const w = Math.pow(TRACK_TRAIL_DECAY, i);
          color.applyTrackingStripe(frame, tracking.trackState.trackTrail[idx], tNowSec, { strength: tracking.trackState.trackBoardConf * w, palette: "blue" });
        }
      }
      if (tracking.trackState.trackHold2.has) {
        for (let i = 0; i < tracking.trackState.trackTrail2.length; i++) {
          const idx = tracking.trackState.trackTrail2.length - 1 - i;
          const w = Math.pow(TRACK_TRAIL_DECAY, i);
          color.applyTrackingStripe(frame, tracking.trackState.trackTrail2[idx], tNowSec, { strength: tracking.trackState.trackBoardConf2 * w, palette: "greenorange" });
        }
      }
      color.applyLook(frame);
      color.applyGainGamma(frame);
      serial.sendFrame(frame);

      dom.statusSub.textContent = `fps: ${targetFps}  seq: ${String(state.seq).padStart(4, "0")}`;
    }

    if (doDraw) {
      state.lastDraw = ts;
      renderer.drawBackground();
      renderer.drawGrid();
      renderer.drawBoardsOutline();
      renderer.drawRings();
      renderer.drawOriginMarker();

      const rgb = frame || effects.renderFrame(tNowSec, frameBuf);

      const tmp = new Uint8Array(rgb);
      if (tracking.trackState.trackHold.has) {
        for (let i = 0; i < tracking.trackState.trackTrail.length; i++) {
          const idx = tracking.trackState.trackTrail.length - 1 - i;
          const w = Math.pow(TRACK_TRAIL_DECAY, i);
          color.applyTrackingStripe(tmp, tracking.trackState.trackTrail[idx], tNowSec, { strength: tracking.trackState.trackBoardConf * w, palette: "blue" });
        }
      }
      if (tracking.trackState.trackHold2.has) {
        for (let i = 0; i < tracking.trackState.trackTrail2.length; i++) {
          const idx = tracking.trackState.trackTrail2.length - 1 - i;
          const w = Math.pow(TRACK_TRAIL_DECAY, i);
          color.applyTrackingStripe(tmp, tracking.trackState.trackTrail2[idx], tNowSec, { strength: tracking.trackState.trackBoardConf2 * w, palette: "greenorange" });
        }
      }
      color.applyLook(tmp);
      color.applyGainGamma(tmp);

      renderer.drawLEDs(tmp);
    }

    state.rafId = requestAnimationFrame(loop);
  }

  state.stop = stop;

  state.rafId = requestAnimationFrame(loop);

  return { start, stop };
}
