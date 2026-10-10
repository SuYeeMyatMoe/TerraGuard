"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/** Report readiness after the committed scene has completed its first render. */
export function SceneReady({ onReady }: { onReady?: () => void }) {
  const invalidate = useThree(state => state.invalidate);
  const pending = useRef<number | null>(null);
  const reported = useRef(false);
  useEffect(() => {
    reported.current = false;
    invalidate();
    return () => {
      if (pending.current !== null) cancelAnimationFrame(pending.current);
      pending.current = null;
    };
  }, [onReady, invalidate]);
  useFrame(() => {
    if (!onReady || reported.current || pending.current !== null) return;
    pending.current = requestAnimationFrame(() => {
      pending.current = null;
      reported.current = true;
      onReady();
    });
  });
  return null;
}

/** A usable fallback must also release the loading screen when WebGL fails. */
export function SceneReadyFallback({ onReady, children }: { onReady?: () => void; children: ReactNode }) {
  useEffect(() => { onReady?.(); }, [onReady]);
  return <>{children}</>;
}
