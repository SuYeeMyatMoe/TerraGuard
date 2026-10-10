import { useLayoutEffect, useMemo, useRef } from "react";
import { Line } from "@react-three/drei";
import { DoubleSide, InstancedMesh, Object3D } from "three";
import type { ForestCell } from "@/lib/forestFrame";
import { worldPosition } from "./forestGeometry";

export function HabitatOverlay({ cells, segments }: { cells: ForestCell[]; segments: [number, number, number][][] }) {
  const patches = useRef<InstancedMesh>(null);
  const edges = useMemo(() => segments.flat(), [segments]);
  useLayoutEffect(() => {
    const mesh = patches.current!;
    const dummy = new Object3D();
    dummy.rotation.x = -Math.PI / 2;
    let count = 0;
    for (const cell of cells) {
      if (!cell.protected) continue;
      dummy.position.set(...worldPosition(cell.x, cell.z, .06));
      dummy.updateMatrix();
      mesh.setMatrixAt(count++, dummy.matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells]);
  return <>
    {edges.length > 0 && <Line segments points={edges} color="#c9e676" lineWidth={1.5} transparent opacity={.85}/>}
    <instancedMesh ref={patches} args={[undefined, undefined, 400]} raycast={() => null}>
      <planeGeometry args={[1, 1]}/>
      <meshBasicMaterial color="#8da432" transparent opacity={.12} depthWrite={false} side={DoubleSide}/>
    </instancedMesh>
  </>;
}
