"use client";

import dynamic from "next/dynamic";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { ControlsPanel } from "./ControlsPanel";
import { DecisionPanel } from "./DecisionPanel";
import { IntelligencePanel } from "./IntelligencePanel";
import { DecisionRecord } from "./DecisionRecord";
import { MethodologyDrawer } from "./MethodologyDrawer";
import { FieldBriefModal, Toasts } from "./Overlays";
import { IncidentRoster } from "./IncidentRoster";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";
import "./studio.css";

const ForestStudio = dynamic(() => import("@/components/scene/ForestStudio").then(m => m.ForestStudio), { ssr: false });
const EarthView = dynamic(() => import("./EarthView").then((m) => m.EarthView), { ssr: false });

export function CommandCenter() {
  const load = useStore((s) => s.load);

  const loadError = useStore((s) => s.loadError);
  const view = useStore((s) => s.view);
  const sim = useStore((s) => s.sim);
  const started = useRef(false);

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
        ...(pol === "none" || pol === "first_alert" || pol === "ai_priority" || pol === "coordinator" ? { policy: pol } : {}),
      });
  }, [sim]);

  return (
    <div className={`forest-command ${view === "sim" ? "studio-mode" : "map-mode"}`}>
      <TopBar />
      <main className="studio-main">
        {view === "earth" && <EarthView />}

        {loadError && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-[var(--bg)]/80">
            <div className="panel w-[420px] p-6 text-center">
              <AlertTriangle className="mx-auto text-[var(--fire)]" />
              <div className="mt-2 text-[15px] font-bold">Can’t reach the TerraGuard API</div>
              <p className="mt-1 text-[13px] text-[var(--ink-2)]">{loadError}</p>
              <button className="btn btn-primary mt-4" onClick={() => load()}>
                <RefreshCw size={15} /> Retry
              </button>
            </div>
          </div>
        )}

        {view === "sim" ? <div className="studio-workspace">
          <aside className="studio-conditions" aria-label="Incidents and conditions"><IncidentRoster/><ControlsPanel/></aside>
          <div className="studio-center"><ForestStudio/><div className="studio-timeline"><Timeline/></div></div>
          <aside className="studio-intelligence" aria-label="Recommendations and decision"><div className="studio-detail"><IntelligencePanel/></div><DecisionPanel/></aside>
        </div> : <div className="map-intelligence"><IntelligencePanel/><DecisionPanel/></div>}
      </main>
      <Toasts />
      <FieldBriefModal />
      <MethodologyDrawer />
      <DecisionRecord />
    </div>
  );
}
