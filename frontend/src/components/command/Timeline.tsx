"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

export function Timeline() {
  const sim = useStore(s => s.sim);
  const policy = useStore(s => s.policy);
  const setPolicy = useStore(s => s.setPolicy);
  const step = useStore(s => s.step);
  const setStep = useStore(s => s.setStep);
  const playing = useStore(s => s.playing);
  const setPlaying = useStore(s => s.setPlaying);
  const speed = useStore(s => s.speed);
  const setSpeed = useStore(s => s.setSpeed);
  const loading = useStore(s => s.simLoading);
  const steps = sim?.steps ?? 48;
  const minutesPerStep = Number(sim?.assumptions.minutes_per_step ?? 30);

  useEffect(() => {
    if (!playing || !sim) return;
    const id = setInterval(() => {
      const state = useStore.getState();
      if (state.step >= steps) state.setPlaying(false);
      else state.setStep(state.step + 1);
    }, 420 / speed);
    return () => clearInterval(id);
  }, [playing, speed, steps, sim]);

  const policies = [
    { value: "none" as const, label: "No intervention" },
    { value: "first_alert" as const, label: "First-alert-first" },
    { value: "ai_priority" as const, label: "AI-prioritized" },
    ...(sim?.policies.coordinator ? [{ value: "coordinator" as const, label: "Your assignment" }] : []),
  ];
  return <section className="forest-playback" aria-label="Simulation timeline">
    <div className="playback-policy-row"><span className="eyebrow">COMPARE POLICIES</span><div className="playback-policies">{policies.map(p => <button key={p.value} aria-pressed={policy === p.value} disabled={!sim || loading} onClick={() => setPolicy(p.value)}>{p.label}</button>)}</div><span className="playback-test-tag">Hypothetical test</span></div>
    <div className="playback-transport">
      <button className="playback-play" disabled={!sim || loading} aria-label={playing ? "Pause" : "Play"} onClick={() => { if (!playing && step >= steps) setStep(0); setPlaying(!playing); }}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button>
      <button className="playback-reset" disabled={!sim} aria-label="Reset playback" onClick={() => { setStep(0); setPlaying(false); }}><RotateCcw size={15}/></button>
      <div className="playback-track"><div><span>Fire progression</span><b className="tnum">Step {step} / {steps} <small>· ≈{(step * minutesPerStep / 60).toFixed(1)} h</small></b></div><input type="range" className="tg-range" min={0} max={steps} value={step} disabled={!sim} onChange={e => { setStep(Number(e.target.value)); setPlaying(false); }} style={{ ["--fill" as string]: `${step / steps * 100}%` }} aria-label="Simulation step"/></div>
      <label className="playback-speed"><span>Speed</span><select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[1,2,4].map(v => <option key={v} value={v}>{v}×</option>)}</select></label>
    </div>
  </section>;
}
