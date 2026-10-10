# Assumptions

## The crew
The scarce resource is one **hypothetical** crew: the *Borneo Field Verification Crew* (4 people, Sibu field station, Sarawak), defined in `backend/app/team.py`. It is not a real unit. Sending it to an incident is an exclusive assignment, and every other incident that is not dismissed or rechecked becomes **unattended**. A recheck or dismissal of the crew's own incident releases the crew. Recheck and dismiss never use the crew.

## The decision record
Each action stores:
- the incident;
- the recommendation, rank, priority score and 48 h probability at that moment;
- whether the action followed the recommendation;
- the coordinator's reason (required);
- the crew;
- the time;
- the incidents left waiting, with their risk at that moment;
- any reassignment.

In Supabase, `actions` is append-only (schema Part 4). A demo reset archives rows rather than deleting them.

## Layer 2: prioritisation (`backend/app/priority.py`)
These weights were fixed before any simulation was run. They never use simulation outcomes.

```
priority = 0.45 · p(48 h follow-up) + 0.25 · exposure + 0.15 · recency + 0.15 · evidence_score
exposure = exp(-distance_to_protected_area_km / 10)
recency  = exp(-hours_since_observation / 12)
```

**Evidence score** (0–1) is built from:
- pixel count;
- share of non-low-confidence pixels;
- corroboration (a second satellite within 2 h, or detections in the previous 24 h);
- pixel footprint;
- weather completeness;
- a −0.1 penalty per out-of-distribution input, for up to two inputs.

Thresholds: High ≥ 0.65, Medium ≥ 0.4, otherwise Low.

**Recommendations**
- **RECHECK** when evidence is Low or ≥ 2 inputs fall outside the training 1–99 percentile range.
- **INSPECT** for the top-N remaining incidents by score (N = available teams).
- **MONITOR** for the rest.

**Categories:** PROTECTED_AREA_EXPOSURE, PERSISTENT_ACTIVITY, EMERGING_CLUSTER, ISOLATED_SIGNAL, INSUFFICIENT_EVIDENCE. None of them implies cause or blame.

## Layer 3: simulation (`backend/sim/automaton.py`)
| Assumption | Value |
|---|---|
| Grid | 20 × 20 cells per incident plot, procedurally generated and seeded by incident id |
| Cell size | 100 m (1 ha); used only where hectares are shown |
| Time step | 30 min (UI shows steps first and labels hours as assumed) |
| Spread | Moore neighbourhood, p = 0.2 · fuel · (0.35 + 0.9 · dryness) · wind factor; diagonal × 0.7 |
| Wind | exp(0.025 · speed · cosθ), normalised so wind redistributes spread direction rather than adding fire |
| Burn duration | 2 steps |
| Team capability | **Assumed suppression capacity**: 3 burning cells per step, then firebreak cells toward protected habitat. Inspection alone does not extinguish fire |
| Response delay | Slider, default 4 steps, same for every policy |
| Cost | RM 180 per team-hour + RM 1,500 per dispatch (illustrative) |
| Loss index | 1 per burned cell + 5 per protected cell burned (illustrative units, not a valuation) |
| Defaults | Wind and dryness come from each incident's previous-day observed weather. Dryness = 0.4·min(days since rain, 21)/21 + 0.35·clip((85 − RH)/45) + 0.25·exp(−rain₇d/15) |
| Protected habitat | Blob on one plot edge, sized by protected-area exposure (approximate) |

**Fairness.** Every policy sees the same plots, ignitions, weather, horizon, teams, delay and one pre-drawn random tensor (common random numbers). Results cover 30 seeds, reported as mean ± 95% CI plus seed win counts. `tests/test_sim.py` checks determinism, the team limit, and that identical allocations give identical outcomes.

The ML probability is **never** an input to the simulation. The simulation is not a validated wildfire forecast.

## Explanations (`backend/app/explanations.py`)
Every sentence shown to coordinators is generated from a computed value. No LLM is involved.

- **Model reasoning:** Saabas path contributions on the Random Forest probability. They are additive in probability units (baseline + contributions = estimate, checked against `predict_proba` to 1e-6). The bars show |contribution| ÷ the largest shown contribution. They are a relative visual scale, not a probability share and not causation. `month_sin` and `month_cos` are summed into "Seasonal timing".
- **Plain language:** `backend/ml/feature_catalog.py` holds friendly names, units and meanings. The satellite footprint is described as pixel geometry, not fire size, and the thermal signal as sensor brightness, not flame temperature.
- **Historical comparisons:** `backend/ml/reference.py` uses **training-split rows only** (2023-01-01 → 2024-06-28, 189,332 rows). It picks the narrowest scope with n ≥ 500 (country × dry season, then country, then global). The wording comes from the percentile rank only: lowest 10%, lower than most, typical range, higher than most, highest 10%.
- **Priority reasoning:** weighted component differences between incidents, which sum to the score difference. "Tied" means exactly equal scores, in which case the earlier alert ranks first (stable sort). "Close" (< 0.02) is described as a small margin that could swap. For rank ≥ 3, the incident directly above is also explained.
- **Urgency tier** (rule-based, no deadlines):
  - Insufficient evidence: whenever the triage is RECHECK.
  - Critical review: INSPECT, observed ≤ 12 h ago, corroborated, above the validated alert threshold, High evidence, no high-severity limitation **and more than one pixel**.
  - Priority review: INSPECT or above the threshold.
  - Routine monitoring: otherwise.
- **Evidence gaps:** a fixed rule table keyed by flag code. Each code gives the missing information, why it matters, a verification step and whether to stay cautious. The wording never promises certainty.
- **Tree variation:** the 10th–90th percentile of individual tree estimates, labelled "variation within the model, not a statistically validated confidence interval". The main panel instead shows the held-out calibration band for the score (from `evaluation.json`, n ≥ 100).

## Reports, urgency and feasibility (prototype rules)
- **Urgency levels:**
  - Critical: act now.
  - High: next operational cycle.
  - Moderate: after the next satellite observation.
  - Low: continue monitoring.
  These are prototype review targets, not official firefighting guidance. Critical additionally needs a strong heat signal or high evidence quality.
- **Feasibility:** the crew base is a hypothetical field base near Sibu, Sarawak. Jurisdiction comes from the incident's region label. The 250 km straight-line planning radius is a prototype assumption. No routing or ETA is computed.
- **Anomaly layer:** an Isolation Forest is fitted on training rows; its threshold is the 95th percentile of validation scores. The pattern rules use training percentiles. On the 2025 test set, 6.5% of incidents were flagged unusual (follow-up rate 57% flagged vs 26% not flagged). Patterns describe observations only.
- **Consequences:** the simulated burned cells come from a procedural plot. The simulator does not use the ML estimate, so the simulated crew benefit can disagree with the evidence-based priority; the report discloses this when it happens.

## Footprint forecast (ml/footprint.py)
- **Target:** unique VIIRS nominal/high-confidence pixel locations within 5 km, 3–48 h after the alert. Pixels are de-duplicated on a ~375 m grid. Area = cells × 0.1406 km², a nadir pixel; real pixels grow off-nadir. This is a satellite-detected footprint, **not mapped burned area**.
- **Model, two parts:**
  1. P(any footprint), a gradient-boosted classifier.
  2. Size if activity continues: q10/q50/q90 quantile regressors plus a Poisson mean, fitted on positive cases only.
  Expected footprint = P × mean.
  A single median model was tried first and rejected: 64% of test incidents have zero footprint, so it predicted zero for everyone (Spearman 0.03).
- **Held-out 2025 test results** (n = 85,387), against repeating the last 24 h:

  | Measure | Model | Last-24 h baseline |
  |---|---|---|
  | Spearman | 0.49 | 0.40 |
  | MAE | 0.28 km² | 0.44 km² |
  | RMSE | 0.62 km² | 0.79 km² |

  Other results:
  - Any-footprint AUC is 0.78.
  - The 10–90% size range held the true value 89% of the time; it is slightly wide, so conservative.
  - The top-decile incidents averaged 1.07 km² observed, vs 0.18 km² for the rest.
- **Consequence replay:** one matched simulation run, chosen to be closest to the averages, is replayed in the report. A coordinator's choice against the recommendation plays the same hypothetical scenario in 3D. Partner (escalation) response is not modelled.
