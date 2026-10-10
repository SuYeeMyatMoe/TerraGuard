"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import { api } from "@/lib/api";
import { shortId } from "@/lib/format";
import { useStore } from "@/lib/store";
import {
  afterStyleReady,
  rasterInsertionPoint,
  isReferenceLabel,
  syncCamera,
  syncRasterLayers,
  rasterSourceReady,
  cameraKey,
  camerasAligned,
} from "@/lib/map-style";
import {
  analysisCircle,
  type Bounds,
  type Position,
} from "@/lib/map-geometry";
import type { EarthEngineImagery } from "@/lib/types";
import type { EarthLayer } from "./EarthEnginePanel";

export type LayerVisibility = {
  imagery: boolean;
  historical: boolean;
  roads: boolean;
  incidents: boolean;
  hotspots: boolean;
  protected: boolean;
  analysis: boolean;
};
export type Measurement = {
  kind: "distance" | "area";
  points: Position[];
  drawing: boolean;
};
export type RasterState = { before: boolean; after: boolean; detail: boolean };
const COLORS: Record<string, string> = {
  INSPECT: "#ff8a35",
  RECHECK: "#2563eb",
  MONITOR: "#64748b",
};
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
type Props = {
  imagery: EarthEngineImagery | null;
  layer: EarthLayer;
  opacity: number;
  visibility: LayerVisibility;
  compare: boolean;
  divider: number;
  measurement: Measurement;
  onPoint: (point: Position) => void;
  onViewport: (bounds: Bounds) => void;
  onTileError: (url: string) => void;
  onRasterState: (state: RasterState) => void;
  destination: { center: Position; zoom: number } | null;
};

function measureFeatures(m: Measurement): FeatureCollection {
  const features: FeatureCollection["features"] = m.points.map((p, i) => ({
    type: "Feature",
    properties: { number: String(i + 1) },
    geometry: { type: "Point", coordinates: p },
  }));
  if (m.points.length >= 2)
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates:
          m.kind === "area" && !m.drawing
            ? [...m.points, m.points[0]]
            : m.points,
      },
    });
  if (m.kind === "area" && !m.drawing && m.points.length >= 3)
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[...m.points, m.points[0]]] },
    });
  return { type: "FeatureCollection", features };
}
function setSource(map: maplibregl.Map, id: string, data: FeatureCollection) {
  const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (source) source.setData(data);
  else map.addSource(id, { type: "geojson", data });
}
function ensureVectors(map: maplibregl.Map) {
  for (const id of ["pas", "ctx", "analysis", "measure"])
    if (!map.getSource(id)) setSource(map, id, EMPTY);
  const layers: maplibregl.LayerSpecification[] = [
    {
      id: "pas-fill",
      type: "fill",
      source: "pas",
      paint: { "fill-color": "#16a34a", "fill-opacity": 0.12 },
    },
    {
      id: "pas-line",
      type: "line",
      source: "pas",
      paint: {
        "line-color": "#16a34a",
        "line-width": 1.5,
        "line-dasharray": [2, 1.5],
      },
    },
    {
      id: "pas-label",
      type: "symbol",
      source: "pas",
      minzoom: 6,
      layout: {
        "text-field": [
          "concat",
          ["get", "name"],
          "\n(",
          ["get", "boundary"],
          " boundary)",
        ],
        "text-size": 11,
        "text-font": ["Noto Sans Regular"],
      },
      paint: {
        "text-color": "#17784f",
        "text-halo-color": "#fff",
        "text-halo-width": 1.5,
      },
    },
    {
      id: "ctx-dots",
      type: "circle",
      source: "ctx",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.5, 10, 6],
        "circle-color": "#f59e0b",
        "circle-opacity": 0.85,
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 1,
      },
    },
    {
      id: "analysis-fill",
      type: "fill",
      source: "analysis",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#3b82f6", "fill-opacity": 0.06 },
    },
    {
      id: "analysis-line",
      type: "line",
      source: "analysis",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": "#60a5fa",
        "line-width": 2,
        "line-dasharray": [3, 2],
      },
    },
    {
      id: "analysis-label",
      type: "symbol",
      source: "analysis",
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["get", "label"],
        "text-offset": [0, 2],
        "text-size": 11,
        "text-font": ["Noto Sans Regular"],
      },
      paint: {
        "text-color": "#1d4ed8",
        "text-halo-color": "#fff",
        "text-halo-width": 2,
      },
    },
    {
      id: "measure-fill",
      type: "fill",
      source: "measure",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#f59e0b", "fill-opacity": 0.15 },
    },
    {
      id: "measure-line",
      type: "line",
      source: "measure",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": "#f59e0b", "line-width": 3 },
    },
    {
      id: "measure-points",
      type: "circle",
      source: "measure",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": "#fff",
        "circle-stroke-color": "#d97706",
        "circle-stroke-width": 2,
      },
    },
    {
      id: "measure-label",
      type: "symbol",
      source: "measure",
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["get", "number"],
        "text-size": 12,
        "text-offset": [0, -1.4],
        "text-font": ["Noto Sans Regular"],
      },
      paint: {
        "text-color": "#92400e",
        "text-halo-color": "#fff",
        "text-halo-width": 2,
      },
    },
  ];
  layers.forEach((l) => {
    if (!map.getLayer(l.id)) map.addLayer(l);
  });
}

function ensureBasemap(map: maplibregl.Map) {
  if (map.getSource("world-imagery")) return;
  map.addSource("world-imagery", {
    type: "raster",
    tiles: [
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    maxzoom: 19,
    attribution:
      'Imagery © <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9" target="_blank" rel="noopener">Esri</a>, Vantor, Earthstar Geographics, GIS User Community',
  });
  map.addLayer(
    {
      id: "world-imagery",
      type: "raster",
      source: "world-imagery",
      paint: { "raster-fade-duration": 200 },
    },
    // Effects can attach dated sources as soon as the style is parsed, before
    // load adds this basemap. Its background must stay below those rasters.
    rasterInsertionPoint(map.getStyle()?.layers ?? [], "basemap"),
  );
  map.addLayer({
    id: "scientific-background", type: "background",
    layout: { visibility: "none" },
    paint: { "background-color": "#eceff2" },
  }, "world-imagery");
}

/** One interactive camera; the after map mirrors it and is clipped by the slider. */
export function EarthMap(props: Props) {
  const beforeDiv = useRef<HTMLDivElement>(null),
    afterDiv = useRef<HTMLDivElement>(null);
  const maps = useRef<maplibregl.Map[]>([]),
    current = useRef(props);
  const [ready, setReady] = useState(0),
    [positions, setPositions] = useState<Record<string, Position>>({}),
    [failed, setFailed] = useState(false);
  const data = useStore((s) => s.data),
    predictions = useStore((s) => s.predictions),
    selectedId = useStore((s) => s.selectedId),
    select = useStore((s) => s.select);
  const [pas, setPas] = useState<FeatureCollection | null>(null);
  const [detail, setDetail] = useState(false);
  const tileFailures = useRef(new Set<string>());
  const rasterState = useRef<RasterState>({ before: false, after: false, detail: false });
  const renderedFrames = useRef(new WeakMap<maplibregl.Map, string>());
  const first = data?.incidents[0]?.id;
  useEffect(() => {
    current.current = props;
  }, [props]);
  useEffect(() => {
    if (!first) return;
    let active = true;
    api
      .geospatial(first)
      .then((g) => {
        if (active) setPas(g.protected_areas);
      })
      .catch(() => {
        if (active) setPas(null);
      });
    return () => {
      active = false;
    };
  }, [first]);

  const projectMarkers = useCallback(() => {
    const map = maps.current[0];
    if (!map || !data) return;
    const result: Record<string, Position> = {};
    data.incidents.forEach((inc) => {
      const p = map.project([inc.lon, inc.lat]);
      result[inc.id] = [p.x, p.y];
    });
    setPositions((previous) => Object.keys(result).every((id) => previous[id] &&
      Math.abs(previous[id][0] - result[id][0]) < 0.5 && Math.abs(previous[id][1] - result[id][1]) < 0.5)
      ? previous : result);
  }, [data]);
  useEffect(() => {
    if (!beforeDiv.current || !afterDiv.current) return;
    maplibregl.setWorkerUrl(
      new URL(
        "maplibre-gl/dist/maplibre-gl-worker.mjs",
        import.meta.url,
      ).toString(),
    );
    const before = new maplibregl.Map({
      container: beforeDiv.current,
      style: "https://tiles.openfreemap.org/styles/positron",
      center: [20, 15],
      zoom: 2,
      attributionControl: false,
    });
    maps.current = [before];
    before.addControl(new maplibregl.NavigationControl(), "bottom-left");
    before.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );
    const controls = before
      .getContainer()
      .querySelector<HTMLElement>(".maplibregl-ctrl-bottom-left");
    if (controls) controls.style.bottom = "70px";
    const sync = () => {
      const after = maps.current[1];
      if (after && current.current.compare) syncCamera(before, after);
    };
    const viewport = () => {
      const b = before.getBounds();
      setDetail(before.getZoom() >= 6);
      current.current.onViewport([
        b.getWest(),
        b.getSouth(),
        b.getEast(),
        b.getNorth(),
      ]);
    };
    const click = (e: maplibregl.MapMouseEvent) => {
      if (current.current.measurement.drawing)
        current.current.onPoint([e.lngLat.lng, e.lngLat.lat]);
    };
    before.on("move", sync);
    before.on("moveend", viewport);
    before.on("click", click);
    before.on("resize", () => maps.current[1]?.resize());
    maps.current.forEach((map) =>
      // Install the raster stack before the first tile frame. Waiting for
      // load leaves vector land/water visible while dated tiles are pending.
      map.on("style.load", () => {
        ensureVectors(map);
        ensureBasemap(map);
        setReady((n) => n + 1);
        sync();
        viewport();
      }),
    );
    before.on("error", (e) => {
      if (
        !before.getStyle() &&
        /fetch|network|load/i.test(e.error?.message ?? "")
      )
        setFailed(true);
    });
    const observer = new ResizeObserver(() => {
      before.resize();
      maps.current[1]?.resize();
    });
    observer.observe(beforeDiv.current);
    return () => {
      observer.disconnect();
      maps.current[1]?.remove();
      before.remove();
      maps.current = [];
    };
  }, []);
  useEffect(() => {
    const map = maps.current[0];
    if (!map) return;
    map.on("move", projectMarkers);
    projectMarkers();
    return () => {
      map.off("move", projectMarkers);
    };
  }, [projectMarkers, ready]);

  // Polling statistics must not resynchronize raster sources with identical URLs.
  const layersKey = JSON.stringify(props.imagery?.layers ?? []);
  const boundsKey = JSON.stringify(props.imagery?.bounds ?? null);
  const layers = useMemo(() => JSON.parse(layersKey) as EarthEngineImagery["layers"], [layersKey]);
  const bounds = useMemo(() => JSON.parse(boundsKey) as Bounds | null, [boundsKey]);
  const rasterBefore = layers.find((l) => l.id === props.layer);
  const rasterAfter = layers.find(
    (l) => l.id === `${props.layer}_after`,
  );
  const afterUrl = rasterAfter?.tile_url;
  useEffect(() => {
    const before = maps.current[0];
    // Create the second renderer only when comparison is opened. Retain it on
    // subsequent toggles, but do not compete with foreground tiles beforehand.
    if (!props.compare || !props.visibility.historical || !afterUrl || !before || !afterDiv.current || maps.current[1]) return;
    const after = new maplibregl.Map({
      container: afterDiv.current,
      style: "https://tiles.openfreemap.org/styles/positron",
      interactive: false,
      attributionControl: false,
    });
    maps.current[1] = after;
    syncCamera(before, after);
    after.on("style.load", () => {
      ensureVectors(after);
      ensureBasemap(after);
      setReady((n) => n + 1);
      syncCamera(before, after);
    });
    // Both instances are disposed only by the parent map's unmount cleanup.
  }, [afterUrl, props.compare, props.visibility.historical]);
  useEffect(() => {
    if (props.destination)
      maps.current[0]?.jumpTo({
        ...props.destination,
        padding: { top: 0, bottom: 0, left: 300, right: 420 },
      });
  }, [props.destination]);
  useEffect(() => {
    const cancels = maps.current.map((map, i) => {
      const resources = layers.filter((resource) => resource.id.endsWith("_after") === (i === 1));
      const selected = `${props.layer}${i === 1 ? "_after" : ""}`;
      const apply = () => {
        syncRasterLayers(map, resources, bounds ?? null, selected,
          current.current.visibility.historical && (i === 0 || current.current.compare), current.current.opacity);
      };
      const error = (e: maplibregl.ErrorEvent) => {
        const sourceId = "sourceId" in e ? e.sourceId : null;
        const resource = resources.find((item) => `earth-engine-${item.id}` === sourceId);
        if (resource) {
          tileFailures.current.add(resource.tile_url);
          current.current.onTileError(resource.tile_url);
        }
        report();
      };
      const report = () => {
        const beforeMap = maps.current[0], afterMap = maps.current[1];
        const v = current.current;
        const beforeLayer = v.imagery?.layers.find((item) => item.id === v.layer);
        const afterLayer = v.imagery?.layers.find((item) => item.id === `${v.layer}_after`);
        const detailed = Boolean(beforeMap && beforeMap.getZoom() >= 6);
        const next = {
          detail: detailed,
          before: Boolean(detailed && v.visibility.historical && beforeMap && beforeLayer &&
            renderedFrames.current.get(beforeMap) === beforeLayer.tile_url + cameraKey(beforeMap) &&
            rasterSourceReady(beforeMap, `earth-engine-${v.layer}`, tileFailures.current.has(beforeLayer.tile_url))),
          after: Boolean(detailed && v.visibility.historical && afterMap && afterLayer &&
            camerasAligned(beforeMap, afterMap) &&
            renderedFrames.current.get(afterMap) === afterLayer.tile_url + cameraKey(afterMap) &&
            rasterSourceReady(afterMap, `earth-engine-${v.layer}_after`, tileFailures.current.has(afterLayer.tile_url))),
        };
        if (next.before !== rasterState.current.before || next.after !== rasterState.current.after || next.detail !== rasterState.current.detail) {
          rasterState.current = next;
          v.onRasterState(next);
        }
      };
      const rendered = () => {
        const v = current.current;
        const active = v.imagery?.layers.find((item) => item.id === `${v.layer}${i === 1 ? "_after" : ""}`);
        if (active) renderedFrames.current.set(map, active.tile_url + cameraKey(map));
        report();
      };
      map.on("error", error);
      map.on("sourcedata", report);
      map.on("sourcedataloading", report);
      map.on("idle", report);
      map.on("moveend", report);
      map.on("render", rendered);
      const cancel = afterStyleReady(map, apply);
      report();
      return () => {
        cancel();
        map.off("error", error);
        map.off("sourcedata", report);
        map.off("sourcedataloading", report);
        map.off("idle", report);
        map.off("moveend", report);
        map.off("render", rendered);
      };
    });
    return () => cancels.forEach((cancel) => cancel());
    // URLs identify the map resources; toggles and opacity are handled independently.
  }, [bounds, ready, layers, props.layer]);

  useEffect(() => {
    if (props.compare && maps.current[0] && maps.current[1])
      syncCamera(maps.current[0], maps.current[1]);
  }, [props.compare, ready]);

  useEffect(() => {
    const cancels = maps.current.map((map) =>
      afterStyleReady(map, () => {
        ensureVectors(map);
        setSource(map, "pas", pas ?? EMPTY);
        setSource(map, "ctx", {
          type: "FeatureCollection",
          features: (data?.context_hotspots ?? []).map((h) => ({
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [h.lon, h.lat] },
          })),
        });
        const inc = data?.incidents.find((i) => i.id === selectedId);
        setSource(
          map,
          "analysis",
          inc ? analysisCircle([inc.lon, inc.lat], 1000) : EMPTY,
        );
        setSource(map, "measure", measureFeatures(props.measurement));
      }),
    );
    return () => cancels.forEach((cancel) => cancel());
  }, [data, pas, selectedId, props.measurement, ready]);

  useEffect(() => {
    const cancels = maps.current.map((map, i) =>
      afterStyleReady(map, () => {
        const v = props.visibility;
        const resource = i === 0 ? rasterBefore : rasterAfter;
        // Scientific gaps must never reveal imagery from unrelated dates.
        const scientific = v.historical && ((Boolean(resource) && detail) || props.layer === "ndvi" || props.compare);
        for (const l of map.getStyle()?.layers ?? []) {
          const show =
            l.id === "world-imagery"
              ? v.imagery && !scientific
              : l.id === "scientific-background"
                ? scientific
              : l.id.startsWith("earth-engine-")
                ? undefined
                : l.id.startsWith("pas-")
                  ? v.protected
                  : l.id === "ctx-dots"
                    ? v.hotspots
                    : l.id.startsWith("analysis-")
                      ? v.analysis
                      : isReferenceLabel(l)
                        ? v.roads
                        : undefined;
          if (show !== undefined)
            map.setLayoutProperty(
              l.id,
              "visibility",
              show ? "visible" : "none",
            );
        }
        if (map.getLayer("pas-fill"))
          map.setPaintProperty("pas-fill", "fill-opacity", props.layer === "ndvi" ? 0 : 0.12);
        const selected = `${props.layer}${i === 1 ? "_after" : ""}`;
        syncRasterLayers(map, layers.filter((item) => item.id.endsWith("_after") === (i === 1)), bounds,
          selected, v.historical && (i === 0 || props.compare), props.opacity);
      }),
    );
    const map = maps.current[0];
    if (map)
      map.getCanvas().style.cursor = props.measurement.drawing
        ? "crosshair"
        : "";
    return () => cancels.forEach((cancel) => cancel());
  }, [
    props.visibility,
    props.opacity,
    props.layer,
    detail,
    props.compare,
    props.measurement.drawing,
    rasterBefore,
    rasterAfter,
    layers,
    bounds,
    ready,
  ]);

  const selectedIncident = data?.incidents.find((i) => i.id === selectedId);
  const selectedLon = selectedIncident?.lon,
    selectedLat = selectedIncident?.lat;
  useEffect(() => {
    const map = maps.current[0];
    if (!map) return;
    if (selectedLon !== undefined && selectedLat !== undefined)
      map.flyTo({
        center: [selectedLon, selectedLat],
        zoom: 10,
        padding: { top: 0, bottom: 0, left: 300, right: 420 },
        duration: 900,
        essential: true,
      });
  }, [selectedId, selectedLon, selectedLat]);
  const comparing = props.compare && props.visibility.historical;
  return (
    <>
      <div
        ref={beforeDiv}
        className="absolute inset-0"
        style={{ position: "absolute" }}
        aria-label="Interactive Earth View map"
      />
      <div
        ref={afterDiv}
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          position: "absolute",
          visibility: comparing ? "visible" : "hidden",
          backgroundColor: "#eceff2",
          clipPath: `inset(0 0 0 ${props.divider}%)`,
        }}
      />
      {comparing && (
        <div
          className="pointer-events-none absolute inset-y-0 z-[2] border-l-2 border-white shadow-md"
          style={{ left: `${props.divider}%` }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
        {props.visibility.incidents &&
          data?.incidents.map((inc) => {
            const p = positions[inc.id],
              pred = predictions[inc.id];
            if (!p) return null;
            const color = COLORS[pred?.priority.recommendation ?? "RECHECK"];
            return (
              <button
                key={inc.id}
                aria-label={`${inc.id} ${inc.region}`}
                disabled={props.measurement.drawing}
                onClick={() => select(inc.id)}
                className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-full flex-col items-center disabled:pointer-events-none"
                style={{ left: p[0], top: p[1] }}
              >
                <span
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-white px-2 py-1 text-[12px] font-semibold shadow-lg ${inc.id === selectedId ? "border-blue-600" : "border-slate-200"}`}
                >
                  <b
                    className="grid h-5 w-5 place-items-center rounded-full text-white"
                    style={{ background: color }}
                  >
                    {pred?.priority.rank ?? "·"}
                  </b>
                  {shortId(inc.id)}{" "}
                  <span className="font-normal text-slate-500">
                    {inc.region}
                  </span>
                </span>
                <span className="h-2.5 w-0.5" style={{ background: color }} />
                <span
                  className="h-3.5 w-3.5 rounded-full border-[3px] border-white shadow"
                  style={{ background: color }}
                />
              </button>
            );
          })}
      </div>
      {failed && (
        <div
          role="alert"
          className="panel-float absolute bottom-4 left-1/2 z-10 -translate-x-1/2 p-3 text-xs"
        >
          Reference map unavailable. Check the internet connection.
        </div>
      )}
    </>
  );
}
