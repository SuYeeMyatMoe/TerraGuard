import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { startScenePlayback } from "@/lib/scenePlayback";

/** Budget animation frames; a parked, extinguished scene renders only on changes. */
export function ScenePlayback({ playing, animated }: { playing: boolean; animated: boolean }) {
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    if (!playing || !animated) return;
    return startScenePlayback(invalidate, {
      request: frame => requestAnimationFrame(frame),
      cancel: id => cancelAnimationFrame(id),
      visible: () => !document.hidden,
    });
  }, [playing, animated, invalidate]);
  return null;
}
