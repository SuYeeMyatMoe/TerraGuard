"use client";

import dynamic from "next/dynamic";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { ControlsPanel } from "./ControlsPanel";
import { DecisionPanel } from "./DecisionPanel";
import { IntelligencePanel } from "./IntelligencePanel";
import { DecisionRecord } from "./DecisionRecord";
import { MethodologyDrawer } from "./MethodologyDrawer";
import { ReportCanvas } from "./ReportCanvas";
import { FieldBriefModal, MapControls, Toasts } from "./Overlays";
import { StatCards } from "./StatCards";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";

const ForestCanvas = dynamic(() => import("@/components/scene/ForestCanvas"), { ssr: false });
const EarthView = dynamic(() => import("./EarthView").then((m) => m.EarthView), { ssr: false });

export function CommandCenter() {
  const load = useStore((s) => s.load);

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
    <div className="command-shell flex h-dvh flex-col overflow-hidden bg-[var(--bg)]">
      <TopBar />
      <main className="command-main relative flex min-h-0 flex-1 flex-col overflow-y-auto lg:block lg:overflow-hidden">
        <div className="command-viewport relative min-h-[320px] shrink-0 overflow-hidden lg:absolute lg:inset-0 lg:min-h-0">
        {/* main view: the 3D canvas stays mounted so switching back is instant */}
        <div className={`absolute inset-0 ${view === "sim" ? "visible" : "invisible"}`} aria-hidden={view !== "sim"}>
          <ForestCanvas />
          {simLoading && !sim && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="panel flex items-center gap-2.5 px-4 py-3 text-[13px] font-semibold">
                <Loader2 size={16} className="animate-spin text-[var(--blue)]" /> Preparing the response test…
              </div>
            </div>
          )}
        </div>
        {view === "earth" && <EarthView />}

        {loadError && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-[var(--bg)]/80">
            <div className="panel mx-3 w-full max-w-[420px] p-6 text-center">
              <AlertTriangle className="mx-auto text-[var(--fire)]" />
              <div className="mt-2 text-[15px] font-bold">Can’t reach the TerraGuard API</div>
              <p className="mt-1 text-[13px] text-[var(--ink-2)]">{loadError}</p>
              <button className="btn btn-primary mt-4" onClick={() => load()}>
                <RefreshCw size={15} /> Retry
              </button>
            </div>
          </div>
        )}

        {/* camera controls */}
        {view === "sim" && (
          <div className="absolute right-3 top-3 z-10 lg:right-[412px] lg:top-4">
            <MapControls />
          </div>
        )}

        </div>

        {/* left: controls (3D only) */}
        {view === "sim" && (
          <div className="order-2 mx-3 my-3 flex lg:pointer-events-none lg:absolute lg:bottom-[156px] lg:left-4 lg:top-4 lg:z-10 lg:m-0">
            <div className="pointer-events-auto flex w-full max-h-full lg:w-auto">
              <ControlsPanel />
            </div>
          </div>
        )}

        {/* top: stat cards (3D only) */}
        {view === "sim" && (
          <div className="pointer-events-none absolute left-[332px] right-[468px] top-4 z-10 hidden justify-start xl:flex">
            <div className="pointer-events-auto">
              <StatCards />
            </div>
          </div>
        )}

        {/* right column: intelligence + decision */}
        <div className="order-3 mx-3 mb-4 mt-3 flex min-w-0 flex-col gap-3 lg:pointer-events-none lg:absolute lg:bottom-4 lg:right-4 lg:top-4 lg:z-10 lg:m-0 lg:w-[380px]">
          <div className="pointer-events-auto flex max-h-[75dvh] min-h-[320px] flex-1 flex-col lg:max-h-none lg:min-h-[240px]">
            <IntelligencePanel />
          </div>
          <div className="pointer-events-auto">
            <DecisionPanel />
          </div>
        </div>

        {/* bottom timeline (3D only) */}
        {view === "sim" && (
          <div className="order-1 mx-3 mt-3 lg:absolute lg:bottom-4 lg:left-4 lg:right-[412px] lg:z-10 lg:m-0">
            <Timeline />
          </div>
        )}

        {view === "sim" && sim && (
          <div className="order-4 px-4 pb-4 text-center text-[11px] font-medium text-[var(--ink-3)] lg:pointer-events-none lg:absolute lg:bottom-[160px] lg:left-1/2 lg:z-[5] lg:-translate-x-1/2 lg:p-0">
            Hypothetical scenario on procedurally generated plots · not a reconstruction of the real sites
          </div>
        )}
      </main>
      <Toasts />
      <FieldBriefModal />
      <MethodologyDrawer />
      <DecisionRecord />
      <ReportCanvas />
    </div>
  );
}
