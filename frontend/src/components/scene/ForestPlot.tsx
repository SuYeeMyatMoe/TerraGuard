"use client";

import { Html, Line } from "@react-three/drei";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { PlotInfo, Recommendation } from "@/lib/types";
import { GRID, HALF, STATE, cellToLocal, decode, hash01 } from "./layout";

const N = GRID * GRID;
const tmp = new THREE.Object3D();
const col = new THREE.Color();

const GROUND = {
  empty: new THREE.Color("#e8f1e6"),
  healthy: new THREE.Color("#c9e9d3"),
  healthyProtected: new THREE.Color("#b6e2c5"),
  burning: new THREE.Color("#ffb37a"),
  burned: new THREE.Color("#5d636b"),
  intervened: new THREE.Color("#bdeef6"),
};
const FOLIAGE = ["#34a56e", "#44b87e", "#2c9963", "#5cc690", "#3aae78", "#7ccf9f"].map((c) => new THREE.Color(c));
const FOLIAGE_BURNING = new THREE.Color("#ff8a35");
const FOLIAGE_BURNED = new THREE.Color("#3f444b");
const FOLIAGE_INTERVENED = new THREE.Color("#4fb7b0");

const REC_COLOR: Record<Recommendation, string> = { INSPECT: "#ff8a35", RECHECK: "#2563eb", MONITOR: "#94a3b8" };

interface TreeSlot {
  cell: number;
  x: number;
  z: number;
  s: number;
  rot: number;
  kind: 0 | 1; // 0 = conifer cone, 1 = broadleaf
  shade: number;
}

export function ForestPlot({
  info,
  frame,
  position,
  selected,
  label,
  sublabel,
  recommendation,
  rank,
  picking,
  hasTeam,
  onSelect,
  onPick,
}: {
  info: PlotInfo;
  frame: string | undefined;
  position: [number, number];
  selected: boolean;
  label: string;
  sublabel: string;
  recommendation?: Recommendation;
  rank?: number;
  picking: boolean;
  hasTeam: boolean;
  onSelect: () => void;
  onPick: (r: number, c: number) => void;
}) {
  const fuel = useMemo(() => decode(info.fuel), [info.fuel]);
  const prot = useMemo(() => decode(info.protected), [info.protected]);
  const state = useMemo(() => (frame ? decode(frame) : fuel.map((f) => (f > 0 ? 1 : 0))), [frame, fuel]);

  // tree placement: 1-2 trees per vegetated cell, jittered, varied size & species
  const trees = useMemo(() => {
    const out: TreeSlot[] = [];
    for (let i = 0; i < N; i++) {
      const f = fuel[i];
      if (f === 0) continue;
      const r = Math.floor(i / GRID);
      const c = i % GRID;
      const [lx, lz] = cellToLocal(r, c);
      const count = f >= 8 && hash01(i, 3) > 0.55 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const jx = (hash01(i, 10 + k) - 0.5) * (count === 2 ? 0.75 : 0.45);
        const jz = (hash01(i, 20 + k) - 0.5) * (count === 2 ? 0.75 : 0.45);
        out.push({
          cell: i,
          x: lx + jx + (count === 2 ? (k ? 0.18 : -0.18) : 0),
          z: lz + jz,
          s: (0.5 + (f / 9) * 0.38) * (0.8 + hash01(i, 30 + k) * 0.35) * (count === 2 ? 0.75 : 1),
          rot: hash01(i, 40 + k) * Math.PI * 2,
          kind: prot[i] ? 1 : hash01(i, 50 + k) > 0.55 ? 1 : 0,
          shade: Math.floor(hash01(i, 60 + k) * FOLIAGE.length),
        });
      }
    }
    return out;
  }, [fuel, prot]);
  const cones = useMemo(() => trees.filter((t) => t.kind === 0), [trees]);
  const leafy = useMemo(() => trees.filter((t) => t.kind === 1), [trees]);

  const groundRef = useRef<THREE.InstancedMesh>(null);
  const coneRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const flameRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);

  // static ground tile transforms
  useLayoutEffect(() => {
    const g = groundRef.current;
    if (!g) return;
    for (let i = 0; i < N; i++) {
      const [lx, lz] = cellToLocal(Math.floor(i / GRID), i % GRID);
      tmp.position.set(lx, 0.06, lz);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      g.setMatrixAt(i, tmp.matrix);
    }
    g.instanceMatrix.needsUpdate = true;
  }, []);

  // trees + ground colours follow the backend frame
  useLayoutEffect(() => {
    const g = groundRef.current;
    if (g) {
      for (let i = 0; i < N; i++) {
        const st = state[i];
        const c =
          st === STATE.EMPTY
            ? GROUND.empty
            : st === STATE.BURNING
              ? GROUND.burning
              : st === STATE.BURNED
                ? GROUND.burned
                : st === STATE.INTERVENED
                  ? GROUND.intervened
                  : prot[i]
                    ? GROUND.healthyProtected
                    : GROUND.healthy;
        g.setColorAt(i, c);
      }
      if (g.instanceColor) g.instanceColor.needsUpdate = true;
    }
    const place = (mesh: THREE.InstancedMesh | null, list: TreeSlot[], foliage: boolean, yBase: number) => {
      if (!mesh) return;
      list.forEach((t, k) => {
        const st = state[t.cell];
        const burned = st === STATE.BURNED;
        const sy = burned ? 0.55 : 1;
        tmp.position.set(t.x, yBase * t.s * sy + 0.1, t.z);
        tmp.rotation.set(0, t.rot, 0);
        tmp.scale.set(t.s * (burned ? 0.7 : 1), t.s * sy, t.s * (burned ? 0.7 : 1));
        tmp.updateMatrix();
        mesh.setMatrixAt(k, tmp.matrix);
        if (foliage) {
          col.copy(
            st === STATE.BURNING
              ? FOLIAGE_BURNING
              : burned
                ? FOLIAGE_BURNED
                : st === STATE.INTERVENED
                  ? FOLIAGE_INTERVENED
                  : FOLIAGE[t.shade],
          );
          mesh.setColorAt(k, col);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    place(coneRef.current, cones, true, 0.95);
    place(leafRef.current, leafy, true, 0.95);
    place(trunkRef.current, trees, false, 0.22);
  }, [state, cones, leafy, trees, prot]);

  // flames on burning cells (animated flicker, cheap)
  const burningCells = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < N; i++) if (state[i] === STATE.BURNING) out.push(i);
    return out;
  }, [state]);

  useFrame(({ clock }) => {
    const fm = flameRef.current;
    const gm = glowRef.current;
    if (!fm || !gm) return;
    const t = clock.elapsedTime;
    burningCells.forEach((i, k) => {
      const [lx, lz] = cellToLocal(Math.floor(i / GRID), i % GRID);
      const f = 0.75 + 0.25 * Math.sin(t * 9 + i * 1.7) + 0.1 * Math.sin(t * 23 + i);
      tmp.position.set(lx + (hash01(i, 70) - 0.5) * 0.3, 0.55 + f * 0.35, lz + (hash01(i, 71) - 0.5) * 0.3);
      tmp.rotation.set(0, t * 0.6 + i, 0);
      tmp.scale.set(0.55, f * 1.15, 0.55);
      tmp.updateMatrix();
      fm.setMatrixAt(k, tmp.matrix);
      tmp.position.set(lx, 0.13, lz);
      tmp.rotation.set(-Math.PI / 2, 0, 0);
      const gs = 1.5 + 0.2 * Math.sin(t * 5 + i);
      tmp.scale.set(gs, gs, gs);
      tmp.updateMatrix();
      gm.setMatrixAt(k, tmp.matrix);
    });
    fm.count = burningCells.length;
    gm.count = burningCells.length;
    fm.instanceMatrix.needsUpdate = true;
    gm.instanceMatrix.needsUpdate = true;
  });

  // protected-area outline (cell edges between protected and non-protected cells)
  const outline = useMemo(() => {
    const segs: [number, number, number][][] = [];
    const isP = (r: number, c: number) => r >= 0 && r < GRID && c >= 0 && c < GRID && prot[r * GRID + c] === 1;
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++) {
        if (!isP(r, c)) continue;
        const [x, z] = cellToLocal(r, c);
        const y = 0.16;
        if (!isP(r - 1, c)) segs.push([[x - 0.5, y, z - 0.5], [x + 0.5, y, z - 0.5]]);
        if (!isP(r + 1, c)) segs.push([[x - 0.5, y, z + 0.5], [x + 0.5, y, z + 0.5]]);
        if (!isP(r, c - 1)) segs.push([[x - 0.5, y, z - 0.5], [x - 0.5, y, z + 0.5]]);
        if (!isP(r, c + 1)) segs.push([[x + 0.5, y, z - 0.5], [x + 0.5, y, z + 0.5]]);
      }
    return segs;
  }, [prot]);
  const protCentroid = useMemo(() => {
    let sr = 0, sc = 0, n = 0;
    for (let i = 0; i < N; i++) if (prot[i]) { sr += Math.floor(i / GRID); sc += i % GRID; n++; }
    return n ? cellToLocal(sr / n, sc / n) : null;
  }, [prot]);

  const [hover, setHover] = useState<number | null>(null);
  const [hoverPlot, setHoverPlot] = useState(false);
  useEffect(() => {
    document.body.style.cursor = hoverPlot ? (picking && selected ? "crosshair" : "pointer") : "auto";
    return () => {
      document.body.style.cursor = "auto";
    };
  }, [hoverPlot, picking, selected]);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId != null) setHover(e.instanceId);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (picking && selected && e.instanceId != null) {
      const fi = e.instanceId;
      if (fuel[fi] > 0) onPick(Math.floor(fi / GRID), fi % GRID);
      return;
    }
    onSelect();
  };

  const ign = info.ignition[0];
  const [bx, bz] = ign ? cellToLocal(ign[0], ign[1]) : [0, 0];
  const beaconColor = recommendation ? REC_COLOR[recommendation] : "#2563eb";
  const windRad = ((info.wind_dir_deg + 180) % 360) * (Math.PI / 180); // direction wind blows TO
  const wx = Math.sin(windRad);
  const wz = -Math.cos(windRad);

  return (
    <group position={[position[0], 0, position[1]]}>
      {/* plot base slab */}
      <mesh position={[0, -0.12, 0]} receiveShadow>
        <boxGeometry args={[GRID + 1.4, 0.3, GRID + 1.4]} />
        <meshStandardMaterial color={selected ? "#dbeafe" : "#e3efe6"} roughness={1} />
      </mesh>
      {selected && (
        <Line
          points={[
            [-HALF - 1.2, 0.05, -HALF - 1.2], [HALF + 1.2, 0.05, -HALF - 1.2], [HALF + 1.2, 0.05, HALF + 1.2],
            [-HALF - 1.2, 0.05, HALF + 1.2], [-HALF - 1.2, 0.05, -HALF - 1.2],
          ]}
          color="#2563eb"
          lineWidth={2}
        />
      )}
      {/* ground cells */}
      <instancedMesh
        ref={groundRef}
        args={[undefined, undefined, N]}
        onPointerMove={onMove}
        onPointerOver={() => setHoverPlot(true)}
        onPointerOut={() => {
          setHoverPlot(false);
          setHover(null);
        }}
        onClick={onClick}
      >
        <boxGeometry args={[0.94, 0.12, 0.94]} />
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      {/* trees */}
      <instancedMesh ref={trunkRef} args={[undefined, undefined, Math.max(trees.length, 1)]} raycast={() => null}>
        <cylinderGeometry args={[0.05, 0.07, 0.44, 5]} />
        <meshStandardMaterial color="#8a6a4c" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={coneRef} args={[undefined, undefined, Math.max(cones.length, 1)]} raycast={() => null}>
        <coneGeometry args={[0.36, 1.1, 6]} />
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
      <instancedMesh ref={leafRef} args={[undefined, undefined, Math.max(leafy.length, 1)]} raycast={() => null}>
        <icosahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
      {/* fire */}
      <instancedMesh ref={glowRef} args={[undefined, undefined, N]} raycast={() => null} frustumCulled={false}>
        <circleGeometry args={[0.5, 20]} />
        <meshBasicMaterial color="#ff8a35" transparent opacity={0.28} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={flameRef} args={[undefined, undefined, N]} raycast={() => null} frustumCulled={false}>
        <coneGeometry args={[0.22, 0.7, 5]} />
        <meshBasicMaterial color="#ff7a1a" toneMapped={false} />
      </instancedMesh>
      {/* protected habitat outline */}
      {outline.map((pts, k) => (
        <Line key={k} points={pts} color="#16a34a" lineWidth={1.6} dashed dashSize={0.3} gapSize={0.18} />
      ))}
      {protCentroid && selected && (
        <Html position={[protCentroid[0], 0.6, protCentroid[1]]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-full bg-white/95 px-2 py-0.5 text-[10.5px] font-semibold text-[var(--green-700)] shadow ring-1 ring-[var(--green-200)]">
            Protected habitat
          </div>
        </Html>
      )}
      {/* hover / ignition picker highlight */}
      {hover != null && (picking ? selected : true) && (
        <mesh position={[cellToLocal(Math.floor(hover / GRID), hover % GRID)[0], 0.15, cellToLocal(Math.floor(hover / GRID), hover % GRID)[1]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[0.98, 0.98]} />
          <meshBasicMaterial color={picking && selected ? "#ff8a35" : "#2563eb"} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
      {/* wind arrow */}
      <group position={[(-HALF - 2.6) * 1, 0.1, HALF + 0.5]} rotation={[0, Math.atan2(wx, wz), 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <circleGeometry args={[1.1, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
        </mesh>
        <mesh position={[0, 0.05, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.32, 0.6, 3]} />
          <meshBasicMaterial color="#06b6d4" />
        </mesh>
        <mesh position={[0, 0.05, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.6, 6]} />
          <meshBasicMaterial color="#06b6d4" />
        </mesh>
      </group>
      {/* incident beacon */}
      <Beacon position={[bx, 0, bz]} color={beaconColor} selected={selected} onClick={onSelect} hasTeam={hasTeam} />
      <Html position={[bx, selected ? 5.4 : 4.6, bz]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2.5 py-1 shadow-md ring-1 transition-all ${
            selected ? "ring-[var(--blue)] scale-105" : "ring-[var(--line)] opacity-90"
          }`}
        >
          {rank != null && (
            <span className="grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: beaconColor }}>
              {rank}
            </span>
          )}
          <span className="text-[11.5px] font-bold text-[var(--ink)]">{label}</span>
          <span className="text-[11px] font-medium text-[var(--ink-2)]">{sublabel}</span>
        </div>
      </Html>
    </group>
  );
}

function Beacon({
  position,
  color,
  selected,
  onClick,
  hasTeam,
}: {
  position: [number, number, number];
  color: string;
  selected: boolean;
  onClick: () => void;
  hasTeam: boolean;
}) {
  const head = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (head.current) head.current.position.y = (selected ? 3.5 : 3.0) + Math.sin(t * 2) * 0.12;
    if (ring.current) {
      const k = (t * 0.8) % 1;
      ring.current.scale.setScalar(0.6 + k * 2.2);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.45;
    }
  });
  return (
    <group position={position} scale={1.45}>
      <group
        ref={head}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <mesh position={[0, 0.55, 0]}>
          <sphereGeometry args={[0.62, 24, 16]} />
          <meshStandardMaterial color={color} roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.12, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.5, 1.0, 24]} />
          <meshStandardMaterial color={color} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.58, 0.45]}>
          <sphereGeometry args={[0.24, 16, 12]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        {hasTeam && (
          <mesh position={[0, 0.58, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.86, 0.07, 8, 32]} />
            <meshBasicMaterial color="#06b6d4" />
          </mesh>
        )}
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.17, 0]} raycast={() => null}>
        <ringGeometry args={[0.55, 0.75, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}
