"use client";

import { useEffect, useMemo } from "react";
import { BufferAttribute, Color, PlaneGeometry } from "three";
import { landscapeHeight, makePine, seed, terrainHeight, type TreeStyle } from "./forestGeometry";

import { ForestGroundMaterial, setGroundUV } from "./NaturalForestAssets";
import { ForestBackground, type BackgroundTree } from "./ForestBackground";

export const SHARED_PLOT_POSITIONS: [number, number, number][] = [[-18, 0, -14], [0, 0, 17], [18, 0, -14]];

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

/** The original sculpted conifers, joined by terrain and two clearings. */
export function SharedLandscape({ treeStyle = "original" }: { treeStyle?: TreeStyle }) {
  const pine = useMemo(() => makePine(treeStyle), [treeStyle]);
  const geometry = useMemo(() => {
    const ground = new PlaneGeometry(230, 165, 154, 110);
    ground.rotateX(-Math.PI / 2);
    const points = ground.getAttribute("position");
    const colors = new Float32Array(points.count * 3);
    const color = new Color(), clearing = new Color("#8c8065");
    for (let index = 0; index < points.count; index++) {
      const x = points.getX(index), z = points.getZ(index), height = sharedHeight(x, z);
      points.setY(index, height);
      if (treeStyle === "natural") color.setRGB(.72 + seed(index) * .1, .92 + seed(index) * .12, .48 + seed(index) * .1);
      else color.setHSL(height > 7 ? .13 : .25, height > 7 ? .1 : .28, .08 + seed(index) * .09 + Math.min(height, 18) * .003);
      color.lerp(clearing, clearingWeight(x, z) * .65);
      color.toArray(colors, index * 3);
    }
    ground.setAttribute("color", new BufferAttribute(colors, 3));
    ground.computeVertexNormals();
    setGroundUV(ground);
    return ground;
  }, [treeStyle]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => pine.dispose(), [pine]);
  const trees = useMemo(() => {
    const color = new Color(), placed: BackgroundTree[] = [];
    for (let index = 0; index < (treeStyle !== "original" ? 3200 : 4800); index++) {
      const nearby = index < (treeStyle !== "original" ? 2400 : 3600);
      const x = (seed(index * 5) - .5) * (nearby ? 122 : 190), z = (seed(index * 11) - .5) * (nearby ? 58 : 112) - (nearby ? 0 : 8);
      if (SHARED_PLOT_POSITIONS.some(([px, , pz]) => Math.abs(x - px) < 10.2 && Math.abs(z - pz) < 10.2)) continue;
      if (clearingWeight(x, z) > .28) continue;
      const height = sharedHeight(x, z);
      if (height < .15 || height > 14) continue;
      if (treeStyle === "natural") color.setRGB(.94, 1.12 + seed(index) * .15, .60);
      else if (treeStyle === "layered") color.setHSL(.255 + seed(index * 3) * .025, .76, .07 + seed(index) * .065);
      else color.setHSL(.29, .42, .08 + seed(index) * .09);
      placed.push({ position: [x, height, z], scale: treeStyle !== "original" ? .8 + seed(index * 37) * .45 : .48 + seed(index * 37) * .8, rotation: index, tint: [color.r, color.g, color.b] });
    }
    return placed;
  }, [treeStyle]);
  return <>
    <mesh geometry={geometry} receiveShadow><ForestGroundMaterial treeStyle={treeStyle}/></mesh>
    <ForestBackground trees={trees} geometry={pine} treeStyle={treeStyle} receiveShadow/>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[52, .18, -16.25]} scale={[1, 1.8, 1]}><circleGeometry args={[12, 80]}/><meshStandardMaterial color="#2c6977" roughness={.25} metalness={.45}/></mesh>
  </>;
}
