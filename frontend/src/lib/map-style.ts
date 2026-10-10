import type { Map } from "maplibre-gl";

// getStyle() becomes available once the style is parsed. isStyleLoaded() also
// waits for source tiles, so it must not gate changes to an existing style.
export function afterStyleReady(map: Pick<Map, "getStyle" | "once" | "off">, apply: () => void) {
  if (map.getStyle()) apply();
  else map.once("style.load", apply);
  return () => { map.off("style.load", apply); };
}
