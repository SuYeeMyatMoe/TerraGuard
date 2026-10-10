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
    factor_ids = [k for k in ("FACTOR_1", "FACTOR_2", "FACTOR_3") if k in f]
    factors = [str(f[k]["value"]) for k in factor_ids]
    flag_ids = [k for k in f if k.startswith("EVID_FLAG_")][:3]
    gap_ids = [k for k in f if k.startswith("GAP_")][:2]
    unc = [str(f[k]["value"]) for k in flag_ids]
    if "TREE_VARIATION" in f:
        unc.append(f"individual model trees ranged {f['TREE_VARIATION']['value']} (variation within the model, "
                   "not a statistically validated confidence interval)")
    return {
        "incident_summary": {
            "text": (f"{_v(f, 'OBS_SAT')} detected {_v(f, 'OBS_PIXELS')} of hotspot activity in {_v(f, 'OBS_REGION')} "
                     f"at {_v(f, 'OBS_TIME')}, with peak radiative power of {_v(f, 'OBS_FRP')}."),
            "evidence_ids": _ids(f, ("OBS_SAT", "OBS_PIXELS", "OBS_REGION", "OBS_TIME", "OBS_FRP")),
        },
        "why_prediction": {
            "text": (f"The model estimates a {_v(f, 'PRED_PROB')} chance of another qualifying satellite detection nearby within "
                     "48 hours. " + (f"Main model factors: {'; '.join(factors)}. " if factors else "")
                     + "This concerns continued satellite-observed activity, not fire spread or damage."),
            "evidence_ids": _ids(f, ("PRED_PROB", "PRED_TARGET", *factor_ids)),
        },
        "why_priority": {
            "text": f"{_v(f, 'SUMMARY')} It ranks {_v(f, 'PRIORITY_RANK')} on the transparent priority score ({_v(f, 'PRIORITY_SCORE')}).",
            "evidence_ids": _ids(f, ("SUMMARY", "PRIORITY_RANK", "PRIORITY_SCORE")),
        },
        "comparison_with_next_incident": {
            "text": (f"{_v(f, 'COMPARE_TEXT')} {_v(f, 'COMPARE_RESOURCE', '')}".strip() if "COMPARE_TEXT" in f
                     else "There is no competing incident to compare with."),
            "evidence_ids": _ids(f, ("COMPARE_TEXT", "COMPARE_RESOURCE", "RANK_ORDER")),
        },
        "uncertainties": {
            "text": ("Evidence quality is " + _v(f, "EVID_QUALITY") + "."
                     + (f" Points to keep in mind: {'; '.join(unc)}." if unc else "")
                     + " A human review is required before any operational conclusion."),
            "evidence_ids": _ids(f, ("EVID_QUALITY", *flag_ids, "TREE_VARIATION")),
        },
        "what_would_improve_confidence": {
            "text": (" ".join(str(f[k]["value"]) for k in gap_ids) if gap_ids
                     else "No specific evidence gaps were flagged by the rules; routine observation continues."),
            "evidence_ids": _ids(f, tuple(gap_ids) or ("EVID_QUALITY",)),
        },
        "recommended_next_step": {
            "text": f"{REC_TEXT[rec]} {_v(f, 'RECOMMENDATION_REASON', '')}".strip(),
            "evidence_ids": _ids(f, ("RECOMMENDATION", "RECOMMENDATION_REASON", "RESOURCES")),
            "recommendation": rec,
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
