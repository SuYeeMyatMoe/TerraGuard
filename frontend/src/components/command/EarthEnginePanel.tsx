"use client";

import { Info, Leaf, Loader2, RefreshCw, Satellite } from "lucide-react";
import type { ImagerySnapshot } from "@/lib/earth-engine";

export type EarthLayer = "rgb" | "ndvi";

export function EarthEnginePanel({ state, layer, setLayer, days, setDays, opacity, setOpacity, retry, tileError }: {
  state: ImagerySnapshot; layer: EarthLayer; setLayer: (layer: EarthLayer) => void;
  days: number; setDays: (days: number) => void; opacity: number; setOpacity: (opacity: number) => void;
  retry: () => void; tileError: boolean;
}) {
  const data = state.data;
  const analysis = data?.analysis;
  const ready = data?.status === "ready";
  const date = (value: string | null | undefined) => value ? value.slice(0, 10) : "—";
  return (
    <aside aria-label="Earth Engine imagery" className="panel-float absolute left-4 top-4 z-10 max-h-[calc(100%-270px)] w-[300px] overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-bold"><Satellite size={16} className="text-[var(--blue)]" /> Earth Engine</div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${ready ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {ready ? "Connected" : data?.status === "not_configured" ? "Setup needed" : "Satellite context"}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-[var(--ink-2)]">Historical imagery around the selected incident</p>
      <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Satellite layer">
        {(["rgb", "ndvi"] as const).map((id) => (
          <button key={id} aria-pressed={layer === id} onClick={() => setLayer(id)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[11px] font-semibold ${layer === id ? "bg-white shadow-sm" : "text-slate-500"}`}>
            {id === "rgb" ? <Satellite size={13} /> : <Leaf size={13} />}{id === "rgb" ? "Satellite" : "Vegetation · NDVI"}
          </button>
        ))}
      </div>
      <label className="mt-3 flex items-center justify-between text-[11px] font-semibold">
        Before incident
        <select aria-label="Imagery period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-md border border-[var(--line)] bg-white px-2 py-1.5">
          {[14, 30, 60].map((n) => <option key={n} value={n}>{n} days</option>)}
        </select>
      </label>
      {state.loading ? (
        <div role="status" className="mt-3 flex items-center gap-2 text-[12px] text-[var(--ink-2)]"><Loader2 size={14} className="animate-spin" /> Loading satellite context…</div>
      ) : state.error || data?.status === "unavailable" || tileError ? (
        <div role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-[11px] text-amber-800">{state.error ?? (tileError ? "Satellite tiles could not load. Refresh the imagery." : data?.reason)}</div>
      ) : !ready ? (
        <div className="mt-3 flex gap-2 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-[var(--ink-2)]">
          <Info size={14} className="mt-0.5 shrink-0" /><span>{data?.reason ?? "Select an incident to load imagery."} {data?.status === "not_configured" && "The reference map stays available."}</span>
        </div>
      ) : analysis ? (
        <div className="mt-3 space-y-2 text-[11px]">
          <div className="rounded-lg bg-slate-50 p-2.5 leading-relaxed">
            <b>Sentinel-2 · cloud-masked composite</b><br />
            Acquisitions: {date(analysis.acquisition_start)} – {date(analysis.acquisition_end)}<br />
            {analysis.scene_count} scenes · 5 km imagery radius
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-[var(--line)] p-2.5"><span className="text-[var(--ink-2)]">Mean NDVI</span><div className="mt-1 text-[17px] font-bold">{analysis.ndvi_mean?.toFixed(2) ?? "—"}</div></div>
            <div className="rounded-lg border border-[var(--line)] p-2.5"><span className="text-[var(--ink-2)]">Valid coverage</span><div className="mt-1 text-[17px] font-bold">{analysis.valid_coverage_pct.toFixed(1)}%</div></div>
          </div>
          <p className="text-[10px] text-[var(--ink-2)]">Statistics within 1 km · sampled at 20 m. Cloud gaps remain transparent.</p>
          {analysis.valid_coverage_pct < 50 && <p className="text-amber-700">Limited clear coverage; these statistics describe only visible pixels.</p>}
          {layer === "ndvi" && <div><div className="h-2 rounded-full" style={{ background: "linear-gradient(to right,#2563eb,#e8dfb2,#a3cb68,#176b35)" }} /><div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>−1 · lower NDVI</span><span>+1 · higher NDVI</span></div></div>}
          <label className="flex items-center justify-between gap-3">Layer opacity<input aria-label="Satellite opacity" type="range" min="0" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-32 accent-blue-600" /></label>
        </div>
      ) : null}
      {data?.window && <p className="mt-3 text-[10px] text-[var(--ink-3)]">Window: {date(data.window.start)} – {date(data.window.end)} · UTC, ending at the incident time.</p>}
      <button disabled={state.loading} onClick={retry} className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--blue)] disabled:opacity-50"><RefreshCw size={12} /> Refresh imagery</button>
      <p className="mt-3 border-t border-[var(--line-2)] pt-2.5 text-[10px] leading-relaxed text-[var(--ink-2)]">Satellite context is not live fire detection. NDVI measures vegetation greenness; it does not identify fire or forest loss.</p>
    </aside>
  );
}
