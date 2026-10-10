"use client";

import { AlertTriangle, Cloud, Download, HardDrive, History, RefreshCw, Truck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { RecPill } from "@/components/ui";
import { pct, shortId, utc } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { ActionRecord, RecordBackend } from "@/lib/types";

const ACTION_TEXT: Record<string, string> = {
  ASSIGN_INSPECTION: "Crew sent",
  REQUEST_RECHECK: "Recheck requested",
  DISMISS: "Dismissed",
};

export function DecisionRecord() {
  const open = useStore((s) => s.recordOpen);
  const setOpen = useStore((s) => s.setRecordOpen);
  const actions = useStore((s) => s.actions);
  const archived = useStore((s) => s.archivedActions);
  const loading = useStore((s) => s.actionsLoading);
  const error = useStore((s) => s.actionsError);
  const loadActions = useStore((s) => s.loadActions);
  const data = useStore((s) => s.data);
  const [reveal, setReveal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, setOpen]);
  if (!open) return null;

  const exportCsv = () => {
    const rows = [...actions, ...archived];
    const head = ["id", "time_utc", "scenario", "action", "incident", "region", "crew", "recommendation_at_time", "followed",
      "priority_rank", "probability_48h", "reason", "left_waiting", "reassigned_from", "stored_in", "archived_at"];
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = rows.map((a) =>
      [a.id, a.created_at, a.scenario_id, a.action, a.incident_id, a.incident_region, a.team_name, a.recommendation_at_time,
        a.followed_recommendation, a.priority_rank, a.probability,
        a.reason, (a.left_waiting ?? []).map((w) => `${w.incident_id} (${pct(w.probability)}, ${w.recommendation})`).join("; "),
        a.reassigned_from, a.stored_in, a.archived_at].map(esc).join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `terraguard-decision-record-${data?.scenario.id ?? "all"}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#172638]/20" onClick={() => setOpen(false)}>
      <aside className="slide-in flex h-full w-[520px] flex-col bg-white shadow-[-20px_0_60px_rgba(23,38,56,0.15)]" onClick={(e) => e.stopPropagation()} aria-label="Decision record">
        <div className="border-b border-[var(--line)] px-6 pb-4 pt-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="eyebrow">Decision record</div>
              <h2 className="mt-1 text-[19px] font-bold leading-snug">Who got the crew, who waited, and why</h2>
            </div>
            <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--ink-2)]" aria-label="Close">
              <X size={15} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StorageChip backend={data?.record_backend} />
            <span className="text-[11.5px] text-[var(--ink-2)]">
              Replay {data ? utc(data.scenario.replay_time_utc) : ""}
            </span>
            <button className="btn btn-secondary ml-auto h-8 px-2.5 text-[12px]" onClick={exportCsv} disabled={!actions.length && !archived.length}>
              <Download size={14} /> Export CSV
            </button>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-[var(--ink-2)]">
            <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} className="accent-[var(--blue)]" />
            Reveal what happened next (historical replay only, not available in live operations)
          </label>
        </div>
        <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {loading && <div role="status" className="text-[12.5px] text-[var(--ink-2)]">Loading decision record…</div>}
          {error && (
            <div role="alert" className="rounded-lg bg-red-50 p-3 text-[12.5px] text-red-700">
              <p>Could not load the decision record. {error}</p>
              <button className="btn btn-ghost mt-2 h-8" disabled={loading} onClick={() => loadActions()}><RefreshCw size={13} /> Retry</button>
            </div>
          )}
          {!loading && !error && actions.length === 0 && (
            <div className="rounded-[12px] border border-dashed border-[var(--line)] p-6 text-center text-[12.5px] text-[var(--ink-2)]">
              No decisions recorded for this replay yet. Select an incident and send the crew.
            </div>
          )}
          {actions.map((a) => <Entry key={`${a.stored_in}-${a.id}`} a={a} reveal={reveal} />)}
          {archived.length > 0 && (
            <div className="pt-2">
              <button className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)]" onClick={() => setShowArchived(!showArchived)}>
                <History size={14} /> Earlier sessions ({archived.length}) {showArchived ? "▴" : "▾"}
              </button>
              {showArchived && <div className="mt-2 space-y-3 opacity-75">{archived.map((a) => <Entry key={`${a.stored_in}-${a.id}`} a={a} reveal={reveal} />)}</div>}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function StorageChip({ backend }: { backend?: RecordBackend }) {
  if (backend === "supabase")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--green-50)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--green-700)] ring-1 ring-inset ring-[var(--green-200)]">
        <Cloud size={12} /> Stored in Supabase
      </span>
    );
  if (backend === "sqlite_fallback")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
        <AlertTriangle size={12} /> Saved locally: Supabase unreachable
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[11.5px] font-bold text-[var(--ink-2)] ring-1 ring-inset ring-[var(--line)]">
      <HardDrive size={12} /> Stored locally (SQLite)
    </span>
  );
}

function Entry({ a, reveal }: { a: ActionRecord; reveal: boolean }) {
  const assign = a.action === "ASSIGN_INSPECTION";
  return (
    <article className="rounded-[12px] border border-[var(--line)] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13.5px] font-bold">
            {assign && <Truck size={15} className="shrink-0 text-[var(--cyan)]" />}
            <span className="truncate">
              {assign ? `${a.team_name ?? "Crew"} → ${shortId(a.incident_id)}` : `${ACTION_TEXT[a.action]} · ${shortId(a.incident_id)}`}
            </span>
          </div>
          <div className="text-[11.5px] text-[var(--ink-2)]">
            {a.incident_region ?? ""} · {a.incident_id}
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px] text-[var(--ink-3)] tnum">
          {new Date(a.created_at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          {a.stored_in === "local_fallback" && <div className="font-semibold text-amber-700">local, pending sync</div>}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="text-[var(--ink-2)]">Recommended then:</span>
        {a.recommendation_at_time && <RecPill rec={a.recommendation_at_time} size="sm" />}
        {a.followed_recommendation === true && <span className="font-semibold text-[var(--green-700)]">followed</span>}
        {a.followed_recommendation === false && <span className="font-semibold text-amber-700">overridden</span>}
        {a.probability != null && <span className="text-[var(--ink-2)] tnum">· {pct(a.probability)} 48 h · rank {a.priority_rank}</span>}
      </div>
      {a.reason && (
        <p className="mt-2 rounded-lg bg-[#f7f9fc] px-3 py-2 text-[12.5px] leading-snug">
          <span className="text-[var(--ink-3)]">Reason: </span>“{a.reason}”
        </p>
      )}
      {a.reassigned_from && <div className="mt-2 text-[12px] text-[var(--ink-2)]">Crew reassigned from {shortId(a.reassigned_from)}.</div>}
      {assign && a.left_waiting && a.left_waiting.length > 0 && (
        <div className="mt-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Left waiting</div>
          <ul className="mt-1 space-y-1">
            {a.left_waiting.map((w) => (
              <li key={w.incident_id} className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold">{shortId(w.incident_id)}</span>
                <span className="truncate text-[var(--ink-2)]">{w.region}</span>
                <span className="ml-auto text-[var(--ink-2)] tnum">{pct(w.probability)} · rank {w.rank}</span>
                {w.recommendation && <RecPill rec={w.recommendation as "INSPECT"} size="sm" />}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.snapshot_stored === false && (
        <div className="mt-2 text-[11px] text-amber-700">Snapshot columns are missing in Supabase (run Part 2 of schema.sql). Only the audit fields were stored.</div>
      )}
      {reveal && Object.keys(a.retrospective ?? {}).length > 0 && (
        <div className="mt-2.5 border-t border-[var(--line-2)] pt-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">What happened next (historical)</div>
          <ul className="mt-1 space-y-0.5">
            {Object.entries(a.retrospective).map(([iid, label]) => (
              <li key={iid} className="text-[12px]">
                <span className="font-semibold">{shortId(iid)}</span>
                {iid === a.incident_id && assign ? " (crew)" : ""}: <span className="text-[var(--ink-2)]">{label ?? "unknown"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
