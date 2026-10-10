"use client";

import { useMemo, useState } from "react";
import { Crosshair, Flame, Grid2X2, Layers, Leaf, Maximize2, Minimize2, Minus, Play, Plus, RotateCcw, Trees, Truck } from "lucide-react";
import { useStore } from "@/lib/store";
import { pct, shortId } from "@/lib/format";
import { toForestFrame } from "@/lib/forestFrame";
import { getWaterResponse } from "@/lib/waterResponse";
import { getCrewPlan } from "@/lib/crewMotion";
import ForestScene from "./ForestScene";
import ForestOverview, { overviewPosition, type OverviewPlot } from "./ForestOverview";
import { SceneQualityProvider } from "./SceneQuality";
import type { QualityMode } from "@/lib/sceneQuality";
import { getFireHistory } from "@/lib/fireLifetime";

export function ForestStudio({ expanded, onExpand }: { expanded: boolean; onExpand: () => void }) {
  const data = useStore(s => s.data);
  const sim = useStore(s => s.sim);
  const policy = useStore(s => s.policy);
  const step = useStore(s => s.step);
  const playing = useStore(s => s.playing);
  const selectedId = useStore(s => s.selectedId);
  const camera = useStore(s => s.camera);
  const picking = useStore(s => s.pickingIgnition);
  const predictions = useStore(s => s.predictions);
  const [allIncidents, setAllIncidents] = useState(true);
  const [showGrid, setGrid] = useState(false);
  const [showHabitat, setHabitat] = useState(true);
  const [resetKey, setReset] = useState(0);
  const [focusKey, setFocus] = useState(0);
  const [quality, setQuality] = useState<QualityMode>("auto");
  const loading=useStore(s=>s.simLoading);
  const selectedIndex = sim?.plots.findIndex(p => p.incident_id === selectedId) ?? -1;
  const index = selectedIndex >= 0 ? selectedIndex : Math.max(0, sim?.plots.findIndex(p => p.incident_id === sim.ai_order[0]) ?? 0);
  const plot = sim?.plots[index];
  const result = sim ? (policy === "coordinator" ? sim.policies.coordinator : sim.policies[policy]) : undefined;
  const crew=useMemo(()=>plot&&result?getCrewPlan(plot,result):null,[plot,result]);
  const frame = useMemo(() => {
    if (!plot || !result) return null;
    try { return { value: toForestFrame(plot, result, index, step), error: null }; }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : "Invalid forest frame." }; }
  }, [plot, result, index, step]);
  const incident = data?.incidents.find(i => i.id === plot?.incident_id);
  const water = frame?.value && result && crew ? getWaterResponse(frame.value,result,crew,index) : null;
  const overview = useMemo(() => {
    if (!sim || !result) return { plots: [], error: null };
    try {
      const plots: OverviewPlot[] = sim.plots.map((plot, index) => {
        const frame = toForestFrame(plot, result, index, step);
        const crew = getCrewPlan(plot, result);
        return {
          id: plot.incident_id, region: data?.incidents.find(inc => inc.id === plot.incident_id)?.region ?? "Forest plot",
          position: overviewPosition(index), frame, crew, water: getWaterResponse(frame, result, crew, index),
          fireHistory: getFireHistory(result,index),
          ignition: plot.ignition, label: shortId(plot.incident_id), playing, active: true,
          showHabitat, showGrid, resetKey, focusKey, picking: false, onPick: () => {},
        };
      });
      return { plots, error: null };
    } catch (error) { return { plots: [], error: error instanceof Error ? error.message : "Invalid forest frame." }; }
  }, [sim, result, step, data, playing, showHabitat, showGrid, resetKey, focusKey]);
  // Ignition editing needs the detailed cell view for the selected incident.
  const overviewVisible = allIncidents && !picking;
  const assignedElsewhere=result?.assigned.find(id=>id!==plot?.incident_id);
  const minutesPerStep=Number(sim?.assumptions.minutes_per_step??30);
  const endedBeforeArrival=!!(crew?.assigned&&crew.arrival!=null&&crew.arrival>0&&!result?.frames[Math.min(crew.arrival,result.frames.length-1)]?.[index]?.includes("2")&&!result?.frames.slice(0,crew.arrival+1).some(step=>step[index]?.includes("4")));
  const waterStatus=water?.phase==="suppression"?(frame?.value?.metrics.burning?"Water suppression · crew on site":"Cooling suppressed cells · crew on site"):water?.phase==="en-route"?`Crew en route · arrival at ${((crew?.arrival??0)*minutesPerStep/60).toFixed(1)} h`:water?.phase==="complete"?"Crew on site · no active fire":assignedElsewhere?`Crew sent to ${shortId(assignedElsewhere)}`:"Monitoring only · no crew dispatched";
  return <SceneQualityProvider mode={quality}><section className={`forest-stage ${overviewVisible ? "forest-overview" : ""}`} aria-label="Interactive forest simulation">
    {overviewVisible && overview.plots.length > 0 && <ForestOverview plots={overview.plots} selectedId={selectedId} resetKey={resetKey} focusKey={focusKey} playing={playing}/>}
    {!overviewVisible && frame?.value && plot && result && water && crew && <ForestScene frame={frame.value} fireHistory={getFireHistory(result,index)} water={water} crew={crew} ignition={plot.ignition} label={incident ? shortId(incident.id) : "Forest plot"} playing={playing} active={true} showHabitat={showHabitat} showGrid={showGrid} resetKey={resetKey} focusKey={focusKey} picking={picking && selectedId === plot.incident_id} onPick={(row, col) => {
      if (plot.fuel[row * 20 + col] === "0") return;
      const store = useStore.getState();
      store.setOverride(plot.incident_id, { ignition: [[row, col]] });
      store.setPickingIgnition(false);
      store.toast({ tone: "info", title: "Ignition point set", body: `Row ${row + 1}, column ${col + 1}. Run the test to apply.` });
    }} />}
    <div className="forest-stage-heading"><span className="forest-kicker">FOREST DECISION STUDIO / {sim?.teams ?? 3} RESPONSE {sim?.teams === 1 ? "CREW" : "CREWS"}</span><h1>{overviewVisible ? "Forest response map" : incident?.region ?? "Forest simulation"}</h1><p>{overviewVisible ? "A · B · C / live comparison" : "20 × 20 cells"} · {frame?.value ? `Step ${frame.value.tick}` : "Preparing scenario"} · {policy === "ai_priority" ? "AI-prioritized" : policy === "first_alert" ? "First-alert-first" : policy === "coordinator" ? "Your assignment" : "No intervention"}</p></div>
    <div className="forest-view-switch" aria-label="Forest view"><button aria-pressed={overviewVisible} onClick={() => { setAllIncidents(true); useStore.getState().setPickingIgnition(false); }}>All incidents</button><button aria-pressed={!overviewVisible} onClick={() => setAllIncidents(false)}>Selected incident</button></div>
    <div className="forest-quality"><label htmlFor="forest-quality">Quality</label><select id="forest-quality" value={quality} onChange={event => setQuality(event.target.value as QualityMode)}><option value="auto">Auto</option><option value="economy">Economy</option><option value="balanced">Balanced</option><option value="high">High</option></select></div>
    <div className="forest-tools" aria-label="Scene controls">
      <button aria-label={expanded ? "Restore studio layout" : "Expand map"} aria-pressed={expanded} onClick={onExpand} title={expanded ? "Restore layout (Esc)" : "Expand map"}>{expanded ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>
      <button aria-label="Focus crew and fire" onClick={() => setFocus(n => n + 1)} title="Focus crew and fire"><Crosshair size={16}/></button>
      <button aria-label="Zoom in" onClick={() => camera("zoomIn")} title="Zoom in"><Plus size={16}/></button>
      <button aria-label="Zoom out" onClick={() => camera("zoomOut")} title="Zoom out"><Minus size={16}/></button>
      <button aria-label="Toggle grid" aria-pressed={showGrid} onClick={() => setGrid(!showGrid)} title="20×20 grid"><Grid2X2 size={16}/></button>
      <button aria-label="Toggle protected habitat" aria-pressed={showHabitat} onClick={() => setHabitat(!showHabitat)} title="Protected habitat"><Layers size={16}/></button>
      <button aria-label="Reset forest camera" onClick={() => setReset(n => n + 1)} title="Reset camera"><RotateCcw size={16}/></button>
    </div>
    {!overviewVisible && frame?.value && <div className="forest-live"><span><Flame size={14}/><b>{frame.value.metrics.burning}</b> burning</span><span><b>{frame.value.metrics.burned}</b> burned</span><span><Leaf size={14}/><b>{frame.value.metrics.habitat}</b> habitat cells burned</span></div>}
    {(overviewVisible ? !overview.plots.length : !frame?.value) && <div className="forest-empty"><Trees size={28}/><p>{(overviewVisible ? overview.error : frame?.error) ?? "The forest will appear when the response test is ready."}</p></div>}
    {picking && <div className="forest-pick-notice">Click a vegetated cell to set the ignition point</div>}
    {!overviewVisible && water && <section className={`forest-water-response ${water.spraying ? "is-spraying" : ""}`} aria-label="Crew response controls">
      <div className="water-response-title"><span><Truck size={15}/>FIELD RESPONSE</span><i className={water.spraying ? "active" : ""}/></div>
      <p aria-live="polite">{waterStatus}</p>
      <button disabled={loading||picking} onClick={()=>{
        const store=useStore.getState();
        if (assignedElsewhere&&!crew?.assigned) { store.select(assignedElsewhere); return; }
        if (!crew?.assigned) { store.setPolicy("ai_priority"); if (sim?.ai_order[0]) store.select(sim.ai_order[0]); return; }
        store.replay();
      }}><Play size={12}/>{crew?.assigned?"Replay crew response":assignedElsewhere?"Follow assigned crew":"Compare AI response"}</button>
      {endedBeforeArrival?<><small>In this run, the fire ends before the crew arrives.</small><button className="earlier-response" disabled={loading||picking} onClick={()=>{const store=useStore.getState();store.setParam("responseDelay",1);store.runSimulation();}}>{loading?"Running response test…":`Test earlier arrival · ${minutesPerStep} min`}</button></>:<small>{crew?.assigned?"One crew · suppression starts after arrival":assignedElsewhere?"This incident has no response crew":"Fire spreads without a response crew"}</small>}
    </section>}
    {overviewVisible && overview.plots.length > 0 && <div className="forest-comparison" aria-label="Live incident comparison">{overview.plots.map(plot => <button key={plot.id} aria-label={`Review ${plot.label}`} aria-pressed={selectedId === plot.id} onClick={() => useStore.getState().select(plot.id)}>
      <div className="comparison-card-heading"><strong>{plot.label}</strong><span>{predictions[plot.id] ? `${pct(predictions[plot.id].probability)} follow-up` : "Assessing"}</span></div>
      <p>{plot.region}</p>
      <dl><div><dt>Burning</dt><dd>{plot.frame.metrics.burning}</dd></div><div><dt>Burned</dt><dd>{plot.frame.metrics.burned}</dd></div><div><dt>Habitat burned</dt><dd>{plot.frame.metrics.habitat}</dd></div></dl>
      <small className={plot.frame.assigned ? "has-crew" : ""}><Truck size={12}/>{plot.frame.assigned ? plot.frame.arrived ? "Crew on site" : "Crew en route" : "No crew assigned"}</small>
    </button>)}</div>}
    <div className="forest-legend" aria-label="Forest legend"><span><i className="legend-healthy"/>Healthy</span><span><i className="legend-burning"/>Burning</span><span><i className="legend-burned"/>Burned</span><span><i className="legend-bare"/>Non-vegetated</span><span><i className="legend-protected"/>Protected</span></div>
    <div className="forest-scene-note">{overviewVisible ? "One policy · same simulation step · 20 × 20 cells per incident. Placement is schematic." : "Backend simulation · selected incident plot. Landscape and crew route are schematic."}</div>
  </section></SceneQualityProvider>;
}
