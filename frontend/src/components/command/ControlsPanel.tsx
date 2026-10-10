"use client";

import { Crosshair, Droplets, Loader2, PanelLeftClose, Play, RotateCcw, SlidersHorizontal, Timer, Wind } from "lucide-react";
import type { ReactNode } from "react";
import { compass, shortId } from "@/lib/format";
import { useStore } from "@/lib/store";

export function ControlsPanel() {
  const open = useStore((s) => s.controlsOpen);
  const setOpen = useStore((s) => s.setControlsOpen);
  const sim = useStore((s) => s.sim);
  const selectedId = useStore((s) => s.selectedId);
  const overrides = useStore((s) => s.overrides);
  const setOverride = useStore((s) => s.setOverride);
  const resetOverride = useStore((s) => s.resetOverride);
  const responseDelay = useStore((s) => s.responseDelay);
  const steps = useStore((s) => s.steps);
  const setParam = useStore((s) => s.setParam);
  const run = useStore((s) => s.runSimulation);
  const loading = useStore((s) => s.simLoading);
  const stale = useStore((s) => s.simStale);
  const picking = useStore((s) => s.pickingIgnition);
  const setPicking = useStore((s) => s.setPickingIgnition);
  const mps = Number(sim?.assumptions.minutes_per_step ?? 30);

  if (!open) {
    return (
      <div className="panel-float flex flex-col items-center gap-1 p-1.5">
        <button className="grid h-10 w-10 place-items-center rounded-[10px] text-[var(--ink-2)] hover:bg-[#f1f5f9]" onClick={() => setOpen(true)} title="Simulation controls">
          <SlidersHorizontal size={18} />
        </button>
        <button className="grid h-10 w-10 place-items-center rounded-[10px] bg-[var(--blue)] text-white disabled:opacity-60" onClick={() => run()} disabled={loading} title="Test response">
          {loading ? <Loader2 size={17} className="animate-spin" /> : <Play size={17} />}
        </button>
      </div>
    );
  }

  const plot = sim?.plots.find((p) => p.incident_id === selectedId);
  const o = selectedId ? overrides[selectedId] : undefined;
  const wind = o?.wind_speed ?? plot?.wind_speed ?? 12;
  const dir = o?.wind_dir_deg ?? plot?.wind_dir_deg ?? 225;
  const dry = o?.dryness ?? plot?.dryness ?? 0.5;

  return (
    <div className="panel-float slide-in flex max-h-full w-[296px] flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <div className="flex items-center gap-2 text-[13.5px] font-bold">
          <SlidersHorizontal size={16} className="text-[var(--blue)]" /> Test conditions
        </div>
        <button className="grid h-7 w-7 place-items-center rounded-lg text-[var(--ink-2)] hover:bg-[#f1f5f9]" onClick={() => setOpen(false)} aria-label="Collapse controls">
          <PanelLeftClose size={16} />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3.5">
        <div>
          <div className="flex items-center justify-between">
            <div className="eyebrow">{selectedId ? shortId(selectedId) : "Per-incident conditions"}</div>
            {selectedId && o && (
              <button className="text-[11px] font-semibold text-[var(--blue)] hover:underline" onClick={() => resetOverride(selectedId)}>
                Reset to observed
              </button>
            )}
          </div>
          {!selectedId || !plot ? (
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ink-2)]">Select an incident plot to adjust its wind, dryness and ignition point.</p>
          ) : (
            <>
              <p className="mt-1 text-[11.5px] text-[var(--ink-3)]">Defaults from {plot.defaults_from}.</p>
              <div className="mt-3 space-y-3.5">
                <Slider icon={<Wind size={14} />} label="Wind speed" value={wind} min={0} max={60} step={1} unit="km/h"
                  onChange={(v) => setOverride(selectedId, { wind_speed: v })} />
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
                    <span className="flex items-center gap-1.5 text-[var(--ink-2)]"><Wind size={14} className="rotate-90" /> Wind from</span>
                    <span className="font-semibold tnum">{compass(dir)} · {Math.round(dir)}°</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Dial value={dir} onChange={(v) => setOverride(selectedId, { wind_dir_deg: v })} />
                    <div className="grid flex-1 grid-cols-4 gap-1">
                      {[0, 90, 180, 270, 45, 135, 225, 315].map((d) => (
                        <button key={d} onClick={() => setOverride(selectedId, { wind_dir_deg: d })}
                          className={`h-7 rounded-md text-[11px] font-semibold ${Math.round(dir) === d ? "bg-[var(--blue)] text-white" : "bg-[#f1f5f9] text-[var(--ink-2)] hover:bg-[#e8eef5]"}`}>
                          {compass(d)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <Slider icon={<Droplets size={14} />} label="Vegetation dryness" value={dry} min={0} max={1} step={0.01} display={`${Math.round(dry * 100)}%`}
                  onChange={(v) => setOverride(selectedId, { dryness: v })} />
                <button
                  className={`btn w-full ${picking ? "bg-[var(--fire-50)] text-[var(--fire-700)] ring-1 ring-[var(--fire-200)]" : "btn-secondary"}`}
                  onClick={() => setPicking(!picking)}
                >
                  <Crosshair size={15} />
                  {picking ? "Click a cell in the selected plot…" : o?.ignition ? `Ignition: row ${o.ignition[0][0] + 1}, col ${o.ignition[0][1] + 1}` : "Choose ignition point"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-[var(--line-2)] pt-3.5">
          <div className="eyebrow mb-3">Response</div>
          <div className="space-y-3.5">
            <Slider icon={<Timer size={14} />} label="Response delay" value={responseDelay} min={0} max={16} step={1}
              display={`${responseDelay} steps`} onChange={(v) => setParam("responseDelay", v)} />
            <Slider icon={<Timer size={14} />} label="Test horizon" value={steps} min={24} max={72} step={4}
              display={`${steps} steps`} onChange={(v) => setParam("steps", v)} />
            <p className="text-[11px] leading-snug text-[var(--ink-3)]">
              One crew, as in the command map. 1 step = {mps} min and 1 cell = 1 ha (stated scenario assumptions). The crew is assumed to carry initial suppression kit.
            </p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-[var(--line)] p-3">
        <button className="btn btn-primary" onClick={() => run()} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {loading ? "Testing…" : stale ? "Test again" : "Test response"}
        </button>
        <button
          className="btn btn-secondary px-3"
          title="Reset all conditions"
          onClick={() => {
            const st = useStore.getState();
            Object.keys(st.overrides).forEach((k) => st.resetOverride(k));
            st.setParam("responseDelay", 4);
            st.setParam("steps", 48);
          }}
        >
          <RotateCcw size={15} />
        </button>
      </div>
    </div>
  );
}

function Slider({
  icon,
  label,
  value,
  min,
  max,
  step,
  unit,
  display,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  display?: string;
  onChange: (v: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[12.5px]">
        <span className="flex items-center gap-1.5 text-[var(--ink-2)]">{icon} {label}</span>
        <span className="font-semibold tnum">{display ?? `${Math.round(value)} ${unit ?? ""}`}</span>
      </div>
      <input
        type="range"
        className="tg-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${fill}%` }}
      />
    </label>
  );
}

function Dial({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const rad = ((value + 180) % 360) * (Math.PI / 180);
  const set = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    const toDeg = (Math.atan2(x, -y) * 180) / Math.PI; // direction pointer points to
    onChange(Math.round((toDeg + 180 + 360) % 360));
  };
  return (
    <svg
      width="64"
      height="64"
      viewBox="-32 -32 64 64"
      className="shrink-0 cursor-pointer touch-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && set(e)}
      role="slider"
      aria-label="Wind direction"
      aria-valuenow={Math.round(value)}
    >
      <circle r="29" fill="#f7f9fc" stroke="#e3eaf2" />
      {["N", "E", "S", "W"].map((l, i) => (
        <text key={l} x={Math.sin((i * Math.PI) / 2) * 21} y={-Math.cos((i * Math.PI) / 2) * 21 + 3.5} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#94a3b8">
          {l}
        </text>
      ))}
      <g transform={`rotate(${(rad * 180) / Math.PI})`}>
        <line x1="0" y1="10" x2="0" y2="-12" stroke="#06b6d4" strokeWidth="3" strokeLinecap="round" />
        <path d="M0 -17 L5 -9 L-5 -9 Z" fill="#06b6d4" />
      </g>
      <circle r="2.5" fill="#06b6d4" />
    </svg>
  );
}
