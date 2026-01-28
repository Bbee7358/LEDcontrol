import { attachEnterToCommit, commitNumberInput } from "./utils/input.js";

export function createOrigin({ dom, effects, state, origin }) {
  function snapValue(v, step) { return Math.round(v / step) * step; }
  function maybeSnap(v, step, enabled) { return enabled ? snapValue(v, step) : v; }

  function syncOriginUI() {
    dom.originX.value = String(Math.round(origin.x * 10) / 10);
    dom.originY.value = String(Math.round(origin.y * 10) / 10);
    dom.originInfo.textContent = `origin: (${origin.x.toFixed(1)},${origin.y.toFixed(1)}) mm`;
  }

  function setOriginAtWorld(mmX, mmY, eLike) {
    const step = Math.max(1, Number(dom.snapMm.value) || 10);
    const snapEnabled = dom.originSnap.checked && dom.snapOn.checked && !(eLike && eLike.altKey);

    origin.x = maybeSnap(mmX, step, snapEnabled);
    origin.y = maybeSnap(mmY, step, snapEnabled);
    syncOriginUI();
    effects.onOriginChanged();
  }

  function commitOriginX() {
    commitNumberInput(dom.originX, () => origin.x, (v) => { origin.x = v; }, {
      allowEmptyToZero: true,
      post: () => { syncOriginUI(); effects.onOriginChanged(); },
    });
  }
  function commitOriginY() {
    commitNumberInput(dom.originY, () => origin.y, (v) => { origin.y = v; }, {
      allowEmptyToZero: true,
      post: () => { syncOriginUI(); effects.onOriginChanged(); },
    });
  }

  dom.originX.addEventListener("change", commitOriginX);
  dom.originY.addEventListener("change", commitOriginY);
  attachEnterToCommit(dom.originX, commitOriginX);
  attachEnterToCommit(dom.originY, commitOriginY);

  dom.btnOriginZero.addEventListener("click", () => {
    origin.x = 0;
    origin.y = 0;
    syncOriginUI();
    effects.onOriginChanged();
  });

  dom.btnOriginToSelected.addEventListener("click", () => {
    const bd = state.boards[state.selectedBoard];
    origin.x = bd.cx;
    origin.y = bd.cy;
    syncOriginUI();
    effects.onOriginChanged();
  });

  function setFollowMode(on) {
    state.followOriginWithMouse = on;
    dom.mInfo.textContent = `m: ${on ? "on" : "off"}`;
    if (on) {
      state.lastFollowUpdateT = 0;
      setOriginAtWorld(state.lastMouseMm.x, state.lastMouseMm.y, { altKey: false });
      effects.spawnLayerFromCurrent(performance.now() / 1000);
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

  syncOriginUI();

  return {
    origin,
    syncOriginUI,
    setOriginAtWorld,
    setFollowMode,
  };
}
