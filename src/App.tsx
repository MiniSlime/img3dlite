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
type BlobsByView = Record<ViewKey, Blob | null>;

const initialFiles: FilesByView = { front: null, top: null, side: null };
const initialUrls: UrlsByView = { front: null, top: null, side: null };
const initialShapes: ShapesByView = { front: null, top: null, side: null };
const initialGeminiImages: UrlsByView = { front: null, top: null, side: null };
const initialTransparentImages: UrlsByView = { front: null, top: null, side: null };
const initialGeminiBlobs: BlobsByView = { front: null, top: null, side: null };
const MIN_EXTRUSION_DEPTH = 300;
const orderedViews: ViewKey[] = ["front", "top", "side"];

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

export default function App() {
  const { isReady: isOpenCVReady, error: openCVError } = useOpenCV();

  const [files, setFiles] = useState<FilesByView>(initialFiles);
  const [imageUrls, setImageUrls] = useState<UrlsByView>(initialUrls);
  const [shapes, setShapes] = useState<ShapesByView>(initialShapes);
  const [geminiImages, setGeminiImages] = useState<UrlsByView>(initialGeminiImages);
  const [transparentImages, setTransparentImages] = useState<UrlsByView>(initialTransparentImages);
  const [geminiBlobs, setGeminiBlobs] = useState<BlobsByView>(initialGeminiBlobs);
  const [epsilonRatio, setEpsilonRatio] = useState(0.01);
  const [exactTolerance, setExactTolerance] = useState(0);
  const [nearTolerance, setNearTolerance] = useState(16);
  const [processing, setProcessing] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imageUrlsRef = useRef<UrlsByView>(initialUrls);
  const extrusionDepth = useMemo(() => computeExtrusionDepth(shapes), [shapes]);
  const geminiImageUrlsRef = useRef<UrlsByView>(initialGeminiImages);
  const transparentImageUrlsRef = useRef<UrlsByView>(initialTransparentImages);

  const canRunGemini = useMemo(() => {
    return Boolean(isOpenCVReady && imageUrls.front && imageUrls.top && imageUrls.side);
  }, [isOpenCVReady, imageUrls.front, imageUrls.top, imageUrls.side]);
  const canReprocessWithoutGemini = useMemo(() => {
    return Boolean(isOpenCVReady && geminiBlobs.front && geminiBlobs.top && geminiBlobs.side);
  }, [isOpenCVReady, geminiBlobs.front, geminiBlobs.top, geminiBlobs.side]);

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
    setTransparentImages((prev) => {
      if (prev[view]) {
        URL.revokeObjectURL(prev[view] as string);
      }
      return { ...prev, [view]: null };
    });
    setGeminiBlobs((prev) => ({ ...prev, [view]: null }));
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
    transparentImageUrlsRef.current = transparentImages;
  }, [transparentImages]);

  useEffect(() => {
    return () => {
      Object.values(imageUrlsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      Object.values(geminiImageUrlsRef.current).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      Object.values(transparentImageUrlsRef.current).forEach((url) => {
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

  const clearTransparentImages = useCallback(() => {
    setTransparentImages((prev) => {
      Object.values(prev).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
      return { ...initialTransparentImages };
    });
  }, []);

  const processFromGeminiBlobs = useCallback(
    async (cachedBlobs: BlobsByView) => {
      const nextTransparentUrls: UrlsByView = { ...initialTransparentImages };
      const nextShapes: ShapesByView = { ...initialShapes };

      try {
        for (const view of orderedViews) {
          const blueBgBlob = cachedBlobs[view];
          if (!blueBgBlob) {
            throw new Error(`[${view}] Gemini画像キャッシュがありません。`);
          }

          setPhase(`${view.toUpperCase()}: 青背景を透明化中...`);
          const transparentBlob = await convertBlueToTransparent(blueBgBlob, {
            exactTolerance,
            nearTolerance,
          });
          const transparentUrl = URL.createObjectURL(transparentBlob);
          nextTransparentUrls[view] = transparentUrl;

          setPhase(`${view.toUpperCase()}: 輪郭を抽出中...`);
          const processed = await imageToShapeWithPreview(transparentUrl, {
            epsilonRatio,
            blurKernelSize: 5,
            morphologyKernelSize: 5,
            morphologyIterations: 1,
            keepLargestContour: true,
          });
          nextShapes[view] = processed.shape;
        }
      } catch (err) {
        Object.values(nextTransparentUrls).forEach((url) => {
          if (url) URL.revokeObjectURL(url);
        });
        throw err;
      }

      clearTransparentImages();
      setTransparentImages(nextTransparentUrls);
      setShapes(nextShapes);
    },
    [clearTransparentImages, epsilonRatio, exactTolerance, nearTolerance],
  );

  const runModeling = useCallback(async () => {
    if (!imageUrls.front || !imageUrls.top || !imageUrls.side) {
      return;
    }

    setProcessing(true);
    setError(null);
    setPhase("Gemini前処理を開始...");
    clearGeminiImages();
    clearTransparentImages();
    setGeminiBlobs(initialGeminiBlobs);
    setShapes(initialShapes);

    try {
      const nextBlobs: BlobsByView = { ...initialGeminiBlobs };
      const nextGeminiUrls: UrlsByView = { ...initialGeminiImages };

      for (const view of orderedViews) {
        const sourceUrl = imageUrls[view];
        if (!sourceUrl) {
          throw new Error(`[${view}] 元画像URLがありません。`);
        }

        setPhase(`${view.toUpperCase()}: 画像をGeminiに送信中...`);
        const sourceBlob = await fetch(sourceUrl).then((res) => res.blob());
        const sourceType = sourceBlob.type || "image/png";
        const sourceFile = new File([sourceBlob], `${view}.png`, { type: sourceType });
        const blueBgBlob = await requestBlueBackgroundImage(sourceFile);
        nextBlobs[view] = blueBgBlob;
        nextGeminiUrls[view] = URL.createObjectURL(blueBgBlob);
      }

      setGeminiBlobs(nextBlobs);
      setGeminiImages(nextGeminiUrls);
      await processFromGeminiBlobs(nextBlobs);
    } catch (err) {
      const message = err instanceof Error ? err.message : "画像処理中に不明なエラーが発生しました。";
      setError(message);
      setShapes(initialShapes);
    } finally {
      setPhase(null);
      setProcessing(false);
    }
  }, [clearGeminiImages, clearTransparentImages, imageUrls, processFromGeminiBlobs]);

  const rerunFromCachedGemini = useCallback(async () => {
    if (!geminiBlobs.front || !geminiBlobs.top || !geminiBlobs.side) {
      return;
    }

    setProcessing(true);
    setError(null);
    setPhase("Gemini再呼び出しなしで再処理中...");
    setShapes(initialShapes);

    try {
      await processFromGeminiBlobs(geminiBlobs);
    } catch (err) {
      const message = err instanceof Error ? err.message : "再処理中に不明なエラーが発生しました。";
      setError(message);
      setShapes(initialShapes);
    } finally {
      setPhase(null);
      setProcessing(false);
    }
  }, [geminiBlobs, processFromGeminiBlobs]);

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
        <p>Gemini + OpenCV で輪郭抽出し、Three.js + CSG で 3 視点の交差体を生成します。</p>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <UploadPanel files={files} onChangeFile={onChangeFile} />
          <ParameterControls
            epsilonRatio={epsilonRatio}
            exactTolerance={exactTolerance}
            nearTolerance={nearTolerance}
            onEpsilonRatioChange={setEpsilonRatio}
            onExactToleranceChange={setExactTolerance}
            onNearToleranceChange={setNearTolerance}
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
            <div className="button-row">
              <button type="button" disabled={!canRunGemini || processing} onClick={runModeling}>
                {processing ? "Processing..." : "Generate via Gemini"}
              </button>
              <button
                type="button"
                disabled={!canReprocessWithoutGemini || processing}
                onClick={rerunFromCachedGemini}
              >
                {processing ? "Processing..." : "Rebuild 3D (No Gemini)"}
              </button>
            </div>
          </section>
          <GeminiPreviewPanel geminiImages={geminiImages} transparentImages={transparentImages} />
          <ExportPanel geometry={resultGeometry} />
        </aside>

        <section className="content">
          <Viewer3D geometry={resultGeometry} />
        </section>
      </div>
    </main>
  );
}
