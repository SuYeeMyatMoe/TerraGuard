import json
import re
import tempfile
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import explanations as X
from app import records
from app.main import app
from app.records import Records, SqliteStore
from ml import reference
from ml.config import MODEL_DIR, PROCESSED_DIR
from ml.explain import explain
from ml.feature_catalog import CATALOG, SEASON_PARTS, format_value, key_for

HAVE_MODEL = (MODEL_DIR / "model.joblib").exists() and (PROCESSED_DIR / "candidates.parquet").exists()
needs_model = pytest.mark.skipif(not HAVE_MODEL, reason="model or candidates not built")
BANNED = re.compile(r"confidence interval|likely range|tree range|extreme|dangerous|severe|drought", re.I)


@pytest.fixture(scope="module")
def bundle():
    return joblib.load(MODEL_DIR / "model.joblib")


@pytest.fixture(scope="module")
def cand():
    return pd.read_parquet(PROCESSED_DIR / "candidates.parquet")


@pytest.fixture(scope="module")
def client():
    records.set_records(Records(SqliteStore(Path(tempfile.mkdtemp()) / "r.db")))
    with TestClient(app) as c:
        yield c
    records.set_records(None)


# ----------------------------------------------------------------------------- model reasoning
@needs_model
def test_saabas_contributions_are_additive_and_match_predict_proba(bundle, cand):
    rows = cand[cand.split == "test"].sample(50, random_state=0)
    X_ = rows[bundle["features"]].astype(float).fillna(bundle["medians"]).to_numpy()
    expected = bundle["rf"].predict_proba(X_)[:, 1]
    for (_, r), p in zip(rows.iterrows(), expected):
        ex = explain(bundle, r)
        assert abs(ex["bias"] + sum(ex["contributions"].values()) - p) < 1e-6
        assert abs(ex["raw_probability"] - p) < 1e-6


def test_catalogue_covers_every_model_feature():
    from ml.features import FEATURE_COLUMNS
    for f in FEATURE_COLUMNS:
        assert key_for(f) in CATALOG, f
    assert key_for("month_sin") == key_for("month_cos") == "season"


def test_log_features_are_displayed_in_original_units():
    assert format_value("log_pa_dist_km", float(np.log1p(12.0))) == "12.0 km"
    assert format_value("log_frp_sum", float(np.log1p(31.5))) == "31.5 MW"
    assert format_value("conf_h_frac", 0.5) == "50%"
    assert format_value("prior_72h", 1.0) == "1 detection"


def test_season_halves_are_merged_by_summing():
    m = X.merged_contributions({"month_sin": 0.03, "month_cos": -0.01, "prior_7d": 0.1})
    assert abs(m["season"] - 0.02) < 1e-12 and m["prior_7d"] == 0.1


def test_relative_influence_bars():
    contrib = {"prior_7d": -0.10, "hist_365d": 0.05, "frp_max": 0.02, "is_night": -0.01, "precip_7d": 0.001}
    views = X.factor_views(contrib, {k: 1.0 for k in contrib}, set(), None, None, ref={"scopes": {}})
    assert [v["feature"] for v in views] == ["prior_7d", "hist_365d", "frp_max", "is_night"]  # ordered by |c|
    assert views[0]["influence"] == 1.0
    assert abs(views[1]["influence"] - 0.5) < 1e-9 and abs(views[2]["influence"] - 0.2) < 1e-9
    assert [v["direction"] for v in views] == ["down", "up", "up", "down"]
    assert views[0]["influence_label"] == "Strong" and views[1]["influence_label"] == "Moderate"
    assert all(v["comparison_text"] in (None, "Historical comparison unavailable.") for v in views)


# ----------------------------------------------------------------------------- training reference
@needs_model
def test_reference_is_built_from_training_rows_only(cand):
    ref = reference.load()
    assert ref is not None and ref["split"] == "train"
    train = cand[cand.split == "train"]
    assert ref["n_train_rows"] == len(train)
    f = "relative_humidity_2m_min"
    q_train = np.percentile(train[f].dropna(), reference.LEVELS)
    q_all = np.percentile(cand[f].dropna(), reference.LEVELS)
    stored = np.array(ref["scopes"]["global"]["features"][f]["q"])
    assert np.allclose(stored, q_train, atol=1e-5)
    assert not np.allclose(stored, q_all, atol=1e-5)  # would differ if val/test rows had leaked in
    assert pd.Timestamp(ref["training_period"][1]) < pd.Timestamp("2024-07-01")


def test_percentile_phrases_and_missing_reference():
    q = list(np.linspace(0, 100, 21))
    assert reference.phrase(reference.percentile_rank(5, q)) == "among the lowest 10% of"
    assert reference.phrase(reference.percentile_rank(50, q)) == "within the typical range of"
    assert reference.phrase(reference.percentile_rank(95, q)) == "among the highest 10% of"
    assert reference.compare("frp_max", 3.0, "Nowhere", 7, ref={"scopes": {}}) is None


# ----------------------------------------------------------------------------- priority reasoning
def _table(**scores):
    return {k: {"score": round(sum(v.values()), 4), "components": v} for k, v in scores.items()}


def _recs(table, recheck=()):
    order = sorted(table, key=lambda k: -table[k]["score"])  # stable: ties keep insertion (alert) order
    out, slot = {}, 1
    for r, k in enumerate(order, 1):
        rec = "RECHECK" if k in recheck else ("INSPECT" if slot else "MONITOR")
        if rec == "INSPECT":
            slot = 0
        out[k] = {"rank": r, "recommendation": rec, "reason": ""}
    return out


def test_ranking_component_differences_sum_to_score_difference():
    t = _table(**{"INC-1-A": dict(prediction=0.30, exposure=0.05, recency=0.10, evidence=0.12),
                  "INC-1-B": dict(prediction=0.20, exposure=0.20, recency=0.14, evidence=0.08),
                  "INC-1-C": dict(prediction=0.10, exposure=0.00, recency=0.05, evidence=0.05)})
    r = _recs(t)
    for target in t:
        e = X.ranking_explanation(target, t, r, {})
        assert abs(sum(e["component_diffs"].values()) - e["score_diff"]) < 1e-3
        for p in e["pairs"]:
            assert abs(sum(p["component_diffs"].values()) - p["score_diff"]) < 1e-3


def test_scenario_c_moderate_prediction_high_exposure_cites_exposure():
    t = _table(**{"INC-1-A": dict(prediction=0.18, exposure=0.25, recency=0.10, evidence=0.10),
                  "INC-1-B": dict(prediction=0.27, exposure=0.00, recency=0.10, evidence=0.10)})
    e = X.ranking_explanation("INC-1-A", t, _recs(t), {})
    assert e["relation"] == "above" and e["drivers"][0]["component"] == "exposure"
    assert "protected area" in e["text"] and "although Incident B has a higher model estimate" in e["text"]


def test_scenario_f_close_scores_use_tie_rule_and_alert_order():
    t = _table(**{"INC-1-A": dict(prediction=0.20, exposure=0.05, recency=0.10, evidence=0.10),
                  "INC-1-B": dict(prediction=0.20, exposure=0.05, recency=0.10, evidence=0.10)})
    r = _recs(t)
    assert r["INC-1-A"]["rank"] == 1  # earlier alert wins the tie
    e = X.ranking_explanation("INC-1-A", t, r, {})
    assert e["close"] and e["tied"] and "tie-breaking" in e["text"] and e["tie_rule"]


def test_close_but_unequal_scores_do_not_invoke_the_tie_rule():
    t = _table(**{"INC-1-A": dict(prediction=0.20, exposure=0.05, recency=0.10, evidence=0.10),
                  "INC-1-B": dict(prediction=0.21, exposure=0.05, recency=0.10, evidence=0.10)})
    r = _recs(t)
    e = X.ranking_explanation("INC-1-A", t, r, {})
    assert e["close"] and not e["tied"] and e["tie_rule"] is None
    assert "tie-breaking" not in e["text"] and "small margin" in e["text"]


def test_scenario_b_high_prediction_far_from_protected_area_does_not_cite_exposure():
    views = [{"feature": "prior_72h", "direction": "up", "imputed": False, "comparison": None}]
    s = X.decision_summary("INC-1-A", "INSPECT", "High",
                           dict(prediction=0.40, exposure=0.0, recency=0.1, evidence=0.12), views,
                           {"prior_72h": 3.0, "multi_sensor_2h": 0.0}, "Some Park", 140.0, 8.0, 0.88,
                           {"drivers": []}, [])
    assert "protected" not in s.lower() and "Some Park" not in s
    assert s.startswith("Prioritized because of 3 nearby satellite detections in the previous 72 hours")


def test_recheck_summary_uses_insufficient_evidence_sentence():
    s = X.decision_summary("INC-1-A", "RECHECK", "Low", dict(prediction=0.3, exposure=0, recency=0.1, evidence=0.02), [],
                           {}, "P", 50, 1, 0.6, {}, [{"missing": "Only one satellite pixel"}])
    assert s.startswith(X.INSUFFICIENT_SENTENCE) and "only one satellite pixel" in s


# ----------------------------------------------------------------------------- evidence reasoning
def test_every_gap_has_a_verification_step_and_matching_text():
    codes = X.evidence_codes(["single_pixel", "weather_missing", "ood"], 0.4, ["recorded satellite thermal signal"])
    assert {"high_tree_variation", "pa_boundary_approximate"} <= set(codes)
    gaps = {g["code"]: g for g in X.evidence_gaps(codes, ["recorded satellite thermal signal"])}
    assert "weather" in gaps["weather_missing"]["verification_step"].lower()
    assert "satellite observation" in gaps["single_pixel"]["verification_step"].lower()
    assert "recorded satellite thermal signal" in gaps["ood"]["missing"]
    assert all(g["verification_step"] for g in gaps.values())
    lims = X.limitations(codes, [], corroborated=True)
    assert next(l for l in lims if l["code"] == "single_pixel")["severity"] == "medium"
    assert lims[0]["severity"] == "high"  # sorted by severity (ood)


def test_urgency_rules():
    assert X.urgency("RECHECK", 0.9, 0.5, 1, True, "High")["tier"] == "INSUFFICIENT_EVIDENCE"
    assert X.urgency("INSPECT", 0.8, 0.5, 2, True, "High")["tier"] == "CRITICAL_REVIEW"
    assert X.urgency("INSPECT", 0.8, 0.5, 2, True, "High", ["Unusual input values"])["tier"] == "PRIORITY_REVIEW"
    assert X.urgency("INSPECT", 0.3, 0.5, 2, True, "High")["tier"] == "PRIORITY_REVIEW"
    assert X.urgency("MONITOR", 0.2, 0.5, 2, False, "Medium")["tier"] == "ROUTINE_MONITORING"


def test_calibration_note_requires_enough_samples():
    bins = [{"bin": "0.6-0.7", "mean_predicted": 0.65, "observed_rate": 0.58, "n": 4212},
            {"bin": "0.9-1.0", "mean_predicted": 0.93, "observed_rate": 0.9, "n": 12}]
    assert "58%" in X.calibration_note(0.64, bins)["text"]
    assert X.calibration_note(0.95, bins) is None


# ----------------------------------------------------------------------------- end to end (API)
def _user_facing_strings(p: dict) -> list[str]:
    out = [p["decision_summary"], p["ranking_explanation"]["text"], p["ranking_explanation"].get("resource_note", ""),
           *p["urgency"]["reasons"]]
    for f in p["explained_factors"]:
        out += [f["name"], f["meaning"], f["value_text"], f["comparison_text"] or "", f["effect_text"]]
    for g in p["confidence_guidance"]:
        out += [g["missing"], g["why_it_matters"], g["verification_step"]]
    out += [l["title"] + " " + l["text"] for l in p["evidence_limitations"]]
    return out


@needs_model
def test_api_explanations_are_distinct_grounded_and_free_of_jargon(client):
    from ml.features import FEATURE_COLUMNS
    inc = client.get("/api/incidents").json()["incidents"]
    preds = [client.post("/api/predict", json={"incident_id": i["id"]}).json() for i in inc]
    assert len({p["decision_summary"] for p in preds}) == len(preds)
    for p in preds:
        text = " ".join(_user_facing_strings(p))
        assert not BANNED.search(text), BANNED.search(text)
        assert not any(re.search(rf"\b{f}\b", text) for f in FEATURE_COLUMNS)
        assert "interval" not in p
        assert "not a statistically validated confidence interval" in p["tree_variation"]["note"]
        # factor directions agree with the sign of the recorded contribution
        for f in p["explained_factors"]:
            assert (f["contribution_pp"] > 0) == (f["direction"] == "up")
        # the ranking explanation agrees with the deterministic ranks
        rk = p["ranking_explanation"]
        other = next(c for c in p["competing"] if c["incident_id"] == rk["compared_with"])
        assert (rk["relation"] == "above") == (p["priority"]["rank"] < other["rank"])
        assert p["trace"]["priority_policy_version"].startswith("priority-v1")
    json.dumps(preds)  # serialisable


@needs_model
def test_scenario_d_missing_weather_is_disclosed(client):
    iid = client.get("/api/incidents").json()["incidents"][0]["id"]
    p = client.post("/api/predict", json={"incident_id": iid, "overrides": {
        "relative_humidity_2m_min": None, "precip_7d": None, "days_since_rain": None}}).json()
    assert any(g["code"] == "weather_missing" for g in p["confidence_guidance"])
    assert any(l["code"] == "weather_missing" for l in p["evidence_limitations"])
    assert {s["feature"] for s in p["trace"]["substituted_values"]} >= {"Lowest humidity, previous day"}
    assert all(f["value_text"].startswith("not available") for f in p["explained_factors"] if f["imputed"])


@needs_model
def test_scenario_e_unusual_inputs_lead_to_recheck_guidance(client):
    iid = client.get("/api/incidents").json()["incidents"][0]["id"]
    p = client.post("/api/predict", json={"incident_id": iid, "overrides": {"frp_max": 9000, "prior_7d": 5000}}).json()
    assert p["priority"]["recommendation"] == "RECHECK"
    assert p["urgency"]["tier"] == "INSUFFICIENT_EVIDENCE"
    assert p["decision_summary"].startswith(X.INSUFFICIENT_SENTENCE)
    assert any(g["code"] == "ood" and g["keep_cautious"] for g in p["confidence_guidance"])


@needs_model
def test_scenario_a_top_incident_explains_its_rank(client):
    inc = client.get("/api/incidents").json()["incidents"]
    preds = [client.post("/api/predict", json={"incident_id": i["id"]}).json() for i in inc]
    top = next(p for p in preds if p["priority"]["rank"] == 1)
    if top["priority"]["recommendation"] == "INSPECT":
        assert top["decision_summary"].startswith("Prioritized because")
        assert "ranks above" in top["ranking_explanation"]["text"] or top["ranking_explanation"]["close"]
        assert "available" in top["ranking_explanation"]["resource_note"]


@needs_model
def test_deterministic_fallback_on_real_package_passes_validation(client):
    from app.ai.fallback import briefing
    from app.ai.validate import validate_briefing
    from app.evidence import build_package
    from app.service import store
    for i in client.get("/api/incidents").json()["incidents"]:
        s = store()
        pred = s.predict(i["id"], 1)
        pkg = build_package(s.incident(i["id"]), pred, 1)
        ok, problems = validate_briefing(briefing(pkg, pred["priority"]["recommendation"]), pkg, pred["priority"]["recommendation"])
        assert ok is not None, problems


@needs_model
def test_single_pixel_incidents_are_never_critical(client):
    for i in client.get("/api/incidents").json()["incidents"]:
        p = client.post("/api/predict", json={"incident_id": i["id"]}).json()
        if any(l["code"] == "single_pixel" for l in p["evidence_limitations"]):
            assert p["urgency"]["tier"] != "CRITICAL_REVIEW"
