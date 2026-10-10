"""Focused regressions for the nonblocking, worldwide imagery path."""
from threading import Event
from time import monotonic, sleep

from app.earth_engine import EarthEngineService

INCIDENT = dict(id="INC-test", lat=3.5, lon=113.0, observed_at="2025-07-29T05:30:00Z")
PNG = b"\x89PNG\r\n\x1a\nfixture"


class Provider:
    def __init__(self):
        self.calls, self.fetches = [], 0
        self.release = Event()
        self.release.set()

    def imagery(self, start, end):
        self.calls.append((start, end))
        assert self.release.wait(2)
        return {kind: f"https://earthengine.googleapis.com/v1/projects/p/maps/{kind}/tiles/{{z}}/{{x}}/{{y}}"
                for kind in ("rgb", "ndvi")}

    def statistics(self, incident, start, end):
        return dict(scene_count=2, acquisition_start=start, acquisition_end=end,
                    ndvi_mean=.6, valid_coverage_pct=80)

    def fetch_tile(self, url):
        self.fetches += 1
        return PNG


def ready(service, mode="context"):
    deadline = monotonic() + 2
    while monotonic() < deadline:
        value = service.describe(INCIDENT, 30, mode=mode, background=True)
        if value["status"] == "ready" and (mode != "compare" or value["comparison"]["status"] == "ready"):
            return value
        sleep(.005)
    raise AssertionError("imagery job did not finish")


def test_manifest_returns_without_waiting_for_generation(tmp_path):
    p = Provider(); p.release.clear()
    s = EarthEngineService("p", p, cache_dir=tmp_path)
    try:
        start = monotonic()
        result = s.describe(INCIDENT, 30, background=True)
        assert monotonic() - start < .1
        assert result["status"] == "preparing"
    finally:
        p.release.set(); s.close()


def test_compare_and_worldwide_panning_reuse_before_resource(tmp_path):
    p = Provider(); s = EarthEngineService("p", p, cache_dir=tmp_path)
    try:
        before = ready(s)
        comparison = ready(s, "compare")
        assert len(p.calls) == 2, "before must be prepared once, after once"
        assert comparison["layers"][0]["tile_url"] == before["layers"][0]["tile_url"]
        abroad = s.describe(INCIDENT, 30, bbox="-180,-80,180,80", mode="compare", background=True)
        assert abroad["layers"] == comparison["layers"]
        assert abroad["bounds"] == [-180, -85.051129, 180, 85.051129]
        assert len(p.calls) == 2
    finally:
        s.close()


def test_disk_tiles_survive_restart_without_google_request(tmp_path):
    p = Provider(); s = EarthEngineService("p", p, cache_dir=tmp_path)
    try:
        handle = ready(s)["layers"][0]["tile_url"].split("/")[4]
        assert s.fetch_tile(handle, 10, 645, 439) == PNG
    finally:
        s.close()
    next_provider = Provider(); restarted = EarthEngineService("p", next_provider, cache_dir=tmp_path)
    try:
        assert restarted.fetch_tile(handle, 10, 645, 439) == PNG
        assert next_provider.fetches == 0 and next_provider.calls == []
        assert restarted.fetch_tile(handle, 10, 646, 439) == PNG
        assert len(next_provider.calls) == 1
    finally:
        restarted.close()


def test_slow_statistics_do_not_delay_ready_imagery(tmp_path):
    p = Provider(); release = Event()
    def stats(*args):
        assert release.wait(2)
        return {"ndvi_mean": .6}
    p.statistics = stats
    s = EarthEngineService("p", p, cache_dir=tmp_path)
    try:
        result = ready(s)
        assert result["analysis"] is None
        assert result["analysis_status"] == "preparing"
    finally:
        release.set(); s.close()


def test_expired_map_resource_renews_without_changing_public_tile_url(tmp_path):
    clock = [0]
    p = Provider(); s = EarthEngineService("p", p, clock=lambda: clock[0], cache_dir=tmp_path)
    try:
        original = ready(s)["layers"][0]["tile_url"]
        handle = original.split("/")[4]
        clock[0] = 1201
        assert s.fetch_tile(handle, 10, 645, 439) == PNG
        assert ready(s)["layers"][0]["tile_url"] == original
        assert len(p.calls) == 2
    finally:
        s.close()


def test_wrapped_google_expiry_renews_once(tmp_path):
    from types import SimpleNamespace
    class Rejected(Exception):
        resp = SimpleNamespace(status=404)
    p = Provider()
    def fetch(url):
        p.fetches += 1
        if p.fetches == 1:
            try:
                raise Rejected("private upstream resource")
            except Rejected as cause:
                raise RuntimeError("SDK wrapper") from cause
        return PNG
    p.fetch_tile = fetch
    s = EarthEngineService("p", p, cache_dir=tmp_path)
    try:
        handle = ready(s)["layers"][0]["tile_url"].split("/")[4]
        assert s.fetch_tile(handle, 10, 645, 439) == PNG
        assert p.fetches == 2 and len(p.calls) == 2
    finally:
        s.close()


def test_transient_tile_failure_retries_without_rebuilding_recipe(tmp_path, monkeypatch):
    from app import imagery_delivery
    monkeypatch.setattr(imagery_delivery, "sleep", lambda _: None)
    class Busy(Exception):
        code = 503
    p = Provider()
    def fetch(url):
        p.fetches += 1
        if p.fetches < 3:
            raise Busy("temporarily busy")
        return PNG
    p.fetch_tile = fetch
    s = EarthEngineService("p", p, cache_dir=tmp_path)
    try:
        handle = ready(s)["layers"][0]["tile_url"].split("/")[4]
        assert s.fetch_tile(handle, 10, 645, 439) == PNG
        assert p.fetches == 3 and len(p.calls) == 1
    finally:
        s.close()


def test_restart_manifest_exposes_saved_recipes_while_google_warms(tmp_path):
    p = Provider(); s = EarthEngineService("p", p, cache_dir=tmp_path)
    previous = ready(s); s.close()
    warming = Provider(); warming.release.clear()
    restarted = EarthEngineService("p", warming, cache_dir=tmp_path)
    try:
        value = restarted.describe(INCIDENT, 30, background=True)
        assert value["status"] == "ready", "cached imagery must be usable before Google reconnects"
        assert value["layers"] == previous["layers"]
    finally:
        warming.release.set(); restarted.close()


def test_real_sdk_worldwide_recipe_has_no_clip_or_blocking_statistics(monkeypatch):
    import ee
    from ee.apitestcase import GetAlgorithms
    from app.earth_engine import EarthEngineProvider
    monkeypatch.setattr(ee.data, "_install_cloud_api_resource", lambda: None)
    monkeypatch.setattr(ee.data, "getAlgorithms", GetAlgorithms)
    ee.Reset(); ee.Initialize(None, "", project="offline-test")
    graphs = []
    def forbidden(_):
        raise AssertionError("statistics must never block imagery preparation")
    def create(params):
        graphs.append(params["image"].serialize())
        return {"tile_fetcher": ee.data.TileFetcher("https://earthengine.googleapis.com/v1/projects/p/maps/m/tiles/{z}/{x}/{y}", "projects/p/maps/m")}
    monkeypatch.setattr(ee.data, "computeValue", forbidden)
    monkeypatch.setattr(ee.data, "getMapId", create)
    provider = EarthEngineProvider("offline-test"); provider.ee = ee
    try:
        assert set(provider.imagery("2025-06-29T05:30:00Z", INCIDENT["observed_at"])) == {"rgb", "ndvi"}
        assert len(graphs) == 2
        assert "Image.clip" not in " ".join(graphs)
        assert "GeometryConstructors.Rectangle" not in " ".join(graphs)
        assert "Image.normalizedDifference" in graphs[1] and "Image.updateMask" in graphs[1]
    finally:
        ee.Reset()
