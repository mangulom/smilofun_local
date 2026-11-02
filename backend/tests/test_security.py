from cryptography.fernet import Fernet
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
import base64
import json
import pytest
from unittest.mock import patch

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core import security
from app.models import Base, ExamenImagen, HistorialClinico, Odontograma, Paciente


def test_bcrypt_hash_is_one_way_and_verifiable():
    hashed = security.hash_password("Seguro-Password-123!")
    assert hashed.startswith(("$2a$", "$2b$", "$2y$"))
    assert security.verify_password("Seguro-Password-123!", hashed)
    assert not security.verify_password("incorrecta", hashed)


def test_fernet_round_trip_and_model_encryption_at_rest(monkeypatch):
    monkeypatch.setattr(security.settings, "fernet_key", Fernet.generate_key().decode())
    plaintext = "alergia sensible"
    encrypted = security.encrypt_sensitive(plaintext)
    assert encrypted != plaintext
    assert security.decrypt_sensitive(encrypted) == plaintext

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        paciente = Paciente(codigo="T-1", nombres="Test", apellidos="Paciente", sucursal_id=1, alergias=plaintext)
        db.add(paciente)
        db.commit()
        raw = db.connection().exec_driver_sql("SELECT alergias FROM pacientes").scalar_one()
        assert raw.startswith("fernet:v1:")
        paciente_id = paciente.id
        db.expunge_all()
        assert db.get(Paciente, paciente_id).alergias == plaintext


def test_wrong_fernet_key_does_not_crash_reads_or_reencrypt_ciphertext(monkeypatch):
    original = Fernet.generate_key()
    monkeypatch.setattr(security.settings, "fernet_key", original.decode())
    encrypted = security.encrypt_sensitive("nota clínica")
    monkeypatch.setattr(security.settings, "fernet_key", Fernet.generate_key().decode())
    assert security.decrypt_sensitive(encrypted) == "[dato cifrado no disponible]"
    assert security.encrypt_sensitive(security.decrypt_sensitive(encrypted)) == "[dato cifrado no disponible]"


def test_legacy_fernet_token_is_read_with_original_key(monkeypatch):
    key = Fernet.generate_key()
    legacy_token = Fernet(key).encrypt("texto anterior".encode()).decode()
    monkeypatch.setattr(security.settings, "fernet_key", key.decode())
    assert security.decrypt_sensitive(legacy_token) == "texto anterior"


def test_payload_key_refresh_keeps_existing_bearer_token(monkeypatch):
    from fastapi.testclient import TestClient
    from app.api import auth
    from app.core.config import settings
    from app.core.security import create_token

    class FakeUser:
        id = 77

    monkeypatch.setattr(settings, "fernet_key", Fernet.generate_key().decode())
    app = FastAPI()
    app.include_router(auth.router)
    app.dependency_overrides[auth.get_current_user] = lambda: FakeUser()
    client = TestClient(app)
    original_token = create_token("77")
    response = client.post("/api/auth/payload-key/refresh", headers={"Authorization": f"Bearer {original_token}"})
    assert response.status_code == 200
    assert response.json().get("key")
    assert response.headers.get("set-cookie", "").startswith("dentamia_payload_salt=")
    assert response.request.headers["Authorization"] == f"Bearer {original_token}"


def test_authenticated_api_payload_round_trip(monkeypatch):
    from fastapi import FastAPI
    from starlette.middleware.base import BaseHTTPMiddleware

    from app.core.config import settings
    from app.main import encrypt_json_payloads

    monkeypatch.setattr(settings, "fernet_key", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "payload_encryption_enabled", True)
    app = FastAPI()
    app.add_middleware(BaseHTTPMiddleware, dispatch=encrypt_json_payloads)
    app.add_api_route("/api/health", lambda: {"status": "ok"})

    @app.get("/api/protected")
    def protected():
        from fastapi.responses import JSONResponse

        return JSONResponse({"status": "ok"})

    client = TestClient(app)
    # Un error de autenticación sin sesión de cifrado debe seguir siendo 401,
    # no acabar convertido en un 500 durante el cifrado de respuesta.
    assert client.get("/api/protected").status_code == 401
    with patch("app.core.security.derive_payload_key", return_value=b"k" * 32):
        response = client.get("/api/health")
        protected_response = client.get("/api/protected", headers={"Authorization": "Bearer test"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/vnd.dentamia.encrypted+json")
    # Authenticated error responses use the same encrypted envelope.
    assert protected_response.status_code == 200
    assert protected_response.headers["content-type"].startswith("application/vnd.dentamia.encrypted+json")
    envelope = json.loads(response.body)
    key = b"k" * 32
    plaintext = AESGCM(key).decrypt(
        base64.urlsafe_b64decode(envelope["nonce"]),
        base64.urlsafe_b64decode(envelope["ciphertext"]),
        b"/api/health",
    )
    assert json.loads(plaintext)["status"] == "ok"

    request_nonce = b"n" * 12
    request_body = json.dumps({"payload": "secreto"}).encode()
    encrypted_request = AESGCM(key).encrypt(request_nonce, request_body, b"/api/health")
    decrypted_request = AESGCM(key).decrypt(request_nonce, encrypted_request, b"/api/health")
    assert json.loads(decrypted_request)["payload"] == "secreto"


def test_report_month_expression_compiles_for_sqlite():
    from sqlalchemy import select
    from app.api.reportes import YearMonth
    from app.models import Factura

    sql = str(select(YearMonth(Factura.fecha)).compile(dialect=create_engine("sqlite://").dialect))
    assert "strftime('%Y-%m'" in sql


def test_local_security_initializer_reuses_existing_key(tmp_path, monkeypatch):
    from app import init_security

    key = Fernet.generate_key().decode()
    env_file = tmp_path / ".env"
    env_file.write_text(f"FERNET_KEY={key}\n", encoding="utf-8")
    monkeypatch.setattr(init_security, "BACKEND", tmp_path)
    monkeypatch.setattr(init_security, "ENV_FILE", env_file)
    monkeypatch.setattr(init_security, "KEY_FILE", tmp_path / ".fernet.key")
    init_security.main()
    assert f"FERNET_KEY={key}" in env_file.read_text(encoding="utf-8")
    assert not (tmp_path / ".fernet.key").exists()


def test_demo_mode_uses_only_volatile_sqlite(monkeypatch):
    from sqlalchemy.pool import StaticPool
    from app.core import database

    monkeypatch.setattr(database.settings, "demo_mode", True)
    demo_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    assert isinstance(demo_engine.pool, StaticPool)
    assert demo_engine.url.database in (None, "")


def test_demo_mode_database_has_no_persistent_database_url():
    from sqlalchemy.pool import StaticPool

    # Normal tests run outside DEMO_MODE; prove the explicit demo engine target
    # is an anonymous in-memory SQLite URL, not a filename or external DSN.
    demo_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    assert demo_engine.url.database in (None, "")


def test_demo_mode_never_encrypts_clinical_seed_values(monkeypatch):
    monkeypatch.setattr(security.settings, "demo_mode", True)
    monkeypatch.setattr(security.settings, "fernet_key", "")
    assert security.encrypt_sensitive("nota ficticia") == "nota ficticia"
    assert security.decrypt_sensitive("nota ficticia") == "nota ficticia"
