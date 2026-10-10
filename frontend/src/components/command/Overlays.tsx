"use client";

import { CheckCircle2, Copy, FileText, Info, Minus, Plus, RotateCcw, RotateCw, Home, X, XCircle } from "lucide-react";
import { useState } from "react";
import { ProviderChip, Skeleton } from "@/components/ui";
import { useStore } from "@/lib/store";

export function MapControls() {
  const camera = useStore((s) => s.camera);
  const btn = "grid h-10 w-10 place-items-center text-[var(--ink-2)] hover:bg-[var(--line-2)] hover:text-[var(--ink)]";
  return (
    <div className="panel-float flex flex-col overflow-hidden">
      <button className={btn} onClick={() => camera("zoomIn")} aria-label="Zoom in"><Plus size={17} /></button>
      <button className={`${btn} border-t border-[var(--line-2)]`} onClick={() => camera("zoomOut")} aria-label="Zoom out"><Minus size={17} /></button>
      <button className={`${btn} border-t border-[var(--line-2)]`} onClick={() => camera("rotateL")} aria-label="Rotate left"><RotateCcw size={16} /></button>
      <button className={`${btn} border-t border-[var(--line-2)]`} onClick={() => camera("rotateR")} aria-label="Rotate right"><RotateCw size={16} /></button>
      <button className={`${btn} border-t border-[var(--line-2)]`} onClick={() => { useStore.getState().select(null); camera("reset"); }} aria-label="Reset view"><Home size={16} /></button>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed left-1/2 top-[76px] z-50 flex w-[400px] -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="panel-float animate-in pointer-events-auto flex items-start gap-3 p-3.5">
          {t.tone === "success" ? (
            <CheckCircle2 size={19} className="mt-px shrink-0 text-[var(--green)]" />
          ) : t.tone === "error" ? (
            <XCircle size={19} className="mt-px shrink-0 text-[var(--red)]" />
          ) : (
            <Info size={19} className="mt-px shrink-0 text-[var(--blue)]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-bold">{t.title}</div>
            {t.body && <div className="mt-0.5 text-[12.5px] text-[var(--ink-2)]">{t.body}</div>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-[var(--ink-3)] hover:text-[var(--ink)]" aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function FieldBriefModal() {
  const fb = useStore((s) => s.fieldBrief);
  const close = useStore((s) => s.closeFieldBrief);
  const [copied, setCopied] = useState(false);
  if (!fb.open) return null;
  const c = fb.result?.content;
  const text = c
    ? [
        `FIELD VERIFICATION BRIEF (DRAFT — requires coordinator review)`,
        `Reference: ${c.reference}`,
        `Location & time: ${c.location_and_time}`,
        `Reason for verification: ${c.reason_for_verification}`,
        `Available evidence:\n${c.available_evidence.map((e) => `- ${e}`).join("\n")}`,
        `Verification task: ${c.verification_task}`,
        `Missing information:\n${c.missing_information.map((e) => `- ${e}`).join("\n")}`,
        `Safety: ${c.safety_note}`,
      ].join("\n\n")
    : "";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--ink)]/30 p-6 backdrop-blur-[2px]" onClick={close}>
      <div className="panel-float animate-in flex max-h-[88vh] w-[620px] flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Field brief">
        <div className="flex items-start justify-between border-b border-[var(--line)] px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-[16px] font-bold"><FileText size={18} className="text-[var(--blue)]" /> Field verification brief</div>
            <div className="mt-0.5 text-[12px] font-semibold text-amber-700">Draft · requires human review before sharing</div>
          </div>
          <button onClick={close} className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] text-[var(--ink-2)]" aria-label="Close"><X size={15} /></button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {fb.loading && (
            <div className="space-y-3">
              <div className="text-[12.5px] text-[var(--ink-2)]">Generating with Grafilab and checking every statement against the incident record…</div>
              <Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-3/4" />
            </div>
          )}
          {fb.error && <div className="rounded-lg bg-[var(--red-50)] p-3 text-[13px] text-[var(--red-700)]">{fb.error}</div>}
          {fb.result && c && (
            <div className="space-y-4">
              <ProviderChip provider={fb.result.provider} model={fb.result.model} status={fb.result.status} note={fb.result.provider_note} />
              <Field label="Reference"><span className="font-mono">{c.reference}</span></Field>
              <Field label="Location & time">{c.location_and_time}</Field>
              <Field label="Reason for verification">{c.reason_for_verification}</Field>
              <Field label="Available evidence"><ul className="list-disc space-y-0.5 pl-4">{c.available_evidence.map((e) => <li key={e}>{e}</li>)}</ul></Field>
              <Field label="Verification task">{c.verification_task}</Field>
              <Field label="Missing information"><ul className="list-disc space-y-0.5 pl-4">{c.missing_information.map((e) => <li key={e}>{e}</li>)}</ul></Field>
              <Field label="Safety & uncertainty"><span className="text-[var(--ink-2)]">{c.safety_note}</span></Field>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--line)] px-6 py-3">
          <button className="btn btn-secondary" onClick={close}>Close</button>
          <button
            className="btn btn-primary"
            disabled={!c}
            onClick={() => {
              navigator.clipboard?.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">{label}</div>
      <div className="mt-1 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}
