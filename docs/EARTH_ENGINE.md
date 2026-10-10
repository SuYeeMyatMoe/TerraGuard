# Earth Engine — Earth View

Earth View displays incident-focused Sentinel-2 satellite imagery and NDVI. The backend runs Earth Engine; MapLibre renders its raster layers. A Google Maps browser key is unnecessary. Operational Supabase records, local model/detection files and the 3D simulation are independent of this feature.

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
   .venv/bin/earthengine authenticate
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
- A 5 km buffer supplies visible imagery. Statistics use a 1 km buffer and 20 m sampling. A historical window ends at the exact incident observation timestamp, exclusive; future acquisitions are excluded.
- [Cloud Score+](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_CLOUD_SCORE_PLUS_V1_S2_HARMONIZED) is linked by `system:index`; only `cs_cdf ≥ 0.60` pixels remain. Missing QA is masked. Residual haze/clouds are possible.
- RGB uses median band reflectance. NDVI is calculated per acquisition and then composited by median. Scene dates/count describe all matching candidates, not a single photograph or guaranteed clear acquisitions at every pixel.
- Mean NDVI uses only valid composite pixels. Valid coverage estimates the fraction of the complete analysis buffer with a valid composite NDVI pixel. Low coverage is flagged; empty collections and fully masked regions return no_data with no layers. Multi-date composites cannot establish an event's actual appearance at its timestamp.
- NDVI is not forest-cover percentage, forest-loss classification, burn severity or proof of fire. No Earth Engine values feed the prediction model, priority score or simulation. Current incidents are synthetic and remain labelled as such.
- Protected-area boundaries continue through the existing geospatial context, and are approximate unless separately extracted as WDPA polygons using `python -m ml.fetch_gee`. Activating satellite layers does not verify those boundaries.

## API and failure behavior

`GET /api/earth-engine` returns `not_configured` or `select_incident` based on configuration, without claiming live readiness. `GET /api/earth-engine/{id}?days=30` returns `ready`, `no_data`, `not_configured` or `unavailable`, plus the UTC window, analysis, bounds and layers. Missing credentials and provider failures are explicit; no invented imagery/statistics substitute for Earth Engine output.

Responses contain only same-origin `/api/earth-engine/tiles/{handle}/{z}/{x}/{y}` URLs. The backend maps random handles to validated HTTPS Earth Engine resources, uses the SDK's authenticated tile transport and never exposes OAuth tokens, service-account keys or upstream map URLs. Coordinates are bounded to zoom 0–18; handles expire after 20 minutes, with 128 handles maximum. Metadata caches 64 incident/window queries for 10 minutes; explicit Refresh imagery requests use `refresh=true` to recreate map handles. Cache hits also check that their handles remain valid after eviction. The frontend renews requests every 9 minutes and discards stale results on incident/window changes. Maps and caches are process-local; after a backend restart use Refresh imagery. SDK deadlines are 20 seconds per request with retries disabled. Browser requests time out after 120 seconds. As with the existing local demo, deploy the API behind your intended access controls before public use.

## Verification status

Offline tests compile real Earth Engine expressions using bundled SDK algorithm signatures and replace remote evaluation/map creation. They verify cloud masking, historical filtering, NDVI, no-data behavior, handles/TTL and authenticated tile routing. They cannot prove account permissions or actual scene/tile retrieval. The account has no registered project or credentials yet, so live imagery verification remains pending.
