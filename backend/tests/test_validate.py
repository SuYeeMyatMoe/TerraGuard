from app.ai.fallback import briefing, field_brief
from app.ai.validate import validate_briefing, validate_field_brief

PKG = {"incident_id": "INC-1", "facts": [
    {"evidence_id": "OBS_ID", "label": "Incident reference", "value": "INC-1", "unit": None, "source": "x"},
    {"evidence_id": "OBS_REGION", "label": "Region", "value": "Riau, Indonesia", "unit": None, "source": "x"},
    {"evidence_id": "OBS_TIME", "label": "Time", "value": "2025-07-23T05:06:00Z", "unit": None, "source": "x"},
    {"evidence_id": "OBS_PIXELS", "label": "Pixels", "value": 3, "unit": "pixels", "source": "x"},
    {"evidence_id": "PRED_PROB", "label": "Probability", "value": "62%", "unit": None, "source": "x"},
    {"evidence_id": "RECOMMENDATION", "label": "Rec", "value": "INSPECT", "unit": None, "source": "x"},
    {"evidence_id": "EVID_QUALITY", "label": "Evidence", "value": "High", "unit": None, "source": "x"},
    {"evidence_id": "RANK_ORDER", "label": "Order", "value": "INC-20250723-A > INC-20250723-B", "unit": None, "source": "x"},
    {"evidence_id": "URGENCY", "label": "Urgency", "value": "High", "unit": None, "source": "x"},
]}


def _s(text, ids):
    return {"text": text, "evidence_ids": ids}


def _good():
    return {
        "incident_summary": _s("Three hotspot pixels were detected in Riau, Indonesia on 2025-07-23.", ["OBS_PIXELS", "OBS_REGION"]),
        "why_prediction": _s("There is a 62% chance of another satellite detection nearby within 48 hours.", ["PRED_PROB"]),
        "why_priority": _s("The incident has high evidence quality and ranks first.", ["EVID_QUALITY"]),
        "comparison_with_next_incident": _s("Incident A ranks above Incident B in the deterministic order.", ["RANK_ORDER"]),
        "uncertainties": _s("Human verification is required; this is not a forecast.", ["EVID_QUALITY"]),
        "what_would_improve_confidence": _s("Another satellite observation may help confirm activity.", ["EVID_QUALITY"]),
        "recommended_next_step": {**_s("Assign a field verification visit.", ["RECOMMENDATION"]), "recommendation": "INSPECT"},
    }


def test_valid_briefing_passes():
    ok, problems = validate_briefing(_good(), PKG, "INSPECT")
    assert ok is not None, problems


def test_fabricated_number_rejected():
    b = _good()
    b["why_prediction"]["text"] = "There is an 87% chance of another detection within 48 hours."
    ok, problems = validate_briefing(b, PKG, "INSPECT")
    assert ok is None and any("87" in p for p in problems)


def test_changed_recommendation_rejected():
    b = _good()
    b["recommended_next_step"]["recommendation"] = "MONITOR"
    ok, problems = validate_briefing(b, PKG, "INSPECT")
    assert ok is None and any("Recommendation changed" in p for p in problems)


def test_accusation_rejected():
    b = _good()
    b["why_priority"]["text"] = "This looks like illegal burning by plantation workers."
    ok, problems = validate_briefing(b, PKG, "INSPECT")
    assert ok is None and any("illegal" in p for p in problems)


def test_forecast_claim_rejected_but_negation_allowed():
    b = _good()
    b["uncertainties"]["text"] = "The fire will spread toward the park."
    assert validate_briefing(b, PKG, "INSPECT")[0] is None
    assert validate_briefing(_good(), PKG, "INSPECT")[0] is not None  # "not a forecast" is fine


def test_unknown_evidence_id_rejected():
    b = _good()
    b["incident_summary"]["evidence_ids"] = ["MADE_UP"]
    assert validate_briefing(b, PKG, "INSPECT")[0] is None


def test_deterministic_fallbacks_validate():
    ok, problems = validate_briefing(briefing(PKG, "INSPECT"), PKG, "INSPECT")
    assert ok is not None, problems
    ok, problems = validate_field_brief(field_brief(PKG, "INSPECT"), PKG)
    assert ok is not None, problems


def test_wrong_ranking_claim_rejected():
    b = _good()
    b["comparison_with_next_incident"]["text"] = "Incident B ranks above Incident A because it is more recent."
    ok, problems = validate_briefing(b, PKG, "INSPECT")
    assert ok is None and any("Ranking claim" in p for p in problems)
    b["comparison_with_next_incident"]["text"] = "Incident A ranks above Incident B overall."
    assert validate_briefing(b, PKG, "INSPECT")[0] is not None


def test_unknown_incident_and_restated_urgency_rejected():
    b = _good()
    b["why_priority"]["text"] = "Compared with INC-20250723-Z this case has critical urgency."
    ok, problems = validate_briefing(b, PKG, "INSPECT")
    assert ok is None
    assert any("not in the evidence" in p for p in problems) and any("urgency" in p for p in problems)


def test_confidence_interval_claims_rejected_but_caveat_allowed():
    b = _good()
    b["uncertainties"]["text"] = "The 95% confidence interval is 45% to 62%."
    assert validate_briefing(b, PKG, "INSPECT")[0] is None
    b["uncertainties"]["text"] = "Tree variation is not a statistically validated confidence interval."
    assert validate_briefing(b, PKG, "INSPECT")[0] is not None


def test_causation_claims_rejected():
    b = _good()
    b["why_prediction"]["text"] = "The fire was caused by land clearing near the road."
    assert validate_briefing(b, PKG, "INSPECT")[0] is None


def test_matching_urgency_and_ordinary_words_are_allowed():
    b = _good()
    b["why_priority"]["text"] = "This incident has high urgency; the model estimate is low compared with its high evidence quality."
    ok, problems = validate_briefing(b, PKG, "INSPECT")
    assert ok is not None, problems
