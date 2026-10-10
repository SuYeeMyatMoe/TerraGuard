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
]}


def _s(text, ids):
    return {"text": text, "evidence_ids": ids}


def _good():
    return {
        "summary": _s("Three hotspot pixels were detected in Riau, Indonesia on 2025-07-23.", ["OBS_PIXELS", "OBS_REGION"]),
        "why_matters": _s("The incident has high evidence quality and ranks first.", ["EVID_QUALITY"]),
        "prediction_interpretation": _s("There is a 62% chance of another satellite detection nearby within 48 hours.", ["PRED_PROB"]),
        "recommended_next_step": {**_s("Assign a field verification visit.", ["RECOMMENDATION"]), "recommendation": "INSPECT"},
        "uncertainty": _s("Human verification is required; this is not a forecast.", ["EVID_QUALITY"]),
    }


def test_valid_briefing_passes():
    ok, problems = validate_briefing(_good(), PKG, "INSPECT")
    assert ok is not None, problems


def test_fabricated_number_rejected():
    b = _good()
    b["prediction_interpretation"]["text"] = "There is an 87% chance of another detection within 48 hours."
    ok, problems = validate_briefing(b, PKG, "INSPECT")
    assert ok is None and any("87" in p for p in problems)


def test_changed_recommendation_rejected():
    b = _good()
    b["recommended_next_step"]["recommendation"] = "MONITOR"
    ok, problems = validate_briefing(b, PKG, "INSPECT")
    assert ok is None and any("Recommendation changed" in p for p in problems)


def test_accusation_rejected():
    b = _good()
    b["why_matters"]["text"] = "This looks like illegal burning by plantation workers."
    ok, problems = validate_briefing(b, PKG, "INSPECT")
    assert ok is None and any("illegal" in p for p in problems)


def test_forecast_claim_rejected_but_negation_allowed():
    b = _good()
    b["uncertainty"]["text"] = "The fire will spread toward the park."
    assert validate_briefing(b, PKG, "INSPECT")[0] is None
    assert validate_briefing(_good(), PKG, "INSPECT")[0] is not None  # "not a forecast" is fine


def test_unknown_evidence_id_rejected():
    b = _good()
    b["summary"]["evidence_ids"] = ["MADE_UP"]
    assert validate_briefing(b, PKG, "INSPECT")[0] is None


def test_deterministic_fallbacks_validate():
    ok, problems = validate_briefing(briefing(PKG, "INSPECT"), PKG, "INSPECT")
    assert ok is not None, problems
    ok, problems = validate_field_brief(field_brief(PKG, "INSPECT"), PKG)
    assert ok is not None, problems
