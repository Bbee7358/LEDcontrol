import { attachEnterToCommit } from "../utils/input.js";

export function initFxUI({ dom, effects }) {
  function rebuildFxParamsUI() {
    const reg = effects.getRegistry();
    const fx = reg[effects.getActiveId()];
    const params = effects.getActiveParams();

    dom.fxParams.innerHTML = "";

    const head = document.createElement("div");
    head.className = "fxitem";
    head.innerHTML = `
      <div class="name">
        <div>${fx.label}</div>
        <div class="desc">${fx.desc || ""}</div>
      </div>
    `;
    dom.fxParams.appendChild(head);

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
          effects.setParams({ [p.key]: input.checked });
        });
        right.appendChild(input);
      } else if (p.type === "select") {
        input = document.createElement("select");
        for (const [val, label] of (p.options || [])) {
          const opt = document.createElement("option");
          opt.value = String(val);
          opt.textContent = String(label);
          input.appendChild(opt);
        }
        input.value = String(params[p.key]);
        input.addEventListener("change", () => {
          effects.setParams({ [p.key]: input.value });
        });
        right.appendChild(input);
      } else {
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
          effects.setParams({ [p.key]: v });
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
      dom.fxParams.appendChild(row);
    }
  }

  function buildFxUI() {
    dom.fxSelect.innerHTML = "";
    const reg = effects.getRegistry();
    const order = effects.getOrder();

    for (const id of order) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = reg[id].label;
      dom.fxSelect.appendChild(opt);
    }
    dom.fxSelect.value = effects.getActiveId();

    rebuildFxParamsUI();
  }

  dom.fxSelect.addEventListener("change", () => {
    effects.setActive(dom.fxSelect.value);
    rebuildFxParamsUI();
  });

  dom.btnFxResetParams.addEventListener("click", () => {
    effects.resetParams();
    rebuildFxParamsUI();
  });

  dom.btnFxResetState.addEventListener("click", () => {
    effects.resetState();
  });

  buildFxUI();

  return { rebuildFxParamsUI };
}
