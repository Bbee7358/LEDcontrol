import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const ortSrcDir = path.join(rootDir, "node_modules", "onnxruntime-web", "dist");
const ortOutDir = path.join(rootDir, "public", "onnxruntime");

function ensureOrtWasmArtifacts() {
  try {
    if (!fs.existsSync(ortSrcDir)) {
      console.warn("[vite] onnxruntime-web dist not found. Run npm install.");
      return;
    }
    fs.mkdirSync(ortOutDir, { recursive: true });

    const files = fs.readdirSync(ortSrcDir);
    let copied = 0;
    for (const name of files) {
      if (!/^ort-wasm/i.test(name)) continue;
      if (!/\.(wasm|mjs|js|map)$/i.test(name)) continue;
      const src = path.join(ortSrcDir, name);
      const dst = path.join(ortOutDir, name);
      let shouldCopy = true;
      if (fs.existsSync(dst)) {
        const srcStat = fs.statSync(src);
        const dstStat = fs.statSync(dst);
        shouldCopy = srcStat.size !== dstStat.size || srcStat.mtimeMs > dstStat.mtimeMs;
      }
      if (!shouldCopy) continue;
      fs.copyFileSync(src, dst);
      copied++;
    }

    if (copied > 0) {
      console.log(`[vite] copied ${copied} onnxruntime-web artifacts -> public/onnxruntime/`);
    }
  } catch (e) {
    console.warn("[vite] failed to copy onnxruntime-web artifacts:", e);
  }
}

ensureOrtWasmArtifacts();

export default defineConfig({
  base: "./",
  optimizeDeps: {
    exclude: ["onnxruntime-web"]
  },
  server: {
    host: "127.0.0.1",
    strictPort: true,
    headers: {
      // threaded wasm / SharedArrayBuffer 用（onnxruntime-web が最適版を選べるように）
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    }
  }
});
