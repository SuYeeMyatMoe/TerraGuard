import type { ForestFrame } from "./forestFrame";
import type { PolicyResult } from "./types";
import type { CrewPlan } from "./crewMotion";

export interface WaterResponse {
  phase: "unassigned" | "en-route" | "suppression" | "complete";
  spraying: boolean;
  target: [number, number] | null;
  source: [number, number] | null;
}

/** Spray only after backend arrival, at active or recently extinguished fire cells. */
export function getWaterResponse(frame: ForestFrame, result: PolicyResult, plan: CrewPlan, plotIndex: number): WaterResponse {
  if (!frame.assigned) return { phase: "unassigned", spraying: false, target: null, source: null };
  const burning = frame.cells.filter(cell => cell.state === "burning");
  const recentlySuppressed = new Set<number>();
  if (frame.arrived && plan.arrival != null) {
    for (let step=Math.max(plan.arrival+1,frame.tick-2);step<=frame.tick;step++) {
      const before=result.frames[step-1]?.[plotIndex],after=result.frames[step]?.[plotIndex];
      if (!before||!after) continue;
      for (let id=0;id<after.length;id++) if (before[id]==="2"&&after[id]==="4") recentlySuppressed.add(id);
    }
  }
  const candidates = burning.length ? burning : frame.cells.filter(cell => recentlySuppressed.has(cell.id));
  const nearest = candidates.reduce<typeof candidates[number] | null>((best, cell) => {
    const distance = (cell.x - plan.station[0]) ** 2 + (cell.z - plan.station[1]) ** 2;
    const previous = best ? (best.x - plan.station[0]) ** 2 + (best.z - plan.station[1]) ** 2 : Infinity;
    return distance < previous ? cell : best;
  }, null);
  const spraying = !!nearest && frame.arrived;
  return {
    phase: !frame.arrived ? "en-route" : spraying ? "suppression" : "complete",
    spraying,
    target: nearest ? [nearest.x, nearest.z] : null,
    source: plan.station,
  };
}
