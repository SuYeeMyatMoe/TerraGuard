"""48-hour satellite-detected fire footprint forecast (two-part / hurdle model).

Target (per candidate): the number of UNIQUE VIIRS pixel locations with nominal/high confidence detected within
FOOTPRINT_RADIUS_KM of the candidate between t + LABEL_MIN_H and t + LABEL_HORIZON_H. Locations are de-duplicated
on a ~375 m grid, so SNPP and NOAA-20 seeing the same pixel count once. Area = cells x 0.1406 km^2 (a 375 m nadir
pixel; real pixels grow off-nadir, so this is an approximation).

This is a forecast of the *satellite-detected fire footprint*, NOT mapped burned area: VIIRS sees active heat at
overpass time only, misses fires under cloud and between passes, and cannot see the burn scar.

Why two parts: about two thirds of incidents have no further detection at all, so a single median model collapses
to "zero" for almost everyone (our first attempt did exactly that: Spearman 0.03). Instead:
  1. P(any footprint)  — HistGradientBoostingClassifier.
  2. Size if activity continues — on positive cases only: quantiles q10/q50/q90 of log1p(cells) and a Poisson mean.
  Expected footprint = P(any) x E[cells | any].
Features: the classifier's FEATURE_COLUMNS plus `past_cells_24h` (unique cells in the 24 h up to the alert;
past-only, available at alert time). Fitted on TRAIN; validation only reports quantile crossing; test touched once.
Baselines: persistence (past 24 h cells as the 48 h forecast) and climatology (training mean by country x month).

Usage:  python -m ml.footprint   (writes data/model/footprint.joblib, data/processed/footprint_targets.parquet,
                                  data/processed/footprint_eval.json)
"""
from __future__ import annotations

import json
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import brier_score_loss, roc_auc_score

from .config import FOOTPRINT_RADIUS_KM, LABEL_HORIZON_H, LABEL_MIN_H, MODEL_DIR, PROCESSED_DIR, RAW_DIR
from .features import FEATURE_COLUMNS
from .incidents import H, SpatialIndex, load_detections

OUT = MODEL_DIR / "footprint.joblib"
TARGETS = PROCESSED_DIR / "footprint_targets.parquet"
EVAL = PROCESSED_DIR / "footprint_eval.json"
PIXEL_KM2 = 0.375 * 0.375          # 0.1406 km^2 at nadir
GRID_DEG = 0.375 / 111.32          # ~375 m de-duplication grid
QUANTILES = (0.1, 0.5, 0.9)
NOTE = "Forecast of satellite-detected fire footprint (VIIRS pixel area), not mapped burned area."
HGB = dict(max_iter=300, learning_rate=0.06, max_leaf_nodes=31, min_samples_leaf=50, l2_regularization=1.0, random_state=42)


def unique_cells(lat: np.ndarray, lon: np.ndarray) -> int:
    if len(lat) == 0:
        return 0
    return int(len({(a, b) for a, b in zip(np.floor(lat / GRID_DEG).astype(np.int64), np.floor(lon / GRID_DEG).astype(np.int64))}))


def count_targets(cand: pd.DataFrame, det: pd.DataFrame, radius_km: float = FOOTPRINT_RADIUS_KM) -> pd.DataFrame:
    """future_cells_48h (NaN when censored) and past_cells_24h for every candidate."""
    keep = det[det["conf"] >= 1]
    idx = SpatialIndex(keep.latitude, keep.longitude, keep.t_ns)
    data_end = int(det.t_ns.max())
    lat, lon, t = cand.lat.to_numpy(), cand.lon.to_numpy(), cand.t_ns.to_numpy()
    fut = np.full(len(cand), np.nan)
    past = np.zeros(len(cand), dtype=np.int64)
    pass_end = 10 * 60 * 10**9  # include the alert's own pass
    for k in range(len(cand)):
        ids = idx.query(lat[k], lon[k], t[k] - 24 * H, t[k] + pass_end, radius_km)
        past[k] = unique_cells(idx.lat[ids], idx.lon[ids])
        if t[k] + LABEL_HORIZON_H * H > data_end:
            continue
        ids = idx.query(lat[k], lon[k], t[k] + LABEL_MIN_H * H, t[k] + LABEL_HORIZON_H * H + 1, radius_km)
        fut[k] = unique_cells(idx.lat[ids], idx.lon[ids])
    return pd.DataFrame({"candidate_id": cand.candidate_id.to_numpy(), "past_cells_24h": past, "future_cells_48h": fut})


def _X(df: pd.DataFrame, medians: pd.Series) -> np.ndarray:
    x = df[FEATURE_COLUMNS].astype(float).fillna(medians)
    return np.column_stack([x.to_numpy(), np.log1p(df["past_cells_24h"].to_numpy(dtype=float))])


def _predict(b: dict, X: np.ndarray) -> dict[str, np.ndarray]:
    """p_any, conditional q10/q50/q90 cells (sorted, >= 1) and expected cells."""
    p = b["any"].predict_proba(X)[:, 1]
    q = np.clip(np.expm1(np.sort(np.column_stack([b["size"][k].predict(X) for k in QUANTILES]), axis=1)), 1, None)
    mean_pos = np.clip(b["mean"].predict(X), 1, None)
    return {"p_any": p, "q": q, "mean_pos": mean_pos, "expected": p * mean_pos}


def main() -> None:
    cand = pd.read_parquet(PROCESSED_DIR / "candidates.parquet")
    if TARGETS.exists():
        tg = pd.read_parquet(TARGETS)
    else:
        det, _ = load_detections(RAW_DIR / "firms_viirs.csv")
        print(f"[footprint] counting targets for {len(cand)} candidates")
        tg = count_targets(cand, det)
        tg.to_parquet(TARGETS, index=False)
    df = cand.merge(tg, on="candidate_id")
    df = df[df.future_cells_48h.notna()]
    tr, va, te = (df[df.split == s].reset_index(drop=True) for s in ("train", "val", "test"))
    medians = tr[FEATURE_COLUMNS].astype(float).median()
    Xtr, Xva, Xte = _X(tr, medians), _X(va, medians), _X(te, medians)
    ytr = tr.future_cells_48h.to_numpy()
    pos = ytr > 0

    b = {"medians": medians, "features": FEATURE_COLUMNS}
    b["any"] = HistGradientBoostingClassifier(**HGB).fit(Xtr, pos.astype(int))
    b["size"] = {k: HistGradientBoostingRegressor(loss="quantile", quantile=k, **HGB).fit(Xtr[pos], np.log1p(ytr[pos]))
                 for k in QUANTILES}
    b["mean"] = HistGradientBoostingRegressor(loss="poisson", **HGB).fit(Xtr[pos], ytr[pos])
    print("[footprint] fitted")

    raw_va = np.column_stack([b["size"][k].predict(Xva) for k in QUANTILES])
    crossing_val = float(np.mean((np.diff(raw_va, axis=1) < 0).any(axis=1)))

    out = _predict(b, Xte)
    y = te.future_cells_48h.to_numpy()
    ypos = y > 0
    exp = out["expected"]
    persistence = te.past_cells_24h.to_numpy(dtype=float)
    tr_month = pd.to_datetime(tr.t_ns, utc=True).dt.month
    clim_tab = tr.assign(m=tr_month).groupby(["country", "m"]).future_cells_48h.mean()
    te_month = pd.to_datetime(te.t_ns, utc=True).dt.month
    clim = np.array([clim_tab.get((c, m), float(ytr.mean())) for c, m in zip(te.country, te_month)])

    def err(pred):
        from scipy.stats import spearmanr
        e = pred - y
        return {"mae_km2": round(float(np.mean(np.abs(e)) * PIXEL_KM2), 4),
                "rmse_km2": round(float(np.sqrt(np.mean(e ** 2)) * PIXEL_KM2), 4),
                "spearman": round(float(spearmanr(pred, y).statistic), 3)}

    q, yp = out["q"][ypos], y[ypos]
    inside = (yp >= np.floor(q[:, 0])) & (yp <= np.ceil(q[:, 2]))
    rf = joblib.load(MODEL_DIR / "model.joblib")
    p_rf = rf["rf"].predict_proba(te[rf["features"]].astype(float).fillna(rf["medians"]).to_numpy())[:, 1]
    bands = []
    for lo, hi in ((0, 0.25), (0.25, 0.5), (0.5, 0.75), (0.75, 1.01)):
        m = (p_rf >= lo) & (p_rf < hi)
        if m.sum() >= 50:
            bands.append({"rf_probability": f"{lo:.2f}-{min(hi, 1):.2f}", "n": int(m.sum()),
                          "observed_mean_km2": round(float(y[m].mean() * PIXEL_KM2), 3),
                          "expected_mean_km2": round(float(exp[m].mean() * PIXEL_KM2), 3)})
    # top-decile check: incidents the model ranks highest should have the largest observed footprints
    top = exp >= np.quantile(exp, 0.9)
    ev = {
        "target": "unique VIIRS nominal/high-confidence pixel locations within "
                  f"{FOOTPRINT_RADIUS_KM:g} km, {LABEL_MIN_H}-{LABEL_HORIZON_H} h after the alert, x {PIXEL_KM2:.4f} km^2",
        "note": NOTE, "model": "two-part: P(any footprint) x size if activity continues (HistGradientBoosting)",
        "n_train": int(len(tr)), "n_val": int(len(va)), "n_test": int(len(te)),
        "test_period": "2025 (held out, touched once)",
        "test_observed": {"mean_km2": round(float(y.mean() * PIXEL_KM2), 3), "share_zero": round(float((~ypos).mean()), 3),
                          "mean_km2_when_any": round(float(yp.mean() * PIXEL_KM2), 3)},
        "expected_footprint": {"model": err(exp), "persistence_24h": err(persistence), "climatology": err(clim)},
        "any_footprint": {"auc": round(float(roc_auc_score(ypos, out["p_any"])), 3),
                          "brier": round(float(brier_score_loss(ypos, out["p_any"])), 4),
                          "base_rate": round(float(ypos.mean()), 3)},
        "size_if_any": {"coverage_10_90": round(float(inside.mean()), 3), "n_positive": int(ypos.sum()),
                        "median_abs_error_km2": round(float(np.median(np.abs(q[:, 1] - yp)) * PIXEL_KM2), 4)},
        "top_decile": {"observed_mean_km2": round(float(y[top].mean() * PIXEL_KM2), 3),
                       "rest_observed_mean_km2": round(float(y[~top].mean() * PIXEL_KM2), 3)},
        "by_rf_probability": bands,
        "val_quantile_crossing_share": round(crossing_val, 4),
        "radius_km": FOOTPRINT_RADIUS_KM, "horizon_h": LABEL_HORIZON_H,
    }
    m, p_ = ev["expected_footprint"]["model"], ev["expected_footprint"]["persistence_24h"]
    ev["beats_persistence"] = {"mae": m["mae_km2"] < p_["mae_km2"], "rmse": m["rmse_km2"] < p_["rmse_km2"],
                               "spearman": m["spearman"] > p_["spearman"]}
    b["eval"] = ev
    joblib.dump(b, OUT, compress=3)
    EVAL.write_text(json.dumps(ev, indent=2))
    print(json.dumps(ev, indent=2))


# ----------------------------------------------------------------------------- serving
@lru_cache(maxsize=1)
def load() -> dict | None:
    if not OUT.exists():
        return None
    b = joblib.load(OUT)
    if "any" not in b:          # an older single-stage artifact; rebuild with `python -m ml.footprint`
        return None
    b["past"] = pd.read_parquet(TARGETS).set_index("candidate_id")["past_cells_24h"] if TARGETS.exists() else None
    return b


def forecast(row: pd.Series, candidate_id: str, model: dict | None = None) -> dict | None:
    b = model or load()
    if b is None:
        return None
    past = int(b["past"].get(candidate_id, 0)) if b["past"] is not None else 0
    df = pd.DataFrame([{**{f: row.get(f) for f in b["features"]}, "past_cells_24h": past}])
    o = _predict(b, _X(df, b["medians"]))
    q10, q50, q90 = o["q"][0]
    ev = b["eval"]
    km2 = lambda c: round(float(c) * PIXEL_KM2, 2)  # noqa: E731
    return {
        "probability_any": round(float(o["p_any"][0]), 3),
        "expected_km2": km2(o["expected"][0]),
        # size if detected activity continues (conditional on any further detection)
        "median_km2": km2(q50), "p10_km2": km2(q10), "p90_km2": km2(q90),
        "cells_median": round(float(q50), 1),
        "past_cells_24h": past, "past_km2": km2(past),
        "horizon_h": int(ev["horizon_h"]), "radius_km": float(ev["radius_km"]), "note": NOTE,
        "eval": {"mae_km2": ev["expected_footprint"]["model"]["mae_km2"],
                 "persistence_mae_km2": ev["expected_footprint"]["persistence_24h"]["mae_km2"],
                 "spearman": ev["expected_footprint"]["model"]["spearman"],
                 "persistence_spearman": ev["expected_footprint"]["persistence_24h"]["spearman"],
                 "auc_any": ev["any_footprint"]["auc"],
                 "coverage_10_90": ev["size_if_any"]["coverage_10_90"],
                 "beats_persistence": bool(ev["beats_persistence"]["mae"] and ev["beats_persistence"]["spearman"]),
                 "n_test": ev["n_test"]},
    }


if __name__ == "__main__":
    main()
