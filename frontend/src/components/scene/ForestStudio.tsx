"use client";

import { useMemo, useState } from "react";
import { Crosshair, Flame, Grid2X2, Layers, Leaf, Maximize2, Minimize2, Minus, Plus, RotateCcw, Trees } from "lucide-react";
import { useStore } from "@/lib/store";
import { shortId } from "@/lib/format";
import { toForestFrame } from "@/lib/forestFrame";
import ForestScene from "./ForestScene";

export function ForestStudio({ expanded, onExpand }: { expanded: boolean; onExpand: () => void }) {
  const data = useStore(s => s.data);
  const sim = useStore(s => s.sim);
  const policy = useStore(s => s.policy);
  const step = useStore(s => s.step);
  const playing = useStore(s => s.playing);
  const selectedId = useStore(s => s.selectedId);
  const camera = useStore(s => s.camera);
  const picking = useStore(s => s.pickingIgnition);
  const [showGrid, setGrid] = useState(false);
  const [showHabitat, setHabitat] = useState(true);
  const [resetKey, setReset] = useState(0);
  const [focusKey, setFocus] = useState(0);
  const selectedIndex = sim?.plots.findIndex(p => p.incident_id === selectedId) ?? -1;
  const index = selectedIndex >= 0 ? selectedIndex : Math.max(0, sim?.plots.findIndex(p => p.incident_id === sim.ai_order[0]) ?? 0);
  const plot = sim?.plots[index];
  const result = sim ? (policy === "coordinator" ? sim.policies.coordinator : sim.policies[policy]) : undefined;
  const frame = useMemo(() => {
    if (!plot || !result) return null;
    try { return { value: toForestFrame(plot, result, index, step), error: null }; }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : "Invalid forest frame." }; }
  }, [plot, result, index, step]);
  const incident = data?.incidents.find(i => i.id === plot?.incident_id);
  return <section className="forest-stage" aria-label="Interactive forest simulation">
    {frame?.value && plot && <ForestScene frame={frame.value} ignition={plot.ignition} label={incident ? shortId(incident.id) : "Forest plot"} playing={playing} active={true} showHabitat={showHabitat} showGrid={showGrid} resetKey={resetKey} focusKey={focusKey} picking={picking && selectedId === plot.incident_id} onPick={(row, col) => {
      if (plot.fuel[row * 20 + col] === "0") return;
      const store = useStore.getState();
      store.setOverride(plot.incident_id, { ignition: [[row, col]] });
      store.setPickingIgnition(false);
      store.toast({ tone: "info", title: "Ignition point set", body: `Row ${row + 1}, column ${col + 1}. Run the test to apply.` });
    }} />}
    <div className="forest-stage-heading"><span className="forest-kicker">FOREST DECISION STUDIO / 3D</span><h1>{incident?.region ?? "Forest simulation"}</h1><p>20 × 20 cells · {frame?.value ? `Step ${frame.value.tick}` : "Preparing scenario"} · {policy === "ai_priority" ? "AI-prioritized" : policy === "first_alert" ? "First-alert-first" : policy === "coordinator" ? "Your assignment" : "No intervention"}</p></div>
    <div className="forest-tools" aria-label="Scene controls">
      <button aria-label={expanded ? "Restore studio layout" : "Expand map"} aria-pressed={expanded} onClick={onExpand} title={expanded ? "Restore layout (Esc)" : "Expand map"}>{expanded ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>
      <button aria-label="Focus fire" onClick={() => setFocus(n => n + 1)} title="Focus fire"><Crosshair size={16}/></button>
      <button aria-label="Zoom in" onClick={() => camera("zoomIn")} title="Zoom in"><Plus size={16}/></button>
      <button aria-label="Zoom out" onClick={() => camera("zoomOut")} title="Zoom out"><Minus size={16}/></button>
      <button aria-label="Toggle grid" aria-pressed={showGrid} onClick={() => setGrid(!showGrid)} title="20×20 grid"><Grid2X2 size={16}/></button>
      <button aria-label="Toggle protected habitat" aria-pressed={showHabitat} onClick={() => setHabitat(!showHabitat)} title="Protected habitat"><Layers size={16}/></button>
      <button aria-label="Reset forest camera" onClick={() => setReset(n => n + 1)} title="Reset camera"><RotateCcw size={16}/></button>
    </div>
    {frame?.value && <div className="forest-live"><span><Flame size={14}/><b>{frame.value.metrics.burning}</b> burning</span><span><b>{frame.value.metrics.burned}</b> burned</span><span><Leaf size={14}/><b>{frame.value.metrics.habitat}</b> habitat cells burned</span></div>}
    {!frame?.value && <div className="forest-empty"><Trees size={28}/><p>{frame?.error ?? "The forest will appear when the response test is ready."}</p></div>}
    {picking && <div className="forest-pick-notice">Click a vegetated cell to set the ignition point</div>}
    <div className="forest-legend" aria-label="Forest legend"><span><i className="legend-healthy"/>Healthy</span><span><i className="legend-burning"/>Burning</span><span><i className="legend-burned"/>Burned</span><span><i className="legend-bare"/>Non-vegetated</span><span><i className="legend-protected"/>Protected</span></div>
    <div className="forest-scene-note">Backend simulation · selected incident plot. Landscape and crew route are schematic.</div>
  </section>;
}
