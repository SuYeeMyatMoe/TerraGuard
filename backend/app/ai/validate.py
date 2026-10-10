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
    incident_summary: Section
    why_prediction: Section
    why_priority: Section
    comparison_with_next_incident: Section
    uncertainties: Section
    what_would_improve_confidence: Section
    recommended_next_step: NextStep


BRIEFING_SECTIONS = ["incident_summary", "why_prediction", "why_priority", "comparison_with_next_incident",
                     "uncertainties", "what_would_improve_confidence", "recommended_next_step"]


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
    (r"\blikely\s+range\b", "presents model-tree variation as a likely range"),
    (r"\b(caused|started|ignited)\s+by\b", "unsupported fire-causation claim"),
    (r"\bdue\s+to\s+(burning|land\s+clearing|clearing)", "unsupported fire-causation claim"),
]
NEGATED_CI = re.compile(r"\bnot\s+(a\s+)?(statistically\s+)?(validated\s+)?confidence\s+interval", re.I)
CI = re.compile(r"\bconfidence\s+interval", re.I)
INC_ID = re.compile(r"\bINC-\d{8}-[A-Z]\b")
RANK_CLAIM = re.compile(r"(Incident [A-Z]|INC-\d{8}-[A-Z])\s+(?:ranks?|is ranked|comes)\s+(above|ahead of|higher than|below|lower than)\s+"
                        r"(Incident [A-Z]|INC-\d{8}-[A-Z])", re.I)
URGENCY_LABELS = ["critical", "high", "moderate", "low"]
URGENCY_CTX = re.compile(r"\b(critical|high|moderate|low)\s+urgency\b|\burgency\s+(?:level\s+|tier\s+)?(?:is\s+|of\s+)?(critical|high|moderate|low)\b", re.I)
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
        if CI.search(NEGATED_CI.sub("", t)):
            problems.append("Describes model-tree variation or the estimate as a confidence interval")
        for tok in NUM.findall(t):
            try:
                v = abs(float(tok.replace(",", "")))
            except ValueError:
                continue
            if v not in allowed and round(v, 1) not in allowed and round(v) not in allowed:
                problems.append(f"Number not found in evidence: {tok}")
    return problems


def _letter(ref: str) -> str:
    return ref.strip()[-1].upper()


def check_structure_claims(texts: list[str], pkg: dict) -> list[str]:
    """Incident ids must exist; ranking claims must match the deterministic order; urgency must not be restated."""
    problems = []
    facts = facts_by_id(pkg)
    known = set(INC_ID.findall(" ".join(str(f["value"]) for f in pkg["facts"]))) | {pkg["incident_id"]}
    order = str(facts.get("RANK_ORDER", {}).get("value", ""))
    rank_of = {_letter(i): n for n, i in enumerate(x.strip() for x in order.split(">")) if i}
    urgency = str(facts.get("URGENCY", {}).get("value", "")).lower()
    for t in texts:
        for i in INC_ID.findall(t):
            if i not in known:
                problems.append(f"Mentions an incident that is not in the evidence: {i}")
        for a, rel, b in RANK_CLAIM.findall(t):
            ra, rb = rank_of.get(_letter(a)), rank_of.get(_letter(b))
            if ra is None or rb is None:
                continue
            claims_above = rel.lower() in ("above", "ahead of", "higher than")
            if claims_above != (ra < rb):
                problems.append(f"Ranking claim contradicts the deterministic order: '{a} {rel} {b}'")
        for m in URGENCY_CTX.finditer(t):
            lab = (m.group(1) or m.group(2) or "").lower()
            if urgency and lab != urgency:
                problems.append(f"Restates the urgency level as '{lab}' (deterministic level: {urgency})")
    return problems


def validate_briefing(obj: dict, pkg: dict, expected_rec: str) -> tuple[Optional[IncidentBriefing], list[str]]:
    try:
        b = IncidentBriefing.model_validate(obj)
    except Exception as e:
        return None, [f"Schema validation failed: {str(e)[:300]}"]
    ids = facts_by_id(pkg)
    problems = []
    sections = [getattr(b, k) for k in BRIEFING_SECTIONS]
    for s in sections:
        bad = [i for i in s.evidence_ids if i not in ids]
        if bad:
            problems.append(f"Unknown evidence ids: {bad}")
    if b.recommended_next_step.recommendation != expected_rec:
        problems.append(f"Recommendation changed from {expected_rec} to {b.recommended_next_step.recommendation}")
    problems += check_text([s.text for s in sections], pkg)
    problems += check_structure_claims([s.text for s in sections], pkg)
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
    problems += check_structure_claims(texts, pkg)
    return (fb if not problems else None), problems
