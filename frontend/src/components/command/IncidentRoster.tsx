"use client";

import { ArrowUpRight, Radio, Truck } from "lucide-react";
import { pct, shortId } from "@/lib/format";
import { useStore } from "@/lib/store";
import { RecPill } from "@/components/ui";

export function IncidentRoster() {
  const data = useStore(s => s.data);
  const predictions = useStore(s => s.predictions);
  const sim = useStore(s => s.sim);
  const crewMode = useStore(s => s.crewMode);
  const consequence = useStore(s => s.consequence);
  const oneCrew = (sim?.teams ?? crewMode) === 1;
  const selectedId = useStore(s => s.selectedId);
  const focusIncident = useStore(s => s.focusIncident);
  return <section className="incident-roster">
    <div className="roster-heading"><Radio size={15}/><span>COMPETING INCIDENTS</span><b>{data?.incidents.length ?? "—"}</b></div>
    <h2>Three incidents.<br/>{oneCrew ? "One response crew." : "Three response crews."}</h2>
    <p className="roster-intro">{oneCrew ? consequence ? "Preview the selected decision." : "Compare the shared crew assignment." : "One crew each for A, B and C."}</p>
    <div className="roster-cards">{data?.incidents.map(inc => {
      const prediction = predictions[inc.id];
      return <button key={inc.id} className="roster-card" aria-pressed={selectedId === inc.id} onClick={() => focusIncident(inc.id)}>
        <div className="roster-card-top"><span>{shortId(inc.id)}</span><span>{prediction ? `PRIORITY ${prediction.priority.rank}` : "ASSESSING"}<ArrowUpRight size={13}/></span></div>
        <strong>{inc.region}</strong><small>{inc.country} · {prediction?.category_label ?? "Loading evidence"}</small>
        <div className="roster-card-bottom"><span><b>{prediction ? pct(prediction.probability) : "—"}</b><small>48 h follow-up</small></span>{prediction && <RecPill rec={prediction.priority.recommendation} size="sm"/>}</div>
      </button>;
    }) ?? <p>Loading incidents…</p>}</div>
    <div className="roster-resource"><Truck size={15}/><span>{oneCrew ? "3D response test · one shared crew" : "3D response test · one crew per incident"}</span></div>
  </section>;
}
