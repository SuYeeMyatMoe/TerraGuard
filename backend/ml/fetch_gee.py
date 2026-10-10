"""Optional Google Earth Engine context extraction (runs only when credentials are configured).

Requires:  pip install earthengine-api
           GEE_PROJECT=<cloud project id> and either GEE_SERVICE_ACCOUNT_JSON=<path to key file>
           or a prior `earthengine authenticate` on this machine.

For each scenario incident (1 km buffer) it records:
  * ESA WorldCover v200 (2021, 10 m) land-cover fractions
  * MODIS MOD13Q1 v061 NDVI (250 m, 16-day): latest composite before the observation and its anomaly vs the
    2018-2022 same-period median
  * Hansen Global Forest Change v1.11 (30 m): tree cover in 2000 and share of pixels with loss 2001-2023
  * WDPA polygons (WCMC/WDPA/current/polygons) intersecting a 25 km buffer -> verified boundaries
Output: data/processed/geospatial.json. These are CONTEXT features only and are never model inputs.

Usage:  python -m ml.fetch_gee
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone

import pandas as pd

from .config import PROCESSED_DIR

OUT = PROCESSED_DIR / "geospatial.json"
WORLDCOVER_CLASSES = {10: "Tree cover", 20: "Shrubland", 30: "Grassland", 40: "Cropland", 50: "Built-up",
                      60: "Bare / sparse", 70: "Snow / ice", 80: "Water", 90: "Herbaceous wetland",
                      95: "Mangroves", 100: "Moss / lichen"}


def _init():
    import ee  # noqa: WPS433
    project = os.getenv("GEE_PROJECT", "").strip()
    key = os.getenv("GEE_SERVICE_ACCOUNT_JSON", "").strip()
    if key:
        info = json.load(open(key))
        creds = ee.ServiceAccountCredentials(info["client_email"], key)
        ee.Initialize(creds, project=project or info.get("project_id"))
    else:
        ee.Initialize(project=project or None)
    return ee


def main() -> None:
    ee = _init()
    cand = pd.read_parquet(PROCESSED_DIR / "candidates.parquet").set_index("candidate_id")
    scen = json.loads((PROCESSED_DIR / "scenarios.json").read_text())["scenarios"]
    out = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "incidents": {}}
    wc = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")
    gfc = ee.Image("UMD/hansen/global_forest_change_2023_v1_11")
    modis = ee.ImageCollection("MODIS/061/MOD13Q1").select("NDVI")
    wdpa = ee.FeatureCollection("WCMC/WDPA/current/polygons")
    for s in scen:
        for inc in s["incidents"]:
            r = cand.loc[inc["candidate_id"]]
            t = pd.Timestamp(int(r["t_ns"]), tz="UTC")
            pt = ee.Geometry.Point([float(r["lon"]), float(r["lat"])])
            buf = pt.buffer(1000)
            hist = wc.reduceRegion(ee.Reducer.frequencyHistogram(), buf, 10, maxPixels=1e8).getInfo().get("Map", {})
            total = sum(hist.values()) or 1
            land = {WORLDCOVER_CLASSES.get(int(k), k): round(v / total, 3) for k, v in hist.items()}
            before = modis.filterDate((t - timedelta(days=40)).strftime("%Y-%m-%d"), t.strftime("%Y-%m-%d")).sort("system:time_start", False)
            latest = ee.Image(before.first())
            ndvi_now = latest.reduceRegion(ee.Reducer.mean(), buf, 250).getInfo().get("NDVI")
            doy = t.dayofyear
            ref = modis.filter(ee.Filter.calendarRange(2018, 2022, "year")).filter(
                ee.Filter.calendarRange(max(doy - 16, 1), min(doy + 16, 366), "day_of_year")).median()
            ndvi_ref = ref.reduceRegion(ee.Reducer.mean(), buf, 250).getInfo().get("NDVI")
            tc = gfc.select("treecover2000").reduceRegion(ee.Reducer.mean(), buf, 30).getInfo().get("treecover2000")
            loss = gfc.select("loss").reduceRegion(ee.Reducer.mean(), buf, 30).getInfo().get("loss")
            pas = wdpa.filterBounds(pt.buffer(25000)).limit(3)
            pa_geo = pas.map(lambda f: f.simplify(200)).getInfo()
            date_str = latest.date().format("YYYY-MM-dd").getInfo()
            out["incidents"][inc["incident_id"]] = {
                "records": [
                    {"dataset": "ESA WorldCover v200", "id": "ESA/WorldCover/v200", "acquired": "2021",
                     "resolution_m": 10, "method": "Class frequency within 1 km buffer",
                     "value": land, "limitations": "Single 2021 snapshot; may not reflect recent clearing."},
                    {"dataset": "MODIS MOD13Q1 v061 NDVI", "id": "MODIS/061/MOD13Q1", "acquired": date_str,
                     "resolution_m": 250, "method": "Mean NDVI in 1 km buffer; anomaly vs 2018–2022 median (±16 days)",
                     "value": {"ndvi": None if ndvi_now is None else round(ndvi_now / 10000, 3),
                               "anomaly": None if (ndvi_now is None or ndvi_ref is None) else round((ndvi_now - ndvi_ref) / 10000, 3)},
                     "limitations": "16-day composite; clouds and haze reduce quality in the dry season."},
                    {"dataset": "Hansen Global Forest Change v1.11", "id": "UMD/hansen/global_forest_change_2023_v1_11",
                     "acquired": "2000–2023", "resolution_m": 30, "method": "Mean within 1 km buffer",
                     "value": {"tree_cover_2000_pct": None if tc is None else round(tc, 1),
                               "loss_share_2001_2023": None if loss is None else round(loss, 3)},
                     "limitations": "Tree cover includes plantations; loss does not identify cause."},
                ],
                "protected_areas": [{"name": f["properties"].get("NAME"), "wdpa_id": f["properties"].get("WDPAID"),
                                     "geometry": f["geometry"]} for f in pa_geo.get("features", [])],
            }
            print("[gee]", inc["incident_id"], "ok")
    OUT.write_text(json.dumps(out))


if __name__ == "__main__":
    main()
