import type { FeatureCollection } from "geojson";

// Mirrors backend/app/schemas.py — keep in sync.

export type Recommendation = "INSPECT" | "RECHECK" | "MONITOR";
export type ActionType = "ASSIGN_INSPECTION" | "REQUEST_RECHECK" | "DISMISS";
export type PolicyKey = "none" | "first_alert" | "ai_priority";

export interface Provenance {
  source: string;
  is_synthetic: boolean;
  product: string;
  period: string[];
  rows: number;
  weather_conditioning?: string | null;
}

export interface Weather {
  date: string | null;
  temperature_2m_max: number | null;
  relative_humidity_2m_min: number | null;
  precip_7d: number | null;
  days_since_rain: number | null;
  wind_speed_10m_max: number | null;
  wind_direction_10m_dominant: number | null;
  source: string;
  missing: boolean;
}

export interface Incident {
  id: string;
  candidate_id: string;
  arrival_order: number;
  lat: number;
  lon: number;
  region: string;
  country: string;
  observed_at: string;
  satellite: string;
  daynight: "Day" | "Night";
  n_pixels: number;
  frp_max_mw: number;
  high_confidence_share: number;
  low_confidence_share: number;
  protected_area: { id: string; name: string; distance_km: number; boundary: "approximate" | "verified" };
  weather: Weather;
  status: string;
  status_updated_at: string | null;
}

export interface Scenario {
  id: string;
  day: string;
  replay_time_utc: string;
  countries: string[];
  candidates_that_day: number;
  is_default: boolean;
}

export interface ContextHotspot {
  lat: number;
  lon: number;
  observed_at: string;
  frp_max_mw: number;
  n_pixels: number;
}

export interface IncidentsResponse {
  scenario: Scenario;
  scenarios: Scenario[];
  provenance: Provenance;
  incidents: Incident[];
  context_hotspots: ContextHotspot[];
  teams_available: number;
}

export interface Factor {
  feature: string;
  label: string;
  value: number;
  weight: number;
  direction: "up" | "down";
  text: string;
}

export interface Prediction {
  incident_id: string;
  model: { name: string; version: string; target: string; served: "random_forest" | "baseline" };
  probability: number;
  interval: [number, number];
  threshold: number;
  above_alert_threshold: boolean;
  category: string;
  category_label: string;
  evidence: { quality: "High" | "Medium" | "Low"; score: number; flags: string[] };
  factors: Factor[];
  missing_features: string[];
  ood_features: string[];
  priority: {
    score: number;
    components: Record<string, number>;
    rank: number;
    of: number;
    recommendation: Recommendation;
    reason: string;
  };
  competing: {
    incident_id: string;
    region: string;
    probability: number | null;
    priority_score: number;
    rank: number;
    recommendation: Recommendation;
  }[];
  uncertainty_note: string;
  limitations: string[];
  retrospective_label: string | null;
}

export interface Stat {
  display: number;
  mean: number;
  ci95: number;
}

export interface PolicyMetrics {
  burned_cells: Stat;
  protected_cells_burned: Stat;
  team_hours: Stat;
  response_cost_rm: Stat;
  loss_index: Stat;
  per_incident: {
    incident_id: string;
    team_assigned: boolean;
    response_delay_steps: number | null;
    burned_cells: Stat;
    protected_cells_burned: Stat;
    still_burning_at_end: boolean;
  }[];
}

export interface SimEvent {
  step: number;
  incident_id: string;
  type: "dispatch" | "arrival" | "contained";
  label: string;
}

export interface PolicyResult {
  assigned: string[];
  frames: string[][]; // frames[step][plot] -> H*W digits
  events: SimEvent[];
  metrics: PolicyMetrics;
}

export interface ComparisonMetric {
  first_alert_mean: number;
  ai_priority_mean: number;
  no_response_mean: number;
  difference_mean: number;
  difference_ci95: number;
  seeds_ai_better: number;
  seeds_tied: number;
  seeds_first_alert_better: number;
  n_seeds: number;
}

export interface PlotInfo {
  incident_id: string;
  fuel: string;
  protected: string;
  ignition: number[][];
  wind_speed: number;
  wind_dir_deg: number;
  dryness: number;
  defaults_from: string;
}

export interface SimulateResponse {
  scenario_id: string;
  grid: { plots: number; h: number; w: number };
  seed: number;
  n_seeds: number;
  steps: number;
  teams: number;
  response_delay: number;
  arrival_order: string[];
  ai_order: string[];
  plots: PlotInfo[];
  policies: Record<PolicyKey, PolicyResult>;
  comparison: {
    loss_index: ComparisonMetric;
    protected_cells_burned: ComparisonMetric;
    burned_cells: ComparisonMetric;
    same_allocation: boolean;
    note: string;
  };
  assumptions: Record<string, number | string>;
  disclaimer: string;
}

export interface IncidentOverride {
  wind_speed?: number;
  wind_dir_deg?: number;
  dryness?: number;
  ignition?: number[][];
}

export interface SimulateRequest {
  scenario_id?: string;
  teams: number;
  response_delay: number;
  steps: number;
  seed: number;
  n_seeds: number;
  per_incident: Record<string, IncidentOverride>;
}

export interface ActionRecord {
  id: number;
  scenario_id: string;
  incident_id: string;
  action: ActionType;
  reason: string | null;
  recommendation_at_time: string | null;
  created_at: string;
}

export interface BriefSection {
  text: string;
  evidence_ids: string[];
}

export interface IncidentBriefing {
  summary: BriefSection;
  why_matters: BriefSection;
  prediction_interpretation: BriefSection;
  recommended_next_step: BriefSection & { recommendation: Recommendation };
  uncertainty: BriefSection;
}

export interface FieldBrief {
  reference: string;
  location_and_time: string;
  reason_for_verification: string;
  available_evidence: string[];
  verification_task: string;
  missing_information: string[];
  safety_note: string;
  evidence_ids: string[];
}

export interface EvidenceFact {
  evidence_id: string;
  label: string;
  value: string | number;
  unit: string | null;
  source: string;
}

export interface AIResult<T> {
  kind: "explain" | "field_brief";
  incident_id: string;
  content: T;
  provider: "openai" | "grafilab" | "deterministic";
  model: string | null;
  status: "generated" | "fallback_deterministic";
  provider_note: string | null;
  attempts: { provider: string; model?: string; valid?: boolean; problems?: string[]; error?: string }[];
  evidence: EvidenceFact[];
  cached?: boolean;
}

export interface GeoContext {
  incident_id: string;
  earth_engine: {
    available: boolean;
    reason?: string;
    generated_at?: string;
    records: {
      dataset: string;
      id: string;
      acquired: string;
      resolution_m: number;
      method: string;
      value: unknown;
      limitations: string;
    }[];
  };
  protected_areas: FeatureCollection;
  boundary_status: string;
}

export interface EarthEngineImagery {
  status: "not_configured" | "select_incident" | "ready" | "no_data" | "unavailable";
  available: boolean;
  incident_id: string | null;
  reason: string | null;
  window: { start: string; end: string; days: number } | null;
  bounds: [number, number, number, number] | null;
  layers: { id: "rgb" | "ndvi"; tile_url: string; attribution: string }[];
  analysis: {
    scene_count: number;
    acquisition_start: string | null;
    acquisition_end: string | null;
    ndvi_mean: number | null;
    valid_coverage_pct: number;
  } | null;
  generated_at?: string;
  refresh_after_seconds?: number;
  method?: string;
  limitations?: string;
}

export interface SplitMetrics {
  n: number;
  positive_rate: number;
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  pr_auc: number;
  roc_auc: number;
  false_positive_rate: number;
  false_alarms: number;
  precision_at_k_daily: number;
  brier: number;
}

export interface ModelEval {
  name: string;
  val: SplitMetrics;
  test: SplitMetrics;
  pr_curve_test: { recall: number; precision: number }[];
  reliability_test: { bin: string; mean_predicted: number; observed_rate: number; n: number }[];
  top_features?: { feature: string; importance: number }[];
}

export interface Evaluation {
  provenance: Provenance & { generated_at?: string };
  audit: Record<string, unknown> & {
    splits: Record<string, { n: number; positives: number; positive_rate: number | null }>;
    label_status: Record<string, number>;
    incident_candidates: number;
    acquisition_passes: number;
    detections_after_cleaning: number;
    feasibility_gate: { passed: boolean; rule: string };
  };
  model_version: string;
  target: string;
  chosen_model: string;
  selection_rule: string;
  threshold_rule: string;
  daily_capacity_k: number;
  baseline: ModelEval;
  random_forest: ModelEval;
  policy_backtest: null | {
    days_evaluated: number;
    days_with_known_labels: number;
    days_policies_disagree: number;
    retrospective: {
      all_days: {
        ai_pick_followup_rate: number;
        first_alert_pick_followup_rate: number;
        random_pick_followup_rate: number;
        difference_ai_minus_first_alert_ci95: [number, number];
      };
      disagreement_days: {
        n: number;
        ai_pick_followup_rate: number | null;
        first_alert_pick_followup_rate: number | null;
        difference_ai_minus_first_alert_ci95: [number, number];
      };
      note: string;
    };
    simulation: {
      mean_loss_first_alert: number;
      mean_loss_ai_priority: number;
      mean_loss_difference: number;
      difference_ci95: [number, number];
      days_ai_lower_loss: number;
      days_first_alert_lower_loss: number;
      days_tied: number;
      n_seeds_per_day: number;
      note: string;
    };
  };
}

export interface Health {
  status: string;
  model: string;
  served_model: string;
  data_source: string;
  is_synthetic: boolean;
  providers: { openai: boolean; openai_model: string | null; grafilab: boolean };
  earth_engine: boolean;
  operational_database: { status: "ready" | "unavailable" };
}
