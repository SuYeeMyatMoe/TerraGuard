# Assumptions

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
