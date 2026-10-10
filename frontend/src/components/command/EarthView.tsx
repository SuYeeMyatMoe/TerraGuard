"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Info, Satellite } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { shortId } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { EarthEngineImagery, Incident, Prediction } from "@/lib/types";
import type { FeatureCollection } from "geojson";

import { EarthEngineController, type ImagerySnapshot } from "@/lib/earth-engine";
import { EarthEnginePanel, type EarthLayer } from "./EarthEnginePanel";
import { afterStyleReady } from "@/lib/map-style";
const STUDY_BOUNDS: [[number, number], [number, number]] = [[95.0, -4.5], [119.5, 7.5]];
const REC_COLOR: Record<string, string> = { INSPECT: "#ff8a35", RECHECK: "#2563eb", MONITOR: "#64748b" };

function usePAs() {
  const data = useStore((s) => s.data);
  const [pas, setPas] = useState<FeatureCollection | null>(null);
  const first = data?.incidents[0]?.id;
  useEffect(() => {
    if (!first) return;
    let active = true;
    api.geospatial(first).then((g) => { if (active) setPas(g.protected_areas); }).catch(() => { if (active) setPas(null); });
    return () => { active = false; };
  }, [first]);
  return pas;
}

export function EarthView() {
  const selectedId = useStore((s) => s.selectedId);
  const [controller] = useState(() => new EarthEngineController(api.earthEngine));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [days, setDays] = useState(30);
  const [layer, setLayer] = useState<EarthLayer>("rgb");
  const [opacity, setOpacity] = useState(1);
  const [failedTile, setFailedTile] = useState<string | null>(null);
  const id = selectedId ?? undefined;
  const state: ImagerySnapshot = snapshot.key === `${id ?? ""}:${days}` ? snapshot :
    { key: "", loading: true, data: null, error: null };
  const tileUrl = state.data?.layers.find((l) => l.id === layer)?.tile_url;
  useEffect(() => {
    void controller.load(id, days);
    const refresh = setInterval(() => { void controller.load(id, days); }, 540000);
    return () => { clearInterval(refresh); controller.cancel(); };
  }, [controller, id, days]);
  return (
    <div className="absolute inset-0">
      <MapLibreEarth imagery={state.data} layer={layer} opacity={opacity} onTileError={setFailedTile} />
      <EarthEnginePanel state={state} layer={layer} setLayer={setLayer} days={days} setDays={setDays}
        opacity={opacity} setOpacity={setOpacity} tileError={Boolean(tileUrl && failedTile === tileUrl)}
        retry={() => { setFailedTile(null); void controller.load(id, days, true); }} />
      <EarthLegend />
    </div>
  );
}

function EarthLegend() {
  const data = useStore((s) => s.data);
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 max-w-[420px]">
      <div className="panel-float pointer-events-auto p-3.5">
        <div className="flex items-center gap-2 text-[12.5px] font-bold">
          <Satellite size={14} className="text-[var(--blue)]" /> Earth View · real coordinates
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] text-[var(--ink-2)]">
          <span className="flex items-center gap-1.5"><Dot c="#ff8a35" /> Inspect recommended</span>
          <span className="flex items-center gap-1.5"><Dot c="#2563eb" /> Recheck recommended</span>
          <span className="flex items-center gap-1.5"><Dot c="#64748b" /> Monitor</span>
          <span className="flex items-center gap-1.5"><Dot c="#f59e0b" small /> Other detections, prior 24 h</span>
          <span className="col-span-2 flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-[#16a34a] bg-[#16a34a22]" /> Protected areas · boundary status in incident context
          </span>
        </div>
        <div className="mt-2.5 flex gap-1.5 border-t border-[var(--line-2)] pt-2.5 text-[11px] leading-snug text-[var(--ink-2)]">
          <Info size={13} className="mt-px shrink-0" />
          Reference map: OpenFreeMap / OpenStreetMap. Earth Engine layers show dated imagery around the selected incident.
        </div>
        {data?.provenance.is_synthetic && (
          <div className="mt-1.5 text-[11px] font-semibold text-amber-700">Hotspots are synthetic demo data in the FIRMS schema.</div>
        )}
      </div>
    </div>
  );
}

function Dot({ c, small }: { c: string; small?: boolean }) {
  return <span className={`inline-block rounded-full ring-2 ring-white ${small ? "h-2 w-2" : "h-3 w-3"}`} style={{ background: c }} />;
}

function markerEl(inc: Incident, pred: Prediction | undefined, selected: boolean) {
  const color = pred ? REC_COLOR[pred.priority.recommendation] : "#2563eb";
  const el = document.createElement("button");
  el.setAttribute("aria-label", `${inc.id} ${inc.region}`);
  el.style.cssText = "background:none;border:0;padding:0;cursor:pointer;";
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px)">
      <div style="display:flex;align-items:center;gap:6px;background:#fff;border-radius:999px;padding:4px 10px 4px 4px;box-shadow:0 4px 14px rgba(23,38,56,.18);border:1.5px solid ${selected ? "#2563eb" : "#e3eaf2"};font:600 12px var(--font-manrope),sans-serif;color:#172638;white-space:nowrap">
        <span style="display:grid;place-items:center;width:20px;height:20px;border-radius:999px;background:${color};color:#fff;font-size:11px;font-weight:800">${pred?.priority.rank ?? "·"}</span>
        ${shortId(inc.id)} <span style="color:#64748b;font-weight:500">${inc.region}</span>
      </div>
      <div style="width:2px;height:10px;background:${color}"></div>
      <div style="width:14px;height:14px;border-radius:999px;background:${color};border:3px solid #fff;box-shadow:0 0 0 ${selected ? 6 : 0}px ${color}33,0 2px 6px rgba(0,0,0,.25)"></div>
    </div>`;
  return el;
}

function MapLibreEarth({ imagery, layer, opacity, onTileError }: {
  imagery: EarthEngineImagery | null; layer: EarthLayer; opacity: number; onTileError: (url: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const framedIncident = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const data = useStore((s) => s.data);
  const predictions = useStore((s) => s.predictions);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const pas = usePAs();

  useEffect(() => {
    if (!ref.current) return;
    maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
    const map = new maplibregl.Map({
      container: ref.current,
      style: "https://tiles.openfreemap.org/styles/positron",
      bounds: STUDY_BOUNDS,
      fitBoundsOptions: { padding: { top: 60, bottom: 60, left: 60, right: 460 } },
      attributionControl: { compact: true },
    });
    map.on("error", (e) => {
      if (String(e.error?.message ?? "").match(/Failed to fetch|NetworkError|load/i) && !map.isStyleLoaded()) setFailed(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const raster = imagery?.layers.find((l) => l.id === layer);
  const tileUrl = raster?.tile_url;
  const attribution = raster?.attribution;
  const bounds = imagery?.bounds;
  const incidentId = imagery?.incident_id;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tileUrl || !bounds || !attribution) return;
    const apply = () => {
      map.addSource("earth-engine", { type: "raster", tiles: [tileUrl], tileSize: 256,
        bounds, minzoom: 0, maxzoom: 18, attribution });
      const before = map.getLayer("pas-fill") ? "pas-fill" : map.getLayer("ctx-dots") ? "ctx-dots" : undefined;
      map.addLayer({ id: "earth-engine", type: "raster", source: "earth-engine" }, before);
      if (incidentId && framedIncident.current !== incidentId) {
        map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], {
          padding: { top: 60, bottom: 240, left: 340, right: 420 }, maxZoom: 13, duration: 900,
        });
        framedIncident.current = incidentId;
      }
    };
    const error = (event: maplibregl.ErrorEvent) => {
      if ("sourceId" in event && event.sourceId === "earth-engine") onTileError(tileUrl);
    };
    map.on("error", error);
    const cancel = afterStyleReady(map, apply);
    return () => {
      cancel();
      map.off("error", error);
      if (mapRef.current !== map) return;
      if (map.getLayer("earth-engine")) map.removeLayer("earth-engine");
      if (map.getSource("earth-engine")) map.removeSource("earth-engine");
    };
  }, [tileUrl, bounds, attribution, incidentId, onTileError]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tileUrl) return;
    const apply = () => { if (map.getLayer("earth-engine")) map.setPaintProperty("earth-engine", "raster-opacity", opacity); };
    return afterStyleReady(map, apply);
  }, [opacity, tileUrl]);

  // protected areas + context hotspots layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    const apply = () => {
      const ctx: FeatureCollection = {
        type: "FeatureCollection",
        features: data.context_hotspots.map((h) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [h.lon, h.lat] },
          properties: { frp: h.frp_max_mw, t: h.observed_at },
        })),
      };
      const setSrc = (id: string, d: FeatureCollection) => {
        const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData(d);
        else map.addSource(id, { type: "geojson", data: d });
      };
      if (pas) {
        setSrc("pas", pas);
        if (!map.getLayer("pas-fill")) {
          map.addLayer({ id: "pas-fill", type: "fill", source: "pas", paint: { "fill-color": "#16a34a", "fill-opacity": 0.12 } });
          map.addLayer({ id: "pas-line", type: "line", source: "pas", paint: { "line-color": "#16a34a", "line-width": 1.5, "line-dasharray": [2, 1.5] } });
          map.addLayer({
            id: "pas-label", type: "symbol", source: "pas", minzoom: 6,
            layout: { "text-field": ["concat", ["get", "name"], "\n(", ["get", "boundary"], " boundary)"], "text-size": 11, "text-font": ["Noto Sans Regular"] },
            paint: { "text-color": "#17784f", "text-halo-color": "#fff", "text-halo-width": 1.5 },
          });
        }
      }
      setSrc("ctx", ctx);
      if (!map.getLayer("ctx-dots")) {
        map.addLayer({
          id: "ctx-dots", type: "circle", source: "ctx",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.5, 10, 6],
            "circle-color": "#f59e0b", "circle-opacity": 0.85, "circle-stroke-color": "#fff", "circle-stroke-width": 1,
          },
        });
      }
    };
    return afterStyleReady(map, apply);
  }, [data, pas]);

  // incident markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    markers.current.forEach((m) => m.remove());
    markers.current = data.incidents.map((inc) => {
      const el = markerEl(inc, predictions[inc.id], inc.id === selectedId);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        select(inc.id);
      });
      return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([inc.lon, inc.lat]).addTo(map);
    });
  }, [data, predictions, selectedId, select]);

  // fly to selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    const inc = data.incidents.find((i) => i.id === selectedId);
    if (inc) map.flyTo({ center: [inc.lon, inc.lat], zoom: 9.5, padding: { top: 0, bottom: 0, left: 0, right: 420 }, duration: 1600, essential: true });
    else map.fitBounds(STUDY_BOUNDS, { padding: { top: 60, bottom: 60, left: 60, right: 460 }, duration: 1200 });
  }, [selectedId, data]);

  return (
    <>
      <div className="absolute inset-0">
        <div ref={ref} className="h-full w-full" />
      </div>
      {failed && <OfflineCard />}
    </>
  );
}

function OfflineCard() {
  const data = useStore((s) => s.data);
  const select = useStore((s) => s.select);
  return (
    <div className="absolute inset-0 grid place-items-center bg-[var(--bg)]">
      <div className="panel w-[420px] p-5">
        <div className="text-[14px] font-bold">Map tiles unavailable (offline)</div>
        <p className="mt-1 text-[12.5px] text-[var(--ink-2)]">The basemap needs internet. Incident coordinates are still available:</p>
        <div className="mt-3 space-y-1.5">
          {data?.incidents.map((i) => (
            <button key={i.id} onClick={() => select(i.id)} className="flex w-full justify-between rounded-lg bg-[#f7f9fc] px-3 py-2 text-left text-[12.5px] hover:bg-[var(--blue-50)]">
              <span className="font-semibold">{shortId(i.id)} · {i.region}</span>
              <span className="font-mono text-[11.5px] text-[var(--ink-2)]">{i.lat.toFixed(3)}, {i.lon.toFixed(3)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
