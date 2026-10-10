"use client";

import { Box, ChevronDown, Info, Layers, Satellite, Sparkles, Truck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ProviderChip, RecPill, Row, SectionTitle, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { coords, pct, shortId, utc } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { GeoContext, Incident, Prediction } from "@/lib/types";
import { ConfidenceBlock, DecisionHeader, FactorList, LimitationsBlock, PredictionBlock, RankingBlock, TraceBlock } from "./explain/ExplainSections";

export function IntelligencePanel() {
  const data = useStore((s) => s.data);
  const selectedId = useStore((s) => s.selectedId);
  const predictions = useStore((s) => s.predictions);
  const select = useStore((s) => s.select);

  if (!data) {
    return (
      <div className="panel-float flex min-h-0 flex-1 flex-col gap-3 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  const inc = data.incidents.find((i) => i.id === selectedId);
  if (!inc) return <IncidentList />;
  return <IncidentDetail key={inc.id} inc={inc} pred={predictions[inc.id]} onClose={() => select(null)} />;
}

function IncidentList() {
  const data = useStore((s) => s.data)!;
  const predictions = useStore((s) => s.predictions);
  const select = useStore((s) => s.select);
  const team = data.team;
  const sorted = [...data.incidents].sort(
    (a, b) => (predictions[a.id]?.priority.rank ?? 9) - (predictions[b.id]?.priority.rank ?? 9),
  );
  return (
    <div className="panel-float slide-in flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--line)] px-5 pb-4 pt-5">
        <div className="eyebrow">Competing incidents</div>
        <h2 className="mt-1 text-[17px] font-bold leading-snug">
          {team.assigned_incident_id
            ? `Crew at ${shortId(team.assigned_incident_id)}. ${data.incidents.filter((i) => i.attendance === "unattended").length} waiting.`
            : `${data.incidents.length} incidents. One crew. Which first?`}
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
          {team.assigned_incident_id
            ? `${team.name} is committed. Incidents without the crew stay unattended until you reassign it.`
            : `${team.name} is the only field crew. Ranked by the transparent priority score.`}
        </p>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {sorted.map((inc) => {
          const p = predictions[inc.id];
          return (
            <button
              key={inc.id}
              onClick={() => select(inc.id)}
              className={`group flex w-full items-start gap-3 rounded-[12px] border bg-white p-3 text-left transition hover:shadow-[0_4px_14px_rgba(37,99,235,0.08)] ${
                inc.attendance === "assigned" ? "border-[#a5e9f5]" : inc.attendance === "unattended" ? "border-amber-200" : "border-[var(--line)] hover:border-[var(--blue-200)]"
              }`}
            >
              <span
                className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white"
                style={{ background: p ? (p.priority.recommendation === "INSPECT" ? "#ff8a35" : p.priority.recommendation === "RECHECK" ? "#2563eb" : "#94a3b8") : "#cbd5e1" }}
              >
                {p?.priority.rank ?? "·"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13.5px] font-bold">{shortId(inc.id)} · {inc.region}</span>
                  {p && <RecPill rec={p.priority.recommendation} size="sm" />}
                </span>
                <span className="mt-0.5 block text-[12px] text-[var(--ink-2)]">
                  {inc.country} · first seen {utc(inc.observed_at, false)} · alert #{inc.arrival_order}
                </span>
                {p ? (
                  <span className="mt-2 flex items-center gap-3 text-[12px]">
                    <span className="tnum"><b>{pct(p.probability)}</b> <span className="text-[var(--ink-2)]">48 h follow-up</span></span>
                    <span className="text-[var(--line)]">|</span>
                    <span className="text-[var(--ink-2)]">{p.evidence.quality} evidence</span>
                  </span>
                ) : (
                  <Skeleton className="mt-2 h-4 w-40" />
                )}
                {p && <span className="mt-1.5 line-clamp-2 block text-[11.5px] leading-snug text-[var(--ink-2)]">{p.decision_summary}</span>}
                <AttendanceLine inc={inc} prob={p?.probability} compact />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AttendanceLine({ inc, prob, compact }: { inc: Incident; prob?: number; compact?: boolean }) {
  const team = useStore((s) => s.data?.team);
  if (!team) return null;
  const base = compact ? "mt-2 rounded-lg px-2.5 py-1.5 text-[11.5px]" : "rounded-[10px] px-3 py-2.5 text-[12.5px]";
  if (inc.attendance === "assigned")
    return (
      <span className={`${base} flex items-center gap-1.5 bg-[var(--cyan-50)] font-semibold text-[#0e7490] ring-1 ring-inset ring-[#a5e9f5]`}>
        <Truck size={13} className="shrink-0" /> Crew assigned · en route from {team.base.split(",")[0]}
      </span>
    );
  if (inc.attendance === "unattended")
    return (
      <span className={`${base} block bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200`}>
        <b>Unattended</b>: crew committed to {shortId(team.assigned_incident_id ?? "")}
        {prob != null && (
          <>
            {" "}· 48 h follow-up risk <b className="tnum">{pct(prob)}</b>
          </>
        )}
      </span>
    );
  if (inc.attendance === "recheck" || inc.attendance === "dismissed")
    return <span className={`${base} block bg-[#f1f5f9] font-semibold text-[var(--ink-2)]`}>{inc.status}</span>;
  return null;
}

function IncidentDetail({ inc, pred, onClose }: { inc: Incident; pred?: Prediction; onClose: () => void }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const predError = useStore((s) => s.predictionErrors[inc.id]);
  const [geo, setGeo] = useState<GeoContext | null>(null);
  useEffect(() => {
    api.geospatial(inc.id).then(setGeo).catch(() => setGeo(null));
  }, [inc.id]);

  return (
    <div className="panel-float slide-in flex min-h-0 flex-1 flex-col">
      {/* header */}
      <div className="flex items-start gap-3 border-b border-[var(--line)] px-5 pb-4 pt-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-[var(--fire-50)] text-[var(--fire)] ring-1 ring-inset ring-[var(--fire-200)]">
          <Satellite size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow !text-[var(--blue)]">Hotspot · {pred?.category_label ?? "Assessing"}</div>
          <div className="truncate text-[16px] font-bold leading-snug">{inc.region}, {inc.country}</div>
          <div className="font-mono text-[11.5px] text-[var(--ink-2)]">{inc.id}</div>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--ink-2)] hover:bg-[#f6f8fb]" aria-label="Close incident">
          <X size={15} />
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <AttendanceLine inc={inc} prob={pred?.probability} />
        {predError && <div className="rounded-lg bg-[var(--red-50)] p-3 text-[12.5px] text-[var(--red-700)]">{predError}</div>}
        {!pred && !predError && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {pred && (
          <>
            <DecisionHeader pred={pred} />
            <PredictionBlock pred={pred} />
            <FactorList pred={pred} />
            <RankingBlock pred={pred} />
            <ConfidenceBlock pred={pred} />
            <LimitationsBlock pred={pred} />
          </>
        )}

        <section>
          <SectionTitle>Observation details</SectionTitle>
          <Row label="Coordinates"><span className="font-mono text-[12px]">{coords(inc.lat, inc.lon)}</span></Row>
          <Row label="Observed">{utc(inc.observed_at)}</Row>
          <Row label="Satellite">{inc.satellite} · {inc.daynight}</Row>
          <Row label="Detection cluster">{inc.n_pixels} pixel{inc.n_pixels > 1 ? "s" : ""} · peak {inc.frp_max_mw} MW</Row>
          <Row label="High-confidence pixels">{pct(inc.high_confidence_share)}</Row>
          <Row label="Protected area">
            <span className="block">{inc.protected_area.name}</span>
            <span className="block text-[11px] font-medium text-[var(--ink-2)]">{inc.protected_area.distance_km} km · {inc.protected_area.boundary} boundary</span>
          </Row>
          <Row label="Weather (prev. day)">
            {inc.weather.missing ? (
              <span className="text-amber-700">Missing</span>
            ) : (
              <>RH {inc.weather.relative_humidity_2m_min}% · {inc.weather.days_since_rain} d dry · {inc.weather.wind_speed_10m_max} km/h</>
            )}
          </Row>
        </section>

        <GeoSection geo={geo} />
        {pred && <TraceBlock pred={pred} />}
        <AIBriefing incidentId={inc.id} />
      </div>

      {view === "earth" && (
        <div className="border-t border-[var(--line)] p-3">
          <button className="btn btn-primary w-full" onClick={() => setView("sim")}>
            <Box size={16} /> Test the response in 3D
          </button>
        </div>
      )}
    </div>
  );
}

function GeoSection({ geo }: { geo: GeoContext | null }) {
  if (!geo) return null;
  return (
    <section>
      <SectionTitle>
        <span className="inline-flex items-center gap-1.5"><Layers size={12} /> Earth Engine context</span>
      </SectionTitle>
      {geo.earth_engine.available ? (
        <div className="space-y-2">
          {geo.earth_engine.records.map((r) => (
            <div key={r.id} className="rounded-[10px] border border-[var(--line)] p-2.5">
              <div className="flex justify-between text-[12px] font-semibold">
                <span>{r.dataset}</span>
                <span className="text-[var(--ink-3)]">{r.resolution_m} m · {r.acquired}</span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-[var(--ink-2)]">{JSON.stringify(r.value)}</div>
              <div className="mt-1 text-[11px] text-[var(--ink-3)]">{r.limitations}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-2 rounded-[10px] bg-[#f7f9fc] p-3 text-[12px] leading-relaxed text-[var(--ink-2)]">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>{geo.earth_engine.reason} Protected-area boundaries shown are <b>{geo.boundary_status}</b>.</span>
        </div>
      )}
    </section>
  );
}

function AIBriefing({ incidentId }: { incidentId: string }) {
  const brief = useStore((s) => s.briefings[incidentId]);
  const loading = useStore((s) => s.briefingLoading[incidentId]);
  const explain = useStore((s) => s.explain);
  const [open, setOpen] = useState(true);
  const [showEvidence, setShowEvidence] = useState(false);
  const sections: [string, keyof NonNullable<typeof brief>["content"]][] = [
    ["Incident summary", "incident_summary"],
    ["Why this estimate", "why_prediction"],
    ["Why this priority", "why_priority"],
    ["Compared with the next incident", "comparison_with_next_incident"],
    ["Uncertainties", "uncertainties"],
    ["What would improve confidence", "what_would_improve_confidence"],
    ["Recommended next step", "recommended_next_step"],
  ];
  return (
    <section className="rounded-[12px] border border-[var(--blue-200)] bg-gradient-to-b from-[var(--blue-50)] to-white">
      <button className="flex w-full items-center justify-between px-3.5 py-3" onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-2 text-[13px] font-bold text-[var(--blue-700)]">
          <Sparkles size={15} /> AI Incident Briefing
        </span>
        <ChevronDown size={15} className={`text-[var(--blue-700)] transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5">
          {!brief && !loading && (
            <>
              <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">
                Turns the model, priority and simulation outputs above into a plain-language briefing. The AI may only
                use verified backend facts, and it cannot change any number or recommendation.
              </p>
              <button className="btn btn-primary mt-3 w-full" onClick={() => explain(incidentId)}>
                <Sparkles size={15} /> Explain with AI
              </button>
            </>
          )}
          {loading && (
            <div className="space-y-2">
              <div className="text-[12px] text-[var(--ink-2)]">Generating and checking the briefing against the evidence…</div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
          )}
          {brief && !loading && (
            <div className="space-y-3">
              <ProviderChip provider={brief.provider} model={brief.model} status={brief.status} note={brief.provider_note} />
              {sections.map(([title, key]) => (
                <div key={key}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">{title}</div>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--ink)]">{brief.content[key].text}</p>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <button className="text-[11.5px] font-semibold text-[var(--blue)] hover:underline" onClick={() => setShowEvidence(!showEvidence)}>
                  {showEvidence ? "Hide" : "Show"} evidence package ({brief.evidence.length} facts)
                </button>
                <button className="text-[11.5px] font-semibold text-[var(--ink-2)] hover:text-[var(--ink)]" onClick={() => explain(incidentId)}>
                  Regenerate
                </button>
              </div>
              {showEvidence && (
                <div className="scroll-thin max-h-52 space-y-1 overflow-y-auto rounded-lg bg-white p-2 ring-1 ring-[var(--line)]">
                  {brief.evidence.map((f) => (
                    <div key={f.evidence_id} className="text-[11px] leading-snug">
                      <span className="font-mono text-[var(--blue-700)]">{f.evidence_id}</span>{" "}
                      <span className="text-[var(--ink-2)]">{f.label}:</span> <b>{String(f.value)}{f.unit && f.unit !== "%" ? ` ${f.unit}` : ""}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

