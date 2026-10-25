from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SmiloFun"
    app_version: str = "1.0.0"
    database_url: str = "postgresql+psycopg2://postgres:3mlx440*@localhost:15432/dentamia"
    secret_key: str = "dentamia-dev-secret-cambiar-en-produccion-2026"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    cors_origins: list[str] = ["http://localhost:4200", "http://127.0.0.1:4200"]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
