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
  CircleGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  InstancedBufferAttribute,
  Object3D,
  PerspectiveCamera,
  Vector3,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  type PointLight,
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
import { SceneQualityRuntime, useSceneQuality } from "./SceneQuality";
import { SceneReady, SceneReadyFallback } from "./SceneReady";
import { createSmokeVisuals } from "./smokeMaterial";
import { sampleSmokePuff } from "@/lib/smokePuff";
import { sampleFireLife, type FireLife } from "@/lib/fireLifetime";
import { PLAYBACK_STEP_MS } from "@/lib/crewMotion";

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
  const gridSegments = useMemo(() => lines.flatMap(points => points.slice(1).flatMap((point, i) => [points[i], point])), [lines]);
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
          <Line
            segments
            points={gridSegments}
            color="#78cad0"
            lineWidth={0.7}
            transparent
            opacity={0.33}
          />}
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
  const geometry = useMemo(() => makeLandscape(), []);
  const placements = useMemo(() => Array.from({ length: 1000 }, (_, i) => {
    const x = (seed(i * 5) - .5) * 67, z = (seed(i * 11) - .5) * 55 - 5;
    const height = landscapeHeight(x, z);
    if ((Math.abs(x) < 10.2 && Math.abs(z) < 10.2) || height < .2 || height > 11) return null;
    return { position: [x, height, z] as [number, number, number], height: 2.5 + seed(i * 37) * 2, rotation: i, variant: i % 2, shade: seed(i) };
  }).filter((tree): tree is NonNullable<typeof tree> => tree !== null), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <>
    <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={1} envMapIntensity={0}/></mesh>
    <NaturalTrees placements={placements} shadows={false} background/>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[20, .18, -5]} scale={[1, 1.8, 1]}>
      <circleGeometry args={[7.2, 64]}/><meshStandardMaterial color="#2c6977" roughness={.25} metalness={.45}/>
    </mesh>
  </>;
}

function FireEffects({ history, tick, arrival, speed, ignition, playing }: { history: FireLife[]; tick: number; arrival: number | null; speed: number; ignition: [number, number]; playing: boolean }) {
  const flames = useRef<InstancedMesh>(null),
    smoke = useRef<InstancedMesh>(null);
  const glows = useRef<InstancedMesh>(null), light = useRef<PointLight>(null);
  const playbackRun = useStore(s => s.playbackRun);
  const fraction = useRef(0);
  const previous = useRef<{ tick: number; history: FireLife[]; run: number } | null>(null);
  const { settings } = useSceneQuality();
  const dummy = useMemo(() => new Object3D(), []);
  const glowColor = useMemo(() => new Color(), []);
  const lifeSample = useMemo(() => ({ heat: 0, smokeTime: 0, smokeStop: null as number | null }), []);
  const puff = useMemo(() => ({ rise: 0, width: 0, height: 0, opacity: 0 }), []);
  const flameGeometry = useMemo(() => {
    const geometry=new PlaneGeometry(1,1);
    geometry.setAttribute("fireHeat",new InstancedBufferAttribute(new Float32Array(1200),1));
    return geometry;
  }, []);
  const glowGeometry = useMemo(() => new CircleGeometry(.55,16), []);
  const smokeVisuals = useMemo(() => createSmokeVisuals(), []);
  useEffect(() => () => {
    smokeVisuals.geometry.dispose(); smokeVisuals.material.dispose(); smokeVisuals.texture.dispose();
    flameGeometry.dispose(); glowGeometry.dispose();
  }, [smokeVisuals, flameGeometry, glowGeometry]);
  const sources = useMemo(() => [...history].sort((a,b)=>b.start-a.start).map(life => {
    const x=life.id%20-9.5, z=Math.floor(life.id/20)-9.5;
    return {life,x,z,y:terrainHeight(x,z),particles:Array.from({length:3},(_,j)=>{
      const px=x+(seed(life.id*7+j)-.5)*.65, pz=z+(seed(life.id*13+j)-.5)*.65;
      return {j,x:px,z:pz,y:terrainHeight(px,pz),phase:.12+seed(life.id)*.22+j/3};
    })};
  }), [history]);
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
        vertexShader: `attribute float fireHeat; varying vec2 vUv; varying float vHeat; void main(){vUv=uv; vHeat=fireHeat; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
        fragmentShader: `varying vec2 vUv; varying float vHeat; uniform float time; void main(){float wave=sin(vUv.y*11.0-time*5.0)*.045+sin(vUv.y*21.0+time*8.0)*.025; float x=(vUv.x-.5+wave)*(1.0+vUv.y*1.8); float body=pow(max(0.0,1.0-abs(x)*2.6),1.3)*(1.0-vUv.y); float edge=smoothstep(.0,.18,body); vec3 color=mix(vec3(1.0,.10,.008),vec3(1.0,.93,.55),body*vHeat); gl_FragColor=vec4(color*1.5,edge*(1.0-vUv.y)*vHeat);}`,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const animate = useCallback((visualTick: number) => {
    if (!flames.current || !smoke.current || !glows.current) return;
    const d = dummy;
    const stepSeconds=PLAYBACK_STEP_MS/1000, time=visualTick*stepSeconds;
    material.uniforms.time.value=time;
    const heatAttribute=flameGeometry.getAttribute("fireHeat") as InstancedBufferAttribute;
    let flameCount = 0, smokeCount = 0, glowCount = 0, maxHeat = 0;
    for (const source of sources) {
      const {life}=source;
      if (visualTick<life.start || (life.end!=null && (visualTick-life.end)*stepSeconds>14)) continue;
      sampleFireLife(life,visualTick,arrival,stepSeconds,lifeSample);
      const heat=lifeSample.heat;
      maxHeat=Math.max(maxHeat,heat);
      if (heat>.001 && glowCount<400) {
        d.position.set(source.x,source.y+.06,source.z);
        d.rotation.set(-Math.PI/2,0,0); d.scale.setScalar(.4+.6*heat); d.updateMatrix();
        glows.current.setMatrixAt(glowCount,d.matrix);
        glows.current.setColorAt(glowCount++,glowColor.setRGB(heat,heat,heat));
      }
      for (const { j, x, z, y, phase } of source.particles) {
      if (heat>.001 && j < settings.flamesPerCell && flameCount<1200) {
        const pulse = .88 + Math.sin(time * 6 + life.id + j) * .12 + Math.sin(time*11+life.id*4+j)*.04;
        const height=4.2*pulse*(.24+.76*heat);
        d.position.set(x, y + height/2, z);
        d.rotation.set(0, Math.PI / 4 + j * 1.15, 0);
        d.scale.set(1.1*(.35+.65*heat), height, 1);
        d.updateMatrix();
        heatAttribute.setX(flameCount,heat);
        flames.current.setMatrixAt(flameCount++, d.matrix);
      }
      if (j < settings.smokePerCell && smokeCount<1200) {
        sampleSmokePuff(lifeSample.smokeTime, phase, puff, lifeSample.smokeStop);
        if (puff.opacity<.003) continue;
        const rise = puff.rise;
        d.position.set(
          x + rise * 0.23,
          y + 3.4 + rise,
          z - rise * 0.12,
        );
        // Camera-facing textured clouds stay soft when the camera moves.
        d.scale.set(puff.width, puff.height, 1);
        d.rotation.set(0, 0, 0);
        d.updateMatrix();
        smokeVisuals.opacity.setX(smokeCount, puff.opacity);
        smoke.current.setMatrixAt(smokeCount++, d.matrix);
      }
      }
    }
    flames.current.count = flameCount;
    smoke.current.count = smokeCount;
    glows.current.count = glowCount;
    flames.current.instanceMatrix.needsUpdate = true;
    smoke.current.instanceMatrix.needsUpdate = true;
    glows.current.instanceMatrix.needsUpdate = true;
    if (glows.current.instanceColor) glows.current.instanceColor.needsUpdate=true;
    heatAttribute.needsUpdate=true;
    smokeVisuals.opacity.needsUpdate = true;
    if (light.current) light.current.intensity=30*maxHeat;
  }, [sources, arrival, dummy, glowColor, lifeSample, puff, flameGeometry, material, smokeVisuals, settings.flamesPerCell, settings.smokePerCell]);
  useLayoutEffect(() => {
    // Includes every grid cell, full smoke rise/drift and particle radius.
    if (flames.current) flames.current.boundingSphere = new Sphere(new Vector3(0, 5, 0), 22);
    if (smoke.current) smoke.current.boundingSphere = new Sphere(new Vector3(0, 10, 0), 40);
    if (glows.current) glows.current.boundingSphere = new Sphere(new Vector3(),16);
    const last=previous.current;
    if (!last || last.tick!==tick || last.history!==history || last.run!==playbackRun) fraction.current=0;
    previous.current={tick,history,run:playbackRun};
    animate(tick+fraction.current);
  }, [animate, tick, history, playbackRun]);
  useFrame((_,delta) => {
    if (playing && !reducedMotion && document.visibilityState!=="hidden" && delta<=2) {
      fraction.current=Math.min(1,fraction.current+delta*speed/(PLAYBACK_STEP_MS/1000));
      animate(tick+fraction.current);
    }
  });
  return (
    <>
      <instancedMesh ref={flames} args={[flameGeometry, material, 1200]} raycast={() => null}/>
      <instancedMesh ref={smoke} args={[smokeVisuals.geometry, smokeVisuals.material, 1200]} raycast={() => null}/>
      <instancedMesh ref={glows} args={[glowGeometry,undefined,400]} raycast={() => null}>
        <meshBasicMaterial color="#ff681c" transparent opacity={.55} depthWrite={false} toneMapped={false} blending={AdditiveBlending}/>
      </instancedMesh>
        <pointLight
          ref={light}
          position={worldPosition(...ignition, 2)}
          color="#ff752e"
          intensity={0}
          distance={8}
          decay={2}
        />
    </>
  );
}

/** One draw per overlay, rather than one draw for each of up to 400 cells. */
function CellOverlay({ cells, kind }: { cells: Cell[]; kind: "fire" | "habitat" }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const dummy = new Object3D();
    dummy.rotation.x = -Math.PI / 2;
    cells.forEach((cell, index) => {
      dummy.position.set(...worldPosition(cell.x, cell.z, .06));
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.count = cells.length;
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [cells]);
  return <instancedMesh ref={mesh} args={[undefined, undefined, 400]} raycast={() => null}>
    {kind === "fire" ? <circleGeometry args={[.55, 16]}/> : <planeGeometry args={[1, 1]}/>}
    <meshBasicMaterial color={kind === "fire" ? "#ff681c" : "#8da432"} transparent opacity={kind === "fire" ? .55 : .12} depthWrite={false} side={DoubleSide} toneMapped={kind !== "fire"}/>
  </instancedMesh>;
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
  fireHistory: FireLife[];
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

export function ForestSceneContent({ frame, fireHistory, water, crew, ignition, label, playing, showHabitat, showGrid, resetKey, focusKey, picking, onPick, portal, overview = false }: ForestSceneProps & { portal: RefObject<HTMLDivElement>; overview?: boolean }) {
  const { settings } = useSceneQuality();
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
    return { points: segments.flat(), cells: frame.cells.filter(cell => cell.protected), center: count ? worldPosition(x / count, z / count, 3.5) : null };
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
    <directionalLight key={settings.shadowSize} position={[-14,26,10]} intensity={2.5} color="#fff1cf" castShadow shadow-mapSize={[settings.shadowSize,settings.shadowSize]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} shadow-camera-far={70} shadow-normalBias={.025}/>
    <Landscape/>
    </>}
    <Terrain cells={frame.cells} showGrid={showGrid} picking={picking} onPick={onPick}/>
    <Forest cells={frame.cells} crew={crew}/>
    <FireEffects history={fireHistory} tick={frame.tick} arrival={crew.arrival} speed={speed} ignition={[fire.x, fire.z]} playing={playing}/>
    {water.spraying && water.target && <WaterEffects target={water.target} source={water.source} playing={playing}/>}
    {!overview && fire.count > 0 && <Html portal={portal} position={worldPosition(fire.x, fire.z, 2.3)} center zIndexRange={[21,1]}><div className="map-label fire-label"><Flame size={14}/>FIRE FRONT · {fire.count} {fire.count === 1 ? "cell" : "cells"}</div></Html>}
    {showHabitat && <>
      {habitat.points.length > 0 && <Line segments points={habitat.points} color="#c9e676" lineWidth={1.5} transparent opacity={.85}/>}
      <CellOverlay cells={habitat.cells} kind="habitat"/>
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

export default function ForestScene(props: ForestSceneProps & { onReady?: () => void }) {
  const portal = useRef<HTMLDivElement>(null!);
  const [contextLost, setContextLost] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { settings, visible } = useSceneQuality();
  const fallback = <SceneReadyFallback onReady={props.onReady}><div className="fallback-map"><p>3D unavailable · live 20 × 20 forest grid</p><button className="btn btn-primary" onClick={() => { setContextLost(false); setAttempt(n => n + 1); }}>Retry 3D view</button><div className="fallback-grid">{props.frame.cells.map(cell => <button key={cell.id} style={{background:palette[cell.state]}} title={`Cell ${cell.z+1}, ${cell.x+1}: ${cell.state}`} disabled={!props.picking || cell.terrain === "non-vegetated"} onClick={() => props.onPick(cell.z,cell.x)}/>)}</div></div></SceneReadyFallback>;
  if (contextLost) return fallback;
  return <div ref={portal} className="scene-canvas" style={{cursor:props.picking ? "crosshair" : "grab"}}>
    <SceneBoundary key={attempt} fallback={fallback}>
      <Canvas eventSource={portal} shadows dpr={settings.dpr} frameloop={!props.active || !visible ? "never" : props.playing ? "always" : "demand"} camera={{position:[8,17,13],fov:50,near:.1,far:160}} gl={{antialias:true}} fallback={fallback} onCreated={({gl}) => {
        gl.domElement.addEventListener("webglcontextlost", event => { event.preventDefault(); setContextLost(true); });
      }}><SceneQualityRuntime playing={props.playing}/><ForestSceneContent {...props} portal={portal}/><SceneReady onReady={props.onReady}/></Canvas>
    </SceneBoundary>
  </div>;
}
