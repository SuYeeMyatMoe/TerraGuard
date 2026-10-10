"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import { api } from "@/lib/api";
import { shortId } from "@/lib/format";
import { useStore } from "@/lib/store";
import {
  afterStyleReady,
  rasterInsertionPoint,
  isReferenceLabel,
  syncCamera,
} from "@/lib/map-style";
import {
  analysisCircle,
  STUDY_BOUNDS,
  type Bounds,
  type Position,
} from "@/lib/map-geometry";
import type { EarthEngineImagery } from "@/lib/types";
import type { EarthLayer } from "./EarthEnginePanel";

export type LayerVisibility = {
  imagery: boolean;
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
    setPositions(result);
  }, [data]);
  useEffect(() => {
    if (!beforeDiv.current || !afterDiv.current) return;
    maplibregl.setWorkerUrl(
      new URL(
        "maplibre-gl/dist/maplibre-gl-worker.mjs",
        import.meta.url,
      ).toString(),
    );
    const bounds: [[number, number], [number, number]] = [
      [STUDY_BOUNDS[0], STUDY_BOUNDS[1]],
      [STUDY_BOUNDS[2], STUDY_BOUNDS[3]],
    ];
    const before = new maplibregl.Map({
      container: beforeDiv.current,
      style: "https://tiles.openfreemap.org/styles/positron",
      bounds,
      fitBoundsOptions: {
        padding: { top: 60, bottom: 60, left: 340, right: 440 },
      },
      attributionControl: { compact: true },
    });
    const after = new maplibregl.Map({
      container: afterDiv.current,
      style: "https://tiles.openfreemap.org/styles/positron",
      interactive: false,
      attributionControl: false,
    });
    maps.current = [before, after];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => syncCamera(before, after);
    const viewport = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const b = before.getBounds();
        current.current.onViewport([
          b.getWest(),
          b.getSouth(),
          b.getEast(),
          b.getNorth(),
        ]);
      }, 600);
    };
    const click = (e: maplibregl.MapMouseEvent) => {
      if (current.current.measurement.drawing)
        current.current.onPoint([e.lngLat.lng, e.lngLat.lat]);
    };
    before.on("move", sync);
    before.on("moveend", viewport);
    before.on("click", click);
    before.on("resize", () => after.resize());
    maps.current.forEach((map) =>
      map.on("load", () => {
        ensureVectors(map);
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
      after.resize();
    });
    observer.observe(beforeDiv.current);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      maps.current = [];
      before.remove();
      after.remove();
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

  const imagery = props.imagery,
    bounds = imagery?.bounds;
  const rasterBefore = imagery?.layers.find((l) => l.id === props.layer);
  const rasterAfter = imagery?.layers.find(
    (l) => l.id === `${props.layer}_after`,
  );
  const beforeUrl = rasterBefore?.tile_url,
    afterUrl = rasterAfter?.tile_url;
  useEffect(() => {
    const cancels = maps.current.map((map, i) => {
      const raster = i === 0 ? rasterBefore : rasterAfter;
      const apply = () => {
        if (map.getLayer("earth-engine")) map.removeLayer("earth-engine");
        if (map.getSource("earth-engine")) map.removeSource("earth-engine");
        if (!raster || !bounds) return;
        map.addSource("earth-engine", {
          type: "raster",
          tiles: [raster.tile_url],
          tileSize: 256,
          bounds,
          minzoom: 0,
          maxzoom: 18,
          attribution: raster.attribution,
        });
        map.addLayer(
          {
            id: "earth-engine",
            type: "raster",
            source: "earth-engine",
            paint: { "raster-opacity": current.current.opacity },
            layout: {
              visibility: current.current.visibility.imagery
                ? "visible"
                : "none",
            },
          },
          rasterInsertionPoint(map.getStyle()?.layers ?? []),
        );
      };
      const error = (e: maplibregl.ErrorEvent) => {
        if ("sourceId" in e && e.sourceId === "earth-engine" && raster)
          current.current.onTileError(raster.tile_url);
      };
      map.on("error", error);
      const cancel = afterStyleReady(map, apply);
      return () => {
        cancel();
        map.off("error", error);
      };
    });
    return () => cancels.forEach((cancel) => cancel());
    // URLs identify the map resources; toggles and opacity are handled independently.
  }, [beforeUrl, afterUrl, bounds, ready, rasterBefore, rasterAfter]);

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
          inc
            ? analysisCircle(
                [inc.lon, inc.lat],
                imagery?.analysis_region?.radius_m ?? 1000,
              )
            : EMPTY,
        );
        setSource(map, "measure", measureFeatures(props.measurement));
        const v = props.visibility;
        for (const l of map.getStyle()?.layers ?? []) {
          const show =
            l.id === "earth-engine"
              ? v.imagery
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
        if (map.getLayer("earth-engine"))
          map.setPaintProperty("earth-engine", "raster-opacity", props.opacity);
      }),
    );
    const map = maps.current[0];
    if (map)
      map.getCanvas().style.cursor = props.measurement.drawing
        ? "crosshair"
        : "";
    return () => cancels.forEach((cancel) => cancel());
  }, [
    data,
    pas,
    selectedId,
    imagery,
    props.visibility,
    props.opacity,
    props.measurement,
    ready,
  ]);

  useEffect(() => {
    const map = maps.current[0],
      inc = data?.incidents.find((i) => i.id === selectedId);
    if (!map) return;
    if (inc)
      map.flyTo({
        center: [inc.lon, inc.lat],
        zoom: 10,
        padding: { top: 0, bottom: 0, left: 300, right: 420 },
        duration: 900,
        essential: true,
      });
  }, [selectedId, data]);
  const comparing =
    props.compare &&
    imagery?.comparison?.status === "ready" &&
    Boolean(afterUrl);
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
