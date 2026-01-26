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

const candidates = [
  "ort-wasm.wasm",
  "ort-wasm-simd.wasm",
  "ort-wasm-threaded.wasm",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm.wasm.map",
  "ort-wasm-simd.wasm.map",
  "ort-wasm-threaded.wasm.map",
  "ort-wasm-simd-threaded.wasm.map",
];

let copied = 0;
for (const f of candidates) {
  if (copyIfExists(f)) copied++;
}

if (copied === 0) {
  console.warn("[postinstall] onnxruntime-web wasm files not found. Check node_modules/onnxruntime-web/dist.");
} else {
  console.log(`[postinstall] copied ${copied} onnxruntime-web wasm files -> public/onnxruntime/`);
}

