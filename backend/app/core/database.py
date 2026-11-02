from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings

if settings.demo_mode and settings.database_url in {"sqlite://", "sqlite:///:memory:"}:
    # Volatile, single-process demo backend. Shared Postgres URLs use normal pooling.
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    persistent_engine = None
else:
    persistent_engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
    engine = persistent_engine
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
