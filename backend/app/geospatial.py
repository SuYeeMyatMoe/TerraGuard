"""Geospatial context for an incident: Earth Engine records (if extracted) + protected-area geometry."""
from __future__ import annotations

import json
import math
import os
from functools import lru_cache

from ml.config import PROCESSED_DIR, PROTECTED_AREAS

GEE_PATH = PROCESSED_DIR / "geospatial.json"


@lru_cache(maxsize=1)
def _gee() -> dict | None:
    if GEE_PATH.exists():
        return json.loads(GEE_PATH.read_text())
    return None


def circle(lat: float, lon: float, radius_km: float, n: int = 48) -> dict:
    pts = []
    for k in range(n + 1):
        a = 2 * math.pi * k / n
        dlat = radius_km / 111.32 * math.cos(a)
        dlon = radius_km / (111.32 * math.cos(math.radians(lat))) * math.sin(a)
        pts.append([round(lon + dlon, 5), round(lat + dlat, 5)])
    return {"type": "Polygon", "coordinates": [pts]}


def approximate_pas() -> list[dict]:
    return [{"type": "Feature", "geometry": circle(p["lat"], p["lon"], p["radius_km"]),
             "properties": {"id": p["id"], "name": p["name"], "country": p["country"], "boundary": "approximate"}}
            for p in PROTECTED_AREAS]


def context(incident: dict) -> dict:
    gee = _gee()
    rec = (gee or {}).get("incidents", {}).get(incident["id"])
    if rec:
        pas = [{"type": "Feature", "geometry": p["geometry"],
                "properties": {"name": p["name"], "wdpa_id": p["wdpa_id"], "boundary": "verified"}}
               for p in rec["protected_areas"]]
        return {"incident_id": incident["id"], "earth_engine": {"available": True, "generated_at": gee["generated_at"],
                                                                "records": rec["records"]},
                "protected_areas": {"type": "FeatureCollection", "features": pas or approximate_pas()},
                "boundary_status": "verified (WDPA via Earth Engine)" if pas else "approximate"}
    configured = bool(os.getenv("GEE_PROJECT") or os.getenv("GEE_SERVICE_ACCOUNT_JSON"))
    reason = ("Earth Engine credentials are configured but context has not been extracted yet "
              "(run `python -m ml.fetch_gee`)." if configured else
              "Earth Engine is not configured. Add GEE_PROJECT (and a service account) to backend/.env to enable "
              "land-cover, NDVI and forest-change context.")
    return {"incident_id": incident["id"], "earth_engine": {"available": False, "reason": reason, "records": []},
            "protected_areas": {"type": "FeatureCollection", "features": approximate_pas()},
            "boundary_status": "approximate"}
