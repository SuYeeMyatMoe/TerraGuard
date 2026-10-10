import { Environment, Lightformer } from "@react-three/drei";

/** Local sky and sun reflections for glass, paint and polished equipment. */
export function SceneReflections() {
  return <Environment resolution={128} frames={1} environmentIntensity={.4}>
    <color attach="background" args={["#b7d1de"]}/>
    <Lightformer form="rect" color="#f5f6ed" intensity={2} position={[0, 12, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[30, 30, 1]}/>
    <Lightformer form="rect" color="#fff0ce" intensity={4} position={[-12, 8, 8]} rotation={[0, Math.PI / 2, 0]} scale={[12, 8, 1]}/>
    <Lightformer form="rect" color="#3e5735" intensity={.7} position={[0, -8, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[40, 40, 1]}/>
  </Environment>;
}
