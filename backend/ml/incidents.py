"""Incident construction: detections -> acquisition passes -> in-pass clusters (candidates) -> tracks."""
from __future__ import annotations

from collections import defaultdict

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN

from .config import ASSOC_RADIUS_KM, CLUSTER_EPS_KM, PASS_GAP_MIN, TRACK_GAP_H
from .geo import EARTH_R_KM, haversine_km

CONF_CODE = {"l": 0, "n": 1, "h": 2, "low": 0, "nominal": 1, "high": 2}
H = np.int64(3_600_000_000_000)  # one hour in ns


def load_detections(path) -> tuple[pd.DataFrame, dict]:
    raw = pd.read_csv(path)
    stats = {"raw_rows": int(len(raw))}
    df = raw.dropna(subset=["latitude", "longitude", "acq_date", "acq_time"]).copy()
    stats["dropped_missing_core"] = int(len(raw) - len(df))
    t = df["acq_time"].astype(int).astype(str).str.zfill(4)
    df["time"] = pd.to_datetime(df["acq_date"] + " " + t.str[:2] + ":" + t.str[2:], utc=True).dt.as_unit("ns")
    before = len(df)
    df = df.drop_duplicates(subset=["latitude", "longitude", "time", "satellite"])
    stats["exact_duplicates_removed"] = int(before - len(df))
    df["conf"] = df["confidence"].astype(str).str.lower().map(CONF_CODE).fillna(1).astype(int)
    df["t_ns"] = df["time"].astype("int64")
    df = df.sort_values(["satellite", "t_ns"]).reset_index(drop=True)
    # acquisition passes: same satellite, consecutive detections within PASS_GAP_MIN
    gap = df.groupby("satellite")["t_ns"].diff().fillna(np.inf) > PASS_GAP_MIN * 60e9
    df["pass_id"] = gap.cumsum().astype(int)
    stats["acquisition_passes"] = int(df["pass_id"].nunique())
    stats["satellites"] = sorted(df["satellite"].astype(str).unique().tolist())
    return df, stats


def build_candidates(det: pd.DataFrame) -> pd.DataFrame:
    """Cluster detections within each pass (DBSCAN, haversine) into incident candidates."""
    eps = CLUSTER_EPS_KM / EARTH_R_KM
    labels = np.empty(len(det), dtype=np.int64)
    offset = 0
    for _, idx in det.groupby("pass_id").indices.items():
        if len(idx) == 1:
            labels[idx] = offset
            offset += 1
            continue
        coords = np.radians(det[["latitude", "longitude"]].to_numpy()[idx])
        lab = DBSCAN(eps=eps, min_samples=1, metric="haversine", algorithm="ball_tree").fit_predict(coords)
        labels[idx] = lab + offset
        offset += lab.max() + 1
    det = det.assign(cand=labels)
    g = det.groupby("cand")
    cand = pd.DataFrame({
        "lat": g["latitude"].mean(),
        "lon": g["longitude"].mean(),
        "t_ns": g["t_ns"].min(),
        "satellite": g["satellite"].first(),
        "pass_id": g["pass_id"].first(),
        "n_pixels": g.size(),
        "frp_max": g["frp"].max(),
        "frp_mean": g["frp"].mean(),
        "frp_sum": g["frp"].sum(),
        "bt4_max": g["bright_ti4"].max(),
        "conf_h_frac": g["conf"].apply(lambda s: float((s == 2).mean())),
        "conf_l_frac": g["conf"].apply(lambda s: float((s == 0).mean())),
        "scan_track": (det["scan"] * det["track"]).groupby(det["cand"]).mean(),
        "is_night": g["daynight"].first().eq("N").astype(int),
    }).reset_index(drop=True)
    cand["time"] = pd.to_datetime(cand["t_ns"], utc=True)
    return cand.sort_values("t_ns").reset_index(drop=True)


class SpatialIndex:
    """Grid hash for radius queries over (lat, lon, t_ns) points with optional payload columns."""

    def __init__(self, lat, lon, t_ns, cell_deg: float = 0.02, **payload):
        self.cell = cell_deg
        self.lat = np.asarray(lat)
        self.lon = np.asarray(lon)
        self.t = np.asarray(t_ns)
        self.payload = {k: np.asarray(v) for k, v in payload.items()}
        ci = np.floor(self.lat / cell_deg).astype(np.int64)
        cj = np.floor(self.lon / cell_deg).astype(np.int64)
        buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
        for k, (a, b) in enumerate(zip(ci, cj)):
            buckets[(a, b)].append(k)
        self.buckets = {}
        for key, ids in buckets.items():
            ids = np.array(ids)
            self.buckets[key] = ids[np.argsort(self.t[ids])]

    def query(self, lat: float, lon: float, t0: int, t1: int, radius_km: float) -> np.ndarray:
        """Indices with t0 <= t < t1 within radius_km."""
        i, j = int(np.floor(lat / self.cell)), int(np.floor(lon / self.cell))
        out = []
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                ids = self.buckets.get((i + di, j + dj))
                if ids is None:
                    continue
                tt = self.t[ids]
                lo, hi = np.searchsorted(tt, t0, "left"), np.searchsorted(tt, t1, "left")
                if hi > lo:
                    out.append(ids[lo:hi])
        if not out:
            return np.empty(0, dtype=np.int64)
        ids = np.concatenate(out)
        d = haversine_km(lat, lon, self.lat[ids], self.lon[ids])
        return ids[d <= radius_km]


def link_tracks(cand: pd.DataFrame) -> pd.DataFrame:
    """Union-find tracks (for split isolation) + a causal track age (past-only, usable as a feature)."""
    n = len(cand)
    parent = np.arange(n)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    idx = SpatialIndex(cand.lat, cand.lon, cand.t_ns)
    t = cand.t_ns.to_numpy()
    lat, lon = cand.lat.to_numpy(), cand.lon.to_numpy()
    causal_first = t.copy()
    for k in range(n):  # candidates are time-sorted
        prev = idx.query(lat[k], lon[k], t[k] - TRACK_GAP_H * H, t[k], ASSOC_RADIUS_KM)
        prev = prev[prev != k]
        if len(prev):
            causal_first[k] = min(t[k], causal_first[prev].min())
            for p in prev:
                ra, rb = find(k), find(p)
                if ra != rb:
                    parent[ra] = rb
    roots = np.array([find(k) for k in range(n)])
    _, track = np.unique(roots, return_inverse=True)
    cand = cand.copy()
    cand["track_id"] = track
    cand["track_age_h"] = (t - causal_first) / H
    first = cand.groupby("track_id")["t_ns"].transform("min")
    cand["track_first_ns"] = first
    return cand
