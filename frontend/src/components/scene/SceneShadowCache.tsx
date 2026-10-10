import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";

/** Trees and parked crews need fresh shadows only when the scene changes. */
export function SceneShadowCache({ revision, variant }: { revision: unknown; variant?: string }) {
  const { gl, invalidate } = useThree();
  useLayoutEffect(() => {
    const autoUpdate = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();
    return () => { gl.shadowMap.autoUpdate = autoUpdate; gl.shadowMap.needsUpdate = true; };
  }, [gl, invalidate, revision, variant]);
  return null;
}
