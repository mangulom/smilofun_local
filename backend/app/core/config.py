from pathlib import Path
import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SmiloFun"
    app_version: str = "1.0.0"
    environment: str = "development"
    database_url: str = "sqlite:///./dentamia.db"
    secret_key: str = ""
    fernet_key: str = ""
    fernet_key_source: str | None = None
    fernet_key_file: str | None = None
    payload_encryption_enabled: bool = True
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    cors_origins: list[str] = []
    # Carpeta de respaldos de la base de datos (por defecto: backend/backups).
    backup_dir: str | None = None
    # Campañas: secretos solo por variables de entorno/.env local (nunca en frontend).
    gmail_sender_email: str | None = None
    gmail_oauth_client_id: str | None = None
    gmail_oauth_client_secret: str | None = None
    gmail_oauth_refresh_token: str | None = None
    whatsapp_phone_number_id: str | None = None
    whatsapp_business_account_id: str | None = None
    whatsapp_access_token: str | None = None
    whatsapp_campaign_template: str | None = None
    whatsapp_template_language: str = "es"
    meta_page_id: str | None = None
    meta_access_token: str | None = None
    meta_graph_api_version: str = "v23.0"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_file_encoding="utf-8")


def _load_settings() -> Settings:
    """Load backend/.env regardless of the shell's current working directory."""
    env_file = Path(__file__).resolve().parents[2] / ".env"
    loaded = Settings(_env_file=env_file)
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("FERNET_KEY="):
                raw_key = line.split("=", 1)[1].strip().strip("\"'")
                if raw_key.upper().startswith(("REEMPLAZAR", "GENERAR_", "CHANGEME", "YOUR_", "<")):
                    loaded.fernet_key = ""
                break
    elif os.getenv("FERNET_KEY", "").strip().upper().startswith(("REEMPLAZAR", "GENERAR_", "CHANGEME", "YOUR_", "<")):
        loaded.fernet_key = ""
    if loaded.fernet_key.strip().upper().startswith(("REEMPLAZAR", "GENERAR_", "CHANGEME", "YOUR_", "<")):
        loaded.fernet_key = ""
    if not loaded.fernet_key and loaded.fernet_key_file:
        key_file = Path(loaded.fernet_key_file)
        if not key_file.is_absolute():
            key_file = env_file.parent / key_file
        if key_file.is_file():
            loaded.fernet_key = key_file.read_text(encoding="ascii").strip()
            loaded.fernet_key_source = str(key_file)
    if not loaded.fernet_key and not loaded.fernet_key_file and not env_file.exists():
        env_candidate = Path.cwd() / ".env"
        if env_candidate.resolve() != env_file.resolve() and env_candidate.is_file():
            legacy_settings = Settings(_env_file=env_candidate)
            if legacy_settings.fernet_key.strip().upper().startswith(("REEMPLAZAR", "GENERAR_", "CHANGEME", "YOUR_", "<")):
                legacy_settings.fernet_key = ""
            if legacy_settings.fernet_key:
                loaded = legacy_settings
                loaded.fernet_key_source = str(env_candidate)
    if not loaded.fernet_key and loaded.environment.lower() != "production":
        key_file = env_file.parent / ".fernet.key"
        if key_file.is_file():
            loaded.fernet_key = key_file.read_text(encoding="ascii").strip()
            loaded.fernet_key_source = str(key_file)
    return loaded


settings = _load_settings()
if not settings.secret_key:
    if settings.environment.lower() == "production":
        raise RuntimeError("SECRET_KEY es obligatoria en producci?n")
    settings.secret_key = "dentamia-local-development-only-change-me"
if settings.environment.lower() == "production" and len(settings.secret_key.encode("utf-8")) < 32:
    raise RuntimeError("SECRET_KEY de producci?n debe tener al menos 32 bytes")
if settings.environment.lower() == "production" and settings.database_url.startswith("sqlite"):
    raise RuntimeError("SQLite no est? permitido como base de datos de producci?n")
if settings.environment.lower() == "production" and not settings.fernet_key:
    raise RuntimeError("FERNET_KEY es obligatoria en producci?n")
if settings.fernet_key:
    from cryptography.fernet import Fernet

    try:
        Fernet(settings.fernet_key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise RuntimeError("FERNET_KEY no es una clave Fernet v?lida") from exc
