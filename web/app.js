import { loadEffects } from "./fx/loader.js";

(async () => {
  // =========================================================
  // 0) 基本設定
  // =========================================================
  const BOARDS = 10;
  const LEDS_PER_BOARD = 48;
  const TOTAL = BOARDS * LEDS_PER_BOARD; // 480
  const FRAME_LEN = TOTAL * 3;           // 1440
  const BAUD = 1000000;

  // m押下中 原点追従の「更新間隔」（秒）
  const ORIGIN_FOLLOW_INTERVAL_SEC = 0.08; // 80msくらい

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

  // =========================================================
  // 1.5) 入力の安全化
  // =========================================================
  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
  function isFiniteNumber(n){ return Number.isFinite(n); }

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
  const ZOOM_MIN = 0.6;
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
  const deg2rad = (d) => d * Math.PI / 180;
  const rad2deg = (r) => r * 180 / Math.PI;

  function makeLocalLEDs48() {
    const pts = new Array(48);

    // 外周: dia92, 30, start 0deg, CCW -> index 0..29
    {
      const dia = 92, n = 30, startDeg = 0;
      const r = dia / 2;
      for (let i = 0; i < n; i++) {
        const a = deg2rad(startDeg + (360 * i / n));
        pts[i] = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      }
    }
    // 中: dia34, 12, start 15deg, CCW -> index 30..41
    {
      const dia = 34, n = 12, startDeg = 15;
      const r = dia / 2;
      for (let i = 0; i < n; i++) {
        const a = deg2rad(startDeg + (360 * i / n));
        pts[30 + i] = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      }
    }
    // 内: dia18, 6, start 0deg, CCW -> index 42..47
    {
      const dia = 18, n = 6, startDeg = 0;
      const r = dia / 2;
      for (let i = 0; i < n; i++) {
        const a = deg2rad(startDeg + (360 * i / n));
        pts[42 + i] = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      }
    }

    return pts;
  }
  const local48 = makeLocalLEDs48();

  // board配列（mm）
  const boards = [];
  function resetAllBoards() {
    boards.length = 0;
    const spacing = 140; // mm
    const startX = -((BOARDS - 1) * spacing) / 2;
    for (let b = 0; b < BOARDS; b++) {
      boards.push({ cx: startX + b*spacing, cy: 0, rotDeg: 0 });
    }
  }
  resetAllBoards();

  // world（連続配列）
  const worldX = new Float32Array(TOTAL);
  const worldY = new Float32Array(TOTAL);
  const worldB = new Uint16Array(TOTAL);
  const worldI = new Uint16Array(TOTAL);

  function rebuildWorld() {
    for (let b = 0; b < BOARDS; b++) {
      const bd = boards[b];
      const th = deg2rad(bd.rotDeg);
      const c = Math.cos(th), s = Math.sin(th);
      for (let i = 0; i < LEDS_PER_BOARD; i++) {
        const p = local48[i];
        const x = p.x * c - p.y * s + bd.cx;
        const y = p.x * s + p.y * c + bd.cy;
        const gi = b * LEDS_PER_BOARD + i;
        worldX[gi] = x;
        worldY[gi] = y;
        worldB[gi] = b;
        worldI[gi] = i;
      }
    }
  }
  rebuildWorld();

  // geo（FXに渡す）
  const GEO = {
    worldX, worldY, worldB, worldI,
    TOTAL, FRAME_LEN, BOARDS, LEDS_PER_BOARD
  };

  // =========================================================
  // 7) 原点（x,y）管理
  // =========================================================
  const origin = { x: 0, y: 0 };

  function snapValue(v, step) { return Math.round(v / step) * step; }
  function maybeSnap(v, step, enabled) { return enabled ? snapValue(v, step) : v; }

  function syncOriginUI() {
    originX.value = String(Math.round(origin.x*10)/10);
    originY.value = String(Math.round(origin.y*10)/10);
    originInfo.textContent = `origin: (${origin.x.toFixed(1)},${origin.y.toFixed(1)}) mm`;
  }

  function setOriginAtWorld(mmX, mmY, eLike) {
    const step = Math.max(1, Number(snapMm.value) || 10);
    const snapEnabled = originSnap.checked && snapOn.checked && !(eLike && eLike.altKey);

    origin.x = maybeSnap(mmX, step, snapEnabled);
    origin.y = maybeSnap(mmY, step, snapEnabled);
    syncOriginUI();
    Effects.onOriginChanged();
  }

  function commitOriginX() {
    commitNumberInput(originX, () => origin.x, (v) => { origin.x = v; }, { allowEmptyToZero: true, post: () => { syncOriginUI(); Effects.onOriginChanged(); } });
  }
  function commitOriginY() {
    commitNumberInput(originY, () => origin.y, (v) => { origin.y = v; }, { allowEmptyToZero: true, post: () => { syncOriginUI(); Effects.onOriginChanged(); } });
  }
  originX.addEventListener("change", commitOriginX);
  originY.addEventListener("change", commitOriginY);
  attachEnterToCommit(originX, commitOriginX);
  attachEnterToCommit(originY, commitOriginY);

  btnOriginZero.addEventListener("click", () => {
    origin.x = 0; origin.y = 0;
    syncOriginUI();
    Effects.onOriginChanged();
  });
  btnOriginToSelected.addEventListener("click", () => {
    const bd = boards[selectedBoard];
    origin.x = bd.cx; origin.y = bd.cy;
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

  function setFollowMode(on){
    followOriginWithMouse = on;
    mInfo.textContent = `m: ${on ? "on" : "off"}`;
    if (on) {
      lastFollowUpdateT = 0;
      setOriginAtWorld(lastMouseMm.x, lastMouseMm.y, { altKey: false });
      Effects.spawnLayerFromCurrent(performance.now()/1000);
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === "m" || e.key === "M") {
      const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : "";
      const isTyping = (tag === "input" || tag === "textarea" || tag === "select");
      if (isTyping) return;
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
  setStatus("idle", "fps: --  seq: ----");
  mInfo.textContent = "m: off";

  function clamp255(v){ return v < 0 ? 0 : v > 255 ? 255 : (v|0); }

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

  fps.addEventListener("input", () => fpsVal.textContent = fps.value);
  gain.addEventListener("input", () => gainVal.textContent = Number(gain.value).toFixed(2));
  gamma.addEventListener("input", () => { gammaVal.textContent = Number(gamma.value).toFixed(2); rebuildGammaLUT(); });

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
    boards[selectedBoard] = { cx: 0, cy: 0, rotDeg: 0 };
    rebuildWorld();
    syncSelectedUI();
  });
  btnResetAll.addEventListener("click", () => {
    resetAllBoards();
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
  // 13) Effects（単一FX + Layer合成）
  // =========================================================
  const Effects = (() => {
    function clamp255(v){ return v < 0 ? 0 : v > 255 ? 255 : (v|0); }

    function buildDefaultParams(fxId) {
      const fx = FX_REGISTRY[fxId];
      const obj = {};
      for (const p of (fx?.params || [])) obj[p.key] = p.default;
      return obj;
    }

    // Base（UI選択中のFX）
    let activeId = FX_ORDER[0] || "red20";
    let activeParams = buildDefaultParams(activeId);
    let baseState = {};
    let baseLastT = 0;

    function resetBaseState() {
      baseState = {};
      baseLastT = 0;
      const fx = FX_REGISTRY[activeId];
      if (fx && fx.init) fx.init(baseState, activeParams);
    }

    function setActive(id) {
      if (!FX_REGISTRY[id]) id = FX_ORDER[0];
      activeId = id;
      activeParams = buildDefaultParams(activeId);
      resetBaseState();
    }
    function setParams(next) { activeParams = { ...activeParams, ...next }; }
    function resetParams() { activeParams = buildDefaultParams(activeId); }
    function resetState() { resetBaseState(); layers.length = 0; }

    // ★Layer system
    const layers = [];
    const tmpLayer = new Uint8Array(FRAME_LEN);

    const LAYER_MAX = 24;
    const LIFE_SEC = 1.6;
    const FADEOUT_SEC = 0.7;
    const LAYER_INTENSITY = 1.0;

    function spawnLayerFromCurrent(nowSec) {
      const id = activeId;
      const params = { ...activeParams };

      // baseRの積み上がり防止
      if ("baseR" in params) params.baseR = 0;

      const st = {};
      const fx = FX_REGISTRY[id];
      if (fx && fx.init) fx.init(st, params);

      layers.push({
        id,
        params,
        state: st,
        born: nowSec,
        lastT: 0,
        originX: origin.x,
        originY: origin.y,
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
      const baseDt = baseLastT ? (nowSec - baseLastT) : (1/60);
      baseLastT = nowSec;

      // ベース描画（今のorigin）
      const baseCtx = { t: nowSec, dt: baseDt, originX: origin.x, originY: origin.y };
      outRGB.fill(0);
      const baseFx = FX_REGISTRY[activeId];
      if (baseFx) baseFx.render(baseCtx, outRGB, baseState, activeParams, GEO);

      // レイヤー合成（固定origin）
      for (let idx = layers.length - 1; idx >= 0; idx--) {
        const L = layers[idx];
        const age = nowSec - L.born;
        const a = layerAlpha(age);
        if (a <= 0) { layers.splice(idx, 1); continue; }

        const dt = L.lastT ? (nowSec - L.lastT) : (1/60);
        L.lastT = nowSec;

        const ctxObj = { t: nowSec, dt, originX: L.originX, originY: L.originY };

        tmpLayer.fill(0);
        const fx = FX_REGISTRY[L.id];
        if (fx) fx.render(ctxObj, tmpLayer, L.state, L.params, GEO);

        mixLayerInto(outRGB, tmpLayer, a);
      }

      return outRGB;
    }

    function onOriginChanged() {}
    function getRegistry(){ return FX_REGISTRY; }
    function getOrder(){ return FX_ORDER.slice(); }
    function getActiveId(){ return activeId; }
    function getActiveParams(){ return { ...activeParams }; }

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
    };
  })();

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
    rebuildFxParamsUI();
  });

  btnFxResetParams.addEventListener("click", () => {
    Effects.resetParams();
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
        note: "board order: 0..9, each board index: 0..47 (outer 30, mid 12 start 15deg, inner 6)."
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
      setStatus(writer ? (running ? "running" : "connected") : "idle",
        `fps: ${fps.value}  seq: ${String(seq).padStart(4,"0")}  copied`);
      setTimeout(() => setStatus(writer ? (running ? "running" : "connected") : "idle"), 650);
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
  function dist2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx*dx + dy*dy;
  }
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
  // 11) マウス操作（ドラッグ移動/回転）+ Ctrlクリックで原点設定
  // =========================================================
  let mouse = { sx:0, sy:0, down:false, dragging:false };
  let drag = {
    board: 0,
    mode: "move",
    startCx: 0, startCy: 0, startRot: 0,
    startMmX: 0, startMmY: 0,
    startAngle: 0
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
  window.addEventListener("pointerup", onPointerUp);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      boards[selectedBoard] = { cx: 0, cy: 0, rotDeg: 0 };
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
      btnStart.disabled = false;
      btnStop.disabled = true;

      setStatus("connected", `fps: ${fps.value}  seq: ${String(seq).padStart(4,"0")}`);
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
      btnStart.disabled = true;
      btnStop.disabled = true;
      setStatus("idle", "fps: --  seq: ----");
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

    const packet = new Uint8Array(2 + 2 + 2 + rgb.length);
    packet[0] = 78; // 'N'
    packet[1] = 80; // 'P'
    packet[2] = rgb.length & 0xff;
    packet[3] = (rgb.length >> 8) & 0xff;
    packet[4] = seq & 0xff;
    packet[5] = (seq >> 8) & 0xff;
    packet.set(rgb, 6);

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
  // 15) 色処理（gain + gamma）
  // =========================================================
  function applyGainGamma(rgb) {
    const G = Math.max(0, Math.min(1, Number(gain.value)));
    if (G !== 1) {
      for (let i = 0; i < rgb.length; i++) rgb[i] = clamp255(Math.round(rgb[i] * G));
    }
    for (let i = 0; i < rgb.length; i++) rgb[i] = gammaLUT[rgb[i]];
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
      ctx.fillText(`b${b}`, c.sx + 8, c.sy - 10);

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

  function drawLEDs(rgb) {
    for (let gi = 0; gi < TOTAL; gi++) {
      const r = rgb[gi*3+0], g = rgb[gi*3+1], b = rgb[gi*3+2];
      const p = mmToScreen(worldX[gi], worldY[gi]);

      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 9, 0, Math.PI*2);
      ctx.fill();

      ctx.globalAlpha = 0.98;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 3.6, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      if (showIndex.checked) {
        ctx.save();
        ctx.fillStyle = "rgba(233,239,250,.45)";
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
        ctx.fillText(String(worldI[gi]), p.sx + 5, p.sy + 3);
        ctx.restore();
      }
    }
  }

  // =========================================================
  // 17) ループ
  // =========================================================
  const frameBuf = new Uint8Array(FRAME_LEN);

  function start() {
    if (!writer) return;
    running = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
    setStatus("running", `fps: ${fps.value}  seq: ${String(seq).padStart(4,"0")}`);
    lastTick = 0;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    btnStart.disabled = !writer;
    btnStop.disabled = true;
    setStatus(writer ? "connected" : "idle",
      `fps: ${writer ? fps.value : "--"}  seq: ${writer ? String(seq).padStart(4,"0") : "----"}`);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  btnStart.addEventListener("click", start);
  btnStop.addEventListener("click", stop);

  function maybeUpdateOriginFollow(tNowSec) {
    if (!followOriginWithMouse) return;
    const dt = tNowSec - lastFollowUpdateT;
    if (dt < ORIGIN_FOLLOW_INTERVAL_SEC) return;

    lastFollowUpdateT = tNowSec;
    setOriginAtWorld(lastMouseMm.x, lastMouseMm.y, { altKey: false });

    Effects.spawnLayerFromCurrent(tNowSec);
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

    let frame = null;

    if (doFrame && running) {
      lastTick = ts;
      frame = Effects.renderFrame(tNowSec, frameBuf);
      applyGainGamma(frame);
      sendFrame(frame);

      statusSub.textContent = `fps: ${targetFps}  seq: ${String(seq).padStart(4,"0")}`;
    }

    if (doDraw) {
      lastDraw = ts;
      drawBackground();
      drawGrid();
      drawBoardsOutline();
      drawRings();
      drawOriginMarker();

      const rgb = frame || Effects.renderFrame(tNowSec, frameBuf);

      const tmp = new Uint8Array(rgb);
      applyGainGamma(tmp);

      drawLEDs(tmp);
    }

    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);

})();
