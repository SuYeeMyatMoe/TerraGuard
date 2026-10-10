"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Box, ChevronDown, Info, Layers, Satellite, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ProviderChip, QualityPill, RecPill, Row, SectionTitle, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { coords, pct, shortId, utc } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { GeoContext, Incident, Prediction } from "@/lib/types";

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
  const teams = useStore((s) => s.teams);
  const sorted = [...data.incidents].sort(
    (a, b) => (predictions[a.id]?.priority.rank ?? 9) - (predictions[b.id]?.priority.rank ?? 9),
  );
  return (
    <div className="panel-float slide-in flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--line)] px-5 pb-4 pt-5">
        <div className="eyebrow">Competing incidents</div>
        <h2 className="mt-1 text-[17px] font-bold leading-snug">
          {data.incidents.length} incidents. {teams === 1 ? "One team" : `${teams} teams`}. Which first?
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
          Ranked by the transparent priority score. Select an incident to see the prediction, evidence and recommendation.
        </p>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {sorted.map((inc) => {
          const p = predictions[inc.id];
          return (
            <button
              key={inc.id}
              onClick={() => select(inc.id)}
              className="group flex w-full items-start gap-3 rounded-[12px] border border-[var(--line)] bg-white p-3 text-left transition hover:border-[var(--blue-200)] hover:shadow-[0_4px_14px_rgba(37,99,235,0.08)]"
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
                    {inc.status !== "Awaiting review" && <span className="ml-auto font-semibold text-[var(--green-700)]">{inc.status}</span>}
                  </span>
                ) : (
                  <Skeleton className="mt-2 h-4 w-40" />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#eef2f7] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--ink-2)]">{inc.status}</span>
          {pred && <QualityPill q={pred.evidence.quality} />}
          {pred && <RecPill rec={pred.priority.recommendation} />}
        </div>

        {/* prediction */}
        <section>
          <SectionTitle right={<span className="text-[11px] text-[var(--ink-3)]">{pred?.model.name} {pred?.model.version}</span>}>
            48-hour follow-up detection
          </SectionTitle>
          {predError && <div className="rounded-lg bg-[var(--red-50)] p-3 text-[12.5px] text-[var(--red-700)]">{predError}</div>}
          {!pred && !predError && <Skeleton className="h-20 w-full" />}
          {pred && <ProbabilityBlock pred={pred} />}
        </section>

        {pred && (
          <section>
            <SectionTitle>Why this estimate</SectionTitle>
            <ul className="space-y-1.5">
              {pred.factors.map((f) => (
                <li key={f.feature} className="flex items-start gap-2 text-[12.5px] leading-snug">
                  {f.direction === "up" ? (
                    <ArrowUpRight size={15} className="mt-px shrink-0 text-[var(--fire)]" />
                  ) : (
                    <ArrowDownRight size={15} className="mt-px shrink-0 text-[var(--green)]" />
                  )}
                  <span>{f.text.replace(/ — (raises|lowers) the estimate$/, "")}</span>
                </li>
              ))}
            </ul>
            {(pred.missing_features.length > 0 || pred.ood_features.length > 0 || pred.evidence.flags.length > 0) && (
              <div className="mt-3 rounded-[10px] bg-amber-50/70 p-3 ring-1 ring-inset ring-amber-200/70">
                <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-bold text-amber-800">
                  <AlertTriangle size={13} /> Evidence limitations
                </div>
                <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-amber-900/90">
                  {pred.evidence.flags.map((f) => <li key={f}>{f}</li>)}
                  {pred.missing_features.length > 0 && <li>Missing inputs filled with typical values</li>}
                </ul>
              </div>
            )}
          </section>
        )}

        {pred && <PrioritySection pred={pred} />}

        <section>
          <SectionTitle>Observation</SectionTitle>
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
        <AIBriefing incidentId={inc.id} />
      </div>

      {view === "earth" && (
        <div className="border-t border-[var(--line)] p-3">
          <button className="btn btn-primary w-full" onClick={() => setView("sim")}>
            <Box size={16} /> Open 3D Simulation
          </button>
        </div>
      )}
    </div>
  );
}

function ProbabilityBlock({ pred }: { pred: Prediction }) {
  const [lo, hi] = pred.interval;
  return (
    <div className="rounded-[12px] border border-[var(--line)] p-3.5">
      <div className="flex items-end justify-between">
        <div className="text-[30px] font-extrabold leading-none tracking-tight tnum">{pct(pred.probability)}</div>
        <div className="text-right text-[11.5px] leading-tight text-[var(--ink-2)]">
          tree range {pct(lo)}–{pct(hi)}
          <br />
          alert threshold {pct(pred.threshold)}
        </div>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-[#eef2f7]">
        <div className="absolute inset-y-0 rounded-full bg-[var(--fire-200)]" style={{ left: `${lo * 100}%`, width: `${Math.max((hi - lo) * 100, 1)}%` }} />
        <div className="absolute -top-1 h-4 w-1 rounded-full bg-[var(--fire)]" style={{ left: `calc(${pred.probability * 100}% - 2px)` }} />
        <div className="absolute -top-1.5 h-5 w-px bg-[var(--ink-3)]" style={{ left: `${pred.threshold * 100}%` }} title="Alert threshold" />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-2)]">
        Chance of another qualifying satellite detection within 2 km in a later pass (3–48 h). It is not a measure of
        spread or damage. {pred.uncertainty_note}
      </p>
    </div>
  );
}

function PrioritySection({ pred }: { pred: Prediction }) {
  const comps = pred.priority.components;
  const label: Record<string, string> = { prediction: "Prediction", exposure: "Protected-area exposure", recency: "Recency", evidence: "Evidence quality" };
  return (
    <section>
      <SectionTitle right={<span className="text-[12px] font-bold tnum">{pred.priority.score.toFixed(2)}</span>}>
        Operational priority · rank {pred.priority.rank} of {pred.priority.of}
      </SectionTitle>
      <div className="flex h-2 overflow-hidden rounded-full bg-[#eef2f7]">
        {Object.entries(comps).map(([k, v], i) => (
          <div key={k} title={`${label[k]}: ${v.toFixed(2)}`} style={{ width: `${v * 100}%`, background: ["#ff8a35", "#22a06b", "#2563eb", "#06b6d4"][i] }} />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {Object.entries(comps).map(([k, v], i) => (
          <div key={k} className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-2)]">
            <span className="h-2 w-2 rounded-sm" style={{ background: ["#ff8a35", "#22a06b", "#2563eb", "#06b6d4"][i] }} />
            {label[k]} <b className="ml-auto text-[var(--ink)] tnum">{v.toFixed(2)}</b>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-[var(--ink-2)]">{pred.priority.reason}</p>
      <div className="mt-2.5 space-y-1">
        {pred.competing.map((c) => (
          <div key={c.incident_id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] ${c.incident_id === pred.incident_id ? "bg-[var(--blue-50)]" : "bg-[#f7f9fc]"}`}>
            <b className="w-4 tnum">{c.rank}</b>
            <span className="flex-1 truncate">{shortId(c.incident_id)} · {c.region}</span>
            <span className="tnum text-[var(--ink-2)]">{c.priority_score.toFixed(2)}</span>
            <RecPill rec={c.recommendation} size="sm" />
          </div>
        ))}
      </div>
    </section>
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
    ["Summary", "summary"],
    ["Why it matters", "why_matters"],
    ["What the prediction means", "prediction_interpretation"],
    ["Recommended next step", "recommended_next_step"],
    ["Uncertainty", "uncertainty"],
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

