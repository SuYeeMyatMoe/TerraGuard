# Earth Engine in Earth View

The user requested Earth Engine for Earth View and explicitly excluded the existing 3D simulation. Implement incident-focused Sentinel-2 surface-reflectance RGB and NDVI layers, retaining incident markers, contextual detections, the road basemap and protected-area overlays. Cloud-masked satellite composites are supplementary context, not model inputs or evidence that synthetic incidents actually occurred.

## Design

Use the existing MapLibre renderer for Earth Engine raster overlays. This avoids requiring a separate Google Maps browser key. Compared with displaying an external Google Earth project, it preserves our incident interactions; compared with a regional satellite mosaic, a 5 km incident buffer bounds computation and makes imagery dates explicit. Statistics use a 1 km buffer and a fixed 20 m sampling scale. Users choose 14, 30 or 60 days preceding the selected incident's exact observation timestamp; no later imagery is used.

The backend alone initializes Earth Engine using GEE_PROJECT and local Earth Engine authentication, or GEE_SERVICE_ACCOUNT_JSON. Sentinel-2 SR is linked to Cloud Score+ by scene ID and masks pixels below cs_cdf 0.60. RGB is a median reflectance composite; NDVI is the median of per-scene NDVI. Return scene count, acquisition range, NDVI mean and valid-pixel coverage. Missing scenes or fully masked regions produce no_data, never invented imagery/statistics. NDVI is a vegetation index, not forest cover percentage or a fire classifier.

Return two short-lived raster handles; same-origin tile requests resolve only server-created URLs. Keep credentials, Google tile URLs and OAuth tokens off the frontend. Limit tile coordinates, cache lifetime/size and provider deadlines. Loading, configuration-needed, cloud gaps, upstream failure and retry are visible. Clear old layers immediately when incident/window changes; disregard stale responses and renew handles periodically. Display Copernicus/ESA attribution, composite dates and synthetic incident provenance.

The account has no Cloud project or local credentials. Finish implementation and offline integration verification, then provide account setup instructions and state that a live Earth Engine imagery test remains pending. No Supabase schema/data, detections/model files or simulation behavior changes are authorized by this feature.

## Verification

Tests cover unconfigured/error/no-data responses, historical cutoff, opaque tiles, coordinate and URL restrictions, bounded TTL cache, independent operational storage, cloud/NDVI graph construction and stale frontend requests. Run existing backend/frontend tests, lint, production build and browser checks. Live account activation requires user-owned Google Cloud registration and authentication.

Sources: https://developers.google.com/earth-engine/guides/auth ; https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED ; https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_CLOUD_SCORE_PLUS_V1_S2_HARMONIZED ; https://developers.google.com/earth-engine/apidocs/ee-image-getmapid
