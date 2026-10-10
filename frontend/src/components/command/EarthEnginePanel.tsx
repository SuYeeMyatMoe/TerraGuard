"use client";

import { ChevronDown, Loader2, Satellite } from "lucide-react";
import type { ImagerySnapshot } from "@/lib/earth-engine";
import { useId, useState, type ReactNode } from "react";
import type { RasterState } from "./EarthMap";

/** Only true-colour imagery is offered in Earth View; the NDVI layer was removed from the UI. */
export type EarthLayer = "rgb" | "ndvi";

/** Raw HTTP/status texts never reach the coordinator. */
export function friendlyImageryError(message: string | null | undefined): string | null {
  if (!message) return null;
  const m = message.trim();
  if (/^(not found|internal server error|bad gateway|service unavailable|gateway timeout)$/i.test(m) || /^\d{3}\b/.test(m)) {
    return "The imagery service is not responding.";
  }
  if (/unreachable|failed to fetch|network/i.test(m)) return "Imagery could not be reached.";
  return m;
}

function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex rounded-[9px] bg-[#eef2f7] p-[3px]" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-7 flex-1 rounded-[7px] px-2 text-[11.5px] font-semibold transition ${
            value === o.value ? "bg-white text-[var(--ink)] shadow-[0_1px_2px_rgba(23,38,56,0.12)]" : "text-[var(--ink-2)] hover:text-[var(--ink)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EarthEnginePanel({
  state,
  days,
  setDays,
  opacity,
  setOpacity,
  tileError,
  overview = false,
  children,
  analysisError,
  anchor,
  rasterState,
  historicalVisible = true,
}: {
  state: ImagerySnapshot;
  layer?: EarthLayer;
  setLayer?: (layer: EarthLayer) => void;
  days: number;
  setDays: (days: number) => void;
  opacity: number;
  setOpacity: (opacity: number) => void;
  retry: () => void;
  tileError: boolean;
  mode?: "context" | "compare";
  setMode?: (mode: "context" | "compare") => void;
  overview?: boolean;
  children?: ReactNode;
  manual?: boolean;
  automatic?: boolean;
  analysisError?: string | null;
  anchor?: string;
  rasterState?: RasterState;
  historicalVisible?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const data = state.data;
  const analysis = data?.analysis;
  const ready = data?.status === "ready";
  const display = data?.display ?? analysis;
  const date = (v: string | null | undefined) => (v ? v.slice(0, 10) : "—");
  // Only loading and ready states get a chip; when imagery is unavailable the panel simply shows the basemap.
  const problem =
    friendlyImageryError(state.error) ??
    friendlyImageryError(analysisError) ??
    (historicalVisible && tileError ? "Some satellite tiles could not load." : null) ??
    (!ready && data?.status === "unavailable" ? friendlyImageryError(data?.reason) : null);

  const chip = state.loading
    ? { text: "Loading", cls: "bg-[var(--blue-50)] text-[var(--blue-700)]", dot: "bg-[var(--blue)] animate-pulse" }
    : ready && !problem
      ? { text: "Imagery ready", cls: "bg-[var(--green-50)] text-[var(--green-700)]", dot: "bg-[var(--green)]" }
      : null;
  const subtitle = anchor
    ? `${anchor.replace(/^INC-\d{8}-/, "Incident ")} · ${days} d before`
    : "Worldwide true colour";

  return (
    <aside
      aria-label="Satellite imagery"
      className="imagery-panel panel-float absolute left-3 top-3 z-10 max-h-[calc(100%-84px)] w-[288px] max-w-[calc(100%-76px)] overflow-y-auto lg:left-4 lg:top-4 lg:max-h-[calc(100%-90px)] lg:max-w-none"
    >
      {/* header */}
      <div className="flex items-center gap-2 px-3.5 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[var(--blue-50)] text-[var(--blue)]">
          <Satellite size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="whitespace-nowrap text-[13.5px] font-bold leading-tight">Satellite imagery</div>
          <div className="truncate text-[11px] text-[var(--ink-3)]">{subtitle}</div>
        </div>
        {chip && (
          <span className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold lg:inline-flex ${chip.cls}`} role="status">
            {state.loading ? <Loader2 size={10} className="animate-spin" /> : <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} />}
            {chip.text}
          </span>
        )}
        <button
          type="button"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 lg:hidden"
          aria-label={expanded ? "Collapse imagery controls" : "Open imagery controls"}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown size={17} className={expanded ? "rotate-180" : ""} />
        </button>
      </div>

      <div id={contentId} className={`${expanded ? "block" : "hidden lg:block"} border-t border-[var(--line-2)]`}>
        <div className="space-y-3 px-4 py-3">
          <div>
            <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--ink-3)]">Period before incident</div>
            <Segmented label="Imagery period" value={days} onChange={setDays}
              options={[{ value: 14, label: "14 days" }, { value: 30, label: "30 days" }, { value: 60, label: "60 days" }]} />
          </div>

          {ready && display && (
            <>
              <label className="flex items-center gap-3 text-[11.5px] font-semibold text-[var(--ink-2)]">
                Opacity
                <input aria-label="Satellite opacity" type="range" min="0" max="1" step="0.05" value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))} className="tg-range flex-1"
                  style={{ ["--fill" as string]: `${opacity * 100}%` }} />
                <span className="w-8 text-right tnum">{Math.round(opacity * 100)}%</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[10px] bg-[#f6f8fb] px-3 py-2">
                  <div className="text-[10.5px] font-semibold text-[var(--ink-3)]">Acquisitions</div>
                  <div className="mt-0.5 text-[11.5px] font-bold leading-tight tnum">
                    {display.scene_count == null
                      ? `${date(data?.window?.start)} → ${date(data?.window?.end)}`
                      : `${date(display.acquisition_start)} → ${date(display.acquisition_end)}`}
                  </div>
                </div>
                <div className="rounded-[10px] bg-[#f6f8fb] px-3 py-2">
                  <div className="text-[10.5px] font-semibold text-[var(--ink-3)]">{!overview && analysis ? "Clear view · 1 km" : "Scenes"}</div>
                  <div className="mt-0.5 text-[15px] font-extrabold leading-tight tnum">
                    {!overview && analysis ? `${analysis.valid_coverage_pct.toFixed(0)}%` : display.scene_count ?? "Composite"}
                  </div>
                </div>
              </div>
              {rasterState && !rasterState.detail && (
                <p className="text-[11px] text-[var(--ink-3)]">Zoom in to load dated Sentinel-2 detail.</p>
              )}
            </>
          )}
        </div>

        {children && <div className="tool-stack">{children}</div>}

        <p className="border-t border-[var(--line-2)] px-4 py-2.5 text-[10.5px] leading-snug text-[var(--ink-3)]">
          Satellite context only, not live fire detection.
        </p>
      </div>
    </aside>
  );
}
