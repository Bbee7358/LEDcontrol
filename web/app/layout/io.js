export function initLayoutIO({ dom, effects, origin, boards, BOARDS, LEDS_PER_BOARD, TOTAL, rebuildWorld, syncSelectedUI, rebuildFxParamsUI, state, setStatus, syncOriginUI }) {
  function makeLayoutJSON() {
    return {
      version: 2,
      meta: {
        boards: BOARDS,
        ledsPerBoard: LEDS_PER_BOARD,
        total: TOTAL,
        note: "board order: 0..9, each board index: 0..47 (outer 30, mid 12 start 15deg, inner 6).",
      },
      origin: { x: origin.x, y: origin.y },
      boards: boards.map((b, idx) => ({ id: idx, cx: b.cx, cy: b.cy, rotDeg: b.rotDeg })),
      fx: {
        id: effects.getActiveId(),
        params: effects.getActiveParams(),
      },
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
        rotDeg: Number(it.rotDeg) || 0,
      };
    }

    if (obj.origin && Number.isFinite(obj.origin.x) && Number.isFinite(obj.origin.y)) {
      origin.x = Number(obj.origin.x);
      origin.y = Number(obj.origin.y);
      syncOriginUI();
      effects.onOriginChanged();
    }

    if (obj.fx && obj.fx.id) {
      effects.setActive(String(obj.fx.id));
      if (obj.fx.params && typeof obj.fx.params === "object") {
        effects.setParams(obj.fx.params);
      }
      dom.fxSelect.value = effects.getActiveId();
      rebuildFxParamsUI();
    }

    rebuildWorld();
    syncSelectedUI();
    return true;
  }

  dom.btnExport.addEventListener("click", () => {
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

  dom.btnCopy.addEventListener("click", async () => {
    const obj = makeLayoutJSON();
    const text = JSON.stringify(obj, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus(state.writer ? (state.running ? "running" : "connected") : "idle",
        `fps: ${dom.fps.value}  seq: ${String(state.seq).padStart(4, "0")}  copied`);
      setTimeout(() => setStatus(state.writer ? (state.running ? "running" : "connected") : "idle"), 650);
    } catch {
      alert("クリップボードにコピーできませんでした。");
    }
  });

  dom.btnImport.addEventListener("click", () => dom.fileInput.click());
  dom.fileInput.addEventListener("change", async () => {
    const f = dom.fileInput.files?.[0];
    dom.fileInput.value = "";
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

  return { makeLayoutJSON, applyLayoutJSON };
}
