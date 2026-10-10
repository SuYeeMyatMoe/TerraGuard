"""Small geographic helpers (no heavy GIS dependencies)."""
from __future__ import annotations

import numpy as np

from .config import PROTECTED_AREAS, WEATHER_TILE_DEG

EARTH_R_KM = 6371.0088

# Named administrative regions used only for human-readable labels (nearest centre wins).
REGIONS = [
    ("Selangor", "Malaysia", 3.07, 101.52),
    ("Pahang", "Malaysia", 3.80, 102.90),
    ("Johor", "Malaysia", 1.95, 103.40),
    ("Perak", "Malaysia", 4.60, 101.10),
    ("Kedah", "Malaysia", 6.00, 100.60),
    ("Terengganu", "Malaysia", 5.00, 103.00),
    ("Sarawak", "Malaysia", 2.50, 112.50),
    ("Sarawak (Miri)", "Malaysia", 4.10, 114.20),
    ("Sabah", "Malaysia", 5.40, 117.60),
    ("Riau", "Indonesia", 0.50, 101.70),
    ("Jambi", "Indonesia", -1.60, 103.40),
    ("South Sumatra", "Indonesia", -3.20, 104.60),
    ("North Sumatra", "Indonesia", 2.60, 99.20),
    ("Aceh", "Indonesia", 4.40, 96.80),
    ("West Sumatra", "Indonesia", -0.80, 100.50),
    ("West Kalimantan", "Indonesia", -0.20, 110.00),
    ("Central Kalimantan", "Indonesia", -2.00, 113.50),
    ("South Kalimantan", "Indonesia", -3.00, 115.30),
    ("East Kalimantan", "Indonesia", 0.50, 116.60),
    ("North Kalimantan", "Indonesia", 3.00, 116.50),
]


def haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_R_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def region_label(lat: float, lon: float) -> tuple[str, str]:
    best = min(REGIONS, key=lambda r: (r[2] - lat) ** 2 + ((r[3] - lon) * np.cos(np.radians(lat))) ** 2)
    return best[0], best[1]


def weather_tile(lat, lon, deg: float = WEATHER_TILE_DEG):
    """Return the tile centre (lat, lon) for given coordinates."""
    tlat = np.floor(np.asarray(lat) / deg) * deg + deg / 2
    tlon = np.floor(np.asarray(lon) / deg) * deg + deg / 2
    return np.round(tlat, 3), np.round(tlon, 3)


def nearest_protected_area(lat, lon):
    """Distance (km) from points to the nearest approximate PA boundary, plus the PA index."""
    lat = np.atleast_1d(np.asarray(lat, dtype=float))
    lon = np.atleast_1d(np.asarray(lon, dtype=float))
    pa_lat = np.array([p["lat"] for p in PROTECTED_AREAS])
    pa_lon = np.array([p["lon"] for p in PROTECTED_AREAS])
    pa_r = np.array([p["radius_km"] for p in PROTECTED_AREAS])
    d = haversine_km(lat[:, None], lon[:, None], pa_lat[None, :], pa_lon[None, :]) - pa_r[None, :]
    idx = np.argmin(d, axis=1)
    dist = np.maximum(d[np.arange(len(lat)), idx], 0.0)
    return dist, idx
