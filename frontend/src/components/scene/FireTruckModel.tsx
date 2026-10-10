import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { RoundedBox } from "@react-three/drei";
import { ExtrudeGeometry, Group, Mesh, Shape, type MeshStandardMaterial } from "three";
import { batchStaticMeshes } from "./staticMeshBatch";

const paint = { color: "#991e18", metalness: .15, roughness: .38, clearcoat: .55, clearcoatRoughness: .28 };
const chrome = { color: "#aeb6ba", metalness: .85, roughness: .34 };
const glass = { color: "#273f49", metalness: .25, roughness: .13, clearcoat: 1, clearcoatRoughness: .06 };

/** Cab-over forest appliance: a long equipment body and a raked windshield. */
export function FireTruckModel({ wheels, beacon }: { wheels: RefObject<Group | null>; beacon: RefObject<MeshStandardMaterial | null> }) {
  const source = useRef<Group>(null);
  const cab = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-1.40, .40); shape.lineTo(-1.36, .84);
    shape.lineTo(-1.22, 1.12); shape.lineTo(-.35, 1.12);
    shape.lineTo(-.35, .40); shape.closePath();
    const geometry = new ExtrudeGeometry(shape, { depth: .86, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 2, steps: 1 });
    geometry.rotateY(Math.PI / 2); geometry.translate(-.43, 0, 0);
    return geometry;
  }, []);
  useEffect(() => () => cab.dispose(), [cab]);
  useLayoutEffect(() => {
    if (!source.current) return;
    const targets = [source.current, ...(wheels.current?.children.filter((child): child is Group => child instanceof Group) ?? [])];
    const cleanups = targets.map((target, index) => {
      const result = batchStaticMeshes(target, index === 0 ? wheels.current : null, beacon.current);
      const merged = new Group();
      for (const batch of result.batches) {
        const mesh = new Mesh(batch.geometry, batch.material);
        mesh.castShadow = batch.castShadow;
        mesh.receiveShadow = batch.receiveShadow;
        merged.add(mesh);
      }
      target.add(merged);
      return () => {
        target.remove(merged);
        result.restore();
        result.batches.forEach(batch => { batch.geometry.dispose(); batch.material.dispose(); });
      };
    });
    return () => cleanups.forEach(cleanup => cleanup());
  }, [wheels, beacon]);
  return <group ref={source}>
    <RoundedBox args={[.86, .15, 2.8]} radius={.015} position={[0, .31, 0]} castShadow><meshStandardMaterial color="#23282c" metalness={.55} roughness={.55}/></RoundedBox>
    <RoundedBox args={[.94, .66, 1.7]} radius={.018} smoothness={2} position={[0, .75, -.55]} castShadow><meshPhysicalMaterial {...paint}/></RoundedBox>
    <mesh geometry={cab} castShadow><meshPhysicalMaterial {...paint}/></mesh>
    <RoundedBox args={[.86, .035, .86]} radius={.012} position={[0, 1.14, .77]}><meshStandardMaterial color="#e2e2d8" roughness={.42} metalness={.12}/></RoundedBox>
    <RoundedBox args={[.77, .29, .018]} radius={.008} position={[0, .941, 1.315]} rotation={[-.46, 0, 0]}><meshPhysicalMaterial {...glass}/></RoundedBox>
    <mesh position={[0, .94, 1.331]} rotation={[-.46, 0, 0]}><boxGeometry args={[.015, .29, .012]}/><meshStandardMaterial color="#18252a"/></mesh>
    {[-1, 1].map(side => <group key={side}>
      <RoundedBox args={[.012, .28, .57]} radius={.008} position={[side * .447, .94, .79]}><meshPhysicalMaterial {...glass}/></RoundedBox>
      <mesh position={[side * .459, .94, .67]}><boxGeometry args={[.012, .29, .025]}/><meshStandardMaterial color="#18252a"/></mesh>
      <mesh position={[side * .453, .73, .81]}><boxGeometry args={[.016, .02, .105]}/><meshStandardMaterial {...chrome}/></mesh>
      <mesh position={[side * .443, .65, .44]}><boxGeometry args={[.012, .36, .014]}/><meshStandardMaterial color="#6d1714"/></mesh>
      <mesh position={[side * .5, .48, .88]}><boxGeometry args={[.16, .05, .56]}/><meshStandardMaterial {...chrome}/></mesh>
      <mesh position={[side * .48, .87, 1.14]}><boxGeometry args={[.18, .018, .016]}/><meshStandardMaterial color="#262d31"/></mesh>
      <RoundedBox args={[.04, .19, .09]} radius={.01} position={[side * .58, .91, 1.14]}><meshStandardMaterial color="#202b30" roughness={.45}/></RoundedBox>
      <mesh position={[side * .606, .91, 1.14]}><boxGeometry args={[.008, .16, .064]}/><meshStandardMaterial {...chrome}/></mesh>
      <mesh position={[side * .477, .52, -.02]}><boxGeometry args={[.015, .05, 2.69]}/><meshStandardMaterial color="#e2e2c4" roughness={.55}/></mesh>
      {[-1.09, -.55, -.01].map(z => <group key={z} position={[side * .477, .81, z]}>
        <RoundedBox args={[.015, .4, .47]} radius={.006}><meshStandardMaterial {...chrome} roughness={.52}/></RoundedBox>
        {Array.from({ length: 11 }, (_, i) => <mesh key={i} position={[side * .013, -.18 + i * .035, 0]}><boxGeometry args={[.003, .007, .446]}/><meshStandardMaterial color="#68747a" metalness={.55} roughness={.6}/></mesh>)}
        <mesh position={[side * .017, -.15, 0]}><boxGeometry args={[.012, .016, .11]}/><meshStandardMaterial color="#273036"/></mesh>
      </group>)}
      <mesh position={[side * .31, .52, 1.407]}><boxGeometry args={[.17, .075, .018]}/><meshStandardMaterial color="#d9e3e4" emissive="#b6c5c4" emissiveIntensity={.22} roughness={.2}/></mesh>
      <mesh position={[side * .414, .55, 1.402]}><boxGeometry args={[.03, .045, .025]}/><meshStandardMaterial color="#eab148" roughness={.4}/></mesh>
      <mesh position={[side * .38, .59, -1.416]}><boxGeometry args={[.09, .115, .018]}/><meshStandardMaterial color="#922016" emissive="#701709" emissiveIntensity={.12}/></mesh>
      <mesh position={[side * .42, 1.10, -.55]}><boxGeometry args={[.018, .065, 1.58]}/><meshStandardMaterial {...chrome}/></mesh>
      {[-.84, .92].map(z => <RoundedBox key={z} args={[.16, .09, .6]} radius={.02} position={[side * .46, .48, z]}><meshStandardMaterial color="#232b30" roughness={.75}/></RoundedBox>)}
      <mesh position={[side * .30, 1.185, .76]}><cylinderGeometry args={[.064, .064, .1, 24]}/><meshStandardMaterial ref={side === 1 ? beacon : undefined} color="#1b6394" emissive="#17699b" emissiveIntensity={.3} roughness={.24}/></mesh>
    </group>)}
    <RoundedBox args={[1, .11, .13]} radius={.018} position={[0, .35, 1.43]}><meshStandardMaterial color="#a3aaad" metalness={.75} roughness={.46}/></RoundedBox>
    <RoundedBox args={[.98, .1, .1]} radius={.012} position={[0, .34, -1.46]}><meshStandardMaterial {...chrome}/></RoundedBox>
    <mesh position={[0, .605, 1.396]}><boxGeometry args={[.38, .21, .018]}/><meshStandardMaterial color="#1a2328" roughness={.6}/></mesh>
    {Array.from({ length: 5 }, (_, i) => <mesh key={i} position={[0, .518 + i * .041, 1.411]}><boxGeometry args={[.36, .008, .012]}/><meshStandardMaterial {...chrome}/></mesh>)}
    <mesh position={[0, .365, 1.504]}><boxGeometry args={[.2, .052, .008]}/><meshStandardMaterial color="#e6e5d7"/></mesh>
    {[-.19, .19].map(x => <mesh key={x} position={[x, .862, 1.36]} rotation={[0, 0, -.18]}><boxGeometry args={[.24, .009, .009]}/><meshStandardMaterial color="#222b30"/></mesh>)}
    <group position={[0, 1.12, -.55]}>
      {[-.19, .19].map(x => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[.023, .024, 1.59]}/><meshStandardMaterial {...chrome}/></mesh>)}
      {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[0, 0, -.715 + i * .13]}><boxGeometry args={[.38, .018, .018]}/><meshStandardMaterial {...chrome}/></mesh>)}
    </group>
    <group position={[0, .8, -1.423]}>
      {[.1, .13, .16].map(radius => <mesh key={radius}><torusGeometry args={[radius, .018, 8, 32]}/><meshStandardMaterial color="#a99772" roughness={.83}/></mesh>)}
      <mesh position={[.24, -.13, .01]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.035, .035, .09, 12]}/><meshStandardMaterial {...chrome}/></mesh>
    </group>
    <group ref={wheels}>
      {[-.49, .49].flatMap(x => [-.84, .92].map(z => <group key={`${x}:${z}`} position={[x, .27, z]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[.27, .27, .19, 40]}/><meshStandardMaterial color="#171b1e" roughness={.94}/></mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[.219, .047, 10, 40]}/><meshStandardMaterial color="#25292b" roughness={.89}/></mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.15, .15, .20, 32]}/><meshStandardMaterial color="#7f898e" metalness={.75} roughness={.4}/></mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[.145, .013, 8, 32]}/><meshStandardMaterial {...chrome}/></mesh>
        {Array.from({ length: 8 }, (_, i) => <group key={i} rotation={[i * Math.PI / 4, 0, 0]}>
          <mesh position={[Math.sign(x) * .104, .084, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.017, .017, .008, 8]}/><meshStandardMaterial color="#283238" metalness={.5}/></mesh>
        </group>)}
        {Array.from({ length: 24 }, (_, i) => <group key={i} rotation={[i * Math.PI / 12, 0, 0]}>
          <mesh position={[0, .268, 0]} rotation={[0, .14, 0]}><boxGeometry args={[.19, .01, .028]}/><meshStandardMaterial color="#2b2e30" roughness={1}/></mesh>
        </group>)}
        <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[.051, .051, .217, 16]}/><meshStandardMaterial {...chrome}/></mesh>
      </group>))}
    </group>
  </group>;
}
