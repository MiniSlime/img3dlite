# AGENTS.md

## 目的
- `requirements.md` に基づく、React + Three.js + OpenCV.js の 3D モデリングプロトタイプ開発を継続的に進めるための作業指針を定義する。

## 優先順位
1. ユーザーの明示指示
2. `requirements.md`
3. 本ドキュメント

## 現在の実装サマリー（2026-02-18 更新）
- アプリ基盤: Vite + React + TypeScript。
- Gemini呼び出し: フロントエンド（`src/utils/bgRemovalViaGemini.ts`）から直接 Gemini API を呼び出す。
- OpenCV ロード: `public/opencv.js` を script で同一オリジン配信し、`useOpenCV` で初期化待機。
- 画像処理:
  - Geminiに画像送信し背景を単一青に編集
  - 青背景を透明化（フロントのCanvas処理）
  - OpenCVで輪郭抽出・近似・`THREE.Shape` 変換
- 3D化: Extrude + 軸回転 + CSG intersection（`three-bvh-csg`）。
- UI:
  - Upload / Parameter / Viewer / Export / 処理ステータス表示
- 出力: `.glb` / `.stl` エクスポート。

## 主要ファイル
- `src/App.tsx`: 画面統合、状態管理、処理実行トリガー
- `src/hooks/useOpenCV.ts`: OpenCV.js ロード管理
- `src/utils/bgRemovalViaGemini.ts`: Gemini呼び出し + 青透明化
- `src/utils/imageToShape.ts`: 画像から Shape 変換
- `src/utils/buildIntersectionGeometry.ts`: 3視点の交差形状生成
- `src/components/UploadPanel.tsx`: 3画像アップロード
- `src/components/Viewer3D.tsx`: R3F ビュー表示
- `src/components/ExportPanel.tsx`: GLB / STL エクスポート
- `src/components/ParameterControls.tsx`: Smoothness 調整

## 実装ポリシー
- 変更は小さく分割し、毎ステップでビルド可を維持する。
- OpenCV の `Mat` / `MatVector` は必ず `delete()` で解放する（`delete` が存在するかも確認）。
- 直接呼び出し運用では `.env` の `VITE_GEMINI_API_KEY` を利用する（本番での鍵露出リスクを理解した上で運用）。
- 背景透過は Gemini の青背景化 + フロントの青透明化で行う。
- CSG 計算は `useMemo` を用い、不要な再計算を避ける。
- 仕様追加時はユーティリティ化を優先し、UI とロジックを分離する。

## 重要なエラー対処履歴（再発防止メモ）
- OpenCV CDN 403:
  - 症状: `docs.opencv.org` の script が `403 / NotSameOrigin`。
  - 対処: `public/opencv.js` のローカル配信へ切替。
- Blob URL 読み込み失敗:
  - 症状: `Failed to load image: blob:...`。
  - 原因: `URL.revokeObjectURL` が早すぎる。
  - 対処: アンマウント時のみ revoke に統一。
- `Cannot use 'in' operator to search for 'x' in undefined`:
  - 症状: 前処理・Shape生成で断続的に発生。
  - 主因: 不正点列、`ShapeUtils` 呼び出し、OpenCV引数の `undefined`。
  - 対処:
    - 点列サニタイズ強化（有限値/重複/面積チェック）
    - `ShapeUtils` 依存を外し自前面積計算へ変更
    - hierarchy 参照を安全化
    - Morphology引数のアンカーを明示
    - デバッグログを画面表示（どの段階で失敗したかを可視化）
- 背景除去関連ロジック（`inRange` / 連結成分 / GrabCut）は撤去済み。Geminiベースへ移行。
- 初期レンダリング時に shape 未入力で `buildIntersectionGeometry` が throw して白画面化する問題を `App.tsx` 側で防止済み（try/catch）。

## 次フェーズの優先タスク
1. 各ビューの寸法に応じて押し出し深さを自動決定する。
2. 複数輪郭の Group 運用（最大輪郭固定の改善）を検討する。
3. Gemini失敗時のリトライ/待機UI改善（現状は中断）。
4. （必要なら）Tailwind CSS へ移行する。
5. サンプル画像と最小テスト手順を整備する。

## 現在の挙動メモ
- `Smoothness`（epsilon）は反映される。
- 処理フローは `Gemini背景青化 -> 青透明化 -> 輪郭抽出 -> 3D生成`。
- Gemini失敗時は処理中断する（フォールバックなし）。

## 作業完了報告テンプレート
- 対応内容:
- 変更ファイル:
- 検証結果:
- 既知の課題:
- 次の提案:

