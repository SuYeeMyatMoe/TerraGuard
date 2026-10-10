import { BufferAttribute, BufferGeometry, Color, ConeGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Sculpted, drooping evergreen boughs; shared by every forest instance. */
export function makeLayeredPine() {
  const positions: number[] = [], colors: number[] = [];
  const tint = new Color();
  type Point = [number, number, number];
  const triangle = (a: Point, b: Point, c: Point, light: number) => {
    for (const p of [a, b, c]) {
      positions.push(...p);
      // Warm tips and shaded undersides define each overlapping bough.
      tint.setRGB(light * .9, light, light * .64);
      colors.push(tint.r, tint.g, tint.b);
    }
  };
  const frond = (angle: number, y: number, radius: number, width: number, drop: number) => {
    const radial = (r: number, height: number, side = 0): Point => [
      Math.cos(angle) * r - Math.sin(angle) * side,
      height,
      Math.sin(angle) * r + Math.cos(angle) * side,
    ];
    const root = radial(.035, y), tip = radial(radius, y - drop);
    const ring = [radial(radius * .54, y + .065, 0),
      radial(radius * .56, y - .045, width),
      radial(radius * .54, y - .17, 0),
      radial(radius * .56, y - .045, -width)];
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      triangle(root, ring[next], ring[side], side === 0 || side === 3 ? .73 : .45);
      triangle(ring[side], ring[next], tip, side === 0 || side === 3 ? 1 : .57);
    }
  };
  for (let tier = 0; tier < 8; tier++) {
    const y = .82 + tier * .245;
    const radius = .72 * (1 - tier * .105);
    for (let arm = 0; arm < 8; arm++) {
      const angle = arm * Math.PI / 4 + tier * .47;
      const variation = 1 + Math.sin(arm * 7.3 + tier * 5.9) * .1;
      frond(angle, y, radius * variation, radius * .29, .39 - tier * .032);
      frond(angle + .18, y - .07, radius * .86, radius * .18, .41 - tier * .036);
    }
  }
  const branches = new BufferGeometry();
  branches.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  branches.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  branches.computeVertexNormals();
  const core = new ConeGeometry(.4, 2.45, 12, 4).toNonIndexed();
  core.translate(0, 1.53, 0);
  const corePositions = core.getAttribute("position");
  const coreColors = new Float32Array(corePositions.count * 3);
  for (let i = 0; i < corePositions.count; i++) {
    const light = .5 + Math.max(0, corePositions.getY(i) - 2) * .55;
    tint.setRGB(light * .85, light, light * .6).toArray(coreColors, i * 3);
  }
  core.setAttribute("color", new BufferAttribute(coreColors, 3));
  core.deleteAttribute("uv");
  const geometry = mergeGeometries([branches, core])!;
  branches.dispose();
  core.dispose();
  return geometry;
}
