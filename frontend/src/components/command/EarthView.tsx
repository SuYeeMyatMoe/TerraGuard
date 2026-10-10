"use client";
import { Layers, Ruler, Satellite } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import {
  EarthEngineController,
  visibleImagery,
} from "@/lib/earth-engine";
import {
  areaKm2,
  distanceKm,
  nextCoverage,
  polygonError,
  STUDY_BOUNDS,
  type Bounds,
  type Position,
} from "@/lib/map-geometry";
import { EarthEnginePanel, type EarthLayer } from "./EarthEnginePanel";
import { EarthMap, type LayerVisibility, type Measurement } from "./EarthMap";

const LAYER_NAMES: Record<keyof LayerVisibility, string> = {
  imagery: "Satellite imagery",
  roads: "Roads & place labels",
  incidents: "Incident markers",
  hotspots: "Context hotspots",
  protected: "Protected areas",
  analysis: "1 km analysis boundary",
};
export function EarthView() {
  const data = useStore((s) => s.data),
    selectedId = useStore((s) => s.selectedId);
  const [controller] = useState(
    () => new EarthEngineController(api.earthEngine),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [days, setDays] = useState(30),
    [layer, setLayer] = useState<EarthLayer>("rgb"),
    [opacity, setOpacity] = useState(1);
  const [bounds, setBounds] = useState<Bounds | null>(null),
    [outside, setOutside] = useState(false);
  const [mode, setMode] = useState<"context" | "compare">("context"),
    [divider, setDivider] = useState(50);
  const [visibility, setVisibility] = useState<LayerVisibility>({
    imagery: true,
    roads: true,
    incidents: true,
    hotspots: true,
    protected: true,
    analysis: true,
  });
  const [failedTiles, setFailedTiles] = useState<string[]>([]);
  const [measurement, setMeasurement] = useState<Measurement>({
      kind: "distance",
      points: [],
      drawing: false,
    }),
    [measureError, setMeasureError] = useState<string | null>(null);
  const id = selectedId ?? data?.incidents[0]?.id;
  const previousId = useRef<string | undefined>(undefined);
  const options = useMemo(
    () => ({ bounds: bounds ?? STUDY_BOUNDS, mode }),
    [bounds, mode],
  );
  const state = visibleImagery(snapshot,id,days,options);
  const onViewport = useCallback((raw: Bounds) => {
    const next = nextCoverage(null, raw);
    setOutside(!next);
    if (next) setBounds((current) => nextCoverage(current, raw) ?? current);
  }, []);
  useEffect(() => {
    if (!id || !bounds) return;
    // Let the selection flight finish before requesting its viewport.
    const changed = previousId.current !== id;
    previousId.current = id;
    const pending = setTimeout(
      () => void controller.load(id, days, false, options),
      changed && selectedId ? 1600 : 100,
    );
    const timer = setInterval(
      () => void controller.load(id, days, false, options),
      540000,
    );
    return () => {
      clearTimeout(pending);
      clearInterval(timer);
      controller.cancel();
    };
  }, [controller, id, days, options, bounds, selectedId]);
  const onPoint = useCallback((point: Position) => {
    setMeasureError(null);
    setMeasurement((m) =>
      m.drawing ? { ...m, points: [...m.points, point] } : m,
    );
  }, []);
  const finish = () => {
    const error =
      measurement.kind === "area"
        ? polygonError(measurement.points)
        : measurement.points.length < 2
          ? "Add at least two points."
          : null;
    setMeasureError(error);
    if (!error) setMeasurement((m) => ({ ...m, drawing: false }));
  };
  const onTileError = useCallback(
    (url: string) =>
      setFailedTiles((urls) => (urls.includes(url) ? urls : [...urls, url])),
    [],
  );
  const tileError =
    state.data?.layers.some(
      (l) =>
        (l.id === layer || (mode === "compare" && l.id === `${layer}_after`)) &&
        failedTiles.includes(l.tile_url),
    ) ?? false;
  const value =
    measurement.kind === "distance"
      ? `${distanceKm(measurement.points).toFixed(2)} km`
      : measurement.drawing
        ? "Finish to calculate area"
        : polygonError(measurement.points)
          ? "—"
          : areaKm2(measurement.points) < 1
            ? `${(areaKm2(measurement.points) * 100).toFixed(2)} ha`
            : `${areaKm2(measurement.points).toFixed(2)} km²`;
  return (
    <div className="absolute inset-0">
      <EarthMap
        imagery={state.data}
        layer={layer}
        opacity={opacity}
        compare={mode === "compare"}
        divider={divider}
        visibility={visibility}
        measurement={measurement}
        onPoint={onPoint}
        onViewport={onViewport}
        onTileError={onTileError}
      />
      <EarthEnginePanel
        state={state}
        layer={layer}
        setLayer={setLayer}
        days={days}
        setDays={setDays}
        opacity={opacity}
        setOpacity={setOpacity}
        tileError={tileError}
        mode={mode}
        setMode={setMode}
        overview={!selectedId}
        retry={() => {
          setFailedTiles([]);
          void controller.load(id, days, true, options);
        }}
      >
        <details className="mt-3 border-t border-slate-200 pt-3" open>
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-bold">
            <Layers size={13} />
            Map layers
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(Object.keys(LAYER_NAMES) as (keyof LayerVisibility)[]).map(
              (k) => (
                <label
                  key={k}
                  className="flex items-center gap-1.5 text-[10px]"
                >
                  <input
                    type="checkbox"
                    className="accent-blue-600"
                    checked={visibility[k]}
                    onChange={(e) =>
                      setVisibility((v) => ({ ...v, [k]: e.target.checked }))
                    }
                  />
                  {LAYER_NAMES[k]}
                </label>
              ),
            )}
          </div>
        </details>
        <details className="mt-3 border-t border-slate-200 pt-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-bold">
            <Ruler size={13} />
            Measure distance / area
          </summary>
          <div className="mt-2 flex gap-2">
            {(["distance", "area"] as const).map((kind) => (
              <button
                key={kind}
                aria-pressed={measurement.drawing && measurement.kind === kind}
                className="rounded border px-3 py-1.5 text-[11px] aria-pressed:bg-blue-50"
                onClick={() => {
                  setMeasureError(null);
                  setMeasurement({ kind, points: [], drawing: true });
                }}
              >
                {kind === "distance" ? "Distance" : "Area"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            {measurement.drawing
              ? "Click the map to add points, then finish."
              : "Choose a tool to draw on the map."}
          </p>
          <div role="status" className="mt-2 text-sm font-bold">
            {value}
          </div>
          <div className="mt-2 flex gap-2 text-[11px]">
            <button
              disabled={!measurement.drawing}
              onClick={finish}
              className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-40"
            >
              Finish
            </button>
            <button
              disabled={!measurement.points.length}
              onClick={() => {
                setMeasureError(null);
                setMeasurement((m) => ({
                  ...m,
                  drawing: true,
                  points: m.points.slice(0, -1),
                }));
              }}
              className="rounded border px-2 py-1 disabled:opacity-40"
            >
              Undo point
            </button>
            <button
              onClick={() => {
                setMeasureError(null);
                setMeasurement((m) => ({ ...m, points: [], drawing: false }));
              }}
              className="rounded border px-2 py-1"
            >
              Clear
            </button>
          </div>
          {measureError && (
            <p role="alert" className="mt-2 text-[11px] text-amber-700">
              {measureError}
            </p>
          )}
          <p className="mt-2 text-[10px] text-slate-500">
            Approximate geodesic measurement. Your drawn area is not a detected
            fire perimeter.
          </p>
        </details>
      </EarthEnginePanel>
      {mode === "compare" && state.data?.comparison?.status === "ready" && (
        <div className="panel-float absolute bottom-5 left-1/2 z-10 w-[280px] -translate-x-1/2 p-3">
          <div className="flex justify-between text-[11px] font-bold">
            <span>Before · left</span>
            <span>After · right</span>
          </div>
          <input
            aria-label="Before and after divider"
            type="range"
            min={0}
            max={100}
            value={divider}
            onChange={(e) => setDivider(Number(e.target.value))}
            className="mt-2 w-full accent-blue-600"
          />
          <p className="text-center text-[10px] text-amber-700">
            Retrospective · not used for prediction
          </p>
        </div>
      )}
      {outside && (
        <div
          role="status"
          className="panel-float absolute left-1/2 top-4 z-10 -translate-x-1/2 p-2 text-xs"
        >
          Outside study coverage · reference map only
        </div>
      )}
      <div className="panel-float absolute bottom-4 left-4 z-10 max-w-[300px] p-3">
        <details>
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-bold">
            <Satellite size={14} className="text-blue-600" />
            Map legend & data sources
          </summary>
          <p className="mt-2 text-[10px] text-slate-600">
            Orange: inspect · blue: recheck · gray: monitor · amber: prior 24 h
            hotspots · green: protected boundaries · blue ring: 1 km statistics.
          </p>
          <p className="mt-2 text-[10px] text-slate-500">
            Roads / places: OpenFreeMap / OpenStreetMap. Sentinel-2 via Earth
            Engine. Cloud gaps show the reference map.
          </p>
          {data?.provenance.is_synthetic && (
            <p className="mt-1 text-[10px] font-semibold text-amber-700">
              Hotspots are synthetic demo data.
            </p>
          )}
        </details>
      </div>
    </div>
  );
}
