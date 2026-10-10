import importlib.util
import pytest

INCIDENT = dict(id="INC-test", lat=3.5, lon=113.0, observed_at="2025-07-29T05:30:00Z")


@pytest.fixture
def module():
    assert importlib.util.find_spec("app.earth_engine"), "Earth View imagery service is missing"
    from app import earth_engine
    return earth_engine


class Provider:
    def __init__(self, empty=False, fail=False):
        self.calls = []
        self.empty, self.fail = empty, fail

    def analyze(self, incident, start, end):
        self.calls.append((incident, start, end))
        if self.fail:
            raise RuntimeError("private credential contents must never reach the client")
        return dict(scene_count=0 if self.empty else 4, acquisition_start="2025-07-01T01:00:00Z",
                    acquisition_end="2025-07-28T01:00:00Z", ndvi_mean=None if self.empty else 0.63,
                    valid_coverage_pct=0 if self.empty else 73.2,
                    tiles={} if self.empty else {k: f"https://earthengine.googleapis.com/v1/projects/p/maps/{k}/tiles/{{z}}/{{x}}/{{y}}"
                                                for k in ("rgb", "ndvi")})


def test_missing_configuration_is_explicit_and_never_initializes_google(module):
    s = module.EarthEngineService(project="")
    result = s.describe(INCIDENT, 30)
    assert result["status"] == "not_configured"
    assert not result["available"] and result["layers"] == []


def test_historical_window_and_opaque_tiles(module):
    p = Provider()
    s = module.EarthEngineService(project="test-project", provider=p)
    result = s.describe(INCIDENT, 30)
    assert result["status"] == "ready"
    assert result["window"] == {"start": "2025-06-29T05:30:00Z", "end": INCIDENT["observed_at"], "days": 30}
    assert p.calls[0][1:] == (result["window"]["start"], result["window"]["end"])
    assert result["analysis"]["ndvi_mean"] == 0.63
    assert len(result["layers"]) == 2
    for layer in result["layers"]:
        assert layer["tile_url"].startswith("/api/earth-engine/tiles/")
        assert "googleapis" not in str(result)
        handle = layer["tile_url"].split("/")[4]
        assert s.tile_url(handle, 8, 3, 5).endswith("/tiles/8/3/5")


def test_no_images_has_no_fake_values(module):
    result = module.EarthEngineService(project="p", provider=Provider(empty=True)).describe(INCIDENT, 14)
    assert result["status"] == "no_data" and result["layers"] == []
    assert result["analysis"]["ndvi_mean"] is None


def test_provider_errors_are_sanitized_and_retryable(module):
    p = Provider(fail=True)
    s = module.EarthEngineService(project="p", provider=p)
    result = s.describe(INCIDENT, 30)
    assert result["status"] == "unavailable"
    assert "private" not in str(result)
    p.fail = False
    assert s.describe(INCIDENT, 30)["status"] == "ready"


def test_cache_and_map_handles_expire(module):
    now = [0]
    p = Provider()
    s = module.EarthEngineService(project="p", provider=p, clock=lambda: now[0])
    first = s.describe(INCIDENT, 30)
    assert first == s.describe(INCIDENT, 30) and len(p.calls) == 1
    now[0] = 601
    assert s.describe(INCIDENT, 30)["status"] == "ready" and len(p.calls) == 2
    now[0] = 1201
    handle = first["layers"][0]["tile_url"].split("/")[4]
    with pytest.raises(KeyError):
        s.tile_url(handle, 3, 1, 1)


def test_cache_regenerates_handles_evicted_by_other_incidents(module):
    provider = Provider()
    s = module.EarthEngineService(project="p", provider=provider)
    original = s.describe(INCIDENT, 30)
    for index in range(63):
        s.describe({**INCIDENT, "id": f"other-{index}"}, 30)
    s.describe(INCIDENT, 30)  # Touch metadata LRU without renewing handles.
    s.describe({**INCIDENT, "id": "new"}, 30)
    renewed = s.describe(INCIDENT, 30)
    assert renewed["layers"][0]["tile_url"] != original["layers"][0]["tile_url"]
    assert len(s.tiles) <= 128 and len(s.cache) <= 64


def test_manual_refresh_recreates_cached_maps(module):
    provider = Provider()
    s = module.EarthEngineService(project="p", provider=provider)
    first = s.describe(INCIDENT, 30)
    refreshed = s.describe(INCIDENT, 30, refresh=True)
    assert refreshed["layers"][0]["tile_url"] != first["layers"][0]["tile_url"]
    assert len(provider.calls) == 2


def test_tile_url_cannot_be_arbitrary_or_outside_grid(module):
    s = module.EarthEngineService(project="p", provider=Provider())
    for url in ("https://attacker.example/{z}", "http://earthengine.googleapis.com/{z}",
                "https://earthengine.googleapis.com.attacker.example/{z}"):
        with pytest.raises(ValueError):
            s.register_tile(url)
    handle = s.describe(INCIDENT, 30)["layers"][0]["tile_url"].split("/")[4]
    for coords in ((19, 0, 0), (3, 8, 1), (3, -1, 0)):
        with pytest.raises(ValueError):
            s.tile_url(handle, *coords)


def test_api_is_independent_of_database_and_validates_window(module, isolated_db, monkeypatch):
    from app.main import app
    from app import db
    from fastapi.testclient import TestClient
    monkeypatch.setattr(module, "service", lambda: module.EarthEngineService(project=""))
    def down():
        raise RuntimeError("database must not be used for imagery")
    monkeypatch.setattr(db, "status_map", down)
    with TestClient(app) as c:
        assert c.get("/api/earth-engine").json()["status"] == "not_configured"
        assert c.get("/api/earth-engine/INC-20250729-A").json()["status"] == "not_configured"
        assert c.get("/api/earth-engine/unknown").status_code == 404
        assert c.get("/api/earth-engine/INC-20250729-A?days=999").status_code == 422
        assert c.get("/api/earth-engine/tiles/unknown/8/0/0").status_code == 410


@pytest.mark.parametrize("clear", [True, False])
def test_real_sdk_graph_masks_clouds_and_reports_empty_pixels(module, monkeypatch, clear):
    # Compile actual EE expressions using the SDK's bundled algorithm signatures.
    # Only remote computation and map creation are replaced, never image methods.
    import ee
    from ee.apitestcase import GetAlgorithms
    monkeypatch.setattr(ee.data, "_install_cloud_api_resource", lambda: None)
    monkeypatch.setattr(ee.data, "getAlgorithms", GetAlgorithms)
    ee.Reset()
    ee.Initialize(None, "", project="offline-test")
    computations, maps = [], []
    def compute(value):
        computations.append(value.serialize())
        if len(computations) == 1:
            return {"count": 2, "first": 1751328000000, "last": 1753660800000}
        return {"ndvi": 0.6 if clear else None, "valid_fraction": 0.75 if clear else 0}
    def create_map(params):
        maps.append(params["image"].serialize())
        return {"tile_fetcher": ee.data.TileFetcher("https://earthengine.googleapis.com/v1/projects/p/maps/m/tiles/{z}/{x}/{y}", "projects/p/maps/m")}
    monkeypatch.setattr(ee.data, "computeValue", compute)
    monkeypatch.setattr(ee.data, "getMapId", create_map)
    provider = module.EarthEngineProvider("offline-test")
    provider.ee = ee
    try:
        result = provider.analyze(INCIDENT, "2025-06-29T05:30:00Z", INCIDENT["observed_at"])
        graph = " ".join(computations + maps)
        assert module.SENTINEL in graph and module.CLOUD_SCORE in graph
        assert "cs_cdf" in graph and "Image.updateMask" in graph
        assert "Image.normalizedDifference" in computations[-1]
        assert "B8" in computations[-1] and "B4" in computations[-1]
        assert "2025-07-29T05:30:00Z" in graph
        assert result["valid_coverage_pct"] == (75 if clear else 0)
        assert len(result["tiles"]) == (2 if clear else 0)
        assert len(maps) == (2 if clear else 0)
    finally:
        ee.Reset()


def test_tile_transport_uses_authenticated_sdk_map_resource(module):
    from types import SimpleNamespace
    calls = []
    class Fetcher:
        def __init__(self, url, resource):
            calls.append(resource)
        def fetch_tile(self, x, y, z):
            calls.append((x, y, z))
            return b"png"
    provider = module.EarthEngineProvider("p")
    provider.ee = SimpleNamespace(data=SimpleNamespace(TileFetcher=Fetcher))
    assert provider.fetch_tile("https://earthengine.googleapis.com/v1/projects/p/maps/m/tiles/8/3/5") == b"png"
    assert calls == ["projects/p/maps/m", (3, 5, 8)]


def test_tile_endpoint_proxies_bytes_and_hides_provider_failures(module, isolated_db, monkeypatch):
    from app.main import app
    from fastapi.testclient import TestClient
    provider = Provider()
    image = b"\x89PNG\r\n\x1a\n"
    provider.fetch_tile = lambda url: image
    s = module.EarthEngineService(project="p", provider=provider)
    monkeypatch.setattr(module, "service", lambda: s)
    with TestClient(app) as client:
        result = client.get("/api/earth-engine/INC-20250729-A").json()
        path = result["layers"][0]["tile_url"].format(z=8, x=0, y=0)
        response = client.get(path)
        assert response.content == image and response.headers["content-type"] == "image/png"
        def fail(url):
            raise RuntimeError("OAuth token and Google URL must not escape")
        provider.fetch_tile = fail
        response = client.get(path)
        assert response.status_code == 503 and "OAuth" not in response.text
