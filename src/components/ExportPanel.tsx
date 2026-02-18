import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

type ExportPanelProps = {
  geometry: THREE.BufferGeometry | null;
};

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function ExportPanel({ geometry }: ExportPanelProps) {
  const canExport = Boolean(geometry);

  const exportGLB = () => {
    if (!geometry) return;

    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#6a8bff" }));
    const scene = new THREE.Scene();
    scene.add(mesh);

    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          downloadBlob(new Blob([result], { type: "model/gltf-binary" }), "model.glb");
        }
      },
      () => {
        // no-op
      },
      { binary: true },
    );

    mesh.material.dispose();
  };

  const exportSTL = () => {
    if (!geometry) return;

    const mesh = new THREE.Mesh(geometry);
    const exporter = new STLExporter();
    const stl = exporter.parse(mesh);
    const blob = new Blob([stl], { type: "model/stl" });
    downloadBlob(blob, "model.stl");
  };

  return (
    <section className="panel">
      <h2>Export</h2>
      <p className="muted">生成済みメッシュをエクスポートします。</p>
      <div className="button-row">
        <button type="button" disabled={!canExport} onClick={exportGLB}>
          Export .glb
        </button>
        <button type="button" disabled={!canExport} onClick={exportSTL}>
          Export .stl
        </button>
      </div>
    </section>
  );
}
