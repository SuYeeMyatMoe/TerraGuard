"""Fetch historical daily weather from the Open-Meteo archive API (free, no key).

Weather is fetched per 1-degree tile centre and cached to data/raw/weather/<tile>.csv.
If the API is unreachable, `load_weather` returns an empty frame and features fall back to
missing-value indicators (never fabricated weather).
"""
from __future__ import annotations

import time
from pathlib import Path

import pandas as pd
import requests

from .config import END_DATE, RAW_DIR, START_DATE

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DAILY_VARS = [
    "temperature_2m_max",
    "relative_humidity_2m_min",
    "precipitation_sum",
    "wind_speed_10m_max",
    "wind_direction_10m_dominant",
    "et0_fao_evapotranspiration",
]
WEATHER_DIR = RAW_DIR / "weather"
WEATHER_DIR.mkdir(parents=True, exist_ok=True)


def _tile_path(lat: float, lon: float) -> Path:
    return WEATHER_DIR / f"{lat:+07.3f}_{lon:+08.3f}.csv"


def fetch_tiles(tiles: list[tuple[float, float]], start: str = START_DATE, end: str = END_DATE,
                batch: int = 4, pause_s: float = 20.0) -> None:
    """Fetch any tiles not yet cached. Batches several locations per request and paces calls."""
    todo = [t for t in tiles if not _tile_path(*t).exists()]
    print(f"[weather] {len(tiles)} tiles, {len(todo)} to fetch")
    for i in range(0, len(todo), batch):
        chunk = todo[i:i + batch]
        params = {
            "latitude": ",".join(f"{t[0]:.3f}" for t in chunk),
            "longitude": ",".join(f"{t[1]:.3f}" for t in chunk),
            "start_date": start,
            "end_date": end,
            "daily": ",".join(DAILY_VARS),
            "timezone": "UTC",
            "wind_speed_unit": "kmh",
        }
        for attempt in range(5):
            try:
                r = requests.get(ARCHIVE_URL, params=params, timeout=90)
                if r.status_code == 429:
                    wait = 60 * (attempt + 1)
                    print(f"[weather] rate limited, waiting {wait}s")
                    time.sleep(wait)
                    continue
                r.raise_for_status()
                payload = r.json()
                payload = payload if isinstance(payload, list) else [payload]
                for t, p in zip(chunk, payload):
                    df = pd.DataFrame(p["daily"])
                    df.to_csv(_tile_path(*t), index=False)
                print(f"[weather] fetched {i + len(chunk)}/{len(todo)}")
                break
            except requests.RequestException as e:
                print(f"[weather] error {e!r}, retry {attempt + 1}")
                time.sleep(10 * (attempt + 1))
        else:
            print(f"[weather] giving up on chunk {chunk}")
        if i + batch < len(todo):
            time.sleep(pause_s)


def load_weather(tiles: list[tuple[float, float]]) -> pd.DataFrame:
    """Load cached tiles into a long frame with derived dryness variables."""
    frames = []
    for lat, lon in tiles:
        p = _tile_path(lat, lon)
        if not p.exists():
            continue
        df = pd.read_csv(p)
        df["tile_lat"] = lat
        df["tile_lon"] = lon
        frames.append(df)
    if not frames:
        return pd.DataFrame()
    w = pd.concat(frames, ignore_index=True)
    w["date"] = pd.to_datetime(w["time"]).dt.date
    w = w.drop(columns=["time"]).sort_values(["tile_lat", "tile_lon", "date"])
    g = w.groupby(["tile_lat", "tile_lon"], sort=False)
    w["precip_3d"] = g["precipitation_sum"].transform(lambda s: s.rolling(3, min_periods=1).sum())
    w["precip_7d"] = g["precipitation_sum"].transform(lambda s: s.rolling(7, min_periods=1).sum())

    def _days_since_rain(s: pd.Series) -> pd.Series:
        out, n = [], 30
        for v in s.fillna(0).to_numpy():
            n = 0 if v >= 1.0 else min(n + 1, 60)
            out.append(n)
        return pd.Series(out, index=s.index)

    w["days_since_rain"] = g["precipitation_sum"].transform(_days_since_rain)
    return w.reset_index(drop=True)
