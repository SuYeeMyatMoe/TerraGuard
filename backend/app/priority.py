"""Layer 2: deterministic, transparent operational prioritisation.

The weights and rules below are fixed before any simulation is run and are documented in
docs/ASSUMPTIONS.md. They never use simulation outcomes and never assert illegal activity.
"""
from __future__ import annotations

import math

WEIGHTS = {"prediction": 0.45, "exposure": 0.25, "recency": 0.15, "evidence": 0.15}
PRIORITY_POLICY_VERSION = "priority-v1 (0.45 model estimate / 0.25 exposure / 0.15 recency / 0.15 evidence)"
EXPOSURE_SCALE_KM = 10.0   # exposure = exp(-distance / 10 km); 1.0 inside an (approximate) protected area
RECENCY_SCALE_H = 12.0     # recency = exp(-hours since observation / 12 h)

CATEGORY_TEXT = {
    "PROTECTED_AREA_EXPOSURE": "Activity near a protected area",
    "PERSISTENT_ACTIVITY": "Persistent activity at this location",
    "EMERGING_CLUSTER": "Emerging detection cluster",
    "ISOLATED_SIGNAL": "Isolated signal",
    "INSUFFICIENT_EVIDENCE": "Insufficient evidence",
}


def evidence_quality(c: dict, missing: list[str], ood: list[str]) -> dict:
    from ml.feature_catalog import info  # local import keeps priority.py free of ML imports at module load

    flags: list[str] = []
    codes: list[str] = []
    score = 0.0
    npx = c.get("n_pixels", 1) or 1
    score += 0.25 * min(npx, 4) / 4
    if npx == 1:
        flags.append("Single-pixel detection")
        codes.append("single_pixel")
    conf_l = c.get("conf_l_frac", 0) or 0
    score += 0.25 * (1 - conf_l)
    if conf_l >= 0.5:
        flags.append("Mostly low-confidence pixels")
        codes.append("low_confidence")
    corroborated = (c.get("multi_sensor_2h", 0) or 0) >= 1 or (c.get("prior_24h", 0) or 0) > 0
    score += 0.2 if corroborated else 0.0
    if not corroborated:
        flags.append("No corroborating detection in the previous 24 h")
        codes.append("no_corroboration")
    st = c.get("scan_track", 0.2) or 0.2
    score += 0.1 * max(0.0, min(1.0, (0.6 - st) / 0.45))
    if st > 0.35:
        flags.append("Large satellite observation footprint")
        codes.append("edge_of_scan")
    weather_missing = any(m in missing for m in ("relative_humidity_2m_min", "precip_7d", "days_since_rain")) \
        or (c.get("weather_missing", 0) or 0) >= 1
    score += 0.0 if weather_missing else 0.1
    if weather_missing:
        flags.append("Weather record missing")
        codes.append("weather_missing")
    if ood:
        score -= 0.1 * min(len(ood), 2)
        flags.append("Unusual input values: " + ", ".join(info(f).name.lower() for f in ood[:3]))
        codes.append("ood")
    score += 0.1  # base credit for a georeferenced satellite observation
    score = max(0.0, min(1.0, score))
    quality = "High" if score >= 0.65 else ("Medium" if score >= 0.4 else "Low")
    return {"quality": quality, "score": round(score, 3), "flags": flags, "flag_codes": codes,
            "corroborated": bool(corroborated)}


def exposure_score(pa_dist_km: float) -> float:
    return round(math.exp(-max(pa_dist_km, 0.0) / EXPOSURE_SCALE_KM), 4)


def recency_score(hours_since: float) -> float:
    return round(math.exp(-max(hours_since, 0.0) / RECENCY_SCALE_H), 4)


def categorise(c: dict, p: float, evidence: dict, exposure: float) -> str:
    if evidence["quality"] == "Low":
        return "INSUFFICIENT_EVIDENCE"
    if exposure >= 0.5 and p >= 0.4:
        return "PROTECTED_AREA_EXPOSURE"
    if (c.get("track_age_h", 0) or 0) >= 24 or (c.get("prior_72h", 0) or 0) >= 3:
        return "PERSISTENT_ACTIVITY"
    if (c.get("n_pixels", 1) or 1) >= 3 or p >= 0.5:
        return "EMERGING_CLUSTER"
    return "ISOLATED_SIGNAL"


def priority_score(p: float, exposure: float, recency: float, evidence_score: float) -> tuple[float, dict]:
    parts = {
        "prediction": WEIGHTS["prediction"] * p,
        "exposure": WEIGHTS["exposure"] * exposure,
        "recency": WEIGHTS["recency"] * recency,
        "evidence": WEIGHTS["evidence"] * evidence_score,
    }
    return round(sum(parts.values()), 4), {k: round(v, 4) for k, v in parts.items()}


def recommend(scored: list[dict], teams: int) -> dict[str, dict]:
    """Assign INSPECT / RECHECK / MONITOR across competing incidents.

    scored: [{id, score, evidence_quality, ood_count}] for every incident in the scenario.
    RECHECK when evidence is Low or >= 2 features are out of distribution; otherwise the top `teams`
    incidents by priority score are INSPECT and the rest MONITOR.
    """
    ranked = sorted(scored, key=lambda s: -s["score"])
    out: dict[str, dict] = {}
    slots = teams
    for rank, s in enumerate(ranked, start=1):
        if s["evidence_quality"] == "Low" or s["ood_count"] >= 2:
            rec, why = "RECHECK", "Evidence is incomplete or unusual; request another satellite pass or remote review first."
        elif slots > 0:
            rec, why = "INSPECT", "Highest evidence-supported priority among competing incidents with a team available."
            slots -= 1
        else:
            rec, why = "MONITOR", "Lower priority than competing incidents while all field teams are committed."
        out[s["id"]] = {"rank": rank, "recommendation": rec, "reason": why}
    return out


def allocation_order(scored: list[dict], recs: dict[str, dict]) -> list[str]:
    """Order in which the AI-priority policy assigns teams: INSPECT first, then the rest, by score."""
    tier = {"INSPECT": 0, "MONITOR": 1, "RECHECK": 2}
    return [s["id"] for s in sorted(scored, key=lambda s: (tier[recs[s["id"]]["recommendation"]], -s["score"]))]
