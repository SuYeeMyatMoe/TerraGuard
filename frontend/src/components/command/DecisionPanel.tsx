"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Eye, FileText, RefreshCw, Send, Truck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { RecPill } from "@/components/ui";
import { num, pct, shortId, utc } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ActionRecord, ActionType, ComparisonMetric, Incident, Prediction, SimulateResponse } from "@/lib/types";

export function DecisionPanel() {
  const data = useStore((s) => s.data);
  const selectedId = useStore((s) => s.selectedId);
  const predictions = useStore((s) => s.predictions);
  const sim = useStore((s) => s.sim);
  const simStale = useStore((s) => s.simStale);
  const view = useStore((s) => s.view);
  const actions = useStore((s) => s.actions);
  const openFieldBrief = useStore((s) => s.openFieldBrief);
  const toast = useStore((s) => s.toast);
  const [sheet, setSheet] = useState<ActionType | null>(null);
  useEffect(() => setSheet(null), [selectedId]);

  const inc = data?.incidents.find((i) => i.id === selectedId);
  const pred = selectedId ? predictions[selectedId] : undefined;
  const lastAction: ActionRecord | undefined = actions.find((a) => a.incident_id === selectedId);
  const team = data?.team;
  const crewHere = team?.assigned_incident_id === selectedId;

  return (
    <div className="panel-float shrink-0 px-4 py-3.5">
      <CrewCard />

      {view === "sim" && (
        <div className="mt-3 border-t border-[var(--line-2)] pt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="eyebrow">Hypothetical response test</div>
            {sim && <span className="text-[10.5px] font-semibold text-[var(--ink-3)]">{sim.n_seeds} runs, same conditions</span>}
          </div>
          {!sim && <div className="rounded-lg bg-[#f7f9fc] p-3 text-[12px] text-[var(--ink-2)]">Preparing the response test…</div>}
          {sim && <Comparison sim={sim} stale={simStale} />}
        </div>
      )}

      <div className="mt-3 border-t border-[var(--line-2)] pt-3">
        {!inc || !pred || !team ? (
          <div className="text-[12.5px] text-[var(--ink-2)]">Select an incident to decide where the only crew goes.</div>
        ) : sheet ? (
          <ConfirmSheet inc={inc} pred={pred} action={sheet} onClose={() => setSheet(null)} />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="eyebrow">Decision · {shortId(inc.id)}</div>
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
                Recommends <RecPill rec={pred.priority.recommendation} size="sm" />
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-[var(--ink-3)]">The reasons are in the incident panel above.</p>
            {crewHere ? (
              <div className="mt-2.5 flex items-center gap-2 rounded-[10px] bg-[var(--cyan-50)] px-3 py-2 text-[12.5px] font-semibold text-[#0e7490] ring-1 ring-inset ring-[#a5e9f5]">
                <CheckCircle2 size={15} /> {team.name} is assigned here
                {team.since && <span className="ml-auto font-medium opacity-80">since {utc(team.since, false)}</span>}
              </div>
            ) : (
              <>
                {pred.priority.recommendation === "MONITOR" && (
                  <button
                    className="btn btn-primary mt-2.5 w-full"
                    onClick={() =>
                      toast({
                        tone: "info",
                        title: `Continuing to monitor ${shortId(inc.id)}`,
                        body: "No action recorded. The incident stays on the map and will be re-evaluated if new detections arrive.",
                      })
                    }
                  >
                    <Eye size={15} /> Continue monitoring
                  </button>
                )}
                <button
                  className={`btn mt-2 w-full ${pred.priority.recommendation === "INSPECT" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setSheet("ASSIGN_INSPECTION")}
                >
                  <Send size={15} /> Send crew to {shortId(inc.id)}
                </button>
              </>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                className={`btn ${pred.priority.recommendation === "RECHECK" && !crewHere ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setSheet("REQUEST_RECHECK")}
                title="Request another satellite pass or remote review. Does not use the crew."
              >
                <RefreshCw size={15} /> Request recheck
              </button>
              <button className="btn btn-secondary" onClick={() => setSheet("DISMISS")}>
                <XCircle size={15} /> Dismiss
              </button>
            </div>
            {lastAction && lastAction.action === "ASSIGN_INSPECTION" && crewHere && (
              <button className="btn btn-secondary mt-2 w-full" onClick={() => openFieldBrief(inc.id, lastAction)}>
                <FileText size={15} /> Generate field brief for the crew
              </button>
            )}
            <p className="mt-1.5 text-[10.5px] leading-snug text-[var(--ink-3)]">
              Every decision is recorded with the recommendation at that moment, your reason, and who is left waiting.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function CrewCard() {
  const data = useStore((s) => s.data);
  const select = useStore((s) => s.select);
  const team = data?.team;
  if (!team) return null;
  const at = data?.incidents.find((i) => i.id === team.assigned_incident_id);
  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-[11px] ${at ? "bg-[var(--cyan-50)] text-[var(--cyan)]" : "bg-[var(--green-50)] text-[var(--green)]"}`}>
        <Truck size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold leading-tight">{team.name}</div>
        <div className="truncate text-[11.5px] text-[var(--ink-2)]">
          {team.size}-person crew · {team.base}
        </div>
      </div>
      {at ? (
        <button
          onClick={() => select(at.id)}
          className="shrink-0 rounded-full bg-[var(--cyan-50)] px-2.5 py-1 text-[11.5px] font-bold text-[#0e7490] ring-1 ring-inset ring-[#a5e9f5] hover:brightness-95"
          title="Show the assigned incident"
        >
          At {shortId(at.id)} <ArrowRight size={11} className="inline" />
        </button>
      ) : (
        <span className="shrink-0 rounded-full bg-[var(--green-50)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--green-700)] ring-1 ring-inset ring-[var(--green-200)]">
          Available
        </span>
      )}
    </div>
  );
}

function ConfirmSheet({ inc, pred, action, onClose }: { inc: Incident; pred: Prediction; action: ActionType; onClose: () => void }) {
  const data = useStore((s) => s.data)!;
  const predictions = useStore((s) => s.predictions);
  const decide = useStore((s) => s.decide);
  const team = data.team;
  const rec = pred.priority.recommendation;
  const follows = (action === "ASSIGN_INSPECTION" && rec === "INSPECT") || (action === "REQUEST_RECHECK" && rec === "RECHECK");
  const [reason, setReason] = useState(follows ? pred.priority.reason : "");
  const [busy, setBusy] = useState(false);
  const releasing = action !== "ASSIGN_INSPECTION" && team.assigned_incident_id === inc.id;
  const reassignFrom = action === "ASSIGN_INSPECTION" && team.assigned_incident_id && team.assigned_incident_id !== inc.id ? team.assigned_incident_id : null;
  const willWait = data.incidents.filter((i) => i.id !== inc.id && i.attendance !== "dismissed" && i.attendance !== "recheck");

  const title =
    action === "ASSIGN_INSPECTION"
      ? `Send ${team.name} to ${shortId(inc.id)}?`
      : action === "REQUEST_RECHECK"
        ? `Request a recheck of ${shortId(inc.id)}?`
        : `Dismiss ${shortId(inc.id)}?`;

  const submit = async () => {
    setBusy(true);
    const ok = await decide(inc.id, action, reason.trim());
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="animate-in">
      <div className="text-[13.5px] font-bold leading-snug">{title}</div>
      <div className="text-[11.5px] text-[var(--ink-2)]">{inc.region}, {inc.country} · {pct(pred.probability)} 48 h follow-up · rank {pred.priority.rank}</div>

      {action === "ASSIGN_INSPECTION" && (
        <div className="mt-2.5 rounded-[10px] bg-amber-50 p-2.5 ring-1 ring-inset ring-amber-200">
          <div className="text-[11.5px] font-bold text-amber-800">
            {willWait.length ? "Left waiting without a crew:" : "No other incident is waiting."}
          </div>
          <ul className="mt-1 space-y-0.5">
            {willWait.map((w) => {
              const p = predictions[w.id];
              return (
                <li key={w.id} className="flex items-center gap-2 text-[12px] text-amber-900">
                  <span className="font-semibold">{shortId(w.id)}</span>
                  <span className="truncate">{w.region}</span>
                  <span className="ml-auto tnum">{p ? `${pct(p.probability)} · rank ${p.priority.rank}` : "—"}</span>
                </li>
              );
            })}
          </ul>
          {reassignFrom && (
            <div className="mt-1.5 text-[11.5px] font-semibold text-amber-900">
              The crew leaves {shortId(reassignFrom)}, which becomes unattended.
            </div>
          )}
        </div>
      )}
      {action !== "ASSIGN_INSPECTION" && (
        <div className="mt-2 text-[12px] text-[var(--ink-2)]">
          {releasing ? "The crew is currently here. This releases it and makes it available again." : "This does not use the crew."}
        </div>
      )}

      {!follows && action !== "DISMISS" && (
        <div className="mt-2 flex gap-1.5 text-[11.5px] leading-snug text-amber-800">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          <span>
            The recommendation is <b>{rec.toLowerCase()}</b>. Overriding it is allowed. Say why for the record.
          </span>
        </div>
      )}
      <label className="mt-2 block">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">Reason for the record</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={600}
          placeholder={action === "DISMISS" ? "Why is this incident being dismissed?" : "Why this decision?"}
          className="mt-1 w-full resize-none rounded-[10px] border border-[var(--line)] px-3 py-2 text-[12.5px] leading-snug outline-none focus:border-[var(--blue)]"
        />
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !reason.trim()}>
          {busy ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
          {action === "ASSIGN_INSPECTION" ? "Confirm & record" : "Record decision"}
        </button>
      </div>
    </div>
  );
}

function Comparison({ sim, stale }: { sim: SimulateResponse; stale: boolean }) {
  const [more, setMore] = useState(false);
  const c = sim.comparison;
  const fa = sim.policies.first_alert.metrics;
  const ai = sim.policies.ai_priority.metrics;
  const yours = sim.policies.coordinator?.metrics;
  const rows: { label: string; m?: ComparisonMetric; b: number; a: number; y?: number; digits?: number }[] = [
    { label: "Burned cells", m: c.burned_cells, b: c.burned_cells.first_alert_mean, a: c.burned_cells.ai_priority_mean, y: yours?.burned_cells.mean, digits: 1 },
    { label: "Protected cells burned", m: c.protected_cells_burned, b: c.protected_cells_burned.first_alert_mean, a: c.protected_cells_burned.ai_priority_mean, y: yours?.protected_cells_burned.mean, digits: 1 },
    { label: "Loss index", m: c.loss_index, b: c.loss_index.first_alert_mean, a: c.loss_index.ai_priority_mean, y: yours?.loss_index.mean, digits: 1 },
    { label: "Crew-hours", b: fa.team_hours.mean, a: ai.team_hours.mean, y: yours?.team_hours.mean, digits: 1 },
    { label: "Response cost (RM)", b: fa.response_cost_rm.mean, a: ai.response_cost_rm.mean, y: yours?.response_cost_rm.mean, digits: 0 },
  ];
  const cols = yours ? "grid-cols-[1fr_54px_58px_48px]" : "grid-cols-[1fr_64px_64px_60px]";
  return (
    <div className={stale ? "opacity-60" : ""}>
      <div className={`grid ${cols} gap-x-2 text-[10.5px] font-bold uppercase tracking-wider text-[var(--ink-3)]`}>
        <span />
        {yours && <span className="text-right text-[#0e7490]">Yours</span>}
        <span className="text-right">First-alert</span>
        <span className="text-right">AI</span>
        {!yours && <span className="text-right">Δ</span>}
      </div>
      {rows.slice(0, more ? rows.length : 3).map((r) => {
        const d = r.a - r.b;
        const significant = r.m ? Math.abs(r.m.difference_mean) > r.m.difference_ci95 && r.m.difference_mean !== 0 : false;
        const tone = Math.abs(d) < 1e-9 || !r.m ? "text-[var(--ink-2)]" : significant ? (d < 0 ? "text-[var(--green-700)]" : "text-[var(--red-700)]") : "text-[var(--ink-2)]";
        return (
          <div key={r.label} className={`grid ${cols} items-baseline gap-x-2 border-b border-[var(--line-2)] py-1.5 text-[12.5px] last:border-0`}>
            <span className="text-[var(--ink-2)]">{r.label}</span>
            {yours && <span className="text-right font-bold text-[#0e7490] tnum">{num(r.y, r.digits)}</span>}
            <span className="text-right font-semibold tnum">{num(r.b, r.digits)}</span>
            <span className="text-right font-semibold tnum">{num(r.a, r.digits)}</span>
            {!yours && (
              <span className={`text-right font-bold tnum ${tone}`}>
                {Math.abs(d) < 1e-9 ? "0" : `${d > 0 ? "+" : "−"}${num(Math.abs(d), r.digits)}`}
              </span>
            )}
          </div>
        );
      })}
      <button className="mt-1 text-[11px] font-semibold text-[var(--blue)] hover:underline" onClick={() => setMore(!more)}>
        {more ? "Hide crew-hours & cost" : "Show crew-hours & cost"}
      </button>
      <p className="mt-1 text-[11.5px] leading-snug text-[var(--ink-2)]">
        {c.coordinator ? (
          c.coordinator.matches ? (
            <>Your assignment matches the {c.coordinator.matches === "ai_priority" ? "AI-priority" : "first-alert"} choice in this test.</>
          ) : (
            <>
              Your assignment differs from both policies. Mean loss index vs AI-priority:{" "}
              {c.coordinator.loss_index.vs_ai_priority >= 0 ? "lower" : "higher"} by {num(Math.abs(c.coordinator.loss_index.vs_ai_priority), 1)}.
            </>
          )
        ) : c.same_allocation ? (
          "Both policies send the crew to the same incident, so the outcomes are identical by construction."
        ) : (
          <>
            Lower loss with AI-priority in <b>{c.loss_index.seeds_ai_better}</b>/{c.loss_index.n_seeds} runs (first-alert{" "}
            <b>{c.loss_index.seeds_first_alert_better}</b>). Mean loss {c.loss_index.difference_mean >= 0 ? "lower" : "higher"} with AI by{" "}
            {num(Math.abs(c.loss_index.difference_mean), 1)} ± {num(c.loss_index.difference_ci95, 1)} (95% CI).
          </>
        )}
        {stale && <span className="font-semibold text-amber-700"> Conditions changed. Test again to update.</span>}
      </p>
    </div>
  );
}
