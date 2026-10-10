"use client";

import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ClipboardCheck, FileBarChart2, Flame, Loader2, MapPin, Route,
  ShieldAlert, ShieldCheck, Waves, X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { num, pct, shortId, utc } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ActionType, PredictionReport, RecommendationReport, ReportAction } from "@/lib/types";

/* ------------------------------------------------------------------ shared bits */
const LEVEL_STYLE: Record<string, string> = {
  Critical: "bg-[var(--red-50)] text-[var(--red-700)] ring-[var(--red-200)]",
  High: "bg-[var(--fire-50)] text-[var(--fire-700)] ring-[var(--fire-200)]",
  Moderate: "bg-[var(--blue-50)] text-[var(--blue-700)] ring-[var(--blue-200)]",
  Low: "bg-slate-50 text-slate-600 ring-slate-200",
  Strong: "bg-[var(--green-50)] text-[var(--green-700)] ring-[var(--green-200)]",
  Weak: "bg-amber-50 text-amber-700 ring-amber-200",
  Medium: "bg-amber-50 text-amber-700 ring-amber-200",
};

function Pill({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ring-1 ring-inset ${LEVEL_STYLE[tone] ?? LEVEL_STYLE.Low}`}>{children}</span>;
}

function Block({ title, icon, children, aside }: { title: string; icon?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-[14px] border border-[var(--line)] bg-white p-4">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[13px] font-bold text-[var(--ink)]">{icon}{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Check({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[var(--line-2)] py-2 last:border-0">
      {ok ? <CheckCircle2 size={15} className="shrink-0 text-[var(--green)]" /> : <AlertTriangle size={15} className="shrink-0 text-amber-600" />}
      <span className="flex-1 text-[12.5px] text-[var(--ink-2)]">{label}</span>
      <span className={`text-[12.5px] font-semibold ${ok ? "text-[var(--ink)]" : "text-amber-700"}`}>{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ prediction report */
function PredictionView({ r, onNext }: { r: PredictionReport; onNext: () => void }) {
  const [openProof, setOpenProof] = useState(true);
  const p = r.prediction;
  const nz = r.reliability.noise;
  return (
    <div className="space-y-3">
      {/* hero */}
      <div className="grid gap-3 md:grid-cols-[1.25fr_1fr]">
        <Block title="48-hour follow-up detection probability" aside={<Pill tone={p.risk_category}>{p.risk_category} risk</Pill>}>
          <div className="flex items-end gap-3">
            <span className="text-[44px] font-extrabold leading-none tracking-tight tnum">{pct(p.probability)}</span>
            <span className="pb-1.5 text-[12px] text-[var(--ink-2)]">alert threshold {pct(p.threshold)}</span>
          </div>
          <div className="relative mt-3 h-2.5 rounded-full bg-[#eef2f7]">
            <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--fire)]" style={{ width: `${p.probability * 100}%` }} />
            <div className="absolute -top-1 h-[18px] w-0.5 rounded bg-[var(--ink)]" style={{ left: `${p.threshold * 100}%` }} />
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-[var(--ink-2)]">{p.risk_rule} Estimates a later satellite detection, not fire spread or damage.</p>
          {p.calibration_note && <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ink-2)]">{p.calibration_note.text}</p>}
        </Block>
        <div className="grid gap-3">
          <Block title="Evidence quality" aside={<Pill tone={p.evidence_quality}>{p.evidence_quality}</Pill>}>
            <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">{r.reliability.confidence_note}</p>
          </Block>
          <Block title="Satellite heat signal" icon={<Flame size={14} className="text-[var(--fire)]" />} aside={<Pill tone={r.heat_signal.level === "Strong" ? "High" : r.heat_signal.level === "Moderate" ? "Medium" : "Low"}>{r.heat_signal.level}</Pill>}>
            <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">{r.heat_signal.reasons.join(" ")}</p>
            <p className="mt-1 text-[11px] text-[var(--ink-3)]">{r.heat_signal.note}</p>
          </Block>
        </div>
      </div>

      {/* pattern / anomaly */}
      <Block title="Observation pattern" icon={<ShieldAlert size={14} className="text-[var(--blue)]" />}
        aside={<span className="flex items-center gap-1.5">{r.anomaly.unusual && <Pill tone="Medium">Unusual vs training</Pill>}<Pill tone={r.anomaly.requires_verification ? "Moderate" : "Low"}>{r.anomaly.label}</Pill></span>}>
        <p className="text-[12.5px] leading-relaxed">{r.anomaly.meaning}</p>
        {r.anomaly.proof.length > 0 && (
          <ul className="mt-2 space-y-1">
            {r.anomaly.proof.map((x) => <li key={x} className="flex gap-2 text-[12px] text-[var(--ink-2)]"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--blue)]" />{x}</li>)}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-[var(--ink-3)]">
          {r.anomaly.anomaly_percentile != null && <>Isolation Forest anomaly score: more unusual than {r.anomaly.anomaly_percentile.toFixed(0)}% of validation incidents. </>}
          {r.anomaly.disclaimer}
        </p>
      </Block>

      {/* proof */}
      <Block title="Why the alarm: proof" icon={<FileBarChart2 size={14} className="text-[var(--ink-2)]" />}
        aside={<button className="text-[11.5px] font-semibold text-[var(--blue)]" onClick={() => setOpenProof(!openProof)}>{openProof ? "Hide" : "Show"}</button>}>
        {openProof && (
          <ol className="space-y-1.5">
            {r.proof.map((x, i) => (
              <li key={i} className="flex gap-2.5 text-[12.5px] leading-snug">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#eef2f7] text-[10.5px] font-bold text-[var(--ink-2)] tnum">{i + 1}</span>
                <span>{x}</span>
              </li>
            ))}
          </ol>
        )}
      </Block>

      {/* reliability */}
      <div className="grid gap-3 md:grid-cols-2">
        <Block title="Reliability & noise handling" icon={<Waves size={14} className="text-[var(--cyan)]" />}>
          <Check ok={!r.reliability.missing_weather} label="Weather record" value={r.reliability.missing_weather ? "Missing (filled)" : "Available"} />
          <Check ok={!r.reliability.unusual_inputs} label="Unusual input values" value={r.reliability.unusual_inputs ? "Yes" : "No"} />
          <Check ok={r.reliability.satellite_evidence !== "Weak"} label="Satellite evidence" value={r.reliability.satellite_evidence} />
          {nz.available && <Check ok={!!nz.stable} label={`Noise test (${nz.samples} noisy copies)`} value={nz.stable ? "Stable" : "Sensitive"} />}
          {nz.available && nz.range_5_95 && (
            <div className="mt-2">
              <div className="relative h-2 rounded-full bg-[#eef2f7]">
                <div className="absolute inset-y-0 rounded-full bg-[var(--cyan)]/40" style={{ left: `${nz.range_5_95[0] * 100}%`, width: `${Math.max((nz.range_5_95[1] - nz.range_5_95[0]) * 100, 1)}%` }} />
                <div className="absolute -top-1 h-4 w-0.5 bg-[var(--ink)]" style={{ left: `${p.threshold * 100}%` }} title="alert threshold" />
              </div>
              <p className="mt-1.5 text-[11.5px] leading-snug text-[var(--ink-2)]">{nz.text}</p>
            </div>
          )}
        </Block>
        <Block title="False-alarm evidence" icon={<ShieldCheck size={14} className="text-[var(--green)]" />} aside={<span className="text-[11px] text-[var(--ink-3)]">{r.false_alarms.period}</span>}>
          <div className="grid grid-cols-3 gap-2">
            {[["Precision", r.false_alarms.precision], ["False-positive rate", r.false_alarms.false_positive_rate], ["Recall", r.false_alarms.recall]].map(([k, v]) => (
              <div key={k as string} className="rounded-[10px] bg-[#f6f8fb] px-2.5 py-2">
                <div className="text-[10.5px] font-semibold text-[var(--ink-3)]">{k}</div>
                <div className="text-[16px] font-extrabold tnum">{pct(v as number, 1)}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-snug text-[var(--ink-2)]">{r.false_alarms.text}</p>
        </Block>
      </div>

      <details className="rounded-[14px] border border-[var(--line)] bg-white p-4">
        <summary className="cursor-pointer text-[13px] font-bold">Limitations &amp; what would improve confidence</summary>
        <ul className="mt-2 space-y-1.5 text-[12.5px]">
          {r.reliability.improve_confidence.map((g) => <li key={g.code}><b>{g.missing}.</b> <span className="text-[var(--ink-2)]">{g.verification_step}</span></li>)}
          {r.limits.map((l) => <li key={l} className="text-[var(--ink-2)]">{l}</li>)}
        </ul>
      </details>

      <div className="flex justify-end">
        <button className="btn btn-primary" onClick={onNext}>Recommendation report <ArrowRight size={15} /></button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ recommendation report */

function RecommendationView({ r }: { r: RecommendationReport }) {
  const decide = useStore((s) => s.decide);
  const closeReport = useStore((s) => s.closeReport);
  const [view, setView] = useState<"under" | "over">("under");
  const [choice, setChoice] = useState<ReportAction>(r.action);
  const [reason, setReason] = useState(r.why);
  const [confirmFeas, setConfirmFeas] = useState(false);
  const [busy, setBusy] = useState(false);
  const opt = r.options.find((o) => o.action === choice)!;
  const needsFeasConfirm = choice === "SEND_CREW" && !r.feasibility.actionable;
  const sim = r.consequences.simulation;
  const maxBenefit = Math.max(...sim.crew_benefit_by_incident.map((b) => Math.abs(b.cells)), 0.1);
  const incidentId = useStore((s) => s.report.incidentId);

  const approve = async () => {
    if (!incidentId) return;
    setBusy(true);
    const full = needsFeasConfirm ? `${reason.trim()} [Coordinator confirmed feasibility manually: ${r.feasibility.label}]` : reason.trim();
    const ok = await decide(incidentId, opt.record as ActionType, full);
    setBusy(false);
    if (ok) closeReport();
  };

  return (
    <div className="space-y-3">
      {/* action hero */}
      <section className="rounded-[14px] border border-[var(--line)] bg-gradient-to-br from-white to-[#f6f9fd] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Recommended action</span>
          <Pill tone={r.urgency.label}>{r.urgency.label} urgency</Pill>
          {r.urgency.review_window && <span className="text-[11.5px] font-semibold text-[var(--ink-2)]">{r.urgency.review_window}</span>}
        </div>
        <div className="mt-1.5 text-[26px] font-extrabold tracking-tight">{r.action_label}</div>
        <p className="mt-1.5 max-w-[640px] text-[13px] leading-relaxed text-[var(--ink-2)]">{r.why}</p>
        {r.urgency.review_window_note && <p className="mt-1 text-[11px] text-[var(--ink-3)]">{r.urgency.review_window_note}</p>}
      </section>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
        {/* urgency ladder */}
        <Block title="Practical urgency levels">
          <div className="space-y-1.5">
            {r.urgency_table.map((u) => {
              const active = u.level === r.urgency.label;
              return (
                <div key={u.level} className={`rounded-[10px] px-3 py-2 ring-1 ring-inset ${active ? LEVEL_STYLE[u.level] : "ring-[var(--line-2)]"}`}>
                  <div className="flex items-center justify-between text-[12.5px] font-bold">
                    <span>{u.level}{active && " · this incident"}</span>
                    <span className="text-[11px] font-semibold opacity-80">{u.window}</span>
                  </div>
                  <div className={`text-[11.5px] ${active ? "" : "text-[var(--ink-3)]"}`}>{u.meaning} → {u.action}</div>
                </div>
              );
            })}
          </div>
          <ul className="mt-2.5 list-disc space-y-0.5 pl-4 text-[11.5px] text-[var(--ink-2)]">
            {r.urgency.reasons.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </Block>

        {/* feasibility */}
        <Block title="Crew feasibility" icon={<Route size={14} className="text-[var(--ink-2)]" />}
          aside={<Pill tone={r.feasibility.status === "FEASIBLE" ? "Strong" : r.feasibility.status === "REQUIRES_COORDINATION" ? "Medium" : "Low"}>{r.feasibility.label}</Pill>}>
          <div className="space-y-0">
            <Check ok label="Crew base" value={r.feasibility.crew_base_jurisdiction} />
            <Check ok={!r.feasibility.cross_border} label="Cross-border" value={r.feasibility.cross_border ? "Yes, coordination required" : "No"} />
            <Check ok={r.feasibility.straight_line_km <= 250} label={r.feasibility.distance_label} value={`${num(r.feasibility.straight_line_km, 0)} km`} />
            <Check ok={false} label="Route / ETA" value="Unavailable" />
          </div>
          <ul className="mt-2 space-y-1 text-[11.5px] leading-snug text-[var(--ink-2)]">
            {r.feasibility.reasons.map((x) => <li key={x}>{x}</li>)}
            <li>{r.feasibility.travel_note}</li>
            <li className="text-[var(--ink-3)]">{r.feasibility.crew_base}. {r.feasibility.access_note}</li>
          </ul>
        </Block>
      </div>

      {/* consequences */}
      <Block title="Possible consequences of the wrong action" icon={<AlertTriangle size={14} className="text-amber-600" />}
        aside={
          <div className="flex rounded-[9px] bg-[#eef2f7] p-[3px]">
            {(["under", "over"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                className={`rounded-[7px] px-2.5 py-1 text-[11.5px] font-semibold ${view === v ? "bg-white shadow-sm" : "text-[var(--ink-2)]"}`}>
                {v === "under" ? "If under-responded" : "If over-responded"}
              </button>
            ))}
          </div>
        }>
        <ul className="space-y-1.5">
          {(view === "under" ? r.consequences.under_response : r.consequences.over_response).map((x) => (
            <li key={x} className="flex gap-2 text-[12.5px] leading-snug"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${view === "under" ? "bg-[var(--fire)]" : "bg-[var(--blue)]"}`} />{x}</li>
          ))}
        </ul>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-[10px] bg-[#f6f8fb] p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">This incident · burned cells (simulated)</div>
            {[["Crew here", sim.crew_here, "var(--cyan)"], ["No crew here", sim.no_crew_here, "var(--fire)"]].map(([label, v, c]) => (
              <div key={label as string} className="mt-1.5">
                <div className="flex justify-between text-[11.5px]"><span>{label as string}</span><b className="tnum">{num((v as { mean: number }).mean, 1)} ± {num((v as { ci95: number }).ci95, 1)}</b></div>
                <div className="mt-0.5 h-1.5 rounded-full bg-white"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(((v as { mean: number }).mean / Math.max(sim.no_crew_here.mean, sim.crew_here.mean, 0.1)) * 100, 100)}%`, background: c as string }} /></div>
              </div>
            ))}
          </div>
          <div className="rounded-[10px] bg-[#f6f8fb] p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">Cells averted by the crew, per incident</div>
            {sim.crew_benefit_by_incident.map((b) => (
              <div key={b.incident_id} className="mt-1.5">
                <div className="flex justify-between text-[11.5px]"><span>{b.label}{b.incident_id === incidentId && " (this)"}</span><b className="tnum">{b.cells >= 0 ? "+" : ""}{num(b.cells, 1)}</b></div>
                <div className="mt-0.5 h-1.5 rounded-full bg-white"><div className="h-1.5 rounded-full bg-[var(--green)]" style={{ width: `${(Math.max(b.cells, 0) / maxBenefit) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
        {sim.tradeoff && (
          <p className="mt-2.5 flex gap-2 rounded-[10px] bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-900 ring-1 ring-inset ring-amber-200">
            <AlertTriangle size={14} className="mt-px shrink-0" />{sim.tradeoff}
          </p>
        )}
        <p className="mt-2 text-[11px] text-[var(--ink-3)]">{sim.note} {sim.runs} matched runs; crew arrives at step {sim.response_delay_steps}.</p>
      </Block>

      {/* ranking + waiting */}
      <Block title="Why this ranking, and who waits" icon={<MapPin size={14} className="text-[var(--ink-2)]" />}>
        <p className="text-[12.5px] leading-relaxed">{r.ranking.text}</p>
        {r.waiting.length > 0 && (
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {r.waiting.map((w) => (
              <div key={w.incident_id} className="rounded-[10px] border border-[var(--line)] px-3 py-2 text-[12px]">
                <div className="font-bold">{w.label} · <span className="font-medium text-[var(--ink-2)]">{w.region}</span></div>
                <div className="text-[var(--ink-2)] tnum">Rank {w.rank} · {pct(w.probability)} estimate · {w.recommendation.toLowerCase()}</div>
              </div>
            ))}
          </div>
        )}
      </Block>

      {/* approve */}
      <section className="rounded-[14px] border-2 border-[var(--blue-200)] bg-white p-4">
        <div className="flex items-center gap-2 text-[13px] font-bold"><ClipboardCheck size={15} className="text-[var(--blue)]" /> Approve an action</div>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {r.options.map((o) => (
            <button key={o.action} onClick={() => setChoice(o.action)} aria-pressed={choice === o.action}
              className={`rounded-[10px] px-3 py-2 text-left text-[12.5px] font-semibold ring-1 ring-inset transition ${choice === o.action ? "bg-[var(--blue-50)] text-[var(--blue-700)] ring-[var(--blue)]" : "ring-[var(--line)] hover:ring-[#cdd8e5]"}`}>
              {o.label}
              {o.recommended && <span className="mt-0.5 block text-[10.5px] font-bold uppercase tracking-wider text-[var(--green-700)]">Recommended</span>}
            </button>
          ))}
        </div>
        {needsFeasConfirm && (
          <label className="mt-2.5 flex items-start gap-2 rounded-[10px] bg-amber-50 p-2.5 text-[12px] text-amber-900 ring-1 ring-inset ring-amber-200">
            <input type="checkbox" className="mt-0.5 accent-amber-600" checked={confirmFeas} onChange={(e) => setConfirmFeas(e.target.checked)} />
            Crew assignment is {r.feasibility.label.toLowerCase()}. I have confirmed authorisation and access manually.
          </label>
        )}
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={600} aria-label="Reason for the record"
          className="mt-2.5 w-full resize-none rounded-[10px] border border-[var(--line)] px-3 py-2 text-[12.5px] outline-none focus:border-[var(--blue)]" />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[11px] text-[var(--ink-3)]">Recorded with the recommendation at this moment, your reason and the time. No automatic dispatch.</span>
          <button className="btn btn-primary" disabled={busy || !reason.trim() || (needsFeasConfirm && !confirmFeas)} onClick={approve}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Record: {opt.label}
          </button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ canvas shell */
export function ReportCanvas() {
  const report = useStore((s) => s.report);
  const close = useStore((s) => s.closeReport);
  const setTab = useStore((s) => s.setReportTab);
  const data = useStore((s) => s.data);
  useEffect(() => {
    if (!report.open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [report.open, close]);
  if (!report.open) return null;
  const inc = data?.incidents.find((i) => i.id === report.incidentId);
  const tabs = [
    { id: "prediction" as const, n: 1, label: "Prediction report" },
    { id: "recommendation" as const, n: 2, label: "Recommendation report" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-[#172638]/35 p-3 backdrop-blur-[2px] sm:p-6" onClick={close}>
      <div className="animate-in flex max-h-full w-full max-w-[980px] flex-col overflow-hidden rounded-[18px] bg-[var(--bg)] shadow-[0_30px_80px_rgba(23,38,56,0.3)]"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Incident reports">
        <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-white px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Incident report{inc ? ` · ${inc.region}, ${inc.country}` : ""}</div>
            <div className="truncate text-[17px] font-bold">
              {report.incidentId ? shortId(report.incidentId) : "Incident"}
              {inc && <span className="ml-2 text-[12.5px] font-medium text-[var(--ink-2)]">first detected {utc(inc.observed_at)}</span>}
            </div>
          </div>
          <div className="flex rounded-[11px] bg-[#eef2f7] p-[3px]" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={report.tab === t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold ${report.tab === t.id ? "bg-white shadow-[0_1px_3px_rgba(23,38,56,0.12)]" : "text-[var(--ink-2)]"}`}>
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[10.5px] font-bold ${report.tab === t.id ? "bg-[var(--blue)] text-white" : "bg-white text-[var(--ink-2)]"}`}>{t.n}</span>
                {t.label}
              </button>
            ))}
          </div>
          <button onClick={close} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] bg-white text-[var(--ink-2)]" aria-label="Close reports"><X size={16} /></button>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {report.loading && (
            <div className="grid place-items-center py-24 text-[13px] text-[var(--ink-2)]">
              <Loader2 size={22} className="mb-2 animate-spin text-[var(--blue)]" />
              Composing reports from the model, the evidence rules and matched simulation runs…
            </div>
          )}
          {report.error && <div className="rounded-[12px] bg-[var(--red-50)] p-4 text-[13px] text-[var(--red-700)]">{report.error}</div>}
          {report.data && report.tab === "prediction" && <PredictionView r={report.data.prediction_report} onNext={() => setTab("recommendation")} />}
          {report.data && report.tab === "recommendation" && <RecommendationView r={report.data.recommendation_report} />}
        </div>
      </div>
    </div>
  );
}

export function ReportButton({ incidentId, className = "" }: { incidentId?: string | null; className?: string }) {
  const openReport = useStore((s) => s.openReport);
  return (
    <button className={`btn btn-secondary ${className}`} onClick={() => openReport(incidentId)}>
      <FileBarChart2 size={15} /> Reports <ChevronDown size={13} className="-rotate-90" />
    </button>
  );
}
