"use client";

import { ArrowUpRight, Radio, Truck } from "lucide-react";
import { pct, shortId } from "@/lib/format";
import { useStore } from "@/lib/store";
import { RecPill } from "@/components/ui";

export function IncidentRoster() {
  const data = useStore(s => s.data);
  const predictions = useStore(s => s.predictions);
  const selectedId = useStore(s => s.selectedId);
  const select = useStore(s => s.select);
  return <section className="incident-roster">
    <div className="roster-heading"><Radio size={15}/><span>INCIDENT QUEUE</span><b>{data?.incidents.length ?? "—"}</b></div>
    <h2>Three incidents.<br/>One available crew.</h2>
    <p className="roster-intro">Compare the consequences. Choose where to act.</p>
    <div className="roster-cards">{data?.incidents.map(inc => {
      const prediction = predictions[inc.id];
      return <button key={inc.id} className="roster-card" aria-pressed={selectedId === inc.id} onClick={() => select(inc.id)}>
        <div className="roster-card-top"><span>{shortId(inc.id)}</span><span>{prediction ? `PRIORITY ${prediction.priority.rank}` : "ASSESSING"}<ArrowUpRight size={13}/></span></div>
        <strong>{inc.region}</strong><small>{inc.country} · {prediction?.category_label ?? "Loading evidence"}</small>
        <div className="roster-card-bottom"><span><b>{prediction ? pct(prediction.probability) : "—"}</b><small>48 h follow-up</small></span>{prediction && <RecPill rec={prediction.priority.recommendation} size="sm"/>}</div>
      </button>;
    }) ?? <p>Loading incidents…</p>}</div>
    <div className="roster-resource"><Truck size={15}/><span>{data?.team?.assigned_incident_id ? "Crew assigned · review alternatives" : "One crew ready for inspection"}</span></div>
  </section>;
}
