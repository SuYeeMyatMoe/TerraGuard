"use client";

import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { Group, MeshStandardMaterial } from "three";
import { Truck } from "lucide-react";
import { getCrewPose, PLAYBACK_STEP_MS, type CrewPlan } from "@/lib/crewMotion";
import { worldPosition } from "./forestGeometry";
import { useStore } from "@/lib/store";

export function CrewVehicle({ plan, tick, playing, speed, spraying, portal }: { plan:CrewPlan; tick:number; playing:boolean; speed:number; spraying:boolean; portal:RefObject<HTMLDivElement> }) {
  const playbackRun=useStore(s=>s.playbackRun);
  const vehicle=useRef<Group>(null),wheels=useRef<Group>(null),beacon=useRef<MeshStandardMaterial>(null);
  const fraction=useRef(0),previous=useRef<[number,number]>([0,0]);
  const route=useMemo(()=>plan.route.map(point=>worldPosition(...point,.12)),[plan]);
  useLayoutEffect(()=>{
    fraction.current=0;
    const pose=getCrewPose(plan,tick);
    if (!vehicle.current) return;
    vehicle.current.position.set(...worldPosition(...pose.position,.08));
    vehicle.current.rotation.y=pose.heading;
    previous.current=pose.position;
  },[plan,tick,playbackRun]);
  useFrame(({clock},delta)=>{
    if (!vehicle.current) return;
    if (playing) fraction.current=Math.min(1,fraction.current+delta*speed/(PLAYBACK_STEP_MS/1000));
    const pose=getCrewPose(plan,tick+fraction.current);
    const position=worldPosition(...pose.position,.08);
    vehicle.current.position.set(...position);
    const difference=Math.atan2(Math.sin(pose.heading-vehicle.current.rotation.y),Math.cos(pose.heading-vehicle.current.rotation.y));
    vehicle.current.rotation.y+=difference*Math.min(1,delta*8);
    const traveled=Math.hypot(pose.position[0]-previous.current[0],pose.position[1]-previous.current[1]);
    wheels.current?.children.forEach(wheel=>{wheel.rotation.x+=traveled/.16;});
    previous.current=pose.position;
    if (beacon.current) beacon.current.emissiveIntensity=(playing||spraying)?1.1+Math.sin(clock.elapsedTime*12)*.8:.35;
  });
  if (!plan.assigned) return null;
  const arrived=plan.arrival!=null&&tick>=plan.arrival;
  return <>
    {route.length>1&&<Line points={route} color="#d5dfa7" dashed dashSize={.22} gapSize={.14} lineWidth={1.2} transparent opacity={.65}/>}
    <group ref={vehicle} scale={1.3}>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,.015,0]} raycast={()=>null}><ringGeometry args={[.62,.68,48]}/><meshBasicMaterial color="#c4d884" transparent opacity={.8}/></mesh>
      <group position={[0,.26,0]}>
        <mesh castShadow><boxGeometry args={[.7,.35,1.45]}/><meshStandardMaterial color="#ad432f" roughness={.48} metalness={.2}/></mesh>
        <mesh position={[0,.3,.35]} castShadow><boxGeometry args={[.66,.3,.58]}/><meshStandardMaterial color="#f0e9d2" roughness={.5}/></mesh>
        <mesh position={[0,.33,.65]}><boxGeometry args={[.54,.21,.025]}/><meshStandardMaterial color="#304f53" metalness={.25} roughness={.3}/></mesh>
        <mesh position={[0,.28,-.36]} castShadow><boxGeometry args={[.59,.23,.65]}/><meshStandardMaterial color="#e4e2ca" roughness={.5} metalness={.3}/></mesh>
        {[-1,1].map(side=><group key={side}>
          <mesh position={[side*.357,.13,-.1]}><boxGeometry args={[.018,.075,1.04]}/><meshStandardMaterial color="#ede383"/></mesh>
          <mesh position={[side*.35,.34,.35]}><boxGeometry args={[.018,.16,.33]}/><meshStandardMaterial color="#304f53" roughness={.3}/></mesh>
          <mesh position={[side*.24,-.01,.74]}><boxGeometry args={[.16,.1,.025]}/><meshBasicMaterial color="#fff0b9" toneMapped={false}/></mesh>
        </group>)}
        <mesh position={[0,-.13,.75]}><boxGeometry args={[.75,.09,.08]}/><meshStandardMaterial color="#404842" metalness={.6}/></mesh>
        <mesh position={[0,.49,.35]}><boxGeometry args={[.45,.07,.12]}/><meshStandardMaterial ref={beacon} color="#74c7db" emissive="#4ab1d6" emissiveIntensity={1.4} toneMapped={false}/></mesh>
        <group ref={wheels}>
          {[-.38,.38].flatMap(x=>[-.48,.47].map(z=><group key={`${x}:${z}`} position={[x,-.13,z]}>
            <mesh rotation={[0,0,Math.PI/2]} castShadow><cylinderGeometry args={[.17,.17,.11,14]}/><meshStandardMaterial color="#202820" roughness={.9}/></mesh>
            <mesh rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.085,.085,.12,10]}/><meshStandardMaterial color="#b8c4b2" metalness={.5}/></mesh>
            <mesh><boxGeometry args={[.125,.025,.14]}/><meshStandardMaterial color="#73856a"/></mesh>
          </group>))}
        </group>
      </group>
      <Html portal={portal} position={[0,1.35,0]} center zIndexRange={[22,1]}><div className="map-label ranger-label"><Truck size={13}/>Crew 01 · {spraying?"Water response":arrived?"On site":"En route"}</div></Html>
    </group>
  </>;
}
