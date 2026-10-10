"""Anomaly / suspicious-pattern layer (verification aid, NOT an illegality classifier).

Two parts, both fitted on the TRAINING split only:
  1. Isolation Forest on the model's features -> anomaly score. "Unusual" = above the 95th percentile of
     validation-split scores (threshold chosen on validation, never on test).
  2. Transparent pattern rules with thresholds taken from training percentiles, producing one of:
       insufficient_evidence | static_source_like | cluster_anomaly | suspected_clearing_pattern |
       persistent_recurring | isolated_normal
     "Suspected clearing-related pattern" means *resemblance* to repeated low-intensity burning in an area with
     a long detection history. It is not evidence of land clearing or of illegality and always requires verification.

Usage:  python -m ml.anomaly     (writes data/model/anomaly.joblib + data/processed/anomaly_eval.json)
"""
from __future__ import annotations

import json
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from .config import MODEL_DIR, PROCESSED_DIR
from .feature_catalog import format_value
from .features import FEATURE_COLUMNS

OUT = MODEL_DIR / "anomaly.joblib"
EVAL = PROCESSED_DIR / "anomaly_eval.json"

PATTERN_LABEL = {
    "insufficient_evidence": "Insufficient evidence",
    "static_source_like": "Unusual static-source-like pattern",
    "cluster_anomaly": "Cluster anomaly",
    "suspected_clearing_pattern": "Suspected clearing-related burning pattern",
    "persistent_recurring": "Persistent recurring hotspot",
    "isolated_normal": "Normal isolated hotspot",
}
PATTERN_MEANING = {
    "insufficient_evidence": "The observations are too weak or unusual to characterise the pattern. Verify first.",
    "static_source_like": "Very frequent detections at the same spot over the past year, which can indicate an industrial or other static heat source rather than vegetation fire. Verify the source.",
    "cluster_anomaly": "An unusually dense cluster of detections compared with training observations.",
    "suspected_clearing_pattern": "Repeated low-intensity detections in an area with a long detection history. This resembles land-management or clearing-related burning, but it is not evidence of clearing or of illegality.",
    "persistent_recurring": "Activity has been detected here repeatedly in recent days.",
    "isolated_normal": "A single or isolated detection that resembles common hotspots in the training data.",
}


def _matrix(df: pd.DataFrame, medians: pd.Series) -> np.ndarray:
    return df[FEATURE_COLUMNS].astype(float).fillna(medians).to_numpy()


def build() -> dict:
    cand = pd.read_parquet(PROCESSED_DIR / "candidates.parquet")
    tr, va, te = (cand[cand.split == s] for s in ("train", "val", "test"))
    medians = tr[FEATURE_COLUMNS].astype(float).median()
    iso = IsolationForest(n_estimators=200, max_samples=4096, random_state=42, n_jobs=-1).fit(_matrix(tr, medians))
    # score: higher = more anomalous
    s_va = -iso.score_samples(_matrix(va, medians))
    s_te = -iso.score_samples(_matrix(te, medians))
    threshold = float(np.percentile(s_va, 95))
    q = lambda col, p: float(np.nanpercentile(tr[col].astype(float), p))  # noqa: E731
    rules = {
        "hist_365d_p99": q("hist_365d", 99), "hist_365d_p75": q("hist_365d", 75),
        "n_pixels_p95": q("n_pixels", 95), "prior_24h_p95": q("prior_24h", 95),
        "frp_max_p50": q("frp_max", 50), "frp_max_p90": q("frp_max", 90),
    }
    bundle = {"iso": iso, "medians": medians, "threshold": threshold, "rules": rules,
              "val_scores": np.sort(s_va)[:: max(len(s_va) // 2000, 1)]}
    joblib.dump(bundle, OUT, compress=3)

    def describe(df: pd.DataFrame, scores: np.ndarray) -> dict:
        flagged = scores > threshold
        y = df["y"].to_numpy()
        return {"n": int(len(df)), "flagged_share": round(float(flagged.mean()), 4),
                "followup_rate_flagged": round(float(y[flagged].mean()), 4) if flagged.any() else None,
                "followup_rate_not_flagged": round(float(y[~flagged].mean()), 4) if (~flagged).any() else None}

    ev = {"method": "Isolation Forest (200 trees) on the 26 model features, fitted on training rows only",
          "threshold_rule": "Unusual = anomaly score above the 95th percentile of validation-split scores",
          "threshold": round(threshold, 5), "rules": {k: round(v, 3) for k, v in rules.items()},
          "validation": describe(va, s_va), "test": describe(te, s_te),
          "note": "Descriptive only. 'Unusual' means unlike training observations; it is not a finding of wrongdoing."}
    EVAL.write_text(json.dumps(ev, indent=2))
    return ev


@lru_cache(maxsize=1)
def load() -> dict | None:
    return joblib.load(OUT) if OUT.exists() else None


def assess(row: pd.Series, evidence_quality: str, model=None) -> dict:
    """Anomaly score + pattern category + plain-language proof for one candidate."""
    m = model if model is not None else load()
    v = {f: (None if pd.isna(row.get(f)) else float(row.get(f))) for f in FEATURE_COLUMNS}
    proof: list[str] = []
    score = pct = None
    unusual = False
    if m is not None:
        x = np.array([[v[f] if v[f] is not None else float(m["medians"][f]) for f in FEATURE_COLUMNS]])
        score = float(-m["iso"].score_samples(x)[0])
        pct = round(float((m["val_scores"] < score).mean() * 100), 1)
        unusual = score > m["threshold"]
        if unusual:
            proof.append(f"The overall combination of observations is more unusual than {pct:.0f}% of validation incidents.")
    r = m["rules"] if m is not None else {}
    g = lambda f: v.get(f) or 0.0  # noqa: E731

    if evidence_quality == "Low":
        cat = "insufficient_evidence"
    elif r and g("hist_365d") >= r["hist_365d_p99"] and g("prior_7d") >= 5:
        cat = "static_source_like"
        proof.append(f"{format_value('hist_365d', g('hist_365d'))} at this spot in the past year (top 1% of training observations).")
        proof.append(f"{format_value('prior_7d', g('prior_7d'))} nearby in the previous 7 days.")
    elif r and (g("n_pixels") >= r["n_pixels_p95"] or g("prior_24h") >= r["prior_24h_p95"]):
        cat = "cluster_anomaly"
        proof.append(f"{format_value('n_pixels', g('n_pixels'))} in this detection and {format_value('prior_24h', g('prior_24h'))} "
                     "nearby in the previous 24 hours: a denser cluster than 95% of training observations.")
    elif r and g("prior_7d") >= 3 and g("frp_max") <= r["frp_max_p50"] and g("hist_365d") >= r["hist_365d_p75"]:
        cat = "suspected_clearing_pattern"
        proof.append(f"Repeated detections ({format_value('prior_7d', g('prior_7d'))} in 7 days) with low recorded heat output "
                     f"({format_value('frp_max', g('frp_max'))}, at or below the training median).")
        proof.append(f"Long detection history in the area ({format_value('hist_365d', g('hist_365d'))} in the past year).")
    elif g("track_age_h") >= 24 or g("prior_72h") >= 3:
        cat = "persistent_recurring"
        if g("track_age_h") >= 24:
            proof.append(f"Activity first seen here {g('track_age_h'):.0f} hours earlier.")
        if g("prior_72h") >= 3:
            proof.append(f"{format_value('prior_72h', g('prior_72h'))} nearby in the previous 72 hours.")
    else:
        cat = "isolated_normal"
        proof.append("No repeated or dense detections nearby in the recent record.")
    return {
        "pattern": cat, "label": PATTERN_LABEL[cat], "meaning": PATTERN_MEANING[cat],
        "anomaly_score": None if score is None else round(score, 4), "anomaly_percentile": pct, "unusual": bool(unusual),
        "proof": proof, "requires_verification": cat != "isolated_normal",
        "disclaimer": "Pattern categories describe satellite observations only. They do not establish cause, intent or illegality.",
    }


if __name__ == "__main__":
    print(json.dumps(build(), indent=2))
