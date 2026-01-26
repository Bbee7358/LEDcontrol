import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  optimizeDeps: {
    exclude: ["onnxruntime-web"]
  },
  server: {
    host: "127.0.0.1",
    strictPort: true
  }
});
