import importlib.util
import json
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

    def analyze(self, incident, start, end, display_bounds=None):
        self.calls.append((incident, start, end))
        if self.fail:
            raise RuntimeError("private credential contents must never reach the client")
        return dict(scene_count=0 if self.empty else 4, acquisition_start="2025-07-01T01:00:00Z",
                    acquisition_end="2025-07-28T01:00:00Z", ndvi_mean=None if self.empty else 0.63,
                    valid_coverage_pct=0 if self.empty else 73.2,
                    display=dict(bounds=display_bounds, study_bounds=[95, -4.5, 119.5, 7.5],
                                 scene_count=0 if self.empty else 4, acquisition_start=start, acquisition_end=end),
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


def test_api_is_independent_of_database_and_validates_window(module, isolated_db, monkeypatch, current_incident_id):
    from app.main import app
    from app import records
    from fastapi.testclient import TestClient
    monkeypatch.setattr(module, "service", lambda: module.EarthEngineService(project=""))
    def down():
        raise RuntimeError("database must not be used for imagery")
    monkeypatch.setattr(records.get(), "status_map", down)
    with TestClient(app) as c:
        assert c.get("/api/earth-engine").json()["status"] == "not_configured"
        assert c.get(f"/api/earth-engine/{current_incident_id}").json()["status"] == "not_configured"
        assert c.get("/api/earth-engine/unknown").status_code == 404
        assert c.get(f"/api/earth-engine/{current_incident_id}?days=999").status_code == 422
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
            metadata = {"count": 2, "first": 1751328000000, "last": 1753660800000}
            return {"analysis": metadata, "display": {**metadata, "count": 7}}
        return {"ndvi": 0.6 if clear else None, "valid_fraction": 0.75 if clear else 0}
    def create_map(params):
        maps.append(params["image"].serialize())
        return {"tile_fetcher": ee.data.TileFetcher("https://earthengine.googleapis.com/v1/projects/p/maps/m/tiles/{z}/{x}/{y}", "projects/p/maps/m")}
    monkeypatch.setattr(ee.data, "computeValue", compute)
    monkeypatch.setattr(ee.data, "getMapId", create_map)
    provider = module.EarthEngineProvider("offline-test")
    provider.ee = ee
    try:
        result = provider.analyze(INCIDENT, "2025-06-29T05:30:00Z", INCIDENT["observed_at"],
                                  display_bounds=[112, 3, 114, 4])
        graph = " ".join(computations + maps)
        assert module.SENTINEL in graph and module.CLOUD_SCORE in graph
        assert "cs_cdf" in graph and "Image.updateMask" in graph
        assert "Image.normalizedDifference" in computations[-1]
        assert "B8" in computations[-1] and "B4" in computations[-1]
        assert "2025-07-29T05:30:00Z" in graph
        assert result["valid_coverage_pct"] == (75 if clear else 0)
        assert result["scene_count"] == 2 and result["display"]["scene_count"] == 7
        assert result["display"]["bounds"] == [112, 3, 114, 4]
        assert "GeometryConstructors.Rectangle" in maps[0] and '"geodesic": {"constantValue": false}' in maps[0]
        assert "5000" not in graph
        # Statistics expression never includes the viewport rectangle: it filters
        # and clips independently to the 1 km incident buffer at 20 m resolution.
        assert "Geometry.buffer" in computations[-1] and '"distance": {"constantValue": 1000}' in computations[-1]
        assert "GeometryConstructors.Rectangle" not in computations[-1]
        assert '"scale": {"constantValue": 20}' in computations[-1]
        assert len(result["tiles"]) == 2
        assert len(maps) == 2
        # Check the real map's color ramp, not the raw NDVI calculation: bare
        # soil values must stay neutral rather than looking like vegetation.
        visualization = next(v['functionInvocationValue']['arguments']
                             for v in json.loads(maps[1])['values'].values()
                             if v.get('functionInvocationValue', {}).get('functionName') == 'Image.visualize')
        colors = visualization['palette']['constantValue']
        low, high = (visualization[k]['constantValue'] for k in ('min', 'max'))
        for value in (0, 0.1, 0.2, 0.6):
            position = (value - low) / (high - low) * (len(colors) - 1)
            index, fraction = int(position), position % 1
            left, right = (bytes.fromhex(colors[i].lstrip('#')) for i in (index, index + 1))
            red, green, _ = [a * (1 - fraction) + b * fraction for a, b in zip(left, right)]
            assert (green <= red) if value <= 0.2 else (green > red), f'Misleading NDVI color at {value}'
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


def test_provider_cold_initialization_sets_deadline_after_transport_exists(module, monkeypatch):
    import ee
    from ee.apitestcase import GetAlgorithms
    ee.Reset()
    monkeypatch.setattr(ee.data, "get_persistent_credentials", lambda: None)
    monkeypatch.setattr(ee.data, "getAlgorithms", GetAlgorithms)
    # Keep real SDK initialization and deadline installation; replace only HTTP.
    monkeypatch.setattr(ee._cloud_api_utils, "build_cloud_resource", lambda *a, **k: None)
    try:
        provider = module.EarthEngineProvider("offline-test")
        assert provider.initialize() is ee
        state = ee.data._get_state()
        assert state.requests_session is not None
        assert state.deadline_ms == 60000 and state.max_retries == 0
    finally:
        ee.Reset()


def test_tile_endpoint_proxies_bytes_and_hides_provider_failures(module, isolated_db, monkeypatch, current_incident_id):
    from app.main import app
    from fastapi.testclient import TestClient
    provider = Provider()
    image = b"\x89PNG\r\n\x1a\n"
    provider.fetch_tile = lambda url: image
    s = module.EarthEngineService(project="p", provider=provider)
    monkeypatch.setattr(module, "service", lambda: s)
    with TestClient(app) as client:
        result = client.get(f"/api/earth-engine/{current_incident_id}").json()
        path = result["layers"][0]["tile_url"].format(z=8, x=0, y=0)
        response = client.get(path)
        assert response.content == image and response.headers["content-type"] == "image/png"
        def fail(url):
            raise RuntimeError("OAuth token and Google URL must not escape")
        provider.fetch_tile = fail
        assert client.get(path).content == image  # completed tiles survive an upstream outage
        response = client.get(path.replace("/8/0/0", "/8/1/0"))
        assert response.status_code == 503 and "OAuth" not in response.text


@pytest.mark.parametrize('image,mime', [(b'\xff\xd8\xff\xe0jpeg', 'image/jpeg'),(b'not an image', None)])
def test_tile_endpoint_matches_actual_image_format(module, isolated_db, monkeypatch, image, mime, current_incident_id):
    from app.main import app
    from fastapi.testclient import TestClient
    provider = Provider()
    provider.fetch_tile = lambda url: image
    s = module.EarthEngineService('p', provider)
    monkeypatch.setattr(module, 'service', lambda: s)
    with TestClient(app) as c:
        layer = c.get(f'/api/earth-engine/{current_incident_id}').json()['layers'][0]
        response = c.get(layer['tile_url'].format(z=8,x=0,y=0))
        assert response.status_code == (200 if mime else 503)
        if mime:
            assert response.headers['content-type'] == mime


@pytest.mark.parametrize('bbox', [
    'nan,0,110,1', '95,0,inf,1', '95,0,110', '95,0,110,1,2',
    '110,0,95,1', '95,1,110,0', '95,0,95,1', '-181,0,110,1',
    '95,-91,110,1',
])
def test_viewport_rejects_invalid_bounds(module, bbox):
    with pytest.raises(ValueError):
        module.EarthEngineService('p', Provider()).describe(INCIDENT, 30, bbox=bbox)


def test_viewport_is_worldwide_and_separates_cache_identity(module):
    class Extents(Provider):
        def analyze(self, incident, start, end, display_bounds=None):
            self.bounds = display_bounds
            return super().analyze(incident, start, end, display_bounds)
    p = Extents()
    s = module.EarthEngineService('p', p)
    clipped = s.describe(INCIDENT, 30, bbox='94,-5,98,1')
    assert clipped['bounds'] == [94, -5, 98, 1]
    assert p.bounds == clipped['bounds']
    assert clipped['display']['bounds'] == clipped['bounds']
    assert clipped['analysis_region'] == {'center': [113, 3.5], 'radius_m': 1000}
    assert s.describe(INCIDENT, 30, bbox='94,-5,98,1') == clipped
    assert len(p.calls) == 1
    assert s.describe(INCIDENT, 30, bbox='112,3,114,4')['bounds'] == [112,3,114,4]
    assert len(p.calls) == 2
    s.describe(INCIDENT, 30, bbox='112,3,114,4', mode='compare')
    assert len(p.calls) == 4
    with pytest.raises(ValueError):
        s.describe(INCIDENT, 30, mode='future')


def test_compare_windows_are_retrospective_and_context_never_calls_after(module):
    from datetime import datetime, timezone
    p = Provider()
    s = module.EarthEngineService('p', p, utcnow=lambda: datetime(2025, 8, 1, tzinfo=timezone.utc))
    before = s.describe(INCIDENT, 30)
    assert len(p.calls) == 1 and 'comparison' not in before
    result = s.describe(INCIDENT, 30, mode='compare')
    assert result['comparison']['status'] == 'ready'
    assert result['comparison']['window'] == {'start': INCIDENT['observed_at'], 'end': '2025-08-01T00:00:00Z', 'days': 30}
    assert p.calls[-1][1:] == (INCIDENT['observed_at'], '2025-08-01T00:00:00Z')
    assert {layer['id'] for layer in result['layers']} == {'rgb','ndvi','rgb_after','ndvi_after'}
    assert result['analysis']['ndvi_mean'] == .63
    assert result['comparison']['analysis']['ndvi_mean'] == .63


@pytest.mark.parametrize('after', ['empty', 'fail'])
def test_after_failure_preserves_before_imagery(module, after):
    class After(Provider):
        def analyze(self, incident, start, end, display_bounds=None):
            self.empty = start == incident['observed_at'] and after == 'empty'
            self.fail = start == incident['observed_at'] and after == 'fail'
            return super().analyze(incident, start, end, display_bounds)
    result = module.EarthEngineService('p', After()).describe(INCIDENT, 30, mode='compare')
    assert result['status'] == 'ready' and result['available']
    assert len(result['layers']) == 2
    assert result['comparison']['status'] == ('no_data' if after == 'empty' else 'unavailable')
    assert result['comparison']['reason'] and 'private' not in str(result)


def test_future_incident_has_explicit_empty_after_window(module):
    from datetime import datetime, timezone
    p = Provider()
    result = module.EarthEngineService('p', p, utcnow=lambda: datetime(2025,7,29,5,30,tzinfo=timezone.utc)).describe(INCIDENT, 14, mode='compare')
    assert result['comparison']['status'] == 'no_data'
    assert 'post-incident' in result['comparison']['reason']
    assert len(p.calls) == 1 and len(result['layers']) == 2


def test_no_before_does_not_query_or_publish_comparison(module):
    p = Provider(empty=True)
    result = module.EarthEngineService('p', p).describe(INCIDENT, 14, mode='compare')
    assert result['status'] == 'no_data' and result['comparison']['status'] == 'no_data'
    assert len(p.calls) == 1 and not result['layers']


def test_api_validates_viewport_and_mode(module, isolated_db, monkeypatch, current_incident_id):
    from app.main import app
    from fastapi.testclient import TestClient
    monkeypatch.setattr(module, 'service', lambda: module.EarthEngineService('p', Provider()))
    with TestClient(app) as c:
        path = f'/api/earth-engine/{current_incident_id}'
        for query in ('bbox=nan,0,110,1', 'bbox=110,0,95,1', 'mode=future'):
            assert c.get(f'{path}?{query}').status_code == 422
        result = c.get(f'{path}?bbox=112,3,114,4&mode=compare').json()
        assert result['bounds'] == [112,3,114,4] and 'comparison' in result


def test_compare_full_window_stops_at_requested_horizon(module):
    from datetime import datetime, timezone
    p = Provider()
    s = module.EarthEngineService('p', p, utcnow=lambda: datetime(2026, 1, 1, tzinfo=timezone.utc))
    result = s.describe(INCIDENT, 14, mode='compare')
    assert result['comparison']['window']['end'] == '2025-08-12T05:30:00Z'
    assert p.calls[1][1:] == (INCIDENT['observed_at'], '2025-08-12T05:30:00Z')


def test_cache_regenerates_when_after_handle_is_evicted(module):
    p = Provider()
    s = module.EarthEngineService('p', p)
    first = s.describe(INCIDENT, 30, mode='compare')
    after_handle = next(layer for layer in first['layers'] if layer['id'] == 'rgb_after')['tile_url'].split('/')[4]
    del s.tiles[after_handle]
    refreshed = s.describe(INCIDENT, 30, mode='compare')
    assert len(p.calls) == 4 and refreshed['layers'][0]['tile_url'] != first['layers'][0]['tile_url']
    for layer in refreshed['layers']:
        assert s.tile_url(layer['tile_url'].split('/')[4], 8, 0, 0)


def test_tile_cache_preserves_recently_used_handles(module):
    s = module.EarthEngineService('p', Provider())
    url = 'https://earthengine.googleapis.com/v1/projects/p/maps/m/tiles/{z}/{x}/{y}'
    first = s.register_tile(url).split('/')[4]
    for _ in range(127):
        s.register_tile(url)
    s.tile_url(first, 8, 0, 0)
    s.register_tile(url)
    assert s.tile_url(first, 8, 0, 0)
    assert len(s.tiles) == 128


def test_existing_tiles_remain_available_during_viewport_computation(module):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    entered, release = Event(), Event()
    class Slow(Provider):
        def analyze(self, *args, **kwargs):
            entered.set()
            assert release.wait(3)
            return super().analyze(*args, **kwargs)
    service = module.EarthEngineService('p', Slow())
    handle = service.register_tile('https://earthengine.googleapis.com/v1/projects/p/maps/m/tiles/{z}/{x}/{y}').split('/')[4]
    with ThreadPoolExecutor(max_workers=2) as pool:
        generation = pool.submit(service.describe, INCIDENT, 30)
        assert entered.wait(1)
        lookup = pool.submit(service.tile_url, handle, 8, 0, 0)
        try:
            assert lookup.result(timeout=.2).endswith('/tiles/8/0/0')
        finally:
            release.set()
        assert generation.result()['status'] == 'ready'


@pytest.mark.parametrize('bad_path', [
    '/v1/projects/p/maps/m/extra/tiles/{z}/{x}/{y}',
    '/v1/projects/p/maps/../tiles/{z}/{x}/{y}',
    '/v1/projects/p/maps/m/tiles/{z}/{x}/{y}?token=private',
    '/v1/projects/p/maps/m/tiles/{z}/{x}/{y}#fragment',
])
def test_tile_registration_requires_exact_sdk_resource_path(module, bad_path):
    with pytest.raises(ValueError):
        module.EarthEngineService('p', Provider()).register_tile('https://earthengine.googleapis.com' + bad_path)


def test_global_display_preserves_incident_analysis_location(module):
    result = module.EarthEngineService('p', Provider()).describe(INCIDENT, 30, bbox='-123,37,-122,38')
    assert result['bounds'] == [-123,37,-122,38]
    assert result['analysis_region']['center'] == [113,3.5]
    with pytest.raises(ValueError, match='Zoom in'):
        module.EarthEngineService('p', Provider()).describe(INCIDENT, 30, bbox='-180,-80,180,80')


def test_cached_metadata_does_not_wait_for_unrelated_generation(module):
    from threading import Event, Thread
    started, release, returned = Event(), Event(), Event()
    class Slow(Provider):
        def analyze(self, incident, *args, **kwargs):
            if incident['id'] == 'other':
                started.set(); release.wait(2)
            return super().analyze(incident,*args,**kwargs)
    s=module.EarthEngineService('p',Slow())
    s.describe(INCIDENT,30)
    busy=Thread(target=lambda:s.describe({**INCIDENT,'id':'other'},30));busy.start()
    assert started.wait(1)
    reader=Thread(target=lambda:(s.describe(INCIDENT,30),returned.set()));reader.start()
    try:
        assert returned.wait(.2), 'cached metadata blocked behind a new computation'
    finally:
        release.set();busy.join();reader.join()


def test_tile_bytes_are_reused_and_bounded(module):
    class Tiles(Provider):
        def __init__(self): super().__init__();self.fetches=0
        def fetch_tile(self,url): self.fetches+=1;return b'\x89PNG\r\n\x1a\n'+b'x'*8
    now=[0];p=Tiles();s=module.EarthEngineService('p',p,clock=lambda:now[0])
    s.max_tile_bytes=20
    result=s.describe(INCIDENT,30)
    handle=result['layers'][0]['tile_url'].split('/')[4]
    assert s.fetch_tile(handle,2,1,1)==s.fetch_tile(handle,2,1,1)
    assert p.fetches==1
    s.fetch_tile(handle,2,2,1)
    s.fetch_tile(handle,2,1,1)
    assert p.fetches==3
    now[0]=601;s.fetch_tile(handle,2,1,1)
    assert p.fetches==4


def test_concurrent_duplicate_tiles_share_one_upstream_fetch(module):
    from threading import Event, Thread
    started, release=Event(),Event()
    class Tiles(Provider):
        fetches=0
        def fetch_tile(self,url):
            self.fetches+=1;started.set();release.wait(1);return b'\xff\xd8\xfftest'
    p=Tiles();s=module.EarthEngineService('p',p)
    handle=s.describe(INCIDENT,30)['layers'][0]['tile_url'].split('/')[4]
    output=[]
    threads=[Thread(target=lambda:output.append(s.fetch_tile(handle,2,1,1))) for _ in range(2)]
    threads[0].start();assert started.wait(1);threads[1].start()
    release.set()
    for t in threads:t.join()
    assert p.fetches==1 and len(output)==2 and output[0]==output[1]
