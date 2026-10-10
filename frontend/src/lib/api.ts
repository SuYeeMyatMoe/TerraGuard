import type {
  ActionRecord,
  ActionType,
  AIResult,
  Evaluation,
  EarthEngineImagery,
  FieldBrief,
  GeoContext,
  Health,
  IncidentBriefing,
  IncidentsResponse,
  Prediction,
  SimulateRequest,
  SimulateResponse,
} from "./types";
import type { ImageryOptions } from "./earth-engine";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  init?.signal?.addEventListener("abort", abort, { once: true });
  if (init?.signal?.aborted) ctrl.abort();
  const timer = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 30000);
  try {
    const res = await fetch(path, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const body = await res.json();
        msg =
          typeof body.detail === "string"
            ? body.detail
            : JSON.stringify(body.detail ?? body);
      } catch {
        /* keep statusText */
      }
      throw new ApiError(res.status, msg);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === "AbortError")
      throw new ApiError(0, "The request timed out.");
    throw new ApiError(
      0,
      "The TerraGuard API is unreachable. Is the backend running on port 8010?",
    );
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", abort);
  }
}

const post = <T>(path: string, body: unknown, timeoutMs?: number) =>
  call<T>(path, { method: "POST", body: JSON.stringify(body), timeoutMs });

export const api = {
  health: () => call<Health>("/api/health"),
  incidents: (scenario?: string) =>
    call<IncidentsResponse>(
      `/api/incidents${scenario ? `?scenario=${encodeURIComponent(scenario)}` : ""}`,
    ),
  predict: (incident_id: string, teams: number) =>
    post<Prediction>("/api/predict", { incident_id, teams }),
  simulate: (req: SimulateRequest) =>
    post<SimulateResponse>("/api/simulate", req, 60000),
  action: (
    incident_id: string,
    action: ActionType,
    reason?: string,
    teams = 1,
  ) =>
    post<{ action: ActionRecord; incident_status: string }>(
      `/api/incidents/${encodeURIComponent(incident_id)}/action`,
      { action, reason, teams },
    ),
  actions: () => call<{ actions: ActionRecord[] }>("/api/actions"),
  evaluation: () => call<Evaluation>("/api/evaluation"),
  geospatial: (incident_id: string) =>
    call<GeoContext>(`/api/geospatial/${encodeURIComponent(incident_id)}`),
  earthEngine: (
    incident_id: string | undefined,
    days = 30,
    refresh = false,
    options: ImageryOptions = {},
  ) => {
    const query = new URLSearchParams({ days: String(days) });
    if (refresh) query.set("refresh", "true");
    if (options.bounds) query.set("bbox", options.bounds.join(","));
    if (options.mode) query.set("mode", options.mode);
    if (options.background) query.set("async_load", "true");
    return call<EarthEngineImagery>(
      incident_id
        ? `/api/earth-engine/${encodeURIComponent(incident_id)}?${query}`
        : "/api/earth-engine",
      {
        timeoutMs: options.background ? 15000 : 60000,
        signal: options.signal,
      },
    );
  },
  explain: (incident_id: string, teams: number, simulation?: unknown) =>
    post<AIResult<IncidentBriefing>>(
      "/api/ai/explain",
      { incident_id, teams, simulation },
      70000,
    ),
  fieldBrief: (incident_id: string, teams: number, action_id?: number) =>
    post<AIResult<FieldBrief>>(
      "/api/ai/field-brief",
      { incident_id, teams, action_id },
      70000,
    ),
};
