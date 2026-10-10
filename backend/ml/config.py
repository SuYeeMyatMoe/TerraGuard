"""Shared configuration for the TerraGuard data and model pipeline."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

DATA_DIR = BACKEND_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
MODEL_DIR = DATA_DIR / "model"
for _d in (RAW_DIR, PROCESSED_DIR, MODEL_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# Study area: Malaysia (Peninsular, Sarawak, Sabah) + Indonesia (Sumatra/Riau, Kalimantan)
BBOX = (95.0, -4.5, 119.5, 7.5)  # west, south, east, north
START_DATE = "2023-01-01"
END_DATE = "2025-12-31"

# Chronological split boundaries (UTC)
VAL_START = "2024-07-01"
TEST_START = "2025-01-01"

# Incident construction thresholds (documented in docs/DATA.md)
PASS_GAP_MIN = 10            # detections from same satellite within 10 min = one acquisition pass
CLUSTER_EPS_KM = 0.75        # in-pass clustering radius (VIIRS I-band pixel ~375 m)
ASSOC_RADIUS_KM = 2.0        # follow-up / track association radius
TRACK_GAP_H = 72             # max gap between linked candidates in a track
LABEL_MIN_H = 3              # follow-up must be >= 3 h later (excludes SNPP/NOAA-20 near-simultaneous passes)
LABEL_HORIZON_H = 48         # prediction horizon
FEATURE_HISTORY_D = 7        # longest short-term feature window (purge width)

WEATHER_TILE_DEG = 1.0

FIRMS_MAP_KEY = os.getenv("FIRMS_MAP_KEY", "").strip()

# Curated protected areas. Boundaries are APPROXIMATE (centroid + equivalent radius) unless replaced
# by verified WDPA polygons from Earth Engine. Never present these as verified boundaries.
PROTECTED_AREAS = [
    {"id": "PA-KLN", "name": "Kuala Langat North Forest Reserve", "country": "Malaysia", "lat": 2.93, "lon": 101.60, "radius_km": 4.0},
    {"id": "PA-RMF", "name": "Raja Musa Forest Reserve", "country": "Malaysia", "lat": 3.47, "lon": 101.30, "radius_km": 9.0},
    {"id": "PA-PEK", "name": "Pekan Forest Reserve", "country": "Malaysia", "lat": 3.35, "lon": 103.30, "radius_km": 10.0},
    {"id": "PA-MAL", "name": "Maludam National Park", "country": "Malaysia", "lat": 1.60, "lon": 111.05, "radius_km": 9.5},
    {"id": "PA-LBN", "name": "Loagan Bunut National Park", "country": "Malaysia", "lat": 3.75, "lon": 114.22, "radius_km": 6.0},
    {"id": "PA-KIN", "name": "Lower Kinabatangan Wildlife Sanctuary", "country": "Malaysia", "lat": 5.50, "lon": 118.20, "radius_km": 9.0},
    {"id": "PA-SEB", "name": "Sebangau National Park", "country": "Indonesia", "lat": -2.55, "lon": 113.70, "radius_km": 30.0},
    {"id": "PA-TPU", "name": "Tanjung Puting National Park", "country": "Indonesia", "lat": -2.95, "lon": 111.95, "radius_km": 36.0},
    {"id": "PA-TNL", "name": "Tesso Nilo National Park", "country": "Indonesia", "lat": -0.20, "lon": 101.95, "radius_km": 18.0},
    {"id": "PA-BKS", "name": "Berbak-Sembilang National Park", "country": "Indonesia", "lat": -1.55, "lon": 104.25, "radius_km": 25.0},
    {"id": "PA-GPA", "name": "Gunung Palung National Park", "country": "Indonesia", "lat": -1.25, "lon": 110.15, "radius_km": 18.0},
    {"id": "PA-KUT", "name": "Kutai National Park", "country": "Indonesia", "lat": 0.40, "lon": 117.35, "radius_km": 25.0},
]
