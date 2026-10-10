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
    { id, type: "raster", source: id, paint: { "raster-fade-duration": 200 } },
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
