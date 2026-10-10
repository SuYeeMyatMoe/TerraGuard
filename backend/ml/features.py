"""Past-only features, chronological split assignment and the dataset audit.

Usage:  python -m ml.features      (writes data/processed/candidates.parquet + audit.json)
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from .config import (ASSOC_RADIUS_KM, FEATURE_HISTORY_D, LABEL_HORIZON_H, PROCESSED_DIR, RAW_DIR,
                     TEST_START, VAL_START)
from .fetch_weather import fetch_tiles, load_weather
from .geo import nearest_protected_area, region_label, weather_tile
from .incidents import H, SpatialIndex, build_candidates, link_tracks, load_detections
from .labels import label_candidates

WEATHER_COLS = ["temperature_2m_max", "relative_humidity_2m_min", "precip_3d", "precip_7d",
                "days_since_rain", "wind_speed_10m_max", "et0_fao_evapotranspiration"]
FEATURE_COLUMNS = [
    "n_pixels", "frp_max", "frp_mean", "log_frp_sum", "bt4_max", "conf_h_frac", "conf_l_frac", "is_night",
    "scan_track", "prior_24h", "prior_72h", "prior_7d", "multi_sensor_2h", "track_age_h", "hist_365d",
    "month_sin", "month_cos", *WEATHER_COLS, "weather_missing", "log_pa_dist_km",
]
FEATURE_LABELS = {
    "n_pixels": "Pixels in detection cluster",
    "frp_max": "Peak fire radiative power (MW)",
    "frp_mean": "Mean fire radiative power (MW)",
    "log_frp_sum": "Total radiative power (log)",
    "bt4_max": "Peak I4 brightness temperature (K)",
    "conf_h_frac": "Share of high-confidence pixels",
    "conf_l_frac": "Share of low-confidence pixels",
    "is_night": "Night-time detection",
    "scan_track": "Pixel footprint (scan x track, km²)",
    "prior_24h": "Nearby detections, previous 24 h",
    "prior_72h": "Nearby detections, previous 72 h",
    "prior_7d": "Nearby detections, previous 7 days",
    "multi_sensor_2h": "Confirmed by a second satellite (2 h)",
    "track_age_h": "Hours since activity first seen here",
    "hist_365d": "Detections in this 0.1° cell, past year",
    "month_sin": "Season (month, sine)",
    "month_cos": "Season (month, cosine)",
    "temperature_2m_max": "Max temperature, previous day (°C)",
    "relative_humidity_2m_min": "Min relative humidity, previous day (%)",
    "precip_3d": "Rainfall, previous 3 days (mm)",
    "precip_7d": "Rainfall, previous 7 days (mm)",
    "days_since_rain": "Days since ≥1 mm rain",
    "wind_speed_10m_max": "Max wind speed, previous day (km/h)",
    "et0_fao_evapotranspiration": "Reference evapotranspiration (mm)",
    "weather_missing": "Weather record missing",
    "log_pa_dist_km": "Distance to protected area (log km)",
}


def past_features(cand: pd.DataFrame, det: pd.DataFrame) -> pd.DataFrame:
    idx = SpatialIndex(det.latitude, det.longitude, det.t_ns, sat=det.satellite.astype(str))
    lat, lon, t = cand.lat.to_numpy(), cand.lon.to_numpy(), cand.t_ns.to_numpy()
    sat = cand.satellite.astype(str).to_numpy()
    five_min = 5 * 60 * 10**9
    p24 = np.zeros(len(cand)); p72 = np.zeros(len(cand)); p7d = np.zeros(len(cand)); ms = np.zeros(len(cand))
    for k in range(len(cand)):
        ids = idx.query(lat[k], lon[k], t[k] - 7 * 24 * H, t[k] - five_min, ASSOC_RADIUS_KM)
        if len(ids) == 0:
            continue
        tt = idx.t[ids]
        p7d[k] = len(ids)
        p72[k] = (tt >= t[k] - 72 * H).sum()
        p24[k] = (tt >= t[k] - 24 * H).sum()
        recent = tt >= t[k] - 2 * H
        ms[k] = float((idx.payload["sat"][ids][recent] != sat[k]).any())
    # historical frequency in 0.1 degree cells over the previous 365 days (the baseline signal)
    ci = np.floor(det.latitude.to_numpy() / 0.1).astype(np.int64) * 100000 + np.floor(det.longitude.to_numpy() / 0.1).astype(np.int64)
    cc = np.floor(lat / 0.1).astype(np.int64) * 100000 + np.floor(lon / 0.1).astype(np.int64)
    order = np.lexsort((det.t_ns.to_numpy(), ci))
    ci_s, t_s = ci[order], det.t_ns.to_numpy()[order]
    starts = np.searchsorted(ci_s, cc, "left"); ends = np.searchsorted(ci_s, cc, "right")
    hist = np.zeros(len(cand))
    for k in range(len(cand)):
        seg = t_s[starts[k]:ends[k]]
        hist[k] = np.searchsorted(seg, t[k] - five_min) - np.searchsorted(seg, t[k] - 365 * 24 * H)
    out = cand.copy()
    out["prior_24h"], out["prior_72h"], out["prior_7d"] = p24, p72, p7d
    out["multi_sensor_2h"], out["hist_365d"] = ms, hist
    out["log_frp_sum"] = np.log1p(out["frp_sum"])
    month = out["time"].dt.month
    out["month_sin"] = np.sin(2 * np.pi * month / 12)
    out["month_cos"] = np.cos(2 * np.pi * month / 12)
    return out


def attach_weather(cand: pd.DataFrame, max_new_tiles: int = 30) -> tuple[pd.DataFrame, list]:
    tlat, tlon = weather_tile(cand.lat.to_numpy(), cand.lon.to_numpy())
    cand = cand.assign(tile_lat=tlat, tile_lon=tlon)
    counts = cand.groupby(["tile_lat", "tile_lon"]).size().sort_values(ascending=False)
    wanted = [tuple(map(float, k)) for k in counts.index[:max_new_tiles]]
    try:
        fetch_tiles(wanted)
    except Exception as e:
        print(f"[features] weather fetch failed: {e!r}")
    from .fetch_weather import WEATHER_DIR
    cached = []
    for p in WEATHER_DIR.glob("*.csv"):
        a, b = p.stem.split("_")
        cached.append((float(a), float(b)))
    w = load_weather(cached)
    if not len(w):
        for c in WEATHER_COLS:
            cand[c] = np.nan
        cand["weather_missing"] = 1
        return cand, cached
    # map each candidate tile to the nearest cached tile within 1.5 degrees
    tiles = np.array(cached)
    uniq = cand[["tile_lat", "tile_lon"]].drop_duplicates().to_numpy()
    mapping = {}
    for a, b in uniq:
        d = np.hypot(tiles[:, 0] - a, tiles[:, 1] - b)
        k = int(np.argmin(d))
        mapping[(a, b)] = tuple(tiles[k]) if d[k] <= 1.5 else (np.nan, np.nan)
    m = np.array([mapping[(a, b)] for a, b in cand[["tile_lat", "tile_lon"]].to_numpy()])
    cand["wlat"], cand["wlon"] = m[:, 0], m[:, 1]
    # previous complete UTC day only (prediction-time alignment, no same-day leakage)
    cand["wdate"] = (cand["time"] - pd.Timedelta(days=1)).dt.date
    w = w.rename(columns={"tile_lat": "wlat", "tile_lon": "wlon", "date": "wdate"})
    cand = cand.merge(w[["wlat", "wlon", "wdate", *WEATHER_COLS]], on=["wlat", "wlon", "wdate"], how="left")
    cand["weather_missing"] = cand[WEATHER_COLS].isna().any(axis=1).astype(int)
    return cand, cached


def assign_splits(cand: pd.DataFrame) -> pd.DataFrame:
    vs = pd.Timestamp(VAL_START, tz="UTC").value
    ts = pd.Timestamp(TEST_START, tz="UTC").value

    def split_of(t):
        return np.where(t < vs, "train", np.where(t < ts, "val", "test"))

    cand = cand.copy()
    cand["split_time"] = split_of(cand.t_ns.to_numpy())
    cand["split_track"] = split_of(cand.track_first_ns.to_numpy())
    t = cand.t_ns.to_numpy()
    horizon = LABEL_HORIZON_H * H
    hist = FEATURE_HISTORY_D * 24 * H
    purge = ((cand.split_time == "train") & (t + horizon >= vs)) | \
            ((cand.split_time == "val") & ((t + horizon >= ts) | (t < vs + hist))) | \
            ((cand.split_time == "test") & (t < ts + hist))
    cross = cand.split_time != cand.split_track
    labelled = cand.label_status.isin(["positive", "negative"])
    cand["purged_boundary"] = purge
    cand["dropped_cross_split_track"] = cross & ~purge
    cand["eligible"] = labelled & ~purge & ~cross
    cand["split"] = np.where(cand["eligible"], cand["split_time"], "excluded")
    return cand


def build_dataset() -> pd.DataFrame:
    det, stats = load_detections(RAW_DIR / "firms_viirs.csv")
    print(f"[dataset] {len(det)} detections, {stats['acquisition_passes']} passes")
    cand = build_candidates(det)
    print(f"[dataset] {len(cand)} candidates")
    cand = link_tracks(cand)
    cand = label_candidates(cand, det)
    cand = past_features(cand, det)
    cand, tiles = attach_weather(cand)
    dist, pa_idx = nearest_protected_area(cand.lat.to_numpy(), cand.lon.to_numpy())
    cand["pa_dist_km"] = dist
    cand["pa_index"] = pa_idx
    cand["log_pa_dist_km"] = np.log1p(dist)
    reg = [region_label(a, b) for a, b in zip(cand.lat.round(2), cand.lon.round(2))]
    cand["region"] = [r[0] for r in reg]
    cand["country"] = [r[1] for r in reg]
    cand = assign_splits(cand)
    cand["candidate_id"] = [f"CND-{i:06d}" for i in range(len(cand))]
    cand.drop(columns=["time"]).to_parquet(PROCESSED_DIR / "candidates.parquet", index=False)

    audit = {
        **stats,
        "detections_after_cleaning": int(len(det)),
        "incident_candidates": int(len(cand)),
        "tracks": int(cand.track_id.nunique()),
        "label_status": cand.label_status.value_counts().to_dict(),
        "purged_boundary": int(cand.purged_boundary.sum()),
        "dropped_cross_split_track": int(cand.dropped_cross_split_track.sum()),
        "splits": {s: {"n": int((cand.split == s).sum()),
                       "positives": int(((cand.split == s) & (cand.y == 1)).sum()),
                       "positive_rate": round(float(cand.loc[cand.split == s, "y"].mean()), 4) if (cand.split == s).any() else None}
                   for s in ("train", "val", "test")},
        "missing_values": {c: int(cand[c].isna().sum()) for c in FEATURE_COLUMNS if cand[c].isna().any()},
        "weather_tiles_cached": len(tiles),
        "coverage_by_country": cand.country.value_counts().to_dict(),
        "coverage_by_region": cand.region.value_counts().head(20).to_dict(),
        "period": [str(det.time.min()), str(det.time.max())],
    }
    feasible = all(audit["splits"][s]["positives"] >= 200 and audit["splits"][s]["n"] - audit["splits"][s]["positives"] >= 200
                   for s in ("train", "val", "test"))
    audit["feasibility_gate"] = {"passed": bool(feasible),
                                 "rule": ">=200 positives and >=200 negatives in each of train/val/test"}
    (PROCESSED_DIR / "audit.json").write_text(json.dumps(audit, indent=2, default=str))
    print(json.dumps(audit, indent=2, default=str))
    return cand


if __name__ == "__main__":
    build_dataset()
