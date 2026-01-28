import { MotionTracker } from "../../tracking/motionTracker.js";
import { YoloPersonTracker } from "../../tracking/yoloPersonTracker.js";
import { clamp, lerp } from "../utils/math.js";
import { attachEnterToCommit, commitNumberInput } from "../utils/input.js";
import { loadLocalStorageBoolean, loadLocalStorageNumber, loadLocalStorageString, saveLocalStorage } from "../utils/storage.js";
import { TRACK_CENTER_RATIO, TRACK_TRAIL_MAX, SSE_STALE_MS } from "../constants.js";

export function initTracking({ dom, effects, origin, boards, BOARDS, state, syncOriginUI }) {
  const trackState = {
    motionTracker: null,
    yoloTracker: null,
    yoloReady: false,
    lastTrackSec: 0,
    trackPresent: false,
    trackHold: { x: 0, y: 0, has: false },
    trackBoardConf: 0,
    trackPresent2: false,
    trackHold2: { x: 0, y: 0, has: false },
    trackBoardConf2: 0,
    trackTrail: [],
    trackTrail2: [],
    sse: null,
    sseStatus: "idle",
    sseError: "",
    sseTracksByCameraIndex: {},
    sseTracksAtByCameraIndex: {},
    sseCameras: [],
    trackMap: {
      xMin: Number(dom.trackXMin.value) || -630,
      xMax: Number(dom.trackXMax.value) || 630,
      yMin: Number(dom.trackYMin.value) || -350,
      yMax: Number(dom.trackYMax.value) || 350,
    },
  };

  dom.trackUseSse.checked = loadLocalStorageBoolean("tracking.useSse", false);
  dom.trackSseUrl.value = loadLocalStorageString("tracking.sseUrl", dom.trackSseUrl.value || "");
  dom.trackSseCam.value = String(loadLocalStorageNumber("tracking.cameraIndex", Number(dom.trackSseCam.value) || 0));

  function syncTrackMapFromUI() {
    trackState.trackMap.xMin = Number(dom.trackXMin.value) || trackState.trackMap.xMin;
    trackState.trackMap.xMax = Number(dom.trackXMax.value) || trackState.trackMap.xMax;
    trackState.trackMap.yMin = Number(dom.trackYMin.value) || trackState.trackMap.yMin;
    trackState.trackMap.yMax = Number(dom.trackYMax.value) || trackState.trackMap.yMax;
  }

  function commitTrackMapInput(inputEl, key) {
    commitNumberInput(
      inputEl,
      () => trackState.trackMap[key],
      (v) => { trackState.trackMap[key] = v; },
      { allowEmptyToZero: false, post: () => { syncTrackMapFromUI(); } }
    );
  }

  dom.trackXMin.addEventListener("change", () => commitTrackMapInput(dom.trackXMin, "xMin"));
  dom.trackXMax.addEventListener("change", () => commitTrackMapInput(dom.trackXMax, "xMax"));
  dom.trackYMin.addEventListener("change", () => commitTrackMapInput(dom.trackYMin, "yMin"));
  dom.trackYMax.addEventListener("change", () => commitTrackMapInput(dom.trackYMax, "yMax"));
  attachEnterToCommit(dom.trackXMin, () => commitTrackMapInput(dom.trackXMin, "xMin"));
  attachEnterToCommit(dom.trackXMax, () => commitTrackMapInput(dom.trackXMax, "xMax"));
  attachEnterToCommit(dom.trackYMin, () => commitTrackMapInput(dom.trackYMin, "yMin"));
  attachEnterToCommit(dom.trackYMax, () => commitTrackMapInput(dom.trackYMax, "yMax"));

  function resetTrackingState() {
    trackState.trackPresent = false;
    trackState.trackHold.has = false;
    trackState.trackBoardConf = 0;
    trackState.lastTrackSec = 0;
    trackState.trackTrail.length = 0;
    trackState.trackPresent2 = false;
    trackState.trackHold2.has = false;
    trackState.trackBoardConf2 = 0;
    trackState.trackTrail2.length = 0;
  }

  function syncCameraButtons() {
    if (dom.trackUseSse.checked) {
      dom.btnCamStart.disabled = true;
      dom.btnCamStop.disabled = true;
      return;
    }
    const running = !!(trackState.motionTracker && trackState.motionTracker.running);
    dom.btnCamStart.disabled = running;
    dom.btnCamStop.disabled = !running;
  }

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function updateSseStatusLine() {
    if (!dom.trackSseStatus) return;
    if (!dom.trackUseSse.checked) {
      dom.trackSseStatus.textContent = "sse: off";
      return;
    }
    const base = `sse: ${trackState.sseStatus}`;
    dom.trackSseStatus.textContent = trackState.sseError ? `${base} (${trackState.sseError})` : base;
  }

  function setSseStatus(status, err = "") {
    trackState.sseStatus = status;
    trackState.sseError = err;
    updateSseStatusLine();
  }

  function closeSse() {
    if (trackState.sse) {
      try { trackState.sse.close(); } catch {}
    }
    trackState.sse = null;
    setSseStatus("idle", "");
  }

  function openSse() {
    closeSse();
    if (!dom.trackUseSse.checked) return;
    const url = (dom.trackSseUrl.value || "").trim();
    if (!url) {
      setSseStatus("idle", "urlなし");
      return;
    }

    trackState.sseTracksByCameraIndex = {};
    trackState.sseTracksAtByCameraIndex = {};
    trackState.sseCameras = [];

    setSseStatus("connecting", "");
    try {
      trackState.sse = new EventSource(url);
    } catch (e) {
      setSseStatus("error", "接続失敗");
      return;
    }

    trackState.sse.addEventListener("open", () => {
      setSseStatus("open", "");
    });
    trackState.sse.addEventListener("error", () => {
      if (trackState.sse.readyState === EventSource.CONNECTING) {
        setSseStatus("connecting", "再接続中");
      } else {
        setSseStatus("error", "接続失敗");
      }
    });
    trackState.sse.addEventListener("hello", (event) => {
      const data = safeJsonParse(event.data);
      if (!data || data.type !== "hello") return;
      trackState.sseCameras = Array.isArray(data.cameras) ? data.cameras : [];
    });
    trackState.sse.addEventListener("tracks", (event) => {
      const data = safeJsonParse(event.data);
      if (!data || data.type !== "tracks") return;
      const camIndex = Number(data.cameraIndex);
      if (!Number.isFinite(camIndex)) return;
      trackState.sseTracksByCameraIndex[camIndex] = data;
      trackState.sseTracksAtByCameraIndex[camIndex] = Date.now();
    });
    trackState.sse.addEventListener("ping", () => {});
  }

  function commitTrackSseCam() {
    commitNumberInput(dom.trackSseCam, () => Number(dom.trackSseCam.value) || 0, (v) => {
      dom.trackSseCam.value = String(Math.round(v));
    }, {
      allowEmptyToZero: true,
      post: () => { saveLocalStorage("tracking.cameraIndex", dom.trackSseCam.value); },
    });
  }

  dom.trackUseSse.addEventListener("change", () => {
    saveLocalStorage("tracking.useSse", String(dom.trackUseSse.checked));
    if (dom.trackUseSse.checked) {
      stopCamera();
      openSse();
      setCamOverlayVisible(false);
    } else {
      closeSse();
    }
    resetTrackingState();
    syncCameraButtons();
  });

  dom.trackSseUrl.addEventListener("change", () => {
    dom.trackSseUrl.value = (dom.trackSseUrl.value || "").trim();
    saveLocalStorage("tracking.sseUrl", dom.trackSseUrl.value);
    if (dom.trackUseSse.checked) openSse();
  });

  dom.trackSseCam.addEventListener("change", commitTrackSseCam);
  attachEnterToCommit(dom.trackSseCam, commitTrackSseCam);

  function setCamOverlayVisible(on) {
    if (dom.camOverlay) dom.camOverlay.hidden = !on;
  }
  setCamOverlayVisible(false);

  async function startCamera() {
    if (dom.trackUseSse.checked) {
      alert("外部SSEを使用中です。ローカルカメラを使うにはSSEをOFFにしてください。");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("このブラウザではカメラが使えません。");
      return;
    }
    try {
      if (!trackState.motionTracker) trackState.motionTracker = new MotionTracker({ width: 160, height: 120, debugCanvas: dom.camDebugCanvas });
      await trackState.motionTracker.start(dom.camVideo, { facingMode: "user" });
      dom.btnCamStart.disabled = true;
      dom.btnCamStop.disabled = false;
      setCamOverlayVisible(dom.trackDebug.checked);
      dom.trackInfo.textContent = "track: yolo loading...";
      trackState.trackHold.has = false;
      trackState.trackPresent = false;
      trackState.lastTrackSec = 0;

      try {
        if (!trackState.yoloTracker) trackState.yoloTracker = new YoloPersonTracker({ modelUrl: "./models/yolov8n.onnx", debugCanvas: dom.camDebugCanvas });
        await trackState.yoloTracker.load();
        trackState.yoloTracker.reset();
        trackState.yoloReady = true;
        dom.trackInfo.textContent = "track: yolo ready";
      } catch (e) {
        console.error(e);
        trackState.yoloReady = false;
        const errText = String(e?.message ?? e ?? "").toLowerCase();
        if (
          errText.includes("ort-wasm") ||
          errText.includes("no available backend") ||
          errText.includes("failed to fetch") ||
          errText.includes("404")
        ) {
          dom.trackInfo.textContent = "track: yolo failed (onnxruntime missing)";
        } else {
          dom.trackInfo.textContent = "track: yolo failed (model?)";
        }
      }
    } catch (e) {
      console.error(e);
      dom.trackInfo.textContent = "track: camera failed";
    }
    syncCameraButtons();
  }

  function stopCamera() {
    if (trackState.motionTracker) trackState.motionTracker.stop();
    if (trackState.yoloTracker) trackState.yoloTracker.reset();
    trackState.yoloReady = false;
    syncCameraButtons();
    setCamOverlayVisible(false);
    dom.trackInfo.textContent = "track: off";
    trackState.trackHold.has = false;
    trackState.trackPresent = false;
    trackState.lastTrackSec = 0;
  }

  dom.btnCamStart.addEventListener("click", startCamera);
  dom.btnCamStop.addEventListener("click", stopCamera);
  dom.trackDebug.addEventListener("change", () => {
    setCamOverlayVisible(dom.trackDebug.checked && !dom.trackUseSse.checked && !!(trackState.motionTracker && trackState.motionTracker.running));
  });

  function pickBestTrack(tracks, targetId) {
    if (!Array.isArray(tracks) || tracks.length === 0) return null;
    if (targetId != null) {
      const found = tracks.find((t) => Number(t.id) === Number(targetId));
      if (found) return found;
    }
    return tracks.reduce((best, t) => {
      const a = Number(t.areaN) || 0;
      const b = Number(best.areaN) || 0;
      return a > b ? t : best;
    }, tracks[0]);
  }

  function pickSecondTrack(tracks, primary) {
    if (!Array.isArray(tracks) || tracks.length === 0) return null;
    const primaryId = primary ? Number(primary.id) : null;
    let best = null;
    let bestArea = -1;
    for (const t of tracks) {
      if (primaryId != null && Number(t.id) === primaryId) continue;
      const area = Number(t.areaN) || 0;
      if (area > bestArea) {
        best = t;
        bestArea = area;
      }
    }
    return best;
  }

  function pushTrackTrail(trail, xMm) {
    trail.push(xMm);
    if (trail.length > TRACK_TRAIL_MAX) {
      trail.splice(0, trail.length - TRACK_TRAIL_MAX);
    }
  }

  function getSseTracks(sens) {
    const camIndex = Number(dom.trackSseCam.value) || 0;
    const msg = trackState.sseTracksByCameraIndex[camIndex];
    const lastAt = trackState.sseTracksAtByCameraIndex[camIndex] || 0;
    if (!msg) return { primary: null, secondary: null };
    if (Date.now() - lastAt > SSE_STALE_MS) return { primary: null, secondary: null };

    const trackA = pickBestTrack(msg.tracks, msg.targetId);
    const trackB = pickSecondTrack(msg.tracks, trackA);

    const toRes = (track) => {
      if (!track) return null;
      let x = Array.isArray(track.centerN) ? Number(track.centerN[0]) : 0.5;
      let y = Array.isArray(track.centerN) ? Number(track.centerN[1]) : 0.5;
      if (!Number.isFinite(x)) x = 0.5;
      if (!Number.isFinite(y)) y = 0.5;
      x = clamp(x, 0, 1);
      y = clamp(y, 0, 1);
      const conf = Number.isFinite(track.conf) ? Number(track.conf) : 0;
      const minConf = lerp(0.60, 0.25, sens);
      const present = conf >= minConf;
      return { present, xNorm: x, yNorm: y, confidence: conf };
    };

    return { primary: toRes(trackA), secondary: toRes(trackB) };
  }

  function remapCenterRange(v, ratio = TRACK_CENTER_RATIO) {
    const r = Math.max(0.01, Math.min(1, ratio));
    const m = (1 - r) * 0.5;
    return clamp((v - m) / r, 0, 1);
  }

  function mapTrackingToMm(res) {
    let x = clamp(Number(res.xNorm ?? 0.5), 0, 1);
    let y = clamp(Number(res.yNorm ?? 0.5), 0, 1);

    if (dom.trackMirrorX.checked) x = 1 - x;
    if (dom.trackInvertY.checked) y = 1 - y;

    x = remapCenterRange(x, TRACK_CENTER_RATIO);
    y = 0.5;

    const mmX = lerp(trackState.trackMap.xMin, trackState.trackMap.xMax, x);
    const mmY = lerp(trackState.trackMap.yMin, trackState.trackMap.yMax, y);
    return { xNorm: x, yNorm: y, mmX, mmY };
  }

  function applyTrackingResult(res, tNowSec) {
    let present = !!res.present;
    const conf = Number.isFinite(res.confidence) ? Number(res.confidence) : 0;
    const { mmX, mmY, yNorm } = mapTrackingToMm(res);

    let boardId = 0;
    {
      let best = 0;
      let bestD = Infinity;
      for (let b = 0; b < BOARDS; b++) {
        const d = Math.abs(mmX - boards[b].cx);
        if (d < bestD) { bestD = d; best = b; }
      }
      boardId = best;
    }

    if (present && !trackState.trackPresent) {
      effects.spawnLayer(
        "ripple",
        { baseR: 0, speed: 260, period: 1.05, width: 0.10 },
        mmX,
        mmY,
        { nowSec: tNowSec, timeBase: "rel" }
      );
    }
    trackState.trackPresent = present;

    if (present) {
      trackState.trackBoardConf = conf;
    } else {
      trackState.trackBoardConf = 0;
    }

    if (present) {
      const smooth = Math.max(0, Math.min(1, Number(dom.trackSmooth.value) || 0.25));
      if (!trackState.trackHold.has) {
        trackState.trackHold.x = mmX; trackState.trackHold.y = mmY; trackState.trackHold.has = true;
      } else {
        trackState.trackHold.x = lerp(trackState.trackHold.x, mmX, smooth);
        trackState.trackHold.y = lerp(trackState.trackHold.y, mmY, smooth);
      }
    } else {
      trackState.trackHold.has = false;
    }

    if (present && trackState.trackHold.has) {
      pushTrackTrail(trackState.trackTrail, trackState.trackHold.x);
    } else if (!present) {
      trackState.trackTrail.length = 0;
    }

    if (dom.trackEnable.checked && trackState.trackHold.has) {
      state.followOriginWithMouse = false;
      dom.mInfo.textContent = "m: off";
      origin.x = trackState.trackHold.x;
      syncOriginUI();
      effects.onOriginChanged();
    }

    return { present, boardId, conf, yNorm };
  }

  function applySecondaryTracking(res) {
    let present = !!res.present;
    const conf = Number.isFinite(res.confidence) ? Number(res.confidence) : 0;
    const { mmX, mmY } = mapTrackingToMm(res);

    if (present) {
      const smooth = Math.max(0, Math.min(1, Number(dom.trackSmooth.value) || 0.25));
      if (!trackState.trackHold2.has) {
        trackState.trackHold2.x = mmX; trackState.trackHold2.y = mmY; trackState.trackHold2.has = true;
      } else {
        trackState.trackHold2.x = lerp(trackState.trackHold2.x, mmX, smooth);
        trackState.trackHold2.y = lerp(trackState.trackHold2.y, mmY, smooth);
      }
    } else {
      trackState.trackHold2.has = false;
    }

    if (present && trackState.trackHold2.has) {
      pushTrackTrail(trackState.trackTrail2, trackState.trackHold2.x);
    } else if (!present) {
      trackState.trackTrail2.length = 0;
    }

    trackState.trackPresent2 = present;
    trackState.trackBoardConf2 = present ? conf : 0;
    return { present, conf };
  }

  function updateTracking(tNowSec) {
    const TRACK_FPS = 15;
    if (tNowSec - trackState.lastTrackSec < 1 / TRACK_FPS) return;
    trackState.lastTrackSec = tNowSec;

    syncTrackMapFromUI();

    const sens = Math.max(0, Math.min(1, Number(dom.trackSens.value) || 0.55));

    if (dom.trackUseSse.checked) {
      if (trackState.sseStatus !== "open") {
        trackState.trackPresent = false;
        trackState.trackHold.has = false;
        trackState.trackBoardConf = 0;
        trackState.trackPresent2 = false;
        trackState.trackHold2.has = false;
        trackState.trackBoardConf2 = 0;
        dom.trackInfo.textContent = `track: sse ${trackState.sseStatus}`;
        return;
      }
      const { primary, secondary } = getSseTracks(sens);
      if (!primary && !secondary) {
        trackState.trackPresent = false;
        trackState.trackHold.has = false;
        trackState.trackBoardConf = 0;
        trackState.trackPresent2 = false;
        trackState.trackHold2.has = false;
        trackState.trackBoardConf2 = 0;
        dom.trackInfo.textContent = "track: sse idle";
        return;
      }
      let infoA = null;
      if (primary && primary.present) {
        infoA = applyTrackingResult(primary, tNowSec);
      } else {
        trackState.trackPresent = false;
        trackState.trackHold.has = false;
        trackState.trackBoardConf = 0;
        trackState.trackTrail.length = 0;
      }

      let infoB = null;
      if (secondary && secondary.present) {
        infoB = applySecondaryTracking(secondary);
      } else {
        trackState.trackPresent2 = false;
        trackState.trackHold2.has = false;
        trackState.trackBoardConf2 = 0;
        trackState.trackTrail2.length = 0;
      }

      const people = (infoA?.present ? 1 : 0) + (infoB?.present ? 1 : 0);
      const confA = infoA ? infoA.conf.toFixed(2) : "--";
      const confB = infoB ? infoB.conf.toFixed(2) : "--";
      dom.trackInfo.textContent = `track: sse ${people > 0 ? "on" : "idle"}  people:${people}  conf:${confA}/${confB}`;
      return;
    }

    if (!trackState.motionTracker || !trackState.motionTracker.running) return;

    let res = { present: false, xNorm: 0.5, yNorm: 0.5, confidence: 0 };
    let modeLabel = "motion";
    if (trackState.yoloTracker && trackState.yoloReady) {
      trackState.yoloTracker.minScore = lerp(0.60, 0.25, sens);
      const smooth = Math.max(0, Math.min(1, Number(dom.trackSmooth.value) || 0.25));
      res = trackState.yoloTracker.tick(dom.camVideo, tNowSec, { inferFps: 12, smooth });
      modeLabel = "yolo";
    } else {
      const diffThreshold = Math.round(lerp(32, 12, sens));
      const minArea = Math.round(lerp(1200, 280, sens));
      res = trackState.motionTracker.processFrame({ diffThreshold, minArea });
    }

    const info = applyTrackingResult(res, tNowSec);
    dom.trackInfo.textContent = `track: ${modeLabel} ${info.present ? "on" : "idle"}  b:${info.boardId}  conf:${info.conf.toFixed(2)}`;
  }

  dom.trackInfo.textContent = "track: off";
  updateSseStatusLine();
  syncCameraButtons();
  if (dom.trackUseSse.checked) openSse();

  return {
    trackState,
    updateTracking,
    startCamera,
    stopCamera,
    openSse,
    closeSse,
    resetTrackingState,
    syncCameraButtons,
  };
}
