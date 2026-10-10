"""Simplified, reproducible NumPy cellular automaton for hypothetical fire propagation.

This is NOT a validated wildfire forecast. It is a scenario tool for comparing response policies
under identical assumptions. All parameters are listed in ASSUMPTIONS below and returned by the API.

Cell states: 0 empty (clearing, path, water) · 1 healthy vegetation · 2 burning · 3 burned ·
4 intervention-affected (suppressed or cleared firebreak). The protected-habitat mask is a separate layer.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

import numpy as np

EMPTY, HEALTHY, BURNING, BURNED, INTERVENED = 0, 1, 2, 3, 4

ASSUMPTIONS = {
    "grid": "20 x 20 cells per incident plot",
    "cell_size_m": 100,
    "minutes_per_step": 30,
    "base_spread_probability": 0.2,
    "diagonal_factor": 0.7,
    "burn_duration_steps": 2,
    "wind_coefficient_per_kmh": 0.05,
    "team_suppression_cells_per_step": 3,
    "team_cost_rm_per_hour": 180,
    "dispatch_cost_rm": 1500,
    "loss_index_per_burned_cell": 1,
    "loss_index_per_protected_cell": 5,
}
H = W = 20
OFFSETS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


@dataclass
class PlotSpec:
    incident_id: str
    fuel: np.ndarray            # (H, W) float in [0, 1]; 0 => empty cell
    protected: np.ndarray       # (H, W) bool
    ignition: list[tuple[int, int]]
    wind_speed: float           # km/h
    wind_dir_deg: float         # meteorological: direction the wind comes FROM, 0 = north
    dryness: float              # 0..1
    protected_dist: np.ndarray = field(default=None)  # (H, W) distance to nearest protected cell


def _seed_from(text: str) -> int:
    return int(hashlib.sha256(text.encode()).hexdigest()[:8], 16)


def _smooth_noise(rng, scale: int = 4) -> np.ndarray:
    coarse = rng.random((H // scale + 2, W // scale + 2))
    ys = np.linspace(0, coarse.shape[0] - 1.001, H)
    xs = np.linspace(0, coarse.shape[1] - 1.001, W)
    y0, x0 = ys.astype(int), xs.astype(int)
    fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
    c = coarse
    top = c[y0][:, x0] * (1 - fx) + c[y0][:, x0 + 1] * fx
    bot = c[y0 + 1][:, x0] * (1 - fx) + c[y0 + 1][:, x0 + 1] * fx
    return top * (1 - fy) + bot * fy


def _distance_map(mask: np.ndarray) -> np.ndarray:
    if not mask.any():
        return np.full(mask.shape, 99.0)
    yy, xx = np.mgrid[0:H, 0:W]
    py, px = np.nonzero(mask)
    d = np.sqrt((yy[..., None] - py) ** 2 + (xx[..., None] - px) ** 2)
    return d.min(axis=-1)


def make_plot(incident_id: str, exposure: float, n_pixels: int, wind_speed: float, wind_dir_deg: float,
              dryness: float, ignition: list[tuple[int, int]] | None = None) -> PlotSpec:
    """Procedural, hypothetical forest plot. Seeded by incident id so it is reproducible."""
    rng = np.random.default_rng(_seed_from(incident_id))
    fuel = 0.45 + 0.55 * _smooth_noise(rng)
    fuel = np.clip(fuel + rng.normal(0, 0.05, (H, W)), 0.2, 1.0)
    fuel[_smooth_noise(rng, 5) < 0.12] = 0.0            # natural clearings
    path_row = int(rng.integers(5, 15))                 # a narrow access path
    cols = np.arange(W)
    rows = np.clip(path_row + np.round(np.sin(cols / 3.0 + rng.random() * 6) * 1.2).astype(int), 0, H - 1)
    fuel[rows, cols] = 0.0
    # protected habitat: a blob anchored on one edge, larger when the incident is closer to a protected area
    protected = np.zeros((H, W), dtype=bool)
    if exposure > 0.05:
        edge = int(rng.integers(4))
        cy, cx = [(1, W // 2), (H // 2, W - 2), (H - 2, W // 2), (H // 2, 1)][edge]
        cy += int(rng.integers(-4, 5)) if edge in (1, 3) else 0
        cx += int(rng.integers(-4, 5)) if edge in (0, 2) else 0
        radius = 3.0 + 6.0 * exposure
        yy, xx = np.mgrid[0:H, 0:W]
        blob = (yy - cy) ** 2 + (xx - cx) ** 2 <= radius ** 2 * (0.85 + 0.3 * _smooth_noise(rng))
        protected = blob & (fuel > 0)
    dist = _distance_map(protected)
    if not ignition:
        # ignite away from the protected area: the reachable cell closest to distance ~8 from it
        cand = np.argwhere(fuel > 0)
        target = 8.0 if protected.any() else 0.0
        if protected.any():
            score = np.abs(dist[cand[:, 0], cand[:, 1]] - target) + 0.05 * np.abs(cand - [H // 2, W // 2]).sum(1)
        else:
            score = np.abs(cand - [H // 2, W // 2]).sum(1).astype(float)
        r, c = cand[int(np.argmin(score))]
        ignition = [(int(r), int(c))]
        extra = min(max(int(n_pixels) - 1, 0), 2)
        for dy, dx in [(0, 1), (1, 0)][:extra]:
            rr, cc = r + dy, c + dx
            if 0 <= rr < H and 0 <= cc < W and fuel[rr, cc] > 0:
                ignition.append((int(rr), int(cc)))
    for r, c in ignition:
        fuel[r, c] = max(fuel[r, c], 0.5)
    return PlotSpec(incident_id, fuel, protected, ignition, wind_speed, wind_dir_deg, dryness, dist)


def _shift(a: np.ndarray, dy: int, dx: int) -> np.ndarray:
    """out[..., y, x] = a[..., y - dy, x - dx] with zero fill (no wrap-around)."""
    out = np.zeros_like(a)
    ys = slice(max(dy, 0), H + min(dy, 0)); yd = slice(max(-dy, 0), H + min(-dy, 0))
    xs = slice(max(dx, 0), W + min(dx, 0)); xd = slice(max(-dx, 0), W + min(-dx, 0))
    out[..., ys, xs] = a[..., yd, xd]
    return out


def _shift_any(b: np.ndarray) -> np.ndarray:
    near = np.zeros_like(b)
    for dy, dx in OFFSETS:
        near |= _shift(b, dy, dx)
    return near


def _direction_probs(plot: PlotSpec) -> np.ndarray:
    """Spread probability multiplier for each of the 8 neighbour offsets (neighbour -> cell)."""
    to_rad = np.radians((plot.wind_dir_deg + 180.0) % 360.0)
    wind_vec = np.array([-np.cos(to_rad), np.sin(to_rad)])  # (south, east) components
    out = []
    for dy, dx in OFFSETS:
        v = np.array([dy, dx], dtype=float)
        n = np.linalg.norm(v)
        cos = float(v @ wind_vec / n)
        diag = ASSUMPTIONS["diagonal_factor"] if dy and dx else 1.0
        out.append(diag * np.exp(ASSUMPTIONS["wind_coefficient_per_kmh"] * plot.wind_speed * cos * 0.5))
    out = np.array(out)
    return out / out.mean()  # wind redistributes spread direction, it doesn't create extra fire


def run(plots: list[PlotSpec], arrivals: np.ndarray, teams_at: np.ndarray, steps: int,
        rand: np.ndarray, keep_frames: bool) -> dict:
    """Run the automaton for S seeds at once.

    arrivals : (P,) arrival step for each plot (np.inf when no team assigned)
    teams_at : (P,) number of teams assigned to each plot
    rand     : (S, steps, P, H, W) uniform random numbers, SHARED across policies (common random numbers)
    """
    S, P = rand.shape[0], len(plots)
    fuel = np.stack([p.fuel for p in plots])                        # (P,H,W)
    prot = np.stack([p.protected for p in plots])
    dist = np.stack([p.protected_dist for p in plots])
    dry = np.array([0.35 + 0.9 * p.dryness for p in plots])         # (P,)
    dirp = np.stack([_direction_probs(p) for p in plots])           # (P,8)
    base = ASSUMPTIONS["base_spread_probability"]
    cap = ASSUMPTIONS["team_suppression_cells_per_step"]

    state = np.where(fuel > 0, HEALTHY, EMPTY).astype(np.int8)
    state = np.repeat(state[None], S, axis=0)                       # (S,P,H,W)
    timer = np.zeros_like(state)
    for pi, p in enumerate(plots):
        for r, c in p.ignition:
            state[:, pi, r, c] = BURNING
            timer[:, pi, r, c] = ASSUMPTIONS["burn_duration_steps"]
    frames = [state[0].copy()] if keep_frames else []
    contained_step = np.full((S, P), -1)
    active_until = np.zeros((S, P))
    order_cache = np.argsort(dist.reshape(P, -1), axis=1, kind="stable")  # suppression priority per plot

    for t in range(steps):
        # 1) intervention by teams on site
        for pi in range(P):
            if t < arrivals[pi] or teams_at[pi] == 0:
                continue
            budget = cap * int(teams_at[pi])
            order = order_cache[pi]
            for s in range(S):
                flat = state[s, pi].reshape(-1)
                burning = np.nonzero(flat[order] == BURNING)[0]
                if len(burning) == 0:
                    if contained_step[s, pi] < 0:
                        contained_step[s, pi] = t
                    continue
                active_until[s, pi] = t + 1
                hit = order[burning[:budget]]
                flat[hit] = INTERVENED
                left = budget - len(hit)
                if left > 0 and prot[pi].any():
                    # firebreak: clear healthy cells next to the fire, nearest the protected area first
                    near = _shift_any(state[s, pi] == BURNING)
                    cand_mask = (near & (state[s, pi] == HEALTHY)).reshape(-1)
                    cands = order[cand_mask[order]][:left]
                    flat[cands] = INTERVENED
        # 2) spread
        burning = state == BURNING
        q = np.ones(state.shape, dtype=np.float32)
        for k, (dy, dx) in enumerate(OFFSETS):
            shifted = _shift(burning, dy, dx)
            pk = (base * dirp[:, k] * dry)[None, :, None, None]
            q *= 1.0 - np.clip(pk * fuel[None], 0, 0.95) * shifted
        ignite = (state == HEALTHY) & (rand[:, t] < 1.0 - q)
        # 3) burn-out
        timer = np.where(burning, timer - 1, timer)
        state = np.where(burning & (timer <= 0), BURNED, state).astype(np.int8)
        state = np.where(ignite, BURNING, state).astype(np.int8)
        timer = np.where(ignite, ASSUMPTIONS["burn_duration_steps"], timer)
        if keep_frames:
            frames.append(state[0].copy())

    burned = ((state == BURNED) | (state == BURNING)).sum(axis=(2, 3))            # (S,P)
    prot_burned = (((state == BURNED) | (state == BURNING)) & prot[None]).sum(axis=(2, 3))
    still_burning = (state == BURNING).any(axis=(2, 3))
    return {"burned": burned, "protected_burned": prot_burned, "still_burning": still_burning,
            "contained_step": contained_step, "active_until": active_until,
            "frames": frames, "final": state}
