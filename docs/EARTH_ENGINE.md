# Earth Engine — Earth View

Earth View displays viewport-following Sentinel-2 satellite imagery and NDVI. The backend runs Earth Engine; MapLibre renders its raster layers. A Google Maps browser key is unnecessary. Operational Supabase records, local model/detection files and the 3D simulation are independent of this feature.

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

   النجاح يعرض `Earth Engine connected; Sentinel-2 collection access verified.` ثم أعد تشغيل الباكند. افتح Earth View واختر حادثًا. أزرار Satellite وVegetation · NDVI تغيّر الطبقة، والقائمة تحدد 14/30/60 يومًا قبل الحادث.

## Deployment

For a backend service account, set `GEE_SERVICE_ACCOUNT_JSON` to a key-file path outside the repository (relative paths resolve from backend). The configured Cloud project must be registered for Earth Engine, with the API enabled and the account granted appropriate Earth Engine and Service Usage permissions. Application Default Credentials also work when no key file is specified. See [authentication](https://developers.google.com/earth-engine/guides/auth) and [service accounts](https://developers.google.com/earth-engine/guides/service_account).

Choose account/usage configuration according to [Earth Engine plans](https://earthengine.google.com/commercial/). Commercial usage can incur charges. This implementation never creates a Cloud project, selects eligibility or enables billing automatically.

## Images and analysis

- Dataset: [COPERNICUS/S2_SR_HARMONIZED](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED), surface reflectance; RGB B4/B3/B2 and NDVI B8/B4 (native 10 m bands).
- Display imagery is a rectangle covering the visible map within study bounds `[95,-4.5,119.5,7.5]`. Small pans reuse buffered, quantized extents; settled movements are debounced. Calls without bbox retain a small rectangular extent around the incident. The separate blue 1 km analysis circle marks the statistics region, sampled at 20 m; it is not a fire perimeter. Before imagery ends at the exact incident observation timestamp, exclusive.
- [Cloud Score+](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_CLOUD_SCORE_PLUS_V1_S2_HARMONIZED) is linked by `system:index`; only `cs_cdf ≥ 0.60` pixels remain. Missing QA is masked. Residual haze/clouds are possible.
- RGB uses median band reflectance. NDVI is calculated per acquisition and then composited by median. Scene dates/count describe all matching candidates, not a single photograph or guaranteed clear acquisitions at every pixel.
- Mean NDVI uses only valid composite pixels. Valid coverage estimates the fraction of the complete analysis buffer with a valid composite NDVI pixel. Low coverage is flagged; empty display collections return no_data with no layers. Fully masked incident statistics remain null/zero while usable viewport map resources can remain available. Clear pixels are not guaranteed at every point. Multi-date composites cannot establish an event's actual appearance at its timestamp.
- NDVI is not forest-cover percentage, forest-loss classification, burn severity or proof of fire. No Earth Engine values feed the prediction model, priority score or simulation. Current incidents are synthetic and remain labelled as such.
- Protected-area boundaries continue through the existing geospatial context, and are approximate unless separately extracted as WDPA polygons using `python -m ml.fetch_gee`. Activating satellite layers does not verify those boundaries.

## API and failure behavior

`GET /api/earth-engine` returns `not_configured` or `select_incident` based on configuration, without claiming live readiness. `GET /api/earth-engine/{id}?days=30` returns `ready`, `no_data`, `not_configured` or `unavailable`, plus the UTC window, analysis, display metadata, analysis_region, bounds and layers. Optional bbox=west,south,east,north is finite/ordered and clipped to study bounds; nonintersecting or invalid extents return 422. Optional mode=context|compare defaults to context. Compare adds a retrospective comparison window from observation time to min(observation+days, now UTC), independent analysis/display metadata, and rgb_after/ndvi_after when available. After failure preserves usable before imagery. Both extent and mode participate in cache identity. Missing credentials and provider failures are explicit; no invented imagery/statistics substitute for Earth Engine output.

Responses contain only same-origin `/api/earth-engine/tiles/{handle}/{z}/{x}/{y}` URLs. The backend maps random handles to validated HTTPS Earth Engine resources, uses the SDK's authenticated tile transport and never exposes OAuth tokens, service-account keys or upstream map URLs. Coordinates are bounded to zoom 0–18; handles expire after 20 minutes, with 128 handles maximum. Metadata caches 64 incident/window/extent/mode queries for 10 minutes; explicit Refresh imagery requests use `refresh=true` to recreate map handles. Cache hits also check that their handles remain valid after eviction. The frontend renews requests every 9 minutes and discards stale results on incident/window changes. Maps and caches are process-local; after a backend restart use Refresh imagery. SDK deadlines are 60 seconds per remote call with retries disabled. Browser metadata requests time out after 5 minutes (context) or 9 minutes (compare); the Next.js rewrite proxy allows 9 minutes, avoiding its default 30-second cutoff. Multiple provider calls can take time. Pending obsolete browser requests are aborted; stale responses cannot replace the current incident/window/extent/mode. A separate generation lock keeps existing tile lookups available during a refresh. As with the existing local demo, deploy the API behind your intended access controls before public use.

## Verification status

Offline tests compile real Earth Engine expressions using bundled SDK algorithm signatures and replace remote evaluation/map creation. They verify cloud masking, historical filtering, NDVI, no-data behavior, handles/TTL and authenticated tile routing. A cold-initialization regression test retains real SDK transport initialization: setDeadline must run after Initialize creates the requests session.

Live connection verified on 2026-10-10 using project `terraguard-earth-engine`, registered for noncommercial academic use on the Community Tier. Read-only OAuth credentials are stored locally outside the repository. The connection checker accessed the Sentinel-2 collection successfully. Earth View incident `INC-20250729-B`, 30-day window, returned 16 scenes (2025-07-01 to 2025-07-29), mean NDVI 0.548 and 100% valid coverage. Both RGB and NDVI center tiles were verified as actual raster responses through the frontend proxy, and both layers rendered in the browser. Other incidents/windows can still have cloud gaps or provider timeouts; Refresh imagery retries failed requests.

## Map controls

Satellite / Vegetation select RGB or NDVI. View selects before imagery or retrospective before/after; the keyboard-accessible divider reveals before on the left and after on the right with one synchronized camera and shared incident overlays. Acquisition dates, candidate counts and separate 1 km clear-coverage statistics identify each period. Without a selected incident, the first replay incident supplies the historical cutoff for overview imagery; incident statistics and analysis boundary are hidden.

Map layers independently toggle imagery, OpenStreetMap roads/place labels, incident markers, context hotspots, protected areas and the blue analysis boundary. Roads/labels sit above imagery; cloud gaps reveal the reference map. Outside study coverage the reference map remains available.

Measure distance / area opens local drawing tools. Click points on the map and Finish; Undo point and Clear edit/reset the drawing. Incident marker selection is disabled during drawing. Distance is a geodesic path in km; simple polygon areas appear in ha or km². Crossing/degenerate boundaries are rejected. These approximate spherical measurements do not detect a fire perimeter or provide road routing.

Earth Engine may return PNG or JPEG tiles; the proxy checks image signatures and sends the matching MIME type. Future scientific layer proposals are in [EARTH_VIEW_LAYERS.md](EARTH_VIEW_LAYERS.md).

### Map tools verification — 2026-10-10

On `codex/earth-view-map-tools`, 87 backend tests and 19 frontend tests passed; frontend lint and production build passed. Live incident B with bbox `[110.7,2.2,113.1,3.5]`, 30 days and compare mode returned before/after ready: 82/83 viewport candidate scenes, incident NDVI 0.548/0.559, and 99.4% 1 km valid coverage in both windows. All four RGB/NDVI before/after center tiles decoded as actual PNG/JPEG signatures through the frontend proxy with matching MIME types. Broader viewport candidates differ from incident candidates; the separate statistics stay incident-scoped.

Browser checks exercised comparison, keyboard divider, layer toggles, incident boundary, geodesic distance (16.43 km for the drawn test path), area (87.31 km² for the drawn test triangle), undo/incomplete-boundary validation, clear, and the unchanged rendered 3D simulation. Map camera synchronization preserves asymmetric panel padding. Transient provider tile failures retain metadata/statistics and expose Refresh imagery; cloud holes remain transparent. Existing API/model/simulation behavior is independent of these display controls.
