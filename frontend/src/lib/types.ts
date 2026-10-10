import type { FeatureCollection } from "geojson";

// Mirrors backend/app/schemas.py — keep in sync.

export type Recommendation = "INSPECT" | "RECHECK" | "MONITOR";
export type ActionType = "ASSIGN_INSPECTION" | "REQUEST_RECHECK" | "DISMISS";
export type PolicyKey = "none" | "first_alert" | "ai_priority" | "coordinator";
export type Attendance = "assigned" | "unattended" | "recheck" | "dismissed" | "open";
export type RecordBackend = "supabase" | "sqlite" | "sqlite_fallback";

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
  attendance: Attendance;
  status_updated_at: string | null;
}

export interface Team {
  id: string;
  name: string;
  short_name: string;
  base: string;
  base_lat: number;
  base_lon: number;
  size: number;
  capability: string;
  status: "available" | "assigned";
  assigned_incident_id: string | null;
  since: string | null;
  action_id: number | null;
  stored_in?: string | null;
  released_from?: string | null;
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
  team: Team;
  record_backend: RecordBackend;
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
  tree_variation: { p10: number; p90: number; note: string };
  calibration_note: { band: string; observed_rate: number; n: number; text: string } | null;
  decision_summary: string;
  urgency: Urgency;
  explained_factors: ExplainedFactor[];
  ranking_explanation: RankingExplanation;
  confidence_guidance: EvidenceGap[];
  evidence_limitations: EvidenceLimitation[];
  trace: Trace;
  threshold: number;
  above_alert_threshold: boolean;
  category: string;
  category_label: string;
  evidence: { quality: "High" | "Medium" | "Low"; score: number; flags: string[]; flag_codes: string[]; corroborated: boolean };
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
  model_limitations: string[];
  retrospective_label: string | null;
}

export type UrgencyTier = "CRITICAL_REVIEW" | "PRIORITY_REVIEW" | "ROUTINE_MONITORING" | "INSUFFICIENT_EVIDENCE";

export interface Urgency {
  tier: UrgencyTier;
  label: string;
  reasons: string[];
  rule_based: boolean;
}

export interface ExplainedFactor {
  feature: string;
  name: string;
  meaning: string;
  value_text: string;
  comparison: { rank: number; phrase: string; scope_label: string; n: number; text: string } | null;
  comparison_text: string | null;
  direction: "up" | "down";
  effect_text: string;
  /** relative influence |c|/max|c| among the shown factors: a visual scale, not a probability share */
  influence: number;
  influence_label: "Strong" | "Moderate" | "Smaller";
  /** technical detail: additive path contribution in probability points */
  contribution_pp: number;
  imputed: boolean;
}

export type PriorityComponent = "prediction" | "exposure" | "recency" | "evidence";

export interface RankingPair {
  incident_id: string;
  label: string;
  region: string | null;
  rank: number;
  score: number;
  score_diff: number;
  component_diffs: Record<PriorityComponent, number>;
  recommendation: Recommendation;
}

export interface RankingExplanation {
  compared_with: string | null;
  compared_with_label?: string;
  relation?: "above" | "below";
  text: string;
  close?: boolean;
  tie_rule?: string | null;
  score_diff?: number;
  component_diffs?: Record<PriorityComponent, number>;
  drivers?: { component: PriorityComponent; label: string; diff: number }[];
  tradeoff?: { component: PriorityComponent; label: string; diff: number } | null;
  resource_note?: string;
  pairs: RankingPair[];
}

export interface EvidenceGap {
  code: string;
  missing: string;
  why_it_matters: string;
  verification_step: string;
  keep_cautious: boolean;
}

export interface EvidenceLimitation {
  code: string;
  severity: "high" | "medium" | "low";
  title: string;
  text: string;
}

export interface TraceDetection {
  latitude: number;
  longitude: number;
  acq_date: string;
  acq_time_utc: string;
  satellite: string;
  source_product: string;
  version: string;
  type: number | null;
  confidence: string;
  frp_mw: number;
  bright_ti4_k: number;
  distance_km: number;
}

export interface Trace {
  incident_id: string;
  candidate_id: string;
  firms: { source: string; product: string; is_synthetic: boolean; matching_rule: string; detections: TraceDetection[] };
  weather: { source: string; tile_lat: number | null; tile_lon: number | null; date: string | null; alignment: string };
  protected_area: { name: string; source: string; boundary: string; distance_km: number };
  model: { name: string; version: string; trained_at: string | null; target: string };
  inference_time_utc: string;
  priority_policy_version: string;
  priority_components: Record<PriorityComponent, number>;
  priority_score: number;
  rank: number;
  substituted_values: { feature: string; substituted_value: string }[];
  explanation_method: string;
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
  coordinator_assignment: string | null;
  policies: Record<"none" | "first_alert" | "ai_priority", PolicyResult> & { coordinator?: PolicyResult };
  comparison: {
    loss_index: ComparisonMetric;
    protected_cells_burned: ComparisonMetric;
    burned_cells: ComparisonMetric;
    same_allocation: boolean;
    note: string;
    coordinator?: {
      loss_index: { coordinator_mean: number; vs_first_alert: number; vs_ai_priority: number };
      protected_cells_burned: { coordinator_mean: number; vs_first_alert: number; vs_ai_priority: number };
      burned_cells: { coordinator_mean: number; vs_first_alert: number; vs_ai_priority: number };
      matches: "ai_priority" | "first_alert" | null;
    };
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

export interface WaitingIncident {
  incident_id: string;
  region: string | null;
  probability: number | null;
  rank: number | null;
  recommendation: string | null;
}

export interface ActionRecord {
  id: number;
  scenario_id: string;
  incident_id: string;
  incident_region: string | null;
  action: ActionType;
  reason: string | null;
  recommendation_at_time: Recommendation | null;
  created_at: string;
  team_name: string | null;
  priority_rank: number | null;
  priority_score: number | null;
  probability: number | null;
  followed_recommendation: boolean | null;
  reassigned_from: string | null;
  left_waiting: WaitingIncident[] | null;
  archived_at: string | null;
  stored_in: "supabase" | "sqlite" | "local_fallback";
  fallback_reason: string | null;
  snapshot_stored: boolean;
  retrospective: Record<string, string | null>;
}

export interface ActionResponse {
  action: ActionRecord;
  incident_status: string;
  team: Team;
  attendance: Record<string, Attendance>;
  record_backend: RecordBackend;
}

export interface BriefSection {
  text: string;
  evidence_ids: string[];
}

export interface IncidentBriefing {
  incident_summary: BriefSection;
  why_prediction: BriefSection;
  why_priority: BriefSection;
  comparison_with_next_incident: BriefSection;
  uncertainties: BriefSection;
  what_would_improve_confidence: BriefSection;
  recommended_next_step: BriefSection & { recommendation: Recommendation };
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
  record_backend: RecordBackend;
  earth_engine: boolean;
}
