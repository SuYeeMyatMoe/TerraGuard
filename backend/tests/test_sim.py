import numpy as np

from sim.automaton import BURNED, BURNING, INTERVENED, make_plot, run
from sim.policies import allocate, simulate_policies

IDS = ["T-A", "T-B", "T-C"]


def _plots():
    return [make_plot("T-A", 0.9, 2, 18, 220, 0.7), make_plot("T-B", 0.1, 1, 10, 90, 0.5),
            make_plot("T-C", 0.4, 3, 25, 180, 0.8)]


def test_deterministic_for_same_seed():
    a = simulate_policies(_plots(), IDS, ["T-C", "T-A", "T-B"], 1, 4, 30, 5, 6)
    b = simulate_policies(_plots(), IDS, ["T-C", "T-A", "T-B"], 1, 4, 30, 5, 6)
    assert a["policies"]["ai_priority"]["frames"] == b["policies"]["ai_priority"]["frames"]
    assert a["comparison"] == b["comparison"]


def test_identical_allocation_gives_identical_outcomes():
    # common random numbers: when both policies pick the same incident, every seed must tie
    r = simulate_policies(_plots(), IDS, ["T-A", "T-C", "T-B"], 1, 4, 30, 5, 10)
    assert r["comparison"]["same_allocation"]
    assert r["comparison"]["loss_index"]["seeds_tied"] == 10


def test_team_limit_respected():
    assert allocate("first_alert", ["a", "b", "c"], ["c", "b", "a"], 1) == ["a"]
    assert allocate("ai_priority", ["a", "b", "c"], ["c", "b", "a"], 2) == ["c", "b"]
    assert allocate("none", ["a", "b", "c"], ["c", "b", "a"], 3) == []
    r = simulate_policies(_plots(), IDS, ["T-C", "T-A", "T-B"], 1, 4, 20, 1, 2)
    for p in ("first_alert", "ai_priority"):
        assert len(r["policies"][p]["assigned"]) == 1


def test_intervention_never_increases_burned_area_on_its_plot():
    plots = _plots()
    rand = np.random.default_rng(3).random((12, 40, 3, 20, 20), dtype=np.float32)
    none = run(plots, np.array([np.inf] * 3), np.zeros(3, int), 40, rand, False)
    team = run(plots, np.array([3, np.inf, np.inf]), np.array([1, 0, 0]), 40, rand, False)
    assert (team["burned"][:, 0] <= none["burned"][:, 0]).all()
    assert (team["burned"][:, 1:] == none["burned"][:, 1:]).all()  # other plots untouched
    assert (team["final"][:, 0] == INTERVENED).any()


def test_frames_shape_and_states():
    r = simulate_policies(_plots(), IDS, ["T-C", "T-A", "T-B"], 1, 4, 20, 2, 2)
    frames = r["policies"]["none"]["frames"]
    assert len(frames) == 21 and all(len(p) == 400 for p in frames[0])
    assert set("".join(frames[-1])) <= set("01234")
    assert str(BURNING) in "".join(frames[1]) or str(BURNED) in "".join(frames[1])


def test_response_sequence_and_fire_residence_are_shared_across_policies():
    # No spreading: isolate timing from random weather and prove that only arrival enables suppression.
    plot = make_plot("TIMING", 0, 1, 0, 0, 0, [(10, 10)])
    plot.fuel[:] = 0
    plot.fuel[10, 10] = .5
    r = simulate_policies([plot], ["TIMING"], ["TIMING"], 1, 4, 12, 7, 2,
                          burn_duration_steps=8)
    assert r["assumptions"]["burn_duration_steps"] == 8
    assert r["policies"]["none"]["assigned"] == []
    for key in ("first_alert", "ai_priority"):
        frames = r["policies"][key]["frames"]
        assert [f[0][210] for f in frames[:5]] == [str(BURNING)] * 5
        assert frames[5][0][210] == str(INTERVENED)
        assert next(e["step"] for e in r["policies"][key]["events"] if e["type"] == "arrival") == 4
    baseline = r["policies"]["none"]["frames"]
    assert baseline[7][0][210] == str(BURNING)
    assert baseline[8][0][210] == str(BURNED)
    assert r["comparison"]["same_allocation"]


def test_extended_duration_never_creates_a_team_or_changes_legacy_defaults():
    extended = simulate_policies(_plots(), IDS, ["T-C", "T-A", "T-B"], 0, 4, 12, 7, 2,
                                 burn_duration_steps=8)
    frames = [p["frames"] for p in extended["policies"].values()]
    assert frames[0] == frames[1] == frames[2]
    assert all(p["assigned"] == [] for p in extended["policies"].values())
    legacy = simulate_policies(_plots(), IDS, IDS, 1, 4, 12, 7, 2)
    assert legacy["assumptions"]["burn_duration_steps"] == 2
