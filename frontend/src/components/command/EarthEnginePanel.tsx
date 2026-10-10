"use client";

import { ChevronDown, Info, Leaf, Loader2, RefreshCw, Satellite } from "lucide-react";
import type { ImagerySnapshot } from "@/lib/earth-engine";
import { useId, useState, type ReactNode } from "react";
import type { RasterState } from "./EarthMap";

export type EarthLayer = "rgb" | "ndvi";

export function EarthEnginePanel({
  state,
  layer,
  setLayer,
  days,
  setDays,
  opacity,
  setOpacity,
  retry,
  tileError,
  mode = "context",
  setMode,
  overview = false,
  children,
  manual = false,
  automatic = false,
  analysisError,
  anchor,
  rasterState,
  historicalVisible = true,
}: {
  state: ImagerySnapshot;
  layer: EarthLayer;
  setLayer: (layer: EarthLayer) => void;
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
  const date = (value: string | null | undefined) =>
    value ? value.slice(0, 10) : "—";
  return (
    <aside
      aria-label="Earth Engine imagery"
      className="imagery-panel panel-float absolute left-3 top-3 z-10 max-h-[calc(100%-84px)] w-[300px] max-w-[calc(100%-76px)] overflow-y-auto p-3 lg:left-4 lg:top-4 lg:max-h-[calc(100%-90px)] lg:max-w-none lg:p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-bold">
          <Satellite size={16} className="text-[var(--blue)]" />{" "}
          <span className="lg:hidden">Imagery &amp; layers</span>
          <span className="hidden lg:inline">{manual ? "Earth View" : "Earth Engine"}</span>
        </div>
        <span
          className={`hidden rounded-full px-2 py-1 text-[10px] font-semibold lg:inline ${ready ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
        >
          {manual && !rasterState?.before
            ? "Worldwide"
            : ready
              ? "Connected"
              : data?.status === "not_configured"
                ? "Setup needed"
                : "Satellite context"}
        </span>
        <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 lg:hidden"
          aria-label={expanded ? "Collapse imagery controls" : "Open imagery controls"}
          aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)}>
          <ChevronDown size={18} className={expanded ? "rotate-180" : ""} />
        </button>
      </div>
      <div id={contentId} className={expanded ? "block" : "hidden lg:block"}>
      <p className="mt-1 text-[11px] text-[var(--ink-2)]">
        {manual
          ? "Worldwide imagery · historical layers follow your view"
          : overview
            ? "Replay overview · select an incident for statistics"
            : "Imagery follows the visible region"}
        {manual && (
          <span className="mt-1 block text-[10px]">
            Basemap dates vary by location. Historical analysis uses the replay
            date{anchor ? ` of ${anchor}` : ""}.
          </span>
        )}
      </p>
      <div
        className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1"
        role="group"
        aria-label="Satellite layer"
      >
        {(["rgb", "ndvi"] as const).map((id) => (
          <button
            key={id}
            aria-pressed={layer === id}
            onClick={() => setLayer(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[11px] font-semibold ${layer === id ? "bg-white shadow-sm" : "text-slate-500"}`}
          >
            {id === "rgb" ? <Satellite size={13} /> : <Leaf size={13} />}
            {id === "rgb" ? "Satellite" : "Vegetation · NDVI"}
          </button>
        ))}
      </div>
      <label className="mt-3 flex items-center justify-between text-[11px] font-semibold">
        Before incident
        <select
          aria-label="Imagery period"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-md border border-[var(--line)] bg-white px-2 py-1.5"
        >
          {[14, 30, 60].map((n) => (
            <option key={n} value={n}>
              {n} days
            </option>
          ))}
        </select>
      </label>
      {setMode && (
        <label className="mt-2 flex items-center justify-between text-[11px] font-semibold">
          View
          <select
            aria-label="Satellite comparison mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "context" | "compare")}
            className="rounded-md border border-[var(--line)] bg-white px-2 py-1.5"
          >
            <option value="context">Before incident</option>
            <option value="compare">Before / after</option>
          </select>
        </label>
      )}
      {manual && (
        <div className="mt-3">
          <p className="mt-1 text-[10px] text-slate-500">
            Historical imagery loads automatically. Pan freely anywhere;
            switching Satellite / NDVI keeps your comparison.
          </p>
          {analysisError && (
            <p role="alert" className="mt-2 text-[11px] text-amber-700">
              {analysisError}
            </p>
          )}
        </div>
      )}
      {ready && (state.error || (historicalVisible && tileError)) && (
        <div
          role="alert"
          className="mt-3 rounded-lg bg-amber-50 p-3 text-[11px] text-amber-800"
        >
          {state.error ??
            "Satellite tiles could not load. Refresh the imagery."}
        </div>
      )}
      {state.loading && (
        <div
          role="status"
          className="mt-3 flex items-center gap-2 text-[12px] text-[var(--ink-2)]"
        >
          <Loader2 size={14} className="animate-spin" /> Preparing dated imagery…
        </div>
      )}
      {rasterState && !rasterState.detail && (
        <p role="status" className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600">
          Zoom in for detailed Sentinel-2 / NDVI, anywhere in the world.
          Satellite overview uses the global basemap.
        </p>
      )}
      {!historicalVisible && (
        <p className="mt-2 text-[11px] text-slate-500">Dated overlay hidden · showing the reference basemap.</p>
      )}
      {historicalVisible && rasterState?.detail && ready && !tileError && !rasterState.before && (
        <p role="status" className="mt-2 text-[11px] text-slate-500">Loading before tiles…</p>
      )}
      {!ready &&
        (state.error || data?.status === "unavailable" || tileError) ? (
        <div
          role="alert"
          className="mt-3 rounded-lg bg-amber-50 p-3 text-[11px] text-amber-800"
        >
          {state.error ??
            (tileError
              ? "Satellite tiles could not load. Refresh the imagery."
              : data?.reason)}
        </div>
      ) : !ready ? (
        <div className="mt-3 flex gap-2 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-[var(--ink-2)]">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            {data?.reason ??
              (state.loading ? "Preparing the selected periods." : "Select an incident to load imagery." )}{" "}
            {data?.status === "not_configured" &&
              "The reference map stays available."}
          </span>
        </div>
      ) : display ? (
        <div className="mt-3 space-y-2 text-[11px]">
          <div className="rounded-lg bg-slate-50 p-2.5 leading-relaxed">
            <b>Sentinel-2 · cloud-masked composite</b>
            <br />
            {display.scene_count == null ? (
              <>Before period: {date(data?.window?.start)} – {date(data?.window?.end)}</>
            ) : (
              <>Before acquisitions: {date(display.acquisition_start)} – {date(display.acquisition_end)}</>
            )}
            <br />
            {display.scene_count == null ? "Gray: clouds or no clear observations" : `${display.scene_count} candidate scenes · viewport coverage`}
          </div>
          {!overview && analysis && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[var(--line)] p-2.5">
                  <span className="text-[var(--ink-2)]">Mean NDVI · incident 1 km</span>
                  <div className="mt-1 text-[17px] font-bold">
                    {analysis.ndvi_mean?.toFixed(2) ?? "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--line)] p-2.5">
                  <span className="text-[var(--ink-2)]">Incident valid coverage</span>
                  <div className="mt-1 text-[17px] font-bold">
                    {analysis.valid_coverage_pct.toFixed(1)}%
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-[var(--ink-2)]">
                {data?.incident_id ?? anchor}: statistics within 1 km · sampled at 20 m.
                These describe this incident, not the whole map.
              </p>
              {analysis.valid_coverage_pct < 50 && (
                <p className="text-amber-700">
                  Limited clear coverage; these statistics describe only visible
                  pixels.
                </p>
              )}
            </>
          )}
          {layer === "ndvi" && (
            <div>
              <div
                className="h-2 rounded-full"
                style={{
                  background:
                    "linear-gradient(to right,#2563eb 0%,#517ba2 10%,#7b8c9a 20%,#a4a4a0 30%,#c2bdb0 40%,#d6c7a1 50%,#c3ac78 60%,#a3cb68 70%,#5aa23c 80%,#23762f 90%,#0d5429 100%)",
                }}
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>−1</span>
                <span>0–0.2 · low NDVI</span>
                <span>+1</span>
              </div>
              <p className="mt-2 text-[10px] text-[var(--ink-2)]">
                Sand tones: low NDVI; green: higher NDVI. This is a continuous
                index, not a land-cover classification. Gray gaps have no clear
                observations; they are not low NDVI.
              </p>
            </div>
          )}
          <label className="flex items-center justify-between gap-3">
            Layer opacity
            <input
              aria-label="Satellite opacity"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-32 accent-blue-600"
            />
          </label>
        </div>
      ) : null}
      {mode === "compare" && data?.comparison && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10px] leading-relaxed">
          <b>After incident · retrospective</b>
          <br />
          {data.comparison.status === "ready" && data.comparison.display ? (
            <>
              {data.comparison.display.scene_count == null ? (
                <>After period: {date(data.comparison.window.start)} – {date(data.comparison.window.end)}</>
              ) : (
                <>Acquisitions: {date(data.comparison.display.acquisition_start)} – {date(data.comparison.display.acquisition_end)}</>
              )}
              <br />
              {data.comparison.display.scene_count == null ? "Worldwide period composite" : `${data.comparison.display.scene_count} candidate scenes`}
              <br />
              {!overview && data.comparison.analysis && (
                <>
                  1 km mean NDVI:{" "}
                  {data.comparison.analysis.ndvi_mean?.toFixed(2) ?? "—"} ·
                  valid coverage:{" "}
                  {data.comparison.analysis.valid_coverage_pct.toFixed(1)}%
                  <br />
                </>
              )}
            </>
          ) : (
            data.comparison.reason
          )}
          {historicalVisible && rasterState?.detail && data.comparison.status === "ready" && !rasterState.after && (
            <p role="status" className="mt-1">Loading after tiles…</p>
          )}
          <div>
            Window: {date(data.comparison.window.start)} –{" "}
            {date(data.comparison.window.end)}. Never used for the incident
            prediction.
          </div>
        </div>
      )}
      {data?.window && (
        <p className="mt-3 text-[10px] text-[var(--ink-3)]">
          Window: {date(data.window.start)} – {date(data.window.end)} · UTC,
          ending at the incident time.
        </p>
      )}
      {(!manual ||
        ready ||
        state.error ||
        (automatic && (state.key || analysisError))) && (
        <button
          disabled={state.loading}
          onClick={retry}
          className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--blue)] disabled:opacity-50"
        >
          <RefreshCw size={12} />{" "}
          {automatic
            ? "Retry imagery"
            : manual
              ? "Refresh analysis for this view"
              : "Refresh imagery"}
        </button>
      )}
      <p className="mt-3 border-t border-[var(--line-2)] pt-2.5 text-[10px] leading-relaxed text-[var(--ink-2)]">
        Satellite context is not live fire detection. NDVI measures vegetation
        greenness; it does not identify fire or forest loss.
      </p>
      {children}
      </div>
    </aside>
  );
}
