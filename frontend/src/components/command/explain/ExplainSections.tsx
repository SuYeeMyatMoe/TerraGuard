"use client";

import { AlertOctagon, AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronDown, Info, Lightbulb, ListChecks, Scale } from "lucide-react";
import { useState, type ReactNode } from "react";
import { RecPill, SectionTitle } from "@/components/ui";
import { num, pct, shortId, utc } from "@/lib/format";
import type { EvidenceLimitation, Prediction, PriorityComponent, UrgencyTier } from "@/lib/types";

/* ----------------------------------------------------------------------------- shared */
export function Disclosure({ label, children, defaultOpen = false }: { label: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button className="flex items-center gap-1 text-[11.5px] font-semibold text-[var(--blue)] hover:underline" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} /> {label}
      </button>
      {open && <div className="animate-in mt-2">{children}</div>}
    </div>
  );
}

const URGENCY_STYLE: Record<UrgencyTier, string> = {
  CRITICAL_REVIEW: "bg-[var(--red-50)] text-[var(--red-700)] ring-[var(--red-200)]",
  PRIORITY_REVIEW: "bg-[var(--fire-50)] text-[var(--fire-700)] ring-[var(--fire-200)]",
  ROUTINE_MONITORING: "bg-slate-50 text-slate-600 ring-slate-200",
  INSUFFICIENT_EVIDENCE: "bg-[var(--blue-50)] text-[var(--blue-700)] ring-[var(--blue-200)]",
};

const ACTION_TEXT = { INSPECT: "Send the crew to verify", RECHECK: "Request a recheck before sending the crew", MONITOR: "Continue monitoring" };

/* ----------------------------------------------------------------------------- 1. priority decision */
export function DecisionHeader({ pred }: { pred: Prediction }) {
  return (
    <section className="rounded-[12px] border border-[var(--line)] bg-[#fbfcfe] p-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold ring-1 ring-inset ${URGENCY_STYLE[pred.urgency.tier]}`}>
          {pred.urgency.label}
        </span>
        <RecPill rec={pred.priority.recommendation} size="sm" />
      </div>
      <p className="mt-2.5 text-[13.5px] font-semibold leading-snug text-[var(--ink)]">{pred.decision_summary}</p>
      <div className="mt-2 text-[12px] text-[var(--ink-2)]">
        Recommended next action: <b className="text-[var(--ink)]">{ACTION_TEXT[pred.priority.recommendation]}</b>
      </div>
      <div className="mt-2">
        <Disclosure label="Why this urgency level">
          <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-[var(--ink-2)]">
            {pred.urgency.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <p className="mt-1.5 text-[11px] text-[var(--ink-3)]">Rule-based tier, separate from the model probability and the priority score. It does not imply an official response deadline.</p>
        </Disclosure>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------------- 2. prediction */
export function PredictionBlock({ pred }: { pred: Prediction }) {
  const tv = pred.tree_variation;
  return (
    <section>
      <SectionTitle right={<span className="text-[11px] text-[var(--ink-3)]">{pred.model.name} {pred.model.version}</span>}>
        48-hour follow-up detection probability
      </SectionTitle>
      <div className="rounded-[12px] border border-[var(--line)] p-3.5">
        <div className="flex items-end justify-between gap-3">
          <div className="text-[30px] font-extrabold leading-none tracking-tight tnum">{pct(pred.probability)}</div>
          <div className="text-right text-[11.5px] leading-tight text-[var(--ink-2)]">
            alert threshold {pct(pred.threshold)}
            <br />
            {pred.above_alert_threshold ? "above threshold" : "below threshold"}
          </div>
        </div>
        <div className="relative mt-3 h-2 rounded-full bg-[#eef2f7]">
          <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--fire)]" style={{ width: `${pred.probability * 100}%` }} />
          <div className="absolute -top-1.5 h-5 w-px bg-[var(--ink-3)]" style={{ left: `${pred.threshold * 100}%` }} title="Alert threshold" />
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-[var(--ink-2)]">
          This estimates subsequent satellite detection, not wildfire spread or damage.
        </p>
        {pred.calibration_note && (
          <p className="mt-1.5 flex gap-1.5 text-[12px] leading-relaxed text-[var(--ink-2)]">
            <Info size={13} className="mt-0.5 shrink-0 text-[var(--blue)]" /> {pred.calibration_note.text}
          </p>
        )}
        <div className="mt-2">
          <Disclosure label="Variation across model trees">
            <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">
              Individual trees ranged from <b className="tnum">{pct(tv.p10)}</b> to <b className="tnum">{pct(tv.p90)}</b> (10th–90th percentile of trees).
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--ink-3)]">{tv.note}</p>
          </Disclosure>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------------- 3. why this estimate */
export function FactorList({ pred }: { pred: Prediction }) {
  const factors = pred.explained_factors;
  if (!factors.length) return null;
  const scopes = Array.from(new Set(factors.filter((f) => f.comparison).map((f) => f.comparison!.scope_label)));
  const shared = scopes.length === 1 ? scopes[0] : null;
  return (
    <section>
      <SectionTitle>Why this estimate?</SectionTitle>
      <div className="mb-2 text-[11px] leading-snug text-[var(--ink-3)]">
        Relative influence on this model estimate.{shared ? ` Comparisons are with ${shared} (descriptive, not a danger threshold).` : ""}
      </div>
      <ul className="space-y-2.5">
        {factors.map((f) => (
          <li key={f.feature}>
            <div className="flex items-center gap-2">
              {f.direction === "up" ? (
                <ArrowUpRight size={15} className="shrink-0 text-[var(--fire)]" aria-label="raised the estimate" />
              ) : (
                <ArrowDownRight size={15} className="shrink-0 text-[var(--green)]" aria-label="lowered the estimate" />
              )}
              <span className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug" title={f.meaning}>{f.name}</span>
              <span className="shrink-0 text-[11px] text-[var(--ink-3)]">{f.influence_label} {f.direction === "up" ? "upward" : "downward"}</span>
            </div>
            <div className="ml-[23px] mt-1 h-1.5 rounded-full bg-[#eef2f7]" aria-hidden>
              <div className={`h-1.5 rounded-full ${f.direction === "up" ? "bg-[var(--fire-200)]" : "bg-[var(--green-200)]"}`} style={{ width: `${Math.max(f.influence * 100, 4)}%` }} />
            </div>
            <div className="ml-[23px] mt-1 text-[12px] leading-snug text-[var(--ink-2)]">
              <b className="font-semibold text-[var(--ink)]">{f.value_text}</b>
              {f.comparison ? (
                <> · {shared ? f.comparison.phrase.replace(/ of$/, "") : f.comparison.text}</>
              ) : (
                f.comparison_text && <> · {f.comparison_text}</>
              )}
              {". "}This {f.effect_text}.
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2.5">
        <Disclosure label="Technical details">
          <table className="w-full text-[11.5px]">
            <tbody>
              {factors.map((f) => (
                <tr key={f.feature} className="border-b border-[var(--line-2)] last:border-0">
                  <td className="py-1 font-mono text-[var(--ink-2)]">{f.feature}</td>
                  <td className="py-1 text-right tnum">{f.contribution_pp > 0 ? "+" : ""}{num(f.contribution_pp, 2)} pts</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--ink-3)]">
            Path contributions (Saabas) to the Random Forest probability, in probability points; with the model baseline they add up exactly to
            the estimate. They describe how the model reached this number, not what causes fires. Bars show each factor relative to the largest
            shown factor.
          </p>
        </Disclosure>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------------- 4. why this incident first */
const COMP_LABEL: Record<PriorityComponent, string> = { prediction: "Model estimate", exposure: "Exposure", recency: "Recency", evidence: "Evidence" };
const COMP_SHORT: Record<PriorityComponent, string> = { prediction: "Model", exposure: "Expos.", recency: "Recency", evidence: "Evid." };

export function RankingBlock({ pred }: { pred: Prediction }) {
  const rk = pred.ranking_explanation;
  const first = pred.priority.rank === 1;
  if (!rk.compared_with) return null;
  const diffs = rk.component_diffs ?? ({} as Record<PriorityComponent, number>);
  return (
    <section>
      <SectionTitle right={<span className="text-[11px] font-semibold text-[var(--ink-3)]">rank {pred.priority.rank} of {pred.priority.of}</span>}>
        <span className="inline-flex items-center gap-1.5"><Scale size={12} /> {first ? "Why this incident ranks first" : `Why it ranks below ${rk.compared_with_label}`}</span>
      </SectionTitle>
      <p className="text-[12.5px] leading-relaxed">{rk.text}</p>
      {rk.neighbour && (
        <p className="mt-1.5 rounded-lg bg-[#f7f9fc] px-2.5 py-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
          <b className="text-[var(--ink)]">Next one up:</b> {rk.neighbour.text}
        </p>
      )}
      {!rk.close && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.keys(COMP_LABEL) as PriorityComponent[]).map((k) => {
            const d = diffs[k] ?? 0;
            const tone = Math.abs(d) < 0.005 ? "bg-[#f1f5f9] text-[var(--ink-3)]" : d > 0 ? "bg-[var(--green-50)] text-[var(--green-700)]" : "bg-amber-50 text-amber-800";
            return (
              <span key={k} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tnum ${tone}`} title={`Difference in weighted priority points vs ${rk.compared_with_label}`}>
                {COMP_LABEL[k]} {d > 0 ? "+" : d < 0 ? "−" : "±"}{num(Math.abs(d), 2)}
              </span>
            );
          })}
        </div>
      )}
      {rk.resource_note && <p className="mt-2 text-[12px] leading-snug text-[var(--ink-2)]">{rk.resource_note}</p>}
      <div className="mt-2">
        <Disclosure label="Compare with all incidents">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-[var(--ink-3)]">
                <th className="py-1 font-bold">Incident</th>
                {(Object.keys(COMP_LABEL) as PriorityComponent[]).map((k) => (
                  <th key={k} className="py-1 pl-1.5 text-right font-bold" title={COMP_LABEL[k]}>{COMP_SHORT[k]}</th>
                ))}
                <th className="py-1 pl-1.5 text-right font-bold">Score Δ</th>
              </tr>
            </thead>
            <tbody>
              {rk.pairs.map((p) => (
                <tr key={p.incident_id} className="border-t border-[var(--line-2)]">
                  <td className="py-1 font-semibold">{p.label} <span className="font-normal text-[var(--ink-3)]">#{p.rank}</span></td>
                  {(Object.keys(COMP_LABEL) as PriorityComponent[]).map((k) => (
                    <td key={k} className="py-1 text-right tnum">{p.component_diffs[k] > 0 ? "+" : ""}{num(p.component_diffs[k], 2)}</td>
                  ))}
                  <td className="py-1 text-right font-bold tnum">{p.score_diff > 0 ? "+" : ""}{num(p.score_diff, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--ink-3)]">
            Differences in weighted priority points ({shortId(pred.incident_id)} minus the other incident). They add up to the score difference. The
            weights are fixed: model estimate 0.45, protected-area exposure 0.25, recency 0.15, evidence 0.15. This explains the resource ranking,
            not the model estimate.
          </p>
        </Disclosure>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------------- 5. what would improve confidence */
export function ConfidenceBlock({ pred }: { pred: Prediction }) {
  const gaps = pred.confidence_guidance; // ordered by severity on the backend
  const shown = gaps.slice(0, 2);
  const rest = gaps.slice(2);
  if (!gaps.length) return null;
  const Item = ({ g }: { g: (typeof gaps)[number] }) => (
    <li className="text-[12.5px] leading-snug">
      <div className="font-semibold">{g.missing}</div>
      <div className="text-[var(--ink-2)]">{g.why_it_matters} <span className="text-[var(--ink)]">{g.verification_step}</span></div>
    </li>
  );
  return (
    <section>
      <SectionTitle><span className="inline-flex items-center gap-1.5"><Lightbulb size={12} /> What would improve confidence?</span></SectionTitle>
      <ul className="space-y-2">{shown.map((g) => <Item key={g.code} g={g} />)}</ul>
      {rest.length > 0 && (
        <div className="mt-2">
          <Disclosure label={`${rest.length} more`}>
            <ul className="space-y-2">{rest.map((g) => <Item key={g.code} g={g} />)}</ul>
          </Disclosure>
        </div>
      )}
      <p className="mt-2 text-[11px] text-[var(--ink-3)]">New evidence may change the recommendation; none of these steps guarantees certainty.</p>
    </section>
  );
}

/* ----------------------------------------------------------------------------- 6. evidence limitations */
const SEV: Record<EvidenceLimitation["severity"], { label: string; icon: ReactNode; cls: string }> = {
  high: { label: "Important", icon: <AlertOctagon size={13} />, cls: "text-[var(--red-700)]" },
  medium: { label: "Moderate", icon: <AlertTriangle size={13} />, cls: "text-amber-700" },
  low: { label: "Minor", icon: <Info size={13} />, cls: "text-[var(--ink-2)]" },
};

export function LimitationsBlock({ pred }: { pred: Prediction }) {
  const lims = pred.evidence_limitations;
  if (!lims.length) return null;
  const Item = ({ l }: { l: EvidenceLimitation }) => (
    <li className="text-[12.5px] leading-snug">
      <div className={`flex items-center gap-1.5 font-semibold ${SEV[l.severity].cls}`}>
        {SEV[l.severity].icon} <span className="text-[10.5px] font-bold uppercase tracking-wider">{SEV[l.severity].label}</span>
        <span className="text-[var(--ink)]">{l.title}</span>
      </div>
      <div className="ml-[19px] text-[var(--ink-2)]">{l.text}</div>
    </li>
  );
  return (
    <section className="rounded-[12px] bg-amber-50/50 p-3 ring-1 ring-inset ring-amber-200/60">
      <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold text-amber-800">
        <AlertTriangle size={13} /> Evidence limitations
      </div>
      <ul className="space-y-2">{lims.slice(0, 2).map((l) => <Item key={l.code} l={l} />)}</ul>
      {lims.length > 2 && (
        <div className="mt-2">
          <Disclosure label={`${lims.length - 2} more`}>
            <ul className="space-y-2">{lims.slice(2).map((l) => <Item key={l.code} l={l} />)}</ul>
          </Disclosure>
        </div>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------------------- 7. supporting evidence */
export function TraceBlock({ pred }: { pred: Prediction }) {
  const t = pred.trace;
  const Row = ({ k, v }: { k: string; v: ReactNode }) => (
    <div className="flex justify-between gap-3 border-b border-[var(--line-2)] py-1 text-[11.5px] last:border-0">
      <span className="shrink-0 text-[var(--ink-2)]">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
  return (
    <section>
      <Disclosure label={<span className="inline-flex items-center gap-1.5"><ListChecks size={13} /> View supporting evidence</span>}>
        <div className="rounded-[10px] border border-[var(--line)] p-3">
          <Row k="Incident" v={<span className="font-mono">{t.incident_id}</span>} />
          <Row k="Detection data" v={`${t.firms.product}${t.firms.is_synthetic ? " (synthetic)" : ""}`} />
          <Row k="Data source" v={t.firms.source} />
          <div className="mt-1.5 text-[11px] text-[var(--ink-3)]">{t.firms.matching_rule}</div>
          <div className="scroll-thin mt-1 max-h-36 overflow-auto">
            <table className="w-full text-[11px] tnum">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--ink-3)]">
                  <th className="py-0.5">Time (UTC)</th><th>Sat.</th><th>Product</th><th>v</th><th>Type</th><th>Conf.</th><th className="text-right">FRP</th>
                </tr>
              </thead>
              <tbody>
                {t.firms.detections.map((d, i) => (
                  <tr key={i} className="border-t border-[var(--line-2)]">
                    <td className="py-0.5">{d.acq_date} {d.acq_time_utc}</td><td>{d.satellite}</td><td>{d.source_product}</td><td>{d.version}</td>
                    <td>{d.type ?? "—"}</td><td>{d.confidence}</td><td className="text-right">{num(d.frp_mw, 1)}</td>
                  </tr>
                ))}
                {t.firms.detections.length === 0 && <tr><td colSpan={7} className="py-1 text-[var(--ink-3)]">No raw rows matched.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-2" />
          <Row k="Weather" v={`${t.weather.source}; tile ${t.weather.tile_lat ?? "—"}, ${t.weather.tile_lon ?? "—"}; ${t.weather.date ?? "—"}`} />
          <Row k="Weather timing" v={t.weather.alignment} />
          <Row k="Protected area" v={`${t.protected_area.name} · ${t.protected_area.distance_km} km · ${t.protected_area.boundary} (${t.protected_area.source})`} />
          <Row k="Model" v={`${t.model.name} ${t.model.version}${t.model.trained_at ? ` · trained ${utc(t.model.trained_at)}` : ""}`} />
          <Row k="Prediction target" v={t.model.target} />
          <Row k="Explanation method" v={t.explanation_method} />
          <Row k="Computed" v={utc(t.inference_time_utc)} />
          <Row k="Priority policy" v={t.priority_policy_version} />
          <Row k="Priority components" v={Object.entries(t.priority_components).map(([k, v]) => `${COMP_LABEL[k as PriorityComponent]} ${num(v, 3)}`).join(" · ")} />
          <Row k="Substituted values" v={t.substituted_values.length ? t.substituted_values.map((s) => `${s.feature} → ${s.substituted_value}`).join("; ") : "None"} />
        </div>
      </Disclosure>
    </section>
  );
}
