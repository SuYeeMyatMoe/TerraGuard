"""Decision-ready explanations, generated deterministically from the real calculations.

Three kinds of reasoning are kept strictly apart:
  * model reasoning    -> factor_views(): local Saabas contributions to the Random Forest probability
  * priority reasoning -> ranking_explanation(): weighted priority-score components (app/priority.py)
  * evidence reasoning -> evidence_gaps() / limitations(): rule table keyed by evidence flag codes
Every sentence is built from a value that was actually computed; nothing here calls an LLM.
"""
from __future__ import annotations

import math
from typing import Any, Optional

from ml import reference
from ml.feature_catalog import SEASON_KEY, SEASON_PARTS, format_value, info, key_for  # noqa: F401 (re-exported)

from .priority import RECENCY_SCALE_H, WEIGHTS

CLOSE_SCORE = 0.02          # priority-score gap treated as "close"
MIN_COMPONENT_DIFF = 0.005  # smaller component differences are not named as drivers
HIGH_TREE_SPREAD = 0.30

INSUFFICIENT_SENTENCE = ("The available observations are not strong enough to confidently prioritize this incident. "
                         "Additional verification is recommended.")

COMPONENT_LABEL = {
    "prediction": "Model estimate",
    "exposure": "Protected-area exposure",
    "recency": "Recency",
    "evidence": "Evidence strength",
}
COMPONENT_PHRASE = {   # "... because it has <phrase>"
    "prediction": "a higher model estimate of follow-up detection",
    "exposure": "closer proximity to a protected area",
    "recency": "a more recent detection",
    "evidence": "a higher evidence-quality score",
}


def _and(items: list[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def short(incident_id: str) -> str:
    return "Incident " + incident_id.rsplit("-", 1)[-1] if incident_id.startswith("INC-") else incident_id


# ----------------------------------------------------------------------------- model reasoning
def merged_contributions(contrib: dict[str, float]) -> dict[str, float]:
    """Combine month_sin + month_cos into one seasonal contribution (their sum, exactly)."""
    out: dict[str, float] = {}
    for f, c in contrib.items():
        k = key_for(f)
        out[k] = out.get(k, 0.0) + c
    return out


def influence_label(x: float) -> str:
    return "Strong" if x >= 0.66 else "Moderate" if x >= 0.33 else "Smaller"


def factor_views(contrib: dict[str, float], raw: dict[str, Any], imputed: set[str],
                 country: Optional[str], month: Optional[int], top: int = 4, ref: dict | None = None) -> list[dict]:
    """Top factors by |contribution| with plain-language names, values, comparisons and relative influence.

    `influence` is |c| / max|c| over the shown factors: a relative visual scale only, not a probability share.
    """
    merged = merged_contributions(contrib)
    order = sorted(merged.items(), key=lambda kv: -abs(kv[1]))[:top]
    biggest = max((abs(c) for _, c in order), default=0.0) or 1.0
    views = []
    for key, c in order:
        fi = info(SEASON_PARTS[0] if key == SEASON_KEY else key)
        value = raw.get(key)
        missing = key in imputed
        comparison = None
        if missing:
            value_text = "not available (filled with a typical training value)"
        else:
            value_text = format_value(key if key != SEASON_KEY else SEASON_PARTS[0], value if value is not None else math.nan)
            if key == "track_age_h" and value is not None and value < 0.05:
                value_text = "first detection at this location"
            if fi.comparable and value is not None:
                cmp = reference.compare(key, value, country, month, ref)
                if cmp:
                    comparison = {**cmp, "text": f"{cmp['phrase']} {cmp['scope_label']}"}
        infl = abs(c) / biggest
        direction = "up" if c > 0 else "down"
        views.append({
            "feature": key,
            "name": fi.name,
            "meaning": fi.meaning,
            "value_text": value_text,
            "comparison": comparison,
            "comparison_text": comparison["text"] if comparison else ("Historical comparison unavailable." if fi.comparable and not missing else None),
            "direction": direction,
            "effect_text": "increased the model's estimate" if c > 0 else "lowered the model's estimate",
            "influence": round(infl, 4),
            "influence_label": influence_label(infl),
            "contribution_pp": round(c * 100, 2),   # technical detail: probability points (Saabas, additive)
            "imputed": missing,
        })
    return views


# ----------------------------------------------------------------------------- priority reasoning
def ranking_explanation(target_id: str, table: dict[str, dict], recs: dict[str, dict], regions: dict[str, str],
                        teams: int = 1) -> dict:
    """Why the target ranks where it does, from the weighted priority components only.

    table[id] = {"score": float, "components": {prediction, exposure, recency, evidence}}
    The component differences sum exactly to the score difference.
    """
    ranked = sorted(table, key=lambda i: recs[i]["rank"])
    t_rank = recs[target_id]["rank"]
    other = ranked[1] if t_rank == 1 and len(ranked) > 1 else ranked[0]
    if other == target_id:
        return {"compared_with": None, "text": "No competing incident to compare with.", "pairs": []}
    relation = "above" if recs[target_id]["rank"] < recs[other]["rank"] else "below"

    def diffs(a: str, b: str) -> dict[str, float]:
        return {k: round(table[a]["components"][k] - table[b]["components"][k], 4) for k in WEIGHTS}

    d = diffs(target_id, other)
    score_diff = round(table[target_id]["score"] - table[other]["score"], 4)
    close = abs(score_diff) < CLOSE_SCORE
    winner, loser = (target_id, other) if relation == "above" else (other, target_id)
    wd = d if relation == "above" else {k: -v for k, v in d.items()}
    drivers = sorted([k for k in wd if wd[k] >= MIN_COMPONENT_DIFF], key=lambda k: -wd[k])[:2]
    opposing = sorted([k for k in wd if wd[k] <= -MIN_COMPONENT_DIFF], key=lambda k: wd[k])[:1]
    W, L = short(winner), short(loser)

    tied = abs(score_diff) < 1e-4
    if tied:
        text = (f"{short(target_id)} and {short(other)} have the same priority score ({table[target_id]['score']:.2f}). "
                "Their order follows the tie-breaking policy: when scores are equal, the earlier alert ranks first.")
    elif close:
        text = (f"{short(target_id)} and {short(other)} have similar priority scores "
                f"({table[target_id]['score']:.3f} vs {table[other]['score']:.3f}). {W} is ahead by a small margin, "
                "so small changes in the evidence could swap their order.")
    elif drivers:
        because = " and ".join(COMPONENT_PHRASE[k] for k in drivers)
        text = f"{W} ranks above {L} mainly because it has {because}"
        if opposing:
            text += f", although {L} has {COMPONENT_PHRASE[opposing[0]]}"
        text += "."
    else:
        text = f"{W} ranks above {L} by a small margin spread across several factors."

    rec_t = recs[target_id]["recommendation"]
    inspect = [i for i in ranked if recs[i]["recommendation"] == "INSPECT"]
    waiting = [short(i) for i in ranked if i not in inspect and recs[i]["recommendation"] != "RECHECK"]
    if rec_t == "RECHECK":
        resource = "It is routed to recheck because its evidence is uncertain, so the crew is not sent until it is verified."
    elif rec_t == "INSPECT":
        resource = (f"{'One field crew is' if teams == 1 else f'{teams} field crews are'} available. "
                    + (f"Sending it here leaves {_and([w for w in waiting if w != short(target_id)])} waiting."
                       if [w for w in waiting if w != short(target_id)] else "No other incident is left waiting."))
    else:
        top = short(inspect[0]) if inspect else None
        resource = (f"With {'one crew' if teams == 1 else f'{teams} crews'}, {top} is recommended first." if top
                    else "No incident currently has a recommended inspection.")

    neighbour = None
    if t_rank >= 3:
        above = ranked[t_rank - 2]
        nd = {k: -v for k, v in diffs(target_id, above).items()}       # positive = favours the incident above
        nd_drivers = sorted([k for k in nd if nd[k] >= MIN_COMPONENT_DIFF], key=lambda k: -nd[k])[:2]
        nd_against = sorted([k for k in nd if nd[k] <= -MIN_COMPONENT_DIFF], key=lambda k: nd[k])[:1]
        n_close = abs(table[target_id]["score"] - table[above]["score"]) < CLOSE_SCORE
        n_tied = abs(table[target_id]["score"] - table[above]["score"]) < 1e-4
        if n_tied:
            ntext = (f"{short(above)} and {short(target_id)} have the same priority score; the earlier alert ranks first "
                     "under the tie-breaking policy.")
        elif n_close:
            ntext = (f"{short(above)} ranks just above {short(target_id)} by a small margin "
                     f"({table[above]['score']:.3f} vs {table[target_id]['score']:.3f}), mainly through "
                     f"{_and([COMPONENT_PHRASE[k] for k in nd_drivers]) if nd_drivers else 'several small differences'}"
                     + (f", even though {short(target_id)} has {COMPONENT_PHRASE[nd_against[0]]}." if nd_against else "."))
        elif nd_drivers:
            ntext = f"{short(above)} ranks just above {short(target_id)} because it has {_and([COMPONENT_PHRASE[k] for k in nd_drivers])}"
            ntext += f", even though {short(target_id)} has {COMPONENT_PHRASE[nd_against[0]]}." if nd_against else "."
        else:
            ntext = f"{short(above)} ranks just above {short(target_id)} by a small margin."
        neighbour = {"incident_id": above, "label": short(above), "text": ntext, "drivers": nd_drivers,
                     "against": nd_against, "close": n_close}

    pairs = []
    for o in ranked:
        if o == target_id:
            continue
        dd = diffs(target_id, o)
        pairs.append({"incident_id": o, "label": short(o), "region": regions.get(o), "rank": recs[o]["rank"],
                      "score": table[o]["score"], "score_diff": round(table[target_id]["score"] - table[o]["score"], 4),
                      "component_diffs": dd, "recommendation": recs[o]["recommendation"]})
    return {
        "compared_with": other,
        "compared_with_label": short(other),
        "relation": relation,
        "text": text,
        "close": close,
        "tied": tied,
        "tie_rule": "Equal scores are ordered by alert time (earlier alert first)." if tied else None,
        "score_diff": score_diff,
        "component_diffs": d,
        "drivers": [{"component": k, "label": COMPONENT_LABEL[k], "diff": wd[k]} for k in drivers],
        "tradeoff": ({"component": opposing[0], "label": COMPONENT_LABEL[opposing[0]], "diff": wd[opposing[0]]}
                     if opposing else None),
        "resource_note": resource,
        "neighbour": neighbour,
        "pairs": pairs,
    }


# ----------------------------------------------------------------------------- evidence reasoning
GAP_RULES: dict[str, dict] = {
    "ood": {"severity": "high", "title": "Unusual input values",
            "limitation": "This incident differs from typical training examples. Additional verification is recommended.",
            "why": "The model has seen few examples like this, so its estimate is less familiar territory.",
            "step": "Verify the observation (satellite imagery or another pass) before relying on the estimate.",
            "cautious": True},
    "single_pixel": {"severity": "high", "title": "Only one satellite pixel",
                     "limitation": "Limited evidence of continuing activity. Another observation could provide additional information.",
                     "why": "A single pixel gives limited evidence that activity is continuing.",
                     "step": "An additional qualifying satellite observation nearby may help confirm whether activity continues.",
                     "cautious": True},
    "low_confidence": {"severity": "medium", "title": "Mostly low-confidence pixels",
                       "limitation": "NASA marked most pixels low confidence, so some may not be fires.",
                       "why": "Low-confidence pixels are more often false or ambiguous detections.",
                       "step": "Look for higher-confidence detections in the next pass, or review imagery of the location.",
                       "cautious": True},
    "no_corroboration": {"severity": "medium", "title": "No recent prior detections nearby",
                         "limitation": "Historical activity offers limited support for the estimate.",
                         "why": "Without earlier nearby detections there is less sign of ongoing activity.",
                         "step": "A detection by the other satellite or a later pass may help confirm activity.",
                         "cautious": True},
    "weather_missing": {"severity": "medium", "title": "Weather information unavailable",
                        "limitation": "Some environmental inputs were unavailable and filled using training-data statistics.",
                        "why": "The estimate used typical values instead of the actual weather for that day.",
                        "step": "Updated weather information for the area may improve the evidence available for review.",
                        "cautious": True},
    "high_tree_variation": {"severity": "medium", "title": "Model trees disagree",
                            "limitation": "Individual trees in the model gave quite different estimates for this incident.",
                            "why": "Wide disagreement inside the model means the estimate is less settled.",
                            "step": "Additional observations may help; treat the estimate with caution.",
                            "cautious": True},
    "edge_of_scan": {"severity": "low", "title": "Large satellite observation footprint",
                     "limitation": "The pixel was observed at a steep angle, so its position and signal are less precise.",
                     "why": "Large footprints blur location and heat signal.",
                     "step": "A pass viewed closer to overhead may give a clearer observation.",
                     "cautious": False},
    "pa_boundary_approximate": {"severity": "low", "title": "Protected-area boundary is approximate",
                                "limitation": "Exposure uses an approximate circle around the protected area, not a verified boundary.",
                                "why": "Distances to protected areas may be over- or under-estimated.",
                                "step": "Verified protected-area boundaries would help improve the exposure assessment.",
                                "cautious": False},
}
SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def evidence_codes(flag_codes: list[str], tree_spread: float, ood_names: list[str]) -> list[str]:
    codes = list(flag_codes)
    if tree_spread >= HIGH_TREE_SPREAD:
        codes.append("high_tree_variation")
    codes.append("pa_boundary_approximate")
    return sorted(set(codes), key=lambda c: (SEVERITY_ORDER[GAP_RULES[c]["severity"]], c))


def evidence_gaps(codes: list[str], ood_names: list[str]) -> list[dict]:
    out = []
    for c in codes:
        r = GAP_RULES[c]
        title = r["title"] + (f": {', '.join(ood_names)}" if c == "ood" and ood_names else "")
        out.append({"code": c, "missing": title, "why_it_matters": r["why"], "verification_step": r["step"],
                    "keep_cautious": r["cautious"]})
    return out


def severity(code: str, corroborated: bool) -> str:
    # a single pixel is less concerning when earlier or second-satellite detections support it
    if code == "single_pixel" and corroborated:
        return "medium"
    return GAP_RULES[code]["severity"]


def limitations(codes: list[str], ood_names: list[str], corroborated: bool = False) -> list[dict]:
    out = []
    for c in codes:
        r = GAP_RULES[c]
        title = r["title"] + (f": {', '.join(ood_names)}" if c == "ood" and ood_names else "")
        out.append({"code": c, "severity": severity(c, corroborated), "title": title, "text": r["limitation"]})
    return sorted(out, key=lambda x: SEVERITY_ORDER[x["severity"]])


# ----------------------------------------------------------------------------- urgency (rule-based)
URGENCY_LABEL = {"CRITICAL_REVIEW": "Critical review", "PRIORITY_REVIEW": "Priority review",
                 "ROUTINE_MONITORING": "Routine monitoring", "INSUFFICIENT_EVIDENCE": "Insufficient evidence"}


def urgency(rec: str, prob: float, threshold: float, hours_since: float, corroborated: bool, evidence_quality: str,
            high_concerns: list[str] | None = None) -> dict:
    """Operational urgency tier: separate from the probability and the priority score. No deadlines implied."""
    high_concerns = high_concerns or []
    above = prob >= threshold
    recent = hours_since <= 12
    reasons = []
    if rec == "RECHECK":
        tier = "INSUFFICIENT_EVIDENCE"
        reasons.append("Evidence is uncertain or unusual, so verification comes before a confident urgency level.")
    elif rec == "INSPECT" and above and recent and corroborated and evidence_quality == "High" and not high_concerns:
        tier = "CRITICAL_REVIEW"
        reasons += ["Recommended for the available crew.", "Model estimate is above the validated alert threshold.",
                    f"Detected {hours_since:.1f} hours before the review time.", "Supported by earlier or second-satellite detections.",
                    "Evidence quality is high."]
    elif rec == "INSPECT" or above:
        tier = "PRIORITY_REVIEW"
        reasons.append("Recommended for the available crew." if rec == "INSPECT" else "Model estimate is above the validated alert threshold.")
        if not above:
            reasons.append("Model estimate is below the validated alert threshold.")
        if not recent:
            reasons.append(f"Detected {hours_since:.1f} hours before the review time.")
        if not corroborated:
            reasons.append("No earlier or second-satellite detection nearby.")
        if evidence_quality != "High":
            reasons.append(f"Evidence quality is {evidence_quality.lower()}.")
        for hc in high_concerns:
            reasons.append(f"Open evidence concern: {hc[0].lower() + hc[1:]}.")
    else:
        tier = "ROUTINE_MONITORING"
        reasons += ["Model estimate is below the validated alert threshold.", "Not recommended for the crew under current capacity."]
    return {"tier": tier, "label": URGENCY_LABEL[tier], "reasons": reasons, "rule_based": True}


# ----------------------------------------------------------------------------- calibration note
def calibration_note(prob: float, bins: list[dict] | None, min_n: int = 100) -> Optional[dict]:
    for b in bins or []:
        lo, hi = (float(x) for x in b["bin"].split("-"))
        if lo <= prob < hi or (hi == 1.0 and prob == 1.0):
            if b["n"] < min_n:
                return None
            return {"band": f"{lo * 100:.0f}–{hi * 100:.0f}%", "observed_rate": b["observed_rate"], "n": b["n"],
                    "text": (f"On held-out 2025 data, incidents scored {lo * 100:.0f}–{hi * 100:.0f}% had a follow-up "
                             f"detection {b['observed_rate'] * 100:.0f}% of the time (n = {b['n']:,}).")}
    return None


# ----------------------------------------------------------------------------- one-sentence summary
def _fact_clause(view: dict, raw: dict) -> Optional[str]:
    """A factual phrase for an upward model factor, only when the value supports it."""
    f = view["feature"]
    if view["imputed"]:
        return None
    v = raw.get(f)
    cmp_rank = view["comparison"]["rank"] if view.get("comparison") else None
    if f in ("prior_24h", "prior_72h", "prior_7d") and v and v >= 1:
        window = {"prior_24h": "24 hours", "prior_72h": "72 hours", "prior_7d": "7 days"}[f]
        n = int(round(v))
        return f"{n} nearby satellite detection{'s' if n != 1 else ''} in the previous {window}"
    if f == "hist_365d" and v and v >= 1:
        return f"{int(round(v))} satellite detections in this area over the past year"
    if f == "track_age_h" and v and v > 0:
        return f"activity first seen here {v:.0f} hours earlier"
    if f == "multi_sensor_2h" and v and v >= 0.5:
        return "a detection by both satellites"
    if f == "n_pixels" and v and v >= 2:
        return f"{int(round(v))} satellite pixels in the detection"
    if f == "relative_humidity_2m_min" and cmp_rank is not None and cmp_rank < 25:
        return f"lower humidity than most comparable training observations ({format_value(f, v)})"
    if f == "days_since_rain" and v and v >= 3:
        return f"{int(round(v))} days without meaningful rain"
    if f in ("frp_max", "log_frp_sum", "frp_mean") and cmp_rank is not None and cmp_rank >= 75:
        return f"higher recorded heat output than most comparable detections ({format_value(f, v)})"
    return None


def decision_summary(target_id: str, rec: str, evidence_quality: str, components: dict[str, float], views: list[dict],
                     raw: dict, pa_name: str, pa_dist_km: float, hours_since: float, prob: float,
                     ranking: dict, gaps: list[dict]) -> str:
    if rec == "RECHECK" or evidence_quality == "Low":
        main = gaps[0]["missing"] if gaps else None
        return INSUFFICIENT_SENTENCE + (f" Main concern: {main[0].lower() + main[1:]}." if main else "")

    clauses: list[tuple[float, str]] = []
    pred_clause = next((c for c in (_fact_clause(v, raw) for v in views if v["direction"] == "up") if c), None)
    clauses.append((components["prediction"], pred_clause or f"a {prob * 100:.0f}% model estimate of follow-up detection"))
    if pa_dist_km <= 0.05:
        clauses.append((components["exposure"], f"its location inside the approximate boundary of {pa_name}"))
    elif pa_dist_km <= 10:
        clauses.append((components["exposure"], f"its location about {pa_dist_km:.0f} km from {pa_name} (approximate boundary)"))
    if hours_since <= 6:
        clauses.append((components["recency"], f"a detection {hours_since:.1f} hours before the review time"))
    # evidence clauses state observed facts only (never "strong evidence")
    if raw.get("multi_sensor_2h", 0) >= 0.5 and "both satellites" not in (pred_clause or ""):
        clauses.append((components["evidence"], "detection by both satellites"))
    elif (raw.get("prior_24h") or 0) >= 1 and "previous 24 hours" not in (pred_clause or ""):
        n = int(round(raw["prior_24h"]))
        clauses.append((components["evidence"] * 0.8, f"{n} supporting detection{'s' if n != 1 else ''} in the previous 24 hours"))
    picked = [c for _, c in sorted(clauses, key=lambda x: -x[0])][:3]

    def join(items: list[str]) -> str:
        return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]

    if rec == "INSPECT":
        return f"Prioritized because of {join(picked)}."
    other = ranking.get("compared_with_label")
    drivers = [COMPONENT_PHRASE[d["component"]] for d in ranking.get("drivers", [])]
    support = [c for c in picked if "model estimate of follow-up detection" not in c][:2]
    tail = f" In its favour: {join(support)}." if support else ""
    nb = ranking.get("neighbour")
    if nb and nb["close"]:
        return f"Ranked just below {nb['label']} by a small margin; the order could change with new evidence.{tail}"
    if nb and nb["drivers"]:
        why = _and([COMPONENT_PHRASE[k] for k in nb["drivers"]])
        despite = f", despite this incident's {COMPONENT_PHRASE[nb['against'][0]].replace('a higher ', 'higher ').replace('a more ', 'more ').replace('closer ', 'closer ')}" if nb["against"] else ""
        return f"Ranked below {nb['label']}, which has {why}{despite}.{tail}"
    if ranking.get("tied") and other:
        return f"Same priority score as {other}; the order follows the tie-breaking rule (earlier alert first).{tail}"
    if ranking.get("close") and other:
        return f"Close in priority to {other}; small changes in the evidence could swap their order.{tail}"
    if ranking.get("relation") == "below" and other and drivers:
        return f"Ranked below {other}, which has {join(drivers)}.{tail}"
    return f"Lower priority under current capacity.{tail}"


def hours_from_recency(recency: float) -> float:
    return -RECENCY_SCALE_H * math.log(max(recency, 1e-9))
