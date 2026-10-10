import type { Map as LibreMap } from "maplibre-gl";
import type { LayerSpecification } from "maplibre-gl";

// Identity depends on the actual map resource, not new metadata object references.
const rasterKeys = new WeakMap<object, Map<string, string>>();
export function syncRaster(
  map: Pick<
    LibreMap,
    | "getSource"
    | "getLayer"
    | "getStyle"
    | "addSource"
    | "addLayer"
    | "removeLayer"
    | "removeSource"
  >,
  id: string,
  resource: { tile_url: string; attribution: string } | null,
  bounds: number[] | null,
) {
  let keys = rasterKeys.get(map);
  if (!keys) {
    keys = new globalThis.Map();
    rasterKeys.set(map, keys);
  }
  const key =
    resource && bounds ? `${resource.tile_url}:${bounds.join(",")}` : "";
  if (keys.get(id) === key && (!key || map.getSource(id))) return;
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
  keys.set(id, key);
  if (!resource || !bounds) return;
  map.addSource(id, {
    type: "raster",
    tiles: [resource.tile_url],
    tileSize: 256,
    bounds: bounds as [number, number, number, number],
    maxzoom: 18,
    attribution: resource.attribution,
  });
  map.addLayer(
    { id, type: "raster", source: id, minzoom: 6, paint: { "raster-fade-duration": 200 } },
    rasterInsertionPoint(map.getStyle()?.layers ?? []),
  );
}

export function isReferenceLabel(
  layer: Pick<LayerSpecification, "id" | "type">,
) {
  return (
    !/^(pas-|analysis-|measure-|ctx-|earth-engine)/.test(layer.id) &&
    (layer.type === "symbol" ||
      /road|transport|bridge|tunnel|highway|railway/i.test(layer.id))
  );
}

// Each scientific layer owns its source. Selecting RGB/NDVI only changes
// visibility; the inactive layer's loaded tile pyramid remains reusable.
export function syncRasterLayers(
  map: Parameters<typeof syncRaster>[0] & Pick<LibreMap, "setLayoutProperty" | "setPaintProperty">,
  resources: { id: string; tile_url: string; attribution: string }[],
  bounds: number[] | null,
  selected: string,
  visible: boolean,
  opacity: number,
  preload = false,
) {
  for (const kind of ["rgb", "ndvi", "rgb_after", "ndvi_after"]) {
    const resource = resources.find((item) => item.id === kind);
    const id = `earth-engine-${kind}`;
    syncRaster(map, id, resource ?? null, resource ? bounds : null);
    if (map.getLayer(id)) {
      const active = visible && kind === selected;
      map.setLayoutProperty(id, "visibility", active || (visible && preload) ? "visible" : "none");
      map.setPaintProperty(id, "raster-opacity", active ? opacity : 0);
    }
  }
}

export function rasterSourceReady(
  map: Pick<LibreMap, "getSource" | "isSourceLoaded">,
  id: string,
  failed: boolean,
) {
  return Boolean(map.getSource(id) && !failed && map.isSourceLoaded(id));
}

type Camera = Pick<LibreMap, "getCenter" | "getZoom" | "getBearing" | "getPitch" | "getPadding" | "getCanvas">;

export function cameraKey(map: Camera) {
  const center = map.getCenter();
  return JSON.stringify([center.lng, center.lat, map.getZoom(), map.getBearing(), map.getPitch(),
    map.getPadding(), map.getCanvas().width, map.getCanvas().height]);
}

export function camerasAligned(before: Camera, after: Camera) {
  const a = before.getCenter(), b = after.getCenter();
  const p = before.getPadding(), q = after.getPadding();
  return Math.abs(a.lng - b.lng) < 1e-7 && Math.abs(a.lat - b.lat) < 1e-7 &&
    Math.abs(before.getZoom() - after.getZoom()) < 1e-7 &&
    Math.abs(before.getBearing() - after.getBearing()) < 1e-7 &&
    Math.abs(before.getPitch() - after.getPitch()) < 1e-7 &&
    (["left", "right", "top", "bottom"] as const).every((side) => Math.abs((p[side] ?? 0) - (q[side] ?? 0)) < .1) &&
    before.getCanvas().width === after.getCanvas().width && before.getCanvas().height === after.getCanvas().height;
}

export function syncCamera(
  source: Pick<
    LibreMap,
    "getCenter" | "getZoom" | "getBearing" | "getPitch" | "getPadding"
  >,
  target: Pick<LibreMap, "jumpTo">,
) {
  target.jumpTo({
    center: source.getCenter(),
    zoom: source.getZoom(),
    bearing: source.getBearing(),
    pitch: source.getPitch(),
    padding: source.getPadding(),
  });
}
export function rasterInsertionPoint(
  layers: Pick<LayerSpecification, "id" | "type">[],
) {
  return layers.find(
    (l) => isReferenceLabel(l) || /^(pas-|analysis-|measure-|ctx-)/.test(l.id),
  )?.id;
}

// getStyle() becomes available once the style is parsed. isStyleLoaded() also
// waits for source tiles, so it must not gate changes to an existing style.
export function afterStyleReady(
  map: Pick<LibreMap, "getStyle" | "once" | "off">,
  apply: () => void,
) {
  if (map.getStyle()) apply();
  else map.once("style.load", apply);
  return () => {
    map.off("style.load", apply);
  };
}
