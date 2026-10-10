"use client";

import { Flag, Flame, Pause, Play, RotateCcw, Satellite, ShieldCheck, Truck } from "lucide-react";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { PLAYBACK_STEP_MS } from "@/lib/crewMotion";

export function Timeline() {
  const sim = useStore(s => s.sim);
  const policy = useStore(s => s.policy);
  const playbackRun = useStore(s => s.playbackRun);
  const setPolicy = useStore(s => s.setPolicy);
  const step = useStore(s => s.step);
  const setStep = useStore(s => s.setStep);
  const playing = useStore(s => s.playing);
  const setPlaying = useStore(s => s.setPlaying);
  const speed = useStore(s => s.speed);
  const setSpeed = useStore(s => s.setSpeed);
  const loading = useStore(s => s.simLoading);
  const crewMode = useStore(s => s.crewMode);
  const setCrewMode = useStore(s => s.setCrewMode);
  const steps = sim?.steps ?? 48;
  const minutesPerStep = Number(sim?.assumptions.minutes_per_step ?? 30);
  const assigned = sim?.policies[policy]?.assigned ?? [];
  const destinations = sim?.plots.filter(plot => assigned.includes(plot.incident_id)).map((plot) => {
    const index = sim.plots.indexOf(plot);
    return String.fromCharCode(65 + index);
  }) ?? [];

  useEffect(() => {
    if (!playing || !sim) return;
    const id = setInterval(() => {
      const state = useStore.getState();
      if (state.step >= steps) state.playbackEnded();
      else state.setStep(state.step + 1);
    }, PLAYBACK_STEP_MS / speed);
    return () => clearInterval(id);
  }, [playing, speed, steps, sim, policy, playbackRun]);

  const oneCrew = sim ? sim.teams === 1 : crewMode === 1;
  const policies = oneCrew
    ? [
        ...(sim?.policies.coordinator ? [{ value: "coordinator" as const, label: "Your assignment" }] : []),
        { value: "first_alert" as const, label: "First-alert" },
        { value: "ai_priority" as const, label: "AI-priority" },
        { value: "none" as const, label: "No crew" },
      ]
    : [
        { value: "none" as const, label: "No intervention" },
        { value: "first_alert" as const, label: "First-alert-first" },
        { value: "ai_priority" as const, label: "AI-prioritized" },
      ];

  // the run's phases, as in the earlier timeline
  const arrival = assigned.length && sim ? sim.response_delay : null;
  const phases = [
    { key: "detect", label: "Initial detection", icon: Satellite, at: 0 },
    { key: "ignite", label: "Ignition", icon: Flame, at: 1 },
    { key: "progress", label: "Fire progression", icon: Flame, at: 2 },
    { key: "crew", label: arrival == null ? "No crew" : "Crew on site", icon: arrival == null ? ShieldCheck : Truck, at: arrival ?? Infinity },
    { key: "final", label: "Final state", icon: Flag, at: steps },
  ];
  const active = phases.reduce((acc, p, i) => (step >= p.at ? i : acc), 0);

  return <section className="forest-playback" aria-label="Simulation timeline">
    <div className="playback-policy-row">
      <span className="eyebrow">COMPARE POLICIES</span>
      <div className="playback-policies">{policies.map(p => <button key={p.value} aria-pressed={policy === p.value} disabled={!sim || loading} onClick={() => setPolicy(p.value)}>{p.label}</button>)}</div>
      <div className="playback-crews" role="group" aria-label="Crews in the response test">
        {([1, 3] as const).map(m => <button key={m} aria-pressed={crewMode === m} disabled={loading} onClick={() => setCrewMode(m)}>{m === 1 ? "1 crew" : "3 crews"}</button>)}
      </div>
      <span className="playback-test-tag">Hypothetical test</span>
    </div>
    <div className="playback-transport">
      <button className="playback-play" disabled={!sim || loading} aria-label={playing ? "Pause" : "Play"} onClick={() => { if (!playing && step >= steps) setStep(0); setPlaying(!playing); }}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button>
      <button className="playback-reset" disabled={!sim} aria-label="Reset playback" onClick={() => { setStep(0); setPlaying(false); }}><RotateCcw size={15}/></button>
      <div className="playback-track">
        <div><span>Fire progression</span><b className="tnum">Step {step} / {steps} <small>· ≈{(step * minutesPerStep / 60).toFixed(1)} h</small></b></div>
        <ol className="playback-phases" aria-label="Run phases">
          {phases.map((p, i) => {
            const done = i <= active && p.at !== Infinity;
            const Icon = p.icon;
            return <li key={p.key} className={done ? (i === active ? "is-active" : "is-done") : ""} aria-current={i === active ? "step" : undefined}>
              <span><Icon size={11}/></span>
              <b>{p.label}</b>
              <small className="tnum">{p.at === Infinity ? "—" : `step ${p.at}`}</small>
            </li>;
          })}
        </ol>
        <input type="range" className="tg-range" min={0} max={steps} value={step} disabled={!sim} onChange={e => { setStep(Number(e.target.value)); setPlaying(false); }} style={{ ["--fill" as string]: `${step / steps * 100}%` }} aria-label="Simulation step"/>
      </div>
      <label className="playback-speed"><span>Speed</span><select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[1,2,4].map(v => <option key={v} value={v}>{v}×</option>)}</select></label>
    </div>
    <p className="playback-clock-note">{destinations.length ? `${destinations.length} ${destinations.length === 1 ? "crew" : "crews"} → ${destinations.join(" + ")}` : "No crews dispatched"} · {minutesPerStep} simulated min/step · Burn time {(Number(sim?.assumptions.burn_duration_steps ?? 8) * minutesPerStep / 60).toFixed(1)} h/cell</p>
  </section>;
}
