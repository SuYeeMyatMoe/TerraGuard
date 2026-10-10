"""Train and evaluate the historical-frequency baseline and the Random Forest.

* Hyperparameters and alert thresholds are selected on the validation split only.
* The test split is scored once, after selection, and reported as-is.
* If the RF does not beat the baseline on validation PR-AUC, the baseline is served.

Usage:  python -m ml.train
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss, f1_score, precision_recall_curve,
                             precision_score, recall_score, roc_auc_score)

from .config import LABEL_HORIZON_H, MODEL_DIR, PROCESSED_DIR
from .features import FEATURE_COLUMNS

MODEL_VERSION = "rf-48h-v1"
TARGET = ("Probability that a qualifying VIIRS hotspot is detected within 2 km in a distinct later satellite pass "
          f"between 3 and {LABEL_HORIZON_H} hours after this observation.")
DAILY_CAPACITY_K = 5  # inspections per day used for Precision@K


def _prep(df: pd.DataFrame, medians: pd.Series) -> np.ndarray:
    return df[FEATURE_COLUMNS].astype(float).fillna(medians).to_numpy()


def choose_threshold(y: np.ndarray, p: np.ndarray, max_fpr: float = 0.15) -> float:
    """Maximise F1 on validation subject to a false-positive-rate cap (false-alarm control)."""
    best_t, best_f1 = 0.5, -1.0
    neg = max((y == 0).sum(), 1)
    for t in np.unique(np.round(p, 3)):
        pred = p >= t
        fpr = (pred & (y == 0)).sum() / neg
        if fpr > max_fpr:
            continue
        f1 = f1_score(y, pred, zero_division=0)
        if f1 > best_f1:
            best_t, best_f1 = float(t), f1
    return best_t


def precision_at_k_daily(df: pd.DataFrame, score: np.ndarray, k: int = DAILY_CAPACITY_K) -> float:
    d = df.assign(score=score, day=pd.to_datetime(df.t_ns, utc=True).dt.date)
    vals = []
    for _, g in d.groupby("day"):
        if len(g) < k:
            continue
        vals.append(g.nlargest(k, "score")["y"].mean())
    return float(np.mean(vals)) if vals else float("nan")


def metrics(df: pd.DataFrame, y: np.ndarray, p: np.ndarray, thr: float) -> dict:
    pred = p >= thr
    neg = max((y == 0).sum(), 1)
    return {
        "n": int(len(y)),
        "positive_rate": round(float(y.mean()), 4),
        "threshold": round(thr, 4),
        "precision": round(float(precision_score(y, pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y, pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y, pred, zero_division=0)), 4),
        "pr_auc": round(float(average_precision_score(y, p)), 4),
        "roc_auc": round(float(roc_auc_score(y, p)), 4),
        "false_positive_rate": round(float((pred & (y == 0)).sum() / neg), 4),
        "false_alarms": int((pred & (y == 0)).sum()),
        "precision_at_k_daily": round(precision_at_k_daily(df, p), 4),
        "brier": round(float(brier_score_loss(y, np.clip(p, 0, 1))), 4),
    }


def reliability(y: np.ndarray, p: np.ndarray, bins: int = 10) -> list[dict]:
    edges = np.linspace(0, 1, bins + 1)
    out = []
    for a, b in zip(edges[:-1], edges[1:]):
        m = (p >= a) & (p < b if b < 1 else p <= b)
        if m.sum() == 0:
            continue
        out.append({"bin": f"{a:.1f}-{b:.1f}", "mean_predicted": round(float(p[m].mean()), 4),
                    "observed_rate": round(float(y[m].mean()), 4), "n": int(m.sum())})
    return out


def pr_points(y: np.ndarray, p: np.ndarray, n: int = 40) -> list[dict]:
    prec, rec, _ = precision_recall_curve(y, p)
    idx = np.linspace(0, len(prec) - 1, min(n, len(prec))).astype(int)
    return [{"recall": round(float(rec[i]), 4), "precision": round(float(prec[i]), 4)} for i in idx]


def main() -> None:
    cand = pd.read_parquet(PROCESSED_DIR / "candidates.parquet")
    tr, va, te = (cand[cand.split == s].reset_index(drop=True) for s in ("train", "val", "test"))
    medians = tr[FEATURE_COLUMNS].astype(float).median()
    Xtr, Xva, Xte = _prep(tr, medians), _prep(va, medians), _prep(te, medians)
    ytr, yva, yte = tr.y.to_numpy(), va.y.to_numpy(), te.y.to_numpy()

    # ---- baseline: historical hotspot frequency (prior 365 d in the 0.1 degree cell), calibrated on train
    base = LogisticRegression().fit(np.log1p(tr[["hist_365d"]].to_numpy()), ytr)
    b_va = base.predict_proba(np.log1p(va[["hist_365d"]].to_numpy()))[:, 1]
    b_te = base.predict_proba(np.log1p(te[["hist_365d"]].to_numpy()))[:, 1]
    b_thr = choose_threshold(yva, b_va)

    # ---- Random Forest: small grid, selected on validation PR-AUC
    grid = [{"max_depth": d, "min_samples_leaf": l} for d in (6, 10, 14) for l in (5, 20)]
    best, best_ap = None, -1.0
    search = []
    for g in grid:
        rf = RandomForestClassifier(n_estimators=250, class_weight="balanced_subsample", n_jobs=-1,
                                    random_state=42, **g).fit(Xtr, ytr)
        ap = average_precision_score(yva, rf.predict_proba(Xva)[:, 1])
        search.append({**g, "val_pr_auc": round(float(ap), 4)})
        if ap > best_ap:
            best, best_ap = rf, ap
    r_va = best.predict_proba(Xva)[:, 1]
    r_thr = choose_threshold(yva, r_va)
    r_te = best.predict_proba(Xte)[:, 1]  # test touched once, after selection

    base_val_ap = average_precision_score(yva, b_va)
    chosen = "random_forest" if best_ap > base_val_ap else "baseline"

    # training-distribution envelope for out-of-distribution flags
    q01 = tr[FEATURE_COLUMNS].astype(float).quantile(0.01)
    q99 = tr[FEATURE_COLUMNS].astype(float).quantile(0.99)
    importances = sorted(zip(FEATURE_COLUMNS, best.feature_importances_), key=lambda x: -x[1])

    bundle = {
        "version": MODEL_VERSION, "rf": best, "baseline": base, "chosen": chosen,
        "features": FEATURE_COLUMNS, "medians": medians, "q01": q01, "q99": q99,
        "threshold_rf": r_thr, "threshold_baseline": b_thr, "target": TARGET,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    joblib.dump(bundle, MODEL_DIR / "model.joblib", compress=3)

    evaluation = {
        "model_version": MODEL_VERSION,
        "target": TARGET,
        "chosen_model": chosen,
        "selection_rule": "Random Forest is served only if its validation PR-AUC exceeds the baseline's.",
        "threshold_rule": "Maximise validation F1 subject to false-positive rate <= 15%.",
        "daily_capacity_k": DAILY_CAPACITY_K,
        "hyperparameter_search": search,
        "baseline": {"name": "Historical hotspot frequency (0.1° cell, prior 365 days)",
                     "val": metrics(va, yva, b_va, b_thr), "test": metrics(te, yte, b_te, b_thr),
                     "pr_curve_test": pr_points(yte, b_te), "reliability_test": reliability(yte, b_te)},
        "random_forest": {"name": "Random Forest (250 trees, balanced class weights)",
                          "params": {k: v for k, v in best.get_params().items() if k in ("max_depth", "min_samples_leaf", "n_estimators")},
                          "val": metrics(va, yva, r_va, r_thr), "test": metrics(te, yte, r_te, r_thr),
                          "pr_curve_test": pr_points(yte, r_te), "reliability_test": reliability(yte, r_te),
                          "top_features": [{"feature": f, "importance": round(float(i), 4)} for f, i in importances[:10]]},
        "generated_at": bundle["trained_at"],
    }
    (PROCESSED_DIR / "evaluation.json").write_text(json.dumps(evaluation, indent=2))

    def row(name, m):
        return f"{name:<22}{m['pr_auc']:>8}{m['precision']:>10}{m['recall']:>8}{m['f1']:>7}{m['false_positive_rate']:>7}{m['precision_at_k_daily']:>8}{m['brier']:>8}"
    print(f"{'':<22}{'PR-AUC':>8}{'Precision':>10}{'Recall':>8}{'F1':>7}{'FPR':>7}{'P@K':>8}{'Brier':>8}")
    for split in ("val", "test"):
        print(row(f"baseline/{split}", evaluation["baseline"][split]))
        print(row(f"random_forest/{split}", evaluation["random_forest"][split]))
    print(f"chosen model: {chosen}")


if __name__ == "__main__":
    main()
