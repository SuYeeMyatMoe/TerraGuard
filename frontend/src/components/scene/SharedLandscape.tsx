"use client";

import { useEffect, useMemo } from "react";
import { BufferAttribute, Color, PlaneGeometry } from "three";
import { landscapeHeight, seed, terrainHeight } from "./forestGeometry";

import { NaturalTrees, type TreePlacement } from "./NaturalTrees";

export const SHARED_PLOT_POSITIONS: [number, number, number][] = [[-29, 0, -3], [0, 0, 5], [29, 0, -3]];

function clearingWeight(x: number, z: number) {
  const distance = Math.min(...[-14.5, 14.5].map(center => Math.abs(x - center - Math.sin(z * .18) * 1.2)));
  return Math.max(0, 1 - distance / 3.6) * Math.max(0, 1 - Math.max(0, Math.abs(z) - 12) / 9);
}

function sharedHeight(x: number, z: number) {
  const background = landscapeHeight(x / 2.6, (z + 10) / 1.25);
  let nearest = Infinity;
  let height = background;
  for (const [px, , pz] of SHARED_PLOT_POSITIONS) {
    const dx = x - px, dz = z - pz;
    const gap = Math.max(Math.abs(dx) - 10, Math.abs(dz) - 10, 0);
    if (gap >= nearest) continue;
    nearest = gap;
    const blend = Math.min(1, gap / 5);
    const smooth = blend * blend * (3 - 2 * blend);
    height = (terrainHeight(Math.max(-10, Math.min(10, dx)), Math.max(-10, Math.min(10, dz))) - .035) * (1 - smooth) + background * smooth;
  }
  return height;
}

/** Shared natural forest, joined by terrain and two clearings. */
export function SharedLandscape() {
  const geometry = useMemo(() => {
    const ground = new PlaneGeometry(230, 165, 115, 83);
    ground.rotateX(-Math.PI / 2);
    const points = ground.getAttribute("position");
    const colors = new Float32Array(points.count * 3);
    const color = new Color(), clearing = new Color("#8c8065");
    for (let index = 0; index < points.count; index++) {
      const x = points.getX(index), z = points.getZ(index), height = sharedHeight(x, z);
      points.setY(index, height);
      if (height < 5) color.set("#536843").lerp(clearing, clearingWeight(x, z) * .65).multiplyScalar(.78 + seed(index) * .24);
      else color.setHSL(.13, .1, .08 + seed(index) * .09 + Math.min(height, 18) * .003);
      color.toArray(colors, index * 3);
    }
    ground.setAttribute("color", new BufferAttribute(colors, 3));
    ground.computeVertexNormals();
    return ground;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const placements = useMemo(() => {
    const trees: TreePlacement[] = [];
    for (let index = 0; index < 2200; index++) {
      const nearby = index < 1500;
      const x = (seed(index * 5) - .5) * (nearby ? 122 : 190), z = (seed(index * 11) - .5) * (nearby ? 58 : 112) - (nearby ? 0 : 8);
      if (SHARED_PLOT_POSITIONS.some(([px, , pz]) => Math.abs(x - px) < 10.6 && Math.abs(z - pz) < 10.6)) continue;
      if (clearingWeight(x, z) > .28) continue;
      const height = sharedHeight(x, z);
      if (height < .15 || height > 14) continue;
      trees.push({ position: [x, height, z], height: 2.8 + seed(index * 37) * 2.3, rotation: index, variant: index % 2, shade: seed(index) });
    }
    return trees;
  }, []);
  return <>
    <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={1} envMapIntensity={0}/></mesh>
    <NaturalTrees placements={placements} shadows={false} background/>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[52, .18, -16.25]} scale={[1, 1.8, 1]}><circleGeometry args={[12, 80]}/><meshStandardMaterial color="#2c6977" roughness={.25} metalness={.45}/></mesh>
  </>;
}
