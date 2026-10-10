# Generative AI: grounding and safety

**Roles**
- **OpenAI** writes the *AI Incident Briefing*: summary, why it matters, prediction interpretation, next step, uncertainty. It uses the Responses API with a strict JSON schema (`OPENAI_MODEL`, default `gpt-4.1-mini`).
- **Grafilab** writes the *Field Brief* in English. It calls the OpenAI-compatible API at `https://llm.grafilab.ai/v1`, and the model is chosen from `GET /models` (or `GRAFILAB_MODEL`). JSON mode is used when supported, and the schema is enforced by validation.

**Inputs.** Only the evidence package built in `app/evidence.py` is sent: facts with stable `evidence_id`s drawn from FIRMS, Open-Meteo, the model, the rules and (optionally) the simulation comparison. Keys stay on the backend.

**Validation** (`app/ai/validate.py`), identical for both providers:
1. Pydantic schema validation.
2. Every cited `evidence_id` must exist.
3. Every number in the text must appear in the evidence (rounding and % conversions allowed).
4. The recommendation must equal the deterministic one.
5. A banned-claim filter blocks:
   - illegal activity, arson, slash-and-burn or blame;
   - "will spread" claims and wildfire-forecast claims (an explicit "not a forecast" is allowed);
   - enforcement, dispatch or evacuation orders;
   - claimed ground confirmation.

**Failure handling.** One regeneration with the validator's feedback, then a labelled deterministic template. If OpenAI is unavailable, Grafilab may produce the incident briefing, and the UI says so ("Grafilab used because OpenAI was unavailable"). Providers are never switched silently. Every response carries `provider`, `model`, `status` (`generated` or `fallback_deterministic`) and the attempt log. A per-incident rate limit (10/min) applies, and timeouts are 25 s.

**What LLMs can never do.** Produce or alter probabilities, priority scores, rankings or simulation results, or trigger actions. A human approves every decision, and the field brief is labelled a draft for review.

Tests: `backend/tests/test_validate.py` covers fabricated numbers, a changed recommendation, accusations, forecast claims, unknown ids, and confirms that the deterministic fallbacks validate.
