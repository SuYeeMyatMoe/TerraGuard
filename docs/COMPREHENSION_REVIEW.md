# Informal comprehension review (to run with a person, not yet run)

**Purpose:** check whether someone who doesn't know the ML can read TerraGuard's incident panel correctly. This is an informal review with one or two people. It is **not** a statistically valid usability study, and its results must not be reported as one.

## Setup (10 minutes)
1. Start the app, open the **Command map**, and use the default replay day (26 Jun 2025).
2. Pick a reviewer who has not seen the code or the model. A forest officer or a non-technical teammate is ideal.
3. Show each case for about 2 minutes. They may expand any section. Don't explain anything; note where they hesitate.

## Cases
| Case | Incident | Why it is interesting |
|---|---|---|
| 1 | Rank 1 (Incident B) | Recommended for the crew. Single pixel, but supported by earlier detections, which gives Priority review rather than Critical. |
| 2 | Rank 2 (Incident C) | Lower model estimate; ranks above A on recency and evidence. |
| 3 | Rank 3 (Incident A) | Has the *higher* model estimate than C but ranks just below it by a small margin. |

## Questions (ask after each case; write the answer verbatim)
1. **What is being predicted?** Correct: the chance of another satellite detection nearby within 48 hours. It is *not* fire spread or damage.
2. **Why was this incident prioritized, or not?** Correct: they cite at least one priority reason from the "Why this incident ranks first / below" section.
3. **What evidence is uncertain?** Correct: they name at least one item from "Evidence limitations" or "What would improve confidence?"
4. **What action is recommended?** Correct: Send crew / Request recheck / Continue monitoring, matching the badge.
5. **Why was another incident ranked lower (or higher)?** Correct: the trade-off is named, e.g. "C is more recent even though A has the higher estimate".

## Record
| Reviewer | Case | Q1 | Q2 | Q3 | Q4 | Q5 | Misunderstandings / confusing words |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

**Watch especially for these misreadings:**
- treating the probability as "chance of a wildfire";
- reading the influence bars as percentages;
- reading tree variation as a confidence interval;
- reading the priority score as a probability.

Change the wording that caused confusion, then repeat with a second person if time allows.
