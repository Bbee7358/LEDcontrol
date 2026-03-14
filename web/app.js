import {
  BAUD,
  BOARD_TOTAL,
  BOARDS,
  FRAME_LEN,
  LEDS_PER_BOARD,
  ORIGIN_FOLLOW_INTERVAL_SEC,
  TAPE_LEDS,
  TAPE_PIN,
  TOTAL,
} from "./config.js";
import { createEffectsController } from "./effects/controller.js";
import { loadEffects } from "./fx/loader.js";
import {
  createDefaultBoards,
  createWorldBuffers,
  getTapeSharedBoardIndex,
  makeLocalLEDs48,
  rebuildWorldGeometry,
  resetBoardInPlace,
  resetBoardsInPlace,
} from "./layout.js";
import {
  clamp,
  clamp255,
  deg2rad,
  dist2,
  isFiniteNumber,
  maybeSnap,
  rad2deg,
  snapValue,
} from "./math.js";
import { createSceneBusReceiver } from "./scene-bus.js";
import { createFramePacket } from "./serial-protocol.js";

(async () => {
  // =========================================================
  // 1) DOM
  // =========================================================
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  const btnConnect = document.getElementById("btnConnect");
  const btnDisconnect = document.getElementById("btnDisconnect");
  const btnStart = document.getElementById("btnStart");
  const btnStop = document.getElementById("btnStop");
  const btnCenter = document.getElementById("btnCenter");

  const btnZoomOut = document.getElementById("btnZoomOut");
  const btnZoomIn = document.getElementById("btnZoomIn");
  const btnZoomReset = document.getElementById("btnZoomReset");

  const pill = document.getElementById("pill");
  const statusLine = document.getElementById("statusLine");
  const statusSub = document.getElementById("statusSub");

  const fps = document.getElementById("fps");
  const fpsVal = document.getElementById("fpsVal");
  const gain = document.getElementById("gain");
  const gainVal = document.getElementById("gainVal");
  const gamma = document.getElementById("gamma");
  const gammaVal = document.getElementById("gammaVal");

  const snapOn = document.getElementById("snapOn");
  const snapMm = document.getElementById("snapMm");
  const mm2px = document.getElementById("mm2px");
  const showRings = document.getElementById("showRings");
  const showIndex = document.getElementById("showIndex");
  const showGrid = document.getElementById("showGrid");

  const selBoard = document.getElementById("selBoard");
  const rotDeg = document.getElementById("rotDeg");
  const posX = document.getElementById("posX");
  const posY = document.getElementById("posY");
  const btnResetBoard = document.getElementById("btnResetBoard");
  const btnResetAll = document.getElementById("btnResetAll");

  const btnExport = document.getElementById("btnExport");
  const btnCopy = document.getElementById("btnCopy");
  const btnImport = document.getElementById("btnImport");
  const fileInput = document.getElementById("fileInput");

  const originX = document.getElementById("originX");
  const originY = document.getElementById("originY");
  const showOrigin = document.getElementById("showOrigin");
  const originSnap = document.getElementById("originSnap");
  const btnOriginToSelected = document.getElementById("btnOriginToSelected");
  const btnOriginZero = document.getElementById("btnOriginZero");

  const selInfo = document.getElementById("selInfo");
  const originInfo = document.getElementById("originInfo");
  const mouseInfo = document.getElementById("mouseInfo");
  const dropInfo = document.getElementById("dropInfo");
  const mInfo = document.getElementById("mInfo");

  const fxSelect = document.getElementById("fxSelect");
  const btnFxResetParams = document.getElementById("btnFxResetParams");
  const btnFxResetState = document.getElementById("btnFxResetState");
  const fxParams = document.getElementById("fxParams");
  const voicebornSignalCard = document.getElementById("voicebornSignalCard");
  const voicebornSignalMessage = document.getElementById("voicebornSignalMessage");
  const voicebornSignalMeta = document.getElementById("voicebornSignalMeta");
  const sceneBusStatus = document.getElementById("sceneBusStatus");
  const sceneBusDetail = document.getElementById("sceneBusDetail");

  // =========================================================
  // 1.5) 入力の安全化
  // =========================================================
  function attachEnterToCommit(inputEl, commitFn) {
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitFn();
        inputEl.blur();
      }
    });
  }

  function commitNumberInput(inputEl, getCurrent, setValue, { allowEmptyToZero = true, post = null } = {}) {
    const raw = (inputEl.value ?? "").trim();

    if (raw === "") {
      if (allowEmptyToZero) {
        setValue(0);
        inputEl.value = "0";
        if (post) post();
        return true;
      } else {
        inputEl.value = String(getCurrent());
        if (post) post();
        return false;
      }
    }

    const v = Number(raw);
    if (!isFiniteNumber(v)) {
      inputEl.value = String(getCurrent());
      if (post) post();
      return false;
    }

    setValue(v);
    inputEl.value = String(v);
    if (post) post();
    return true;
  }

  // =========================================================
  // 1.6) Scene Bus: voiceborn 疎通確認
  // =========================================================
  const SCENE_BUS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname || "127.0.0.1"}:8787/ws`;
  const sceneBus = createSceneBusReceiver({
    wsUrl: SCENE_BUS_URL,
    nodeId: `webledcontrol-monitor-${window.location.hostname || "local"}`,
    sourceApp: "webledcontrol",
    room: "default",
    groups: ["main"],
  });

  sceneBus.onStatus(({ connected, error }) => {
    sceneBusStatus.textContent = `scene-bus: ${connected ? "接続中" : "未接続"}`;
    sceneBusDetail.textContent = error || SCENE_BUS_URL;
  });

  sceneBus.onEvent((envelope) => {
    if (envelope.kind !== "scene.cue") return;

    const payload = (envelope.payload && typeof envelope.payload === "object") ? envelope.payload : null;
    if (!payload) return;

    if (payload.cue === "voiceborn-y-pressed") {
      const receivedAt = new Date(Number(payload.sentAt || envelope.clientTs || Date.now()));
      voicebornSignalCard.classList.remove("is-idle");
      voicebornSignalCard.classList.add("is-active");
      voicebornSignalMessage.textContent = String(payload.message || "押された");
      voicebornSignalMeta.textContent = `voiceborn の Y を受信: ${receivedAt.toLocaleTimeString("ja-JP")}`;
      return;
    }

    if (payload.cue === "voiceborn-trace-exited") {
      const receivedAt = new Date(Number(envelope.clientTs || Date.now()));
      const color = payload.colorHex ? hexToRgbColor(payload.colorHex, TAPE_ORB_FX.defaultColor) : null;
      if (color) {
        applyCurrentPersonColor(color);
      }
      queueTapeOrbSpawn(1, color);
      voicebornSignalCard.classList.remove("is-idle");
      voicebornSignalCard.classList.add("is-active");
      voicebornSignalMessage.textContent = "光の玉を出力";
      voicebornSignalMeta.textContent = `voiceborn の文字消失を受信: ${receivedAt.toLocaleTimeString("ja-JP")}`;
      return;
    }

    if (payload.cue === "voiceborn-participants") {
      const participants = Array.isArray(payload.participants) ? payload.participants : [];
      remotePeopleState.people = participants.map(mapNormalizedPersonToWorld);
      if (remotePeopleState.people.length > 0 && remotePeopleState.people[0]?.color) {
        applyCurrentPersonColor(hexToRgbColor(remotePeopleState.people[0].color, TAPE_ORB_FX.defaultColor));
      }
    }
  });

  sceneBus.start();
  window.addEventListener("beforeunload", () => {
    sceneBus.stop();
  });

  // =========================================================
  // 2) WebSerial
  // =========================================================
  let port = null;
  let writer = null;
  let sendInFlight = false;
  let seq = 0;
  let drops = 0;

  // =========================================================
  // 3) 状態
  // =========================================================
  let running = false;
  let rafId = null;
  let lastTick = 0;
  let lastDraw = 0;

  function isSerialConnected() {
    return !!writer;
  }

  function currentStatusState() {
    if (running) return isSerialConnected() ? "running + serial" : "running preview";
    return isSerialConnected() ? "connected" : "idle";
  }

  function currentStatusSubline() {
    return `fps: ${running ? fps.value : "--"}  seq: ${isSerialConnected() ? String(seq).padStart(4,"0") : "local"}`;
  }

  function syncRunButtons() {
    btnStart.disabled = running;
    btnStop.disabled = !running;
  }

  // =========================================================
  // 4) ビュー変換（mm <-> screen）
  // =========================================================
  let DPR = 1;
  let view = {
    cx: 0,
    cy: 0,
    scale: 2.2,
  };

  function resize() {
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(window.innerWidth * DPR);
    canvas.height = Math.floor(window.innerHeight * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  function mmToScreen(x_mm, y_mm) {
    const w = window.innerWidth, h = window.innerHeight;
    const sx = w*0.5 + (x_mm - view.cx) * view.scale;
    const sy = h*0.58 - (y_mm - view.cy) * view.scale;
    return { sx, sy };
  }
  function screenToMm(sx, sy) {
    const w = window.innerWidth, h = window.innerHeight;
    const x = view.cx + (sx - w*0.5) / view.scale;
    const y = view.cy - (sy - h*0.58) / view.scale;
    return { x, y };
  }

  // =========================================================
  // 5) Zoom
  // =========================================================
  const ZOOM_MIN = 0.08;
  const ZOOM_MAX = 25.0;

  function setZoom(newScale, anchorSx = window.innerWidth*0.5, anchorSy = window.innerHeight*0.58) {
    newScale = clamp(newScale, ZOOM_MIN, ZOOM_MAX);

    const before = screenToMm(anchorSx, anchorSy);
    view.scale = newScale;
    const after = screenToMm(anchorSx, anchorSy);

    view.cx += (before.x - after.x);
    view.cy += (before.y - after.y);

    mm2px.value = String(view.scale.toFixed(2));
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const factor = Math.pow(1.14, -e.deltaY / 100);
    setZoom(view.scale * factor, sx, sy);
  }, { passive: false });

  btnZoomIn.addEventListener("click", () => setZoom(view.scale * 1.25));
  btnZoomOut.addEventListener("click", () => setZoom(view.scale / 1.25));
  btnZoomReset.addEventListener("click", () => setZoom(2.2));

  // =========================================================
  // 6) Geometry（基板LEDの座標計算）
  // =========================================================
  const local48 = makeLocalLEDs48();

  // board配列（mm）
  const boards = createDefaultBoards();
  const {
    boardWorldX,
    boardWorldY,
    boardWorldB,
    boardWorldI,
    tapeWorldX,
    tapeWorldY,
    tapeWorldI,
  } = createWorldBuffers();

  function rebuildWorld() {
    rebuildWorldGeometry(boards, local48, {
      boardWorldX,
      boardWorldY,
      boardWorldB,
      boardWorldI,
      tapeWorldX,
      tapeWorldY,
      tapeWorldI,
    });
  }
  rebuildWorld();

  // geo（FXに渡す）
  const GEO = {
    worldX: boardWorldX,
    worldY: boardWorldY,
    worldB: boardWorldB,
    worldI: boardWorldI,
    TOTAL: BOARD_TOTAL,
    FRAME_LEN: BOARD_TOTAL * 3,
    BOARDS,
    LEDS_PER_BOARD
  };

  const TAPE_GEO = {
    worldX: tapeWorldX,
    worldY: tapeWorldY,
    worldI: tapeWorldI,
    TOTAL: TAPE_LEDS,
    FRAME_LEN: TAPE_LEDS * 3,
    PIN: TAPE_PIN,
  };

  // =========================================================
  // 7) 原点（x,y）管理
  // =========================================================
  const origin = { x: 0, y: 0 };

  function syncOriginUI() {
    originX.value = String(Math.round(origin.x*10)/10);
    originY.value = String(Math.round(origin.y*10)/10);
    originInfo.textContent = `origin: (${origin.x.toFixed(1)},${origin.y.toFixed(1)}) mm`;
  }

  function setOriginAtWorld(mmX, mmY, eLike) {
    const step = Math.max(1, Number(snapMm.value) || 10);
    const snapEnabled = originSnap.checked && snapOn.checked && !(eLike && eLike.altKey);

    const nextX = maybeSnap(mmX, step, snapEnabled);
    const nextY = maybeSnap(mmY, step, snapEnabled);
    const changed = (nextX !== origin.x) || (nextY !== origin.y);

    origin.x = nextX;
    origin.y = nextY;
    if (changed) refreshPersonColor();
    syncOriginUI();
    Effects.onOriginChanged();
  }

  function commitOriginX() {
    const prevX = origin.x;
    commitNumberInput(originX, () => origin.x, (v) => { origin.x = v; }, { allowEmptyToZero: true, post: () => {
      if (origin.x !== prevX) refreshPersonColor();
      syncOriginUI();
      Effects.onOriginChanged();
    } });
  }
  function commitOriginY() {
    const prevY = origin.y;
    commitNumberInput(originY, () => origin.y, (v) => { origin.y = v; }, { allowEmptyToZero: true, post: () => {
      if (origin.y !== prevY) refreshPersonColor();
      syncOriginUI();
      Effects.onOriginChanged();
    } });
  }
  originX.addEventListener("change", commitOriginX);
  originY.addEventListener("change", commitOriginY);
  attachEnterToCommit(originX, commitOriginX);
  attachEnterToCommit(originY, commitOriginY);

  btnOriginZero.addEventListener("click", () => {
    const changed = (origin.x !== 0) || (origin.y !== 0);
    origin.x = 0; origin.y = 0;
    if (changed) refreshPersonColor();
    syncOriginUI();
    Effects.onOriginChanged();
  });
  btnOriginToSelected.addEventListener("click", () => {
    const bd = boards[selectedBoard];
    const changed = (origin.x !== bd.cx) || (origin.y !== bd.cy);
    origin.x = bd.cx; origin.y = bd.cy;
    if (changed) refreshPersonColor();
    syncOriginUI();
    Effects.onOriginChanged();
  });

  syncOriginUI();

  // =========================================================
  // 7.5) m押下中：原点 = マウス（一定間隔で更新）
  // =========================================================
  let followOriginWithMouse = false;
  let lastFollowUpdateT = 0;
  let lastMouseMm = { x: 0, y: 0 };

  const tapeOrbState = {
    pendingSpawns: 0,
    orbs: [],
    nextId: 1,
  };

  const TAPE_ORB_FX = {
    speed: 26,
    tail: 14,
    defaultColor: { r: 18, g: 110, b: 255 },
  };

  const tapeArrivalEvents = [];
  const SHARED_TAPE_BOARD_INDEX = getTapeSharedBoardIndex();

  const PERSON_COLOR_PALETTE = [
    { r: 255, g: 72,  b: 72  },
    { r: 255, g: 140, b: 56  },
    { r: 255, g: 210, b: 70  },
    { r: 160, g: 255, b: 80  },
    { r: 72,  g: 255, b: 144 },
    { r: 64,  g: 220, b: 255 },
    { r: 72,  g: 140, b: 255 },
    { r: 132, g: 96,  b: 255 },
    { r: 220, g: 92,  b: 255 },
    { r: 255, g: 92,  b: 180 },
  ];

  const personColorState = {
    current: null,
    lastPaletteIndex: -1,
  };
  const remotePeopleState = {
    people: [],
  };

  function queueTapeOrbSpawn(count = 1, color = null) {
    const total = Math.max(0, count | 0);
    if (!Array.isArray(tapeOrbState.orbQueue)) tapeOrbState.orbQueue = [];
    for (let i = 0; i < total; i += 1) {
      tapeOrbState.pendingSpawns += 1;
      tapeOrbState.orbQueue.push(color ? cloneColor(color) : null);
    }
  }

  function cloneColor(c) {
    return {
      r: clamp255(c?.r ?? TAPE_ORB_FX.defaultColor.r),
      g: clamp255(c?.g ?? TAPE_ORB_FX.defaultColor.g),
      b: clamp255(c?.b ?? TAPE_ORB_FX.defaultColor.b),
    };
  }

  function pickRandomPersonColor() {
    const palette = PERSON_COLOR_PALETTE;
    if (palette.length <= 0) return cloneColor(TAPE_ORB_FX.defaultColor);

    let idx = Math.floor(Math.random() * palette.length);
    if (palette.length > 1 && idx === personColorState.lastPaletteIndex) {
      idx = (idx + 1 + Math.floor(Math.random() * (palette.length - 1))) % palette.length;
    }

    personColorState.lastPaletteIndex = idx;
    return cloneColor(palette[idx]);
  }

  function hexToRgbColor(hex, fallback = TAPE_ORB_FX.defaultColor) {
    const s = String(hex ?? "").trim();
    const m = s.match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return cloneColor(fallback);
    const n = parseInt(m[1], 16);
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
    };
  }

  function getEffectPersonColor() {
    try {
      const params = Effects?.getActiveParams?.();
      if (!params || typeof params.personColor !== "string") return null;
      return hexToRgbColor(params.personColor, TAPE_ORB_FX.defaultColor);
    } catch {
      return null;
    }
  }

  function applyCurrentPersonColor(color) {
    const next = cloneColor(color || pickRandomPersonColor());
    personColorState.current = next;
    origin.color = next;
    window.__CURRENT_PERSON_COLOR__ = { ...next };
    return next;
  }

  function refreshPersonColor() {
    return applyCurrentPersonColor(getEffectPersonColor() || pickRandomPersonColor());
  }

  refreshPersonColor();

  function spawnTapeOrb(nowSec, color) {
    const c = color || getEffectPersonColor() || personColorState.current || TAPE_ORB_FX.defaultColor;
    tapeOrbState.orbs.push({
      id: tapeOrbState.nextId++,
      startSec: nowSec,
      arrivedAtTape0: false,
      color: {
        r: clamp255(c.r ?? TAPE_ORB_FX.defaultColor.r),
        g: clamp255(c.g ?? TAPE_ORB_FX.defaultColor.g),
        b: clamp255(c.b ?? TAPE_ORB_FX.defaultColor.b),
      },
    });
  }

  function computeWorldBounds() {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < boardWorldX.length; i += 1) {
      const x = boardWorldX[i];
      const y = boardWorldY[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return { minX: -500, maxX: 500, minY: -500, maxY: 500 };
    }

    return { minX, maxX, minY, maxY };
  }

  function mapNormalizedPersonToWorld(person) {
    const bounds = computeWorldBounds();
    const xNorm = clamp(Number(person?.x), 0, 1);
    const yNorm = clamp(Number(person?.y), 0, 1);
    return {
      id: String(person?.id || ""),
      x: bounds.minX + (bounds.maxX - bounds.minX) * (1 - xNorm),
      y: bounds.minY + (bounds.maxY - bounds.minY) * yNorm,
      color: String(person?.colorHex || "#00ff88"),
    };
  }

  function setFollowMode(on){
    followOriginWithMouse = on;
    mInfo.textContent = `m: ${on ? "on" : "off"}`;
    if (on) {
      lastFollowUpdateT = 0;
      setOriginAtWorld(lastMouseMm.x, lastMouseMm.y, { altKey: false });
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : "";
    const isTyping = (tag === "input" || tag === "textarea" || tag === "select");
    if (isTyping) return;

    if (e.key === "Enter") {
      queueTapeOrbSpawn(1);
      return;
    }

    if (e.key === "m" || e.key === "M") {
      setFollowMode(true);
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "m" || e.key === "M") {
      setFollowMode(false);
    }
  });

  // =========================================================
  // 8) UI初期化（board選択など）
  // =========================================================
  for (let b = 0; b < BOARDS; b++) {
    const opt = document.createElement("option");
    opt.value = String(b);
    opt.textContent = `board ${b}`;
    selBoard.appendChild(opt);
  }
  let selectedBoard = 0;
  selBoard.value = String(selectedBoard);

  function syncSelectedUI() {
    const bd = boards[selectedBoard];
    rotDeg.value = String(Math.round(bd.rotDeg*100)/100);
    posX.value = String(Math.round(bd.cx*100)/100);
    posY.value = String(Math.round(bd.cy*100)/100);
    selInfo.textContent = `selected: board ${selectedBoard}`;
  }
  syncSelectedUI();

  function setStatus(state, sub="") {
    statusLine.textContent = state;
    if (sub) statusSub.textContent = sub;

    if (state.startsWith("running")) {
      pill.style.background = "rgba(52,211,153,.85)";
      pill.style.boxShadow = "0 0 0 2px rgba(52,211,153,.18), 0 10px 30px rgba(52,211,153,.20)";
    } else if (state.startsWith("connected")) {
      pill.style.background = "rgba(125,211,252,.85)";
      pill.style.boxShadow = "0 0 0 2px rgba(125,211,252,.18), 0 10px 30px rgba(125,211,252,.18)";
    } else if (state.includes("error") || state.includes("failed")) {
      pill.style.background = "rgba(251,113,133,.9)";
      pill.style.boxShadow = "0 0 0 2px rgba(251,113,133,.18), 0 10px 30px rgba(251,113,133,.20)";
    } else {
      pill.style.background = "rgba(255,255,255,.28)";
      pill.style.boxShadow = "0 0 0 2px rgba(255,255,255,.08)";
    }
  }
  syncRunButtons();
  setStatus(currentStatusState(), currentStatusSubline());
  mInfo.textContent = "m: off";

  // gamma LUT（0..255）
  let gammaLUT = new Uint8Array(256);
  function rebuildGammaLUT() {
    const g = parseFloat(gamma.value);
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      gammaLUT[i] = clamp255(Math.round(Math.pow(x, g) * 255));
    }
  }
  rebuildGammaLUT();

  // =========================================================
  // Preview tuning
  // 実機LEDの低輝度は画面プレビューより見えやすいため、画面だけ持ち上げる。
  // 送信データには使わない。
  // =========================================================
  const PREVIEW = {
    // 低輝度を見えるように持ち上げつつ、高輝度側の差も潰しにくい設定
    // logK を上げるほど暗部が持ち上がる
    logK: 12.0,
    minVisible: 0,
    haloAlpha: 0.24,
    haloSize: 10,
    coreSize: 4.0,
  };

  // 低輝度確認をしやすくするため、gamma UIは無効化
  gamma.value = "1.0";
  gammaVal.textContent = "OFF";
  gamma.disabled = true;
  gamma.title = "画面プレビューと実機の差が大きいため、ガンマは無効化中";

  const PREVIEW_BUILD_TAG = "app_no_trail_patch / 2026-03-10";
  window.__PREVIEW_BUILD__ = PREVIEW_BUILD_TAG;
  console.log("[PREVIEW BUILD]", PREVIEW_BUILD_TAG);

  fps.addEventListener("input", () => fpsVal.textContent = fps.value);
  gain.addEventListener("input", () => gainVal.textContent = Number(gain.value).toFixed(2));
  gamma.addEventListener("input", () => { gammaVal.textContent = "OFF"; });

  function commitMm2px() {
    commitNumberInput(mm2px, () => view.scale, (v) => { setZoom(v); }, { allowEmptyToZero: false });
  }
  mm2px.addEventListener("change", commitMm2px);
  attachEnterToCommit(mm2px, commitMm2px);

  setZoom(parseFloat(mm2px.value) || 2.2);

  function commitSnapMm() {
    commitNumberInput(snapMm, () => (Number(snapMm.getAttribute("data-last")) || 10), (v) => {
      const nv = clamp(Math.round(v), 1, 200);
      snapMm.value = String(nv);
      snapMm.setAttribute("data-last", String(nv));
    }, { allowEmptyToZero: false });
  }
  snapMm.setAttribute("data-last", snapMm.value);
  snapMm.addEventListener("change", commitSnapMm);
  attachEnterToCommit(snapMm, commitSnapMm);

  selBoard.addEventListener("change", () => {
    selectedBoard = parseInt(selBoard.value, 10) || 0;
    syncSelectedUI();
  });

  function commitPosX() {
    const bd = boards[selectedBoard];
    commitNumberInput(posX, () => bd.cx, (v) => { bd.cx = v; }, { allowEmptyToZero: true, post: () => { rebuildWorld(); syncSelectedUI(); } });
  }
  function commitPosY() {
    const bd = boards[selectedBoard];
    commitNumberInput(posY, () => bd.cy, (v) => { bd.cy = v; }, { allowEmptyToZero: true, post: () => { rebuildWorld(); syncSelectedUI(); } });
  }
  function commitRotDeg() {
    const bd = boards[selectedBoard];
    commitNumberInput(rotDeg, () => bd.rotDeg, (v) => { bd.rotDeg = v; }, { allowEmptyToZero: true, post: () => { rebuildWorld(); syncSelectedUI(); } });
  }
  posX.addEventListener("change", commitPosX);
  posY.addEventListener("change", commitPosY);
  rotDeg.addEventListener("change", commitRotDeg);
  attachEnterToCommit(posX, commitPosX);
  attachEnterToCommit(posY, commitPosY);
  attachEnterToCommit(rotDeg, commitRotDeg);

  btnResetBoard.addEventListener("click", () => {
    resetBoardInPlace(boards, selectedBoard);
    rebuildWorld();
    syncSelectedUI();
  });
  btnResetAll.addEventListener("click", () => {
    resetBoardsInPlace(boards);
    rebuildWorld();
    syncSelectedUI();
  });
  btnCenter.addEventListener("click", () => {
    let sx = 0, sy = 0;
    for (const b of boards){ sx += b.cx; sy += b.cy; }
    view.cx = sx / boards.length;
    view.cy = sy / boards.length;
  });

  // =========================================================
  // 13) FXをプラグインとしてロード
  // =========================================================
  const FX_REGISTRY = await loadEffects();
  const FX_ORDER = Object.keys(FX_REGISTRY);

  if (FX_ORDER.length === 0) {
    alert("FXがロードできませんでした。fx/manifest.json か fx/*.js を確認してください。");
  }

  // =========================================================
  // 13) Effects
  // =========================================================
  const Effects = createEffectsController({
    registry: FX_REGISTRY,
    origin,
    geo: GEO,
  });

  // =========================================================
  // 13.5) FX UI
  // =========================================================
  function buildFxUI() {
    fxSelect.innerHTML = "";
    const reg = Effects.getRegistry();
    const order = Effects.getOrder();

    for (const id of order) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = reg[id].label;
      fxSelect.appendChild(opt);
    }
    fxSelect.value = Effects.getActiveId();

    rebuildFxParamsUI();
  }

  function rebuildFxParamsUI() {
    const reg = Effects.getRegistry();
    const fx = reg[Effects.getActiveId()];
    const params = Effects.getActiveParams();

    fxParams.innerHTML = "";

    const head = document.createElement("div");
    head.className = "fxitem";
    head.innerHTML = `
      <div class="name">
        <div>${fx.label}</div>
        <div class="desc">${fx.desc || ""}</div>
      </div>
    `;
    fxParams.appendChild(head);

    for (const p of (fx.params || [])) {
      const row = document.createElement("div");
      row.className = "fxitem";

      const left = document.createElement("div");
      left.className = "name";
      const nm = document.createElement("div");
      nm.textContent = p.label || p.key;
      const ds = document.createElement("div");
      ds.className = "desc";
      ds.textContent = p.key;
      left.appendChild(nm);
      left.appendChild(ds);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";
      right.style.alignItems = "center";

      let input;

      if (p.type === "checkbox") {
        input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!params[p.key];
        input.addEventListener("change", () => {
          Effects.setParams({ [p.key]: input.checked });
        });
        right.appendChild(input);
      }
      else if (p.type === "select") {
        input = document.createElement("select");
        for (const [val, label] of (p.options || [])) {
          const opt = document.createElement("option");
          opt.value = String(val);
          opt.textContent = String(label);
          input.appendChild(opt);
        }
        input.value = String(params[p.key]);
        input.addEventListener("change", () => {
          Effects.setParams({ [p.key]: input.value });
        });
        right.appendChild(input);
      }
      else if (p.type === "color") {
        input = document.createElement("input");
        input.type = "color";
        input.value = String(params[p.key] || p.default || "#00ff88");
        input.addEventListener("input", () => {
          Effects.setParams({ [p.key]: input.value });
          if (p.key === "personColor") refreshPersonColor();
        });
        right.appendChild(input);
      }
      else {
        input = document.createElement("input");
        input.type = (p.type === "range") ? "range" : "number";
        if (p.min != null) input.min = String(p.min);
        if (p.max != null) input.max = String(p.max);
        if (p.step != null) input.step = String(p.step);
        input.value = String(params[p.key]);

        const val = document.createElement("span");
        val.className = "mono";
        val.textContent = String(params[p.key]);

        const commit = () => {
          const v = Number(input.value);
          if (!Number.isFinite(v)) return;
          Effects.setParams({ [p.key]: v });
          val.textContent = String(v);
        };

        if (input.type === "range") {
          input.addEventListener("input", commit);
        } else {
          input.addEventListener("change", commit);
          attachEnterToCommit(input, commit);
        }

        right.appendChild(val);
        right.appendChild(input);
      }

      row.appendChild(left);
      row.appendChild(right);
      fxParams.appendChild(row);
    }
  }

  fxSelect.addEventListener("change", () => {
    Effects.setActive(fxSelect.value);
    refreshPersonColor();
    rebuildFxParamsUI();
  });

  btnFxResetParams.addEventListener("click", () => {
    Effects.resetParams();
    refreshPersonColor();
    rebuildFxParamsUI();
  });

  btnFxResetState.addEventListener("click", () => {
    Effects.resetState();
  });

  buildFxUI();

  // =========================================================
  // 9) JSON export/import（origin + fx も保存）
  // =========================================================
  function makeLayoutJSON() {
    return {
      version: 2,
      meta: {
        boards: BOARDS,
        ledsPerBoard: LEDS_PER_BOARD,
        total: TOTAL,
        boardTotal: BOARD_TOTAL,
        tapeLeds: TAPE_LEDS,
        note: "board order: 0..29, row-major (top-left to bottom-right), each board index: 0..47 (outer 30, mid 12 start 15deg, inner 6)."
      },
      origin: { x: origin.x, y: origin.y },
      boards: boards.map((b, idx) => ({ id: idx, cx: b.cx, cy: b.cy, rotDeg: b.rotDeg })),
      fx: {
        id: Effects.getActiveId(),
        params: Effects.getActiveParams()
      }
    };
  }

  function applyLayoutJSON(obj) {
    if (!obj || !Array.isArray(obj.boards)) return false;
    if (obj.boards.length !== BOARDS) return false;

    for (let i = 0; i < BOARDS; i++) {
      const it = obj.boards[i];
      boards[i] = {
        cx: Number(it.cx) || 0,
        cy: Number(it.cy) || 0,
        rotDeg: Number(it.rotDeg) || 0
      };
    }

    if (obj.origin && Number.isFinite(obj.origin.x) && Number.isFinite(obj.origin.y)) {
      origin.x = Number(obj.origin.x);
      origin.y = Number(obj.origin.y);
      syncOriginUI();
      Effects.onOriginChanged();
    }

    if (obj.fx && obj.fx.id) {
      Effects.setActive(String(obj.fx.id));
      if (obj.fx.params && typeof obj.fx.params === "object") {
        Effects.setParams(obj.fx.params);
      }
      refreshPersonColor();
      fxSelect.value = Effects.getActiveId();
      rebuildFxParamsUI();
    }

    rebuildWorld();
    syncSelectedUI();
    return true;
  }

  btnExport.addEventListener("click", () => {
    const obj = makeLayoutJSON();
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "led_layout.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  btnCopy.addEventListener("click", async () => {
    const obj = makeLayoutJSON();
    const text = JSON.stringify(obj, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus(currentStatusState(),
        `fps: ${running ? fps.value : "--"}  seq: ${isSerialConnected() ? String(seq).padStart(4,"0") : "local"}  copied`);
      setTimeout(() => setStatus(currentStatusState(), currentStatusSubline()), 650);
    } catch {
      alert("クリップボードにコピーできませんでした。");
    }
  });

  btnImport.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    fileInput.value = "";
    if (!f) return;
    try {
      const text = await f.text();
      const obj = JSON.parse(text);
      const ok = applyLayoutJSON(obj);
      if (!ok) alert("JSON形式が想定と違います（boards数など）");
    } catch (e) {
      console.error(e);
      alert("JSONの読み込みに失敗しました。");
    }
  });

  // =========================================================
  // 10) クリック判定（基板選択）
  // =========================================================
  function pickBoardAt(sx, sy) {
    const mm = screenToMm(sx, sy);
    let best = 0, bestD = Infinity;
    for (let b = 0; b < BOARDS; b++) {
      const d = dist2(mm.x, mm.y, boards[b].cx, boards[b].cy);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (bestD <= 60*60) return best;
    return null;
  }

  // =========================================================
  // 11) マウス操作（ドラッグ移動/回転/視点移動）+ Ctrlクリックで原点設定
  // =========================================================
  let mouse = { sx:0, sy:0, down:false, dragging:false };
  let drag = {
    board: 0,
    mode: "move",
    startCx: 0, startCy: 0, startRot: 0,
    startMmX: 0, startMmY: 0,
    startAngle: 0,
    startSx: 0, startSy: 0,
    startViewCx: 0, startViewCy: 0,
  };

  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    mouse.sx = sx; mouse.sy = sy;

    const mm = screenToMm(sx, sy);
    lastMouseMm.x = mm.x;
    lastMouseMm.y = mm.y;

    mouseInfo.textContent = `x: ${mm.x.toFixed(1)} mm / y: ${mm.y.toFixed(1)} mm`;

    if (!mouse.down || !mouse.dragging) return;

    if (drag.mode === "pan") {
      const dx = sx - drag.startSx;
      const dy = sy - drag.startSy;
      view.cx = drag.startViewCx - dx / view.scale;
      view.cy = drag.startViewCy + dy / view.scale;
      return;
    }

    const step = Math.max(1, Number(snapMm.value) || 10);
    const snapEnabled = snapOn.checked && !e.altKey;

    const bd = boards[drag.board];

    if (drag.mode === "move") {
      const dx = mm.x - drag.startMmX;
      const dy = mm.y - drag.startMmY;
      let nx = drag.startCx + dx;
      let ny = drag.startCy + dy;
      nx = maybeSnap(nx, step, snapEnabled);
      ny = maybeSnap(ny, step, snapEnabled);

      bd.cx = nx;
      bd.cy = ny;
    } else {
      const ang = Math.atan2(mm.y - bd.cy, mm.x - bd.cx);
      let dAng = ang - drag.startAngle;
      let nRot = drag.startRot + rad2deg(dAng);
      if (snapEnabled) nRot = snapValue(nRot, 5);
      bd.rotDeg = nRot;
    }

    rebuildWorld();
    if (drag.board === selectedBoard) syncSelectedUI();
  }

  function onPointerDown(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const mm = screenToMm(sx, sy);

    if (e.ctrlKey || e.metaKey) {
      setOriginAtWorld(mm.x, mm.y, e);
      return;
    }

    if (e.button === 2 || e.detail >= 2) {
      mouse.down = true;
      mouse.dragging = true;
      drag.mode = "pan";
      drag.startSx = sx;
      drag.startSy = sy;
      drag.startViewCx = view.cx;
      drag.startViewCy = view.cy;
      return;
    }

    const picked = pickBoardAt(sx, sy);
    if (picked !== null) {
      selectedBoard = picked;
      selBoard.value = String(selectedBoard);
      syncSelectedUI();
    }

    mouse.down = true;
    mouse.dragging = true;

    drag.board = selectedBoard;
    drag.mode = e.shiftKey ? "rot" : "move";

    const bd = boards[drag.board];
    drag.startCx = bd.cx;
    drag.startCy = bd.cy;
    drag.startRot = bd.rotDeg;
    drag.startMmX = mm.x;
    drag.startMmY = mm.y;
    drag.startAngle = Math.atan2(mm.y - bd.cy, mm.x - bd.cx);
  }

  function onPointerUp() {
    mouse.down = false;
    mouse.dragging = false;
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("dblclick", (e) => e.preventDefault());
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("pointerup", onPointerUp);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      resetBoardInPlace(boards, selectedBoard);
      rebuildWorld();
      syncSelectedUI();
    }
  });

  // =========================================================
  // 12) WebSerial 接続
  // =========================================================
  async function connect() {
    try {
      if (!("serial" in navigator)) {
        alert("WebSerial未対応です。Chrome系で開いてください。");
        return;
      }
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: BAUD });
      writer = port.writable.getWriter();

      btnConnect.disabled = true;
      btnDisconnect.disabled = false;
      syncRunButtons();

      setStatus(currentStatusState(), currentStatusSubline());
    } catch (e) {
      console.error(e);
      port = null; writer = null;
      setStatus("connect failed");
    }
  }

  async function disconnect() {
    try {
      stop();
      if (writer) { writer.releaseLock(); writer = null; }
      if (port) { await port.close(); port = null; }
    } catch (e) {
      console.error(e);
    } finally {
      btnConnect.disabled = false;
      btnDisconnect.disabled = true;
      syncRunButtons();
      setStatus(currentStatusState(), currentStatusSubline());
    }
  }

  btnConnect.addEventListener("click", connect);
  btnDisconnect.addEventListener("click", disconnect);

  // =========================================================
  // 14) 送信（詰まりはスキップ）
  // =========================================================
  async function sendFrame(rgb) {
    if (!writer) return;
    if (sendInFlight) { drops++; dropInfo.textContent = `drops: ${drops}`; return; }
    sendInFlight = true;

    const packet = createFramePacket(seq, rgb);
    seq = (seq + 1) & 0xffff;

    try {
      await writer.write(packet);
    } catch (e) {
      console.error(e);
      setStatus("send error");
      stop();
    } finally {
      sendInFlight = false;
    }
  }

  // =========================================================
  // 15) 色処理
  // 送信側: gainのみ
  // 画面側: preview専用の持ち上げを別関数で行う
  // =========================================================
  function applyOutputGain(rgb) {
    const G = Math.max(0, Math.min(1, Number(gain.value)));
    if (G !== 1) {
      for (let i = 0; i < rgb.length; i++) rgb[i] = clamp255(Math.round(rgb[i] * G));
    }
  }

  function previewMapChannel(v) {
    if (v <= 0) return 0;

    // 実機で見える低輝度を画面でも見やすくする一方、
    // 180/200/250 など高輝度側の差も潰しにくいように、
    // 強いgamma持ち上げではなく対数カーブで補正する。
    const x = v / 255;
    const k = Math.max(0.01, Number(PREVIEW.logK) || 12.0);
    const y = Math.log1p(k * x) / Math.log1p(k);
    let out = Math.round(y * 255);
    if (out > 0 && PREVIEW.minVisible > 0) out = Math.max(out, PREVIEW.minVisible);
    return clamp255(out);
  }

  function makePreviewRGB(rgb) {
    const out = new Uint8Array(rgb.length);
    for (let i = 0; i < rgb.length; i += 3) {
      out[i + 0] = previewMapChannel(rgb[i + 0]);
      out[i + 1] = previewMapChannel(rgb[i + 1]);
      out[i + 2] = previewMapChannel(rgb[i + 2]);
    }
    return out;
  }

  // =========================================================
  // 16) 描画
  // =========================================================
  function drawBackground() {
    const w = window.innerWidth, h = window.innerHeight;
    ctx.fillStyle = "#070a10";
    ctx.fillRect(0, 0, w, h);

    const g1 = ctx.createRadialGradient(w*0.68, h*0.20, 0, w*0.68, h*0.20, Math.min(w,h)*0.55);
    g1.addColorStop(0, "rgba(125,211,252,0.08)");
    g1.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g1;
    ctx.fillRect(0,0,w,h);

    const g2 = ctx.createRadialGradient(w*0.15, h*0.40, 0, w*0.15, h*0.40, Math.min(w,h)*0.55);
    g2.addColorStop(0, "rgba(167,139,250,0.06)");
    g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0,0,w,h);
  }

  function drawGrid() {
    if (!showGrid.checked) return;
    const w = window.innerWidth, h = window.innerHeight;
    const stepMm = Math.max(5, Number(snapMm.value) || 10);

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;

    const topLeft = screenToMm(0,0);
    const botRight = screenToMm(w,h);

    const x0 = Math.floor(topLeft.x / stepMm) * stepMm;
    const x1 = Math.ceil(botRight.x / stepMm) * stepMm;
    const y0 = Math.floor(botRight.y / stepMm) * stepMm;
    const y1 = Math.ceil(topLeft.y / stepMm) * stepMm;

    for (let x = x0; x <= x1; x += stepMm) {
      const p = mmToScreen(x, 0);
      ctx.beginPath();
      ctx.moveTo(p.sx, 0);
      ctx.lineTo(p.sx, h);
      ctx.stroke();
    }
    for (let y = y0; y <= y1; y += stepMm) {
      const p = mmToScreen(0, y);
      ctx.beginPath();
      ctx.moveTo(0, p.sy);
      ctx.lineTo(w, p.sy);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = "rgba(125,211,252,0.20)";
    {
      const p = mmToScreen(0,0);
      ctx.beginPath(); ctx.moveTo(p.sx, 0); ctx.lineTo(p.sx, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p.sy); ctx.lineTo(w, p.sy); ctx.stroke();
    }

    ctx.restore();
  }

  function drawBoardsOutline() {
    const dia = 100;
    for (let b = 0; b < BOARDS; b++) {
      const bd = boards[b];
      const c = mmToScreen(bd.cx, bd.cy);

      ctx.save();
      ctx.globalAlpha = (b === selectedBoard) ? 0.95 : 0.55;
      ctx.lineWidth = (b === selectedBoard) ? 2.0 : 1.0;
      ctx.strokeStyle = (b === selectedBoard) ? "rgba(125,211,252,0.45)" : "rgba(255,255,255,0.10)";

      ctx.beginPath();
      ctx.arc(c.sx, c.sy, (dia/2)*view.scale, 0, Math.PI*2);
      ctx.stroke();

      const th = deg2rad(bd.rotDeg);
      const hx = bd.cx + Math.cos(th) * (dia/2);
      const hy = bd.cy + Math.sin(th) * (dia/2);
      const hsp = mmToScreen(hx, hy);

      ctx.strokeStyle = (b === selectedBoard) ? "rgba(167,139,250,0.55)" : "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(c.sx, c.sy);
      ctx.lineTo(hsp.sx, hsp.sy);
      ctx.stroke();

      ctx.fillStyle = (b === selectedBoard) ? "rgba(233,239,250,.9)" : "rgba(233,239,250,.55)";
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      const row = Math.floor(b / 6);
      const col = b % 6;
      ctx.fillText(`b${b} r${row+1}c${col+1} p${row}`, c.sx + 8, c.sy - 10);

      ctx.restore();
    }
  }

  function drawRings() {
    if (!showRings.checked) return;
    const rings = [92, 34, 18];
    for (let b = 0; b < BOARDS; b++) {
      const bd = boards[b];
      const c = mmToScreen(bd.cx, bd.cy);

      ctx.save();
      ctx.globalAlpha = (b === selectedBoard) ? 0.42 : 0.24;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      for (const d of rings) {
        ctx.beginPath();
        ctx.arc(c.sx, c.sy, (d/2)*view.scale, 0, Math.PI*2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawOriginMarker() {
    if (!showOrigin.checked) return;
    const p = mmToScreen(origin.x, origin.y);

    ctx.save();
    ctx.globalAlpha = 0.9;

    ctx.strokeStyle = "rgba(125,211,252,0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.sx - 10, p.sy);
    ctx.lineTo(p.sx + 10, p.sy);
    ctx.moveTo(p.sx, p.sy - 10);
    ctx.lineTo(p.sx, p.sy + 10);
    ctx.stroke();

    ctx.strokeStyle = "rgba(167,139,250,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, 10, 0, Math.PI*2);
    ctx.stroke();

    ctx.fillStyle = "rgba(233,239,250,.85)";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillText("origin", p.sx + 14, p.sy - 12);

    ctx.restore();
  }


  function renderTapeFrame(nowSec, outRGB, boardRGB) {
    outRGB.fill(0);

    while (tapeOrbState.pendingSpawns > 0) {
      const queuedColor = Array.isArray(tapeOrbState.orbQueue) && tapeOrbState.orbQueue.length > 0
        ? tapeOrbState.orbQueue.shift()
        : null;
      spawnTapeOrb(nowSec, queuedColor || personColorState.current || TAPE_ORB_FX.defaultColor);
      tapeOrbState.pendingSpawns--;
    }

    const activeOrbs = [];
    const { speed, tail } = TAPE_ORB_FX;
    const maxTravelSec = (TAPE_LEDS + tail) / Math.max(1e-6, speed);

    for (const orb of tapeOrbState.orbs) {
      const ageSec = nowSec - orb.startSec;
      if (ageSec < 0) continue;

      const head = (TAPE_LEDS - 1) - (ageSec * speed);
      if (!orb.arrivedAtTape0 && head <= 0) {
        orb.arrivedAtTape0 = true;
        tapeArrivalEvents.push({
          timeSec: nowSec,
          color: cloneColor(orb.color),
          source: "tape0",
        });
      }
      if (head + tail < 0) continue;

      activeOrbs.push(orb);

      const start = Math.max(0, Math.floor(head));
      const end = Math.min(TAPE_LEDS - 1, Math.ceil(head + tail));
      const { r, g, b } = orb.color || TAPE_ORB_FX.defaultColor;

      for (let i = start; i <= end; i++) {
        const d = i - head;
        if (d < 0 || d > tail) continue;

        const t = 1 - d / tail;
        if (t <= 0) continue;

        const p = i * 3;
        outRGB[p + 0] = clamp255(outRGB[p + 0] + Math.round(r * t));
        outRGB[p + 1] = clamp255(outRGB[p + 1] + Math.round(g * t));
        outRGB[p + 2] = clamp255(outRGB[p + 2] + Math.round(b * t));
      }
    }

    tapeOrbState.orbs = activeOrbs.filter((orb) => (nowSec - orb.startSec) <= maxTravelSec);
    return outRGB;
  }

  function consumeTapeArrivalEvents() {
    if (tapeArrivalEvents.length === 0) return [];
    return tapeArrivalEvents.splice(0, tapeArrivalEvents.length);
  }

  function getSharedTapeEntryPoint() {
    const sharedBoard = boards[SHARED_TAPE_BOARD_INDEX] || boards[0] || { cx: 0, cy: 0 };
    return { x: sharedBoard.cx, y: sharedBoard.cy };
  }

  function drawTapeGuide() {
    const x0 = tapeWorldX[0];
    const y0 = tapeWorldY[0];
    const x1 = tapeWorldX[TAPE_LEDS - 1];
    const y1 = tapeWorldY[TAPE_LEDS - 1];
    const a = mmToScreen(x0, y0);
    const b = mmToScreen(x1, y1);

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();

    ctx.fillStyle = "rgba(233,239,250,.72)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillText(`tape ${TAPE_LEDS} leds / pin ${TAPE_PIN}`, a.sx, a.sy - 12);
    ctx.restore();
  }

  function drawLEDSet(rgb, xs, ys, count, indexArray = null) {
    for (let gi = 0; gi < count; gi++) {
      const r = rgb[gi*3+0], g = rgb[gi*3+1], b = rgb[gi*3+2];
      const p = mmToScreen(xs[gi], ys[gi]);

      ctx.save();
      ctx.globalCompositeOperation = "screen";

      ctx.globalAlpha = PREVIEW.haloAlpha;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, PREVIEW.haloSize, 0, Math.PI*2);
      ctx.fill();

      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, PREVIEW.coreSize, 0, Math.PI*2);
      ctx.fill();

      ctx.restore();

      if (showIndex.checked && indexArray) {
        ctx.save();
        ctx.fillStyle = "rgba(233,239,250,.45)";
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        ctx.fillText(String(indexArray[gi]), p.sx + 5, p.sy + 3);
        ctx.restore();
      }
    }
  }

  function drawLEDs(rgb) {
    const boardRGB = rgb.subarray(0, BOARD_TOTAL * 3);
    const tapeRGB = rgb.subarray(BOARD_TOTAL * 3);

    drawLEDSet(boardRGB, boardWorldX, boardWorldY, BOARD_TOTAL, boardWorldI);
    drawTapeGuide();
    drawLEDSet(tapeRGB, tapeWorldX, tapeWorldY, TAPE_LEDS, tapeWorldI);
  }

  // =========================================================
  // 17) ループ
  // =========================================================
  const frameBuf = new Uint8Array(FRAME_LEN);
  const boardFrameBuf = frameBuf.subarray(0, BOARD_TOTAL * 3);
  const tapeFrameBuf = frameBuf.subarray(BOARD_TOTAL * 3);
  let hasPreviewFrame = false;

  function start() {
    if (running) return;
    running = true;
    syncRunButtons();
    setStatus(currentStatusState(), currentStatusSubline());
    lastTick = 0;
  }

  function stop() {
    running = false;
    syncRunButtons();
    setStatus(currentStatusState(), currentStatusSubline());
  }

  btnStart.addEventListener("click", start);
  btnStop.addEventListener("click", stop);

  function maybeUpdateOriginFollow(tNowSec) {
    if (!followOriginWithMouse) return;
    const dt = tNowSec - lastFollowUpdateT;
    if (dt < ORIGIN_FOLLOW_INTERVAL_SEC) return;

    lastFollowUpdateT = tNowSec;
    setOriginAtWorld(lastMouseMm.x, lastMouseMm.y, { altKey: false });

  }

  function loop(ts) {
    const targetFps = Math.max(10, Math.min(60, Number(fps.value) || 30));
    const interval = 1000 / targetFps;

    if (!lastTick) lastTick = ts;
    const doFrame = (ts - lastTick >= interval);

    const drawInterval = 1000 / 30;
    const doDraw = (!lastDraw || (ts - lastDraw >= drawInterval));

    const tNowSec = performance.now() / 1000;
    maybeUpdateOriginFollow(tNowSec);
    const sharedEntry = getSharedTapeEntryPoint();

    let frame = null;
    let frameTapeArrivals = [];

    if (doFrame && running) {
      lastTick = ts;
      frameTapeArrivals = consumeTapeArrivalEvents();
      Effects.renderFrame(tNowSec, boardFrameBuf, {
        sharedEntryX: sharedEntry.x,
        sharedEntryY: sharedEntry.y,
        originColor: origin.color,
        people: remotePeopleState.people,
        tapeArrivals: frameTapeArrivals,
      });
      renderTapeFrame(tNowSec, tapeFrameBuf, boardFrameBuf);
      frame = frameBuf;
      hasPreviewFrame = true;
      applyOutputGain(frame);
      sendFrame(frame);

      statusSub.textContent = `fps: ${targetFps}  seq: ${isSerialConnected() ? String(seq).padStart(4,"0") : "local"}`;
    }

    if (doDraw) {
      lastDraw = ts;
      drawBackground();
      drawGrid();
      drawBoardsOutline();
      drawRings();
      drawOriginMarker();

      const rgb = (() => {
        if (frame) return frame;
        if (!hasPreviewFrame) {
          Effects.renderFrame(tNowSec, boardFrameBuf, {
            sharedEntryX: sharedEntry.x,
            sharedEntryY: sharedEntry.y,
            originColor: origin.color,
            people: remotePeopleState.people,
            tapeArrivals: [],
          });
          renderTapeFrame(tNowSec, tapeFrameBuf, boardFrameBuf);
          hasPreviewFrame = true;
        }
        return frameBuf;
      })();

      const previewRgb = makePreviewRGB(rgb);
      drawLEDs(previewRgb);
    }

    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);

})();
