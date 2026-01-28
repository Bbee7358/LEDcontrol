export function loadLocalStorageString(key, fallback = "") {
  try {
    const v = localStorage.getItem(key);
    return (v == null || v === "") ? fallback : v;
  } catch {
    return fallback;
  }
}

export function loadLocalStorageNumber(key, fallback = 0) {
  const v = Number(loadLocalStorageString(key, ""));
  return Number.isFinite(v) ? v : fallback;
}

export function loadLocalStorageBoolean(key, fallback = false) {
  const v = loadLocalStorageString(key, "");
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

export function saveLocalStorage(key, value) {
  try { localStorage.setItem(key, String(value)); } catch {}
}
