# YOLOモデル配置

このプロジェクトはブラウザ内でYOLO推論（ONNX Runtime Web）を行います。

次の場所に **YOLOv8 COCO の ONNX** を置いてください（ファイル名固定）:

- `web/public/models/yolov8n.onnx`

メモ:
- person クラス（COCOの class 0）だけを使います。
- モデルの入出力形式が違う場合は `web/tracking/yoloPersonTracker.js` の postprocess を調整してください。

