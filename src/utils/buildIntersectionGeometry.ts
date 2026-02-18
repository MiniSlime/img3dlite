import * as THREE from "three";
import { Brush, Evaluator, INTERSECTION } from "three-bvh-csg";

export type ShapesByView = {
  front: THREE.Shape | null;
  top: THREE.Shape | null;
  side: THREE.Shape | null;
};

export type GeometryBuildDebugResult = {
  geometry: THREE.BufferGeometry | null;
  error: string | null;
  logs: string[];
};

const TARGET_MAX_DIMENSION = 120;

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

function shapeStats(label: string, shape: THREE.Shape | null): string {
  if (!shape) return `${label}: missing`;
  const contour = shape
    .getPoints()
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  const holes = shape.holes.map((hole) =>
    hole.getPoints().filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)),
  );
  const contourArea = contour.length >= 3 ? Math.abs(polygonSignedArea(contour)) : 0;
  const holeArea = holes.reduce((sum, points) => {
    if (points.length < 3) return sum;
    return sum + Math.abs(polygonSignedArea(points));
  }, 0);
  return `${label}: contourPoints=${contour.length}, holes=${holes.length}, contourArea=${contourArea.toFixed(2)}, holeArea=${holeArea.toFixed(2)}`;
}

function sanitizeShape(shape: THREE.Shape): THREE.Shape | null {
  const contour = shape
    .getPoints()
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));

  if (contour.length < 3) {
    return null;
  }

  const contourArea = Math.abs(polygonSignedArea(contour));
  if (!Number.isFinite(contourArea) || contourArea < 1e-4) {
    return null;
  }

  const normalizedContour = polygonSignedArea(contour) < 0 ? contour.slice().reverse() : contour;
  const safeShape = new THREE.Shape(normalizedContour);

  shape.holes.forEach((hole) => {
    const holePoints = hole
      .getPoints()
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (holePoints.length < 3) return;

    const area = Math.abs(polygonSignedArea(holePoints));
    if (!Number.isFinite(area) || area < 1e-4) return;

    const normalizedHole = polygonSignedArea(holePoints) < 0
      ? holePoints
      : holePoints.slice().reverse();

    const holePath = new THREE.Path();
    holePath.setFromPoints(normalizedHole);
    holePath.closePath();
    safeShape.holes.push(holePath);
  });

  return safeShape;
}

function centerGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return geometry;
  const center = new THREE.Vector3();
  box.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeVertexNormals();
  return geometry;
}

function normalizeGeometrySize(geometry: THREE.BufferGeometry, targetMaxDimension: number): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return geometry;

  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDim) || maxDim <= 0) {
    return geometry;
  }

  const scale = targetMaxDimension / maxDim;
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingBox();
  return centerGeometry(geometry);
}

function createFrontGeometry(shape: THREE.Shape, depth: number): THREE.ExtrudeGeometry {
  return centerGeometry(
    new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      steps: 1,
    }),
  ) as THREE.ExtrudeGeometry;
}

function createTopGeometry(shape: THREE.Shape, depth: number): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
  });
  centerGeometry(geometry);
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createSideGeometry(shape: THREE.Shape, depth: number): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
  });
  centerGeometry(geometry);
  geometry.rotateY(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildIntersectionGeometry(
  shapes: ShapesByView,
  depth: number,
): THREE.BufferGeometry | null {
  const debug = buildIntersectionGeometryWithDebug(shapes, depth);
  if (debug.error) {
    throw new Error(debug.error);
  }
  return debug.geometry;
}

export function buildIntersectionGeometryWithDebug(
  shapes: ShapesByView,
  depth: number,
): GeometryBuildDebugResult {
  const logs: string[] = [];
  logs.push(`depth=${depth}`);
  logs.push(shapeStats("front(raw)", shapes.front));
  logs.push(shapeStats("top(raw)", shapes.top));
  logs.push(shapeStats("side(raw)", shapes.side));

  if (!shapes.front || !shapes.top || !shapes.side) {
    return { geometry: null, error: "one or more input shapes are missing", logs };
  }

  const safeFront = sanitizeShape(shapes.front);
  const safeTop = sanitizeShape(shapes.top);
  const safeSide = sanitizeShape(shapes.side);
  logs.push(shapeStats("front(safe)", safeFront));
  logs.push(shapeStats("top(safe)", safeTop));
  logs.push(shapeStats("side(safe)", safeSide));
  if (!safeFront || !safeTop || !safeSide) {
    return { geometry: null, error: "shape sanitization failed (invalid contour or too small area)", logs };
  }

  let frontGeo: THREE.ExtrudeGeometry | null = null;
  let topGeo: THREE.ExtrudeGeometry | null = null;
  let sideGeo: THREE.ExtrudeGeometry | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  let geometry: THREE.BufferGeometry | null = null;

  try {
    try {
      frontGeo = createFrontGeometry(safeFront, depth);
      logs.push(`frontGeo vertices=${frontGeo.attributes.position?.count ?? 0}`);
    } catch (err) {
      return {
        geometry: null,
        error: `front extrude failed: ${err instanceof Error ? err.message : String(err)}`,
        logs,
      };
    }

    try {
      topGeo = createTopGeometry(safeTop, depth);
      logs.push(`topGeo vertices=${topGeo.attributes.position?.count ?? 0}`);
    } catch (err) {
      return {
        geometry: null,
        error: `top extrude failed: ${err instanceof Error ? err.message : String(err)}`,
        logs,
      };
    }

    try {
      sideGeo = createSideGeometry(safeSide, depth);
      logs.push(`sideGeo vertices=${sideGeo.attributes.position?.count ?? 0}`);
    } catch (err) {
      return {
        geometry: null,
        error: `side extrude failed: ${err instanceof Error ? err.message : String(err)}`,
        logs,
      };
    }

    material = new THREE.MeshStandardMaterial({ color: "#6b8cff" });
    const evaluator = new Evaluator();
    const brushFront = new Brush(frontGeo, material);
    const brushTop = new Brush(topGeo, material);
    const brushSide = new Brush(sideGeo, material);

    brushFront.updateMatrixWorld();
    brushTop.updateMatrixWorld();
    brushSide.updateMatrixWorld();

    let result;
    try {
      result = evaluator.evaluate(brushFront, brushTop, INTERSECTION);
      logs.push(`csg step1 vertices=${result.geometry?.attributes?.position?.count ?? 0}`);
      result = evaluator.evaluate(result, brushSide, INTERSECTION);
      logs.push(`csg step2 vertices=${result.geometry?.attributes?.position?.count ?? 0}`);
    } catch (err) {
      return {
        geometry: null,
        error: `csg intersection failed: ${err instanceof Error ? err.message : String(err)}`,
        logs,
      };
    }

    geometry = result.geometry.clone();
    geometry = normalizeGeometrySize(geometry, TARGET_MAX_DIMENSION);
    geometry.computeVertexNormals();
    logs.push(`result vertices=${geometry.attributes.position?.count ?? 0}`);

    return { geometry, error: null, logs };
  } finally {
    frontGeo?.dispose();
    topGeo?.dispose();
    sideGeo?.dispose();
    material?.dispose();
  }
}
