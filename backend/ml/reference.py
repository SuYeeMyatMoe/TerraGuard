"""Training-reference distributions for plain-language comparisons ("lower than most comparable observations").

Built ONLY from training-split candidates (never validation or test). Percentiles are stored every 5% in model
space; percentile ranks are invariant to the monotone display transforms, so comparisons are exact.
Scopes, narrowest first: country x season (dry = Jun-Oct), country, global. A scope is used only if it has
at least MIN_N observations for that feature.

Usage:  python -m ml.reference      (writes data/model/feature_reference.json)
"""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np
import pandas as pd

from .config import MODEL_DIR, PROCESSED_DIR
from .feature_catalog import CATALOG, SEASON_PARTS
from .features import FEATURE_COLUMNS

OUT = MODEL_DIR / "feature_reference.json"
LEVELS = list(range(0, 101, 5))
MIN_N = 500
DRY_MONTHS = {6, 7, 8, 9, 10}


def season_of(month: int) -> str:
    return "dry season (Jun–Oct)" if month in DRY_MONTHS else "outside the dry season"


def comparable_features() -> list[str]:
    return [f for f in FEATURE_COLUMNS if f not in SEASON_PARTS and CATALOG[f].comparable]


def build() -> dict:
    cand = pd.read_parquet(PROCESSED_DIR / "candidates.parquet")
    train = cand[cand.split == "train"].copy()
    months = pd.to_datetime(train.t_ns, utc=True).dt.month
    train["season"] = months.map(season_of)
    feats = comparable_features()

    def quantiles(df: pd.DataFrame) -> dict:
        out = {}
        for f in feats:
            v = df[f].astype(float).dropna().to_numpy()
            if len(v) >= MIN_N:
                out[f] = {"n": int(len(v)), "q": [round(float(x), 6) for x in np.percentile(v, LEVELS)]}
        return out

    scopes = {"global": {"label": "all training observations", "features": quantiles(train)}}
    for country, g in train.groupby("country"):
        scopes[f"country:{country}"] = {"label": f"training observations in {country}", "features": quantiles(g)}
        for season, gs in g.groupby("season"):
            scopes[f"country_season:{country}|{season}"] = {
                "label": f"training observations in {country}, {season}", "features": quantiles(gs)}
    t = pd.to_datetime(train.t_ns, utc=True)
    ref = {
        "split": "train",
        "n_train_rows": int(len(train)),
        "training_period": [t.min().strftime("%Y-%m-%d"), t.max().strftime("%Y-%m-%d")],
        "levels": LEVELS,
        "min_n": MIN_N,
        "scopes": scopes,
        "note": "Descriptive comparison with training observations only. Not a causal or official danger threshold.",
    }
    OUT.write_text(json.dumps(ref))
    return ref


@lru_cache(maxsize=1)
def load() -> dict | None:
    return json.loads(OUT.read_text()) if OUT.exists() else None


def percentile_rank(value: float, q: list[float]) -> float:
    """Percentile rank (0-100) of value within stored quantiles; ties take the midpoint of the tied range."""
    arr = np.asarray(q)
    lo = int(np.searchsorted(arr, value, side="left"))
    hi = int(np.searchsorted(arr, value, side="right"))
    if hi == 0:
        return 0.0
    if lo >= len(arr):
        return 100.0
    if lo == hi:  # strictly between two stored quantiles: interpolate
        return float(np.interp(value, arr, LEVELS))
    return float((LEVELS[lo] + LEVELS[hi - 1]) / 2)


def compare(feature: str, value: float, country: str | None, month: int | None, ref: dict | None = None) -> dict | None:
    """Return {rank, phrase, scope_label, n} or None when no adequate reference exists."""
    ref = ref if ref is not None else load()
    if ref is None or value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    keys = []
    if country and month:
        keys.append(f"country_season:{country}|{season_of(month)}")
    if country:
        keys.append(f"country:{country}")
    keys.append("global")
    for k in keys:
        scope = ref["scopes"].get(k)
        if scope and feature in scope["features"]:
            entry = scope["features"][feature]
            r = percentile_rank(float(value), entry["q"])
            return {"rank": round(r), "phrase": phrase(r), "scope_label": scope["label"], "n": entry["n"]}
    return None


def phrase(rank: float) -> str:
    if rank <= 10:
        return "among the lowest 10% of"
    if rank < 25:
        return "lower than most"
    if rank < 75:
        return "within the typical range of"
    if rank < 90:
        return "higher than most"
    return "among the highest 10% of"


if __name__ == "__main__":
    r = build()
    print(f"reference built from {r['n_train_rows']} training rows, {len(r['scopes'])} scopes, period {r['training_period']}")
