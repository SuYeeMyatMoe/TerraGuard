# Earth Engine — Earth View

## Stable imagery correction — 2026-10-10

The map installs its basemap and scientific background on `style.load`, before
the first tile frame. Dated sources can also arrive before map initialization
finishes; basemap insertion explicitly places both backgrounds below those
sources. Previously the backgrounds could be added above RGB/NDVI, hiding the
loaded pixels when zoom crossed the detail threshold, including in comparison.

The after renderer is created on the first comparison request and retained for
later toggles. Closing comparison hides its dated sources and stops camera
updates. Only the selected RGB or NDVI source is visible on each active map;
inactive layers keep their sources but do not fetch speculative tiles. This
reduces competing downloads during navigation and comparison. A first visit to
a layer or location still waits for the upstream imagery provider.

Verification on `codex/earth-view-stable-imagery`: 33 frontend tests, full ESLint,
TypeScript and production build passed. A regression test first reproduced late
basemap insertion covering dated imagery, then passed after the correction.
Live browser checks rendered actual Sentinel-2 RGB, NDVI and before/after tiles,
confirmed one renderer before comparison, correct raster/background ordering,
aligned comparison cameras, and retained but inactive after sources on close.

Earth View opens with a worldwide, fixed-URL Esri World Imagery basemap. Panning/zooming never runs Earth Engine. Selecting NDVI or changing the historical period/comparison automatically loads dated Sentinel-2 imagery for the current detailed viewport. The prominent Analyze button is removed; Update imagery remains an optional retry/new-viewport action. The backend runs Earth Engine; MapLibre renders its raster layers above the separate global background. A Google Maps browser key is unnecessary. Operational Supabase records, local model/detection files and the 3D simulation are independent of this feature.

## إعداد الاتصال محليًا

1. افتح [إعداد Earth Engine في Google Cloud](https://console.cloud.google.com/earth-engine)، وسجّل بحساب Google. أنشئ مشروعًا أو اختر مشروعًا تملكه.
2. فعّل Earth Engine API وسجّل المشروع للاستخدام التجاري أو غير التجاري حسب طبيعة استخدامك الفعلية. الاستخدام غير التجاري يحتاج التحقق من الأهلية؛ لا تفترض أنه مناسب لكل مشروع. [متطلبات الوصول](https://developers.google.com/earth-engine/guides/access).
3. انسخ **Project ID** (معرّف نصي، وليس اسم العرض أو رقم المشروع) إلى `backend/.env`:

   ```env
   GEE_PROJECT=your-project-id
   GEE_SERVICE_ACCOUNT_JSON=
   ```

4. من مجلد backend نفّذ الأمر التالي وأكمل تسجيل الدخول والتفويض في صفحة Google التي تظهر:

   ```bash
   .venv/bin/earthengine authenticate --auth_mode=localhost --scopes=https://www.googleapis.com/auth/earthengine.readonly
   ```

   هذا تفويض لحساب Google على جهاز التطوير، ولا يضيف صفحة تسجيل دخول إلى TerraGuard. لا ترسل ملف الاعتماد أو الرموز في المحادثة، ولا تضفها إلى Git.

5. تحقّق من الاتصال:

   ```bash
   .venv/bin/python -m app.check_earth_engine
   ```

   النجاح يعرض `Earth Engine connected; Sentinel-2 collection access verified.` ثم أعد تشغيل الباكند. افتح Earth View، قرّب أي موقع ثم اختر Vegetation · NDVI أو غيّر الفترة/عرض قبل وبعد؛ التحليل يبدأ تلقائيًا. اختيار الحادث يحدد تاريخ التحليل فقط. أزرار Satellite وVegetation · NDVI تغيّر الطبقة، والقائمة تحدد 14/30/60 يومًا قبل الحادث.

## Deployment

For a backend service account locally, set `GEE_SERVICE_ACCOUNT_JSON` to a key-file path outside the repository (relative paths resolve from backend). On Vercel there is no key file: set `GEE_SERVICE_ACCOUNT_JSON_B64` (base64 of the JSON) or put the JSON object in `GEE_SERVICE_ACCOUNT_JSON`, plus `GEE_TILE_SIGNING_SECRET` so tile handles work across serverless instances. Tile cache uses `/tmp` on Vercel. See [DEPLOY.md](DEPLOY.md). The configured Cloud project must be registered for Earth Engine, with the API enabled and the account granted appropriate Earth Engine and Service Usage permissions. Application Default Credentials also work when no key file is specified. See [authentication](https://developers.google.com/earth-engine/guides/auth) and [service accounts](https://developers.google.com/earth-engine/guides/service_account).

Choose account/usage configuration according to [Earth Engine plans](https://earthengine.google.com/commercial/). Commercial usage can incur charges. This implementation never creates a Cloud project, selects eligibility or enables billing automatically.

## Images and analysis

- Dataset: [COPERNICUS/S2_SR_HARMONIZED](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED), surface reflectance; RGB B4/B3/B2 and NDVI B8/B4 (native 10 m bands).
- Scientific display imagery is a rectangle captured when NDVI or a historical control is selected (or Update imagery is pressed), anywhere in the world. Viewport bounds are buffered and quantized. Requests wider/taller than 8 degrees return 422 with a zoom-in instruction; this is a computation limit, not a global-navigation restriction. Completed scientific overlays keep their geographic footprint while the camera moves; request a new view explicitly. The overlay and comparison renderer hide when the viewport is outside that footprint or at world scales, with an explanatory notice; the global background remains visible. Date-line viewports normalize world copies and clip the analysis to one side of ±180°; the background wraps continuously. The global Mercator basemap shows latitudes up to about ±85°, while Sentinel-2 availability varies by location. Calls without bbox retain a small rectangular extent around the incident. The separate blue 1 km analysis circle marks the statistics region, sampled at 20 m; it is not a fire perimeter. Before imagery ends at the exact incident observation timestamp, exclusive.
- [Cloud Score+](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_CLOUD_SCORE_PLUS_V1_S2_HARMONIZED) is linked by `system:index`; only `cs_cdf ≥ 0.60` pixels remain. Missing QA is masked. Residual haze/clouds are possible.
- RGB uses median band reflectance. NDVI is calculated per acquisition and then composited by median. Scene dates/count describe all matching candidates, not a single photograph or guaranteed clear acquisitions at every pixel.
- Mean NDVI uses only valid composite pixels. Valid coverage estimates the fraction of the complete analysis buffer with a valid composite NDVI pixel. Low coverage is flagged; empty display collections return no_data with no layers. Fully masked incident statistics remain null/zero while usable viewport map resources can remain available. Clear pixels are not guaranteed at every point. Multi-date composites cannot establish an event's actual appearance at its timestamp.
- NDVI is not forest-cover percentage, forest-loss classification, burn severity or proof of fire. No Earth Engine values feed the prediction model, priority score or simulation. Current incidents are synthetic and remain labelled as such.
- NDVI colors use 11 evenly spaced stops over −1 to +1. Values 0–0.2 stay sandy/neutral, with increasing positive values becoming green. The old four-stop palette interpolated NDVI 0 to light green, misleadingly coloring bare ground. This correction changes visualization only, not index values, composites or statistics. The frontend legend uses the same stops. These are continuous index colors, not land-cover classes; negative NDVI does not uniquely identify water. [USGS](https://www.usgs.gov/special-topics/remote-sensing-phenology/science/ndvi-foundation-remote-sensing-phenology) explains that sand/bare rock commonly have very low values, and soil color also affects NDVI. Cloud gaps and reduced layer opacity reveal the separately dated basemap, whose colors are not NDVI.
  Verification on `codex/ndvi-color-scale`: both existing real-SDK graph cases now check low/high value color interpolation, and the existing panel test checks the legend and transparent-gap explanation. These three focused checks passed, as did component lint and the production build; no visual tests were run.
- Protected-area boundaries continue through the existing geospatial context, and are approximate unless separately extracted as WDPA polygons using `python -m ml.fetch_gee`. Activating satellite layers does not verify those boundaries.

## API and failure behavior

`GET /api/earth-engine` returns `not_configured` or `select_incident` based on configuration, without claiming live readiness. `GET /api/earth-engine/{id}?days=30` returns `ready`, `no_data`, `not_configured` or `unavailable`, plus the UTC window, analysis, display metadata, analysis_region, bounds and layers. Optional bbox=west,south,east,north is finite/ordered, worldwide and limited to an 8-degree span per dimension; invalid or excessively broad extents return 422. Optional mode=context|compare defaults to context. Compare adds a retrospective comparison window from observation time to min(observation+days, now UTC), independent analysis/display metadata, and rgb_after/ndvi_after when available. After failure preserves usable before imagery. Both extent and mode participate in cache identity. Missing credentials and provider failures are explicit; no invented imagery/statistics substitute for Earth Engine output.

Responses contain only same-origin `/api/earth-engine/tiles/{handle}/{z}/{x}/{y}` URLs. The backend maps random handles to validated HTTPS Earth Engine resources, uses the SDK's authenticated tile transport and never exposes OAuth tokens, service-account keys or upstream map URLs. Coordinates are bounded to zoom 0–18; handles expire after 20 minutes, with 128 handles maximum. Metadata caches 64 incident/window/extent/mode queries for 10 minutes; explicit Refresh imagery requests use `refresh=true` to recreate map handles. Cache hits also check that their handles remain valid after eviction. The frontend caches up to 8 successful views for 8 minutes, deduplicates identical pending requests and discards stale results on incident/window changes. There is no automatic background refresh or viewport re-analysis. Unchanged map resources retain their loaded source/tiles; ordinary navigation uses one rendering map, with the second created only for an active, loaded comparison. Maps and caches are process-local; after a backend restart use Refresh imagery. SDK deadlines are 60 seconds per remote call with retries disabled. Browser metadata requests time out after 5 minutes (context) or 9 minutes (compare); the Next.js rewrite proxy allows 9 minutes, avoiding its default 30-second cutoff. Multiple provider calls can take time. Pending obsolete browser requests are aborted; stale responses cannot replace the current incident/window/extent/mode. Cached metadata bypasses unrelated generation work. A separate generation lock keeps existing tile lookups available during a refresh. Tile bytes are cached for 10 minutes in a 32 MiB / 512-entry LRU cache; concurrent identical tiles share one upstream fetch. Completed cached tiles remain usable during transient provider failures. As with the existing local demo, deploy the API behind your intended access controls before public use.

## Verification status

Offline tests compile real Earth Engine expressions using bundled SDK algorithm signatures and replace remote evaluation/map creation. They verify cloud masking, historical filtering, NDVI, no-data behavior, handles/TTL and authenticated tile routing. A cold-initialization regression test retains real SDK transport initialization: setDeadline must run after Initialize creates the requests session.

Live connection verified on 2026-10-10 using project `terraguard-earth-engine`, registered for noncommercial academic use on the Community Tier. Read-only OAuth credentials are stored locally outside the repository. The connection checker accessed the Sentinel-2 collection successfully. Earth View incident `INC-20250729-B`, 30-day window, returned 16 scenes (2025-07-01 to 2025-07-29), mean NDVI 0.548 and 100% valid coverage. Both RGB and NDVI center tiles were verified as actual raster responses through the frontend proxy, and both layers rendered in the browser. Other incidents/windows can still have cloud gaps or provider timeouts; Refresh imagery retries failed requests.

## Map controls

The global satellite basemap loads without Earth Engine credentials or a Google Maps key. Its imagery has mixed acquisition dates and must not be interpreted as the incident replay date. [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) supplies fixed worldwide raster URLs, with source attribution shown in the map. Roads and place names come from OpenFreeMap/OpenStreetMap.

Go to a location accepts latitude/longitude and World view zooms out. Choosing an incident flies to its position; status/audit updates do not recenter the camera.

Satellite switches to the available scientific RGB layer without recomputing. Selecting Vegetation · NDVI captures the current viewport and automatically requests analysis (cached identical queries are reused). View selects before imagery or retrospective before/after; changing the window or comparison mode automatically captures and loads that viewport. A choice made before map load waits for the first viewport once; subsequent movement never replaces the captured request. Overly broad views show the zoom-in instruction; after zooming, select NDVI again or use Update imagery. When the selected incident changes during an active analysis, the captured extent is reused with that incident’s date and statistics; moving elsewhere still requires a new control choice or Update imagery. The keyboard-accessible divider reveals before on the left and after on the right with one synchronized camera and shared incident overlays. Acquisition dates, candidate counts and separate 1 km clear-coverage statistics identify each period. Without a selected incident, the first replay incident supplies the historical cutoff for overview imagery; incident statistics and analysis boundary are hidden.

Map layers independently toggle the global basemap, dated scientific overlay, OpenStreetMap roads/place labels, incident markers, context hotspots, protected areas and the blue analysis boundary. Roads/labels sit above imagery; scientific cloud gaps reveal the separately dated basemap. Incident detections and protected-area demo data still belong to the existing regional replay; global browsing does not invent incidents in other countries. Incident NDVI/coverage statistics remain in the selected incident’s 1 km buffer, even when the viewport is elsewhere.

Measure distance / area opens local drawing tools. Click points on the map and Finish; Undo point and Clear edit/reset the drawing. Incident marker selection is disabled during drawing. Distance is a geodesic path in km; simple polygon areas appear in ha or km². Crossing/degenerate boundaries are rejected. These approximate spherical measurements do not detect a fire perimeter or provide road routing.

Earth Engine may return PNG or JPEG tiles; the proxy checks image signatures and sends the matching MIME type. Future scientific layer proposals are in [EARTH_VIEW_LAYERS.md](EARTH_VIEW_LAYERS.md).

### Map tools verification — 2026-10-10

On `codex/earth-view-map-tools`, 87 backend tests and 19 frontend tests passed; frontend lint and production build passed. Live incident B with bbox `[110.7,2.2,113.1,3.5]`, 30 days and compare mode returned before/after ready: 82/83 viewport candidate scenes, incident NDVI 0.548/0.559, and 99.4% 1 km valid coverage in both windows. All four RGB/NDVI before/after center tiles decoded as actual PNG/JPEG signatures through the frontend proxy with matching MIME types. Broader viewport candidates differ from incident candidates; the separate statistics stay incident-scoped.

Browser checks exercised comparison, keyboard divider, layer toggles, incident boundary, geodesic distance (16.43 km for the drawn test path), area (87.31 km² for the drawn test triangle), undo/incomplete-boundary validation, clear, and the unchanged rendered 3D simulation. Map camera synchronization preserves asymmetric panel padding. Transient provider tile failures retain metadata/statistics and expose Refresh imagery; cloud holes remain transparent. Existing API/model/simulation behavior is independent of these display controls.

### Global browsing and performance verification — 2026-10-10

On `codex/global-earth-view-performance`, 89 backend tests and 24 frontend tests passed; frontend lint and production build passed. Regression coverage includes worldwide bounds, bounded analysis, metadata cache access during unrelated generation, tile cache expiry/eviction/concurrent reuse, controller request deduplication/cache, unchanged raster resource reuse, and overlay visibility outside the analyzed extent.

Before the user requested stopping visual tests, browser network checks recorded zero Earth Engine metadata requests during ordinary navigation, and satellite imagery rendered in San Francisco and Riyadh. Explicit San Francisco analysis with bbox `[-123,37.5,-121.8,38.1]` returned 70 before candidate scenes; explicit comparison returned 70/74 before/after candidates. Incident statistics remained tied to the regional replay incident. In a local tile request check, an uncached NDVI tile took approximately 1.36 seconds and its cached repeat approximately 0.002 seconds; this is an example, not a general latency guarantee.

Further visual tests were skipped at the user's request. Final checks cover the production build and automated tests; the latest camera-reporting and visibility optimizations were not retested visually. The 3D simulation, prediction model, incident files and operational database were not modified by this correction.

### Automatic control-driven analysis — 2026-10-10

On `codex/automatic-earth-analysis`, seven focused frontend checks passed: three new component/panel cases and four existing controller deduplication, cancellation, stale-response and retry cases. Changed components passed lint, and the production build passed. Initial global browsing and ordinary camera movement do not request analysis; NDVI, period and comparison choices do. Requests use the selected control values without being canceled by a settings-reset effect. Early selection waits for one initial viewport, and world-scale selections retain the zoom guard. No visual tests or broad backend test runs were performed for this frontend-only change.
