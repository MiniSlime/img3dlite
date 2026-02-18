import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";

type Viewer3DProps = {
  geometry: THREE.BufferGeometry | null;
};

function MeshScene({ geometry }: { geometry: THREE.BufferGeometry | null }) {
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#5f81ff" metalness={0.2} roughness={0.55} />
    </mesh>
  );
}

export function Viewer3D({ geometry }: Viewer3DProps) {
  return (
    <section className="viewer">
      <Canvas camera={{ position: [220, 220, 220], fov: 45 }} shadows>
        <color attach="background" args={["#0a1020"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[120, 180, 80]} intensity={1.2} castShadow />
        <Grid args={[500, 500]} cellColor="#2c3654" sectionColor="#3f4b72" />
        <MeshScene geometry={geometry} />
        <OrbitControls makeDefault />
        <Environment preset="city" />
      </Canvas>
    </section>
  );
}
