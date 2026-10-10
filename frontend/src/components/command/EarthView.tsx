"use client";

import { APIProvider, AdvancedMarker, Map as GMap, useMap } from "@vis.gl/react-google-maps";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Info, Satellite } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { shortId, utc } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Incident, Prediction } from "@/lib/types";
import type { FeatureCollection } from "geojson";

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
const GOOGLE_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";
const STUDY_BOUNDS: [[number, number], [number, number]] = [[95.0, -4.5], [119.5, 7.5]];
const REC_COLOR: Record<string, string> = { INSPECT: "#ff8a35", RECHECK: "#365004", MONITOR: "#74634c" };

function usePAs() {
  const data = useStore((s) => s.data);
  const [pas, setPas] = useState<FeatureCollection | null>(null);
  const first = data?.incidents[0]?.id;
  useEffect(() => {
    if (!first) return;
    api.geospatial(first).then((g) => setPas(g.protected_areas)).catch(() => setPas(null));
  }, [first]);
  return pas;
}

export function EarthView() {
  return (
    <div className="absolute inset-0">
      {GOOGLE_KEY ? <GoogleEarth /> : <MapLibreEarth />}
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
          <span className="flex items-center gap-1.5"><Dot c="#365004" /> Recheck recommended</span>
          <span className="flex items-center gap-1.5"><Dot c="#74634c" /> Monitor</span>
          <span className="flex items-center gap-1.5"><Dot c="#f59e0b" small /> Other detections, prior 24 h</span>
          <span className="col-span-2 flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm border border-dashed border-[#16a34a] bg-[#16a34a22]" /> Protected areas (approximate boundaries)
          </span>
        </div>
        {!GOOGLE_KEY && (
          <div className="mt-2.5 flex gap-1.5 border-t border-[var(--line-2)] pt-2.5 text-[11px] leading-snug text-[var(--ink-2)]">
            <Info size={13} className="mt-px shrink-0" />
            Satellite imagery activates when a Google Maps key is configured. Basemap: OpenFreeMap / OpenStreetMap.
          </div>
        )}
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
  const color = pred ? REC_COLOR[pred.priority.recommendation] : "#365004";
  const el = document.createElement("button");
  el.setAttribute("aria-label", `${inc.id} ${inc.region}`);
  el.style.cssText = "background:none;border:0;padding:0;cursor:pointer;";
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px)">
      <div style="display:flex;align-items:center;gap:6px;background:#faf8ef;border-radius:999px;padding:4px 10px 4px 4px;box-shadow:0 4px 14px rgba(23,38,56,.18);border:1.5px solid ${selected ? "#365004" : "#dedbc9"};font:600 12px var(--font-manrope),sans-serif;color:#351903;white-space:nowrap">
        <span style="display:grid;place-items:center;width:20px;height:20px;border-radius:999px;background:${color};color:#fff;font-size:11px;font-weight:800">${pred?.priority.rank ?? "·"}</span>
        ${shortId(inc.id)} <span style="color:#74634c;font-weight:500">${inc.region}</span>
      </div>
      <div style="width:2px;height:10px;background:${color}"></div>
      <div style="width:14px;height:14px;border-radius:999px;background:${color};border:3px solid #fff;box-shadow:0 0 0 ${selected ? 6 : 0}px ${color}33,0 2px 6px rgba(0,0,0,.25)"></div>
    </div>`;
  return el;
}

function MapLibreEarth() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [failed, setFailed] = useState(false);
  const data = useStore((s) => s.data);
  const predictions = useStore((s) => s.predictions);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const pas = usePAs();

  useEffect(() => {
    if (!ref.current) return;
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
            layout: { "text-field": ["concat", ["get", "name"], "\n(approx. boundary)"], "text-size": 11, "text-font": ["Noto Sans Regular"] },
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
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
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
            <button key={i.id} onClick={() => select(i.id)} className="flex w-full justify-between rounded-lg bg-[#faf8ef] px-3 py-2 text-left text-[12.5px] hover:bg-[var(--blue-50)]">
              <span className="font-semibold">{shortId(i.id)} · {i.region}</span>
              <span className="font-mono text-[11.5px] text-[var(--ink-2)]">{i.lat.toFixed(3)}, {i.lon.toFixed(3)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Google Maps (satellite) */
function GoogleEarth() {
  const data = useStore((s) => s.data);
  const predictions = useStore((s) => s.predictions);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  return (
    <APIProvider apiKey={GOOGLE_KEY}>
      <GMap
        mapId={GOOGLE_MAP_ID}
        mapTypeId="hybrid"
        defaultBounds={{ west: STUDY_BOUNDS[0][0], south: STUDY_BOUNDS[0][1], east: STUDY_BOUNDS[1][0], north: STUDY_BOUNDS[1][1] }}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        style={{ position: "absolute", inset: 0 }}
      >
        {data?.context_hotspots.map((h, i) => (
          <AdvancedMarker key={`c${i}`} position={{ lat: h.lat, lng: h.lon }} zIndex={1}>
            <span style={{ display: "block", width: 8, height: 8, borderRadius: 999, background: "#f59e0b", border: "1.5px solid #fff" }} />
          </AdvancedMarker>
        ))}
        {data?.incidents.map((inc) => (
          <GoogleIncidentMarker key={inc.id} inc={inc} pred={predictions[inc.id]} selected={inc.id === selectedId} onClick={() => select(inc.id)} />
        ))}
        <GoogleOverlays />
      </GMap>
    </APIProvider>
  );
}

function GoogleIncidentMarker({ inc, pred, selected, onClick }: { inc: Incident; pred?: Prediction; selected: boolean; onClick: () => void }) {
  const html = useMemo(() => markerEl(inc, pred, selected).innerHTML, [inc, pred, selected]);
  return (
    <AdvancedMarker position={{ lat: inc.lat, lng: inc.lon }} onClick={onClick} zIndex={selected ? 30 : 20} title={`${inc.id} · ${utc(inc.observed_at)}`}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </AdvancedMarker>
  );
}

function GoogleOverlays() {
  const map = useMap();
  const data = useStore((s) => s.data);
  const selectedId = useStore((s) => s.selectedId);
  const pas = usePAs();
  useEffect(() => {
    if (!map || !pas) return;
    const added = map.data.addGeoJson(pas);
    map.data.setStyle({ fillColor: "#16a34a", fillOpacity: 0.15, strokeColor: "#22c55e", strokeWeight: 1.5 });
    return () => added.forEach((f) => map.data.remove(f));
  }, [map, pas]);
  useEffect(() => {
    if (!map || !data) return;
    const inc = data.incidents.find((i) => i.id === selectedId);
    if (inc) {
      map.panTo({ lat: inc.lat, lng: inc.lon });
      const target = 13;
      let z = map.getZoom() ?? 5;
      const id = setInterval(() => {
        z = Math.min(z + 1, target);
        map.setZoom(z);
        if (z >= target) clearInterval(id);
      }, 160);
      return () => clearInterval(id);
    }
    map.fitBounds({ west: STUDY_BOUNDS[0][0], south: STUDY_BOUNDS[0][1], east: STUDY_BOUNDS[1][0], north: STUDY_BOUNDS[1][1] });
  }, [map, data, selectedId]);
  return null;
}
