"use client";

import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { Group, MeshStandardMaterial } from "three";
import { Truck } from "lucide-react";
import { getCrewPose, PLAYBACK_STEP_MS, type CrewPlan } from "@/lib/crewMotion";
import { worldPosition } from "./forestGeometry";
import { useStore } from "@/lib/store";
import { FireTruckModel } from "./FireTruckModel";

export function CrewVehicle({ plan, tick, playing, speed, spraying, portal, label = "Field crew", scale = 1.3, showLabel = true }: { plan:CrewPlan; tick:number; playing:boolean; speed:number; spraying:boolean; portal:RefObject<HTMLDivElement>; label?:string; scale?:number; showLabel?:boolean }) {
  const gl = useThree(s => s.gl);
  const playbackRun=useStore(s=>s.playbackRun);
  const vehicle=useRef<Group>(null),wheels=useRef<Group>(null),beacon=useRef<MeshStandardMaterial>(null);
  const fraction=useRef(0),previous=useRef<[number,number]>([0,0]);
  const lastFrame = useRef(0);
  const route=useMemo(()=>plan.route.map(point=>worldPosition(...point,.12)),[plan]);
  useLayoutEffect(()=>{
    fraction.current=0;
    lastFrame.current=performance.now();
    const pose=getCrewPose(plan,tick);
    if (!vehicle.current) return;
    vehicle.current.position.set(...worldPosition(...pose.position,.08));
    vehicle.current.rotation.y=pose.heading;
    previous.current=pose.position;
  },[plan,tick,playbackRun]);
  useLayoutEffect(() => { lastFrame.current=performance.now(); }, [playing]);
  useFrame(({clock})=>{
    if (!vehicle.current) return;
    const now=performance.now(),delta=Math.max(0,(now-lastFrame.current)/1000);
    lastFrame.current=now;
    if (playing) fraction.current=Math.min(1,fraction.current+delta*speed/(PLAYBACK_STEP_MS/1000));
    const pose=getCrewPose(plan,tick+fraction.current);
    const position=worldPosition(...pose.position,.08);
    vehicle.current.position.set(...position);
    const difference=Math.atan2(Math.sin(pose.heading-vehicle.current.rotation.y),Math.cos(pose.heading-vehicle.current.rotation.y));
    vehicle.current.rotation.y+=difference*Math.min(1,delta*8);
    const traveled=Math.hypot(pose.position[0]-previous.current[0],pose.position[1]-previous.current[1]);
    if (traveled > .00001 || Math.abs(difference) > .0001) gl.shadowMap.needsUpdate = true;
    wheels.current?.children.forEach(wheel=>{wheel.rotation.x+=traveled/(.27*scale);});
    previous.current=pose.position;
    if (beacon.current) beacon.current.emissiveIntensity=(playing||spraying)?.35+Math.sin(clock.elapsedTime*12)*.25:.12;
  });
  if (!plan.assigned) return null;
  const arrived=plan.arrival!=null&&tick>=plan.arrival;
  return <>
    {route.length>1&&<Line points={route} color="#d5dfa7" dashed dashSize={.22} gapSize={.14} lineWidth={1.2} transparent opacity={.65}/>}
    <group ref={vehicle} scale={scale}>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,.015,0]} raycast={()=>null}><ringGeometry args={[1.25,1.28,64]}/><meshBasicMaterial color="#c4d884" transparent opacity={.35}/></mesh>
      <FireTruckModel wheels={wheels} beacon={beacon}/>
      {showLabel && <Html portal={portal} position={[0,1.65,0]} center zIndexRange={[22,1]}><div className="map-label ranger-label" aria-label={`${label}: ${spraying ? "Water response" : arrived ? "On site" : "En route"}`}><Truck size={10}/>{label.replace("Crew ", "")} · {spraying?"Spraying":arrived?"On site":"En route"}</div></Html>}
    </group>
  </>;
}
