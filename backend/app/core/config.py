from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SmiloFun"
    app_version: str = "1.0.0"
    database_url: str = "postgresql+psycopg2://postgres:3mlx440*@localhost:15432/dentamia"
    secret_key: str = "dentamia-dev-secret-cambiar-en-produccion-2026"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    # CORS abierto por solicitud del usuario. No usar credenciales CORS con '*'.
    cors_origins: list[str] = ["*"]
    # Carpeta de respaldos de la base de datos (por defecto: backend/backups).
    backup_dir: str | None = None
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
