"""Dated Earth View layers. Credentials and upstream tile addresses stay here."""
from __future__ import annotations

from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import json
import math
import os
from pathlib import Path
from threading import RLock
from time import monotonic
from urllib.parse import urlsplit
from uuid import uuid4

SENTINEL = "COPERNICUS/S2_SR_HARMONIZED"
CLOUD_SCORE = "GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED"
ATTRIBUTION = "Contains modified Copernicus Sentinel data · ESA · Google Earth Engine"


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class EarthEngineProvider:
    def __init__(self, project: str, key_path: str = ""):
        self.project, self.key_path = project, key_path
        self.ee = None

    def initialize(self):
        if self.ee is None:
            import ee
            if self.key_path:
                path = Path(self.key_path).expanduser()
                if not path.is_absolute():
                    path = Path(__file__).resolve().parents[1] / path
                info = json.loads(path.read_text())
                credentials = ee.ServiceAccountCredentials(info["client_email"], str(path))
            else:
                credentials = ee.data.get_persistent_credentials()
            ee.data.setMaxRetries(0)
            ee.Initialize(credentials=credentials, project=self.project)
            # setDeadline rebuilds the SDK transport, which Initialize creates.
            ee.data.setDeadline(20000)
            self.ee = ee
        return self.ee

    def analyze(self, incident: dict, start: str, end: str) -> dict:
        ee = self.initialize()
        point = ee.Geometry.Point([incident["lon"], incident["lat"]])
        region, display = point.buffer(1000), point.buffer(5000)
        # Cloud Score+ is linked by system:index. Missing QA stays masked.
        # https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_CLOUD_SCORE_PLUS_V1_S2_HARMONIZED
        collection = (ee.ImageCollection(SENTINEL).filterBounds(display).filterDate(start, end)
                      .linkCollection(ee.ImageCollection(CLOUD_SCORE), ["cs_cdf"])
                      .map(lambda image: image.updateMask(image.select("cs_cdf").gte(0.60))))
        metadata = ee.Dictionary({"count": collection.size(),
                                  "first": collection.aggregate_min("system:time_start"),
                                  "last": collection.aggregate_max("system:time_start")}).getInfo()
        count = int(metadata["count"])
        result = {"scene_count": count, "acquisition_start": None, "acquisition_end": None,
                  "ndvi_mean": None, "valid_coverage_pct": 0.0, "tiles": {}}
        if not count:
            return result
        for field, source in (("acquisition_start", "first"), ("acquisition_end", "last")):
            result[field] = iso(datetime.fromtimestamp(metadata[source] / 1000, timezone.utc))
        rgb = collection.select(["B4", "B3", "B2"]).median().clip(display)
        # Compute NDVI on each acquisition before taking a temporal median.
        ndvi = collection.map(lambda image: image.normalizedDifference(["B8", "B4"]).rename("ndvi")).median().clip(display)
        coverage = ndvi.mask().unmask(0, sameFootprint=False).rename("valid_fraction")
        stats = ndvi.addBands(coverage).reduceRegion(ee.Reducer.mean(), region, 20, maxPixels=100000).getInfo()
        result["ndvi_mean"] = None if stats.get("ndvi") is None else round(stats["ndvi"], 3)
        result["valid_coverage_pct"] = round(100 * (stats.get("valid_fraction") or 0), 1)
        if result["ndvi_mean"] is None or result["valid_coverage_pct"] <= 0:
            return result
        visualizations = {"rgb": (rgb, {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}),
                          "ndvi": (ndvi, {"min": -1, "max": 1, "palette": ["#2563eb", "#e8dfb2", "#a3cb68", "#176b35"]})}
        for layer, (image, params) in visualizations.items():
            result["tiles"][layer] = image.getMapId(params)["tile_fetcher"].url_format
        return result

    def fetch_tile(self, url: str) -> bytes:
        # Use the SDK's authenticated tile transport, not a browser credential.
        ee = self.initialize()
        parts = urlsplit(url).path.split("/tiles/")
        map_id = parts[0].removeprefix("/v1/")
        z, x, y = (int(value) for value in parts[1].split("/"))
        return ee.data.TileFetcher(url.rsplit("/", 3)[0] + "/{z}/{x}/{y}", map_id).fetch_tile(x, y, z)


class EarthEngineService:
    def __init__(self, project: str, provider=None, clock=monotonic):
        self.project = project.strip()
        self.provider = provider or EarthEngineProvider(self.project, os.getenv("GEE_SERVICE_ACCOUNT_JSON", "").strip())
        self.clock, self.lock = clock, RLock()
        self.cache, self.tiles = OrderedDict(), OrderedDict()

    def status(self) -> dict:
        return {"status": "select_incident" if self.project else "not_configured", "available": False,
                "reason": "Select an incident to inspect satellite imagery." if self.project else
                          "Earth Engine connection needed. Satellite imagery becomes available after account setup.",
                "incident_id": None, "window": None, "analysis": None, "layers": [], "bounds": None}

    def register_tile(self, url: str) -> str:
        parsed = urlsplit(url)
        if (parsed.scheme != "https" or parsed.netloc != "earthengine.googleapis.com" or
                not parsed.path.startswith("/v1/projects/") or "/maps/" not in parsed.path or
                not parsed.path.endswith("/tiles/{z}/{x}/{y}") or parsed.query or parsed.fragment):
            raise ValueError("Invalid Earth Engine tile address")
        handle = uuid4().hex
        with self.lock:
            self.tiles[handle] = (self.clock() + 1200, url)
            while len(self.tiles) > 128:
                self.tiles.popitem(last=False)
        return f"/api/earth-engine/tiles/{handle}/{{z}}/{{x}}/{{y}}"

    def tile_url(self, handle: str, z: int, x: int, y: int) -> str:
        if not (0 <= z <= 18 and 0 <= x < 2**z and 0 <= y < 2**z):
            raise ValueError("Invalid tile coordinates")
        with self.lock:
            expiry, url = self.tiles[handle]
            if self.clock() >= expiry:
                del self.tiles[handle]
                raise KeyError(handle)
        return url.format(z=z, x=x, y=y)

    def describe(self, incident: dict, days: int, refresh: bool = False) -> dict:
        if days not in (14, 30, 60):
            raise ValueError("Choose a 14, 30 or 60 day window")
        end = datetime.fromisoformat(incident["observed_at"].replace("Z", "+00:00"))
        start = end - timedelta(days=days)
        base = {**self.status(), "incident_id": incident["id"],
                "window": {"start": iso(start), "end": iso(end), "days": days}}
        if not self.project:
            return base
        key = (incident["id"], incident["lat"], incident["lon"], iso(end), days)
        with self.lock:
            cached = self.cache.get(key)
            handles_valid = cached and all(
                self.tiles.get(layer["tile_url"].split("/")[4], (0,))[0] > self.clock()
                for layer in cached[1]["layers"])
            if not refresh and cached and cached[0] > self.clock() and handles_valid:
                self.cache.move_to_end(key)
                return cached[1]
            try:
                analysis = self.provider.analyze(incident, iso(start), iso(end))
                layers = [{"id": kind, "tile_url": self.register_tile(url), "attribution": ATTRIBUTION}
                          for kind, url in analysis.pop("tiles").items()]
            except Exception:
                # Never serialize SDK errors: they can include credentials or URLs.
                return {**base, "status": "unavailable", "reason": "Earth Engine could not load imagery. Check the connection or try again."}
            dlat = 5 / 111.32
            dlon = dlat / math.cos(math.radians(incident["lat"]))
            result = {**base, "status": "ready" if layers else "no_data", "available": bool(layers),
                      "reason": None if layers else "No clear satellite pixels are available in this period. Try a longer window.",
                      "layers": layers, "analysis": analysis,
                      "bounds": [incident["lon"] - dlon, incident["lat"] - dlat,
                                 incident["lon"] + dlon, incident["lat"] + dlat],
                      "generated_at": iso(datetime.now(timezone.utc)), "refresh_after_seconds": 540,
                      "method": "Cloud Score+ ≥ 0.60; median composites; NDVI per scene; 1 km analysis buffer at 20 m.",
                      "limitations": "Historical optical imagery with cloud gaps. NDVI is not a forest-cover percentage or proof of fire."}
            self.cache[key] = (self.clock() + 600, result)
            while len(self.cache) > 64:
                self.cache.popitem(last=False)
            return result


@lru_cache(maxsize=1)
def service() -> EarthEngineService:
    return EarthEngineService(os.getenv("GEE_PROJECT", ""))
