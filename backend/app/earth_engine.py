"""Dated Earth View layers. Credentials and upstream tile addresses stay here."""
from __future__ import annotations

from collections import OrderedDict
from concurrent.futures import Future
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import json
import math
import os
import re
from pathlib import Path
from threading import RLock
from time import monotonic
from urllib.parse import urlsplit
from uuid import uuid4

SENTINEL = "COPERNICUS/S2_SR_HARMONIZED"
CLOUD_SCORE = "GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED"
ATTRIBUTION = "Contains modified Copernicus Sentinel data · ESA · Google Earth Engine"
STUDY_BOUNDS = [95.0, -4.5, 119.5, 7.5]
# Equal 0.2 NDVI steps from -1 to +1. Keep 0–0.2 soil-like values
# sandy/neutral; the former four-color ramp already looked green at zero.
NDVI_PALETTE = ["#2563eb", "#517ba2", "#7b8c9a", "#a4a4a0", "#c2bdb0",
                "#d6c7a1", "#c3ac78", "#a3cb68", "#5aa23c", "#23762f", "#0d5429"]


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def display_extent(incident: dict, bbox=None) -> list[float]:
    if bbox is None:
        dlat = 5 / 111.32
        dlon = dlat / math.cos(math.radians(incident["lat"]))
        bounds = [incident["lon"] - dlon, incident["lat"] - dlat,
                  incident["lon"] + dlon, incident["lat"] + dlat]
    else:
        try:
            bounds = [float(value) for value in (bbox.split(",") if isinstance(bbox, str) else bbox)]
        except (TypeError, ValueError):
            raise ValueError("bbox must contain west,south,east,north") from None
    if len(bounds) != 4 or not all(math.isfinite(value) for value in bounds):
        raise ValueError("bbox must contain four finite coordinates")
    west, south, east, north = bounds
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("bbox must contain ordered geographic coordinates")
    return bounds


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
            ee.data.setDeadline(60000)
            self.ee = ee
        return self.ee

    def analyze(self, incident: dict, start: str, end: str, display_bounds=None) -> dict:
        ee = self.initialize()
        point = ee.Geometry.Point([incident["lon"], incident["lat"]])
        bounds = display_extent(incident, display_bounds)
        region = point.buffer(1000)
        display = ee.Geometry.Rectangle(bounds, geodesic=False)
        # Cloud Score+ is linked by system:index. Missing QA stays masked.
        # https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_CLOUD_SCORE_PLUS_V1_S2_HARMONIZED
        collection = (ee.ImageCollection(SENTINEL).filterDate(start, end)
                      .linkCollection(ee.ImageCollection(CLOUD_SCORE), ["cs_cdf"])
                      .map(lambda image: image.updateMask(image.select("cs_cdf").gte(0.60))))
        display_collection = collection.filterBounds(display)
        analysis_collection = collection.filterBounds(region)
        def metadata_for(images):
            return ee.Dictionary({"count": images.size(), "first": images.aggregate_min("system:time_start"),
                                  "last": images.aggregate_max("system:time_start")})
        metadata = ee.Dictionary({"analysis": metadata_for(analysis_collection),
                                  "display": metadata_for(display_collection)}).getInfo()
        def acquisition(info):
            return {"scene_count": int(info["count"]),
                    **{field: None if info.get(source) is None else
                       iso(datetime.fromtimestamp(info[source] / 1000, timezone.utc))
                       for field, source in (("acquisition_start", "first"), ("acquisition_end", "last"))}}
        result = {**acquisition(metadata["analysis"]), "ndvi_mean": None,
                  "valid_coverage_pct": 0.0, "tiles": {},
                  "display": {**acquisition(metadata["display"]), "bounds": bounds,
                              "study_bounds": STUDY_BOUNDS.copy()}}
        def ndvi_composite(images):
            # NDVI is calculated per acquisition before the temporal median.
            return images.map(lambda image: image.normalizedDifference(["B8", "B4"]).rename("ndvi")).median()
        if result["scene_count"]:
            analysis_ndvi = ndvi_composite(analysis_collection).clip(region)
            coverage = analysis_ndvi.mask().unmask(0, sameFootprint=False).rename("valid_fraction")
            stats = analysis_ndvi.addBands(coverage).reduceRegion(ee.Reducer.mean(), region, 20, maxPixels=100000).getInfo()
            result["ndvi_mean"] = None if stats.get("ndvi") is None else round(stats["ndvi"], 3)
            result["valid_coverage_pct"] = round(100 * (stats.get("valid_fraction") or 0), 1)
        if not result["display"]["scene_count"]:
            return result
        rgb = display_collection.select(["B4", "B3", "B2"]).median().clip(display)
        ndvi = ndvi_composite(display_collection).clip(display)
        visualizations = {"rgb": (rgb, {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}),
                          "ndvi": (ndvi, {"min": -1, "max": 1, "palette": NDVI_PALETTE})}
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
    def __init__(self, project: str, provider=None, clock=monotonic, utcnow=None):
        self.project = project.strip()
        self.provider = provider or EarthEngineProvider(self.project, os.getenv("GEE_SERVICE_ACCOUNT_JSON", "").strip())
        self.clock, self.lock = clock, RLock()
        self.generation_lock = RLock()
        self.utcnow = utcnow or (lambda: datetime.now(timezone.utc))
        self.cache, self.tiles = OrderedDict(), OrderedDict()
        self.tile_cache, self.tile_pending = OrderedDict(), {}
        self.tile_bytes, self.max_tile_bytes = 0, 32 * 1024 * 1024

    def status(self) -> dict:
        return {"status": "select_incident" if self.project else "not_configured", "available": False,
                "reason": "Select an incident to inspect satellite imagery." if self.project else
                          "Earth Engine connection needed. Satellite imagery becomes available after account setup.",
                "incident_id": None, "window": None, "analysis": None, "layers": [], "bounds": None}

    def register_tile(self, url: str) -> str:
        parsed = urlsplit(url)
        if (parsed.scheme != "https" or parsed.netloc != "earthengine.googleapis.com" or
                not re.fullmatch(r"/v1/projects/[A-Za-z0-9_-]+/maps/[A-Za-z0-9_-]+/tiles/\{z\}/\{x\}/\{y\}", parsed.path)
                or parsed.query or parsed.fragment):
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
            self.tiles.move_to_end(handle)
        return url.format(z=z, x=x, y=y)

    def fetch_tile(self, handle: str, z: int, x: int, y: int) -> bytes:
        url = self.tile_url(handle, z, x, y)
        with self.lock:
            cached = self.tile_cache.get(url)
            if cached and cached[0] > self.clock():
                self.tile_cache.move_to_end(url)
                return cached[1]
            if cached:
                self.tile_bytes -= len(self.tile_cache.pop(url)[1])
            pending = self.tile_pending.get(url)
            producer = pending is None
            if producer:
                pending = self.tile_pending[url] = Future()
        if not producer:
            return pending.result()
        try:
            image = self.provider.fetch_tile(url)
            if not image.startswith((b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff')):
                raise ValueError('Invalid satellite tile')
            with self.lock:
                if len(image) <= self.max_tile_bytes:
                    self.tile_cache[url] = (self.clock() + 600, image)
                    self.tile_bytes += len(image)
                    while self.tile_bytes > self.max_tile_bytes or len(self.tile_cache) > 512:
                        self.tile_bytes -= len(self.tile_cache.popitem(last=False)[1][1])
                pending.set_result(image)
            return image
        except Exception as exc:
            pending.set_exception(exc)
            raise
        finally:
            with self.lock:
                self.tile_pending.pop(url, None)

    def cached_description(self, key, refresh):
        with self.lock:
            cached = self.cache.get(key)
            valid = cached and all(self.tiles.get(layer['tile_url'].split('/')[4], (0,))[0] > self.clock()
                                   for layer in cached[1]['layers'])
            if not refresh and cached and cached[0] > self.clock() and valid:
                self.cache.move_to_end(key)
                return cached[1]
        return None

    def describe(self, incident: dict, days: int, refresh: bool = False, bbox=None, mode: str = "context") -> dict:
        if days not in (14, 30, 60):
            raise ValueError("Choose a 14, 30 or 60 day window")
        if mode not in ("context", "compare"):
            raise ValueError("Choose context or compare mode")
        bounds = display_extent(incident, bbox)
        if bounds[2] - bounds[0] > 8 or bounds[3] - bounds[1] > 8:
            raise ValueError('Zoom in to analyze a view no wider or taller than 8 degrees. Global browsing stays available.')
        end = datetime.fromisoformat(incident["observed_at"].replace("Z", "+00:00")).astimezone(timezone.utc)
        start = end - timedelta(days=days)
        now = self.utcnow()
        after_end = min(end + timedelta(days=days), now)
        # An empty post window has equal endpoints, rather than reversed dates.
        after_window = {"start": iso(end), "end": iso(max(end, after_end)), "days": days}
        base = {**self.status(), "incident_id": incident["id"],
                "window": {"start": iso(start), "end": iso(end), "days": days},
                "bounds": bounds, "display": None,
                "analysis_region": {"center": [incident["lon"], incident["lat"]], "radius_m": 1000}}
        if mode == "compare":
            base["comparison"] = {"status": "no_data", "reason": "Before imagery is required for comparison.",
                                  "window": after_window, "analysis": None, "display": None}
        if not self.project:
            return base
        key = (incident["id"], incident["lat"], incident["lon"], iso(end), days, tuple(bounds), mode)
        cached = self.cached_description(key, refresh)
        if cached is not None:
            return cached
        # Remote computations must not block the short-lived tile registry lock.
        with self.generation_lock:
            cached = self.cached_description(key, refresh)
            if cached is not None:
                return cached
            def load(window, suffix=""):
                data = dict(self.provider.analyze(incident, window["start"], window["end"], display_bounds=bounds))
                layers = [{"id": kind + suffix, "tile_url": self.register_tile(url), "attribution": ATTRIBUTION}
                          for kind, url in data.pop("tiles").items()]
                display = data.pop("display")
                return data, display, layers

            try:
                analysis, display, layers = load(base["window"])
            except Exception:
                # Never serialize SDK errors: they can include credentials or URLs.
                return {**base, "status": "unavailable", "reason": "Earth Engine could not load imagery. Check the connection or try again."}
            result = {**base, "status": "ready" if layers else "no_data", "available": bool(layers),
                      "reason": None if layers else "No satellite imagery is available in this period. Try a longer window.",
                      "layers": layers, "analysis": analysis, "display": display,
                      "generated_at": iso(now), "refresh_after_seconds": 540,
                      "method": "Cloud Score+ ≥ 0.60; median composites; NDVI per scene; 1 km analysis buffer at 20 m.",
                      "limitations": "Historical optical imagery with cloud gaps. Scene dates describe candidate acquisitions; clear pixels may be absent. NDVI is not a forest-cover percentage or proof of fire."}
            if mode == "compare" and layers:
                if after_end <= end:
                    result["comparison"]["reason"] = "No post-incident period is available yet; the incident is at or after the current time."
                else:
                    try:
                        after_analysis, after_display, after_layers = load(after_window, "_after")
                        result["comparison"] = {"status": "ready" if after_layers else "no_data",
                                                "reason": None if after_layers else "No satellite imagery is available in the post-incident period.",
                                                "window": after_window, "analysis": after_analysis, "display": after_display}
                        result["layers"].extend(after_layers)
                    except Exception:
                        result["comparison"] = {"status": "unavailable", "reason": "Post-incident imagery could not load. Try again.",
                                                "window": after_window, "analysis": None, "display": None}
            with self.lock:
                self.cache[key] = (self.clock() + 600, result)
                while len(self.cache) > 64:
                    self.cache.popitem(last=False)
            return result


@lru_cache(maxsize=1)
def service() -> EarthEngineService:
    return EarthEngineService(os.getenv("GEE_PROJECT", ""))
