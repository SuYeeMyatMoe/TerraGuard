import type { FeatureCollection } from "geojson";

export type Position = [number, number];
export type Bounds = [number, number, number, number];
export const STUDY_BOUNDS: Bounds = [95, -4.5, 119.5, 7.5];
const R = 6371.0088;
const radians = (v: number) => (v * Math.PI) / 180;
const degrees = (v: number) => (v * 180) / Math.PI;

/** Expand and quantize outward so small pans share the same cached imagery. */
export function coverViewport(raw: Bounds): Bounds | null {
  if (!raw.every(Number.isFinite) || raw[0] >= raw[2] || raw[1] >= raw[3])
    return null;
  const b: Bounds = [
    Math.max(raw[0], STUDY_BOUNDS[0]),
    Math.max(raw[1], STUDY_BOUNDS[1]),
    Math.min(raw[2], STUDY_BOUNDS[2]),
    Math.min(raw[3], STUDY_BOUNDS[3]),
  ];
  if (b[0] >= b[2] || b[1] >= b[3]) return null;
  const dx = (b[2] - b[0]) / 4,
    dy = (b[3] - b[1]) / 4;
  const step = Math.max(0.001, 10 ** Math.floor(Math.log10(Math.max(dx, dy))));
  return [
    Math.max(STUDY_BOUNDS[0], Math.floor((b[0] - dx) / step) * step),
    Math.max(STUDY_BOUNDS[1], Math.floor((b[1] - dy) / step) * step),
    Math.min(STUDY_BOUNDS[2], Math.ceil((b[2] + dx) / step) * step),
    Math.min(STUDY_BOUNDS[3], Math.ceil((b[3] + dy) / step) * step),
  ].map((v) => Number(v.toFixed(6))) as Bounds;
}
export function nextCoverage(
  current: Bounds | null,
  raw: Bounds,
): Bounds | null {
  const target = coverViewport(raw);
  if (!target) return null;
  if (
    current &&
    current[0] <= raw[0] &&
    current[1] <= raw[1] &&
    current[2] >= raw[2] &&
    current[3] >= raw[3] &&
    current[2] - current[0] <= (target[2] - target[0]) * 4 &&
    current[3] - current[1] <= (target[3] - target[1]) * 4
  )
    return current;
  return target;
}
export function distanceKm(points: Position[]) {
  return points.slice(1).reduce((total, p, i) => {
    const a = points[i],
      dlat = radians(p[1] - a[1]),
      dlon = radians(p[0] - a[0]);
    const h =
      Math.sin(dlat / 2) ** 2 +
      Math.cos(radians(a[1])) *
        Math.cos(radians(p[1])) *
        Math.sin(dlon / 2) ** 2;
    return total + 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
  }, 0);
}
export function areaKm2(points: Position[]) {
  if (points.length < 3) return 0;
  const sum = points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length];
    const delta = ((b[0] - a[0] + 540) % 360) - 180;
    return (
      sum +
      radians(delta) * (2 + Math.sin(radians(a[1])) + Math.sin(radians(b[1])))
    );
  }, 0);
  return (Math.abs(sum) * R * R) / 2;
}
export function polygonError(points: Position[]): string | null {
  if (points.length < 3) return "Add at least three points.";
  if (
    points.some(
      (p) =>
        !p.every(Number.isFinite) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 90,
    )
  )
    return "Invalid coordinates.";
  const cross = (a: Position, b: Position, c: Position) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const on = (a: Position, b: Position, p: Position) =>
    Math.abs(cross(a, b, p)) < 1e-12 &&
    p[0] >= Math.min(a[0], b[0]) &&
    p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) &&
    p[1] <= Math.max(a[1], b[1]);
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (a[0] === b[0] && a[1] === b[1]) return "Remove duplicate points.";
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j],
        d = points[(j + 1) % points.length];
      if (
        (cross(a, b, c) * cross(a, b, d) < 0 &&
          cross(c, d, a) * cross(c, d, b) < 0) ||
        on(a, b, c) ||
        on(a, b, d) ||
        on(c, d, a) ||
        on(c, d, b)
      )
        return "Edges cross. Draw a simple boundary.";
    }
  }
  return areaKm2(points) < 1e-8 ? "Draw a boundary with a nonzero area." : null;
}
export function analysisCircle(
  center: Position,
  radiusM: number,
): FeatureCollection {
  const lat = radians(center[1]),
    lon = radians(center[0]),
    d = radiusM / (R * 1000);
  const ring: Position[] = Array.from({ length: 64 }, (_, i) => {
    const bearing = (2 * Math.PI * i) / 64;
    const y = Math.asin(
      Math.sin(lat) * Math.cos(d) +
        Math.cos(lat) * Math.sin(d) * Math.cos(bearing),
    );
    const x =
      lon +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(lat),
        Math.cos(d) - Math.sin(lat) * Math.sin(y),
      );
    return [degrees(x), degrees(y)];
  });
  ring.push(ring[0]);
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [ring] },
      },
      {
        type: "Feature",
        properties: { label: "1 km analysis radius" },
        geometry: { type: "Point", coordinates: center },
      },
    ],
  };
}
