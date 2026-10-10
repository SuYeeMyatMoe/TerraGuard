"""Per-prediction explanation for the Random Forest.

* Path contributions (Saabas): for each tree, the change in positive-class probability at every split is
  credited to the split feature; contributions are averaged over trees. bias + sum(contrib) == probability.
* Uncertainty: 10th-90th percentile of per-tree probabilities.
* Out-of-distribution: features outside the training 1st-99th percentile envelope.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .features import FEATURE_LABELS


def _tree_pos_prob(tree) -> np.ndarray:
    v = tree.tree_.value[:, 0, :]
    v = v / np.clip(v.sum(axis=1, keepdims=True), 1e-12, None)
    return v[:, 1]


_PROB_CACHE: dict[int, list[np.ndarray]] = {}


def _tree_probs(rf) -> list[np.ndarray]:
    """Per-node positive-class probability for every tree, computed once per loaded model."""
    key = id(rf)
    if key not in _PROB_CACHE:
        _PROB_CACHE[key] = [_tree_pos_prob(est) for est in rf.estimators_]
    return _PROB_CACHE[key]


def path_contributions(rf, x: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
    """Return (bias, contributions[n_features], per_tree_probabilities)."""
    # sklearn routes samples with float32 features; do the same so paths (and probabilities) match predict_proba
    x = np.asarray(x, dtype=np.float32).astype(np.float64)
    n_feat = x.shape[0]
    contrib = np.zeros(n_feat)
    bias = 0.0
    per_tree = []
    for est, prob in zip(rf.estimators_, _tree_probs(rf)):
        t = est.tree_
        node = 0
        bias += prob[0]
        while t.children_left[node] != -1:
            f = t.feature[node]
            nxt = t.children_left[node] if x[f] <= t.threshold[node] else t.children_right[node]
            contrib[f] += prob[nxt] - prob[node]
            node = nxt
        per_tree.append(prob[node])
    n = len(rf.estimators_)
    return bias / n, contrib / n, np.array(per_tree)


def describe_factor(feature: str, value: float, weight: float) -> str:
    label = FEATURE_LABELS.get(feature, feature)
    direction = "raises" if weight > 0 else "lowers"
    if feature in ("is_night", "multi_sensor_2h", "weather_missing"):
        shown = "yes" if value >= 0.5 else "no"
    elif feature == "log_pa_dist_km":
        label, shown = "Distance to protected area (km)", f"{np.expm1(value):.1f}"
    elif feature == "log_frp_sum":
        label, shown = "Total radiative power (MW)", f"{np.expm1(value):.1f}"
    elif feature in ("month_sin", "month_cos"):
        shown = "seasonal timing"
    elif abs(value) >= 100:
        shown = f"{value:.0f}"
    else:
        shown = f"{value:.2f}".rstrip("0").rstrip(".")
    return f"{label}: {shown} — {direction} the estimate"


def explain(bundle: dict, row: pd.Series, top: int = 4) -> dict:
    feats = bundle["features"]
    raw = row[feats].astype(float)
    missing = [f for f in feats if pd.isna(raw[f])]
    x = raw.fillna(bundle["medians"]).to_numpy()
    rf = bundle["rf"]
    bias, contrib, per_tree = path_contributions(rf, x)
    prob = float(np.clip(bias + contrib.sum(), 0, 1))
    lo, hi = np.percentile(per_tree, [10, 90])
    order = np.argsort(-np.abs(contrib))
    factors = []
    for i in order:
        if feats[i] in ("month_cos",) and any(f["feature"] == "month_sin" for f in factors):
            continue
        factors.append({
            "feature": feats[i],
            "label": FEATURE_LABELS.get(feats[i], feats[i]),
            "value": round(float(x[i]), 4),
            "weight": round(float(contrib[i]), 4),
            "direction": "up" if contrib[i] > 0 else "down",
            "text": describe_factor(feats[i], float(x[i]), float(contrib[i])),
        })
        if len(factors) >= top:
            break
    ood = []
    for f in feats:
        v = raw[f]
        if pd.isna(v) or f in ("month_sin", "month_cos", "is_night", "multi_sensor_2h", "weather_missing"):
            continue
        if v < bundle["q01"][f] or v > bundle["q99"][f]:
            ood.append(f)
    return {
        "probability": round(prob, 4),
        "interval": [round(float(lo), 4), round(float(hi), 4)],
        "tree_spread": round(float(hi - lo), 4),
        "factors": factors,
        "missing_features": missing,
        "ood_features": ood,
        # full additive decomposition (probability units): bias + sum(contributions) == probability
        "bias": float(bias),
        "contributions": {f: float(c) for f, c in zip(feats, contrib)},
        "values": {f: float(v) for f, v in zip(feats, x)},
        "raw_probability": float(bias + contrib.sum()),
    }
