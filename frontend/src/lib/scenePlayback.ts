import type { ForestFrame } from "./forestFrame";
import type { CrewPlan } from "./crewMotion";

export function needsForestAnimation(frame: ForestFrame, crew: CrewPlan, spraying: boolean) {
  return frame.metrics.burning > 0 || spraying || (crew.assigned && crew.arrival != null && frame.tick >= crew.dispatch && frame.tick < crew.arrival);
}

interface FrameScheduler {
  request: (frame: (time: number) => void) => number;
  cancel: (id: number) => void;
  visible: () => boolean;
}

export function startScenePlayback(invalidate: () => void, scheduler: FrameScheduler) {
  let request = 0, lastFrame = 0;
  const frame = (time: number) => {
    if (scheduler.visible() && time - lastFrame >= 1000 / 30 - .5) {
      lastFrame = time;
      invalidate();
    }
    request = scheduler.request(frame);
  };
  request = scheduler.request(frame);
  return () => scheduler.cancel(request);
}
