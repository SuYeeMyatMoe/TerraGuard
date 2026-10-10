"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { adaptSceneQuality, getSceneQuality, qualityModes, type QualityMode, type QualityObservation, type SceneQualitySettings } from "@/lib/sceneQuality";

const QualityContext = createContext<{settings: SceneQualitySettings; visible: boolean; observe: (fps: number, seconds: number) => void}>({
  settings: getSceneQuality("balanced", 1),
  visible: true,
  observe: () => {},
});

export function SceneQualityProvider({ mode, children }: { mode: QualityMode; children: ReactNode }) {
  const [deviceRatio, setDeviceRatio] = useState(1);
  const [visible, setVisible] = useState(true);
  const [level, setLevel] = useState<QualityObservation["level"]>(1);
  const observation = useRef<QualityObservation>({ level: 1, slowSeconds: 0, fastSeconds: 0 });
  useEffect(() => {
    const update = () => {
      setDeviceRatio(window.devicePixelRatio || 1);
      setVisible(document.visibilityState !== "hidden");
      observation.current = { ...observation.current, slowSeconds: 0, fastSeconds: 0 };
    };
    update();
    window.addEventListener("resize", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const observe = useCallback((fps: number, seconds: number) => {
    if (mode !== "auto") {
      observation.current = { ...observation.current, slowSeconds: 0, fastSeconds: 0 };
      return;
    }
    const next = adaptSceneQuality(observation.current, fps, seconds);
    observation.current = next;
    setLevel(next.level);
  }, [mode]);
  const settings = useMemo(() => getSceneQuality(mode === "auto" ? qualityModes[level] : mode, deviceRatio), [mode, level, deviceRatio]);
  const value = useMemo(() => ({ settings, visible, observe }), [settings, visible, observe]);
  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
}

export const useSceneQuality = () => useContext(QualityContext);

/** Runs inside either Canvas. Paused and hidden intervals cannot lower quality. */
export function SceneQualityRuntime({ playing }: { playing: boolean }) {
  const { settings, visible, observe } = useSceneQuality();
  const { gl, setDpr } = useThree();
  const sample = useRef({ seconds: 0, frames: 0 });
  useEffect(() => { setDpr(settings.dpr); }, [setDpr, settings.dpr]);
  useEffect(() => {
    sample.current = { seconds: 0, frames: 0 };
    observe(0, 0);
  }, [playing, visible, observe]);
  useFrame((_, delta) => {
    if (!playing || !visible || document.visibilityState === "hidden" || delta <= 0 || delta > 2) {
      sample.current = { seconds: 0, frames: 0 };
      return;
    }
    sample.current.seconds += delta;
    sample.current.frames++;
    if (sample.current.seconds >= 1) {
      const fps = sample.current.frames / sample.current.seconds;
      gl.domElement.dataset.renderFps = fps.toFixed(1);
      gl.domElement.dataset.renderCalls = String(gl.info.render.calls);
      gl.domElement.dataset.renderTriangles = String(gl.info.render.triangles);
      observe(fps, sample.current.seconds);
      sample.current = { seconds: 0, frames: 0 };
    }
  });
  return null;
}
