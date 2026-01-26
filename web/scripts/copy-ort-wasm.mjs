import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "node_modules", "onnxruntime-web", "dist");
const outDir = path.join(root, "public", "onnxruntime");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyIfExists(name) {
  const src = path.join(srcDir, name);
  if (!fs.existsSync(src)) return false;
  const dst = path.join(outDir, name);
  fs.copyFileSync(src, dst);
  return true;
}

ensureDir(outDir);

let copied = 0;

// onnxruntime-web 1.2x は wasm に加えて *.mjs を動的 import します
if (fs.existsSync(srcDir)) {
  const files = fs.readdirSync(srcDir);
  for (const name of files) {
    // wasm backend related artifacts
    if (!/^ort-wasm/i.test(name)) continue;
    if (!/\.(wasm|mjs|js|map)$/i.test(name)) continue;
    if (copyIfExists(name)) copied++;
  }
}

if (copied === 0) {
  console.warn("[postinstall] onnxruntime-web artifacts not found. Check node_modules/onnxruntime-web/dist.");
} else {
  console.log(`[postinstall] copied ${copied} onnxruntime-web artifacts -> public/onnxruntime/`);
}
