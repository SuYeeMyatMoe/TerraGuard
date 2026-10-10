import type { PolicyResult } from "./types";

export interface FireLife { id: number; start: number; end: number | null; suppressed: boolean }
export interface FireLifeSample { heat: number; smokeTime: number; smokeStop: number | null }
const histories = new WeakMap<PolicyResult, Map<number, FireLife[]>>();
const smooth = (value: number) => { const t=Math.max(0,Math.min(1,value)); return t*t*(3-2*t); };

/** Read backend burn intervals once per result/plot, retaining extinguished sources. */
export function getFireHistory(result: PolicyResult, plotIndex: number): FireLife[] {
  let plots=histories.get(result);
  if (!plots) { plots=new Map(); histories.set(result,plots); }
  const cached=plots.get(plotIndex);
  if (cached) return cached;
  const history: FireLife[]=[], active=new Map<number,FireLife>();
  result.frames.forEach((frame,tick)=>{
    const cells=frame[plotIndex];
    if (!cells || cells.length!==400 || !/^[0-4]+$/.test(cells)) throw new Error("Invalid backend fire history.");
    for (let id=0;id<cells.length;id++) {
      const previous=active.get(id);
      if (cells[id]==="2" && !previous) {
        const life={id,start:tick,end:null,suppressed:false};
        history.push(life); active.set(id,life);
      } else if (cells[id]!=="2" && previous) {
        previous.end=tick; previous.suppressed=cells[id]==="4"; active.delete(id);
      }
    }
  });
  plots.set(plotIndex,history);
  return history;
}

/** Cosmetic residual heat; backend states and counts remain authoritative. */
export function sampleFireLife(life: FireLife, tick: number, arrival: number | null, stepSeconds: number, out: FireLifeSample): FireLifeSample {
  out.smokeTime=(tick-life.start)*stepSeconds+1.5;
  out.smokeStop=life.end==null?null:(life.end-life.start)*stepSeconds+1.5;
  out.heat=tick<life.start?0:1;
  if (tick<life.start || life.end==null) return out;
  const coolingStart=life.suppressed?Math.max(arrival??life.end,life.end-1):life.end;
  const cooled=coolingStart<life.end;
  if (cooled) out.heat=1-.45*smooth((tick-coolingStart)/(life.end-coolingStart));
  if (tick>=life.end) out.heat=(cooled?.55:1)*(1-smooth((tick-life.end)*stepSeconds/2.4));
  return out;
}
