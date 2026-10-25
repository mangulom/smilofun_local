"""Crea todas las tablas y carga datos de prueba (si la BD está vacía)."""
from app.core.database import Base, SessionLocal, engine
from app import models  # noqa: F401  (registra los modelos)
from app.services.seed import seed_if_empty


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        created = seed_if_empty(db)
    finally:
        db.close()
    print("Tablas creadas correctamente.")
    print("Datos de prueba cargados." if created else "La base de datos ya contenía datos; seed omitido.")


if __name__ == "__main__":
    main()
