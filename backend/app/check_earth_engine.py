"""Run from backend: .venv/bin/python -m app.check_earth_engine."""
from ml.config import BACKEND_DIR  # Loads only backend/.env.
from .earth_engine import SENTINEL, service


def main() -> int:
    client = service()
    if not client.project:
        print("Connection pending: set GEE_PROJECT in backend/.env to your registered Google Cloud Project ID.")
        return 2
    try:
        ee = client.provider.initialize()
        ee.ImageCollection(SENTINEL).limit(1).size().getInfo()
    except Exception:
        print("Connection failed. Check Earth Engine registration, API access, project roles and local authentication.")
        print("For local development, run .venv/bin/earthengine authenticate, then retry this command.")
        return 1
    print("Earth Engine connected; Sentinel-2 collection access verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
