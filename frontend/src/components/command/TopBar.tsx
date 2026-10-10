"use client";

import { BookOpen, Box, ChevronDown, ClipboardList, Database, Globe2, History } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo, Segmented } from "@/components/ui";
import { utc } from "@/lib/format";
import { useStore } from "@/lib/store";

export function TopBar() {
  const data = useStore((s) => s.data);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const load = useStore((s) => s.load);
  const actions = useStore((s) => s.actions);
  const setMethodology = useStore((s) => s.setMethodology);
  const setRecordOpen = useStore((s) => s.setRecordOpen);
  const [scenOpen, setScenOpen] = useState(false);
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
            { value: "earth", label: (<><Globe2 size={15} /> Command map</>), title: "Real coordinates, the past 24 hours and the competing incidents" },
            { value: "sim", label: (<><Box size={15} /> Test the response (3D)</>), title: "Hypothetical forest scenario for testing where the crew goes" },
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

      <button
        className="relative flex h-9 items-center gap-2 rounded-[10px] border border-[var(--line)] bg-white px-3 text-[12.5px] font-semibold hover:border-[#cdd8e5]"
        onClick={() => setRecordOpen(true)}
        title="Decision record: who got the crew, who waited, and why"
      >
        <ClipboardList size={16} className="text-[var(--ink-2)]" />
        <span className="hidden lg:inline">Decision record</span>
        {actions.length > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--blue)] px-1.5 text-[10.5px] font-bold text-white tnum">
            {actions.length}
          </span>
        )}
      </button>
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
