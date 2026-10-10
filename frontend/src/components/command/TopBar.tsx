"use client";

import { Bell, BookOpen, Box, ChevronDown, Database, Globe2, History, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo, Segmented } from "@/components/ui";
import { utc } from "@/lib/format";
import { useStore } from "@/lib/store";

const ACTION_TEXT: Record<string, string> = {
  ASSIGN_INSPECTION: "Inspection assigned",
  REQUEST_RECHECK: "Recheck requested",
  DISMISS: "Dismissed",
};

export function TopBar() {
  const data = useStore((s) => s.data);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const load = useStore((s) => s.load);
  const actions = useStore((s) => s.actions);
  const actionsLoading = useStore((s) => s.actionsLoading);
  const actionsError = useStore((s) => s.actionsError);
  const loadActions = useStore((s) => s.loadActions);
  const setMethodology = useStore((s) => s.setMethodology);
  const [bellOpen, setBellOpen] = useState(false);
  const [scenOpen, setScenOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const unread = Math.max(actions.length - seen, 0);
  const prov = data?.provenance;

  return (
    <header className="relative z-30 flex h-16 items-center gap-4 border-b border-[var(--line)] bg-white px-5">
      <Link href="/" className="flex items-center gap-3" aria-label="TerraGuard AI home">
        <Logo />
      </Link>
      <span className="h-6 w-px bg-[var(--line)]" />
      <div className="leading-tight">
        <div className="text-[13.5px] font-bold">Forest Command Center</div>
        <div className="text-[11.5px] text-[var(--ink-2)]">Malaysia &amp; Indonesia study region</div>
      </div>

      <div className="mx-auto">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "earth", label: (<><Globe2 size={15} /> Earth View</>), title: "Real coordinates of historical hotspots" },
            { value: "sim", label: (<><Box size={15} /> 3D Simulation</>), title: "Hypothetical forest scenario" },
          ]}
        />
      </div>

      {/* historical replay + scenario day */}
      <Dropdown
        open={scenOpen}
        setOpen={setScenOpen}
        button={
          <span className="flex items-center gap-2.5 rounded-[10px] border border-[var(--line)] bg-white px-3 py-1.5 hover:border-[#cdd8e5]">
            <History size={15} className="text-[var(--ink-2)]" />
            <span className="text-left leading-tight">
              <span className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--ink-3)]">Historical replay</span>
              <span className="block text-[12.5px] font-semibold tnum">{data ? utc(data.scenario.replay_time_utc) : "Loading…"}</span>
            </span>
            <ChevronDown size={14} className="text-[var(--ink-3)]" />
          </span>
        }
      >
        <div className="w-[300px] p-1.5">
          <div className="px-2.5 pb-1.5 pt-1 text-[11.5px] text-[var(--ink-2)]">
            Replay days from the held-out 2025 test period. Selected by a fixed, outcome-blind rule.
          </div>
          {data?.scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setScenOpen(false);
                if (s.id !== data.scenario.id) load(s.id);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-[#f3f6fa] ${s.id === data.scenario.id ? "bg-[var(--blue-50)]" : ""}`}
            >
              <span>
                <span className="block text-[13px] font-semibold tnum">{utc(s.replay_time_utc)}</span>
                <span className="block text-[11.5px] text-[var(--ink-2)]">
                  {s.countries.join(" · ")} · {s.candidates_that_day} detections that day
                </span>
              </span>
              {s.is_default && <span className="text-[10.5px] font-bold text-[var(--blue)]">DEFAULT</span>}
            </button>
          ))}
        </div>
      </Dropdown>

      {prov && (
        <span
          title={prov.product}
          className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold ring-1 ring-inset xl:inline-flex ${
            prov.is_synthetic ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-[var(--green-50)] text-[var(--green-700)] ring-[var(--green-200)]"
          }`}
        >
          <Database size={12} />
          {prov.is_synthetic ? "Synthetic demo data" : "NASA FIRMS VIIRS"}
        </span>
      )}

      <Dropdown
        open={bellOpen}
        setOpen={(v) => {
          setBellOpen(v);
          if (v) setSeen(actions.length);
        }}
        align="right"
        button={
          <span className="relative grid h-9 w-9 place-items-center rounded-[10px] text-[var(--ink-2)] hover:bg-[#f1f5f9]" aria-label="Notifications">
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--red)] px-1 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </span>
        }
      >
        <div className="w-[340px]">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <div className="text-[13.5px] font-bold">Decision log</div>
            <div className="text-[11.5px] text-[var(--ink-2)]">Every coordinator action is saved with a timestamp.</div>
          </div>
          <div className="scroll-thin max-h-[340px] overflow-y-auto p-1.5">
            {actionsLoading && <div role="status" className="px-3 py-4 text-[12.5px] text-[var(--ink-2)]">Loading decision log…</div>}
            {actionsError && <div role="alert" className="rounded-lg bg-red-50 px-3 py-3 text-[12.5px] text-red-700">
              <p>Could not load the decision log. {actionsError}</p>
              <button className="btn btn-ghost mt-2 h-8" disabled={actionsLoading} onClick={() => loadActions()}><RefreshCw size={13} /> Retry</button>
            </div>}
            {!actionsLoading && !actionsError && actions.length === 0 && <div className="px-3 py-6 text-center text-[12.5px] text-[var(--ink-2)]">No decisions recorded yet.</div>}
            {actions.map((a) => (
              <div key={a.id} className="rounded-lg px-3 py-2 hover:bg-[#f6f8fb]">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold">{ACTION_TEXT[a.action]}</span>
                  <span className="text-[11px] text-[var(--ink-3)] tnum">
                    {new Date(a.created_at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="text-[11.5px] text-[var(--ink-2)]">
                  {a.incident_id}
                  {a.recommendation_at_time ? ` · model recommended ${a.recommendation_at_time.toLowerCase()}` : ""}
                  {a.reason ? ` · “${a.reason}”` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Dropdown>
      <button className="btn btn-ghost h-9 px-2.5" onClick={() => setMethodology(true)} title="Methodology & evaluation">
        <BookOpen size={17} />
        <span className="hidden 2xl:inline">Methodology</span>
      </button>
    </header>
  );
}

function Dropdown({
  open,
  setOpen,
  button,
  children,
  align = "left",
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  button: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open, setOpen]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        {button}
      </button>
      {open && (
        <div className={`panel-float animate-in absolute top-[calc(100%+8px)] z-50 overflow-hidden ${align === "right" ? "right-0" : "left-0"}`}>
          {children}
        </div>
      )}
    </div>
  );
}
