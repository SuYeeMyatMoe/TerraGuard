import type { PlotInfo, PolicyResult } from "./types";

export const PLAYBACK_STEP_MS = 1800;
export type GridPoint = [number, number];
export interface CrewPlan {
  assigned: boolean;
  dispatch: number;
  arrival: number | null;
  station: GridPoint;
  route: GridPoint[];
}

/** A schematic access route on this plot, separate from the backend arrival time. */
export function getCrewPlan(plot: PlotInfo, result: PolicyResult): CrewPlan {
  const origin: GridPoint = [plot.ignition[0]?.[1] ?? 10, plot.ignition[0]?.[0] ?? 10];
  const clearings = Array.from(plot.fuel, (fuel, id) => ({ fuel, x:id % 20, z:Math.floor(id / 20), id })).filter(cell => cell.fuel === "0");
  const parking = clearings.filter(cell => {
    const d = (cell.x - origin[0]) ** 2 + (cell.z - origin[1]) ** 2;
    return d >= 4 && d <= 36;
  }).sort((a,b) => Math.abs((a.x-origin[0])**2+(a.z-origin[1])**2-12) - Math.abs((b.x-origin[0])**2+(b.z-origin[1])**2-12))[0];
  const station: GridPoint = parking ? [parking.x,parking.z] : [Math.max(0,origin[0]-3),Math.min(19,origin[1]+1)];
  const entry = clearings.filter(cell => cell.x <= 1).sort((a,b) => (a.z-18)**2+a.x**2 - ((b.z-18)**2+b.x**2))[0];
  const start: GridPoint = entry ? [entry.x,entry.z] : [2,18];
  const startId = start[1]*20+start[0], endId = station[1]*20+station[0];
  const costs = new Array<number>(400).fill(Infinity), previous = new Array<number>(400).fill(-1);
  costs[startId] = 0;
  const pending = [startId], visited = new Set<number>();
  while (pending.length) {
    pending.sort((a,b) => costs[a]-costs[b]);
    const current = pending.shift()!;
    if (visited.has(current)) continue;
    if (current === endId) break;
    visited.add(current);
    const x=current%20,z=Math.floor(current/20);
    for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
      const nx=x+dx,nz=z+dz;
      if (nx<0||nx>19||nz<0||nz>19) continue;
      const id=nz*20+nx;
      const cost = costs[current] + Math.hypot(dx,dz) * (plot.fuel[id]==="0" ? 1 : plot.protected[id]==="1" ? 18 : 7);
      if (cost < costs[id]) { costs[id]=cost; previous[id]=current; pending.push(id); }
    }
  }
  const route: GridPoint[]=[];
  for (let id=endId;id>=0;id=previous[id]) { route.unshift([id%20,Math.floor(id/20)]); if (id===startId) break; }
  const arrival = result.events.find(event => event.incident_id===plot.incident_id && event.type==="arrival")?.step
    ?? result.metrics.per_incident.find(incident => incident.incident_id===plot.incident_id)?.response_delay_steps ?? null;
  return { assigned:result.assigned.includes(plot.incident_id), dispatch:result.events.find(event => event.incident_id===plot.incident_id && event.type==="dispatch")?.step ?? 0, arrival, station, route };
}

export function getCrewPose(plan: CrewPlan, tick: number): { position: GridPoint; heading: number } {
  const progress = !plan.assigned || plan.arrival == null || tick < plan.dispatch ? 0 : plan.arrival <= plan.dispatch ? 1 : Math.max(0,Math.min(1,(tick-plan.dispatch)/(plan.arrival-plan.dispatch)));
  const segments = plan.route.slice(1).map((point,i) => Math.hypot(point[0]-plan.route[i][0],point[1]-plan.route[i][1]));
  let distance = segments.reduce((sum,d)=>sum+d,0)*progress;
  for (let i=0;i<segments.length;i++) {
    if (distance <= segments[i] || i===segments.length-1) {
      const a=plan.route[i],b=plan.route[i+1],t=segments[i] ? Math.min(1,distance/segments[i]) : 1;
      return { position:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t], heading:Math.atan2(b[0]-a[0],b[1]-a[1]) };
    }
    distance -= segments[i];
  }
  return { position:plan.route[0] ?? plan.station, heading:0 };
}
