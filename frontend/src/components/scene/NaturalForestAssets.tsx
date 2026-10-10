"use client";

import { useEffect } from "react";
import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, DoubleSide, RepeatWrapping, SRGBColorSpace, Vector3 } from "three";
import type { TreeStyle } from "./forestGeometry";

/** Photographic canopy cutouts on crossed planes preserve a full silhouette while orbiting. */
export function makeNaturalPine() {
  const positions: number[] = [], uvs: number[] = [], normals: number[] = [], colors: number[] = [];
  const normal = new Vector3();
  for (let plane = 0; plane < 3; plane++) {
    const angle = plane * Math.PI / 3;
    const corners = [[-1.1, 0, 0, 0], [1.1, 0, 1, 0], [1.1, 3.35, 1, 1], [-1.1, 3.35, 0, 1]];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const [radius, height, u, v] = corners[index];
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      positions.push(x, height, z);
      normal.set(x * .3, 1, z * .3).normalize();
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(u, v);
      colors.push(1, 1, 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function setGroundUV(geometry: BufferGeometry) {
  const positions = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
  for (let i = 0; i < positions.count; i++) uv.setXY(i, positions.getX(i) / 2.5, positions.getZ(i) / 2.5);
  uv.needsUpdate = true;
}

function NaturalFoliageMaterial() {
  const map = useTexture("/forest/natural-pine-v1.png");
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
    invalidate();
  }, [map, invalidate]);
  // The photographic cutout already contains branch shading. Avoid thousands
  // of overlapping fragments evaluating lights and shadow samples again.
  return <meshBasicMaterial map={map} color="#e6ffd1" alphaTest={.28} alphaToCoverage side={DoubleSide} vertexColors/>;
}

export function ForestFoliageMaterial({ treeStyle }: { treeStyle: TreeStyle }) {
  return treeStyle === "natural" ? <NaturalFoliageMaterial/> : <meshStandardMaterial vertexColors roughness={1} envMapIntensity={0}/>;
}

function NaturalGroundMaterial() {
  const map = useTexture("/forest/woodland-floor-v1.png");
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    map.colorSpace = SRGBColorSpace;
    map.wrapS = map.wrapT = RepeatWrapping;
    map.anisotropy = 8;
    map.needsUpdate = true;
    invalidate();
  }, [map, invalidate]);
  return <meshStandardMaterial map={map} vertexColors roughness={1} envMapIntensity={0}/>;
}

export function ForestGroundMaterial({ treeStyle }: { treeStyle: TreeStyle }) {
  return treeStyle === "natural" ? <NaturalGroundMaterial/> : <meshStandardMaterial vertexColors roughness={1} envMapIntensity={0}/>;
}
