"use client";
import { Layers, Ruler, Satellite } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { EarthEngineController } from "@/lib/earth-engine";
import {
  areaKm2,
  distanceKm,
  polygonError,
  type Bounds,
  type Position,
} from "@/lib/map-geometry";
import { EarthEnginePanel, type EarthLayer } from "./EarthEnginePanel";
import { EarthMap, type RasterState, type LayerVisibility, type Measurement } from "./EarthMap";

const LAYER_NAMES: Record<keyof LayerVisibility, string> = {
  imagery: "Global satellite basemap",
  historical: "Dated Sentinel-2 overlay",
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
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [rasterState, setRasterState] = useState<RasterState>({ before: false, after: false, detail: false });
  const [destination, setDestination] = useState<{
    center: Position;
    zoom: number;
  } | null>(null);
  const [latitude, setLatitude] = useState(""),
    [longitude, setLongitude] = useState("");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mode, setMode] = useState<"context" | "compare">("context"),
    [divider, setDivider] = useState(50);
  const [visibility, setVisibility] = useState<LayerVisibility>({
    imagery: true,
    historical: true,
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
  const state = snapshot;
  const showHistorical = visibility.historical;
  const mapVisibility = useMemo(
    () => ({ ...visibility, historical: showHistorical }),
    [visibility, showHistorical],
  );
  const onViewport = useCallback(
    (raw: Bounds) => {
      setBounds((current) =>
        current?.every((value, i) => value === raw[i]) ? current : raw,
      );
    },
    [],
  );
  useEffect(() => {
    return () => controller.cancel();
  }, [controller]);
  useEffect(() => {
    if (!id) {
      controller.reset();
      return;
    }
    // Prepare one reusable period pair. The map requests z/x/y tiles for any
    // location; camera movement and display controls never recreate recipes.
    void controller.load(id, days, false, { mode: "compare", background: true });
  }, [controller, id, days]);
  const retry = () => {
    setFailedTiles([]);
    void controller.load(id, days, true, { mode: "compare", background: true });
  };
  const incident = data?.incidents.find((item) => item.id === selectedId);
  const inIncidentArea = Boolean(incident && bounds && incident.lat >= bounds[1] && incident.lat <= bounds[3] &&
    incident.lon >= bounds[0] && incident.lon <= bounds[2]);
  const navigate = () => {
    const lat = Number(latitude),
      lon = Number(longitude);
    if (
      !latitude.trim() ||
      !longitude.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 85 ||
      Math.abs(lon) > 180
    ) {
      setLocationError("Enter latitude −85 to 85 and longitude −180 to 180.");
      return;
    }
    setLocationError(null);
    setDestination({ center: [lon, lat], zoom: 11 });
  };
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
      setFailedTiles((urls) =>
        urls.includes(url) ? urls : [...urls.slice(-15), url],
      ),
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
        visibility={mapVisibility}
        measurement={measurement}
        onPoint={onPoint}
        onViewport={onViewport}
        onTileError={onTileError}
        onRasterState={setRasterState}
        destination={destination}
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
        overview={!selectedId || !inIncidentArea || state.data?.incident_id !== id}
        manual
        automatic
        rasterState={rasterState}
        historicalVisible={visibility.historical}
        anchor={id}
        retry={retry}
      >
        <details className="border-b border-[var(--line-2)] py-2.5 last:border-0">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-[var(--ink)]">
            Go to a location
          </summary>
          <form
            className="mt-2 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              navigate();
            }}
          >
            <label className="block text-[11.5px] font-semibold text-[var(--ink-2)]">
              Latitude
              <input
                aria-label="Latitude"
                type="number"
                step="any"
                min="-85"
                max="85"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="mt-1 h-8 w-full rounded-[8px] border border-[var(--line)] px-2.5 text-[12px] outline-none focus:border-[var(--blue)]"
                placeholder="37.7749"
                required
              />
            </label>
            <label className="block text-[11.5px] font-semibold text-[var(--ink-2)]">
              Longitude
              <input
                aria-label="Longitude"
                type="number"
                step="any"
                min="-180"
                max="180"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="mt-1 h-8 w-full rounded-[8px] border border-[var(--line)] px-2.5 text-[12px] outline-none focus:border-[var(--blue)]"
                placeholder="-122.4194"
                required
              />
            </label>
            <button className="btn btn-primary h-8 w-full px-3 text-[12px]">
              Go to coordinates
            </button>
          </form>
          {locationError && (
            <p role="alert" className="mt-2 text-[11px] text-amber-700">
              {locationError}
            </p>
          )}
          <button
            className="mt-2 text-[11.5px] font-semibold text-[var(--blue)] hover:underline"
            onClick={() => setDestination({ center: [0, 20], zoom: 2 })}
          >
            World view
          </button>
        </details>
        <details className="border-b border-[var(--line-2)] py-2.5 last:border-0" open>
          <summary className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ink)]">
            <Layers size={13} />
            Map layers
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(Object.keys(LAYER_NAMES) as (keyof LayerVisibility)[]).map(
              (k) => (
                <label
                  key={k}
                  className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-2)]"
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
        <details className="border-b border-[var(--line-2)] py-2.5 last:border-0">
          <summary className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ink)]">
            <Ruler size={13} />
            Measure distance / area
          </summary>
          <div className="mt-2 flex gap-2">
            {(["distance", "area"] as const).map((kind) => (
              <button
                key={kind}
                aria-pressed={measurement.drawing && measurement.kind === kind}
                className="btn btn-secondary h-8 flex-1 px-3 text-[12px] aria-pressed:border-[var(--blue)] aria-pressed:text-[var(--blue)]"
                onClick={() => {
                  setMeasureError(null);
                  setMeasurement({ kind, points: [], drawing: true });
                }}
              >
                {kind === "distance" ? "Distance" : "Area"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-[var(--ink-2)]">
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
              className="btn btn-primary h-8 px-3 text-[12px]"
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
              className="btn btn-secondary h-8 px-3 text-[12px]"
            >
              Undo point
            </button>
            <button
              onClick={() => {
                setMeasureError(null);
                setMeasurement((m) => ({ ...m, points: [], drawing: false }));
              }}
              className="btn btn-secondary h-8 px-3 text-[12px]"
            >
              Clear
            </button>
          </div>
          {measureError && (
            <p role="alert" className="mt-2 text-[11px] text-amber-700">
              {measureError}
            </p>
          )}
          <p className="mt-2 text-[10.5px] text-[var(--ink-3)]">
            Approximate geodesic measurement. Your drawn area is not a detected
            fire perimeter.
          </p>
        </details>
      </EarthEnginePanel>
      {mode === "compare" && showHistorical && (
          <div className="panel-float absolute bottom-3 right-3 z-10 w-[280px] max-w-[calc(100%-76px)] p-3 lg:bottom-5 lg:left-1/2 lg:right-auto lg:max-w-none lg:-translate-x-1/2">
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
              disabled={!rasterState.before || !rasterState.after}
              onChange={(e) => setDivider(Number(e.target.value))}
              className="mt-2 w-full accent-blue-600"
            />
            <p className="text-center text-[10px] text-amber-700">
              {!rasterState.detail ? "Zoom in for detailed comparison, anywhere in the world"
                : !rasterState.before || !rasterState.after
                ? state.data?.comparison?.status === "unavailable" || state.data?.comparison?.status === "no_data"
                  ? state.data.comparison.reason
                  : "Preparing comparison imagery…"
                : "Retrospective · not used for prediction"}
            </p>
          </div>
        )}
      <div className="earth-legend panel-float absolute bottom-3 left-3 z-10 max-w-[calc(100%-24px)] p-3 lg:bottom-4 lg:left-4 lg:max-w-[300px]">
        <details>
          <summary aria-label="Map legend & data sources" className="flex cursor-pointer items-center gap-2 text-xs font-bold">
            <Satellite size={14} className="text-blue-600" />
            <span className="sr-only lg:not-sr-only">Map legend &amp; data sources</span>
          </summary>
          <p className="mt-2 text-[10px] text-slate-600">
            Orange: inspect · blue: recheck · gray: monitor · amber: prior 24 h
            hotspots · green: protected boundaries · blue ring: 1 km statistics. Cyan:
            crew base and allocation line · amber badge: waiting without a crew.
          </p>
          <p className="mt-2 text-[10.5px] text-[var(--ink-3)]">
            Global basemap: Esri World Imagery (mixed acquisition dates; not the
            replay date). Roads / places: OpenFreeMap / OpenStreetMap. Dated
            Sentinel-2 and NDVI: Earth Engine. Cloud gaps in the scientific
            overlay are gray, not a replacement from another date.
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
