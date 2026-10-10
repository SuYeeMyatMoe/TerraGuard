"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Component, ReactNode, useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { World } from "./World";

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Fallback() {
  return (
    <div className="grid h-full w-full place-items-center bg-[var(--bg)]">
      <div className="panel max-w-sm p-6 text-center">
        <div className="text-[15px] font-bold">3D view unavailable</div>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
          This browser could not start WebGL. Predictions, the policy comparison and decisions still work in the side
          panels, and Earth View is available from the top bar.
        </p>
      </div>
    </div>
  );
}

export default function ForestCanvas() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [dpr, setDpr] = useState(1.75);
  // pause rendering when the scene is hidden or fully covered by the methodology drawer
  const active = useStore((s) => s.view === "sim" && !s.methodologyOpen);
  useEffect(() => setOk(webglAvailable()), []);
  if (ok === null) return null;
  if (!ok) return <Fallback />;
  return (
    <SceneBoundary fallback={<Fallback />}>
      <Canvas
        flat
        dpr={dpr}
        frameloop={active ? "always" : "never"}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => gl.setClearColor("#f5f2e6")}
        style={{ position: "absolute", inset: 0 }}
      >
        {/* adaptive quality: lower the pixel ratio on slow GPUs, restore it when frames recover */}
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.75)} flipflops={3} onFallback={() => setDpr(1)} />
        <World />
      </Canvas>
    </SceneBoundary>
  );
}
