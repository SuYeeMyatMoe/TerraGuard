"""Pydantic contracts. frontend/src/lib/types.ts mirrors these by hand — keep them in sync."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

Recommendation = Literal["INSPECT", "RECHECK", "MONITOR"]
ActionType = Literal["ASSIGN_INSPECTION", "REQUEST_RECHECK", "DISMISS", "CONTINUE_MONITORING", "ESCALATE_COORDINATION"]
Attendance = Literal["assigned", "unattended", "recheck", "dismissed", "open"]
Policy = Literal["none", "first_alert", "ai_priority"]


class Provenance(BaseModel):
    source: str
    is_synthetic: bool
    product: str
    period: list[str]
    rows: int
    weather_conditioning: Optional[str] = None


class Weather(BaseModel):
    date: Optional[str] = None
    temperature_2m_max: Optional[float] = None
    relative_humidity_2m_min: Optional[float] = None
    precip_7d: Optional[float] = None
    days_since_rain: Optional[float] = None
    wind_speed_10m_max: Optional[float] = None
    wind_direction_10m_dominant: Optional[float] = None
    source: str = "Open-Meteo historical archive (previous UTC day)"
    missing: bool = False


class ProtectedArea(BaseModel):
    id: str
    name: str
    distance_km: float
    boundary: Literal["approximate", "verified"] = "approximate"


class Incident(BaseModel):
    id: str
    candidate_id: str
    arrival_order: int
    lat: float
    lon: float
    region: str
    country: str
    observed_at: str
    satellite: str
    daynight: Literal["Day", "Night"]
    n_pixels: int
    frp_max_mw: float
    high_confidence_share: float
    low_confidence_share: float
    protected_area: ProtectedArea
    weather: Weather
    status: str
    attendance: Attendance
    status_updated_at: Optional[str] = None


class Team(BaseModel):
    id: str
    name: str
    short_name: str
    base: str
    base_lat: float
    base_lon: float
    size: int
    capability: str
    status: Literal["available", "assigned"]
    assigned_incident_id: Optional[str] = None
    since: Optional[str] = None
    action_id: Optional[int] = None
    stored_in: Optional[str] = None
    released_from: Optional[str] = None


class Scenario(BaseModel):
    id: str
    day: str
    replay_time_utc: str
    countries: list[str]
    candidates_that_day: int
    is_default: bool


class ContextHotspot(BaseModel):
    lat: float
    lon: float
    observed_at: str
    frp_max_mw: float
    n_pixels: int


class IncidentsResponse(BaseModel):
    scenario: Scenario
    scenarios: list[Scenario]
    provenance: Provenance
    incidents: list[Incident]
    context_hotspots: list[ContextHotspot]
    team: Team
    record_backend: Literal["supabase", "sqlite", "sqlite_fallback"]


class PredictRequest(BaseModel):
    incident_id: str
    teams: int = Field(1, ge=0, le=3)
    overrides: dict[str, Optional[float]] = Field(default_factory=dict,
                                                  description="Feature overrides; null simulates a missing value.")


class Factor(BaseModel):
    feature: str
    label: str
    value: float
    weight: float
    direction: Literal["up", "down"]
    text: str


class Evidence(BaseModel):
    quality: Literal["High", "Medium", "Low"]
    score: float
    flags: list[str]


class Priority(BaseModel):
    score: float
    components: dict[str, float]
    rank: int
    of: int
    recommendation: Recommendation
    reason: str


class CompetingIncident(BaseModel):
    incident_id: str
    region: str
    probability: Optional[float]
    priority_score: float
    rank: int
    recommendation: Recommendation


class TreeVariation(BaseModel):
    p10: float
    p90: float
    note: str


class CalibrationNote(BaseModel):
    band: str
    observed_rate: float
    n: int
    text: str


class Urgency(BaseModel):
    tier: Literal["CRITICAL_REVIEW", "PRIORITY_REVIEW", "ROUTINE_MONITORING", "INSUFFICIENT_EVIDENCE"]
    label: str
    meaning: str = ""
    review_window: str = ""
    review_window_note: str = ""
    reasons: list[str]
    rule_based: bool = True


class HeatSignal(BaseModel):
    level: Literal["Strong", "Moderate", "Weak"]
    reasons: list[str]
    note: str


class AnomalyAssessment(BaseModel):
    pattern: str
    label: str
    meaning: str
    anomaly_score: Optional[float] = None
    anomaly_percentile: Optional[float] = None
    unusual: bool
    proof: list[str]
    requires_verification: bool
    disclaimer: str


class FactorComparison(BaseModel):
    rank: int
    phrase: str
    scope_label: str
    n: int
    text: str


class ExplainedFactor(BaseModel):
    feature: str
    name: str
    meaning: str
    value_text: str
    comparison: Optional[FactorComparison] = None
    comparison_text: Optional[str] = None
    direction: Literal["up", "down"]
    effect_text: str
    influence: float = Field(..., description="Relative influence |c|/max|c| among shown factors; not a probability share.")
    influence_label: Literal["Strong", "Moderate", "Smaller"]
    contribution_pp: float = Field(..., description="Technical detail: Saabas contribution in probability points.")
    imputed: bool


class EvidenceGap(BaseModel):
    code: str
    missing: str
    why_it_matters: str
    verification_step: str
    keep_cautious: bool


class EvidenceLimitation(BaseModel):
    code: str
    severity: Literal["high", "medium", "low"]
    title: str
    text: str


class ModelInfo(BaseModel):
    name: str
    version: str
    target: str
    served: Literal["random_forest", "baseline"]


class PredictResponse(BaseModel):
    incident_id: str
    model: ModelInfo
    probability: float
    tree_variation: TreeVariation
    calibration_note: Optional[CalibrationNote] = None
    decision_summary: str
    urgency: Urgency
    heat_signal: HeatSignal
    anomaly: AnomalyAssessment
    feasibility: Optional[dict[str, Any]] = None
    explained_factors: list[ExplainedFactor]
    ranking_explanation: dict[str, Any]
    confidence_guidance: list[EvidenceGap]
    evidence_limitations: list[EvidenceLimitation]
    trace: dict[str, Any]
    threshold: float
    above_alert_threshold: bool
    category: str
    category_label: str
    evidence: Evidence
    factors: list[Factor]
    missing_features: list[str]
    ood_features: list[str]
    priority: Priority
    competing: list[CompetingIncident]
    uncertainty_note: str
    model_limitations: list[str]
    retrospective_label: Optional[str] = Field(None, description="What was actually observed in the next 48 h (historical replay only).")


class IncidentOverride(BaseModel):
    wind_speed: Optional[float] = Field(None, ge=0, le=80)
    wind_dir_deg: Optional[float] = Field(None, ge=0, le=360)
    dryness: Optional[float] = Field(None, ge=0, le=1)
    ignition: Optional[list[list[int]]] = None


class SimulateRequest(BaseModel):
    scenario_id: Optional[str] = None
    teams: int = Field(1, ge=0, le=3)
    response_delay: int = Field(4, ge=0, le=24)
    steps: int = Field(48, ge=12, le=72)
    seed: int = 7
    n_seeds: int = Field(30, ge=1, le=60)
    per_incident: dict[str, IncidentOverride] = Field(default_factory=dict)
    coordinator_assignment: Optional[str] = Field(None, description="Defaults to the crew's current recorded assignment.")


class PlotInfo(BaseModel):
    incident_id: str
    fuel: str          # H*W digits 0-9 (0 = empty cell)
    protected: str     # H*W digits 0/1
    ignition: list[list[int]]
    wind_speed: float
    wind_dir_deg: float
    dryness: float
    defaults_from: str


class PolicyResult(BaseModel):
    assigned: list[str]
    frames: list[list[str]]
    events: list[dict[str, Any]]
    metrics: dict[str, Any]


class SimulateResponse(BaseModel):
    scenario_id: str
    grid: dict[str, int]
    seed: int
    n_seeds: int
    steps: int
    teams: int
    response_delay: int
    arrival_order: list[str]
    ai_order: list[str]
    coordinator_assignment: Optional[str] = None
    plots: list[PlotInfo]
    policies: dict[str, PolicyResult]
    comparison: dict[str, Any]
    assumptions: dict[str, Any]
    disclaimer: str


class ActionRequest(BaseModel):
    action: ActionType
    reason: str = Field(..., max_length=600, description="Required: why the coordinator made this decision.")
    teams: int = Field(1, ge=0, le=3)
    team_name: Optional[str] = Field(None, min_length=1, max_length=120)

    @field_validator("team_name")
    @classmethod
    def clean_team_name(cls, value: str | None) -> str | None:
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("A team name cannot be blank.")
        return value

    @model_validator(mode="after")
    def assignment_only(self):
        if self.team_name is not None and self.action != "ASSIGN_INSPECTION":
            raise ValueError("team_name is only allowed for ASSIGN_INSPECTION.")
        return self


class WaitingIncident(BaseModel):
    incident_id: str
    region: Optional[str] = None
    probability: Optional[float] = None
    rank: Optional[int] = None
    recommendation: Optional[str] = None


class ActionRecord(BaseModel):
    id: int
    scenario_id: str
    incident_id: str
    incident_region: Optional[str] = None
    action: ActionType
    reason: Optional[str] = None
    recommendation_at_time: Optional[str] = None
    created_at: str
    team_name: Optional[str] = None
    teams: Optional[int] = None
    priority_rank: Optional[int] = None
    priority_score: Optional[float] = None
    probability: Optional[float] = None
    followed_recommendation: Optional[bool] = None
    reassigned_from: Optional[str] = None
    left_waiting: Optional[list[WaitingIncident]] = None
    archived_at: Optional[str] = None
    stored_in: str = "sqlite"
    fallback_reason: Optional[str] = None
    snapshot_stored: bool = True
    retrospective: dict[str, Optional[str]] = Field(default_factory=dict)


class ActionResponse(BaseModel):
    action: ActionRecord
    incident_status: str
    team: Team
    attendance: dict[str, Attendance]
    record_backend: str


class ActionsResponse(BaseModel):
    actions: list[ActionRecord]
    record_backend: str


class ExplainRequest(BaseModel):
    incident_id: str
    teams: int = Field(1, ge=0, le=3)
    simulation: Optional[dict[str, Any]] = Field(None, description="Comparison block from /api/simulate, if run.")


class FieldBriefRequest(BaseModel):
    incident_id: str
    teams: int = Field(1, ge=0, le=3)
    action_id: Optional[int] = None
    stored_in: Optional[str] = None
