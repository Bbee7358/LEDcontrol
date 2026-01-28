import { clamp } from "./utils/math.js";
import { attachEnterToCommit, commitNumberInput } from "./utils/input.js";

export function initUI({ dom, state, view, geometry, color }) {
  function setStatus(stateText, sub = "") {
    dom.statusLine.textContent = stateText;
    if (sub) dom.statusSub.textContent = sub;

    if (stateText.startsWith("running")) {
      dom.pill.style.background = "rgba(52,211,153,.85)";
      dom.pill.style.boxShadow = "0 0 0 2px rgba(52,211,153,.18), 0 10px 30px rgba(52,211,153,.20)";
    } else if (stateText.startsWith("connected")) {
      dom.pill.style.background = "rgba(125,211,252,.85)";
      dom.pill.style.boxShadow = "0 0 0 2px rgba(125,211,252,.18), 0 10px 30px rgba(125,211,252,.18)";
    } else if (stateText.includes("error") || stateText.includes("failed")) {
      dom.pill.style.background = "rgba(251,113,133,.9)";
      dom.pill.style.boxShadow = "0 0 0 2px rgba(251,113,133,.18), 0 10px 30px rgba(251,113,133,.20)";
    } else {
      dom.pill.style.background = "rgba(255,255,255,.28)";
      dom.pill.style.boxShadow = "0 0 0 2px rgba(255,255,255,.08)";
    }
  }

  function syncSelectedUI() {
    const bd = geometry.boards[state.selectedBoard];
    dom.rotDeg.value = String(Math.round(bd.rotDeg * 100) / 100);
    dom.posX.value = String(Math.round(bd.cx * 100) / 100);
    dom.posY.value = String(Math.round(bd.cy * 100) / 100);
    dom.selInfo.textContent = `selected: board ${state.selectedBoard}`;
  }

  for (let b = 0; b < geometry.boards.length; b++) {
    const opt = document.createElement("option");
    opt.value = String(b);
    opt.textContent = `board ${b}`;
    dom.selBoard.appendChild(opt);
  }
  state.selectedBoard = 0;
  dom.selBoard.value = String(state.selectedBoard);
  syncSelectedUI();

  dom.selBoard.addEventListener("change", () => {
    state.selectedBoard = parseInt(dom.selBoard.value, 10) || 0;
    syncSelectedUI();
  });

  function commitPosX() {
    const bd = geometry.boards[state.selectedBoard];
    commitNumberInput(dom.posX, () => bd.cx, (v) => { bd.cx = v; }, {
      allowEmptyToZero: true,
      post: () => { geometry.rebuildWorld(); syncSelectedUI(); },
    });
  }
  function commitPosY() {
    const bd = geometry.boards[state.selectedBoard];
    commitNumberInput(dom.posY, () => bd.cy, (v) => { bd.cy = v; }, {
      allowEmptyToZero: true,
      post: () => { geometry.rebuildWorld(); syncSelectedUI(); },
    });
  }
  function commitRotDeg() {
    const bd = geometry.boards[state.selectedBoard];
    commitNumberInput(dom.rotDeg, () => bd.rotDeg, (v) => { bd.rotDeg = v; }, {
      allowEmptyToZero: true,
      post: () => { geometry.rebuildWorld(); syncSelectedUI(); },
    });
  }

  dom.posX.addEventListener("change", commitPosX);
  dom.posY.addEventListener("change", commitPosY);
  dom.rotDeg.addEventListener("change", commitRotDeg);
  attachEnterToCommit(dom.posX, commitPosX);
  attachEnterToCommit(dom.posY, commitPosY);
  attachEnterToCommit(dom.rotDeg, commitRotDeg);

  dom.btnResetBoard.addEventListener("click", () => {
    geometry.boards[state.selectedBoard] = { cx: 0, cy: 0, rotDeg: 0 };
    geometry.rebuildWorld();
    syncSelectedUI();
  });
  dom.btnResetAll.addEventListener("click", () => {
    geometry.resetAllBoards();
    geometry.rebuildWorld();
    syncSelectedUI();
  });
  dom.btnCenter.addEventListener("click", () => {
    let sx = 0, sy = 0;
    for (const b of geometry.boards) { sx += b.cx; sy += b.cy; }
    view.view.cx = sx / geometry.boards.length;
    view.view.cy = sy / geometry.boards.length;
  });

  dom.fps.addEventListener("input", () => dom.fpsVal.textContent = dom.fps.value);
  dom.gain.addEventListener("input", () => dom.gainVal.textContent = Number(dom.gain.value).toFixed(2));
  dom.gamma.addEventListener("input", () => { dom.gammaVal.textContent = Number(dom.gamma.value).toFixed(2); color.rebuildGammaLUT(); });

  dom.lookHueVal.textContent = String(dom.lookHue.value);
  dom.lookSatVal.textContent = Number(dom.lookSat.value).toFixed(2);
  dom.trackSmoothVal.textContent = Number(dom.trackSmooth.value).toFixed(2);
  dom.trackSensVal.textContent = Number(dom.trackSens.value).toFixed(2);

  dom.lookHue.addEventListener("input", () => { dom.lookHueVal.textContent = String(dom.lookHue.value); });
  dom.lookSat.addEventListener("input", () => { dom.lookSatVal.textContent = Number(dom.lookSat.value).toFixed(2); });
  dom.trackSmooth.addEventListener("input", () => { dom.trackSmoothVal.textContent = Number(dom.trackSmooth.value).toFixed(2); });
  dom.trackSens.addEventListener("input", () => { dom.trackSensVal.textContent = Number(dom.trackSens.value).toFixed(2); });

  function commitMm2px() {
    commitNumberInput(dom.mm2px, () => view.view.scale, (v) => { view.setZoom(v); }, { allowEmptyToZero: false });
  }
  dom.mm2px.addEventListener("change", commitMm2px);
  attachEnterToCommit(dom.mm2px, commitMm2px);

  view.setZoom(parseFloat(dom.mm2px.value) || 2.2);

  function commitSnapMm() {
    commitNumberInput(dom.snapMm, () => (Number(dom.snapMm.getAttribute("data-last")) || 10), (v) => {
      const nv = clamp(Math.round(v), 1, 200);
      dom.snapMm.value = String(nv);
      dom.snapMm.setAttribute("data-last", String(nv));
    }, { allowEmptyToZero: false });
  }
  dom.snapMm.setAttribute("data-last", dom.snapMm.value);
  dom.snapMm.addEventListener("change", commitSnapMm);
  attachEnterToCommit(dom.snapMm, commitSnapMm);

  setStatus("idle", "fps: --  seq: ----");
  dom.mInfo.textContent = "m: off";

  color.rebuildGammaLUT();

  return {
    setStatus,
    syncSelectedUI,
  };
}
