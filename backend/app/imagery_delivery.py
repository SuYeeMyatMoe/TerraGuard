"""Reusable period recipes; Google computes only requested map tiles.

Descriptors contain dates and processing versions, never Google URLs or tokens.
Tile bytes survive a restart. Expired Google map resources are renewed internally.
"""
from collections import OrderedDict
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
import logging
from pathlib import Path
import re
from threading import RLock
from time import monotonic
from time import sleep
from uuid import uuid4

from .tile_sign import decode_recipe, sign_recipe

WORLD = [-180, -85.051129, 180, 85.051129]
VERSION = "s2-cloud060-median-rgb4500-gamma115-ndvi11-v1"
LOG = logging.getLogger(__name__)


def digest(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def valid_image(data):
    return data.startswith((b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff'))


def http_status(exc):
    for _ in range(4):
        if exc is None:
            return None
        code = getattr(exc, "code", None) or getattr(getattr(exc, "resp", None), "status", None)
        if code:
            return code
        exc = exc.__cause__ or exc.__context__
    return None


class TileStore:
    def __init__(self, root, max_bytes=512 * 1024 * 1024):
        self.root, self.max_bytes = Path(root), max_bytes
        self.lock, self.writes = RLock(), 0

    def read(self, relative):
        path = self.root / relative
        try:
            if path.stat().st_size > 4 * 1024 * 1024:
                return None
            data = path.read_bytes()
            path.touch()
            return data
        except OSError:
            return None

    def write(self, relative, data):
        path = self.root / relative
        with self.lock:
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            temporary = path.with_name(path.name + "." + uuid4().hex + ".tmp")
            try:
                temporary.write_bytes(data)
                temporary.chmod(0o600)
                temporary.replace(path)
            finally:
                temporary.unlink(missing_ok=True)
            if relative.startswith("tiles/"):
                self.writes += 1
                # Bound disk usage without scanning the cache for every tile.
                if self.writes % 32 == 0:
                    files = [(p.stat().st_mtime, p.stat().st_size, p)
                             for p in (self.root / "tiles").glob("*.tile")]
                    total = sum(size for _, size, _ in files)
                    for _, size, candidate in sorted(files):
                        if total <= self.max_bytes:
                            break
                        candidate.unlink(missing_ok=True)
                        total -= size


class ImageryDelivery:
    def __init__(self, project, provider, root, clock=monotonic):
        self.project, self.provider, self.clock = project, provider, clock
        self.disk = TileStore(root)
        self.lock = RLock()
        self.images = ThreadPoolExecutor(max_workers=2, thread_name_prefix="earth-images")
        self.stats = ThreadPoolExecutor(max_workers=1, thread_name_prefix="earth-statistics")
        self.tile_io = ThreadPoolExecutor(max_workers=8, thread_name_prefix="earth-tiles")
        self.jobs, self.stat_jobs, self.revisions = OrderedDict(), OrderedDict(), {}
        self.pending_tiles = {}

    def close(self):
        self.tile_io.shutdown(wait=True, cancel_futures=True)
        self.images.shutdown(wait=True, cancel_futures=True)
        self.stats.shutdown(wait=True, cancel_futures=True)

    def warm(self):
        if self.project and hasattr(self.provider, "initialize"):
            self.images.submit(self.provider.initialize)

    def specification(self, window, now, refresh=False):
        identity = (window["start"], window["end"])
        with self.lock:
            if refresh:
                self.revisions[identity] = uuid4().hex
            revision = self.revisions.get(identity, "")
        # Recent imagery can change as acquisitions/QA arrive; old periods are stable.
        recent = window["end"][:10] >= (now.date() - timedelta(days=7)).isoformat()
        return {"project": self.project, "version": VERSION, "start": window["start"],
                "end": window["end"], "revision": revision,
                "snapshot": now.date().isoformat() if recent else "historical"}

    def _prepare(self, spec):
        started = self.clock()
        try:
            urls = self.provider.imagery(spec["start"], spec["end"])
            if set(urls) != {"rgb", "ndvi"}:
                raise ValueError("Invalid imagery recipe")
            for url in urls.values():
                if not re.fullmatch(r"https://earthengine\.googleapis\.com/v1/projects/[A-Za-z0-9_-]+/maps/[A-Za-z0-9_-]+/tiles/\{z\}/\{x\}/\{y\}", url):
                    raise ValueError("Invalid map resource")
            layers = []
            for kind, url in urls.items():
                descriptor = {"recipe": spec, "layer": kind}
                self.disk.write(f"recipes/{'g' + digest(descriptor)}.json", json.dumps(descriptor).encode())
                handle = sign_recipe(descriptor)
                layers.append({"id": kind, "tile_url": f"/api/earth-engine/tiles/{handle}/{{z}}/{{x}}/{{y}}"})
            LOG.info("Earth imagery prepared seconds=%.3f", self.clock() - started)
            return {"status": "ready", "layers": layers, "urls": urls,
                    "expires": self.clock() + 1200}
        except Exception:
            # Upstream exception text can contain credentials; log only the phase.
            LOG.warning("Earth imagery preparation failed seconds=%.3f", self.clock() - started)
            return {"status": "unavailable", "layers": [], "expires": self.clock() + 15}

    def job(self, spec):
        key = digest(spec)
        with self.lock:
            future = self.jobs.get(key)
            if future and future.done() and future.result()["expires"] <= self.clock():
                del self.jobs[key]; future = None
            if future is None:
                # No unbounded queue of historical periods behind active work.
                if sum(not item.done() for item in self.jobs.values()) >= 8:
                    return None
                future = self.images.submit(self._prepare, spec)
                self.jobs[key] = future
            self.jobs.move_to_end(key)
            for old in list(self.jobs):
                if len(self.jobs) <= 32:
                    break
                if self.jobs[old].done():
                    del self.jobs[old]
            return future

    def period(self, spec, suffix, attribution):
        future = self.job(spec)
        result = future.result() if future and future.done() else {"status": "preparing", "layers": []}
        if result["status"] != "ready":
            # Stable public handles need no live Google URL. Expose saved
            # recipes immediately so disk-cached tiles render during warmup.
            layers = []
            for kind in ("rgb", "ndvi"):
                descriptor = {"recipe": spec, "layer": kind}
                if self.disk.read(f"recipes/{'g' + digest(descriptor)}.json") is None:
                    return {"status": result["status"], "layers": [], "display": None}
                handle = sign_recipe(descriptor)
                layers.append({"id": kind, "tile_url": f"/api/earth-engine/tiles/{handle}/{{z}}/{{x}}/{{y}}"})
            result = {"status": "ready", "layers": layers}
        return {"status": result["status"],
                "layers": [{**layer, "id": layer["id"] + suffix, "attribution": attribution}
                           for layer in result["layers"]],
                "display": {"bounds": WORLD.copy(), "study_bounds": WORLD.copy(),
                            "scene_count": None, "acquisition_start": None, "acquisition_end": None}}

    def statistics(self, incident, window, refresh=False):
        key = digest([VERSION, incident["lon"], incident["lat"], window["start"], window["end"]])
        def compute():
            started = self.clock()
            try:
                result = self.provider.statistics(incident, window["start"], window["end"])
                LOG.info("Earth incident statistics prepared seconds=%.3f", self.clock() - started)
                return result
            except Exception:
                LOG.warning("Earth incident statistics unavailable")
                return None
        with self.lock:
            if refresh and key in self.stat_jobs and self.stat_jobs[key].done():
                del self.stat_jobs[key]
            if key not in self.stat_jobs:
                if sum(not item.done() for item in self.stat_jobs.values()) >= 8:
                    return "preparing", None
                self.stat_jobs[key] = self.stats.submit(compute)
            future = self.stat_jobs[key]
            self.stat_jobs.move_to_end(key)
            for old in list(self.stat_jobs):
                if len(self.stat_jobs) <= 64:
                    break
                if self.stat_jobs[old].done():
                    del self.stat_jobs[old]
        if not future.done():
            return "preparing", None
        value = future.result()
        return ("ready" if value is not None else "unavailable"), value

    def _descriptor(self, handle):
        if handle.startswith("g."):
            descriptor = decode_recipe(handle)
        elif re.fullmatch(r"g[a-f0-9]{64}", handle):
            raw = self.disk.read(f"recipes/{handle}.json")
            if raw is None:
                raise KeyError(handle)
            descriptor = json.loads(raw)
            if "g" + digest(descriptor) != handle:
                raise KeyError(handle)
        else:
            raise KeyError(handle)
        spec = descriptor["recipe"]
        if spec["project"] != self.project or spec["version"] != VERSION:
            raise KeyError(handle)
        return descriptor, spec, "g" + digest(descriptor)

    def fetch_tile(self, handle, z, x, y):
        descriptor, spec, disk_key = self._descriptor(handle)
        if not (0 <= z <= 18 and 0 <= x < 2**z and 0 <= y < 2**z):
            raise ValueError("Invalid tile coordinates")
        name = f"tiles/{disk_key}-{z}-{x}-{y}.tile"
        cached = self.disk.read(name)
        if cached and valid_image(cached):
            return cached
        from concurrent.futures import Future
        with self.lock:
            pending = self.pending_tiles.get(name)
            producer = pending is None
            if producer:
                cached = self.disk.read(name)
                if cached and valid_image(cached):
                    return cached
                pending = self.pending_tiles[name] = Future()
        if not producer:
            return pending.result()
        try:
            for attempt in range(2):
                future = self.job(spec)
                if future is None:
                    raise RuntimeError("Image preparation busy")
                resource = future.result()
                if resource["status"] != "ready":
                    raise RuntimeError("Image unavailable")
                try:
                    url = resource["urls"][descriptor["layer"]].format(z=z, x=x, y=y)
                    for retry in range(3):
                        try:
                            data = self.provider.fetch_tile(url)
                            break
                        except Exception as exc:
                            if retry == 2 or http_status(exc) not in (429, 500, 502, 503, 504):
                                raise
                            sleep(.15 * 2**retry)
                    if not valid_image(data):
                        raise ValueError("Invalid tile image")
                    break
                except Exception as exc:
                    # Renew a rejected/expired Google resource once, not every transient error.
                    code = http_status(exc)
                    if attempt or code not in (400, 404, 410):
                        raise
                    with self.lock:
                        if self.jobs.get(digest(spec)) is future:
                            del self.jobs[digest(spec)]
            if len(data) <= 4 * 1024 * 1024:
                self.disk.write(name, data)
            pending.set_result(data)
            return data
        except Exception as exc:
            pending.set_exception(exc)
            raise
        finally:
            with self.lock:
                self.pending_tiles.pop(name, None)
