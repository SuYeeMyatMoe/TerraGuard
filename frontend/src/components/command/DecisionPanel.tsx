"use client";

import { CheckCircle2, FileText, Minus, Plus, RefreshCw, ScanSearch, XCircle } from "lucide-react";
import { useState } from "react";
import { RecPill } from "@/components/ui";
import { num, shortId } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ActionRecord, ActionType, ComparisonMetric } from "@/lib/types";

export function DecisionPanel() {
  const data = useStore((s) => s.data);
  const selectedId = useStore((s) => s.selectedId);
  const predictions = useStore((s) => s.predictions);
  const teams = useStore((s) => s.teams);
  const setTeams = useStore((s) => s.setTeams);
  const sim = useStore((s) => s.sim);
  const simStale = useStore((s) => s.simStale);
  const policy = useStore((s) => s.policy);
  const view = useStore((s) => s.view);
  const takeAction = useStore((s) => s.takeAction);
  const openFieldBrief = useStore((s) => s.openFieldBrief);
  const actions = useStore((s) => s.actions);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<ActionType | null>(null);

  const inc = data?.incidents.find((i) => i.id === selectedId);
  const pred = selectedId ? predictions[selectedId] : undefined;
  const lastAction: ActionRecord | undefined = actions.find((a) => a.incident_id === selectedId);
  const assignedNow = sim?.policies[policy]?.assigned ?? [];

  const act = async (a: ActionType, r?: string) => {
    if (!selectedId) return;
    setBusy(a);
    await takeAction(selectedId, a, r);
    setBusy(null);
    setDismissing(false);
    setReason("");
  };

  return (
    <div className="panel-float shrink-0 px-4 py-3.5">
      {/* resources & strategy */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Resources</div>
          <div className="mt-0.5 text-[13px] font-semibold">
            {teams} field team{teams === 1 ? "" : "s"} available
            {sim && <span className="font-medium text-[var(--ink-2)]"> · {assignedNow.length} assigned</span>}
          </div>
        </div>
        <div className="flex items-center rounded-[10px] border border-[var(--line)]">
          <button className="grid h-8 w-8 place-items-center text-[var(--ink-2)] hover:text-[var(--ink)] disabled:opacity-40" disabled={teams <= 0} onClick={() => setTeams(teams - 1)} aria-label="Fewer teams">
            <Minus size={14} />
          </button>
          <span className="w-6 text-center text-[13px] font-bold tnum">{teams}</span>
          <button className="grid h-8 w-8 place-items-center text-[var(--ink-2)] hover:text-[var(--ink)] disabled:opacity-40" disabled={teams >= 3} onClick={() => setTeams(teams + 1)} aria-label="More teams">
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* comparison (3D mode; Earth View keeps the panel compact) */}
      {view === "sim" && <div className="mt-3 border-t border-[var(--line-2)] pt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="eyebrow">Baseline vs AI-prioritised response</div>
          {sim && <span className="text-[10.5px] font-semibold text-[var(--ink-3)]">{sim.n_seeds} seeds</span>}
        </div>
        {!sim && <div className="rounded-lg bg-[#f7f9fc] p-3 text-[12px] text-[var(--ink-2)]">Run the simulation to compare policies under identical conditions.</div>}
        {sim && <Comparison sim={sim} stale={simStale} />}
      </div>}

      {/* recommendation & approval */}
      <div className="mt-3 border-t border-[var(--line-2)] pt-3">
        {!inc || !pred ? (
          <div className="text-[12.5px] text-[var(--ink-2)]">Select an incident to review its recommendation and approve an action.</div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="eyebrow">Recommended action · {shortId(inc.id)}</div>
              <RecPill rec={pred.priority.recommendation} size="sm" />
            </div>
            <p className="mt-1 text-[12px] leading-snug text-[var(--ink-2)]">{pred.priority.reason}</p>
            {lastAction && (
              <div className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--green-700)]">
                <CheckCircle2 size={14} /> {inc.status} · {new Date(lastAction.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
            {!dismissing ? (
              <div className="mt-2.5 grid grid-cols-[1fr_auto_auto] gap-2">
                <button
                  className={`btn ${pred.priority.recommendation === "INSPECT" ? "btn-primary" : "btn-secondary"}`}
                  disabled={!!busy}
                  onClick={() => act("ASSIGN_INSPECTION")}
                >
                  {busy === "ASSIGN_INSPECTION" ? <RefreshCw size={15} className="animate-spin" /> : <ScanSearch size={15} />}
                  Assign Inspection
                </button>
                <button
                  className={`btn ${pred.priority.recommendation === "RECHECK" ? "btn-primary" : "btn-secondary"}`}
                  disabled={!!busy}
                  onClick={() => act("REQUEST_RECHECK")}
                  title="Request another satellite pass or remote review"
                >
                  {busy === "REQUEST_RECHECK" ? <RefreshCw size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  Recheck
                </button>
                <button className="btn btn-secondary px-2.5" disabled={!!busy} onClick={() => setDismissing(true)} title="Dismiss with reason">
                  <XCircle size={15} />
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <input
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for dismissal (required)"
                  className="h-9 w-full rounded-[10px] border border-[var(--line)] px-3 text-[13px] outline-none focus:border-[var(--blue)]"
                />
                <div className="flex gap-2">
                  <button className="btn btn-secondary flex-1" onClick={() => setDismissing(false)}>Cancel</button>
                  <button className="btn btn-primary flex-1" disabled={!reason.trim() || !!busy} onClick={() => act("DISMISS", reason.trim())}>
                    Dismiss incident
                  </button>
                </div>
              </div>
            )}
            {lastAction && lastAction.action !== "DISMISS" && (
              <button className="btn btn-secondary mt-2 w-full" onClick={() => openFieldBrief(inc.id, lastAction.id)}>
                <FileText size={15} /> Generate Field Brief
              </button>
            )}
            <p className="mt-1.5 text-[10.5px] leading-snug text-[var(--ink-3)]">
              Administrative decision only · no automatic dispatch or enforcement.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Comparison({ sim, stale }: { sim: NonNullable<ReturnType<typeof useStore.getState>["sim"]>; stale: boolean }) {
  const [more, setMore] = useState(false);
  const c = sim.comparison;
  const fa = sim.policies.first_alert.metrics;
  const ai = sim.policies.ai_priority.metrics;
  const rows: { label: string; m?: ComparisonMetric; b: number; a: number; unit?: string; digits?: number }[] = [
    { label: "Burned cells", m: c.burned_cells, b: c.burned_cells.first_alert_mean, a: c.burned_cells.ai_priority_mean, digits: 1 },
    { label: "Protected cells burned", m: c.protected_cells_burned, b: c.protected_cells_burned.first_alert_mean, a: c.protected_cells_burned.ai_priority_mean, digits: 1 },
    { label: "Loss index", m: c.loss_index, b: c.loss_index.first_alert_mean, a: c.loss_index.ai_priority_mean, digits: 1 },
    { label: "Team-hours", b: fa.team_hours.mean, a: ai.team_hours.mean, digits: 1 },
    { label: "Response cost (RM)", b: fa.response_cost_rm.mean, a: ai.response_cost_rm.mean, digits: 0 },
  ];
  return (
    <div className={stale ? "opacity-60" : ""}>
      <div className="grid grid-cols-[1fr_64px_64px_66px] gap-x-2 text-[10.5px] font-bold uppercase tracking-wider text-[var(--ink-3)]">
        <span />
        <span className="text-right">First-alert</span>
        <span className="text-right">AI</span>
        <span className="text-right">Δ</span>
      </div>
      {rows.slice(0, more ? rows.length : 3).map((r) => {
        const d = r.a - r.b; // negative = AI lower
        const significant = r.m ? Math.abs(r.m.difference_mean) > r.m.difference_ci95 && r.m.difference_mean !== 0 : false;
        const tone =
          Math.abs(d) < 1e-9 ? "text-[var(--ink-3)]" : r.m ? (significant ? (d < 0 ? "text-[var(--green-700)]" : "text-[var(--red-700)]") : "text-[var(--ink-2)]") : "text-[var(--ink-2)]";
        return (
          <div key={r.label} className="grid grid-cols-[1fr_64px_64px_66px] items-baseline gap-x-2 border-b border-[var(--line-2)] py-1.5 text-[12.5px] last:border-0">
            <span className="text-[var(--ink-2)]">{r.label}</span>
            <span className="text-right font-semibold tnum">{num(r.b, r.digits)}</span>
            <span className="text-right font-semibold tnum">{num(r.a, r.digits)}</span>
            <span className={`text-right font-bold tnum ${tone}`}>
              {Math.abs(d) < 1e-9 ? "0" : `${d > 0 ? "+" : "−"}${num(Math.abs(d), r.digits)}`}
            </span>
          </div>
        );
      })}
      <button className="mt-1 text-[11px] font-semibold text-[var(--blue)] hover:underline" onClick={() => setMore(!more)}>
        {more ? "Hide team-hours & cost" : "Show team-hours & cost"}
      </button>
      <p className="mt-1 text-[11.5px] leading-snug text-[var(--ink-2)]">
        {c.same_allocation ? (
          "Both policies sent the team to the same incident, so outcomes are identical by construction."
        ) : (
          <>
            Lower loss with AI-priority in <b>{c.loss_index.seeds_ai_better}</b>/{c.loss_index.n_seeds} seeds (first-alert{" "}
            <b>{c.loss_index.seeds_first_alert_better}</b>). Mean loss {c.loss_index.difference_mean >= 0 ? "lower" : "higher"} with AI by{" "}
            {num(Math.abs(c.loss_index.difference_mean), 1)} ± {num(c.loss_index.difference_ci95, 1)} (95% CI).
            {Math.abs(c.loss_index.difference_mean) <= c.loss_index.difference_ci95 && " Not statistically distinguishable."}
          </>
        )}
        {stale && <span className="font-semibold text-amber-700"> Settings changed — run again to update.</span>}
      </p>
    </div>
  );
}
