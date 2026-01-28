import { isFiniteNumber } from "./math.js";

export function attachEnterToCommit(inputEl, commitFn) {
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitFn();
      inputEl.blur();
    }
  });
}

export function commitNumberInput(inputEl, getCurrent, setValue, { allowEmptyToZero = true, post = null } = {}) {
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
