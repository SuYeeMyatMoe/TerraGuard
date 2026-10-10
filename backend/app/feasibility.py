"""Crew assignment feasibility: straight-line distance and jurisdiction, kept separate from scientific priority.

No routing provider is configured, so travel time is never estimated. Region and country for incidents come from
TerraGuard's nearest-named-region labels (approximate); the crew base is a hypothetical demo base.
"""
from __future__ import annotations

from ml.geo import haversine_km

from .team import TEAM

PLANNING_RADIUS_KM = 250.0   # prototype planning assumption (straight-line), not an operational standard
TRAVEL_NOTE = "Travel time unavailable — manual feasibility review required."


def _state(region: str | None) -> str:
    return (region or "").split(" (")[0].strip()   # "Sarawak (Miri)" -> "Sarawak"


def assess(incident: dict, team: dict | None = None) -> dict:
    team = team or TEAM
    km = float(haversine_km(team["base_lat"], team["base_lon"], incident["lat"], incident["lon"]))
    base_country, base_state = team.get("base_country", "Malaysia"), team.get("base_region", "Sarawak")
    country, state = incident.get("country"), _state(incident.get("region"))
    reasons: list[str] = []
    if not country or not state:
        status = "UNKNOWN"
        reasons.append("The incident's jurisdiction could not be determined.")
    elif country != base_country:
        status = "REQUIRES_COORDINATION"
        reasons.append(f"Cross-border coordination required: the crew is based in {base_country}, the incident is in {country}.")
        reasons.append("Do not assume the crew is authorised to operate across the border.")
    elif state != base_state:
        status = "REQUIRES_COORDINATION"
        reasons.append(f"Different state jurisdiction ({base_state} → {state}); forestry is state-administered, so coordination is needed.")
    elif km > PLANNING_RADIUS_KM:
        status = "UNKNOWN"
        reasons.append(f"Beyond the {PLANNING_RADIUS_KM:.0f} km straight-line planning radius; access must be reviewed manually.")
    else:
        status = "FEASIBLE"
        reasons.append(f"Same jurisdiction and within the {PLANNING_RADIUS_KM:.0f} km straight-line planning radius "
                       "(prototype planning assumption; travel time unverified).")
    return {
        "status": status,
        "label": {"FEASIBLE": "Feasible", "REQUIRES_COORDINATION": "Requires coordination", "UNKNOWN": "Unknown",
                  "UNAVAILABLE": "Unavailable"}[status],
        "straight_line_km": round(km, 1),
        "distance_label": "Straight-line distance (not a road route)",
        "crew_base": team["base"], "crew_base_jurisdiction": f"{base_state}, {base_country}",
        "incident_jurisdiction": f"{state or 'unknown'}, {country or 'unknown'} (approximate region label)",
        "cross_border": bool(country and country != base_country),
        "travel_time": None, "travel_note": TRAVEL_NOTE,
        "access_note": "Road routing would not describe forest access; field access must be confirmed locally.",
        "reasons": reasons,
        "actionable": status == "FEASIBLE",
    }
