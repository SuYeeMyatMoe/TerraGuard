"""Grounding and safety validation applied to every LLM output, whichever provider produced it."""
from __future__ import annotations

import re
from typing import Literal, Optional

from pydantic import BaseModel, Field

from ..evidence import facts_by_id


class Section(BaseModel):
    text: str = Field(..., min_length=10, max_length=900)
    evidence_ids: list[str] = Field(..., min_length=1)


class NextStep(Section):
    recommendation: Literal["INSPECT", "RECHECK", "MONITOR"]


class IncidentBriefing(BaseModel):
    summary: Section
    why_matters: Section
    prediction_interpretation: Section
    recommended_next_step: NextStep
    uncertainty: Section


class FieldBrief(BaseModel):
    reference: str = Field(..., max_length=120)
    location_and_time: str = Field(..., max_length=400)
    reason_for_verification: str = Field(..., max_length=700)
    available_evidence: list[str] = Field(..., min_length=1, max_length=8)
    verification_task: str = Field(..., max_length=700)
    missing_information: list[str] = Field(..., max_length=8)
    safety_note: str = Field(..., max_length=500)
    evidence_ids: list[str] = Field(..., min_length=1)


BANNED = [
    (r"\billegal", "accusation of illegal activity"),
    (r"\barson", "accusation of arson"),
    (r"slash[- ]and[- ]burn", "slash-and-burn attribution"),
    (r"\b(culprit|perpetrator|offender)s?\b", "attribution of blame"),
    (r"\bdeliberately\s+(set|lit|started)", "claim of deliberate ignition"),
    (r"\bwill\s+(spread|escalate|grow|reach)\b", "deterministic spread claim"),
    (r"\b(arrest|prosecut|penalt|fine the|enforcement action)", "enforcement order"),
    (r"\b(dispatch|deploy|send)\s+(the\s+)?(police|military|army|firefighters|water bomb)", "unapproved dispatch order"),
    (r"\bevacuat", "evacuation order"),
    (r"\bconfirmed\s+(fire|burning|wildfire)", "claims ground confirmation"),
]
NEGATED_FORECAST = re.compile(r"\bnot\s+(a\s+)?(validated\s+)?(real[- ]world\s+)?(wildfire\s+)?(forecast|prediction of spread)", re.I)
FORECAST = re.compile(r"\b(wildfire|fire)\s+forecast|\bforecasts?\s+(that|the fire)", re.I)
NUM = re.compile(r"(?<![A-Za-z])-?\d+(?:[.,]\d+)?")


def _allowed_numbers(pkg: dict) -> set[float]:
    allowed: set[float] = {0, 1, 2, 3, 4, 5, 7, 10, 24, 48, 100}
    for f in pkg["facts"]:
        for tok in NUM.findall(f"{f['value']}"):
            try:
                v = float(tok.replace(",", ""))
            except ValueError:
                continue
            allowed.add(abs(v))
            allowed.update({abs(round(v)), abs(round(v, 1)), abs(round(v, 2))})
            if 0 < abs(v) <= 1:
                allowed.update({round(abs(v) * 100), round(abs(v) * 100, 1)})
    return allowed


def check_text(texts: list[str], pkg: dict) -> list[str]:
    problems = []
    allowed = _allowed_numbers(pkg)
    for t in texts:
        low = NEGATED_FORECAST.sub("", t)
        for pat, why in BANNED:
            if re.search(pat, low, re.I):
                problems.append(f"Unsupported claim ({why}): '{re.search(pat, low, re.I).group(0)}'")
        if FORECAST.search(low):
            problems.append("Presents the simulation or model as a wildfire forecast")
        for tok in NUM.findall(t):
            try:
                v = abs(float(tok.replace(",", "")))
            except ValueError:
                continue
            if v not in allowed and round(v, 1) not in allowed and round(v) not in allowed:
                problems.append(f"Number not found in evidence: {tok}")
    return problems


def validate_briefing(obj: dict, pkg: dict, expected_rec: str) -> tuple[Optional[IncidentBriefing], list[str]]:
    try:
        b = IncidentBriefing.model_validate(obj)
    except Exception as e:
        return None, [f"Schema validation failed: {str(e)[:300]}"]
    ids = facts_by_id(pkg)
    problems = []
    sections = [b.summary, b.why_matters, b.prediction_interpretation, b.recommended_next_step, b.uncertainty]
    for s in sections:
        bad = [i for i in s.evidence_ids if i not in ids]
        if bad:
            problems.append(f"Unknown evidence ids: {bad}")
    if b.recommended_next_step.recommendation != expected_rec:
        problems.append(f"Recommendation changed from {expected_rec} to {b.recommended_next_step.recommendation}")
    problems += check_text([s.text for s in sections], pkg)
    return (b if not problems else None), problems


def validate_field_brief(obj: dict, pkg: dict) -> tuple[Optional[FieldBrief], list[str]]:
    try:
        fb = FieldBrief.model_validate(obj)
    except Exception as e:
        return None, [f"Schema validation failed: {str(e)[:300]}"]
    ids = facts_by_id(pkg)
    problems = []
    bad = [i for i in fb.evidence_ids if i not in ids]
    if bad:
        problems.append(f"Unknown evidence ids: {bad}")
    texts = [fb.reference, fb.location_and_time, fb.reason_for_verification, fb.verification_task, fb.safety_note,
             *fb.available_evidence, *fb.missing_information]
    problems += check_text(texts, pkg)
    return (fb if not problems else None), problems
