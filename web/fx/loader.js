// fx/loader.js
export async function loadEffects() {
  // Vite対応: ビルド時にFXモジュールを取り込む
  const fxModules = import.meta.glob("./*.js");

  // 1) manifest を試す（確実）
  let files = await tryLoadManifest();

  // 2) manifest がない/空ならディレクトリ一覧（環境依存）を試す
  if (!files || files.length === 0) {
    files = await tryScanDirectory(fxModules);
  }

  // 3) 最低限フォールバック
  if (!files || files.length === 0) {
    files = ["originGlow.js", "ripple.js"];
  }

  const uniq = Array.from(new Set(files.map(normalizeJsName))).filter(Boolean);

  const registry = {};
  for (const file of uniq) {
    try {
      const key = `./${file}`;
      const importer = fxModules[key];
      if (!importer) {
        console.warn(`[FX] not found: ${file}`);
        continue;
      }
      const mod = await importer();
      const fx = mod.default ?? mod.fx ?? mod;
      if (!fx || typeof fx.render !== "function") {
        console.warn(`[FX] invalid module: ${file}`);
        continue;
      }

      const id = fx.id || file.replace(/\.js$/i, "");
      registry[id] = {
        id,
        label: fx.label || id,
        desc: fx.desc || "",
        params: Array.isArray(fx.params) ? fx.params : [],
        init: typeof fx.init === "function" ? fx.init : (() => {}),
        render: fx.render,
      };
    } catch (e) {
      console.warn(`[FX] failed import: ${file}`, e);
    }
  }

  return registry;
}

function normalizeJsName(s) {
  if (!s) return null;
  s = String(s).trim();
  if (!s) return null;
  if (!s.endsWith(".js")) s += ".js";
  return s;
}

async function tryLoadManifest() {
  try {
    const url = new URL("./manifest.json", import.meta.url);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const files = Array.isArray(json) ? json : json.files;
    return Array.isArray(files) ? files : null;
  } catch {
    return null;
  }
}

// 環境依存：/fx/ へのアクセスで一覧HTMLが返るサーバのみ
async function tryScanDirectory(fxModules) {
  try {
    const url = new URL("./", import.meta.url);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;

    const html = await res.text();
    const re = /href\s*=\s*["']([^"']+\.js)["']/gi;

    const out = [];
    let m;
    while ((m = re.exec(html))) {
      const href = m[1];
      if (/^https?:\/\//i.test(href)) continue;
      const name = href.split("/").pop();
      out.push(name);
    }
    return out;
  } catch {
    // Vite等でディレクトリ一覧が取れない場合は、取り込まれているFX一覧を返す
    if (fxModules) {
      return Object.keys(fxModules)
        .map((k) => k.split("/").pop())
        .filter((n) => n && n !== "loader.js");
    }
    return null;
  }
}
