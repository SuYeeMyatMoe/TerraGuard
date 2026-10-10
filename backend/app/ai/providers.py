"""LLM provider clients (backend-only keys). OpenAI: Responses API + strict JSON schema.
Grafilab: OpenAI-compatible chat completions at https://llm.grafilab.ai/v1 (schema enforced by validation)."""
from __future__ import annotations

import json
import os
import re
import time

from openai import OpenAI

GRAFILAB_BASE_URL = "https://llm.grafilab.ai/v1"
TIMEOUT_S = 25.0


class ProviderError(Exception):
    pass


def _strict(schema: dict) -> dict:
    """Make a JSON schema OpenAI-strict: all properties required, no additional properties."""
    if schema.get("type") == "object":
        schema["additionalProperties"] = False
        schema["required"] = list(schema.get("properties", {}).keys())
        for v in schema["properties"].values():
            _strict(v)
    elif schema.get("type") == "array":
        _strict(schema["items"])
    return schema


SECTION = {"type": "object", "properties": {"text": {"type": "string"},
                                           "evidence_ids": {"type": "array", "items": {"type": "string"}}}}
BRIEFING_SCHEMA = _strict({
    "type": "object",
    "properties": {
        "summary": json.loads(json.dumps(SECTION)),
        "why_matters": json.loads(json.dumps(SECTION)),
        "prediction_interpretation": json.loads(json.dumps(SECTION)),
        "recommended_next_step": {"type": "object", "properties": {
            "text": {"type": "string"}, "evidence_ids": {"type": "array", "items": {"type": "string"}},
            "recommendation": {"type": "string", "enum": ["INSPECT", "RECHECK", "MONITOR"]}}},
        "uncertainty": json.loads(json.dumps(SECTION)),
    },
})
FIELD_BRIEF_SCHEMA = _strict({
    "type": "object",
    "properties": {
        "reference": {"type": "string"},
        "location_and_time": {"type": "string"},
        "reason_for_verification": {"type": "string"},
        "available_evidence": {"type": "array", "items": {"type": "string"}},
        "verification_task": {"type": "string"},
        "missing_information": {"type": "array", "items": {"type": "string"}},
        "safety_note": {"type": "string"},
        "evidence_ids": {"type": "array", "items": {"type": "string"}},
    },
})


def openai_ready() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


def grafilab_ready() -> bool:
    return bool(os.getenv("GRAFILAB_API_KEY", "").strip())


def openai_model() -> str:
    return os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip()


def call_openai(system: str, user: str, schema: dict, name: str) -> tuple[dict, str]:
    if not openai_ready():
        raise ProviderError("OPENAI_API_KEY not configured")
    client = OpenAI(timeout=TIMEOUT_S, max_retries=1)
    model = openai_model()
    try:
        resp = client.responses.create(
            model=model,
            input=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            text={"format": {"type": "json_schema", "name": name, "schema": schema, "strict": True}},
            max_output_tokens=1400,
        )
        return json.loads(resp.output_text), model
    except Exception as e:  # network, auth, schema, timeout
        raise ProviderError(f"OpenAI error: {type(e).__name__}: {str(e)[:200]}") from e


_grafilab_model_cache: dict[str, tuple[float, str]] = {}


def grafilab_model(client: OpenAI) -> str:
    preferred = os.getenv("GRAFILAB_MODEL", "").strip()
    cached = _grafilab_model_cache.get("m")
    if cached and time.time() - cached[0] < 3600:
        return cached[1]
    try:
        ids = [m.id for m in client.models.list().data]
    except Exception as e:
        if preferred:
            return preferred
        raise ProviderError(f"Grafilab model list failed: {type(e).__name__}: {str(e)[:200]}") from e
    if not ids:
        raise ProviderError("Grafilab returned no models")
    if preferred and preferred in ids:
        chosen = preferred
    else:
        rank = lambda m: (0 if re.search(r"instruct|chat|qwen|llama|mistral|gemma|deepseek|gpt", m, re.I) else 1,
                          1 if re.search(r"embed|whisper|tts|vision|image|rerank|guard", m, re.I) else 0, m)
        chosen = sorted(ids, key=rank)[0]
    _grafilab_model_cache["m"] = (time.time(), chosen)
    return chosen


def _extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no JSON object in response")
    return json.loads(m.group(0))


def call_grafilab(system: str, user: str, schema: dict) -> tuple[dict, str]:
    if not grafilab_ready():
        raise ProviderError("GRAFILAB_API_KEY not configured")
    client = OpenAI(api_key=os.getenv("GRAFILAB_API_KEY"), base_url=GRAFILAB_BASE_URL, timeout=TIMEOUT_S, max_retries=1)
    model = grafilab_model(client)
    sys = system + "\n\nReturn ONLY a JSON object matching this JSON Schema, with no prose or code fences:\n" + json.dumps(schema)
    msgs = [{"role": "system", "content": sys}, {"role": "user", "content": user}]
    last = None
    for kwargs in ({"response_format": {"type": "json_object"}}, {}):
        try:
            resp = client.chat.completions.create(model=model, messages=msgs, temperature=0.2, max_tokens=1400, **kwargs)
            return _extract_json(resp.choices[0].message.content or ""), model
        except Exception as e:
            last = e
            continue
    raise ProviderError(f"Grafilab error: {type(last).__name__}: {str(last)[:200]}")
