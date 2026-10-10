"use client";

import { Activity, Crosshair, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { QualityPill } from "@/components/ui";
import { pct, shortId } from "@/lib/format";
import { useStore } from "@/lib/store";

export function StatCards() {
  const data = useStore((s) => s.data);
  const selectedId = useStore((s) => s.selectedId);
  const predictions = useStore((s) => s.predictions);
  const inc = data?.incidents.find((i) => i.id === selectedId);
  const p = selectedId ? predictions[selectedId] : undefined;
  const team = data?.team;
  const waiting = data?.incidents.filter((i) => i.attendance === "unattended").length ?? 0;

  return (
    <div className="flex gap-3">
      <Card icon={<Crosshair size={18} />} tone="blue" label="Incident intelligence">
        <div className="text-[18px] font-extrabold leading-tight">{inc ? shortId(inc.id) : "No incident selected"}</div>
        <div className="text-[11.5px] text-[var(--ink-2)]">{p ? p.category_label : inc ? "Assessing…" : "Click a beacon in the forest"}</div>
      </Card>
      <Card icon={<Activity size={18} />} tone="fire" label="48 h follow-up">
        <div className="flex items-center gap-2">
          <span className="text-[22px] font-extrabold leading-tight tnum">{p ? pct(p.probability) : "—"}</span>
          {p && <QualityPill q={p.evidence.quality} />}
        </div>
        <div className="text-[11.5px] text-[var(--ink-2)]">{p ? `Model ${p.model.version} · rank ${p.priority.rank} of ${p.priority.of}` : "Satellite re-detection probability"}</div>
      </Card>
      <Card icon={<Truck size={18} />} tone="green" label="The only field crew">
        <div className="text-[16px] font-extrabold leading-tight">
          {team?.assigned_incident_id ? `At ${shortId(team.assigned_incident_id)}` : "Available"}
        </div>
        <div className="text-[11.5px] text-[var(--ink-2)]">
          {team?.assigned_incident_id ? `${waiting} incident${waiting === 1 ? "" : "s"} waiting` : team?.name ?? ""}
        </div>
      </Card>
    </div>
  );
}

function Card({ icon, tone, label, children }: { icon: ReactNode; tone: "blue" | "fire" | "green"; label: string; children: ReactNode }) {
  const t = {
    blue: "bg-[var(--blue-50)] text-[var(--blue)]",
    fire: "bg-[var(--fire-50)] text-[var(--fire)]",
    green: "bg-[var(--green-50)] text-[var(--green)]",
  }[tone];
  return (
    <div className="panel-float flex min-w-[210px] items-center gap-3 px-3.5 py-3">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-[12px] ${t}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11.5px] font-semibold text-[var(--ink-2)]">{label}</div>
        {children}
      </div>
    </div>
  );
}
