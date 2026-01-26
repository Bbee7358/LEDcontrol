# LED Layout Studio（Vite）

送信プロトコルや挙動はそのままに、`web/` を Vite で開発/ビルドできるようにした構成です。

## 開発サーバ（推奨）

```bash
cd web
npm install
npm run dev
```

Chrome系ブラウザで `http://127.0.0.1:5173` を開き、`Connect` → `Start` で送信します。

## ビルド/プレビュー

```bash
cd web
npm run build
npm run preview
```

## メモ

- WebSerial は **セキュアコンテキスト（localhost含む）** が必要なので、基本は `npm run dev` を使うのが確実です。
- 再読み込み後は、以前許可したポートが1つだけの場合に自動でそれを優先します（`Connect` クリック時）。
- カメラトラッキングは YOLO（person）+ 追従で `origin` に反映します。モデルは `web/public/models/README.md` を参照してください。

## よくあるエラー

### `no available backend found` / `Failed to fetch dynamically imported module .../onnxruntime/ort-wasm-*.mjs`

`onnxruntime-web` の wasm 付属ファイルが `web/public/onnxruntime/` に揃っていない状態です。

```bash
cd web
npm run sync-ort
```

その後 `npm run dev` を再起動してください。
