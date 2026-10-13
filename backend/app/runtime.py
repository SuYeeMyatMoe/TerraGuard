"""Process environment helpers shared by the API and data loaders."""
from __future__ import annotations

import os
from pathlib import Path


def on_vercel() -> bool:
    return os.getenv("VERCEL") == "1"


def ensure_dir(path: Path) -> None:
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
