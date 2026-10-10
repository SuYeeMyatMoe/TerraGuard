"""Deterministic template explanations, used when providers are unavailable or outputs fail validation."""
from __future__ import annotations

from ..evidence import facts_by_id

REC_TEXT = {
    "INSPECT": "Assign a field verification visit to this incident.",
    "RECHECK": "Request another satellite pass or remote review before committing a field team.",
    "MONITOR": "Keep this incident under satellite monitoring while teams are committed elsewhere.",
}


def _v(f: dict, k: str, default: str = "not available") -> str:
    x = f.get(k)
    if not x:
        return default
    return f"{x['value']}{' ' + x['unit'] if x.get('unit') and x['unit'] not in ('%',) else ('%' if x.get('unit') == '%' else '')}"


def _ids(f: dict, keys) -> list[str]:
    ids = [k for k in keys if k in f]
    return ids or ["OBS_ID"]


def briefing(pkg: dict, rec: str) -> dict:
    f = facts_by_id(pkg)
    factors = [f[k]["value"] for k in ("FACTOR_1", "FACTOR_2") if k in f]
    flags = [x["value"] for k, x in f.items() if k.startswith("EVID_FLAG_")]
    return {
        "summary": {
            "text": (f"{_v(f, 'OBS_SAT')} detected {_v(f, 'OBS_PIXELS')} of hotspot activity in {_v(f, 'OBS_REGION')} "
                     f"at {_v(f, 'OBS_TIME')}, with peak radiative power of {_v(f, 'OBS_FRP')}."),
            "evidence_ids": _ids(f, ("OBS_SAT", "OBS_PIXELS", "OBS_REGION", "OBS_TIME", "OBS_FRP")),
        },
        "why_matters": {
            "text": (f"It ranks {_v(f, 'PRIORITY_RANK')} on the transparent priority score ({_v(f, 'PRIORITY_SCORE')}). "
                     f"Category: {_v(f, 'CATEGORY')}. Nearest protected area: {_v(f, 'PA_NAME')}, about {_v(f, 'PA_DIST')} away."
                     + (f" Main model factors: {'; '.join(factors)}." if factors else "")),
            "evidence_ids": _ids(f, ("PRIORITY_RANK", "PRIORITY_SCORE", "CATEGORY", "PA_NAME", "PA_DIST", "FACTOR_1", "FACTOR_2")),
        },
        "prediction_interpretation": {
            "text": (f"The model estimates a {_v(f, 'PRED_PROB')} chance that another qualifying satellite detection occurs "
                     f"nearby within 48 hours (tree range {_v(f, 'PRED_RANGE')}). This is about continued satellite-observed "
                     "activity, not fire spread or damage, and a low value does not confirm the fire is out."),
            "evidence_ids": _ids(f, ("PRED_PROB", "PRED_RANGE", "PRED_TARGET")),
        },
        "recommended_next_step": {
            "text": f"{REC_TEXT[rec]} {_v(f, 'RECOMMENDATION_REASON', '')}".strip(),
            "evidence_ids": _ids(f, ("RECOMMENDATION", "RECOMMENDATION_REASON", "RESOURCES")),
            "recommendation": rec,
        },
        "uncertainty": {
            "text": ("Evidence quality is " + _v(f, "EVID_QUALITY") + "."
                     + (f" Limitations: {'; '.join(flags)}." if flags else "")
                     + " Ground verification by a human team is required before any operational conclusion."),
            "evidence_ids": _ids(f, ("EVID_QUALITY", *[k for k in f if k.startswith("EVID_FLAG_")], "LIMIT_2")),
        },
    }


def field_brief(pkg: dict, rec: str) -> dict:
    f = facts_by_id(pkg)
    flags = [x["value"] for k, x in f.items() if k.startswith("EVID_FLAG_")]
    missing = flags[:] or ["No major evidence gaps flagged by the rules"]
    if "WX_MISSING" in f:
        missing.append("Weather record for the previous day")
    task = {
        "INSPECT": "Visit the coordinates, confirm whether active burning or smoke is present, note vegetation type and "
                   "approximate affected extent, and photograph conditions. Report back before any further action.",
        "RECHECK": "Check the next available satellite pass and any remote imagery for this location; only plan a site "
                   "visit if activity is corroborated.",
        "MONITOR": "No visit planned at present. Watch for further satellite detections at this location.",
    }[rec]
    return {
        "reference": _v(f, "OBS_ID"),
        "location_and_time": f"{_v(f, 'OBS_REGION')} · {_v(f, 'OBS_COORDS')} · observed {_v(f, 'OBS_TIME')} ({_v(f, 'OBS_SAT')})",
        "reason_for_verification": (f"Ranked {_v(f, 'PRIORITY_RANK')} among current incidents. {_v(f, 'PRED_PROB')} estimated "
                                    f"chance of further satellite detection within 48 hours. Nearest protected area: "
                                    f"{_v(f, 'PA_NAME')} ({_v(f, 'PA_DIST')})."),
        "available_evidence": [s for s in (
            f"{_v(f, 'OBS_PIXELS')} detected, peak radiative power {_v(f, 'OBS_FRP')}",
            f"High-confidence pixel share: {_v(f, 'OBS_CONF_HIGH')}",
            f"Evidence quality: {_v(f, 'EVID_QUALITY')}",
            f"Days since rain: {_v(f, 'WX_DSR')}" if "WX_DSR" in f else None,
        ) if s],
        "verification_task": task,
        "missing_information": missing,
        "safety_note": ("Satellite detections can be false or out of date. Do not enter active fire areas; follow agency "
                        "safety procedures. This brief is a draft and requires review by the coordinator."),
        "evidence_ids": _ids(f, ("OBS_ID", "OBS_REGION", "OBS_COORDS", "OBS_TIME", "PRIORITY_RANK", "PRED_PROB",
                                     "PA_NAME", "EVID_QUALITY")),
    }
