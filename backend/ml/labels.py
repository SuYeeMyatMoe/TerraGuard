"""48-hour follow-up detection labels.

positive  : a detection within ASSOC_RADIUS_KM, in a distinct later pass, with
            t + LABEL_MIN_H <= time <= t + LABEL_HORIZON_H, and nominal/high confidence.
uncertain : the only qualifying follow-ups are low-confidence -> excluded from training/evaluation.
censored  : t + horizon extends past the end of the observation record -> excluded.
negative  : no qualifying follow-up observed. This does NOT mean the fire was confirmed extinguished.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import ASSOC_RADIUS_KM, LABEL_HORIZON_H, LABEL_MIN_H
from .incidents import H, SpatialIndex


def label_candidates(cand: pd.DataFrame, det: pd.DataFrame) -> pd.DataFrame:
    idx = SpatialIndex(det.latitude, det.longitude, det.t_ns, conf=det.conf, pass_id=det.pass_id)
    data_end = det.t_ns.max()
    labels = np.empty(len(cand), dtype=object)
    lat, lon, t = cand.lat.to_numpy(), cand.lon.to_numpy(), cand.t_ns.to_numpy()
    for k in range(len(cand)):
        if t[k] + LABEL_HORIZON_H * H > data_end:
            labels[k] = "censored"
            continue
        ids = idx.query(lat[k], lon[k], t[k] + LABEL_MIN_H * H, t[k] + LABEL_HORIZON_H * H + 1, ASSOC_RADIUS_KM)
        if len(ids) == 0:
            labels[k] = "negative"
        elif (idx.payload["conf"][ids] >= 1).any():
            labels[k] = "positive"
        else:
            labels[k] = "uncertain"
    cand = cand.copy()
    cand["label_status"] = labels
    cand["y"] = (cand["label_status"] == "positive").astype(int)
    return cand
