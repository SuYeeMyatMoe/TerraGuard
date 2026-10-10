"""Evidence package: the ONLY facts an LLM may use. Each fact has a stable id and a value."""
from __future__ import annotations

import hashlib
import json
from typing import Any


def _pct(v: float | None) -> str | None:
    return None if v is None else f"{v * 100:.0f}%"


def build_package(incident: dict, prediction: dict, teams: int, simulation: dict | None = None) -> dict:
    facts: list[dict[str, Any]] = []

    def add(fid: str, label: str, value: Any, source: str, unit: str | None = None):
        if value is None or value == [] or value == "":
            return
        facts.append({"evidence_id": fid, "label": label, "value": value, "unit": unit, "source": source})

    obs = "NASA FIRMS VIIRS observation"
    add("OBS_ID", "Incident reference", incident["id"], "TerraGuard")
    add("OBS_REGION", "Region", f"{incident['region']}, {incident['country']}", "TerraGuard (nearest named region)")
    add("OBS_COORDS", "Coordinates (lat, lon)", f"{incident['lat']:.4f}, {incident['lon']:.4f}", obs)
    add("OBS_TIME", "Observation time (UTC)", incident["observed_at"].replace("+00:00", "Z"), obs)
    add("OBS_SAT", "Satellite / sensor", incident["satellite"], obs)
    add("OBS_DAYNIGHT", "Day or night pass", incident["daynight"], obs)
    add("OBS_PIXELS", "Hotspot pixels in cluster", incident["n_pixels"], obs, "pixel" if incident["n_pixels"] == 1 else "pixels")
    add("OBS_FRP", "Peak fire radiative power", incident["frp_max_mw"], obs, "MW")
    add("OBS_CONF_HIGH", "Share of high-confidence pixels", _pct(incident["high_confidence_share"]), obs)
    w = incident["weather"]
    wx = "Open-Meteo historical weather, previous UTC day"
    add("WX_RH", "Minimum relative humidity", w.get("relative_humidity_2m_min"), wx, "%")
    add("WX_RAIN7", "Rainfall in previous 7 days", w.get("precip_7d"), wx, "mm")
    add("WX_DSR", "Days since ≥1 mm rain", w.get("days_since_rain"), wx, "days")
    add("WX_WIND", "Maximum wind speed", w.get("wind_speed_10m_max"), wx, "km/h")
    if w.get("missing"):
        add("WX_MISSING", "Weather record", "missing or incomplete", wx)
    pa = incident["protected_area"]
    add("PA_NAME", "Nearest protected area", pa["name"], f"TerraGuard curated list ({pa['boundary']} boundary)")
    add("PA_DIST", "Distance to protected-area boundary", pa["distance_km"], f"{pa['boundary']} boundary", "km")

    m = prediction["model"]
    add("MODEL", "Predictive model", f"{m['name']} ({m['version']})", "TerraGuard ML")
    add("PRED_TARGET", "What the model predicts", m["target"], "TerraGuard ML")
    add("PRED_PROB", "48-hour follow-up detection probability", _pct(prediction["probability"]), "TerraGuard ML")
    tv = prediction["tree_variation"]
    add("TREE_VARIATION", "Variation across model trees (10th–90th percentile of individual trees; not a confidence interval)",
        f"{tv['p10'] * 100:.0f}%–{tv['p90'] * 100:.0f}%", "TerraGuard ML")
    if prediction.get("calibration_note"):
        add("CALIBRATION", "Held-out calibration for this score band", prediction["calibration_note"]["text"], "TerraGuard evaluation")
    add("SUMMARY", "Deterministic decision summary", prediction["decision_summary"], "TerraGuard explanation rules")
    add("URGENCY", "Operational urgency tier (rule-based)", prediction["urgency"]["label"], "TerraGuard rules")
    add("PRED_THRESHOLD", "Alert threshold chosen on validation data", _pct(prediction["threshold"]), "TerraGuard ML")
    fp = prediction.get("footprint")
    if fp:
        add("FOOTPRINT", f"Forecast satellite-detected fire footprint, next {fp['horizon_h']} h, if activity continues "
                         "(median, 10–90% range; VIIRS pixel area, not mapped burned area)",
            f"{fp['median_km2']} km² ({fp['p10_km2']}–{fp['p90_km2']} km²)", "TerraGuard ML (footprint model)")
        add("FOOTPRINT_ANY", "Chance of any further detected footprint within 5 km in 48 h", _pct(fp["probability_any"]),
            "TerraGuard ML (footprint model)")
    for k, f in enumerate(prediction.get("explained_factors") or [], start=1):
        cmp = f" ({f['comparison_text']})" if f.get("comparison") else ""
        add(f"FACTOR_{k}", f"Model factor ({f['influence_label'].lower()} influence)",
            f"{f['name']}: {f['value_text']}{cmp}; {f['effect_text']}", "TerraGuard ML (path contributions)")
    add("EVID_QUALITY", "Evidence quality", prediction["evidence"]["quality"], "TerraGuard rules")
    for k, lim in enumerate(prediction.get("evidence_limitations") or [], start=1):
        add(f"EVID_FLAG_{k}", "Evidence limitation", f"{lim['title']}: {lim['text']}", "TerraGuard rules")
    for k, g in enumerate(prediction.get("confidence_guidance") or [], start=1):
        add(f"GAP_{k}", "What would improve confidence", g["verification_step"], "TerraGuard rules")
    rk = prediction.get("ranking_explanation") or {}
    if rk.get("compared_with"):
        add("COMPARE_TEXT", "Ranking comparison (priority components)", rk["text"], "TerraGuard rules")
        add("COMPARE_WITH", "Compared with", rk["compared_with"], "TerraGuard rules")
        add("COMPARE_RESOURCE", "Resource constraint", rk["resource_note"], "TerraGuard rules")
    if prediction["missing_features"]:
        add("MISSING_INPUTS", "Missing model inputs", ", ".join(prediction["missing_features"]), "TerraGuard ML")
    if prediction["ood_features"]:
        add("OOD_INPUTS", "Inputs outside training range", ", ".join(prediction["ood_features"]), "TerraGuard ML")
    add("CATEGORY", "Operational category", prediction["category_label"], "TerraGuard rules")
    pr = prediction["priority"]
    add("PRIORITY_SCORE", "Priority score (0–1)", round(pr["score"], 2), "TerraGuard rules")
    add("PRIORITY_RANK", "Priority rank among competing incidents", f"{pr['rank']} of {pr['of']}", "TerraGuard rules")
    add("RECOMMENDATION", "Deterministic recommendation", pr["recommendation"], "TerraGuard rules")
    add("RECOMMENDATION_REASON", "Reason for recommendation", pr["reason"], "TerraGuard rules")
    add("RANK_ORDER", "Deterministic priority order (highest first)",
        " > ".join(c["incident_id"] for c in sorted(prediction["competing"], key=lambda c: c["rank"])), "TerraGuard rules")
    others = [c for c in prediction["competing"] if c["incident_id"] != incident["id"]]
    for k, c in enumerate(others, start=1):
        add(f"COMPETING_{k}", "Competing incident",
            f"{c['incident_id']} ({c['region']}): rank {c['rank']}, {c['recommendation']}", "TerraGuard rules")
    add("RESOURCES", "Field teams available", teams, "Scenario setting", "teams")
    for k, lim in enumerate(prediction["model_limitations"], start=1):
        add(f"LIMIT_{k}", "Model limitation", lim, "TerraGuard documentation")
    if simulation:
        li = simulation.get("loss_index", {})
        pc = simulation.get("protected_cells_burned", {})
        sim = "TerraGuard hypothetical simulation (not a forecast)"
        if simulation.get("same_allocation"):
            add("SIM_SAME", "Simulation comparison", "Both policies assigned the same incidents", sim)
        else:
            add("SIM_LOSS_DIFF", "Mean loss-index difference, first-alert minus AI-priority", li.get("difference_mean"), sim)
            add("SIM_LOSS_CI", "95% confidence half-width of that difference", li.get("difference_ci95"), sim)
            add("SIM_SEEDS", "Seeds where AI-priority had lower loss", f"{li.get('seeds_ai_better')} of {li.get('n_seeds')}", sim)
            add("SIM_PROT_DIFF", "Mean protected cells burned, first-alert minus AI-priority", pc.get("difference_mean"), sim)
    return {"incident_id": incident["id"], "facts": facts}


def package_hash(pkg: dict, kind: str) -> str:
    return hashlib.sha256((kind + json.dumps(pkg, sort_keys=True, default=str)).encode()).hexdigest()[:16]


def facts_by_id(pkg: dict) -> dict[str, dict]:
    return {f["evidence_id"]: f for f in pkg["facts"]}
