import type { ForestFrame } from "./forestFrame";
import type { PolicyResult } from "./types";

export interface WaterResponse {
  phase: "unassigned" | "en-route" | "suppression" | "complete" | "preview";
  spraying: boolean;
  target: [number, number] | null;
  source: [number, number] | null;
}

/** Visualize the backend crew intervention; previews never change a simulation frame. */
export function getWaterResponse(frame: ForestFrame, result: PolicyResult, incidentId: string, preview: boolean): WaterResponse {
  if (!frame.assigned) return { phase: "unassigned", spraying: false, target: null, source: null };
  const burning = frame.cells.filter(cell => cell.state === "burning");
  const arrival = result.events.find(event => event.incident_id === incidentId && event.type === "arrival")?.step
    ?? result.metrics.per_incident.find(incident => incident.incident_id === incidentId)?.response_delay_steps;
  // The backend can extinguish a cell in the arrival frame. Show a short mop-up window.
  const mopUp = frame.arrived && arrival != null && frame.tick <= arrival + 2;
  const candidates = burning.length ? burning : mopUp ? frame.cells.filter(cell => cell.state === "intervened") : [];
  const nearest = candidates.reduce<typeof candidates[number] | null>((best, cell) => {
    const distance = (cell.x - frame.team[0]) ** 2 + (cell.z - frame.team[1]) ** 2;
    const previous = best ? (best.x - frame.team[0]) ** 2 + (best.z - frame.team[1]) ** 2 : Infinity;
    return distance < previous ? cell : best;
  }, null);
  const isPreview = preview && burning.length > 0;
  const spraying = !!nearest && (isPreview || frame.arrived);
  // Use an existing clearing for the schematic nozzle so the operator stays visible.
  const clearing = nearest ? frame.cells.filter(cell => {
    const distance = (cell.x - nearest.x) ** 2 + (cell.z - nearest.z) ** 2;
    return cell.state === "non-vegetated" && distance >= 6 && distance <= 36;
  }).sort((a, b) => Math.abs((a.x - nearest.x) ** 2 + (a.z - nearest.z) ** 2 - 16) - Math.abs((b.x - nearest.x) ** 2 + (b.z - nearest.z) ** 2 - 16))[0] : null;
  return {
    phase: isPreview ? "preview" : !frame.arrived ? "en-route" : spraying ? "suppression" : "complete",
    spraying,
    target: nearest ? [nearest.x, nearest.z] : null,
    source: clearing ? [clearing.x, clearing.z] : null,
  };
}
