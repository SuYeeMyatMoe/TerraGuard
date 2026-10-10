"use client";

import { Activity, Crosshair, Users } from "lucide-react";
import type { ReactNode } from "react";
import { QualityPill } from "@/components/ui";
import { pct, shortId } from "@/lib/format";
import { useStore } from "@/lib/store";

export function StatCards() {
  const data = useStore((s) => s.data);
  const selectedId = useStore((s) => s.selectedId);
  const predictions = useStore((s) => s.predictions);
  const teams = useStore((s) => s.teams);
  const sim = useStore((s) => s.sim);
  const policy = useStore((s) => s.policy);
  const inc = data?.incidents.find((i) => i.id === selectedId);
  const p = selectedId ? predictions[selectedId] : undefined;
  const assigned = sim?.policies[policy]?.assigned ?? [];
  const policyName = policy === "ai_priority" ? "AI-priority" : policy === "first_alert" ? "first-alert" : "no response";

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
      <Card icon={<Users size={18} />} tone="green" label="Available resources">
        <div className="text-[22px] font-extrabold leading-tight tnum">
          {teams} <span className="text-[13px] font-semibold text-[var(--ink-2)]">team{teams === 1 ? "" : "s"}</span>
        </div>
        <div className="text-[11.5px] text-[var(--ink-2)]">
          {sim ? (assigned.length ? `${policyName}: ${assigned.map(shortId).join(", ")}` : `${policyName}: unassigned`) : "Run a simulation to allocate"}
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
