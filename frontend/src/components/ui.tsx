"use client";

import { Bot, Cpu, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { QUALITY_STYLE, REC_STYLE } from "@/lib/format";
import type { Recommendation } from "@/lib/types";

export function Logo({ size = 28, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id="tg-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2f9e68" />
            <stop offset="1" stopColor="#17784f" />
          </linearGradient>
        </defs>
        <path d="M16 2 28 8.5v15L16 30 4 23.5v-15z" fill="url(#tg-a)" />
        <path d="M16 2 28 8.5 16 15 4 8.5z" fill="#5cc08a" />
        <path d="M16 8.2c2.6 3 4.2 5.6 4.2 7.9a4.2 4.2 0 0 1-8.4 0c0-1.3.5-2.6 1.5-3.9.3 1.2 1 2 1.9 2.3-.2-2.3.1-4.4.8-6.3z" fill="var(--fire)" />
      </svg>
      {withText && (
        <span className="text-[17px] font-extrabold tracking-tight text-[var(--ink)]">
          TerraGuard <span className="text-[var(--green)]">AI</span>
        </span>
      )}
    </span>
  );
}

export function RecPill({ rec, size = "md" }: { rec: Recommendation; size?: "sm" | "md" }) {
  const s = REC_STYLE[rec];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-semibold ${s.cls} ${size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function QualityPill({ q }: { q: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${QUALITY_STYLE[q] ?? ""}`}>
      {q} evidence
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-[11px] bg-[var(--line-2)] p-[3px]" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-[8px] font-semibold transition-all ${
            size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3.5 text-[13px]"
          } ${value === o.value ? "bg-[var(--surface)] text-[var(--ink)] shadow-[0_1px_3px_rgba(53,25,3,0.08)]" : "text-[var(--ink-2)] hover:text-[var(--ink)]"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProviderChip({
  provider,
  model,
  status,
  note,
}: {
  provider: string;
  model: string | null;
  status: string;
  note?: string | null;
}) {
  const generated = status === "generated";
  const Icon = provider === "deterministic" ? Cpu : Bot;
  const name = provider === "openai" ? "OpenAI" : provider === "grafilab" ? "Grafilab" : "Rule-based";
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset ${
          generated ? "bg-[var(--blue-50)] text-[var(--blue-700)] ring-[var(--blue-200)]" : "bg-slate-50 text-slate-600 ring-slate-200"
        }`}
      >
        <Icon size={12} />
        {name}
        {model ? <span className="font-medium opacity-70">· {model}</span> : null}
      </span>
      {generated && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--green-50)] px-2 py-0.5 font-semibold text-[var(--green-700)] ring-1 ring-inset ring-[var(--green-200)]">
          <ShieldCheck size={12} /> Evidence-checked
        </span>
      )}
      {note && <span className="text-[var(--ink-2)]">{note}</span>}
    </div>
  );
}

export function Row({ label, children, mono }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line-2)] py-2 last:border-0">
      <span className="shrink-0 text-[12.5px] text-[var(--ink-2)]">{label}</span>
      <span className={`text-right text-[12.5px] font-semibold text-[var(--ink)] tnum ${mono ? "font-mono text-[12px]" : ""}`}>{children}</span>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="eyebrow">{children}</h3>
      {right}
    </div>
  );
}
