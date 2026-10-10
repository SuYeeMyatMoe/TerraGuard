"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { ControlsPanel } from "./ControlsPanel";
import { DecisionPanel } from "./DecisionPanel";
import { IntelligencePanel } from "./IntelligencePanel";
import { DecisionRecord } from "./DecisionRecord";
import { MethodologyDrawer } from "./MethodologyDrawer";
import { ConsequenceBanner, ReportCanvas } from "./ReportCanvas";
import { FieldBriefModal, Toasts } from "./Overlays";
import { IncidentRoster } from "./IncidentRoster";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";
import { CommandLoading } from "./CommandLoading";
import type { SimulateResponse } from "@/lib/types";
import { RecPill } from "@/components/ui";
import { pct, shortId } from "@/lib/format";
import "./studio.css";
import "./mainSync.css";
import "./responsive.css";

const ForestStudio = dynamic(() => import("@/components/scene/ForestStudio").then(m => m.ForestStudio), { ssr: false });
const EarthView = dynamic(() => import("./EarthView").then((m) => m.EarthView), { ssr: false });

export function CommandCenter() {
  const load = useStore((s) => s.load);

  const loadError = useStore((s) => s.loadError);
  const data = useStore((s) => s.data);
  const loading = useStore((s) => s.loading);
  const simLoading = useStore((s) => s.simLoading);
  const simError = useStore((s) => s.simError);
  const view = useStore((s) => s.view);
  const sim = useStore((s) => s.sim);
  const started = useRef(false);
  const [initialized, setInitialized] = useState(false);
  const [renderedSim, setRenderedSim] = useState<SimulateResponse | null>(null);
  const [leftTab, setLeftTab] = useState<"incidents" | "conditions">("incidents");
  const [rightTab, setRightTab] = useState<"decision" | "evidence">("decision");
  const [expanded, setExpanded] = useState(false);
  const selectedId = useStore(s => s.selectedId);
  const predictions = useStore(s => s.predictions);
  const predictionErrors = useStore(s => s.predictionErrors);
  const prediction = selectedId ? predictions[selectedId] : undefined;
  const onSceneReady = useCallback(() => setRenderedSim(sim), [sim]);
  const predicting = !!data?.incidents.some(incident => !predictions[incident.id] && !predictionErrors[incident.id]);
  const preparing = !initialized || loading || !data || predicting || (view === "sim" && (simLoading || !sim || renderedSim !== sim));
  const error = loadError ?? (view === "sim" ? simError : null);
  const covered = preparing || !!error;
  const stage = !initialized || loading || !data ? "Loading historical incidents…" : predicting ? "Assessing incident priorities…" : !sim || simLoading ? "Running the response test…" : "Building the 3D forest…";

  useEffect(() => {
    if (!expanded) return;
    const exit = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [expanded]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const q = new URLSearchParams(window.location.search);
    useStore.getState().setView(q.get("view") === "earth" ? "earth" : "sim");
    load(q.get("scenario") ?? undefined).then(() => {
      const sel = q.get("incident");
      if (sel) useStore.getState().select(sel);
      else {
        const store = useStore.getState();
        const first = Object.values(store.predictions).sort((a, b) => a.priority.rank - b.priority.rank)[0];
        if (first) store.select(first.incident_id);
      }
      setInitialized(true);
    });
  }, [load]);

  // deep links for demos / backup recordings: ?view=sim&incident=…&step=…&policy=…
  const applied = useRef(false);
  useEffect(() => {
    if (!sim || applied.current) return;
    applied.current = true;
    const q = new URLSearchParams(window.location.search);
    const st = Number(q.get("step") ?? NaN);
    const pol = q.get("policy");
    if (Number.isFinite(st) || pol)
      useStore.setState({
        playing: false,
        ...(Number.isFinite(st) ? { step: st } : {}),
        ...(pol === "none" || pol === "first_alert" || pol === "ai_priority" || (pol === "coordinator" && sim.teams === 1) ? { policy: pol } : {}),
      });
  }, [sim]);

  return (
    <div className={`forest-command simulation-theme ${view === "sim" ? "studio-mode" : "map-mode"}`}>
      {covered && <CommandLoading stage={stage} error={error} onRetry={() => {
        if (loadError) void load();
        else void useStore.getState().runSimulation({ autoplay: false });
      }} onEarthView={view === "sim" && !loadError ? () => useStore.getState().setView("earth") : undefined}/>}
      <div className="command-content" inert={covered} aria-hidden={covered ? true : undefined} style={covered ? { opacity: 0 } : undefined}>
      <TopBar />
      <main className="studio-main">
        {view === "earth" && <div className="studio-earth-viewport"><EarthView /></div>}

        {view === "sim" ? <div className={`studio-workspace ${expanded ? "studio-expanded" : ""}`}>
          <aside className="studio-conditions" aria-label="Incidents and conditions">
            <div className="studio-tabs" aria-label="Left panel">
              <button aria-pressed={leftTab === "incidents"} onClick={() => setLeftTab("incidents")}>Incidents</button>
              <button aria-pressed={leftTab === "conditions"} onClick={() => { setLeftTab("conditions"); useStore.getState().setControlsOpen(true); }}>Test conditions</button>
            </div>
            <div hidden={leftTab !== "incidents"}><IncidentRoster/></div>
            <div className="studio-control-content" hidden={leftTab !== "conditions"}><ControlsPanel/></div>
            <div className="studio-workflow-note"><span>01 / COMPARE THE INCIDENTS</span><p>{sim?.teams === 1 ? "Compare policies with one crew. Select an incident to review." : "Select A, B or C to review its crew and evidence."}</p><button onClick={() => { setLeftTab("conditions"); useStore.getState().setControlsOpen(true); }}>Adjust test conditions →</button></div>
          </aside>
          <div className="studio-center"><ForestStudio expanded={expanded} onExpand={() => setExpanded(!expanded)} onReady={onSceneReady}/><div className="studio-timeline"><Timeline/></div></div>
          <aside className="studio-intelligence" aria-label="Recommendations and decision">
            <div className="studio-tabs" aria-label="Right panel">
              <button aria-pressed={rightTab === "decision"} onClick={() => setRightTab("decision")}>Decision & comparison</button>
              <button aria-pressed={rightTab === "evidence"} onClick={() => setRightTab("evidence")}>Evidence</button>
            </div>
            <div className="studio-decision-content" hidden={rightTab !== "decision"}>
              {prediction && <section className="studio-recommendation"><div className="eyebrow">RECOMMENDATION · {shortId(prediction.incident_id)}</div><div className="studio-rec-score"><strong>{pct(prediction.probability)}</strong><RecPill rec={prediction.priority.recommendation}/></div><p className="studio-rec-caption">Probability of a 48 h follow-up detection</p><p>{prediction.priority.reason}</p><button onClick={() => setRightTab("evidence")}>Review evidence →</button><button onClick={() => useStore.getState().openReport(prediction.incident_id, "prediction")}>Prediction & recommendation →</button></section>}
              <DecisionPanel/>
            </div>
            <div className="studio-detail" hidden={rightTab !== "evidence"}><IntelligencePanel/></div>
          </aside>
        </div> : <div className="map-intelligence"><IntelligencePanel/><DecisionPanel/></div>}
        <ConsequenceBanner />
      </main>
      <Toasts />
      <FieldBriefModal />
      <MethodologyDrawer />
      <DecisionRecord />
      <ReportCanvas />
      </div>
    </div>
  );
}
