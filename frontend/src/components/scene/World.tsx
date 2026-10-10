"use client";

import { ContactShadows, Html, OrbitControls, OrthographicCamera, RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useStore } from "@/lib/store";
import { shortId } from "@/lib/format";
import { ForestPlot } from "./ForestPlot";
import { HALF, PLOT_POS, STATION_POS, hash01 } from "./layout";

const HOME_TARGET = new THREE.Vector3(-1, 0, 4);
const HOME_ZOOM = 10.5;
const AZ0 = Math.PI / 4;
const POLAR0 = 0.96;

export function World() {
  const data = useStore((s) => s.data);
  const sim = useStore((s) => s.sim);
  const policy = useStore((s) => s.policy);
  const step = useStore((s) => s.step);
  const selectedId = useStore((s) => s.selectedId);
  const predictions = useStore((s) => s.predictions);
  const picking = useStore((s) => s.pickingIgnition);
  const select = useStore((s) => s.select);
  const setOverride = useStore((s) => s.setOverride);
  const toast = useStore((s) => s.toast);

  const plots = sim?.plots ?? [];
  const pol = sim?.policies[policy];
  const frameIdx = Math.min(step, (pol?.frames.length ?? 1) - 1);
  const assigned = pol?.assigned ?? [];
  const regionOf = (id: string) => data?.incidents.find((i) => i.id === id)?.region ?? "";

  return (
    <>
      <OrthographicCamera makeDefault position={[60, 52, 60]} zoom={HOME_ZOOM} near={-200} far={400} />
      <CameraRig selectedIndex={plots.findIndex((p) => p.incident_id === selectedId)} />
      <hemisphereLight args={["#ffffff", "#d9eadf", 1.6]} />
      <directionalLight position={[30, 50, 18]} intensity={1.5} color="#fffaf0" />
      <directionalLight position={[-30, 20, -20]} intensity={0.35} color="#ede383" />
      <Terrain />
      <RangerStation />
      {plots.map((p, k) => (
        <Path key={p.incident_id} to={PLOT_POS[k]} />
      ))}
      {plots.map((p, k) => {
        const pred = predictions[p.incident_id];
        return (
          <ForestPlot
            key={p.incident_id}
            info={p}
            frame={pol?.frames[frameIdx]?.[k]}
            position={PLOT_POS[k]}
            selected={p.incident_id === selectedId}
            label={shortId(p.incident_id)}
            sublabel={regionOf(p.incident_id)}
            recommendation={pred?.priority.recommendation}
            rank={pred?.priority.rank}
            picking={picking}
            hasTeam={assigned.includes(p.incident_id) && step >= (sim?.response_delay ?? 0)}
            onSelect={() => select(p.incident_id)}
            onPick={(r, c) => {
              setOverride(p.incident_id, { ignition: [[r, c]] });
              useStore.getState().setPickingIgnition(false);
              toast({ tone: "info", title: "Ignition point set", body: `Row ${r + 1}, column ${c + 1}. Run the simulation to apply.` });
            }}
          />
        );
      })}
      {sim &&
        assigned.map((id) => {
          const k = plots.findIndex((p) => p.incident_id === id);
          if (k < 0) return null;
          return <Truck key={`${policy}-${id}`} plot={k} step={step} delay={sim.response_delay} />;
        })}
      <ContactShadows position={[0, -0.27, 0]} scale={110} blur={2.6} far={14} opacity={0.32} frames={1} resolution={512} />
    </>
  );
}

function CameraRig({ selectedIndex }: { selectedIndex: number }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const cmd = useStore((s) => s.cameraCommand);
  const goal = useRef<{ target: THREE.Vector3; zoom: number } | null>({ target: HOME_TARGET.clone(), zoom: HOME_ZOOM });

  useEffect(() => {
    if (selectedIndex >= 0) {
      const [x, z] = PLOT_POS[selectedIndex];
      goal.current = { target: new THREE.Vector3(x * 0.92 - 1, 0, z + 3), zoom: 19 };
    } else {
      goal.current = { target: HOME_TARGET.clone(), zoom: HOME_ZOOM };
    }
  }, [selectedIndex]);

  useEffect(() => {
    const c = controls.current;
    if (!cmd || !c) return;
    const cam = camera as THREE.OrthographicCamera;
    if (cmd.kind === "zoomIn") goal.current = { target: c.target.clone(), zoom: Math.min(cam.zoom * 1.25, 48) };
    if (cmd.kind === "zoomOut") goal.current = { target: c.target.clone(), zoom: Math.max(cam.zoom / 1.25, 8) };
    if (cmd.kind === "reset") {
      goal.current = { target: HOME_TARGET.clone(), zoom: HOME_ZOOM };
      c.setAzimuthalAngle(AZ0);
      c.setPolarAngle(POLAR0);
    }
    if (cmd.kind === "rotateL" || cmd.kind === "rotateR") {
      const a = c.getAzimuthalAngle() + (cmd.kind === "rotateL" ? -1 : 1) * (Math.PI / 8);
      c.setAzimuthalAngle(a);
    }
    c.update();
  }, [cmd, camera]);

  useFrame((_, dt) => {
    const c = controls.current;
    const g = goal.current;
    if (!c || !g) return;
    const cam = camera as THREE.OrthographicCamera;
    const k = 1 - Math.exp(-dt * 5);
    const delta = g.target.clone().sub(c.target).multiplyScalar(k);
    c.target.add(delta);
    cam.position.add(delta);
    cam.zoom += (g.zoom - cam.zoom) * k;
    cam.updateProjectionMatrix();
    c.update();
    if (delta.lengthSq() < 1e-6 && Math.abs(g.zoom - cam.zoom) < 0.01) goal.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={HOME_TARGET.toArray() as [number, number, number]}
      enableDamping
      dampingFactor={0.12}
      minZoom={8}
      maxZoom={48}
      minPolarAngle={0.55}
      maxPolarAngle={1.18}
      minAzimuthAngle={AZ0 - 1.1}
      maxAzimuthAngle={AZ0 + 1.1}
      screenSpacePanning
      onStart={() => (goal.current = null)}
      onChange={() => {
        const c = controls.current;
        if (!c) return;
        // keep the scene in view: clamp the pan target
        const t = c.target;
        const cx = THREE.MathUtils.clamp(t.x, -34, 34);
        const cz = THREE.MathUtils.clamp(t.z, -22, 24);
        if (cx !== t.x || cz !== t.z || t.y !== 0) {
          const d = new THREE.Vector3(cx - t.x, -t.y, cz - t.z);
          t.add(d);
          c.object.position.add(d);
        }
      }}
    />
  );
}

function Terrain() {
  const trees = useMemo(() => {
    // decorative trees on the island rim (outside the simulation plots)
    const out: { x: number; z: number; s: number; k: number }[] = [];
    for (let i = 0; i < 90; i++) {
      const a = hash01(i, 1) * Math.PI * 2;
      const r = 0.82 + hash01(i, 2) * 0.14;
      const x = Math.cos(a) * 46 * r;
      const z = Math.sin(a) * 31 * r;
      out.push({ x, z, s: 0.8 + hash01(i, 3) * 0.7, k: hash01(i, 4) > 0.5 ? 1 : 0 });
    }
    return out;
  }, []);
  return (
    <group>
      {/* ground island */}
      <mesh position={[0, -0.6, 0]} scale={[1, 1, 0.68]}>
        <cylinderGeometry args={[49, 50, 0.9, 72]} />
        <meshStandardMaterial color="#dff2e5" roughness={1} />
      </mesh>
      <mesh position={[0, -1.25, 0]} scale={[1, 1, 0.68]}>
        <cylinderGeometry args={[50, 48, 0.6, 72]} />
        <meshStandardMaterial color="#c3dfcb" roughness={1} />
      </mesh>
      {/* blackwater canal */}
      <Canal />
      {trees.map((t, i) => (
        <group key={i} position={[t.x, -0.15, t.z]} scale={t.s}>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.06, 0.08, 0.4, 5]} />
            <meshStandardMaterial color="#8a6a4c" />
          </mesh>
          {t.k ? (
            <mesh position={[0, 0.8, 0]}>
              <icosahedronGeometry args={[0.5, 0]} />
              <meshStandardMaterial color="#5cbf8c" flatShading />
            </mesh>
          ) : (
            <mesh position={[0, 0.85, 0]}>
              <coneGeometry args={[0.42, 1.2, 6]} />
              <meshStandardMaterial color="#47ad7b" flatShading />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function Canal() {
  const geom = useMemo(() => {
    const pts = [
      new THREE.Vector3(-48, 0, -14),
      new THREE.Vector3(-30, 0, -19),
      new THREE.Vector3(-12, 0, -22),
      new THREE.Vector3(14, 0, -21),
      new THREE.Vector3(34, 0, -15),
      new THREE.Vector3(48, 0, -12),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, 80, 1.15, 6, false);
  }, []);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom} position={[0, -0.6, 0]} scale={[1, 0.12, 1]}>
      <meshStandardMaterial color="#9cc4e4" roughness={0.3} metalness={0.05} />
    </mesh>
  );
}

function Path({ to }: { to: [number, number] }) {
  const geom = useMemo(() => {
    const start = new THREE.Vector3(STATION_POS[0], 0, STATION_POS[1] - 2);
    const end = new THREE.Vector3(to[0] * 0.82, 0, to[1] + HALF + 1.5);
    const mid = new THREE.Vector3((start.x + end.x) / 2, 0, (start.z + end.z) / 2 + 3);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const pts = curve.getPoints(40);
    const shape = new THREE.BufferGeometry();
    const w = 0.75;
    const verts: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const d = b.clone().sub(a).normalize();
      const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(w);
      const p1 = a.clone().add(n), p2 = a.clone().sub(n), p3 = b.clone().add(n), p4 = b.clone().sub(n);
      verts.push(p1.x, 0, p1.z, p2.x, 0, p2.z, p3.x, 0, p3.z, p2.x, 0, p2.z, p4.x, 0, p4.z, p3.x, 0, p3.z);
    }
    shape.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    shape.computeVertexNormals();
    return shape;
  }, [to]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom} position={[0, -0.13, 0]}>
      <meshStandardMaterial color="#efe6d2" roughness={1} side={THREE.DoubleSide} />
    </mesh>
  );
}

function RangerStation() {
  const [x, z] = STATION_POS;
  return (
    <group position={[x, -0.15, z]}>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[5.2, 5.4, 0.2, 40]} />
        <meshStandardMaterial color="#eef3f8" roughness={1} />
      </mesh>
      <RoundedBox args={[4.2, 1.8, 2.8]} radius={0.15} position={[-0.6, 1.05, 0.4]}>
        <meshStandardMaterial color="#ffffff" />
      </RoundedBox>
      <mesh position={[-0.6, 2.2, 0.4]}>
        <boxGeometry args={[4.5, 0.35, 3.1]} />
        <meshStandardMaterial color="#22a06b" />
      </mesh>
      <mesh position={[-0.6, 1.0, 1.82]}>
        <boxGeometry args={[1.0, 1.2, 0.05]} />
        <meshStandardMaterial color="#365004" />
      </mesh>
      {/* watch tower */}
      <mesh position={[2.6, 1.9, -1.2]}>
        <cylinderGeometry args={[0.12, 0.16, 3.6, 6]} />
        <meshStandardMaterial color="#85765e" />
      </mesh>
      <mesh position={[2.6, 3.8, -1.2]}>
        <boxGeometry args={[1.1, 0.6, 1.1]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[2.6, 4.25, -1.2]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.95, 0.5, 4]} />
        <meshStandardMaterial color="#22a06b" />
      </mesh>
      <Html position={[-0.6, 3.1, 0.4]} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
        <div className="whitespace-nowrap rounded-full bg-[var(--surface)]/95 px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-2)] shadow ring-1 ring-[var(--line)]">
          Field team base
        </div>
      </Html>
    </group>
  );
}

function Truck({ plot, step, delay }: { plot: number; step: number; delay: number }) {
  const ref = useRef<THREE.Group>(null);
  const curve = useMemo(() => {
    const to = PLOT_POS[plot];
    const start = new THREE.Vector3(STATION_POS[0] + 1.5, 0.35, STATION_POS[1] - 2);
    const end = new THREE.Vector3(to[0] * 0.82, 0.35, to[1] + HALF + 1.5);
    const mid = new THREE.Vector3((start.x + end.x) / 2, 0.35, (start.z + end.z) / 2 + 3);
    return new THREE.QuadraticBezierCurve3(start, mid, end);
  }, [plot]);
  const prog = useRef(0);
  useFrame((_, dt) => {
    const target = delay <= 0 ? 1 : Math.min(step / delay, 1);
    prog.current += (target - prog.current) * (1 - Math.exp(-dt * 6));
    const g = ref.current;
    if (!g) return;
    const p = curve.getPoint(prog.current);
    const tan = curve.getTangent(Math.min(Math.max(prog.current, 0.001), 0.999));
    g.position.copy(p);
    g.rotation.y = Math.atan2(tan.x, tan.z);
  });
  return (
    <group ref={ref}>
      <RoundedBox args={[1.0, 0.75, 1.9]} radius={0.12} position={[0, 0.25, -0.2]}>
        <meshStandardMaterial color="#ffffff" />
      </RoundedBox>
      <RoundedBox args={[1.0, 0.7, 0.8]} radius={0.12} position={[0, 0.2, 0.95]}>
        <meshStandardMaterial color="#365004" />
      </RoundedBox>
      <mesh position={[0, 0.66, -0.2]}>
        <boxGeometry args={[1.02, 0.08, 1.2]} />
        <meshStandardMaterial color="#925e06" />
      </mesh>
      {[[-0.5, 0.65], [0.5, 0.65], [-0.5, -0.75], [0.5, -0.75]].map(([wx, wz], i) => (
        <mesh key={i} position={[wx, -0.15, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, 0.14, 12]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}
    </group>
  );
}
