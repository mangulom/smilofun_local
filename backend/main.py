"""Vercel Python Function entrypoint for Dentamia FastAPI."""
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

from app.core.config import settings  # noqa: E402

if settings.demo_mode:
    os.environ.setdefault("DENTAMIA_DEMO_NO_FILE_ROUTERS", "true")

from app.main import app  # noqa: E402

__all__ = ["app"]
