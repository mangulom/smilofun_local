"""Run with `python -m app.services.migrar_encriptacion` after a backup and FERNET_KEY setup."""
from app.core.database import SessionLocal
from app.services.encriptar_datos import cifrar_datos_existentes

if __name__ == "__main__":
    db = SessionLocal()
    try:
        print(cifrar_datos_existentes(db))
    finally:
        db.close()
