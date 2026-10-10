"""Plain-language catalogue of the model's features (single source of truth for user-facing wording).

Each entry: friendly name, what the observation means, unit, how to turn the stored model value into the
displayed value, and whether a training-reference percentile comparison is meaningful.
`month_sin` and `month_cos` are two halves of one seasonal signal and are presented together as "Seasonal timing".
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Optional

SEASON_PARTS = ("month_sin", "month_cos")
SEASON_KEY = "season"


@dataclass(frozen=True)
class FeatureInfo:
    name: str                      # friendly label shown to coordinators
    meaning: str                   # what the observation is (and is not)
    unit: str = ""                 # unit of the displayed value
    to_display: Callable[[float], float] = lambda v: v
    decimals: int = 0
    comparable: bool = True        # percentile comparison against the training reference is meaningful
    kind: str = "number"           # number | boolean | season
    count_noun: Optional[str] = None  # for counts: "detection" -> "3 detections"


def _expm1(v: float) -> float:
    return math.expm1(v)


CATALOG: dict[str, FeatureInfo] = {
    "n_pixels": FeatureInfo("Satellite pixels in this detection", "How many neighbouring satellite pixels flagged heat in the same pass.",
                            count_noun="pixel"),
    "frp_max": FeatureInfo("Strongest recorded heat output", "Peak fire radiative power the satellite recorded in this cluster.", "MW", decimals=1),
    "frp_mean": FeatureInfo("Average recorded heat output", "Average fire radiative power across the cluster's pixels.", "MW", decimals=1),
    "log_frp_sum": FeatureInfo("Total recorded heat output", "Sum of fire radiative power across the cluster's pixels.", "MW",
                               to_display=_expm1, decimals=1),
    "bt4_max": FeatureInfo("Recorded satellite thermal signal", "Brightness recorded by the sensor's thermal channel. It is not the flame or ground temperature.", "K"),
    "conf_h_frac": FeatureInfo("Share of high-confidence pixels", "Share of the cluster's pixels that NASA marked high confidence.", "%",
                               to_display=lambda v: v * 100),
    "conf_l_frac": FeatureInfo("Share of low-confidence pixels", "Share of the cluster's pixels that NASA marked low confidence.", "%",
                               to_display=lambda v: v * 100),
    "is_night": FeatureInfo("Night-time detection", "Whether the satellite pass was at night, when only stronger heat sources are usually detected.",
                            comparable=False, kind="boolean"),
    "scan_track": FeatureInfo("Satellite observation footprint", "Size of the satellite's ground pixel at this viewing angle. It is not the size of the fire.",
                              "km²", decimals=2),
    "prior_24h": FeatureInfo("Nearby satellite detections, previous 24 h", "Detections within 2 km in the 24 hours before this one.", count_noun="detection"),
    "prior_72h": FeatureInfo("Nearby satellite detections, previous 72 h", "Detections within 2 km in the 72 hours before this one.", count_noun="detection"),
    "prior_7d": FeatureInfo("Nearby satellite detections, previous 7 days", "Detections within 2 km in the 7 days before this one.", count_noun="detection"),
    "multi_sensor_2h": FeatureInfo("Seen by a second satellite", "Whether the other VIIRS satellite also detected heat nearby within 2 hours before.",
                                   comparable=False, kind="boolean"),
    "track_age_h": FeatureInfo("Time since activity was first seen here", "Hours since the first linked detection at this location.", "h", decimals=1),
    "hist_365d": FeatureInfo("Past-year detections in this area", "Satellite detections in the surrounding ~10 km grid cell over the previous year.",
                             count_noun="detection"),
    SEASON_KEY: FeatureInfo("Seasonal timing", "Time of year, which captures the usual dry- and wet-season pattern.", comparable=False, kind="season"),
    "temperature_2m_max": FeatureInfo("Highest temperature, previous day", "Daily maximum air temperature from the weather archive.", "°C", decimals=1),
    "relative_humidity_2m_min": FeatureInfo("Lowest humidity, previous day", "Daily minimum relative humidity from the weather archive.", "%"),
    "precip_3d": FeatureInfo("Rainfall, previous 3 days", "Total rainfall over the 3 days before the observation.", "mm", decimals=1),
    "precip_7d": FeatureInfo("Rainfall, previous 7 days", "Total rainfall over the 7 days before the observation.", "mm", decimals=1),
    "days_since_rain": FeatureInfo("Days since meaningful rain", "Days since at least 1 mm of rain fell.", count_noun="day"),
    "wind_speed_10m_max": FeatureInfo("Strongest wind, previous day", "Daily maximum wind speed at 10 m from the weather archive.", "km/h"),
    "et0_fao_evapotranspiration": FeatureInfo("Estimated atmospheric drying demand", "How much water the air could draw from soil and plants that day.",
                                              "mm", decimals=1),
    "weather_missing": FeatureInfo("Weather record missing", "Whether some weather inputs were unavailable and filled with typical training values.",
                                   comparable=False, kind="boolean"),
    "log_pa_dist_km": FeatureInfo("Distance to nearest protected area", "Distance to the nearest protected area in TerraGuard's list (approximate boundary).",
                                  "km", to_display=_expm1, decimals=1),
}


def key_for(feature: str) -> str:
    return SEASON_KEY if feature in SEASON_PARTS else feature


def info(feature: str) -> FeatureInfo:
    return CATALOG[key_for(feature)]


def display_value(feature: str, model_value: float) -> Optional[float]:
    """Model-space value -> displayed value in the catalogue unit (None for season)."""
    fi = info(feature)
    if fi.kind == "season" or model_value is None or (isinstance(model_value, float) and math.isnan(model_value)):
        return None
    return fi.to_display(float(model_value))


def format_value(feature: str, model_value: float) -> str:
    fi = info(feature)
    if fi.kind == "season":
        return "time of year"
    if fi.kind == "boolean":
        return "yes" if model_value >= 0.5 else "no"
    v = display_value(feature, model_value)
    if v is None:
        return "not available"
    if fi.count_noun:
        n = int(round(v))
        return f"{n} {fi.count_noun}{'' if n == 1 else 's'}"
    txt = f"{v:,.{fi.decimals}f}"
    if fi.unit == "%":
        return f"{txt}%"
    return f"{txt} {fi.unit}".strip()
