// World layout for the 3D diorama. Units: 1 = one simulation cell.
export const GRID = 20;
export const HALF = (GRID - 1) / 2;

// Plot centres (x, z). Arranged in a shallow arc around the ranger station, like zones in a yard.
export const PLOT_POS: [number, number][] = [
  [-25, 2],
  [0, -9],
  [25, 2],
];
export const STATION_POS: [number, number] = [0, 17];

export const STATE = { EMPTY: 0, HEALTHY: 1, BURNING: 2, BURNED: 3, INTERVENED: 4 } as const;

export function decode(s: string | undefined, n = GRID * GRID): Uint8Array {
  const out = new Uint8Array(n);
  if (!s) return out;
  for (let i = 0; i < n; i++) out[i] = s.charCodeAt(i) - 48;
  return out;
}

export function cellToLocal(r: number, c: number): [number, number] {
  return [c - HALF, r - HALF];
}

// Deterministic per-cell pseudo-random numbers (stable jitter across renders)
export function hash01(i: number, salt = 0): number {
  let x = (i + 1) * 374761393 + salt * 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return ((x >>> 0) % 100000) / 100000;
}
