# Earth View exploration tools

User approved the six proposed improvements: continuous satellite imagery, roads/labels above imagery, visible analysis boundaries, before/after comparison, layer controls and distance/area measurement. Implement only Earth View on codex/earth-view-map-tools. Preserve backend incident/model/simulation files and Supabase operations. Additional scientific layers are recommendations, not new data ingestion in this change.

## Display and analysis

Earth Engine renders a rectangular viewport intersected with the existing study bounds [95,-4.5,119.5,7.5], rather than a 5 km circular clip. Expand/quantize the requested extent and debounce map move completion. Outside study coverage the reference map remains available with an explicit coverage label. Analysis still uses a separately filtered 1 km incident buffer at 20 m. Draw that circle with the label '1 km analysis radius'; never imply it is a fire perimeter. Road and place labels render above imagery. Hide/show imagery, roads/labels, incidents, context hotspots, protected areas and analysis boundary independently.

## API contract

Keep GET /api/earth-engine/{incident_id}, days=14|30|60 and refresh=true. Add bbox=west,south,east,north and mode=context|compare. Validate finite ordered coordinates and reject extents outside study bounds; intersect valid extents with study bounds. Cache identities include normalized extent and mode. No bbox preserves compatible incident-centered rectangular imagery.

Response retains existing status, bounds, analysis, window and layers. Layer IDs rgb/ndvi represent the historical pre-incident composite. Add optional display with bounds/study_bounds/scene_count/acquisition_start/acquisition_end, analysis_region with center/radius_m=1000, and comparison {status,reason,window,analysis,display}. Compare mode requests a separate post-incident window, starting at observation time and ending min(observation+days, now UTC), plus rgb_after/ndvi_after layers. A missing/failed after image never suppresses a usable before image. Before imagery is mandatory for comparison; post imagery is explicitly retrospective and never enters predictions or simulation. Acquisition counts/dates describe composite candidates; coverage statistics describe the 1 km analysis only.

## Frontend behavior

Use selected incident as reference; before selection use the first incident in the replay for a dated overview and hide incident-only statistics. Display images across the visible study area and update requests on settled viewport changes. Ignore stale viewport/mode responses as well as stale incident/window results. Keep useful current layers visible while refreshing the same incident/date/mode, then replace atomically. User changes of incident/date/mode clear incorrect old imagery.

Comparison uses synchronized cameras and a keyboard-accessible divider; before on the left, after on the right. Both sides preserve overlays. Display both acquisition ranges and the retrospective label. Full-screen map bounds and marker selection remain correct during comparison and measurement. No-data/errors are explicit, and retries work.

Distance uses a multi-point geodesic path; area uses a closed spherical polygon. Finish/undo/clear controls, visible vertices and geometry, appropriate km/ha/km² units. Reject self-intersecting or incomplete polygons; measurements are approximate map measurements, not extracted fire boundaries. Drawing temporarily consumes map clicks and suppresses incident selection. Drawing state never leaves the browser.

## Verification

Tests cover viewport validation/cache/stale responses, historical cutoff/post cutoff, partial after failures, real EE graph expressions including rectangular display vs separate analysis, map layer ordering and cleanup, geodesic measurement and invalid polygons. Run backend/frontend tests, lint/build, real authenticated metadata/PNG-JPEG tile requests and browser interactions. Save actual satellite/comparison/measurement screenshots. Review scope/secrets and commit locally without changing main.
