"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { CatmullRomCurve3, InstancedMesh, Object3D, TubeGeometry, Vector3 } from "three";
import { seed, worldPosition } from "./forestGeometry";

export function waterNozzlePosition(target: [number, number], source?: [number, number] | null): [number, number, number] {
  if (source) {
    const base=worldPosition(source[0],source[1],.04),dx=target[0]-source[0],dz=target[1]-source[1],distance=Math.hypot(dx,dz)||1;
    return [base[0]+dx/distance*.85,base[1],base[2]+dz/distance*.85];
  }
  const x = target[0] > 4 ? target[0] - 3.8 : target[0] + 3.8;
  return worldPosition(x, Math.min(19, target[1] + 1.5), .04);
}

export function WaterEffects({ target, source, playing }: { target: [number, number]; source: [number, number] | null; playing: boolean }) {
  const droplets = useRef<InstancedMesh>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const x = target[0], z = target[1];
  const sourceX = source?.[0], sourceZ = source?.[1];
  const spray = useMemo(() => {
    const base = waterNozzlePosition([x, z], sourceX != null && sourceZ != null ? [sourceX, sourceZ] : null);
    const start = new Vector3(...base).add(new Vector3(0, 1.05, 0));
    const end = new Vector3(...worldPosition(x, z, .25));
    const mid = start.clone().lerp(end, .5); mid.y += 1.7;
    const curve = new CatmullRomCurve3([start, mid, end]);
    const geometry = new TubeGeometry(curve, 48, .055, 8, false);
    const truck=sourceX!=null&&sourceZ!=null?new Vector3(...worldPosition(sourceX,sourceZ,.1)):new Vector3(base[0]-.8,base[1]+.06,base[2]+1.3);
    const hose = [truck, new Vector3(base[0],base[1]+.1,base[2]), start];
    return { base, start, end, curve, geometry, hose, angle: Math.atan2(end.x - start.x, end.z - start.z) };
  }, [x, z, sourceX, sourceZ]);
  useEffect(() => () => spray.geometry.dispose(), [spray]);
  const animate = useCallback((time: number) => {
    if (!droplets.current) return;
    const dummy = new Object3D();
    for (let i = 0; i < 144; i++) {
      if (i < 96) {
        const t = (time * .75 + i / 96) % 1;
        const point = spray.curve.getPoint(t);
        const spread = .025 + t * .12;
        dummy.position.set(point.x + Math.sin(i * 7 + time * 9) * spread, point.y + Math.cos(i * 11) * spread, point.z + Math.sin(i * 13) * spread);
        dummy.scale.set(.035, .035 + seed(i * 3) * .04, .035);
      } else {
        const t = (time * .65 + seed(i * 7)) % 1;
        const angle = seed(i * 11) * Math.PI * 2;
        const radius = .18 + t * .85;
        dummy.position.set(spray.end.x + Math.cos(angle) * radius, spray.end.y + Math.sin(t * Math.PI) * .8, spray.end.z + Math.sin(angle) * radius);
        dummy.scale.setScalar(.025 + (1 - t) * .07);
      }
      dummy.updateMatrix(); droplets.current.setMatrixAt(i, dummy.matrix);
    }
    droplets.current.instanceMatrix.needsUpdate = true;
    droplets.current.computeBoundingSphere();
  }, [spray]);
  useLayoutEffect(() => animate(0), [animate]);
  useFrame(({ clock }) => { if (playing&&!reducedMotion) animate(clock.elapsedTime); });
  return <>
    <Line points={spray.hose} color="#254338" lineWidth={3}/>
    <mesh geometry={spray.geometry} raycast={() => null}><meshBasicMaterial color="#a9eeff" transparent opacity={.7} toneMapped={false} depthWrite={false}/></mesh>
    <instancedMesh ref={droplets} args={[undefined, undefined, 144]} raycast={() => null}><sphereGeometry args={[1, 6, 5]}/><meshBasicMaterial color="#e1faff" transparent opacity={.85} toneMapped={false} depthWrite={false}/></instancedMesh>
    <mesh position={[spray.end.x, spray.end.y - .12, spray.end.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}><ringGeometry args={[.18,.7,32]}/><meshBasicMaterial color="#80deef" transparent opacity={.28} depthWrite={false}/></mesh>
    <group position={spray.base} rotation={[0,spray.angle,0]}>
      <mesh position={[0,.58,0]} castShadow><capsuleGeometry args={[.12,.33,4,8]}/><meshStandardMaterial color="#a6ba62" roughness={.8}/></mesh>
      <mesh position={[0,.97,0]} castShadow><sphereGeometry args={[.13,10,8]}/><meshStandardMaterial color="#f0cb67"/></mesh>
      <mesh position={[0,.95,.025]}><cylinderGeometry args={[.17,.17,.045,12]}/><meshStandardMaterial color="#f0cb67"/></mesh>
      {[-1,1].map(side => <mesh key={side} position={[side * .14,.75,.11]} rotation={[.65,0,side * .3]}><capsuleGeometry args={[.045,.19,3,6]}/><meshStandardMaterial color="#a6ba62"/></mesh>)}
      {[-.085,.085].map(side => <mesh key={side} position={[side,.19,0]} castShadow><boxGeometry args={[.1,.35,.12]}/><meshStandardMaterial color="#2d382b"/></mesh>)}
      <mesh position={[0,.7,-.16]}><boxGeometry args={[.2,.28,.1]}/><meshStandardMaterial color="#344c35"/></mesh>
      <mesh position={[0,.89,.22]} rotation={[Math.PI / 2,0,0]}><cylinderGeometry args={[.035,.04,.32,8]}/><meshStandardMaterial color="#a6b6b5" metalness={.65} roughness={.25}/></mesh>
    </group>
  </>;
}
