# img3dlite

`requirements.md` を元にした、React + Three.js + OpenCV.js による Deterministic 3D モデリングアプリのプロトタイプです。  
3枚の直交投影画像（Front / Top / Side）から輪郭を抽出し、Extrude + CSG 交差で 3D メッシュを生成します。

背景透過は外部APIで実施する方針です。  
本アプリでは「透過済み画像（PNGのアルファチャンネル付き）」を入力として扱います。

## 技術スタック
- React + TypeScript + Vite
- Three.js / React Three Fiber / drei
- OpenCV.js (WASM)
- three-bvh-csg

## 現在の実装範囲
- Front / Top / Side の画像アップロード
- Smoothness(approxPolyDP epsilon) パラメータ調整
- Gemini APIで背景を単一青に編集
- 青背景を透明化して透過PNG化
- OpenCV 前処理（透過後画像のマスク利用 + 輪郭抽出）
- 輪郭抽出（`cv.findContours`）と `THREE.Shape` 変換
- 各ビューの Extrude + 回転 + CSG 交差による形状生成
- R3F ビューア表示（OrbitControls）
- `.glb` / `.stl` エクスポート

## セットアップ
```bash
npm install
```

## 開発サーバー起動
```bash
npm run dev
```

ブラウザで `http://localhost:5173/` を開いてください。

## ビルド
```bash
npm run build
```

## 使い方
1. Front / Top / Side の画像をそれぞれアップロード
2. 必要に応じて `Smoothness` を調整
3. `Generate 3D Mesh` をクリック（Gemini背景処理 -> 青透明化 -> 3D化）
4. 生成結果を確認し、必要なら `Export .glb` / `Export .stl`

## 環境変数
- `.env` に `VITE_GEMINI_API_KEY` を設定してください（フロントエンドから直接利用されます）。

## 開発時の構成
- `npm run dev` で Vite 開発サーバーを起動します。
- Gemini API はブラウザから直接呼び出します（サーバープロキシなし）。

## GitHub Pages 公開
- このリポジトリには `/.github/workflows/deploy-gh-pages.yml` を用意してあります。
- `main` または `master` への push、または手動実行（`workflow_dispatch`）で Pages へデプロイします。
- リポジトリの `Settings > Secrets and variables > Actions` に `VITE_GEMINI_API_KEY` を登録してください。
  - 注意: `VITE_` 付き変数はフロントに埋め込まれるため、公開サイト上で実質的に秘匿できません。
- 初回のみ `Settings > Pages` で Build and deployment の Source を `GitHub Actions` に設定してください。

## プロジェクト構成（主要）
- `src/App.tsx`: 画面統合と処理フロー
- `src/hooks/useOpenCV.ts`: OpenCV.js 読み込み
- `src/utils/imageToShape.ts`: 画像 -> Shape
- `src/utils/buildIntersectionGeometry.ts`: Shape -> 交差 Geometry
- `src/components/`: UI コンポーネント群

## 既知の課題
- 複数輪郭入力はユーティリティ実装済みだが、現状の画面処理は最大輪郭優先。
- スタイリングは通常 CSS で、Tailwind は未導入。
- 背景透過精度は Gemini の出力品質に依存する。
