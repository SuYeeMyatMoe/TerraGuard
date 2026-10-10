"use client";

import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, Sky } from "@react-three/drei";
import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  DoubleSide,
  InstancedMesh,
  Object3D,
  PerspectiveCamera,
  Vector3,
  PlaneGeometry,
  ShaderMaterial,
} from "three";
import { Flame, ShieldCheck, Trees } from "lucide-react";
import {
  landscapeHeight,
  makeLandscape,
  seed,
  terrainHeight,
  worldPosition,
} from "./forestGeometry";
import type { ForestCell as Cell, ForestFrame } from "@/lib/forestFrame";
import { useStore } from "@/lib/store";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { WaterResponse } from "@/lib/waterResponse";
import { WaterEffects } from "./WaterEffects";
import { CrewVehicle } from "./CrewVehicle";
import type { CrewPlan } from "@/lib/crewMotion";
import { SceneReflections } from "./SceneReflections";
import { NaturalTrees } from "./NaturalTrees";

const palette = {
  healthy: "#536843",
  protected: "#3c7252",
  burning: "#d26a25",
  burned: "#262923",
  "non-vegetated": "#8c8065",
  intervened: "#70965b",
};

function Terrain({ cells, showGrid, picking, onPick }: { cells: Cell[]; showGrid: boolean; picking: boolean; onPick: (row: number, col: number) => void }) {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(20, 20, 100, 100);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++)
      p.setY(i, terrainHeight(p.getX(i), p.getZ(i)));
    g.setAttribute(
      "color",
      new BufferAttribute(new Float32Array(p.count * 3), 3),
    );
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const p = geometry.getAttribute("position"),
      colors = geometry.getAttribute("color"),
      c = new Color();
    for (let i = 0; i < p.count; i++) {
      const x = Math.min(19, Math.max(0, Math.floor(p.getX(i) + 10))),
        z = Math.min(19, Math.max(0, Math.floor(p.getZ(i) + 10)));
      c.set(palette[cells[z * 20 + x].state]);
      c.multiplyScalar(0.76 + seed(i * 3) * 0.4);
      colors.setXYZ(i, c.r, c.g, c.b);
    }
    colors.needsUpdate = true;
  }, [cells, geometry]);
  const lines = useMemo(
    () =>
      Array.from({ length: 21 }, (_, n) => {
        const x = n - 10;
        return [
          Array.from(
            { length: 81 },
            (_, j) =>
              [x, terrainHeight(x, j / 4 - 10) + 0.03, j / 4 - 10] as [
                number,
                number,
                number,
              ],
          ),
          Array.from(
            { length: 81 },
            (_, j) =>
              [j / 4 - 10, terrainHeight(j / 4 - 10, x) + 0.03, x] as [
                number,
                number,
                number,
              ],
          ),
        ];
      }).flat(),
    [],
  );
  return (
    <>
      <mesh geometry={geometry} receiveShadow onClick={(event) => {
        if (!picking || event.delta > 5) return;
        event.stopPropagation();
        const point = event.object.worldToLocal(event.point.clone());
        const col = Math.max(0, Math.min(19, Math.floor(point.x + 10)));
        const row = Math.max(0, Math.min(19, Math.floor(point.z + 10)));
        onPick(row, col);
      }}>
        <meshStandardMaterial vertexColors roughness={0.98} envMapIntensity={0} />
      </mesh>
      {showGrid &&
        lines.map((points, i) => (
          <Line
            key={i}
            points={points}
            color="#78cad0"
            lineWidth={0.7}
            transparent
            opacity={0.33}
          />
        ))}
    </>
  );
}

function Forest({ cells, crew }: { cells: Cell[]; crew: CrewPlan }) {
  const placements = useMemo(() => cells.filter(cell => {
    if (cell.terrain !== "forest") return false;
    if (!crew.assigned) return true;
    // Leave room for both the cab and overhanging crowns at the stopping point.
    if (Math.hypot(cell.x - crew.station[0], cell.z - crew.station[1]) < 3.1) return false;
    return !crew.route.some(([x, z]) => Math.hypot(cell.x - x, cell.z - z) < 2.1);
  }).map(cell => {
    const x = cell.x - 9.5 + (seed(cell.id * 3) - .5) * .65;
    const z = cell.z - 9.5 + (seed(cell.id * 5) - .5) * .65;
    return {
      position: [x, terrainHeight(x, z), z] as [number, number, number],
      height: 2.2 + seed(cell.id * 23) * 1.2,
      rotation: seed(cell.id) * Math.PI * 2,
      variant: cell.id % 2,
      foliage: ["healthy", "protected", "intervened"].includes(cell.state),
      shade: seed(cell.id * 11),
    };
  }), [cells, crew]);
  return <NaturalTrees placements={placements}/>;
}

function Landscape() {
  const geometry = useMemo(makeLandscape, []);
  const placements = useMemo(() => Array.from({ length: 1000 }, (_, i) => {
    const x = (seed(i * 5) - .5) * 67, z = (seed(i * 11) - .5) * 55 - 5;
    const height = landscapeHeight(x, z);
    if ((Math.abs(x) < 10.2 && Math.abs(z) < 10.2) || height < .2 || height > 11) return null;
    return { position: [x, height, z] as [number, number, number], height: 2.5 + seed(i * 37) * 2, rotation: i, variant: i % 2, shade: seed(i) };
  }).filter((tree): tree is NonNullable<typeof tree> => tree !== null), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <>
    <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={1} envMapIntensity={0}/></mesh>
    <NaturalTrees placements={placements} shadows={false}/>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[20, .18, -5]} scale={[1, 1.8, 1]}>
      <circleGeometry args={[7.2, 64]}/><meshStandardMaterial color="#2c6977" roughness={.25} metalness={.45}/>
    </mesh>
  </>;
}

function FireEffects({ cells, ignition, playing }: { cells: Cell[]; ignition: [number, number]; playing: boolean }) {
  const flames = useRef<InstancedMesh>(null),
    smoke = useRef<InstancedMesh>(null);
  const active = useMemo(
    () => cells.filter((c) => c.state === "burning"),
    [cells],
  );
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
        uniforms: { time: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
        fragmentShader: `varying vec2 vUv; uniform float time; void main(){float wave=sin(vUv.y*11.0-time*5.0)*.045+sin(vUv.y*21.0+time*8.0)*.025; float x=(vUv.x-.5+wave)*(1.0+vUv.y*1.8); float body=pow(max(0.0,1.0-abs(x)*2.6),1.3)*(1.0-vUv.y); float edge=smoothstep(.0,.18,body); vec3 color=mix(vec3(1.0,.16,.015),vec3(1.0,.93,.55),body); gl_FragColor=vec4(color*1.5,edge*(1.0-vUv.y));}`,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const animate = useCallback((time: number) => {
    const d = new Object3D();
    let count = 0;
    active.forEach((cell) => {
      for (let j = 0; j < 3; j++) {
        const x = cell.x - 9.5 + (seed(cell.id * 7 + j) - 0.5) * 0.65,
          z = cell.z - 9.5 + (seed(cell.id * 13 + j) - 0.5) * 0.65,
          pulse = 0.88 + Math.sin(time * 6 + cell.id + j) * 0.12;
        d.position.set(x, terrainHeight(x, z) + 1.85 * pulse, z);
        d.rotation.set(0, Math.PI / 4 + j * 1.15, 0);
        d.scale.set(1.1, 4.2 * pulse, 1);
        d.updateMatrix();
        flames.current!.setMatrixAt(count, d.matrix);
        const rise = ((time * 0.13 + seed(cell.id + j * 11)) % 1) * 5.5;
        d.position.set(
          x + rise * 0.23,
          terrainHeight(x, z) + 3 + rise,
          z - rise * 0.12,
        );
        d.scale.setScalar(0.4 + rise * 0.18);
        d.rotation.set(j, time * 0.04, j);
        d.updateMatrix();
        smoke.current!.setMatrixAt(count, d.matrix);
        count++;
      }
    });
    flames.current!.count = count;
    smoke.current!.count = count;
    flames.current!.instanceMatrix.needsUpdate = true;
    smoke.current!.instanceMatrix.needsUpdate = true;
    flames.current!.computeBoundingSphere();
    smoke.current!.computeBoundingSphere();
  }, [active]);
  useLayoutEffect(() => animate(1.5), [animate]);
  useFrame(({ clock }) => {
    if (playing && !reducedMotion) {
      material.uniforms.time.value = clock.elapsedTime;
      animate(clock.elapsedTime);
    }
  });
  return (
    <>
      <instancedMesh ref={flames} args={[undefined, material, 1200]}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
      <instancedMesh ref={smoke} args={[undefined, undefined, 1200]}>
        <sphereGeometry args={[1, 9, 7]} />
        <meshStandardMaterial
          color="#414039"
          transparent
          opacity={0.42}
          depthWrite={false}
          roughness={1}
        />
      </instancedMesh>
      {active.map(cell => <mesh key={cell.id} position={worldPosition(cell.x, cell.z, .06)} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <circleGeometry args={[.55, 16]}/><meshBasicMaterial color="#ff681c" transparent opacity={.55} depthWrite={false} toneMapped={false}/>
      </mesh>)}
      {active.length > 0 && (
        <pointLight
          position={worldPosition(...ignition, 2)}
          color="#ff752e"
          intensity={30}
          distance={8}
          decay={2}
        />
      )}
    </>
  );
}

function CameraSetup({ resetKey, sceneKey, focusKey, focusX, focusZ }: { resetKey: number; sceneKey: string; focusKey: number; focusX: number; focusZ: number }) {
  const { camera, size, controls } = useThree();
  const command = useStore(s => s.cameraCommand);
  const lastFocus = useRef(0);
  useLayoutEffect(() => {
    camera.position.set(8, 17, 13);
    camera.lookAt(0, 0.8, 0);
    const orbit = controls as OrbitControlsImpl | null;
    if (orbit) { orbit.target.set(0, 0.8, 0); orbit.update(); }
  }, [camera, resetKey, sceneKey, controls]);
  useLayoutEffect(() => {
    const cam = camera as PerspectiveCamera;
    // Preserve a readable plot on portrait screens without pulling the camera away.
    cam.fov = Math.min(80, 2 * Math.atan(Math.tan(50 * Math.PI / 360) / Math.min(1, size.width / size.height)) * 180 / Math.PI);
    cam.updateProjectionMatrix();
  }, [camera, size]);
  useEffect(() => {
    if (!command || !controls) return;
    const orbit = controls as OrbitControlsImpl;
    const offset = camera.position.clone().sub(orbit.target);
    if (command.kind === "reset") { camera.position.set(8, 17, 13); orbit.target.set(0, 0.8, 0); }
    else {
      if (command.kind === "zoomIn" || command.kind === "zoomOut") offset.multiplyScalar(command.kind === "zoomIn" ? 0.8 : 1.25).clampLength(8, 49);
      else offset.applyAxisAngle(new Vector3(0, 1, 0), command.kind === "rotateL" ? -Math.PI / 8 : Math.PI / 8);
      camera.position.copy(orbit.target).add(offset);
    }
    orbit.update();
  }, [camera, command, controls]);
  useEffect(() => {
    if (!controls || !focusKey || lastFocus.current === focusKey) return;
    lastFocus.current = focusKey;
    const orbit = controls as OrbitControlsImpl;
    const target = worldPosition(focusX, focusZ, 1.6);
    orbit.target.set(...target);
    camera.position.set(target[0] + 5, target[1] + 7, target[2] + 8);
    orbit.update();
  }, [camera, controls, focusKey, focusX, focusZ]);
  return null;
}

export interface ForestSceneProps {
  frame: ForestFrame;
  water: WaterResponse;
  crew: CrewPlan;
  ignition: number[][];
  label: string;
  playing: boolean;
  active: boolean;
  showHabitat: boolean;
  showGrid: boolean;
  resetKey: number;
  focusKey: number;
  picking: boolean;
  onPick: (row: number, col: number) => void;
}

export function ForestSceneContent({ frame, water, crew, ignition, label, playing, showHabitat, showGrid, resetKey, focusKey, picking, onPick, portal, overview = false }: ForestSceneProps & { portal: RefObject<HTMLDivElement>; overview?: boolean }) {
  const speed=useStore(s=>s.speed);
  const originX = ignition[0]?.[1] ?? 10, originZ = ignition[0]?.[0] ?? 10;
  const origin: [number, number] = [originX, originZ];
  const fire = useMemo(() => {
    const burning = frame.cells.filter(cell => cell.state === "burning");
    return { count: burning.length, x: burning.length ? burning.reduce((sum, cell) => sum + cell.x, 0) / burning.length : originX, z: burning.length ? burning.reduce((sum, cell) => sum + cell.z, 0) / burning.length : originZ };
  }, [frame.cells, originX, originZ]);
  const habitat = useMemo(() => {
    const segments: [number, number, number][][] = [];
    let x = 0, z = 0, count = 0;
    const protectedAt = (row: number, col: number) => row >= 0 && row < 20 && col >= 0 && col < 20 && frame.cells[row * 20 + col]?.protected;
    for (const cell of frame.cells) {
      if (!cell.protected) continue;
      x += cell.x; z += cell.z; count++;
      const edges = [
        [cell.z - 1, cell.x, cell.x - .5, cell.z - .5, cell.x + .5, cell.z - .5],
        [cell.z + 1, cell.x, cell.x - .5, cell.z + .5, cell.x + .5, cell.z + .5],
        [cell.z, cell.x - 1, cell.x - .5, cell.z - .5, cell.x - .5, cell.z + .5],
        [cell.z, cell.x + 1, cell.x + .5, cell.z - .5, cell.x + .5, cell.z + .5],
      ];
      for (const [row, col, ax, az, bx, bz] of edges) {
        if (!protectedAt(row, col)) segments.push([worldPosition(ax, az, 1.7), worldPosition(bx, bz, 1.7)]);
      }
    }
    return { segments, center: count ? worldPosition(x / count, z / count, 3.5) : null };
  }, [frame.cells]);
  return <>
    {!overview && <>
    <CameraSetup resetKey={resetKey} sceneKey={label} focusKey={focusKey} focusX={crew.assigned ? (fire.x + crew.station[0]) / 2 : fire.x} focusZ={crew.assigned ? (fire.z + crew.station[1]) / 2 : fire.z}/>
    <color attach="background" args={["#94b4bf"]}/>
    <fog attach="fog" args={["#a0bdc7", 36, 90]}/>
    <Sky distance={450000} sunPosition={[-30, 25, 10]} inclination={.5} azimuth={.25} turbidity={3.5} rayleigh={.8}/>
    <SceneReflections/>
    <ambientLight intensity={.45}/>
    <hemisphereLight args={["#d7efff", "#4b5331", .8]}/>
    <directionalLight position={[-14,26,10]} intensity={2.5} color="#fff1cf" castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} shadow-camera-far={70} shadow-normalBias={.025}/>
    <Landscape/>
    </>}
    <Terrain cells={frame.cells} showGrid={showGrid} picking={picking} onPick={onPick}/>
    <Forest cells={frame.cells} crew={crew}/>
    <FireEffects cells={frame.cells} ignition={[fire.x, fire.z]} playing={playing}/>
    {water.spraying && water.target && <WaterEffects target={water.target} source={water.source} playing={playing}/>}
    {!overview && fire.count > 0 && <Html portal={portal} position={worldPosition(fire.x, fire.z, 2.3)} center zIndexRange={[21,1]}><div className="map-label fire-label"><Flame size={14}/>FIRE FRONT · {fire.count} {fire.count === 1 ? "cell" : "cells"}</div></Html>}
    {showHabitat && <>
      {habitat.segments.map((points, i) => <Line key={i} points={points} color="#c9e676" lineWidth={1.5} transparent opacity={.85}/>) }
      {frame.cells.filter(c => c.protected).map(c => <mesh key={c.id} position={worldPosition(c.x,c.z,.06)} rotation={[-Math.PI/2,0,0]} raycast={() => null}><planeGeometry args={[1,1]}/><meshBasicMaterial color="#8da432" transparent opacity={.12} depthWrite={false} side={DoubleSide}/></mesh>)}
      {!overview && habitat.center && <Html portal={portal} position={habitat.center} center zIndexRange={[18,1]}><div className="map-label habitat-label"><Trees size={13}/>Protected habitat</div></Html>}
    </>}
    {ignition.map(([row,col], i) => <group key={i} position={worldPosition(col,row,.08)}>
      <mesh rotation={[-Math.PI/2,0,0]} raycast={() => null}><ringGeometry args={[.52,.59,48]}/><meshBasicMaterial color="#ffd490"/></mesh>
      <Line points={[[0,.1,0],[0,2.3,0]]} color="#ffba89" lineWidth={.8}/>
      {!overview && fire.count === 0 && <Html portal={portal} position={[0,2.6,0]} center zIndexRange={[20,1]}><div className="map-label"><Flame size={12}/>{i === 0 ? `${label} · ignition` : "Ignition point"}</div></Html>}
    </group>)}
    <CrewVehicle plan={crew} tick={frame.tick} playing={playing} speed={speed} spraying={water.spraying} portal={portal} label={label.replace("Incident ", "Crew ")} scale={overview ? 1.4 : 1.3}/>
    {!overview && frame.arrived && !water.spraying && <Html portal={portal} position={worldPosition(...origin,4.6)} center zIndexRange={[19,1]}><div className="containment-label"><ShieldCheck size={11}/>Response crew on site</div></Html>}
    {!overview && <OrbitControls makeDefault enablePan={false} enabled={!picking} minDistance={8} maxDistance={49} minPolarAngle={.3} maxPolarAngle={Math.PI/2.6} target={[0,.8,0]}/>}
  </>;
}

export class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Forest scene failed", error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function ForestScene(props: ForestSceneProps) {
  const portal = useRef<HTMLDivElement>(null!);
  const [contextLost, setContextLost] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fallback = <div className="fallback-map"><p>3D unavailable · live 20 × 20 forest grid</p><button className="btn btn-primary" onClick={() => { setContextLost(false); setAttempt(n => n + 1); }}>Retry 3D view</button><div className="fallback-grid">{props.frame.cells.map(cell => <button key={cell.id} style={{background:palette[cell.state]}} title={`Cell ${cell.z+1}, ${cell.x+1}: ${cell.state}`} disabled={!props.picking || cell.terrain === "non-vegetated"} onClick={() => props.onPick(cell.z,cell.x)}/>)}</div></div>;
  if (contextLost) return fallback;
  return <div ref={portal} className="scene-canvas" style={{cursor:props.picking ? "crosshair" : "grab"}}>
    <SceneBoundary key={attempt} fallback={fallback}>
      <Canvas eventSource={portal} shadows dpr={2} frameloop={!props.active ? "never" : props.playing ? "always" : "demand"} camera={{position:[8,17,13],fov:50,near:.1,far:160}} gl={{antialias:true}} fallback={<span aria-hidden="true">3D view unavailable</span>} onCreated={({gl}) => {
        gl.domElement.addEventListener("webglcontextlost", event => { event.preventDefault(); setContextLost(true); });
      }}><ForestSceneContent {...props} portal={portal}/></Canvas>
    </SceneBoundary>
  </div>;
}
