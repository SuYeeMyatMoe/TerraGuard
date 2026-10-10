import {
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const seed = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
export function terrainHeight(x: number, z: number) {
  return (
    0.55 +
    Math.sin(x * 0.32 + z * 0.17) * 0.32 +
    Math.cos(z * 0.42 - x * 0.12) * 0.25 +
    1.4 * Math.exp(-((x + 6) ** 2 + (z + 6) ** 2) / 35) +
    0.5 * Math.exp(-((x - 6) ** 2 + (z - 4) ** 2) / 18)
  );
}
export const worldPosition = (
  x: number,
  z: number,
  offset = 0,
): [number, number, number] => [
  x - 9.5,
  terrainHeight(x - 9.5, z - 9.5) + offset,
  z - 9.5,
];
export function makePine() {
  const branches = Array.from({ length: 7 }, (_, i) => {
    const g = new ConeGeometry(0.48 * (1 - i * 0.105), 0.68 - i * 0.055, 12, 2),
      p = g.getAttribute("position"),
      colors = new Float32Array(p.count * 3),
      color = new Color();
    for (let j = 0; j < p.count; j++) {
      const jag = 0.87 + seed(j * 3 + i * 71) * 0.24;
      p.setX(j, p.getX(j) * jag);
      p.setZ(j, p.getZ(j) * jag);
      color.setRGB(
        0.6 + seed(j + i) * 0.24,
        0.68 + seed(j + i) * 0.25,
        0.55 + seed(j + i) * 0.2,
      );
      color.toArray(colors, j * 3);
    }
    g.setAttribute("color", new BufferAttribute(colors, 3));
    g.translate(0, 0.38 + i * 0.2, 0);
    g.computeVertexNormals();
    return g;
  });
  const merged = mergeGeometries(branches)!;
  branches.forEach((g) => g.dispose());
  return merged;
}
export function makeBroadleaf() {
  const lobes = Array.from({ length: 5 }, (_, i) => {
    const g = new SphereGeometry(i === 0 ? 0.37 : 0.3, 9, 7);
    g.scale(1, 1.1, 1);
    const angle = i * 1.8;
    g.translate(
      i === 0 ? 0 : Math.cos(angle) * 0.2,
      0.85 + i * 0.07,
      i === 0 ? 0 : Math.sin(angle) * 0.2,
    );
    return g;
  });
  const merged = mergeGeometries(lobes)!;
  lobes.forEach((g) => g.dispose());
  return merged;
}
export function makeTrunk() {
  const branches = [new CylinderGeometry(0.027, 0.055, 1.45, 6)];
  branches[0].translate(0, 0.725, 0);
  for (let i = 0; i < 5; i++) {
    const b = new CylinderGeometry(0.009, 0.018, 0.35, 4);
    b.rotateZ(Math.PI / 3);
    b.rotateY(i * 2.4);
    b.translate(
      Math.sin(i * 2.4) * 0.1,
      0.6 + i * 0.14,
      Math.cos(i * 2.4) * 0.1,
    );
    branches.push(b);
  }
  const merged = mergeGeometries(branches)!;
  branches.forEach((g) => g.dispose());
  return merged;
}
export function landscapeHeight(x: number, z: number) {
  const distant = Math.max(0, -z - 12);
  const base =
    terrainHeight(x, z) -
    0.08 +
    distant * (0.45 + Math.sin(x * 0.14) * 0.22) +
    Math.max(0, distant - 8) * Math.abs(Math.sin(x * 0.22 + z * 0.13)) * 0.3 +
    Math.max(0, Math.abs(x) - 16) * 0.11;
  // The contextual lake sits outside the simulated grid.
  const basin = Math.max(0, 1 - ((x - 20) / 8) ** 2 - ((z + 5) / 15) ** 2);
  return x > 10.3 ? base - basin * (base + 0.65) : base;
}
export function makeLandscape() {
  const g = new PlaneGeometry(110, 90, 120, 100);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute("position"),
    colors = new Float32Array(p.count * 3),
    color = new Color();
  for (let i = 0; i < p.count; i++) {
    const h = landscapeHeight(p.getX(i), p.getZ(i));
    p.setY(i, h);
    const noise = seed(i) * 0.09;
    color.setHSL(
      h > 7 ? 0.13 : 0.25,
      h > 7 ? 0.1 : 0.28,
      0.08 + noise + Math.min(h, 18) * 0.003,
    );
    color.toArray(colors, i * 3);
  }
  g.setAttribute("color", new BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}
