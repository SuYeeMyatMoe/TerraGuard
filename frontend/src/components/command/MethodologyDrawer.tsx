"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Segmented, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { num, pct } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Evaluation, SplitMetrics } from "@/lib/types";

type Tab = "model" | "policy" | "data" | "assumptions";

export function MethodologyDrawer() {
  const open = useStore((s) => s.methodologyOpen);
  const setOpen = useStore((s) => s.setMethodology);
  const sim = useStore((s) => s.sim);
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("model");
  useEffect(() => {
    if (open && !ev) api.evaluation().then(setEv).catch((e) => setErr(e.message));
  }, [open, ev]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, setOpen]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#172638]/20" onClick={() => setOpen(false)}>
      <aside className="slide-in flex h-full w-[640px] flex-col bg-white shadow-[-20px_0_60px_rgba(23,38,56,0.15)]" onClick={(e) => e.stopPropagation()} aria-label="Methodology">
        <div className="flex items-start justify-between border-b border-[var(--line)] px-6 pb-4 pt-5">
          <div>
            <div className="eyebrow">Methodology &amp; evaluation</div>
            <h2 className="mt-1 text-[19px] font-bold">Does the model help make better decisions?</h2>
          </div>
          <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--ink-2)]" aria-label="Close"><X size={15} /></button>
        </div>
        <div className="border-b border-[var(--line)] px-6 py-3">
          <Segmented value={tab} onChange={setTab} size="sm" options={[
            { value: "model", label: "Model vs baseline" },
            { value: "policy", label: "Policy backtest" },
            { value: "data", label: "Data & labels" },
            { value: "assumptions", label: "Assumptions & AI rules" },
          ]} />
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {err && <div className="rounded-lg bg-[var(--red-50)] p-3 text-[13px] text-[var(--red-700)]">{err}</div>}
          {!ev && !err && <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-56 w-full" /></div>}
          {ev && (
            <>
              {ev.provenance.is_synthetic && (
                <div className="mb-5 flex gap-2.5 rounded-[12px] bg-amber-50 p-3.5 text-[12.5px] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>
                    <b>These results come from synthetic demo data</b> in the NASA FIRMS schema, conditioned on real Open-Meteo
                    weather. The pipeline is identical for real data: add a FIRMS MAP_KEY and rerun it. Treat the numbers as a
                    test of the method, not as evidence about real fires.
                  </span>
                </div>
              )}
              {tab === "model" && <ModelTab ev={ev} />}
              {tab === "policy" && <PolicyTab ev={ev} />}
              {tab === "data" && <DataTab ev={ev} />}
              {tab === "assumptions" && <AssumptionsTab assumptions={sim?.assumptions} />}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function MetricTable({ ev }: { ev: Evaluation }) {
  const rows: [string, keyof SplitMetrics, (v: number) => string, boolean][] = [
    ["PR-AUC (average precision)", "pr_auc", (v) => v.toFixed(3), true],
    ["Precision at alert threshold", "precision", pct, true],
    ["Recall at alert threshold", "recall", pct, true],
    ["F1", "f1", (v) => v.toFixed(3), true],
    ["False-positive rate", "false_positive_rate", (v) => pct(v, 1), false],
    ["False alarms (count)", "false_alarms", (v) => num(v), false],
    [`Precision@${ev.daily_capacity_k} per day`, "precision_at_k_daily", pct, true],
    ["Brier score (calibration)", "brier", (v) => v.toFixed(3), false],
  ];
  const b = ev.baseline.test, r = ev.random_forest.test;
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">
          <th className="py-2 font-bold">Held-out test (2025)</th>
          <th className="py-2 text-right font-bold">Baseline</th>
          <th className="py-2 text-right font-bold">Random Forest</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, k, f, higherBetter]) => {
          const better = higherBetter ? r[k] > b[k] : r[k] < b[k];
          return (
            <tr key={k} className="border-t border-[var(--line-2)]">
              <td className="py-2 text-[var(--ink-2)]">{label}</td>
              <td className="py-2 text-right font-semibold tnum">{f(b[k] as number)}</td>
              <td className={`py-2 text-right font-bold tnum ${better ? "text-[var(--green-700)]" : "text-[var(--red-700)]"}`}>{f(r[k] as number)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ModelTab({ ev }: { ev: Evaluation }) {
  const pr = ev.random_forest.pr_curve_test.map((p, i) => ({
    recall: p.recall,
    rf: p.precision,
    base: ev.baseline.pr_curve_test[Math.min(i, ev.baseline.pr_curve_test.length - 1)]?.precision,
  }));
  const rel = ev.random_forest.reliability_test.map((r) => ({ x: r.mean_predicted, observed: r.observed_rate, ideal: r.mean_predicted }));
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
          <b className="text-[var(--ink)]">Target:</b> {ev.target}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
          Served model: <b className="text-[var(--ink)]">{ev.chosen_model === "random_forest" ? "Random Forest" : "Baseline"}</b> ({ev.model_version}).{" "}
          {ev.selection_rule} {ev.threshold_rule} Test data was scored once, after selection.
        </p>
      </div>
      <MetricTable ev={ev} />
      <div>
        <div className="eyebrow mb-2">Precision–recall curve · test</div>
        <div className="h-52">
          <ResponsiveContainer>
            <LineChart data={pr} margin={{ left: -18, right: 8, top: 6 }}>
              <CartesianGrid stroke="#eef2f7" />
              <XAxis dataKey="recall" type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} fontSize={11} stroke="#94a3b8" />
              <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} fontSize={11} stroke="#94a3b8" />
              <Tooltip formatter={(v: number) => pct(v)} labelFormatter={(v) => `Recall ${pct(Number(v))}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="rf" name="Random Forest" stroke="#22a06b" strokeWidth={2.2} dot={false} />
              <Line dataKey="base" name="Historical-frequency baseline" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">Calibration · Random Forest, test</div>
        <div className="h-48">
          <ResponsiveContainer>
            <LineChart data={rel} margin={{ left: -18, right: 8, top: 6 }}>
              <CartesianGrid stroke="#eef2f7" />
              <XAxis dataKey="x" type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} fontSize={11} stroke="#94a3b8" />
              <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} fontSize={11} stroke="#94a3b8" />
              <Tooltip formatter={(v: number) => pct(v)} labelFormatter={(v) => `Predicted ${pct(Number(v))}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="ideal" name="Perfect calibration" stroke="#cbd5e1" dot={false} strokeDasharray="4 4" />
              <Line dataKey="observed" name="Observed rate" stroke="#2563eb" strokeWidth={2.2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[11.5px] text-[var(--ink-3)]">
          Balanced class weights make raw scores run high on the lower-prevalence 2025 test year. Ranking and thresholds were chosen on validation data.
        </p>
      </div>
      {ev.random_forest.top_features && (
        <div>
          <div className="eyebrow mb-2">Most important features (global)</div>
          <div className="space-y-1">
            {ev.random_forest.top_features.slice(0, 8).map((f) => (
              <div key={f.feature} className="flex items-center gap-2 text-[12px]">
                <span className="w-44 truncate text-[var(--ink-2)]">{f.feature}</span>
                <div className="h-2 flex-1 rounded-full bg-[#eef2f7]">
                  <div className="h-2 rounded-full bg-[var(--green)]" style={{ width: `${(f.importance / ev.random_forest.top_features![0].importance) * 100}%` }} />
                </div>
                <span className="w-12 text-right tnum">{f.importance.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PolicyBar({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div className="flex items-center gap-3 text-[12.5px]">
      <span className="w-40 text-[var(--ink-2)]">{label}</span>
      <div className="h-3 flex-1 rounded-full bg-[#eef2f7]"><div className="h-3 rounded-full" style={{ width: `${Math.min(v / 0.3, 1) * 100}%`, background: color }} /></div>
      <b className="w-12 text-right tnum">{pct(v, 1)}</b>
    </div>
  );
}

function PolicyTab({ ev }: { ev: Evaluation }) {
  const bt = ev.policy_backtest;
  if (!bt) return <div className="text-[13px] text-[var(--ink-2)]">Policy backtest not available. Run python -m ml.policy_backtest.</div>;
  const r = bt.retrospective.all_days;
  const d = bt.retrospective.disagreement_days;
  const s = bt.simulation;
  return (
    <div className="space-y-6">
      <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
        Every held-out 2025 day with three separated incidents (<b className="text-[var(--ink)]">{bt.days_evaluated} days</b>) was replayed
        with one available team. The policies disagreed on <b className="text-[var(--ink)]">{bt.days_policies_disagree}</b> days.
      </p>
      <div>
        <div className="eyebrow mb-2">Retrospective check on real labels · all days</div>
        <p className="mb-3 text-[12px] text-[var(--ink-2)]">How often did the incident each policy chose actually show follow-up satellite activity within 48 h?</p>
        <div className="space-y-2">
          <PolicyBar label="AI-priority pick" v={r.ai_pick_followup_rate} color="#22a06b" />
          <PolicyBar label="First-alert pick" v={r.first_alert_pick_followup_rate} color="#94a3b8" />
          <PolicyBar label="Random pick (expected)" v={r.random_pick_followup_rate} color="#cbd5e1" />
        </div>
        <p className="mt-2 text-[12px] text-[var(--ink-2)]">
          Difference (AI − first-alert): 95% bootstrap CI {pct(r.difference_ai_minus_first_alert_ci95[0], 1)} to {pct(r.difference_ai_minus_first_alert_ci95[1], 1)}.
          On disagreement days ({d.n}): {pct(d.ai_pick_followup_rate, 1)} vs {pct(d.first_alert_pick_followup_rate, 1)}.
        </p>
        <p className="mt-1 text-[11.5px] text-[var(--ink-3)]">{bt.retrospective.note}</p>
      </div>
      <div>
        <div className="eyebrow mb-2">Hypothetical simulation · all days</div>
        <table className="w-full text-[12.5px]">
          <tbody>
            <tr className="border-t border-[var(--line-2)]"><td className="py-2 text-[var(--ink-2)]">Mean loss index, first-alert</td><td className="py-2 text-right font-semibold tnum">{num(s.mean_loss_first_alert, 2)}</td></tr>
            <tr className="border-t border-[var(--line-2)]"><td className="py-2 text-[var(--ink-2)]">Mean loss index, AI-priority</td><td className="py-2 text-right font-semibold tnum">{num(s.mean_loss_ai_priority, 2)}</td></tr>
            <tr className="border-t border-[var(--line-2)]"><td className="py-2 text-[var(--ink-2)]">Mean difference (95% CI)</td><td className="py-2 text-right font-semibold tnum">{num(s.mean_loss_difference, 2)} ({num(s.difference_ci95[0], 2)} to {num(s.difference_ci95[1], 2)})</td></tr>
            <tr className="border-t border-[var(--line-2)]"><td className="py-2 text-[var(--ink-2)]">Days AI lower / first-alert lower / tied</td><td className="py-2 text-right font-semibold tnum">{s.days_ai_lower_loss} / {s.days_first_alert_lower_loss} / {s.days_tied}</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-[12px] text-[var(--ink-2)]">
          {s.difference_ci95[0] <= 0 && s.difference_ci95[1] >= 0
            ? "The simulated advantage is small, and its interval includes zero. We report it as inconclusive."
            : s.mean_loss_difference > 0 ? "AI-priority produced lower simulated loss on average." : "First-alert produced lower simulated loss on average."}{" "}
          {s.note}
        </p>
      </div>
    </div>
  );
}

function DataTab({ ev }: { ev: Evaluation }) {
  const a = ev.audit;
  const p = ev.provenance;
  return (
    <div className="space-y-5 text-[12.5px]">
      <div>
        <div className="eyebrow mb-2">Provenance</div>
        <Kv k="Source" v={p.source} />
        <Kv k="Product" v={p.product} />
        <Kv k="Period" v={p.period.join(" → ")} />
        <Kv k="Rows" v={num(p.rows)} />
        {p.weather_conditioning && <Kv k="Weather" v={p.weather_conditioning} />}
      </div>
      <div>
        <div className="eyebrow mb-2">Audit</div>
        <Kv k="Detections after cleaning" v={num(a.detections_after_cleaning)} />
        <Kv k="Acquisition passes" v={num(a.acquisition_passes)} />
        <Kv k="Incident candidates" v={num(a.incident_candidates)} />
        {Object.entries(a.label_status).map(([k, v]) => <Kv key={k} k={`Label: ${k}`} v={num(v)} />)}
        {Object.entries(a.splits).map(([k, v]) => <Kv key={k} k={`Split: ${k}`} v={`${num(v.n)} candidates · ${pct(v.positive_rate ?? 0, 1)} positive`} />)}
        <Kv k="Feasibility gate" v={a.feasibility_gate.passed ? `Passed (${a.feasibility_gate.rule})` : "Failed"} />
      </div>
      <div className="space-y-2 leading-relaxed text-[var(--ink-2)]">
        <div className="eyebrow">Incident construction &amp; labels</div>
        <p>Detections from the same satellite within 10 minutes form one acquisition pass. Detections within a pass are clustered at 750 m into incident candidates. Candidates within 2 km and 72 h are linked into tracks.</p>
        <p><b className="text-[var(--ink)]">Positive</b>: a nominal- or high-confidence detection within 2 km in a distinct later pass between 3 and 48 h. <b className="text-[var(--ink)]">Uncertain</b> (only low-confidence follow-ups) and <b className="text-[var(--ink)]">censored</b> candidates are excluded. A negative does not mean the fire was confirmed out.</p>
        <p><b className="text-[var(--ink)]">Leakage controls</b>: chronological train / validation / test split (2023-01 → 2024-06 / 2024-07 → 12 / 2025), with label-horizon and 7-day feature purges at each boundary. Tracks never span splits. Weather comes from the previous UTC day, and every feature is past-only. These checks are enforced by automated tests.</p>
      </div>
    </div>
  );
}

function AssumptionsTab({ assumptions }: { assumptions?: Record<string, number | string> }) {
  return (
    <div className="space-y-5 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
      <div>
        <div className="eyebrow mb-2">Three separate layers</div>
        <p><b className="text-[var(--ink)]">1 · Prediction</b>: the Random Forest estimates follow-up satellite detection only.</p>
        <p><b className="text-[var(--ink)]">2 · Prioritisation</b>: a fixed transparent formula. Priority = 0.45·probability + 0.25·protected-area exposure + 0.15·recency + 0.15·evidence quality. Low evidence or two or more unusual inputs lead to Recheck.</p>
        <p><b className="text-[var(--ink)]">3 · Simulation</b>: an independent cellular automaton on a procedurally generated plot. The ML probability is never used as a spread probability.</p>
      </div>
      {assumptions && (
        <div>
          <div className="eyebrow mb-2">Simulation assumptions</div>
          {Object.entries(assumptions).map(([k, v]) => <Kv key={k} k={k.replaceAll("_", " ")} v={String(v)} />)}
          <p className="mt-2">Costs and the loss index are illustrative scenario units, not valuations. The simulation is not a validated wildfire forecast.</p>
        </div>
      )}
      <div>
        <div className="eyebrow mb-2">Generative AI rules</div>
        <ul className="list-disc space-y-1 pl-4">
          <li>LLMs only explain a validated evidence package. They never produce probabilities, rankings or simulation results.</li>
          <li>Every output is schema-validated. Cited evidence ids and every number must match the backend, and the recommendation must equal the deterministic one.</li>
          <li>Accusations of illegal activity, forecast claims and dispatch or enforcement orders are blocked.</li>
          <li>On failure the system regenerates once, then shows a labelled rule-based explanation. Providers are never switched silently.</li>
          <li>OpenAI writes incident briefings. Grafilab writes field-team briefs. A human approves every action.</li>
        </ul>
      </div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--line-2)] py-1.5 last:border-0">
      <span className="text-[var(--ink-2)]">{k}</span>
      <span className="text-right font-semibold text-[var(--ink)] tnum">{v}</span>
    </div>
  );
}
