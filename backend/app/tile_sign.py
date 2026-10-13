"""HMAC-signed Earth Engine tile handles that any instance can resolve."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
from urllib.parse import urlsplit

TILE_PATH = re.compile(r"/v1/projects/[A-Za-z0-9_-]+/maps/[A-Za-z0-9_-]+/tiles/\{z\}/\{x\}/\{y\}")


def signing_secret() -> bytes:
    return (os.getenv("GEE_TILE_SIGNING_SECRET") or os.getenv("GEE_PROJECT") or "terraguard-local").encode()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _mac(body: str) -> str:
    return hmac.new(signing_secret(), body.encode(), hashlib.sha256).hexdigest()[:32]


def pack(prefix: str, payload: dict) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    return f"{prefix}{body}.{_mac(body)}"


def unpack(handle: str, prefix: str) -> dict:
    if not handle.startswith(prefix):
        raise KeyError(handle)
    body, sep, sig = handle[len(prefix):].partition(".")
    if not sep or not hmac.compare_digest(sig, _mac(body)):
        raise KeyError(handle)
    try:
        payload = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError) as exc:
        raise KeyError(handle) from exc
    if not isinstance(payload, dict):
        raise KeyError(handle)
    return payload


def valid_map_url(url: str) -> bool:
    parsed = urlsplit(url)
    return (parsed.scheme == "https" and parsed.netloc == "earthengine.googleapis.com"
            and bool(TILE_PATH.fullmatch(parsed.path)) and not parsed.query and not parsed.fragment)


def sign_map_url(url: str, expiry: int, nonce: str) -> str:
    if not valid_map_url(url):
        raise ValueError("Invalid Earth Engine tile address")
    return pack("s.", {"u": url, "e": int(expiry), "n": nonce})


def decode_map_url(handle: str, now: float) -> str:
    payload = unpack(handle, "s.")
    url, exp = payload.get("u"), payload.get("e")
    if not isinstance(url, str) or not isinstance(exp, int) or now >= exp or not valid_map_url(url):
        raise KeyError(handle)
    return url


def sign_recipe(descriptor: dict) -> str:
    return pack("g.", descriptor)


def decode_recipe(handle: str) -> dict:
    payload = unpack(handle, "g.")
    if "recipe" not in payload or "layer" not in payload:
        raise KeyError(handle)
    return payload
