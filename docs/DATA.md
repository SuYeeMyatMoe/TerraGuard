# Data, labels and evaluation

## Provenance
| Item | Value |
|---|---|
| Study area | Malaysia (Peninsular, Sarawak, Sabah) + Indonesia (Sumatra/Riau, Kalimantan); bbox 95.0,-4.5 → 119.5,7.5 |
| Period | 2023-01-01 → 2025-12-31 |
| Hotspots | `ml/fetch_firms.py`, in priority order: FIRMS area API (`VIIRS_SNPP_SP`, `VIIRS_NOAA20_SP`, then NRT) → manual CSVs in `data/raw/firms_manual/` → **synthetic fallback** |
| Current snapshot | **REAL**: NASA FIRMS area API (`NASA_FIRMS_API`), VIIRS 375 m, S-NPP + NOAA-20, 570,840 detections, downloaded 2026-10-10. Recorded in `data/processed/provenance.json` and shown in the UI |
| Weather | Open-Meteo archive API, daily, 1° tiles (no key). Features use the **previous UTC day** |
| Protected areas | 12 curated parks/reserves stored as centroid + radius: **approximate boundaries**. They become verified WDPA polygons once Earth Engine is configured |

A seeded synthetic generator remains in `ml/fetch_firms.py` as a fallback so the pipeline and demo run without credentials. It is used only when there is no FIRMS key and no manual CSV, it is labelled `SYNTHETIC` in `provenance.json` and the UI, and it is not evidence about real fires. The current results below do **not** use it.

Hotspot detections are not confirmed fires. A VIIRS detection is a thermal anomaly seen by a satellite, and the label below measures further satellite detections, not fire spread or damage.

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
| train | 2023-01 → 2024-06 | 189,332 | 40.1% |
| val | 2024-07 → 2024-12 | 64,565 | 27.0% |
| test | 2025 | 85,387 | 27.9% |

343,111 incident candidates in total; 1,913 uncertain and 75 censored candidates are excluded, as are 1,810 purged at split boundaries and 33 whose track crossed splits. About 35,000 candidates have no weather record and carry the missing-weather flag.

- Train candidates whose 48 h label window crosses the validation start are purged, and likewise at the test boundary.
- The first 7 days of validation and test are purged, covering the longest feature window.
- Tracks are assigned to the split of their first detection. Candidates in other splits are dropped, so no track spans two splits.
- Hyperparameters and alert thresholds are chosen on validation only. Test is scored once.
- `tests/test_leakage.py` asserts all of the above.

Feasibility gate (≥ 200 positives and ≥ 200 negatives per split): **passed**.

## Model results: held-out 2025 test (real NASA FIRMS data)
| Metric | Historical-frequency baseline | Random Forest |
|---|---|---|
| PR-AUC | 0.535 | **0.623** |
| Precision @ threshold | 52.2% | **58.3%** |
| Recall @ threshold | 46.1% | **55.4%** |
| F1 | 0.490 | **0.568** |
| False-positive rate | **16.3%** | 15.4% |
| Precision@5 per day | 72.7% | **74.4%** |
| Brier | 0.186 | **0.164** |

Threshold rule: maximise validation F1 subject to FPR ≤ 15%. The RF is served because it beats the baseline on validation PR-AUC (0.584 vs 0.494). The test false-positive rates (16.3% and 15.4%) are slightly above the 15% target set on validation, which shows a small shift between the two periods.

The improvement over the baseline is real but modest. Treat the model as a decision aid for ranking competing incidents, not as a standalone forecast.

## Scenario selection (`ml/build_scenarios.py`)
- Only test-period days are used.
- Within each day, candidates are taken in observation order, keeping each one that is ≥ 50 km from those already kept, until there are three.
- Days are ranked by candidate count and the top 5 are kept.
- The default is the top day on which the two policies would send the team to **different** incidents (preferring days covering both countries). The pick uses decisions, never outcomes.

## Policy backtest (`ml/policy_backtest.py`), 361 test days, one team
| | AI-priority | First-alert | Random |
|---|---|---|---|
| Chosen incident showed follow-up within 48 h (real labels) | **32.8%** | 16.4% | 17.5% |

- Difference (AI-priority minus first-alert): 95% bootstrap CI +11.9 to +21.1 percentage points.
- The two policies choose different incidents on 248 of the 361 days. On those days: 34.0% vs 10.1% (CI +17.4 to +30.4 points, n = 247 with known labels).
- Follow-up detection is a proxy for persistent activity, not confirmed damage.
- Hypothetical simulation (8 seeds per day): mean loss index 26.8 (first-alert) vs 25.9 (AI-priority). The difference of 0.82 has a 95% CI of −0.89 to 2.48, so it is **inconclusive**. AI-priority had lower loss on 136 days, first-alert on 111, and 114 were tied.
