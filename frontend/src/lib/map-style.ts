import type { Map } from "maplibre-gl";
import type { LayerSpecification } from "maplibre-gl";

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
    Map,
    "getCenter" | "getZoom" | "getBearing" | "getPitch" | "getPadding"
  >,
  target: Pick<Map, "jumpTo">,
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
  map: Pick<Map, "getStyle" | "once" | "off">,
  apply: () => void,
) {
  if (map.getStyle()) apply();
  else map.once("style.load", apply);
  return () => {
    map.off("style.load", apply);
  };
}
