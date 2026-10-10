"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Tree } from "@dgreenheck/ez-tree";
import { useThree } from "@react-three/fiber";
import { Box3, Color, DoubleSide, InstancedMesh, MeshPhongMaterial, MeshStandardMaterial, Object3D } from "three";

export interface TreePlacement {
  position: [number, number, number];
  height: number;
  rotation: number;
  variant: number;
  foliage?: boolean;
  shade: number;
}

function makeTree(preset: string) {
  const tree = new Tree();
  tree.loadPreset(preset);
  // Shared geometry keeps every plot affordable; each instance has its own
  // position, orientation, height and burn state.
  tree.options.leaves.count = preset === "Ash Small" ? 20 : 16;
  tree.options.leaves.size = preset === "Ash Small" ? 4.8 : 4.2;
  tree.options.leaves.sizeVariance = .35;
  tree.options.branch.length[0] = preset === "Ash Small" ? 18 : 20;
  if (preset === "Oak Small") {
    tree.options.branch.children[0] = 6;
    tree.options.branch.children[1] = 3;
    tree.options.branch.length[1] = 12;
    tree.options.branch.length[2] = 9;
  }
  tree.options.branch.sections = { 0: 10, 1: 5, 2: 4, 3: 2 };
  tree.options.branch.segments = { 0: 7, 1: 5, 2: 3, 3: 3 };
  tree.options.leaves.tint = 0xffffff;
  tree.generate();
  const box = new Box3().setFromObject(tree);
  const scale = 1 / (box.max.y - box.min.y);
  const branches = tree.branchesMesh.geometry;
  const leaves = tree.leavesMesh.geometry;
  [branches, leaves].forEach(geometry => {
    geometry.translate(0, -box.min.y, 0);
    geometry.scale(scale, scale, scale);
    geometry.computeBoundingSphere();
  });
  const originalBark = tree.branchesMesh.material as MeshPhongMaterial;
  const originalLeaf = tree.leavesMesh.material as MeshPhongMaterial;
  const bark = new MeshStandardMaterial({
    map: originalBark.map, normalMap: originalBark.normalMap,
    color: "#b9ae99", roughness: .96, envMapIntensity: .12,
  });
  // Use the library's leaf photographs with alpha clipping. Its wind shader
  // replaces project_vertex and omits instanceMatrix, so use standard materials.
  const foliage = new MeshStandardMaterial({
    map: originalLeaf.map, color: "#ffffff", side: DoubleSide,
    alphaTest: .5, roughness: .92, envMapIntensity: .15,
    emissive: "#485c29", emissiveIntensity: .16,
  });
  [bark.map, bark.normalMap, foliage.map].forEach(texture => { if (texture) texture.anisotropy = 8; });
  originalBark.dispose();
  originalLeaf.dispose();
  return { branches, leaves, bark, foliage };
}

function TreeSpecies({ preset, placements, variant, shadows }: {
  preset: string; placements: TreePlacement[]; variant: number; shadows: boolean;
}) {
  const model = useMemo(() => makeTree(preset), [preset]);
  const invalidate = useThree(state => state.invalidate);
  const branches = useRef<InstancedMesh>(null), leaves = useRef<InstancedMesh>(null);
  useEffect(() => {
    // The library loads embedded textures asynchronously, outside R3F's loader.
    // Render once they arrive even when the simulation is paused.
    let frame = 0;
    const start = performance.now();
    const refresh = () => {
      if ([model.bark.map, model.bark.normalMap, model.foliage.map].every(texture => texture?.image)) invalidate();
      else if (performance.now() - start < 15000) frame = requestAnimationFrame(refresh);
    };
    refresh();
    return () => cancelAnimationFrame(frame);
  }, [model, invalidate]);
  useEffect(() => () => {
    model.branches.dispose(); model.leaves.dispose();
    model.bark.dispose(); model.foliage.dispose();
  }, [model]);
  useLayoutEffect(() => {
    const dummy = new Object3D(), color = new Color();
    let count = 0;
    for (const tree of placements) {
      if (tree.variant % 2 !== variant) continue;
      dummy.position.set(...tree.position);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.set(tree.height * .68, tree.height, tree.height * .68);
      dummy.updateMatrix();
      branches.current!.setMatrixAt(count, dummy.matrix);
      branches.current!.setColorAt(count, color.set(tree.foliage === false ? "#302c26" : "#ffffff"));
      if (tree.foliage === false) { dummy.scale.setScalar(0); dummy.updateMatrix(); }
      leaves.current!.setMatrixAt(count, dummy.matrix);
      leaves.current!.setColorAt(count, color.setHSL(.19 + tree.shade * .09, .08 + tree.shade * .22, .57 + tree.shade * .39));
      count++;
    }
    [branches, leaves].forEach(ref => {
      ref.current!.count = count;
      ref.current!.instanceMatrix.needsUpdate = true;
      if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
      ref.current!.computeBoundingSphere();
    });
  }, [placements, variant]);
  return <>
    <instancedMesh ref={branches} args={[model.branches, model.bark, placements.length]} castShadow={shadows} receiveShadow raycast={() => null}/>
    <instancedMesh ref={leaves} args={[model.leaves, model.foliage, placements.length]} castShadow={shadows} receiveShadow raycast={() => null}/>
  </>;
}

export function NaturalTrees({ placements, shadows = true }: { placements: TreePlacement[]; shadows?: boolean }) {
  return <>
    <TreeSpecies preset="Oak Small" placements={placements} variant={0} shadows={shadows}/>
    <TreeSpecies preset="Ash Small" placements={placements} variant={1} shadows={shadows}/>
  </>;
}
