"use client";

import {
  AlertTriangle, ArrowLeft, ArrowRight, Box, CheckCircle2, ChevronDown, ClipboardCheck, FileBarChart2, Flame, Gauge,
  Loader2, Lock, Pause, Play, Route, ShieldAlert, ShieldCheck, Sparkles, Waves, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { num, pct, shortId, utc } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ActionType, BurnReplay, PredictionReport, RecommendationReport, ReportAction } from "@/lib/types";
import { FactorList } from "./explain/ExplainSections";

/* ------------------------------------------------------------------ shared bits */
const TONE: Record<string, string> = {
  red: "bg-[var(--red-50)] text-[var(--red-700)] ring-[var(--red-200)]",
  fire: "bg-[var(--fire-50)] text-[var(--fire-700)] ring-[var(--fire-200)]",
  blue: "bg-[var(--blue-50)] text-[var(--blue-700)] ring-[var(--blue-200)]",
  green: "bg-[var(--green-50)] text-[var(--green-700)] ring-[var(--green-200)]",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  slate: "bg-slate-50 text-slate-600 ring-slate-200",
};
const LEVEL_TONE: Record<string, string> = {
  Critical: "red", High: "fire", Moderate: "blue", Low: "slate", Medium: "amber", Strong: "green", Weak: "amber",
};

function Pill({ children, tone }: { children: ReactNode; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ring-1 ring-inset ${TONE[tone] ?? TONE.slate}`}>
      {children}
    </span>
  );
}

function Card({ title, icon, children, aside, className = "" }: { title?: string; icon?: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[14px] border border-[var(--line)] bg-white p-4 ${className}`}>
      {title && (
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[13px] font-bold text-[var(--ink)]">{icon}{title}</h3>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

function CheckRow({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--line-2)] py-1.5 last:border-0">
      {ok ? <CheckCircle2 size={14} className="shrink-0 text-[var(--green)]" /> : <AlertTriangle size={14} className="shrink-0 text-amber-600" />}
      <span className="flex-1 text-[12px] text-[var(--ink-2)]">{label}</span>
      <span className={`text-[12px] font-semibold ${ok ? "text-[var(--ink)]" : "text-amber-700"}`}>{value}</span>
    </div>
  );
}

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group rounded-[14px] border border-[var(--line)] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] font-bold [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown size={15} className="text-[var(--ink-3)] transition group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------ prediction step */
function Tile({ label, value, sub, pill, children }: { label: string; value: ReactNode; sub: string; pill?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[14px] border border-[var(--line)] bg-white p-3.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">{label}</span>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[22px] font-extrabold leading-none tracking-tight tnum">{value}</span>
        {pill}
      </div>
      {children}
      <p className="mt-auto pt-2 text-[11.5px] leading-snug text-[var(--ink-2)]">{sub}</p>
    </div>
  );
}

function PredictionView({ r, incidentId }: { r: PredictionReport; incidentId: string }) {
  const pred = useStore((s) => s.predictions[incidentId]);
  const p = r.prediction;
  const nz = r.reliability.noise;
  const fp = r.footprint;
  return (
    <div className="space-y-3">
      {/* verdict strip */}
      <div className={`grid gap-2.5 sm:grid-cols-2 ${fp ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <Tile label="48 h follow-up" value={pct(p.probability)} pill={<Pill tone={LEVEL_TONE[p.risk_category === "Medium" ? "Medium" : p.risk_category === "High" ? "High" : "Low"]}>{p.risk_category} risk</Pill>}
          sub={`Chance of a later satellite detection. Alert threshold ${pct(p.threshold)}.`}>
          <div className="relative mt-2.5 h-1.5 rounded-full bg-[#eef2f7]">
            <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--fire)]" style={{ width: `${p.probability * 100}%` }} />
            <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-[var(--ink)]" style={{ left: `${p.threshold * 100}%` }} />
          </div>
        </Tile>
        {fp && (
          <Tile label="48 h footprint" value={<>{num(fp.median_km2, 2)}<span className="ml-1 text-[13px] font-bold text-[var(--ink-2)]">km²</span></>}
            pill={<Pill tone="blue">{pct(fp.probability_any)} chance</Pill>}
            sub={`If activity continues: ${num(fp.p10_km2, 2)}–${num(fp.p90_km2, 2)} km² of detected fire pixels within ${fp.radius_km} km (10–90%). Past 24 h: ${num(fp.past_km2, 2)} km².`} />
        )}
        <Tile label="Evidence strength" value={p.evidence_quality} pill={<span className={`h-2 w-2 rounded-full ${p.evidence_quality === "Strong" ? "bg-[var(--green)]" : p.evidence_quality === "Moderate" ? "bg-amber-500" : "bg-[var(--red)]"}`} />}
          sub="Detection history and corroborating detections around this alert." />
        <Tile label="Heat signal" value={r.heat_signal.level} pill={<Flame size={15} className="text-[var(--fire)]" />}
          sub="Intensity of this detection only. Weak heat with strong history is common for smouldering or small fires." />
        <Tile label="Pattern" value={<span className="text-[15px] leading-tight">{r.anomaly.label}</span>}
          pill={r.anomaly.unusual ? <Pill tone="amber">Unusual</Pill> : <ShieldAlert size={15} className="text-[var(--blue)]" />}
          sub={r.anomaly.requires_verification ? "Verification aid, not a finding." : "No unusual pattern flagged."} />
      </div>

      {pred?.decision_summary && (
        <div className="flex gap-2.5 rounded-[14px] bg-[#172638] px-4 py-3 text-[13px] leading-relaxed text-white">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-[var(--fire)]" />
          <p>{pred.decision_summary}</p>
        </div>
      )}

      {/* drivers */}
      <Card title="What drove the estimate" icon={<FileBarChart2 size={14} className="text-[var(--ink-2)]" />}
        aside={<span className="text-[11px] text-[var(--ink-3)]">Contribution to the model estimate</span>}>
        {pred ? <FactorList pred={pred} /> : (
          <ol className="space-y-1.5">{r.proof.map((x, i) => <li key={i} className="text-[12.5px]">{x}</li>)}</ol>
        )}
        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[12px] font-semibold text-[var(--blue)] [&::-webkit-details-marker]:hidden">
            Evidence details <ChevronDown size={13} className="transition group-open:rotate-180" />
          </summary>
          <ol className="mt-2 space-y-1.5">
            {r.proof.map((x, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-snug text-[var(--ink-2)]">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#eef2f7] text-[10.5px] font-bold tnum">{i + 1}</span>{x}
              </li>
            ))}
          </ol>
        </details>
      </Card>

      {/* trust */}
      <div className={`grid gap-2.5 sm:grid-cols-2 ${fp ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Card title="Noise test" icon={<Waves size={14} className="text-[var(--cyan)]" />}
          aside={nz.available ? <Pill tone={nz.stable ? "green" : "amber"}>{nz.stable ? "Stable" : "Sensitive"}</Pill> : null}>
          {nz.available && nz.range_5_95 ? (
            <>
              <div className="relative mt-1 h-2 rounded-full bg-[#eef2f7]">
                <div className="absolute inset-y-0 rounded-full bg-[var(--cyan)]/50" style={{ left: `${nz.range_5_95[0] * 100}%`, width: `${Math.max((nz.range_5_95[1] - nz.range_5_95[0]) * 100, 1.5)}%` }} />
                <div className="absolute -top-1 h-4 w-0.5 bg-[var(--ink)]" style={{ left: `${p.threshold * 100}%` }} title="Alert threshold" />
              </div>
              <p className="mt-2 text-[11.5px] leading-snug text-[var(--ink-2)]">{nz.text}</p>
            </>
          ) : <p className="text-[12px] text-[var(--ink-2)]">Not available.</p>}
        </Card>
        <Card title="False alarms" icon={<ShieldCheck size={14} className="text-[var(--green)]" />}>
          <div className="grid grid-cols-3 gap-1.5">
            {([["Precision", r.false_alarms.precision], ["FPR", r.false_alarms.false_positive_rate], ["Recall", r.false_alarms.recall]] as const).map(([k, v]) => (
              <div key={k} className="rounded-[9px] bg-[#f6f8fb] px-2 py-1.5">
                <div className="text-[10px] font-semibold text-[var(--ink-3)]">{k}</div>
                <div className="text-[14px] font-extrabold tnum">{pct(v, 0)}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[var(--ink-3)]">At the alert threshold · {r.false_alarms.period}</p>
        </Card>
        <Card title="Data checks" icon={<CheckCircle2 size={14} className="text-[var(--ink-2)]" />}>
          <CheckRow ok={!r.reliability.missing_weather} label="Weather record" value={r.reliability.missing_weather ? "Filled in" : "Available"} />
          <CheckRow ok={!r.reliability.unusual_inputs} label="Unusual inputs" value={r.reliability.unusual_inputs ? "Yes" : "No"} />
          <CheckRow ok={r.reliability.satellite_evidence !== "Weak"} label="Satellite evidence" value={r.reliability.satellite_evidence} />
        </Card>
        {fp && (
          <Card title="Footprint forecast quality" icon={<Gauge size={14} className="text-[var(--blue)]" />}>
            <div className="grid grid-cols-3 gap-1.5">
              {([["Ranking", num(fp.eval.spearman, 2), num(fp.eval.persistence_spearman, 2)],
                 ["Error km²", num(fp.eval.mae_km2, 2), num(fp.eval.persistence_mae_km2, 2)],
                 ["AUC", num(fp.eval.auc_any, 2), null]] as const).map(([k, v, base]) => (
                <div key={k} className="rounded-[9px] bg-[#f6f8fb] px-2 py-1.5">
                  <div className="text-[10px] font-semibold text-[var(--ink-3)]">{k}</div>
                  <div className="text-[14px] font-extrabold tnum">{v}</div>
                  {base && <div className="text-[10px] text-[var(--ink-3)] tnum">last 24 h: {base}</div>}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-[var(--ink-3)]">
              {fp.eval.n_test.toLocaleString()} held-out 2025 incidents; {fp.eval.beats_persistence ? "better than" : "not better than"} repeating the last 24 h.
              Size range held the true value {pct(fp.eval.coverage_10_90)} of the time (target 80%).
            </p>
          </Card>
        )}
      </div>

      <Card title="Observation pattern" icon={<ShieldAlert size={14} className="text-[var(--blue)]" />}
        aside={<Pill tone={r.anomaly.requires_verification ? "blue" : "slate"}>{r.anomaly.label}</Pill>}>
        <p className="text-[12.5px] leading-relaxed">{r.anomaly.meaning}</p>
        {r.anomaly.proof.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {r.anomaly.proof.map((x) => <li key={x} className="flex gap-2 text-[12px] text-[var(--ink-2)]"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--blue)]" />{x}</li>)}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-[var(--ink-3)]">
          {r.anomaly.anomaly_percentile != null && <>More unusual than {r.anomaly.anomaly_percentile.toFixed(0)}% of validation incidents (Isolation Forest). </>}
          {r.anomaly.disclaimer}
        </p>
      </Card>

      <Disclosure label="Limitations and what would improve confidence">
        <ul className="space-y-1.5 text-[12.5px]">
          {r.reliability.improve_confidence.map((g) => <li key={g.code}><b>{g.missing}.</b> <span className="text-[var(--ink-2)]">{g.verification_step}</span></li>)}
          {fp && <li className="text-[var(--ink-2)]">{fp.note}</li>}
          {r.limits.map((l) => <li key={l} className="text-[var(--ink-2)]">{l}</li>)}
        </ul>
      </Disclosure>
    </div>
  );
}

/* ------------------------------------------------------------------ burn preview */
const CELL_COLOR = ["#e9e4d8", "#3f9a64", "#ff6a1a", "#3a3f47", "#06b6d4"];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setReduced(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return reduced;
}

function BurnPreview({ replay, crew, avg }: { replay: BurnReplay; crew: boolean; avg: number }) {
  const frames = crew ? replay.crew_here : replay.no_crew;
  const reduced = useReducedMotion();
  const [tick, setTick] = useState({ frames, step: 0 });
  const [playing, setPlaying] = useState(true);
  const ref = useRef<HTMLCanvasElement>(null);
  // restart from step 0 whenever the option (and so the frame set) changes
  const step = tick.frames === frames ? tick.step : 0;
  const last = frames.length - 1;
  const s = reduced ? last : Math.min(step, last);

  useEffect(() => {
    if (reduced || !playing) return;
    // hold the final frame for a moment, then loop
    const id = window.setInterval(
      () => setTick((t) => ({ frames, step: t.frames !== frames ? 1 : t.step >= last + 8 ? 0 : t.step + 1 })),
      110,
    );
    return () => window.clearInterval(id);
  }, [reduced, playing, frames, last]);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (!c) return;
    const f = frames[s];
    for (let i = 0; i < f.length; i++) {
      c.fillStyle = CELL_COLOR[Number(f[i])] ?? CELL_COLOR[0];
      c.fillRect(i % replay.w, Math.floor(i / replay.w), 1, 1);
    }
  }, [s, frames, replay.w]);

  const { burned, burning } = useMemo(() => {
    let b = 0, n = 0;
    for (const ch of frames[s]) {
      if (ch === "2") n++;
      if (ch === "2" || ch === "3") b++;
    }
    return { burned: b, burning: n };
  }, [frames, s]);
  return (
    <div className="flex gap-3">
      <div className="relative shrink-0">
        <canvas ref={ref} width={replay.w} height={replay.h} role="img"
          aria-label={crew ? "Simulated spread with the crew on site" : "Simulated spread without a crew"}
          className="h-[112px] w-[112px] rounded-[10px] ring-1 ring-[var(--line)] [image-rendering:pixelated]" />
        {!reduced && (
          <button type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause preview" : "Play preview"}
            className="absolute bottom-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-[var(--ink)] shadow">
            {playing ? <Pause size={11} /> : <Play size={11} />}
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1 text-[11.5px] leading-snug">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[20px] font-extrabold tnum ${crew ? "text-[var(--ink)]" : "text-[var(--fire-700)]"}`}>{burned}</span>
          <span className="text-[var(--ink-2)]">cells burned · step {s}/{last}</span>
        </div>
        <div className="mt-0.5 text-[var(--ink-2)]">
          {burning > 0 ? <><b className="text-[var(--fire-700)]">{burning}</b> still burning</> : "No active fire"}
          {crew && <> · {s >= replay.response_delay ? <b className="text-[#0e7490]">crew on site</b> : <>crew arrives at step {replay.response_delay}</>}</>}
        </div>
        <div className="mt-1 text-[var(--ink-3)]">This run; average over all runs {num(avg, 1)} cells.</div>
        <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[10.5px] text-[var(--ink-3)]">
          {([["Forest", 1], ["Burning", 2], ["Burned", 3], ["Crew", 4]] as const).map(([k, i]) => (
            <span key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: CELL_COLOR[i] }} />{k}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ recommendation step */
function UrgencyLadder({ r }: { r: RecommendationReport }) {
  const [focus, setFocus] = useState<string | null>(null);
  const shown = r.urgency_table.find((u) => u.level === (focus ?? r.urgency.label)) ?? r.urgency_table[0];
  return (
    <Card title="Urgency" aside={<span className="text-[11px] text-[var(--ink-3)]">Prototype review targets</span>}>
      <div className="grid grid-cols-4 gap-1">
        {r.urgency_table.map((u) => {
          const active = u.level === r.urgency.label;
          return (
            <button key={u.level} type="button" onMouseEnter={() => setFocus(u.level)} onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(u.level)} onBlur={() => setFocus(null)} aria-current={active ? "step" : undefined}
              className={`rounded-[9px] px-2 py-2 text-left ring-1 ring-inset transition ${active ? TONE[LEVEL_TONE[u.level]] : "text-[var(--ink-3)] ring-[var(--line-2)] hover:ring-[var(--line)]"}`}>
              <div className="text-[12px] font-bold">{u.level}</div>
              <div className="truncate text-[10.5px] font-semibold opacity-80">{u.window}</div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] leading-snug text-[var(--ink-2)]">
        <b className="text-[var(--ink)]">{shown.level}:</b> {shown.meaning} → {shown.action}.
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {r.urgency.reasons.map((x) => <li key={x} className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[11px] text-[var(--ink-2)]">{x}</li>)}
      </ul>
    </Card>
  );
}

const OPTION_ICON: Record<ReportAction, ReactNode> = {
  SEND_CREW: <ArrowRight size={14} />, ESCALATE: <ClipboardCheck size={14} />, RECHECK: <Waves size={14} />, MONITOR: <Gauge size={14} />,
};

function optionConsequences(o: ReportAction, r: RecommendationReport): string[] {
  const c = r.consequences;
  if (o === "SEND_CREW") return [...(r.feasibility.actionable ? [] : r.feasibility.reasons.slice(0, 1)), ...c.over_response.slice(0, 3)];
  if (o === "ESCALATE") return ["Partner response is not modelled; the preview shows the spread if nobody reaches the site in time.", ...c.under_response.slice(0, 1)];
  return c.under_response;
}

function RecommendationView({ r, choice, setChoice }: { r: RecommendationReport; choice: ReportAction; setChoice: (a: ReportAction) => void }) {
  const incidentId = useStore((s) => s.report.incidentId);
  const watch = useStore((s) => s.watchConsequence);
  const sim = r.consequences.simulation;
  const maxBenefit = Math.max(...sim.crew_benefit_by_incident.map((b) => Math.abs(b.cells)), 0.1);
  const opt = r.options.find((o) => o.action === choice) ?? r.options[0];
  const crew = choice === "SEND_CREW";

  return (
    <div className="space-y-3">
      <section className="rounded-[16px] bg-[#172638] p-5 text-white">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">Recommended action</span>
          <Pill tone={LEVEL_TONE[r.urgency.label]}>{r.urgency.label} urgency</Pill>
          {r.urgency.review_window && <span className="text-[11.5px] font-semibold text-white/70">· {r.urgency.review_window}</span>}
        </div>
        <div className="mt-1.5 text-[26px] font-extrabold tracking-tight">{r.action_label}</div>
        <p className="mt-1 max-w-[680px] text-[13px] leading-relaxed text-white/80">{r.why}</p>
      </section>

      <UrgencyLadder r={r} />

      {/* interactive options */}
      <Card title="Choose an action and see what could follow" icon={<Flame size={14} className="text-[var(--fire)]" />}>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="radiogroup" aria-label="Action options">
          {r.options.map((o) => {
            const blocked = o.action === "SEND_CREW" && !r.feasibility.actionable;
            const on = choice === o.action;
            return (
              <button key={o.action} type="button" role="radio" aria-checked={on} onClick={() => setChoice(o.action)}
                className={`min-h-[64px] rounded-[12px] px-3 py-2.5 text-left transition ${on ? "bg-[var(--blue-50)] ring-2 ring-inset ring-[var(--blue)]" : "ring-1 ring-inset ring-[var(--line)] hover:ring-[#cdd8e5]"}`}>
                <div className="flex items-center gap-1.5 text-[12.5px] font-bold">{OPTION_ICON[o.action]}{o.label}</div>
                <div className="mt-1">
                  {o.recommended ? <Pill tone="green">Recommended</Pill> : blocked ? <Pill tone="amber"><Lock size={10} /> Needs coordination</Pill> : <Pill tone="slate">Available</Pill>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid gap-3 rounded-[12px] bg-[#f6f8fb] p-3 md:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">If you choose “{opt.label}”</div>
            <ul className="mt-1.5 space-y-1.5">
              {optionConsequences(choice, r).map((x) => (
                <li key={x} className="flex gap-2 text-[12.5px] leading-snug">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${crew ? "bg-[var(--blue)]" : "bg-[var(--fire)]"}`} />{x}
                </li>
              ))}
            </ul>
          </div>
          <div className="md:w-[300px]">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">{crew ? "Simulated: crew on site" : "Simulated: no crew at this incident"}</div>
            {sim.replay && <BurnPreview replay={sim.replay} crew={crew} avg={crew ? sim.crew_here.mean : sim.no_crew_here.mean} />}
            {incidentId && (
              <button type="button" className="btn btn-secondary mt-2 h-8 w-full text-[12px]" onClick={() => watch(incidentId, opt.record as ActionType)}>
                <Box size={14} /> Watch this in 3D
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-[var(--ink-3)]">{sim.replay?.note ?? sim.note}</p>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Crew feasibility" icon={<Route size={14} className="text-[var(--ink-2)]" />}
          aside={<Pill tone={r.feasibility.status === "FEASIBLE" ? "green" : r.feasibility.status === "REQUIRES_COORDINATION" ? "amber" : "slate"}>{r.feasibility.label}</Pill>}>
          <CheckRow ok label="Crew base" value={r.feasibility.crew_base_jurisdiction} />
          <CheckRow ok={!r.feasibility.cross_border} label="Cross-border" value={r.feasibility.cross_border ? "Yes" : "No"} />
          <CheckRow ok={r.feasibility.straight_line_km <= 250} label="Straight-line distance" value={`${num(r.feasibility.straight_line_km, 0)} km`} />
          <CheckRow ok={false} label="Route / ETA" value="Unavailable" />
          <p className="mt-2 text-[11.5px] leading-snug text-[var(--ink-2)]">{r.feasibility.reasons[0]} {r.feasibility.travel_note}</p>
        </Card>
        <Card title="Simulated effect of the crew" icon={<Gauge size={14} className="text-[var(--ink-2)]" />}
          aside={<span className="text-[11px] text-[var(--ink-3)]">{sim.runs} runs</span>}>
          {([["Crew here", sim.crew_here, "var(--cyan)"], ["No crew here", sim.no_crew_here, "var(--fire)"]] as const).map(([label, v, c]) => (
            <div key={label} className="mt-1">
              <div className="flex justify-between text-[11.5px]"><span>{label}</span><b className="tnum">{num(v.mean, 1)} ± {num(v.ci95, 1)} cells</b></div>
              <div className="mt-0.5 h-1.5 rounded-full bg-[#eef2f7]"><div className="h-1.5 rounded-full" style={{ width: `${Math.min((v.mean / Math.max(sim.no_crew_here.mean, sim.crew_here.mean, 0.1)) * 100, 100)}%`, background: c }} /></div>
            </div>
          ))}
          <div className="mt-3 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">Cells averted, per incident</div>
          {sim.crew_benefit_by_incident.map((b) => (
            <div key={b.incident_id} className="mt-1 flex items-center gap-2 text-[11.5px]">
              <span className="w-[92px] shrink-0 truncate">{b.label}{b.incident_id === incidentId && " (this)"}</span>
              <div className="h-1.5 flex-1 rounded-full bg-[#eef2f7]"><div className="h-1.5 rounded-full bg-[var(--green)]" style={{ width: `${(Math.max(b.cells, 0) / maxBenefit) * 100}%` }} /></div>
              <b className="w-10 text-right tnum">{b.cells >= 0 ? "+" : ""}{num(b.cells, 1)}</b>
            </div>
          ))}
          {sim.tradeoff && (
            <p className="mt-2.5 flex gap-2 rounded-[10px] bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-900 ring-1 ring-inset ring-amber-200">
              <AlertTriangle size={13} className="mt-px shrink-0" />{sim.tradeoff}
            </p>
          )}
        </Card>
      </div>

      <Card title="Ranking and who waits">
        <p className="text-[12.5px] leading-relaxed">{r.ranking.text}</p>
        {r.waiting.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {r.waiting.map((w) => (
              <span key={w.incident_id} className="rounded-full border border-[var(--line)] px-3 py-1 text-[11.5px]">
                <b>{w.label}</b> · {w.region} · rank {w.rank} · {pct(w.probability)} · {w.recommendation.toLowerCase()}
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ApprovalBar({ r, choice }: { r: RecommendationReport; choice: ReportAction }) {
  const decide = useStore((s) => s.decide);
  const closeReport = useStore((s) => s.closeReport);
  const watch = useStore((s) => s.watchConsequence);
  const incidentId = useStore((s) => s.report.incidentId);
  const opt = r.options.find((o) => o.action === choice) ?? r.options[0];
  const override = choice !== r.action;
  const [reason, setReason] = useState(override ? "" : r.why);
  const [confirmFeas, setConfirmFeas] = useState(false);
  const [busy, setBusy] = useState(false);
  const needsFeasConfirm = choice === "SEND_CREW" && !r.feasibility.actionable;

  const approve = async () => {
    if (!incidentId) return;
    setBusy(true);
    const text = needsFeasConfirm ? `${reason.trim()} [Coordinator confirmed feasibility manually: ${r.feasibility.label}]` : reason.trim();
    const ok = await decide(incidentId, opt.record as ActionType, text);
    setBusy(false);
    if (!ok) return;
    // choosing against the recommendation plays the simulated consequence in 3D
    if (override) await watch(incidentId, opt.record as ActionType);
    else closeReport();
  };

  return (
    <div className="space-y-2">
      {override && (
        <p className="flex items-start gap-2 text-[11.5px] leading-snug text-amber-800">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          This differs from the recommendation ({r.action_label}). Say why for the record; the 3D test will then play the simulated consequence.
        </p>
      )}
      {needsFeasConfirm && (
        <label className="flex items-start gap-2 rounded-[10px] bg-amber-50 p-2 text-[11.5px] text-amber-900 ring-1 ring-inset ring-amber-200">
          <input type="checkbox" className="mt-0.5 accent-amber-600" checked={confirmFeas} onChange={(e) => setConfirmFeas(e.target.checked)} />
          Crew assignment {r.feasibility.label.toLowerCase()}. I have confirmed authorisation and access manually.
        </label>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={600} aria-label="Reason for the record"
          placeholder={override ? "Why are you choosing differently?" : "Reason for the record"}
          className="h-10 min-w-0 flex-1 rounded-[10px] border border-[var(--line)] px-3 text-[12.5px] outline-none focus:border-[var(--blue)]" />
        <button className="btn btn-primary h-10 shrink-0" disabled={busy || !reason.trim() || (needsFeasConfirm && !confirmFeas)} onClick={approve}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Record: {opt.label}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ canvas shell */
export function ReportCanvas() {
  const report = useStore((s) => s.report);
  const close = useStore((s) => s.closeReport);
  const setTab = useStore((s) => s.setReportTab);
  const data = useStore((s) => s.data);
  const [picked, setPicked] = useState<{ key: string; action: ReportAction } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const rec = report.data?.recommendation_report;
  // the selection resets to the recommendation whenever a new report loads
  const key = rec ? `${report.data?.incident_id}-${rec.title}-${rec.action}` : "";
  const current: ReportAction = (picked?.key === key ? picked.action : rec?.action) ?? "MONITOR";

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [report.tab]);
  useEffect(() => {
    if (!report.open) return;
    const opener = document.activeElement as HTMLElement | null;
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("keydown", k);
      opener?.focus?.();
    };
  }, [report.open, close]);
  if (!report.open) return null;
  const inc = data?.incidents.find((i) => i.id === report.incidentId);
  const steps = [
    { id: "prediction" as const, n: 1, label: "Prediction" },
    { id: "recommendation" as const, n: 2, label: "Recommendation" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-[#172638]/40 p-2 backdrop-blur-[2px] sm:p-6" onClick={close}>
      <div className="animate-in flex max-h-full w-full max-w-[1040px] flex-col overflow-hidden rounded-[18px] bg-[var(--bg)] shadow-[0_30px_80px_rgba(23,38,56,0.3)]"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Incident reports">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-[var(--line)] bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Incident report{inc ? ` · ${inc.region}, ${inc.country}` : ""}</div>
            <div className="truncate text-[17px] font-bold">
              {report.incidentId ? shortId(report.incidentId) : "Incident"}
              {inc && <span className="ml-2 text-[12.5px] font-medium text-[var(--ink-2)]">first detected {utc(inc.observed_at)}</span>}
            </div>
          </div>
          <div className="order-last flex w-full items-center gap-1.5 sm:order-none sm:w-auto" role="tablist" aria-label="Report steps">
            {steps.map((t, i) => {
              const on = report.tab === t.id;
              return (
                <div key={t.id} className="flex flex-1 items-center gap-1.5 sm:flex-none">
                  {i > 0 && <span className="h-px w-5 bg-[var(--line)]" aria-hidden />}
                  <button role="tab" aria-selected={on} onClick={() => setTab(t.id)}
                    className={`flex h-9 flex-1 items-center gap-2 rounded-full pl-1.5 pr-3 sm:flex-none text-[12.5px] font-semibold transition ${on ? "bg-[#172638] text-white" : "text-[var(--ink-2)] hover:bg-[#eef2f7]"}`}>
                    <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${on ? "bg-white text-[#172638]" : "bg-[#eef2f7]"}`}>{t.n}</span>
                    {t.label}
                  </button>
                </div>
              );
            })}
          </div>
          <button onClick={close} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-white text-[var(--ink-2)]" aria-label="Close reports"><X size={16} /></button>
        </header>

        <div ref={scroller} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
          {report.loading && (
            <div className="grid place-items-center py-24 text-center text-[13px] text-[var(--ink-2)]">
              <Loader2 size={22} className="mb-2 animate-spin text-[var(--blue)]" />
              Composing reports from the models, the evidence rules and matched simulation runs…
            </div>
          )}
          {report.error && <div className="rounded-[12px] bg-[var(--red-50)] p-4 text-[13px] text-[var(--red-700)]">{report.error}</div>}
          {report.data && report.tab === "prediction" && <PredictionView r={report.data.prediction_report} incidentId={report.data.incident_id} />}
          {report.data && rec && report.tab === "recommendation" && (
            <RecommendationView r={rec} choice={current} setChoice={(a) => setPicked({ key, action: a })} />
          )}
        </div>

        {report.data && rec && (
          <footer className="border-t border-[var(--line)] bg-white px-4 py-3 sm:px-5">
            {report.tab === "prediction" ? (
              <div className="flex items-center justify-between gap-3">
                <span className="hidden text-[11.5px] text-[var(--ink-3)] sm:block">Estimates satellite activity and detected footprint; not fire spread or damage.</span>
                <button className="btn btn-primary h-10 w-full sm:w-auto" onClick={() => setTab("recommendation")}>Next: Recommendation <ArrowRight size={15} /></button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
                <div className="hidden shrink-0 lg:block">
                  <button className="btn btn-secondary h-10" onClick={() => setTab("prediction")}><ArrowLeft size={15} /> Prediction</button>
                </div>
                <div className="min-w-0 flex-1"><ApprovalBar key={`${key}-${current}`} r={rec} choice={current} /></div>
              </div>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

export function ReportButton({ incidentId, className = "" }: { incidentId?: string | null; className?: string }) {
  const openReport = useStore((s) => s.openReport);
  return (
    <button className={`btn btn-secondary ${className}`} onClick={() => openReport(incidentId)}>
      <FileBarChart2 size={15} /> Prediction &amp; recommendation reports
    </button>
  );
}

const ACTION_NAME: Record<ActionType, string> = {
  ASSIGN_INSPECTION: "Send crew", ESCALATE_COORDINATION: "Escalate", REQUEST_RECHECK: "Recheck",
  CONTINUE_MONITORING: "Monitor", DISMISS: "Dismiss",
};

/** Shown over the 3D test while it plays the consequence of a choice. */
export function ConsequenceBanner() {
  const c = useStore((s) => s.consequence);
  const view = useStore((s) => s.view);
  const simLoading = useStore((s) => s.simLoading);
  const openReport = useStore((s) => s.openReport);
  const clear = useStore((s) => s.clearConsequence);
  if (!c || view !== "sim") return null;
  return (
    <div role="status" className="animate-in absolute left-1/2 top-3 z-20 flex w-[min(640px,calc(100%-24px))] -translate-x-1/2 items-center gap-3 rounded-[14px] bg-[#172638] px-4 py-2.5 text-white shadow-[0_12px_32px_rgba(23,38,56,0.35)]">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${c.crewHere ? "bg-[var(--cyan)]/20 text-[var(--cyan)]" : "bg-[var(--fire)]/20 text-[var(--fire)]"}`}>
        {simLoading ? <Loader2 size={15} className="animate-spin" /> : <Flame size={15} />}
      </span>
      <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
        <b>Consequence preview · {ACTION_NAME[c.action]}</b>
        <div className="truncate text-white/70">
          {shortId(c.incidentId)} {c.crewHere ? "with the crew on site" : "without a crew"} · hypothetical simulation, not a forecast
        </div>
      </div>
      <button className="h-8 shrink-0 rounded-lg bg-white px-3 text-[12px] font-semibold text-[#172638]" onClick={() => openReport(c.incidentId, "recommendation")}>
        Back to report
      </button>
      <button className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/10" onClick={clear} aria-label="Dismiss consequence preview">
        <X size={15} />
      </button>
    </div>
  );
}
