import json

import pandas as pd
import pytest

from ml.config import LABEL_HORIZON_H, PROCESSED_DIR, TEST_START, VAL_START

pytestmark = pytest.mark.skipif(not (PROCESSED_DIR / "candidates.parquet").exists(), reason="dataset not built")


@pytest.fixture(scope="module")
def cand():
    return pd.read_parquet(PROCESSED_DIR / "candidates.parquet")


def test_no_track_spans_splits(cand):
    used = cand[cand.split != "excluded"]
    assert (used.groupby("track_id").split.nunique() == 1).all()


def test_label_windows_do_not_cross_boundaries(cand):
    h = LABEL_HORIZON_H * 3_600_000_000_000
    vs, ts = pd.Timestamp(VAL_START, tz="UTC").value, pd.Timestamp(TEST_START, tz="UTC").value
    assert (cand[cand.split == "train"].t_ns + h < vs).all()
    assert (cand[cand.split == "val"].t_ns + h < ts).all()


def test_only_known_labels_used(cand):
    used = cand[cand.split != "excluded"]
    assert set(used.label_status) <= {"positive", "negative"}


def test_chronological_order(cand):
    assert cand[cand.split == "train"].t_ns.max() < cand[cand.split == "val"].t_ns.min()
    assert cand[cand.split == "val"].t_ns.max() < cand[cand.split == "test"].t_ns.min()


def test_scenarios_come_from_test_period():
    scen = json.loads((PROCESSED_DIR / "scenarios.json").read_text())["scenarios"]
    assert all(s["day"] >= TEST_START for s in scen)
    assert sum(s["default"] for s in scen) == 1
