"use client";

import dynamic from "next/dynamic";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { ControlsPanel } from "./ControlsPanel";
import { DecisionPanel } from "./DecisionPanel";
import { IntelligencePanel } from "./IntelligencePanel";
import { MethodologyDrawer } from "./MethodologyDrawer";
import { FieldBriefModal, MapControls, Toasts } from "./Overlays";
import { StatCards } from "./StatCards";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";

const ForestCanvas = dynamic(() => import("@/components/scene/ForestCanvas"), { ssr: false });
const EarthView = dynamic(() => import("./EarthView").then((m) => m.EarthView), { ssr: false });

export function CommandCenter() {
  const load = useStore((s) => s.load);
  const data = useStore((s) => s.data);
  const loadError = useStore((s) => s.loadError);
  const view = useStore((s) => s.view);
  const sim = useStore((s) => s.sim);
  const simLoading = useStore((s) => s.simLoading);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const q = new URLSearchParams(window.location.search);
    if (q.get("view") === "sim") useStore.getState().setView("sim");
    load(q.get("scenario") ?? undefined).then(() => {
      const sel = q.get("incident");
      if (sel) useStore.getState().select(sel);
    });
  }, [load]);

  // prepare the initial scenario (step 0, paused) so the forest is ready when the user switches views
  useEffect(() => {
    if (data && !sim && !simLoading) {
      useStore
        .getState()
        .runSimulation()
        .then(() => {
          const q = new URLSearchParams(window.location.search);
          const st = Number(q.get("step") ?? 0);
          const pol = q.get("policy");
          useStore.setState({
            playing: false,
            step: Number.isFinite(st) ? st : 0,
            ...(pol === "none" || pol === "first_alert" || pol === "ai_priority" ? { policy: pol } : {}),
          });
        });
    }
  }, [data, sim, simLoading]);

  return (
    <div className="simulation-theme flex h-screen flex-col overflow-hidden bg-[var(--bg)]">
      <TopBar />
      <main className={`command-workspace relative min-h-0 flex-1 ${view === "sim" ? "is-simulation" : "is-earth"}`}>
        {/* main view: the 3D canvas stays mounted so switching back is instant */}
        <div className={`forest-stage absolute inset-0 ${view === "sim" ? "visible" : "invisible"}`} aria-hidden={view !== "sim"}>
          <ForestCanvas />
          {simLoading && !sim && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="panel flex items-center gap-2.5 px-4 py-3 text-[13px] font-semibold">
                <Loader2 size={16} className="animate-spin text-[var(--blue)]" /> Preparing the forest scenario…
              </div>
            </div>
          )}
        </div>
        {view === "earth" && <div className="earth-stage absolute inset-0"><EarthView /></div>}

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

        {/* left: controls (3D only) */}
        {view === "sim" && (
          <div className="conditions-dock pointer-events-none absolute z-10 flex">
            <div className="pointer-events-auto flex max-h-full">
              <ControlsPanel />
            </div>
          </div>
        )}

        {/* top: stat cards (3D only) */}
        {view === "sim" && (
          <div className="stats-dock pointer-events-none absolute z-10 hidden justify-start">
            <div className="pointer-events-auto">
              <StatCards />
            </div>
          </div>
        )}

        {/* camera controls */}
        {view === "sim" && (
          <div className="camera-dock absolute z-10">
            <MapControls />
          </div>
        )}

        {/* right column: intelligence + decision */}
        <div className="intelligence-dock pointer-events-none absolute z-10 flex flex-col gap-3">
          <div className="incident-slot pointer-events-auto flex min-h-0 flex-1 flex-col">
            <IntelligencePanel />
          </div>
          <div className="decision-slot scroll-thin pointer-events-auto overflow-y-auto">
            <DecisionPanel />
          </div>
        </div>

        {/* bottom timeline (3D only) */}
        {view === "sim" && (
          <div className="timeline-dock absolute z-10">
            <Timeline />
          </div>
        )}

        {view === "sim" && sim && (
          <div className="scenario-note pointer-events-none absolute z-[5] text-center text-[10px] font-medium text-[var(--ink-3)]">
            Hypothetical scenario on procedurally generated plots · not a reconstruction of the real sites
          </div>
        )}
      </main>
      <Toasts />
      <FieldBriefModal />
      <MethodologyDrawer />
    </div>
  );
}
