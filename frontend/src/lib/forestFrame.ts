import type { PlotInfo, PolicyResult } from "./types";

export type ForestCellState = "healthy" | "burning" | "burned" | "non-vegetated" | "protected" | "intervened";
export interface ForestCell {
  id: number;
  x: number;
  z: number;
  terrain: "forest" | "non-vegetated";
  protected: boolean;
  state: ForestCellState;
}
export interface ForestFrame {
  tick: number;
  cells: ForestCell[];
  team: [number, number];
  assigned: boolean;
  arrived: boolean;
  metrics: { burned: number; burning: number; habitat: number; healthy: number };
}

/** Translate the backend's selected 20×20 plot; the renderer never predicts spread. */
export function toForestFrame(plot: PlotInfo, result: PolicyResult, plotIndex: number, step: number): ForestFrame {
  const tick = Math.max(0, Math.min(Math.floor(step), result.frames.length - 1));
  const encoded = result.frames[tick]?.[plotIndex];
  if (!encoded || encoded.length !== 400 || !/^[0-4]+$/.test(encoded) || plot.fuel.length !== 400 || plot.protected.length !== 400)
    throw new Error("The forest renderer requires a valid 20×20 backend frame.");
  const cells: ForestCell[] = Array.from(encoded, (value, id) => {
    const protectedCell = plot.protected[id] === "1";
    const state: ForestCellState = value === "0" ? "non-vegetated" : value === "2" ? "burning" : value === "3" ? "burned" : value === "4" ? "intervened" : protectedCell ? "protected" : "healthy";
    return { id, x: id % 20, z: Math.floor(id / 20), terrain: plot.fuel[id] === "0" ? "non-vegetated" : "forest", protected: protectedCell, state };
  });
  const assigned = result.assigned.includes(plot.incident_id);
  const arrivalEvent = result.events.find(e => e.incident_id === plot.incident_id && e.type === "arrival");
  const arrival = arrivalEvent?.step ?? result.metrics.per_incident.find(p => p.incident_id === plot.incident_id)?.response_delay_steps;
  const dispatch = result.events.find(e => e.incident_id === plot.incident_id && e.type === "dispatch")?.step ?? 0;
  const base: [number, number] = [2, 18];
  const ignition = plot.ignition[0] ?? [10, 10]; // backend uses [row, column]
  const target: [number, number] = [ignition[1], ignition[0]];
  const progress = !assigned || arrival == null || tick < dispatch ? 0 : arrival <= dispatch ? 1 : Math.min(1, (tick - dispatch) / (arrival - dispatch));
  return {
    tick, cells, assigned, arrived: assigned && arrival != null && tick >= arrival,
    team: [base[0] + (target[0] - base[0]) * progress, base[1] + (target[1] - base[1]) * progress],
    metrics: {
      burned: cells.filter(c => c.state === "burned").length,
      burning: cells.filter(c => c.state === "burning").length,
      habitat: cells.filter(c => c.protected && c.state === "burned").length,
      healthy: cells.filter(c => c.state === "healthy" || c.state === "protected" || c.state === "intervened").length,
    },
  };
}
