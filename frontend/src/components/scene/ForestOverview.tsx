"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Sky } from "@react-three/drei";
import { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useStore } from "@/lib/store";
import { getCrewPose } from "@/lib/crewMotion";
import { worldPosition } from "./forestGeometry";
import { SharedLandscape, SHARED_PLOT_POSITIONS } from "./SharedLandscape";
import { ForestSceneContent, SceneBoundary, type ForestSceneProps } from "./ForestScene";
import { SceneReflections } from "./SceneReflections";

export interface OverviewPlot extends ForestSceneProps {
  id: string;
  region: string;
  position: [number, number, number];
}

// All plots share a camera and clock, while retaining their own backend cells.
export function overviewPosition(index: number): [number, number, number] {
  return SHARED_PLOT_POSITIONS[index] ?? [0, 0, 0];
}

function OverviewCamera({ resetKey, focusKey, selected }: { resetKey: number; focusKey: number; selected?: OverviewPlot }) {
  const { camera, size, controls } = useThree();
  const command = useStore(s => s.cameraCommand);
  const lastFocus = useRef(focusKey);
  useLayoutEffect(() => {
    const aspect = size.width / size.height;
    const distance = Math.max(.5, 1.4 / aspect);
    camera.position.set(5 * distance, 34 * distance, 59 * distance);
    (camera as PerspectiveCamera).fov = 50;
    camera.updateProjectionMatrix();
    const orbit = controls as OrbitControlsImpl | null;
    if (orbit) { orbit.target.set(0, 1, 0); orbit.update(); }
    else camera.lookAt(0, 1, 0);
  }, [camera, controls, size, resetKey]);
  useEffect(() => {
    if (!command || !controls) return;
    const orbit = controls as OrbitControlsImpl;
    const offset = camera.position.clone().sub(orbit.target);
    if (command.kind === "zoomIn" || command.kind === "zoomOut") {
      offset.multiplyScalar(command.kind === "zoomIn" ? .8 : 1.25).clampLength(8, 150);
    } else if (command.kind === "rotateL" || command.kind === "rotateR") {
      offset.applyAxisAngle(new Vector3(0, 1, 0), command.kind === "rotateL" ? -Math.PI / 8 : Math.PI / 8);
    }
    camera.position.copy(orbit.target).add(offset);
    orbit.update();
  }, [camera, command, controls]);
  useEffect(() => {
    if (!controls || !selected || lastFocus.current === focusKey) return;
    lastFocus.current = focusKey;
    const orbit = controls as OrbitControlsImpl;
    const burning = selected.frame.cells.filter(cell => cell.state === "burning");
    const x = burning.length ? burning.reduce((sum, cell) => sum + cell.x, 0) / burning.length - 9.5 : 0;
    const z = burning.length ? burning.reduce((sum, cell) => sum + cell.z, 0) / burning.length - 9.5 : 0;
    const crewX = selected.crew.station[0] - 9.5, crewZ = selected.crew.station[1] - 9.5;
    orbit.target.set(selected.position[0] + (selected.crew.assigned ? (x + crewX) / 2 : x), 2, selected.position[2] + (selected.crew.assigned ? (z + crewZ) / 2 : z));
    const heading = getCrewPose(selected.crew, selected.frame.tick).heading + .9;
    camera.position.copy(orbit.target).add(new Vector3(Math.sin(heading) * 10, 7, Math.cos(heading) * 10));
    orbit.update();
  }, [camera, controls, focusKey, selected]);
  return null;
}

export default function ForestOverview({ plots, selectedId, resetKey, focusKey, playing }: {
  plots: OverviewPlot[]; selectedId: string | null; resetKey: number; focusKey: number; playing: boolean;
}) {
  const portal = useRef<HTMLDivElement>(null!);
  const [contextLost, setContextLost] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fallback = <div className="overview-fallback">
    <p>3D unavailable · synchronized forest grids</p>
    <button className="btn" onClick={() => { setContextLost(false); setAttempt(n => n + 1); }}>Retry 3D view</button>
    <div>{plots.map(plot => <section key={plot.id}><strong>{plot.label}</strong><div className="fallback-grid">{plot.frame.cells.map(cell => <span key={cell.id} title={`Cell ${cell.z + 1}, ${cell.x + 1}: ${cell.state}`} style={{ background: cell.state === "burning" ? "#ff7a22" : cell.state === "burned" ? "#25271f" : cell.state === "non-vegetated" ? "#b6a586" : cell.protected ? "#c9e676" : "#72944c" }}/>)}</div></section>)}</div>
  </div>;
  if (contextLost) return fallback;
  return <div className="scene-canvas overview-canvas" ref={portal}>
    <SceneBoundary key={attempt} fallback={fallback}>
      <Canvas eventSource={portal} shadows dpr={2} frameloop={playing ? "always" : "demand"} camera={{ position: [5, 49, 42], fov: 50, near: .1, far: 300 }} gl={{ antialias: true }} onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", event => { event.preventDefault(); setContextLost(true); });
      }}>
        <color attach="background" args={["#94b4bf"]}/>
        <fog attach="fog" args={["#a0bdc7", 130, 290]}/>
        <Sky distance={450000} sunPosition={[-30, 25, 10]} inclination={.5} azimuth={.25} turbidity={3.5} rayleigh={.8}/>
        <SceneReflections/>
        <ambientLight intensity={.45}/>
        <hemisphereLight args={["#d7efff", "#4b5331", .8]}/>
        <directionalLight position={[-24, 50, 20]} intensity={2.5} color="#fff1cf" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-50} shadow-camera-right={50} shadow-camera-top={40} shadow-camera-bottom={-40} shadow-camera-far={130} shadow-normalBias={.025}/>
        <SharedLandscape/>
        <OverviewPlots plots={plots} selectedId={selectedId} resetKey={resetKey} focusKey={focusKey} portal={portal}/>
      </Canvas>
    </SceneBoundary>
  </div>;
}

function OverviewPlots({ plots, selectedId, resetKey, focusKey, portal }: {
  plots: OverviewPlot[]; selectedId: string | null; resetKey: number; focusKey: number; portal: RefObject<HTMLDivElement>;
}) {
  const select = useStore(s => s.select);
  const selected = plots.find(plot => plot.id === selectedId);
  return <>
        {plots.map(plot => <group key={plot.id} position={plot.position}>
          <ForestSceneContent {...plot} portal={portal} overview/>
          <Html portal={portal} position={worldPosition(plot.ignition[0]?.[1] ?? 10, plot.ignition[0]?.[0] ?? 10, 6.5)} center zIndexRange={[22, 1]}><button className="overview-plot-label" aria-label={`Select ${plot.label}`} title={`${plot.label} · ${plot.region}`} aria-pressed={plot.id === selectedId} onClick={() => select(plot.id)}><b>{plot.label.replace("Incident ", "")}</b><span>{plot.frame.metrics.burning} burning</span></button></Html>
        </group>)}
        <OrbitControls makeDefault enablePan minDistance={8} maxDistance={150} minPolarAngle={.2} maxPolarAngle={Math.PI / 2.6} target={[0, 1, 0]}/>
        <OverviewCamera resetKey={resetKey} focusKey={focusKey} selected={selected}/>
  </>;
}
