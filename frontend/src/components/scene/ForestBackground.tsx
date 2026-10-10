import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { Color, InstancedMesh, Object3D, type BufferGeometry } from "three";
import type { TreeStyle } from "./forestGeometry";
import { ForestFoliageMaterial } from "./NaturalForestAssets";

export interface BackgroundTree {
  position: [number, number, number];
  scale: number;
  rotation: number;
  tint: [number, number, number];
}

function TreeTile({ trees, geometry, treeStyle, receiveShadow }: { trees: BackgroundTree[]; geometry: BufferGeometry; treeStyle: TreeStyle; receiveShadow: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const dummy = new Object3D(), color = new Color();
    trees.forEach((tree, index) => {
      dummy.position.set(...tree.position);
      dummy.rotation.y = tree.rotation;
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
      mesh.current!.setColorAt(index, color.setRGB(...tree.tint));
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    mesh.current!.instanceColor!.needsUpdate = true;
    mesh.current!.computeBoundingSphere();
  }, [trees]);
  return <instancedMesh ref={mesh} args={[geometry, undefined, trees.length]} raycast={() => null} receiveShadow={receiveShadow}>
    <ForestFoliageMaterial treeStyle={treeStyle}/>
  </instancedMesh>;
}

/** Small spatial batches let Three skip trees outside the camera without removing them. */
export const ForestBackground = memo(function ForestBackground({ trees, geometry, treeStyle, receiveShadow = false }: { trees: BackgroundTree[]; geometry: BufferGeometry; treeStyle: TreeStyle; receiveShadow?: boolean }) {
  const tiles = useMemo(() => {
    const groups = new Map<string, BackgroundTree[]>();
    for (const tree of trees) {
      const key = `${Math.floor(tree.position[0] / 12)}:${Math.floor(tree.position[2] / 12)}`;
      const group = groups.get(key) ?? [];
      group.push(tree);
      groups.set(key, group);
    }
    return [...groups];
  }, [trees]);
  return <>{tiles.map(([key, trees]) => <TreeTile key={key} trees={trees} geometry={geometry} treeStyle={treeStyle} receiveShadow={receiveShadow}/>)}</>;
});
