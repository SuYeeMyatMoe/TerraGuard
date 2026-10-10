"use client";

import { Flame, Pause, Play, RotateCcw, Satellite, ShieldCheck, Truck, Flag } from "lucide-react";
import { useEffect } from "react";
import { Segmented } from "@/components/ui";
import { useStore } from "@/lib/store";
import { STATE } from "@/components/scene/layout";

export function Timeline() {
  const sim = useStore((s) => s.sim);
  const policy = useStore((s) => s.policy);
  const setPolicy = useStore((s) => s.setPolicy);
  const step = useStore((s) => s.step);
  const setStep = useStore((s) => s.setStep);
  const playing = useStore((s) => s.playing);
  const setPlaying = useStore((s) => s.setPlaying);
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const loading = useStore((s) => s.simLoading);
  const steps = sim?.steps ?? 48;
  const mps = Number(sim?.assumptions.minutes_per_step ?? 30);

  useEffect(() => {
    if (!playing || !sim) return;
    const id = setInterval(() => {
      const s = useStore.getState();
      if (s.step >= steps) {
        s.setPlaying(false);
        return;
      }
      s.setStep(s.step + 1);
    }, 420 / speed);
    return () => clearInterval(id);
  }, [playing, speed, steps, sim]);

  const pol = sim?.policies[policy];
  const arrival = pol && pol.assigned.length ? sim!.response_delay : null;
  const frame = pol?.frames[Math.min(step, pol.frames.length - 1)];
  let burning = 0, burned = 0, intervened = 0;
  frame?.forEach((p) => {
    for (let i = 0; i < p.length; i++) {
      const c = p.charCodeAt(i) - 48;
      if (c === STATE.BURNING) burning++;
      else if (c === STATE.BURNED) burned++;
      else if (c === STATE.INTERVENED) intervened++;
    }
  });

  const milestones = [
    { key: "detect", label: "Initial detection", icon: Satellite, at: 0 },
    { key: "ignite", label: "Ignition", icon: Flame, at: 1 },
    { key: "progress", label: "Fire progression", icon: Flame, at: 2 },
    { key: "intervene", label: arrival == null ? "No intervention" : "Intervention", icon: arrival == null ? ShieldCheck : Truck, at: arrival ?? Infinity },
    { key: "final", label: "Final state", icon: Flag, at: steps },
  ];
  const activeIdx = milestones.reduce((acc, m, i) => (step >= m.at ? i : acc), 0);
  const hours = (step * mps) / 60;

  return (
    <div className="panel-float flex items-stretch gap-5 px-4 py-3">
      {/* transport */}
      <div className="flex shrink-0 flex-col justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            className="grid h-10 w-10 place-items-center rounded-full bg-[var(--blue)] text-white shadow-[0_4px_12px_rgba(37,99,235,0.3)] disabled:opacity-50"
            disabled={!sim || loading}
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
          </button>
          <button className="grid h-9 w-9 place-items-center rounded-full text-[var(--ink-2)] hover:bg-[#f1f5f9] disabled:opacity-40" disabled={!sim} onClick={() => { setStep(0); setPlaying(false); }} aria-label="Reset playback">
            <RotateCcw size={16} />
          </button>
          <div className="ml-1 flex rounded-lg bg-[#f1f5f9] p-0.5">
            {[1, 2, 4].map((v) => (
              <button key={v} onClick={() => setSpeed(v)} className={`h-7 w-8 rounded-md text-[11.5px] font-bold ${speed === v ? "bg-white shadow-sm" : "text-[var(--ink-2)]"}`}>
                {v}×
              </button>
            ))}
          </div>
        </div>
        <Segmented
          size="sm"
          value={policy}
          onChange={setPolicy}
          options={[
            { value: "none", label: "No response" },
            { value: "first_alert", label: "First-alert" },
            { value: "ai_priority", label: "AI-priority" },
          ]}
        />
      </div>

      {/* progress */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold">Fire progression</span>
            <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-2)]">Hypothetical scenario</span>
          </div>
          <div className="text-[12px] text-[var(--ink-2)] tnum">
            <b className="text-[var(--ink)]">Step {step}</b> / {steps}
            <span className="text-[var(--ink-3)]"> · ≈{hours.toFixed(1)} h at {mps} min/step (assumed)</span>
          </div>
        </div>
        <div className="relative mt-3">
          <div className="absolute left-0 right-0 top-[13px] h-[3px] rounded-full bg-[#e9eef5]" />
          <div className="absolute left-0 top-[13px] h-[3px] rounded-full bg-[var(--blue)] transition-all" style={{ width: `${(step / steps) * 100}%` }} />
          <div className="relative flex justify-between">
            {milestones.map((m, i) => {
              const done = i <= activeIdx && m.at !== Infinity;
              const Icon = m.icon;
              return (
                <div key={m.key} className="flex w-24 flex-col items-center first:items-start last:items-end">
                  <span className={`grid h-7 w-7 place-items-center rounded-full ring-4 ring-white transition ${done ? (i === activeIdx ? "bg-[var(--blue)] text-white" : "bg-[var(--blue-50)] text-[var(--blue)]") : "bg-[#eef2f7] text-[var(--ink-3)]"}`}>
                    <Icon size={13} />
                  </span>
                  <span className={`mt-1.5 text-[11.5px] font-semibold ${done ? "text-[var(--ink)]" : "text-[var(--ink-3)]"}`}>{m.label}</span>
                  <span className="text-[10.5px] text-[var(--ink-3)] tnum">{m.at === Infinity ? "—" : `step ${m.at}`}</span>
                </div>
              );
            })}
          </div>
        </div>
        <input
          type="range"
          className="tg-range mt-1"
          min={0}
          max={steps}
          value={step}
          disabled={!sim}
          onChange={(e) => { setStep(Number(e.target.value)); setPlaying(false); }}
          style={{ ["--fill" as string]: `${(step / steps) * 100}%` }}
          aria-label="Simulation step"
        />
      </div>

      {/* live counts for this frame */}
      <div className="hidden w-[150px] shrink-0 flex-col justify-center gap-1.5 border-l border-[var(--line-2)] pl-4 2xl:flex">
        <Count color="#ff8a35" label="Burning" v={burning} />
        <Count color="#5d636b" label="Burned" v={burned} />
        <Count color="#06b6d4" label="Intervention" v={intervened} />
        <span className="text-[10.5px] text-[var(--ink-3)]">cells, all plots, this step</span>
      </div>
    </div>
  );
}

function Count({ color, label, v }: { color: string; label: string; v: number }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      <span className="text-[var(--ink-2)]">{label}</span>
      <b className="ml-auto tnum">{v}</b>
    </div>
  );
}
