# Data, labels and evaluation

## Provenance
| Item | Value |
|---|---|
| Study area | Malaysia (Peninsular, Sarawak, Sabah) + Indonesia (Sumatra/Riau, Kalimantan); bbox 95.0,-4.5 → 119.5,7.5 |
| Period | 2023-01-01 → 2025-12-31 |
| Hotspots | `ml/fetch_firms.py`, in priority order: FIRMS area API (`VIIRS_SNPP_SP`, `VIIRS_NOAA20_SP`, then NRT) → manual CSVs in `data/raw/firms_manual/` → **synthetic fallback** |
| Current snapshot | **SYNTHETIC**. Generated in the FIRMS VIIRS 375 m schema (seed 20251010) and conditioned on real Open-Meteo weather in all 13 fire-prone zones. Written to `data/processed/provenance.json` and flagged in the UI |
| Weather | Open-Meteo archive API, daily, 1° tiles (no key). Features use the **previous UTC day** |
| Protected areas | 12 curated parks/reserves stored as centroid + radius: **approximate boundaries**. They become verified WDPA polygons once Earth Engine is configured |

The synthetic generator exists so the pipeline and demo run without credentials. It is not evidence about real fires. With a FIRMS MAP_KEY the same pipeline runs unchanged.

## Incident construction (`ml/incidents.py`)
1. Normalise `acq_date` + `acq_time` to UTC and drop exact duplicates.
2. **Acquisition pass**: detections from the same satellite less than 10 min apart.
3. **Candidate**: DBSCAN within each pass (haversine, 750 m, min_samples = 1).
4. **Track**: candidates ≤ 2 km apart with gaps ≤ 72 h (union-find), used to keep splits isolated. A causal (past-only) track age is used as a feature.

## Label (`ml/labels.py`): 48-hour follow-up detection
- **positive**: a nominal- or high-confidence detection ≤ 2 km away in a later pass, between t + 3 h and t + 48 h. The 3 h floor excludes the near-simultaneous S-NPP / NOAA-20 overpasses.
- **uncertain**: only low-confidence follow-ups. Excluded from training and evaluation.
- **censored**: horizon extends past the end of the record. Excluded.
- **negative**: no qualifying follow-up. This does **not** mean the fire was confirmed out.

## Features (`ml/features.py`), all past-only
Cluster pixels, FRP max/mean/sum, I4 brightness, confidence mix, day/night, scan×track footprint · nearby detections in the previous 24 h / 72 h / 7 d · second-satellite confirmation within 2 h · causal track age · detections in the 0.1° cell over the previous 365 days · month (sin/cos) · previous-day weather (tmax, RH min, 3/7-day rain, days since rain, wind, ET0) + missing flag · distance to the nearest protected area. Earth Engine context is never a model input.

## Splits and leakage controls
| Split | Period | Candidates | Positive rate |
|---|---|---|---|
| train | 2023-01 → 2024-06 | 11,831 | 47.9% |
| val | 2024-07 → 2024-12 | 3,862 | 44.0% |
| test | 2025 | 3,786 | 18.7% |

- Train candidates whose 48 h label window crosses the validation start are purged, and likewise at the test boundary.
- The first 7 days of validation and test are purged, covering the longest feature window.
- Tracks are assigned to the split of their first detection. Candidates in other splits are dropped, so no track spans two splits.
- Hyperparameters and alert thresholds are chosen on validation only. Test is scored once.
- `tests/test_leakage.py` asserts all of the above.

Feasibility gate (≥ 200 positives and ≥ 200 negatives per split): **passed**.

## Model results: held-out 2025 test (synthetic data)
| Metric | Historical-frequency baseline | Random Forest |
|---|---|---|
| PR-AUC | 0.401 | **0.727** |
| Precision @ threshold | 44.0% | **73.6%** |
| Recall @ threshold | 9.3% | **50.1%** |
| F1 | 0.154 | **0.596** |
| False-positive rate | **2.7%** | 4.1% |
| Precision@5 per day | 18.1% | **24.2%** |
| Brier | 0.147 | **0.081** |

Threshold rule: maximise validation F1 subject to FPR ≤ 15%. The RF is served because it beats the baseline on validation PR-AUC (0.839 vs 0.671).

## Scenario selection (`ml/build_scenarios.py`)
- Only test-period days are used.
- Within each day, candidates are taken in observation order, keeping each one that is ≥ 50 km from those already kept, until there are three.
- Days are ranked by candidate count and the top 5 are kept.
- The default is the top day on which the two policies would send the team to **different** incidents (preferring days covering both countries). The pick uses decisions, never outcomes.

## Policy backtest (`ml/policy_backtest.py`), 357 test days, one team
| | AI-priority | First-alert | Random |
|---|---|---|---|
| Chosen incident showed follow-up within 48 h (real labels) | **14.5%** | 6.2% | 6.6% |

- Difference: 95% bootstrap CI +5.4 to +11.6 percentage points.
- On disagreement days: 15.0% vs 2.6%.
- Hypothetical simulation: mean loss index 21.8 vs 23.0. The difference of 1.2 has a 95% CI of −0.01 to 2.46, so it is **inconclusive**.
