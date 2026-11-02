"""Vercel Python Function entrypoint for the Dentamia FastAPI application."""
from app.main import app

__all__ = ["app"]
