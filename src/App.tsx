import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UploadPanel, type ViewKey } from "./components/UploadPanel";
import { ParameterControls } from "./components/ParameterControls";
import { Viewer3D } from "./components/Viewer3D";
import { ExportPanel } from "./components/ExportPanel";
import { GeminiPreviewPanel } from "./components/GeminiPreviewPanel";
import { imageToShapeWithPreview } from "./utils/imageToShape";
import { convertBlueToTransparent, requestBlueBackgroundImage } from "./utils/bgRemovalViaGemini";
import { useOpenCV } from "./hooks/useOpenCV";
import { buildIntersectionGeometry } from "./utils/buildIntersectionGeometry";
import * as THREE from "three";
import "./styles/app.css";

type FilesByView = Record<ViewKey, File | null>;
type UrlsByView = Record<ViewKey, string | null>;
type ShapesByView = Record<ViewKey, THREE.Shape | null>;

const initialFiles: FilesByView = { front: null, top: null, side: null };
const initialUrls: UrlsByView = { front: null, top: null, side: null };
const initialShapes: ShapesByView = { front: null, top: null, side: null };
const MIN_EXTRUSION_DEPTH = 300;

function getShapeMaxDimension(shape: THREE.Shape): number {
  const points = shape.getPoints().filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (points.length < 2) return 0;

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return Math.max(maxX - minX, maxY - minY);
}

function computeExtrusionDepth(shapes: ShapesByView): number {
  const present = [shapes.front, shapes.top, shapes.side].filter(Boolean) as THREE.Shape[];
  if (present.length === 0) return MIN_EXTRUSION_DEPTH;

  let maxDimension = 0;
  for (let i = 0; i < present.length; i += 1) {
    maxDimension = Math.max(maxDimension, getShapeMaxDimension(present[i]));
  }

  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    return MIN_EXTRUSION_DEPTH;
  }

  // Use sufficiently large depth to avoid truncation before CSG intersection.
  return Math.max(MIN_EXTRUSION_DEPTH, Math.ceil(maxDimension * 2.5));
}
const initialGeminiImages: Record<ViewKey, string | null> = { front: null, top: null, side: null };

export default function App() {
  const { isReady: isOpenCVReady, error: openCVError } = useOpenCV();

  const [files, setFiles] = useState<FilesByView>(initialFiles);
  const [imageUrls, setImageUrls] = useState<UrlsByView>(initialUrls);
  const [shapes, setShapes] = useState<ShapesByView>(initialShapes);
  const [geminiImages, setGeminiImages] = useState<Record<ViewKey, string | null>>(initialGeminiImages);
  const [epsilonRatio, setEpsilonRatio] = useState(0.01);
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imageUrlsRef = useRef<UrlsByView>(initialUrls);
  const extrusionDepth = useMemo(() => computeExtrusionDepth(shapes), [shapes]);
  const geminiImageUrlsRef = useRef<Record<ViewKey, string | null>>(initialGeminiImages);

  const canProcess = useMemo(() => {
    return Boolean(isOpenCVReady && imageUrls.front && imageUrls.top && imageUrls.side);
  }, [isOpenCVReady, imageUrls.front, imageUrls.top, imageUrls.side]);

  const onChangeFile = useCallback((view: ViewKey, file: File | null) => {
    setFiles((prev) => ({ ...prev, [view]: file }));

    setImageUrls((prev) => {
      if (prev[view]) {
        URL.revokeObjectURL(prev[view]);
      }
      return { ...prev, [view]: file ? URL.createObjectURL(file) : null };
    });

    setShapes((prev) => ({ ...prev, [view]: null }));
    setGeminiImages((prev) => {
      if (prev[view]) {
        URL.revokeObjectURL(prev[view] as string);
      }
      return { ...prev, [view]: null };
    });
    setPhase(null);
    setError(null);
  }, []);

  useEffect(() => {
    imageUrlsRef.current = imageUrls;
  }, [imageUrls]);

  useEffect(() => {
    geminiImageUrlsRef.current = geminiImages;
  }, [geminiImages]);

  useEffect(() => {
    return () => {
      Object.values(imageUrlsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      Object.values(geminiImageUrlsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  const clearGeminiImages = useCallback(() => {
    setGeminiImages((prev) => {
      Object.values(prev).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      return { ...initialGeminiImages };
    });
  }, []);

  const runModeling = useCallback(async () => {
    if (!imageUrls.front || !imageUrls.top || !imageUrls.side) {
      return;
    }

    setProcessing(true);
    setError(null);
    setPhase("Gemini前処理を開始...");
    clearGeminiImages();

    const processOneView = async (view: ViewKey, url: string) => {
      let geminiPreviewUrl: string | null = null;
      try {
        setPhase(`${view.toUpperCase()}: 画像をGeminiに送信中...`);
        const sourceBlob = await fetch(url).then((res) => res.blob());
        const sourceType = sourceBlob.type || "image/png";
        const sourceFile = new File([sourceBlob], `${view}.png`, { type: sourceType });
        const blueBgBlob = await requestBlueBackgroundImage(sourceFile);
        geminiPreviewUrl = URL.createObjectURL(blueBgBlob);

        setPhase(`${view.toUpperCase()}: 青背景を透明化中...`);
        const transparentBlob = await convertBlueToTransparent(blueBgBlob);
        const transparentUrl = URL.createObjectURL(transparentBlob);

        try {
          setPhase(`${view.toUpperCase()}: 輪郭を抽出中...`);
          const processed = await imageToShapeWithPreview(transparentUrl, {
            epsilonRatio,
            blurKernelSize: 5,
            morphologyKernelSize: 5,
            morphologyIterations: 1,
            keepLargestContour: true,
          });
          return { processed, geminiPreviewUrl };
        } finally {
          URL.revokeObjectURL(transparentUrl);
        }
      } catch (err) {
        if (geminiPreviewUrl) {
          URL.revokeObjectURL(geminiPreviewUrl);
        }
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`[${view}] ${message}`);
      }
    };

    try {
      const front = await processOneView("front", imageUrls.front);
      const top = await processOneView("top", imageUrls.top);
      const side = await processOneView("side", imageUrls.side);

      setShapes({
        front: front.processed.shape,
        top: top.processed.shape,
        side: side.processed.shape,
      });
      setGeminiImages({
        front: front.geminiPreviewUrl,
        top: top.geminiPreviewUrl,
        side: side.geminiPreviewUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "画像処理中に不明なエラーが発生しました。";
      setError(message);
      setShapes(initialShapes);
    } finally {
      setPhase(null);
      setProcessing(false);
    }
  }, [imageUrls.front, imageUrls.side, imageUrls.top, epsilonRatio, clearGeminiImages]);

  const resultGeometry = useMemo(() => {
    try {
      return buildIntersectionGeometry(shapes, extrusionDepth);
    } catch {
      return null;
    }
  }, [shapes, extrusionDepth]);

  useEffect(() => {
    return () => {
      resultGeometry?.dispose();
    };
  }, [resultGeometry]);

  return (
    <main className="app-root">
      <header className="app-header">
        <h1>Deterministic 3D Modeling Prototype (OEI)</h1>
        <p>OpenCV で輪郭抽出し、Three.js + CSG で 3 視点の交差体を生成します。</p>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <UploadPanel files={files} onChangeFile={onChangeFile} />
          <ParameterControls
            epsilonRatio={epsilonRatio}
            onEpsilonRatioChange={setEpsilonRatio}
          />

          <section className="panel">
            <h2>Status</h2>
            <p>OpenCV.js: {isOpenCVReady ? "Ready" : "Loading..."}</p>
            <p className="muted">
              注意: 画像は背景透過のため外部API（Gemini）へ送信されます。失敗時は処理を中断します。
            </p>
            {phase && <p>{phase}</p>}
            {openCVError && <p className="error">{openCVError}</p>}
            {error && <p className="error">{error}</p>}
            <button type="button" disabled={!canProcess || processing} onClick={runModeling}>
              {processing ? "Processing..." : "Generate 3D Mesh"}
            </button>
          </section>
          <GeminiPreviewPanel images={geminiImages} />
          <ExportPanel geometry={resultGeometry} />
        </aside>

        <section className="content">
          <Viewer3D geometry={resultGeometry} />
        </section>
      </div>
    </main>
  );
}
