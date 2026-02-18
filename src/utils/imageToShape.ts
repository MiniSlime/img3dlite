import * as THREE from "three";

type OpenCVLike = {
  imread: (input: HTMLCanvasElement) => any;
  matFromArray: (rows: number, cols: number, type: number, data: number[]) => any;
  cvtColor: (src: any, dst: any, code: number, dstCn?: number) => void;
  GaussianBlur: (src: any, dst: any, ksize: any, sigmaX: number, sigmaY?: number, borderType?: number) => void;
  threshold: (src: any, dst: any, thresh: number, maxval: number, type: number) => void;
  bitwise_not: (src: any, dst: any) => void;
  countNonZero: (src: any) => number;
  contourArea: (contour: any, oriented?: boolean) => number;
  arcLength: (curve: any, closed: boolean) => number;
  approxPolyDP: (curve: any, approxCurve: any, epsilon: number, closed: boolean) => void;
  findContours: (
    image: any,
    contours: any,
    hierarchy: any,
    mode: number,
    method: number,
    offset?: any,
  ) => void;
  getStructuringElement: (shape: number, ksize: any, anchor?: any) => any;
  morphologyEx: (src: any, dst: any, op: number, kernel: any, anchor?: any, iterations?: number) => void;
  Mat: new () => any;
  MatVector: new () => any;
  Size: new (width: number, height: number) => any;
  Point: new (x: number, y: number) => any;
  RETR_CCOMP: number;
  CHAIN_APPROX_SIMPLE: number;
  CV_8UC1: number;
  COLOR_RGBA2GRAY: number;
  THRESH_BINARY: number;
  THRESH_OTSU: number;
  MORPH_ELLIPSE: number;
  MORPH_OPEN: number;
  MORPH_CLOSE: number;
  CV_32SC2: number;
};

export type ImageToShapeOptions = {
  threshold?: number;
  epsilonRatio?: number;
  minAreaRatio?: number;
  autoInvert?: boolean;
  useOtsuThreshold?: boolean;
  blurKernelSize?: number;
  morphologyKernelSize?: number;
  morphologyIterations?: number;
  keepLargestContour?: boolean;
};

export type ImageToShapeWithPreviewResult = {
  shape: THREE.Shape;
  shapes: THREE.Shape[];
  cutoutDataUrl: string;
};

const DEFAULT_OPTIONS: Required<ImageToShapeOptions> = {
  threshold: 127,
  epsilonRatio: 0.01,
  minAreaRatio: 0.0005,
  autoInvert: true,
  useOtsuThreshold: true,
  blurKernelSize: 5,
  morphologyKernelSize: 5,
  morphologyIterations: 1,
  keepLargestContour: true,
};

function getCV(): OpenCVLike {
  const globalWithCv = globalThis as typeof globalThis & { cv?: OpenCVLike };
  if (!globalWithCv.cv) {
    throw new Error("OpenCV.js is not loaded. Make sure `cv` is available on global scope.");
  }
  return globalWithCv.cv;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!url.startsWith("blob:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}

function ensureClosedPoints(points: THREE.Vector2[]): THREE.Vector2[] {
  if (points.length < 3) {
    return points;
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (first.x === last.x && first.y === last.y) {
    return points;
  }
  return [...points, first.clone()];
}

function buildPath(points: THREE.Vector2[]): THREE.Path {
  const closed = ensureClosedPoints(points);
  const path = new THREE.Path();
  path.setFromPoints(closed);
  path.closePath();
  return path;
}

function normalizeWinding(points: THREE.Vector2[], clockwise: boolean): THREE.Vector2[] {
  if (!points || points.length < 3) {
    return points ?? [];
  }
  const isClockWise = polygonSignedArea(points) < 0;
  if (isClockWise === clockwise) {
    return points;
  }
  return [...points].reverse();
}

function isSamePoint(a: THREE.Vector2, b: THREE.Vector2): boolean {
  return a.x === b.x && a.y === b.y;
}

function sanitizePolygonPoints(points: THREE.Vector2[]): THREE.Vector2[] {
  const finite = points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (finite.length < 3) {
    return [];
  }

  const deduped: THREE.Vector2[] = [];
  for (let i = 0; i < finite.length; i += 1) {
    if (deduped.length === 0 || !isSamePoint(deduped[deduped.length - 1], finite[i])) {
      deduped.push(finite[i]);
    }
  }

  if (deduped.length >= 2 && isSamePoint(deduped[0], deduped[deduped.length - 1])) {
    deduped.pop();
  }

  if (deduped.length < 3) {
    return [];
  }

  const area = Math.abs(polygonSignedArea(deduped));
  if (!Number.isFinite(area) || area < 1e-4) {
    return [];
  }

  return deduped;
}

function polygonSignedArea(points: THREE.Vector2[]): number {
  if (!points || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    if (!p || !q || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(q.x) || !Number.isFinite(q.y)) {
      continue;
    }
    area += p.x * q.y - q.x * p.y;
  }
  return area * 0.5;
}

function contourMatToPoints(
  contourMat: any,
  imageWidth: number,
  imageHeight: number,
): THREE.Vector2[] {
  const flat = contourMat?.data32S as ArrayLike<number> | undefined;
  if (!flat || flat.length < 2) {
    return [];
  }
  const points: THREE.Vector2[] = [];

  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i];
    const y = flat[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    // Convert image coordinates (top-left origin) into centered, Y-up coordinates.
    const centeredX = x - imageWidth / 2;
    const centeredY = imageHeight / 2 - y;
    points.push(new THREE.Vector2(centeredX, centeredY));
  }

  return points;
}

function hasTransparentPixels(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < imageData.length; i += 4) {
    if (imageData[i] < 250) return true;
  }
  return false;
}

function createBinaryFromAlpha(canvas: HTMLCanvasElement, alphaThreshold = 8): any {
  const cv = getCV();
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context for alpha extraction.");
  }
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const mask = new Array<number>(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const a = data[i * 4 + 3];
    mask[i] = a > alphaThreshold ? 255 : 0;
  }
  return cv.matFromArray(height, width, cv.CV_8UC1, mask);
}

async function toBinarizedMat(
  imageUrl: string,
  options: Required<ImageToShapeOptions>,
): Promise<{ binary: any; width: number; height: number; sourceCanvas: HTMLCanvasElement }> {
  const cv = getCV();
  const image = await loadImage(imageUrl);

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D context from canvas.");
  }
  ctx.drawImage(image, 0, 0);

  let src: any = null;
  let gray: any = null;
  let binary: any = null;
  let kernel: any = null;
  let morphAnchor: any = null;

  try {
    src = cv.imread(canvas);
    gray = new cv.Mat();
    if (hasTransparentPixels(canvas)) {
      binary = createBinaryFromAlpha(canvas);
    } else {
      binary = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      if (options.blurKernelSize >= 3) {
        const blurKernel = new cv.Size(options.blurKernelSize, options.blurKernelSize);
        cv.GaussianBlur(gray, gray, blurKernel, 0, 0);
      }
      if (options.useOtsuThreshold) {
        cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      } else {
        cv.threshold(gray, binary, options.threshold, 255, cv.THRESH_BINARY);
      }
      if (options.autoInvert) {
        const whitePixels = cv.countNonZero(binary);
        const totalPixels = binary.rows * binary.cols;
        if (whitePixels > totalPixels * 0.5) {
          cv.bitwise_not(binary, binary);
        }
      }
    }

    if (options.morphologyKernelSize >= 3 && options.morphologyIterations > 0) {
      const morphKernel = new cv.Size(options.morphologyKernelSize, options.morphologyKernelSize);
      morphAnchor = new cv.Point(-1, -1);
      kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, morphKernel, morphAnchor);
      cv.morphologyEx(binary, binary, cv.MORPH_OPEN, kernel, morphAnchor, options.morphologyIterations);
      cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel, morphAnchor, options.morphologyIterations);
    }

    return { binary, width: canvas.width, height: canvas.height, sourceCanvas: canvas };
  } finally {
    if (src) src.delete();
    if (gray) gray.delete();
    if (kernel) kernel.delete();
    if (morphAnchor && typeof morphAnchor.delete === "function") {
      morphAnchor.delete();
    }
  }
}

function drawShapePath(ctx: CanvasRenderingContext2D, shape: THREE.Shape, width: number, height: number) {
  const contour = shape
    .getPoints()
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (contour.length > 0) {
    ctx.moveTo(contour[0].x + width / 2, height / 2 - contour[0].y);
    for (let i = 1; i < contour.length; i += 1) {
      ctx.lineTo(contour[i].x + width / 2, height / 2 - contour[i].y);
    }
    ctx.closePath();
  }

  shape.holes.forEach((holePath) => {
    const hole = holePath
      .getPoints()
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (hole.length === 0) return;
    ctx.moveTo(hole[0].x + width / 2, height / 2 - hole[0].y);
    for (let i = 1; i < hole.length; i += 1) {
      ctx.lineTo(hole[i].x + width / 2, height / 2 - hole[i].y);
    }
    ctx.closePath();
  });
}

function createCutoutDataUrl(sourceCanvas: HTMLCanvasElement, maskShapes: THREE.Shape[]): string {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) {
    throw new Error("Failed to get output canvas context.");
  }
  outputCtx.clearRect(0, 0, width, height);
  outputCtx.save();
  outputCtx.beginPath();
  maskShapes.forEach((shape) => {
    drawShapePath(outputCtx, shape, width, height);
  });
  outputCtx.clip("evenodd");
  outputCtx.drawImage(sourceCanvas, 0, 0);
  outputCtx.restore();
  return outputCanvas.toDataURL("image/png");
}

function createCutoutDataUrlFromBinary(sourceCanvas: HTMLCanvasElement, binary: any): string {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) {
    throw new Error("Failed to get source canvas context.");
  }

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) {
    throw new Error("Failed to get output canvas context.");
  }

  const source = sourceCtx.getImageData(0, 0, width, height);
  const output = outputCtx.createImageData(width, height);
  const mask = binary?.data as Uint8Array | undefined;
  if (!mask || mask.length !== width * height) {
    return sourceCanvas.toDataURL("image/png");
  }

  for (let i = 0; i < mask.length; i += 1) {
    const px = i * 4;
    const keep = mask[i] > 0;
    output.data[px] = source.data[px];
    output.data[px + 1] = source.data[px + 1];
    output.data[px + 2] = source.data[px + 2];
    output.data[px + 3] = keep ? 255 : 0;
  }

  outputCtx.putImageData(output, 0, 0);
  return outputCanvas.toDataURL("image/png");
}

function extractShapesFromBinaryMat(
  binary: any,
  width: number,
  height: number,
  options: Required<ImageToShapeOptions>,
): THREE.Shape[] {
  const cv = getCV();
  const candidates: Array<{ shape: THREE.Shape; area: number }> = [];
  const minArea = width * height * options.minAreaRatio;
  let contours: any = null;
  let hierarchy: any = null;

  const getHierarchyValue = (index: number, slot: number): number => {
    if (!Number.isInteger(index) || index < 0 || index >= contours.size()) {
      return -1;
    }
    const ptr = hierarchy.intPtr(0, index);
    if (!ptr || ptr.length < 4) {
      return -1;
    }
    const value = ptr[slot];
    if (!Number.isFinite(value)) {
      return -1;
    }
    return value;
  };

  try {
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(binary, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

    if (!hierarchy || hierarchy.rows === 0 || contours.size() === 0) {
      return [];
    }

    for (let i = 0; i < contours.size(); i += 1) {
      const parent = getHierarchyValue(i, 3);
      if (parent !== -1) {
        continue;
      }
      const contour = contours.get(i);
      if (!contour) {
        continue;
      }
      const area = Math.abs(cv.contourArea(contour, false));
      if (area < minArea) {
        contour.delete();
        continue;
      }

      const approxOuter = new cv.Mat();
      cv.approxPolyDP(contour, approxOuter, options.epsilonRatio * cv.arcLength(contour, true), true);

      const outerPointsRaw = contourMatToPoints(approxOuter, width, height);
      const outerPoints = sanitizePolygonPoints(normalizeWinding(outerPointsRaw, false));

      if (outerPoints.length >= 3) {
        const shape = new THREE.Shape(ensureClosedPoints(outerPoints));
        let child = getHierarchyValue(i, 2);

        while (child !== -1 && child < contours.size()) {
          const holeContour = contours.get(child);
          if (!holeContour) {
            child = -1;
            break;
          }
          const holeArea = Math.abs(cv.contourArea(holeContour, false));
          if (holeArea >= minArea) {
            const approxHole = new cv.Mat();
            cv.approxPolyDP(
              holeContour,
              approxHole,
              options.epsilonRatio * cv.arcLength(holeContour, true),
              true,
            );

            const holePointsRaw = contourMatToPoints(approxHole, width, height);
            const holePoints = sanitizePolygonPoints(normalizeWinding(holePointsRaw, true));
            if (holePoints.length >= 3) {
              shape.holes.push(buildPath(holePoints));
            }
            approxHole.delete();
          }

          const nextSibling = getHierarchyValue(child, 0);
          holeContour.delete();
          child = nextSibling;
        }

        candidates.push({ shape, area });
      }

      approxOuter.delete();
      contour.delete();
    }

    if (candidates.length === 0) {
      return [];
    }

    if (options.keepLargestContour) {
      candidates.sort((a, b) => b.area - a.area);
      return [candidates[0].shape];
    }

    return candidates.map((entry) => entry.shape);
  } finally {
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
}

export async function imageToShapes(
  imageUrl: string,
  options: ImageToShapeOptions = {},
): Promise<THREE.Shape[]> {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  const { binary, width, height } = await toBinarizedMat(imageUrl, merged);

  try {
    return extractShapesFromBinaryMat(binary, width, height, merged);
  } finally {
    if (binary) binary.delete();
  }
}

export async function imageToShapeWithPreview(
  imageUrl: string,
  options: ImageToShapeOptions = {},
): Promise<ImageToShapeWithPreviewResult> {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  let binaryPack: { binary: any; width: number; height: number; sourceCanvas: HTMLCanvasElement };
  try {
    binaryPack = await toBinarizedMat(imageUrl, merged);
  } catch (err) {
    throw new Error(`toBinarizedMat failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const { binary, width, height, sourceCanvas } = binaryPack;

  try {
    let shapes: THREE.Shape[];
    try {
      shapes = extractShapesFromBinaryMat(binary, width, height, merged);
    } catch (err) {
      throw new Error(`extractShapesFromBinaryMat failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (shapes.length === 0) {
      throw new Error("No valid contour found in the image.");
    }

    let shape = shapes[0];
    if (shapes.length > 1) {
      const cv = getCV();
      const areaOf = (candidate: THREE.Shape): number => {
        const points = candidate.getPoints();
        if (points.length < 3) return 0;
        const mat = cv.matFromArray(
          points.length,
          1,
          cv.CV_32SC2,
          points.flatMap((p) => [Math.round(p.x), Math.round(p.y)]),
        );
        const area = Math.abs(cv.contourArea(mat, false));
        mat.delete();
        return area;
      };

      let bestArea = areaOf(shape);
      for (let i = 1; i < shapes.length; i += 1) {
        const area = areaOf(shapes[i]);
        if (area > bestArea) {
          shape = shapes[i];
          bestArea = area;
        }
      }
    }

    // Use binary-based preview to make threshold/mask parameter changes visible.
    let cutoutDataUrl: string;
    try {
      cutoutDataUrl = createCutoutDataUrlFromBinary(sourceCanvas, binary);
    } catch {
      cutoutDataUrl = createCutoutDataUrl(sourceCanvas, merged.keepLargestContour ? [shape] : shapes);
    }

    return { shape, shapes, cutoutDataUrl };
  } finally {
    if (binary) binary.delete();
  }
}

export async function imageToShape(
  imageUrl: string,
  options: ImageToShapeOptions = {},
): Promise<THREE.Shape> {
  const cv = getCV();
  const shapes = await imageToShapes(imageUrl, options);

  if (shapes.length === 0) {
    throw new Error("No valid contour found in the image.");
  }

  if (shapes.length === 1) {
    return shapes[0];
  }

  // Fall back to the largest contour when multiple detached parts exist.
  const areaOf = (shape: THREE.Shape): number => {
    const points = shape.getPoints();
    if (points.length < 3) return 0;
    const mat = cv.matFromArray(
      points.length,
      1,
      cv.CV_32SC2,
      points.flatMap((p) => [Math.round(p.x), Math.round(p.y)]),
    );
    const area = Math.abs(cv.contourArea(mat, false));
    mat.delete();
    return area;
  };

  let best = shapes[0];
  let bestArea = areaOf(best);
  for (let i = 1; i < shapes.length; i += 1) {
    const currentArea = areaOf(shapes[i]);
    if (currentArea > bestArea) {
      best = shapes[i];
      bestArea = currentArea;
    }
  }

  return best;
}

