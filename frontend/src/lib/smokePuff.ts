export interface SmokePuff { rise: number; width: number; height: number; opacity: number }

const smooth = (x: number) => { const t=Math.max(0,Math.min(1,x)); return t*t*(3-2*t); };

/** Reuse one output during animation; invisible cycle ends prevent visible pops. */
export function sampleSmokePuff(time: number, phase: number, out: SmokePuff, stoppedAt: number | null = null): SmokePuff {
  const cyclingTime=stoppedAt==null?time:Math.min(time,stoppedAt);
  const emittedAge=((cyclingTime*.075+phase)%1+1)%1;
  // Keep the last airborne puff; stop wrapping into a new emission after extinction.
  const age=Math.min(1,emittedAge+(stoppedAt==null?0:Math.max(0,time-stoppedAt)*.075));
  out.rise = age * 12.5;
  out.width = 4 + age * 11;
  out.height = 5 + age * 10;
  out.opacity = .65 * smooth(age / .08) * (1 - smooth((age - .65) / .35));
  return out;
}
