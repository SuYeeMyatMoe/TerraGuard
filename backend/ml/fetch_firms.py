"""Acquire NASA FIRMS VIIRS 375 m hotspot observations for the study area.

Source priority:
  1. FIRMS area API (requires FIRMS_MAP_KEY in backend/.env) -> VIIRS_SNPP_SP + VIIRS_NOAA20_SP
     (falls back to *_NRT for dates not yet in the standard-processing archive).
  2. Manually downloaded FIRMS CSV files placed in data/raw/firms_manual/*.csv.
  3. SYNTHETIC fallback: a seeded generator producing rows in the FIRMS VIIRS schema, conditioned on
     real Open-Meteo weather where available. It is clearly labelled as synthetic in provenance.json
     and in the UI. It exists so the pipeline and demo run without credentials; it is NOT evidence.

Usage:  python -m ml.fetch_firms
"""
from __future__ import annotations

import io
import json
import time
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests

from .config import BBOX, END_DATE, FIRMS_MAP_KEY, PROCESSED_DIR, RAW_DIR, START_DATE
from .fetch_weather import fetch_tiles, load_weather
from .geo import weather_tile

FIRMS_COLUMNS = [
    "latitude", "longitude", "bright_ti4", "scan", "track", "acq_date", "acq_time", "satellite",
    "instrument", "confidence", "version", "bright_ti5", "frp", "daynight",
]
OUT_PATH = RAW_DIR / "firms_viirs.csv"
PROVENANCE_PATH = PROCESSED_DIR / "provenance.json"
API = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{area}/{days}/{date}"


# --------------------------------------------------------------------------- FIRMS API
def fetch_from_api(key: str) -> pd.DataFrame:
    area = ",".join(str(v) for v in BBOX)
    start = date.fromisoformat(START_DATE)
    end = date.fromisoformat(END_DATE)
    frames = []
    for sensor in ("VIIRS_SNPP", "VIIRS_NOAA20"):
        d = start
        while d <= end:
            days = min(5, (end - d).days + 1)
            got = None
            for source in (f"{sensor}_SP", f"{sensor}_NRT"):
                url = API.format(key=key, source=source, area=area, days=days, date=d.isoformat())
                for attempt in range(4):
                    try:
                        r = requests.get(url, timeout=120)
                        if r.status_code == 429 or "Exceeding allowed transaction" in r.text[:200]:
                            time.sleep(60)
                            continue
                        r.raise_for_status()
                        break
                    except requests.RequestException:
                        time.sleep(5 * (attempt + 1))
                else:
                    continue
                if r.text.startswith("latitude"):
                    df = pd.read_csv(io.StringIO(r.text))
                    if len(df):
                        df["source_product"] = source
                        got = df
                        break
            if got is not None:
                frames.append(got)
            print(f"[firms] {sensor} {d} +{days}d -> {0 if got is None else len(got)} rows")
            d += timedelta(days=days)
    if not frames:
        return pd.DataFrame(columns=FIRMS_COLUMNS)
    return pd.concat(frames, ignore_index=True)


def load_manual() -> pd.DataFrame:
    folder = RAW_DIR / "firms_manual"
    files = sorted(folder.glob("*.csv")) if folder.exists() else []
    if not files:
        return pd.DataFrame()
    df = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
    w, s, e, n = BBOX
    df = df[(df.longitude.between(w, e)) & (df.latitude.between(s, n))]
    df = df[(df.acq_date >= START_DATE) & (df.acq_date <= END_DATE)]
    return df


# --------------------------------------------------------------------------- synthetic fallback
# Fire-prone zones with qualitative seasonality. Rates are tuned for a tractable dataset size, not to
# reproduce real detection totals.
ZONES = [
    # name, lat, lon, sigma_deg, base_rate, peat, season months -> weight, country
    ("Riau peat", 1.10, 101.90, 0.45, 1.6, 1, {2: 1.4, 3: 1.6, 6: 1.2, 7: 1.6, 8: 2.0, 9: 1.8}, "ID"),
    ("Jambi", -1.65, 103.80, 0.40, 1.1, 1, {7: 1.3, 8: 1.9, 9: 2.2, 10: 1.6}, "ID"),
    ("South Sumatra (OKI)", -3.05, 105.20, 0.45, 1.4, 1, {8: 1.8, 9: 2.4, 10: 2.0}, "ID"),
    ("West Kalimantan", -0.45, 109.70, 0.50, 1.3, 1, {7: 1.6, 8: 2.1, 9: 1.9}, "ID"),
    ("Ketapang", -1.85, 110.30, 0.40, 1.0, 1, {7: 1.3, 8: 2.0, 9: 2.1, 10: 1.4}, "ID"),
    ("Central Kalimantan (Sebangau)", -2.40, 113.90, 0.45, 1.6, 1, {8: 2.0, 9: 2.6, 10: 2.1}, "ID"),
    ("South Kalimantan", -3.00, 115.00, 0.40, 0.9, 0, {8: 1.6, 9: 2.0, 10: 1.6}, "ID"),
    ("East Kalimantan", 0.40, 116.90, 0.45, 0.8, 0, {3: 1.2, 8: 1.5, 9: 1.8, 10: 1.4}, "ID"),
    ("Sarawak (Mukah)", 2.80, 112.10, 0.35, 0.7, 1, {2: 1.3, 3: 1.4, 6: 1.3, 7: 1.6, 8: 1.7}, "MY"),
    ("Sarawak (Miri)", 4.15, 114.10, 0.30, 0.5, 1, {2: 1.6, 3: 1.8, 7: 1.3, 8: 1.4}, "MY"),
    ("Sabah (Kinabatangan)", 5.55, 118.00, 0.35, 0.5, 0, {2: 1.6, 3: 2.0, 4: 1.6}, "MY"),
    ("Selangor peat", 2.90, 101.55, 0.20, 0.35, 1, {2: 1.8, 3: 1.6, 6: 1.2, 7: 1.4}, "MY"),
    ("Pahang (Pekan)", 3.40, 103.25, 0.30, 0.4, 1, {2: 1.7, 3: 1.6, 6: 1.1, 7: 1.3}, "MY"),
]
YEAR_FACTOR = {"ID": {2023: 1.5, 2024: 1.0, 2025: 0.85}, "MY": {2023: 1.4, 2024: 1.0, 2025: 0.9}}


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def _zone_dryness(weather: pd.DataFrame, zone, days: list[date], rng) -> tuple[np.ndarray, np.ndarray, np.ndarray, bool]:
    """Daily dryness index in [0,1], precipitation and wind for a zone (real weather when cached)."""
    tlat, tlon = weather_tile(zone[1], zone[2])
    w = weather[(weather.tile_lat == float(tlat)) & (weather.tile_lon == float(tlon))] if len(weather) else weather
    if len(w):
        w = w.set_index("date").reindex(days)
        dsr = w["days_since_rain"].fillna(3).to_numpy()
        rh = w["relative_humidity_2m_min"].fillna(65).to_numpy()
        p7 = w["precip_7d"].fillna(20).to_numpy()
        pr = w["precipitation_sum"].fillna(3).to_numpy()
        ws = w["wind_speed_10m_max"].fillna(15).to_numpy()
        real = True
    else:  # AR(1) synthetic weather, flagged
        n = len(days)
        e = np.zeros(n)
        for i in range(1, n):
            e[i] = 0.85 * e[i - 1] + rng.normal(0, 0.4)
        months = np.array([d.month for d in days])
        dry_season = np.isin(months, list(zone[6].keys())).astype(float)
        pr = np.clip(rng.gamma(0.8, 8, n) * (1.2 - 0.7 * dry_season) - e, 0, None)
        p7 = pd.Series(pr).rolling(7, min_periods=1).sum().to_numpy()
        dsr = np.zeros(n)
        for i in range(1, n):
            dsr[i] = 0 if pr[i] >= 1 else dsr[i - 1] + 1
        rh = np.clip(70 - 15 * dry_season + 5 * rng.normal(size=n), 30, 95)
        ws = np.clip(rng.normal(16, 5, n), 3, 45)
        real = False
    d1 = np.minimum(dsr, 21) / 21
    d2 = np.clip((85 - rh) / 45, 0, 1)
    d3 = np.exp(-p7 / 15)
    return np.clip(0.4 * d1 + 0.35 * d2 + 0.25 * d3, 0, 1), pr, ws, real


def generate_synthetic(seed: int = 20251010) -> tuple[pd.DataFrame, dict]:
    rng = np.random.default_rng(seed)
    days = [date.fromisoformat(START_DATE) + timedelta(days=i)
            for i in range((date.fromisoformat(END_DATE) - date.fromisoformat(START_DATE)).days + 1)]
    tiles = sorted({tuple(float(v) for v in weather_tile(z[1], z[2])) for z in ZONES})
    try:
        fetch_tiles(tiles)
    except Exception as e:  # network failures must not break the pipeline
        print(f"[synthetic] weather fetch failed: {e!r}")
    weather = load_weather(tiles)

    rows: list[tuple] = []
    real_weather_zones = 0
    for zone in ZONES:
        name, zlat, zlon, sigma, base, peat, season, country = zone
        dry, precip, wind, real = _zone_dryness(weather, zone, days, rng)
        real_weather_zones += int(real)
        hot_cells = np.column_stack([zlat + rng.normal(0, sigma * 0.8, 14), zlon + rng.normal(0, sigma * 0.8, 14)])
        fires: list[dict] = []
        for di, d in enumerate(days):
            mult = season.get(d.month, 0.35) * YEAR_FACTOR[country][d.year]
            lam = base * mult * (0.15 + 3.0 * dry[di] ** 2)
            for _ in range(rng.poisson(lam)):
                if rng.random() < 0.55:
                    c = hot_cells[rng.integers(len(hot_cells))]
                    lat, lon = c[0] + rng.normal(0, 0.012), c[1] + rng.normal(0, 0.012)
                else:
                    lat, lon = zlat + rng.normal(0, sigma), zlon + rng.normal(0, sigma)
                fires.append({"lat": lat, "lon": lon, "size": 0.5 + rng.exponential(1.1) * (0.5 + dry[di]),
                              "age": 0, "peat": peat * (rng.random() < 0.8)})
            survivors = []
            for f in fires:
                if f["age"] > 0:
                    logit = (-2.6 + 3.4 * dry[di] + 0.45 * np.log1p(f["size"]) + 0.8 * f["peat"]
                             + 0.35 * min(f["age"], 5) / 5 + 0.3 * (wind[di] > 25) - 2.2 * (precip[di] > 10))
                    if rng.random() > _sigmoid(logit):
                        continue
                    f["size"] = float(np.clip(f["size"] * np.exp(rng.normal(0.25 * (dry[di] - 0.5), 0.3)), 0.4, 10))
                    f["lat"] += rng.normal(0, 0.002)
                    f["lon"] += rng.normal(0, 0.002)
                f["age"] += 1
                survivors.append(f)
                cloud = 0.2 + 0.45 * (precip[di] > 2)
                for sat, local_h in (("N20", 12.67), ("N", 13.5), ("N20", 0.83), ("N", 1.5)):
                    night = local_h < 6
                    if rng.random() < 0.13:  # swath gap / no coverage
                        continue
                    k = 0.5 if night else 0.9
                    if rng.random() > (1 - np.exp(-k * f["size"])) * (1 - cloud):
                        continue
                    utc_h = local_h - f["lon"] / 15 + rng.normal(0, 0.35)
                    ts = datetime(d.year, d.month, d.day, tzinfo=timezone.utc) + timedelta(hours=utc_h)
                    npx = max(1, rng.poisson(f["size"] * 0.6))
                    scan = float(np.clip(0.39 + rng.exponential(0.12), 0.32, 0.8))
                    track = float(np.clip(0.36 + (scan - 0.39) * 0.6 + rng.normal(0, 0.02), 0.36, 0.78))
                    for _ in range(npx):
                        frp = float(rng.lognormal(np.log(1.5 + 2.5 * np.sqrt(f["size"]) * (0.5 + dry[di])), 0.8))
                        bt4 = float(np.clip((292 if night else 305) + 22 * np.log1p(frp) + rng.normal(0, 6), 280, 367))
                        bt5 = float(np.clip((280 if night else 290) + 7 * np.log1p(frp) + rng.normal(0, 4), 265, 330))
                        conf = "h" if (bt4 > 345 or frp > 18) else ("n" if frp > 2.5 or rng.random() < 0.4 else "l")
                        jitter = 0.0018 * np.sqrt(npx)
                        rows.append((f["lat"] + rng.normal(0, jitter), f["lon"] + rng.normal(0, jitter), round(bt4, 2),
                                     round(scan, 2), round(track, 2), ts.strftime("%Y-%m-%d"), int(ts.strftime("%H%M")),
                                     sat, "VIIRS", conf, "2.0NRT-SYN", round(bt5, 2), round(frp, 2), "N" if night else "D"))
            fires = survivors
        # transient false-positive-like detections (never persist): low FRP, often low confidence, edge of scan
        for di, d in enumerate(days):
            for _ in range(rng.poisson(0.5)):
                lat, lon = zlat + rng.normal(0, sigma * 2.2), zlon + rng.normal(0, sigma * 2.2)
                utc_h = 13.5 - lon / 15 + rng.normal(0, 0.4)
                ts = datetime(d.year, d.month, d.day, tzinfo=timezone.utc) + timedelta(hours=utc_h)
                frp = float(rng.lognormal(np.log(1.2), 0.5))
                rows.append((lat, lon, round(float(rng.uniform(300, 325)), 2), round(float(rng.uniform(0.5, 0.8)), 2),
                             round(float(rng.uniform(0.45, 0.75)), 2), ts.strftime("%Y-%m-%d"), int(ts.strftime("%H%M")),
                             "N" if rng.random() < 0.5 else "N20", "VIIRS", "l" if rng.random() < 0.7 else "n",
                             "2.0NRT-SYN", round(float(rng.uniform(280, 295)), 2), round(frp, 2), "D"))
        print(f"[synthetic] {name}: cumulative rows {len(rows)}")
    df = pd.DataFrame(rows, columns=FIRMS_COLUMNS)
    w, s, e, n = BBOX
    df = df[df.longitude.between(w, e) & df.latitude.between(s, n)]
    df = df[(df.acq_date >= START_DATE) & (df.acq_date <= END_DATE)]
    meta = {"generator_seed": seed, "zones": [z[0] for z in ZONES],
            "weather_conditioning": f"{real_weather_zones}/{len(ZONES)} zones conditioned on real Open-Meteo weather"}
    return df.reset_index(drop=True), meta


# --------------------------------------------------------------------------- main
def main() -> None:
    meta: dict = {}
    if FIRMS_MAP_KEY:
        df = fetch_from_api(FIRMS_MAP_KEY)
        source = "NASA_FIRMS_API"
    else:
        df = pd.DataFrame()
        source = ""
    if not len(df):
        df = load_manual()
        source = "NASA_FIRMS_MANUAL_CSV" if len(df) else source
    if not len(df):
        df, meta = generate_synthetic()
        source = "SYNTHETIC"
    df.to_csv(OUT_PATH, index=False)
    prov = {
        "source": source,
        "is_synthetic": source == "SYNTHETIC",
        "product": "VIIRS 375 m active fire (S-NPP + NOAA-20)" if source != "SYNTHETIC"
        else "Synthetic rows in the FIRMS VIIRS 375 m schema (demo fallback, not real observations)",
        "bbox": BBOX,
        "period": [START_DATE, END_DATE],
        "rows": int(len(df)),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        **meta,
    }
    PROVENANCE_PATH.write_text(json.dumps(prov, indent=2))
    print(json.dumps(prov, indent=2))


if __name__ == "__main__":
    main()
