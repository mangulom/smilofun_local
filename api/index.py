"""Vercel Python Function entrypoint for Dentamia FastAPI."""
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

from app.main import app  # noqa: E402

__all__ = ["app"]
