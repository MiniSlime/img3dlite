# Project Definition: Web-based Deterministic 3D Modeling App (OEI Approach)

## 1. Project Overview

This project aims to build a client-side web application that generates a 3D mesh from three orthographic 2D images (Front, Top, Side views) using a deterministic "Visual Hull" approach.

**Strict Constraint:** Do NOT use Generative AI models (like TripoSR or Meshy). Use geometric algorithms (Extrusion + Boolean Intersection) only.

## 2. Technology Stack

- Framework: React (Vite) + TypeScript
- 3D Engine: Three.js / React Three Fiber (R3F)
- Image Processing: OpenCV.js (Wasm version)
- CSG Kernel: three-bvh-csg (Critical for performance)
- State Management: Zustand (optional, but recommended for storing image data)
- Styling: Tailwind CSS

## 3. Core Algorithm: Orthographic Extrusion Intersection (OEI)

The application relies on the intersection of three extruded volumes to define the 3D shape.

### 3.1 Coordinate System Mapping

Assume a standard Right-Handed Coordinate System (Y-up).

- Front View Image: Represents the XY plane.
  - Extrusion Direction: Z-axis (Depth).
- Top View Image: Represents the XZ plane.
  - Image X-axis maps to 3D X-axis.
  - Image Y-axis maps to 3D Z-axis (Depth).
  - Extrusion Direction: Y-axis (Height).
- Side View Image: Represents the ZY plane.
  - Image X-axis maps to 3D Z-axis.
  - Image Y-axis maps to 3D Y-axis.
  - Extrusion Direction: X-axis (Width).

### 3.2 Processing Pipeline

- Image Input: User uploads 3 images.
- Preprocessing (OpenCV.js):
  - Grayscale conversion.
  - Binarization (Thresholding).
  - Contour Extraction (cv.findContours).
  - Polygon Approximation (cv.approxPolyDP) to reduce vertex count.
- Shape Generation (Three.js):
  - Convert OpenCV points to THREE.Shape.
  - Create THREE.ExtrudeGeometry for each view with depth set to a value larger than the object's bounding box.
- Alignment & Orientation:
  - Rotate and Position meshes so they intersect at the world origin (0,0,0).
  - Crucial: Center the geometries based on their bounding boxes before intersection.
- Boolean Intersection (CSG):
  - Compute: Result = FrontMesh ∩ TopMesh ∩ SideMesh.
  - Use three-bvh-csg's Evaluator for this operation.

## 4. Functional Requirements

### 4.1 UI Components

- UploadPanel: Three dropzones labeled "Front", "Top", "Side".
- ParameterControls: Sliders for:
  - Threshold (0-255): To adjust sensitivity of contour detection.
  - Smoothness (Epsilon for approxPolyDP): To control polygon detail.
- Viewer: A R3F Canvas showing the resulting mesh with OrbitControls.
- ExportButton: Download the result as a .glb or .stl file.

### 4.2 Image Processing Logic (Detailed)

- Must handle cv.Mat memory management (explicit delete() calls) to prevent memory leaks in WASM.
- Invert binary mask if necessary (ensure the object is white, background is black).
- Handle multiple contours: If an image has multiple detached parts, create a shape with holes or a THREE.Group of shapes.

### 4.3 3D Logic (Detailed)

- Front Geometry: Create Shape from XY points -> Extrude -> No Rotation.
- Top Geometry: Create Shape from XZ points -> Extrude -> Rotate X by 90 degrees.
- Side Geometry: Create Shape from ZY points -> Extrude -> Rotate Y by 90 degrees.

**Intersection:**

```typescript
import { Evaluator, Brush, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
const evaluator = new Evaluator();
const brushFront = new Brush(frontGeo, material);
const brushTop = new Brush(topGeo, material);
const brushSide = new Brush(sideGeo, material);
// Update matrices for correct world position
brushFront.updateMatrixWorld();
brushTop.updateMatrixWorld();
brushSide.updateMatrixWorld();
// Perform Intersection
let result = evaluator.evaluate(brushFront, brushTop, INTERSECTION);
result = evaluator.evaluate(result, brushSide, INTERSECTION);
```

## 5. Implementation Steps for the Agent

- Setup: Initialize React project with R3F and install opencv-ts (or load opencv.js via script tag).
- OpenCV Hook: Create a useOpenCV hook to ensure WASM is loaded before processing.
- Processor Utility: Implement imageToShape(imageUrl, threshold) function that returns a THREE.Shape.
- Scene Assembly: Create a React component that takes the 3 shapes, creates ExtrudeGeometries, aligns them, and runs the CSG operation.
- Optimization: Use useMemo heavily to avoid re-running CSG operations on every render. Only re-calc when parameters change.

## 6. Known Pitfalls & Solutions

- Alignment: Images might not be perfectly centered. Implement a logic to center the bounding box of each shape at (0,0) before extrusion.
- Performance: CSG is expensive. Show a "Processing..." loader while the operation runs (potentially wrap in a Web Worker if UI freezes).
- Texture: For V1, just use a standard material (e.g., MeshStandardMaterial with a color). Texture mapping from 3 views is out of scope for the MVP.