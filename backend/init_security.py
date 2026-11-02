"""Initialize secure local secrets without replacing an existing Fernet key."""
from __future__ import annotations

import os
from pathlib import Path

from cryptography.fernet import Fernet


BACKEND = Path(__file__).resolve().parent
ENV_FILE = BACKEND / ".env"
KEY_FILE = BACKEND / ".fernet.key"


def _read_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and "=" in stripped:
                name, value = stripped.split("=", 1)
                values[name.strip()] = value.strip().strip("\"'")
    return values


def main() -> None:
    values = _read_env()
    key = values.get("FERNET_KEY") or os.getenv("FERNET_KEY", "")
    source = "existing configuration"

    if not key and KEY_FILE.exists():
        key = KEY_FILE.read_text(encoding="ascii").strip()
        source = str(KEY_FILE)

    if key:
        try:
            Fernet(key.encode("ascii"))
        except (ValueError, UnicodeEncodeError) as exc:
            raise SystemExit("FERNET_KEY existente no es válida. Conservé todos tus archivos; no generé otra.") from exc
    else:
        # Local-first run: no .env or existing key is present. Persist the key
        # outside source code, ignored by Git, and reuse it on every restart.
        key = Fernet.generate_key().decode("ascii")
        KEY_FILE.write_text(key + "\n", encoding="ascii")
        try:
            os.chmod(KEY_FILE, 0o600)
        except OSError:
            pass
        source = str(KEY_FILE)

    values["FERNET_KEY"] = key
    values.setdefault("ENVIRONMENT", "development")
    values.setdefault("DATABASE_URL", "sqlite:///./dentamia.db")
    values.setdefault("PAYLOAD_ENCRYPTION_ENABLED", "true")
    lines = ["# Secretos locales; este archivo está excluido de Git."]
    lines.extend(f"{name}={value}" for name, value in values.items())
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    try:
        os.chmod(ENV_FILE, 0o600)
    except OSError:
        pass

    Fernet(key.encode("ascii"))
    print(f"Configuración local segura lista. Clave Fernet conservada en {source}; valor oculto.")


if __name__ == "__main__":
    main()
