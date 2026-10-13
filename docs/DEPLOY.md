# Deploy TerraGuard on Vercel

TerraGuard ships as **one Vercel project with Services (Beta)**: the Next.js app in `frontend/` and the FastAPI app in `backend/`. Public `/api/*` traffic goes to FastAPI; everything else goes to Next.js. Preview and production stay on the same origin, so the frontend keeps using relative `/api` paths.

Function region is `sin1` (Singapore), next to Southeast Asia users and typical Supabase `ap-southeast-*` projects.

## 1. Import the GitHub repo

The Vercel project `terraguard` (team `su-yee-myat-moe-s-projects`) is already created and linked locally.

Connect Git so every push builds:

1. In the Vercel dashboard open the project → **Settings → Git**.
2. Install or authorize the [Vercel GitHub app](https://github.com/apps/vercel) for `SuYeeMyatMoe/TerraGuard`.
3. Connect that repository. Leave **Root Directory** as the repository root (do not set it to `frontend`).

Alternatively, from a machine that already has GitHub access: `npx vercel git connect --yes`.

Vercel reads [`vercel.json`](../vercel.json): frontend service + backend FastAPI service, with `/api/(.*)` rewritten to the backend. Do not set a framework override in the dashboard; Services owns detection. Production deploys from the production branch; every other push gets a preview URL.

## 2. Environment variables

Set these in the Vercel project (**Settings → Environment Variables**) for **Production** and **Preview**. All of them are backend-only. Never prefix them with `NEXT_PUBLIC_`.

| Name | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | Yes on Vercel | Project URL. SQLite is disabled on Vercel. |
| `SUPABASE_SECRET_KEY` | Yes on Vercel | `sb_secret_…` or legacy `service_role` JWT. Never the anon/publishable key. |
| `GEE_PROJECT` | For Earth View | Google Cloud / Earth Engine project id. |
| `GEE_SERVICE_ACCOUNT_JSON_B64` | For Earth View | Base64 of the service-account JSON. Preferred on Vercel (no key file). |
| `GEE_SERVICE_ACCOUNT_JSON` | Alternative | Raw JSON object, or a file path for local/dev only. |
| `GEE_TILE_SIGNING_SECRET` | For Earth View | HMAC secret so any backend instance can serve satellite tiles. |
| `OPENAI_API_KEY` | For briefings | Incident briefings. Degrades to the deterministic fallback without it. |
| `OPENAI_MODEL` | Optional | Default `gpt-4.1-mini`. |
| `GRAFILAB_API_KEY` | For field briefs | Degrades to the deterministic fallback without it. |
| `GRAFILAB_MODEL` | Optional | Auto-picked from `/models` when blank. |
| `FIRMS_MAP_KEY` | Optional | Only needed to rebuild the FIRMS snapshot, not to serve it. |
| `CORS_ORIGINS` | Optional | Comma-separated extra origins. Same-origin `/api` does not need CORS. |

Create a random `GEE_TILE_SIGNING_SECRET` (for example `openssl rand -hex 32`) and do not rotate it without expecting in-flight map tiles to 410 until the client refreshes imagery.

## 3. Supabase

Run [`backend/supabase/schema.sql`](../backend/supabase/schema.sql) once in the SQL editor (all 5 parts) if this project has not already received it. See [SUPABASE.md](SUPABASE.md). `/api/health` must report `record_backend: "supabase"`.

On Vercel the API never writes `backend/data/terraguard.db`. If Supabase is missing or unreachable, decision writes return 502 and health is 503.

## 4. Earth Engine service account

Local `earthengine authenticate` does not exist on Vercel.

1. In Google Cloud, create a service account in the Earth Engine project.
2. Grant it Earth Engine access (and Service Usage if the project requires it). See [service accounts](https://developers.google.com/earth-engine/guides/service_account).
3. Create a JSON key. Do not commit it.
4. Base64-encode the file and store it as `GEE_SERVICE_ACCOUNT_JSON_B64`:

```bash
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\key.json"))
```

```bash
# macOS / Linux
base64 -w0 path/to/key.json
```

Register the Cloud project for Earth Engine first. Missing credentials keep worldwide browsing; analysis reports the missing configuration and never invents imagery.

## 5. Bundle size

The Python function limit is 500 MB uncompressed (5 GB with Large Functions). The deploy excludes tests, `.venv`, `data/raw/firms_viirs.csv` (evidence traces degrade if absent), and local caches. Runtime still needs `data/model`, `data/processed` (including `candidates.parquet`) and `data/raw/weather`.

If a build fails with an unzipped-size error, enable Large Functions on the project (`VERCEL_SUPPORT_LARGE_FUNCTIONS=1`) or switch only the backend service to `runtime: "container"`.

Hobby `maxDuration` is 300 s. Long Earth Engine compare calls or large simulations may need Pro (up to 800 s).

## 6. Verify a preview

After the first preview is Ready:

```bash
curl -sS "$PREVIEW_URL/api/health"
```

Expect `status: "ok"`, `record_backend: "supabase"`, and `earth_engine: true` when the service account is configured.

Then:

1. Open `/` and `/simulation`.
2. Pick an incident, send the crew with a reason.
3. Confirm the row in Supabase `actions` and that it survives a redeploy.
4. In Earth View, pan and switch RGB/NDVI. Tiles must not 410 after a second backend instance is cold-started.
5. Check the Vercel build output for Python bundle size and the first `/api/incidents` timing (cold start).

Local full-stack substitute: `npx vercel@latest dev` from the repo root after `npx vercel@latest link`.
