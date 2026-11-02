from contextlib import asynccontextmanager
import base64
import json
import os
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from fastapi import FastAPI, Request
from fastapi.responses import Response, JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    auth,
    campanas,
    citas,
    compras,
    configuracion,
    dashboard,
    diseno3d,
    doctores,
    examenes,
    facturacion,
    ia,
    inventario,
    pacientes,
    proveedores,
    reportes,
    respaldos,
    tratamientos,
)
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 1) Crea tablas nuevas (empresas, usuario_empresas).
    Base.metadata.create_all(bind=engine)

    if settings.demo_mode:
        from app.models import Empresa, Usuario, UsuarioEmpresa
        from app.services.seed import seed_if_empty

        db = SessionLocal()
        try:
            if settings.reset_demo_on_start:
                db.close()
                Base.metadata.drop_all(bind=engine)
                Base.metadata.create_all(bind=engine)
                db = SessionLocal()
            if db.query(Usuario).count() == 0:
                seed_if_empty(db)
            empresas = db.query(Empresa).order_by(Empresa.id).all()
            for usuario in db.query(Usuario).all():
                if db.query(UsuarioEmpresa).filter_by(usuario_id=usuario.id).first():
                    continue
                asignadas = empresas if "admin" in usuario.email else empresas[:1]
                for empresa in asignadas:
                    db.add(UsuarioEmpresa(usuario_id=usuario.id, empresa_id=empresa.id, principal=empresa.id == asignadas[0].id))
            db.commit()
        finally:
            db.close()
        yield
        return

    # 2) Migración ligera: agrega empresa_id, siembra empresas y backfilla.
    try:
        from sqlalchemy import text
        from sqlalchemy import inspect

        from app.models import Campana, Empresa, Usuario, UsuarioEmpresa

        tablas = [
            "pacientes",
            "citas",
            "doctores",
            "facturas",
            "productos",
            "proveedores",
            "compras_insumo",
            "examenes_imagen",
            "tratamientos",
            "planes_tratamiento",
        ]

        # a) Semilla de empresas ANTES de cualquier backfill (idempotente)
        db = SessionLocal()
        try:
            semilla = [
                ("SmiloFun Dental Centro", "20512345678", "(051) 938977259"),
                ("SmiloFun Dental Norte", "20545678901", "(051) 938977260"),
                ("SmiloFun Dental Sur", "20598765432", "(051) 938977261"),
            ]
            for nombre, ruc, tel in semilla:
                if db.query(Empresa).filter_by(nombre=nombre).first() is None:
                    db.add(Empresa(nombre=nombre, ruc=ruc, telefono=tel))
            db.commit()

            principal = db.query(Empresa).order_by(Empresa.id).first()
            empresas = db.query(Empresa).order_by(Empresa.id).all()
        finally:
            db.close()

        # b) Columnas empresa_id: una transacción por tabla para no anular el resto
        # Sucursales quedan vinculadas a empresas; null significa sede compartida.
        columnas_sucursales = {c["name"] for c in inspect(engine).get_columns("sucursales")}
        if "empresa_id" not in columnas_sucursales:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE sucursales ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)"))

        for tabla in tablas:
            columnas = {c["name"] for c in inspect(engine).get_columns(tabla)}
            if "empresa_id" not in columnas:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {tabla} ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)"))
            with engine.begin() as conn:
                conn.execute(text(f"UPDATE {tabla} SET empresa_id = :e WHERE empresa_id IS NULL"), {"e": principal.id})

        # Metadata para diferenciar volúmenes clínicos por su formato original.
        columnas_pacientes = {c["name"] for c in inspect(engine).get_columns("pacientes")}
        for columna in ("consentimiento_marketing_email", "baja_marketing_email", "consentimiento_marketing_whatsapp", "baja_marketing_whatsapp"):
            if columna not in columnas_pacientes:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE pacientes ADD COLUMN {columna} BOOLEAN NOT NULL DEFAULT FALSE"))
                columnas_pacientes.add(columna)

        # create_all crea tablas nuevas de forma idempotente en instalaciones existentes.
        Base.metadata.create_all(bind=engine, tables=[Campana.__table__])

        columnas_examenes = {c["name"] for c in inspect(engine).get_columns("examenes_imagen")}
        if "dimensiones" not in columnas_examenes:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE examenes_imagen ADD COLUMN dimensiones JSON NULL"))
        if "formato_volumen" not in columnas_examenes:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE examenes_imagen ADD COLUMN formato_volumen VARCHAR(20) NULL"))
        if "instancias_dicom" not in columnas_examenes:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE examenes_imagen ADD COLUMN instancias_dicom JSON NULL"))

        # c) Vínculos usuario ↔ empresas (multiempresa; admin en todas)
        # Load demo identities only when the user table is empty. Existing databases are untouched.
        db_seed = SessionLocal()
        try:
            if db_seed.query(Usuario).count() == 0:
                from app.services.seed import seed_if_empty
                seed_if_empty(db_seed)
        finally:
            db_seed.close()

        db = SessionLocal()
        try:
            for usuario in db.query(Usuario).all():
                if db.query(UsuarioEmpresa).filter_by(usuario_id=usuario.id).first():
                    continue
                enlaces = empresas if "admin" in usuario.email else empresas[:1]
                for emp in enlaces:
                    db.add(
                        UsuarioEmpresa(
                            usuario_id=usuario.id,
                            empresa_id=emp.id,
                            principal=emp.id == enlaces[0].id,
                        )
                    )
            db.commit()
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 — la migración no debe bloquear el arranque
        print(f"[Multiempresa] Migración pospuesta: {exc}")

    # 3) Entrena la IA con el histórico disponible.
    try:
        from app.services import ia as ia_service

        db = SessionLocal()
        try:
            ia_service.entrenar(db)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 — el entrenamiento no debe bloquear el arranque
        print(f"[IA] Entrenamiento pospuesto: {exc}")
    yield


if settings.demo_mode and settings.environment.lower() == "production":
    raise RuntimeError("DEMO_MODE está prohibido en production")

app = FastAPI(
    title="SmiloFun API",
    description="API de gestión de centros odontológicos con IA predictiva.",
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs" if settings.environment.lower() != "production" else None,
    redoc_url="/redoc" if settings.environment.lower() != "production" else None,
    openapi_url="/openapi.json" if settings.environment.lower() != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*", "x-dentamia-binary-response"],
    expose_headers=["Content-Type"],
)


class EncryptLoginResponseASGI:
    """Encrypt only a successful login response after FastAPI has validated it."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("path") != "/api/auth/login" or scope.get("method") != "POST":
            return await self.app(scope, receive, send)

        status = 0
        headers = []
        body_chunks = []

        async def capture(message):
            nonlocal status, headers
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = list(message.get("headers", []))
            elif message["type"] == "http.response.body":
                body_chunks.append(message.get("body", b""))

        await self.app(scope, receive, capture)
        raw = b"".join(body_chunks)
        content_type = next((v.decode("latin1").split(";", 1)[0].lower() for k, v in headers if k.lower() == b"content-type"), "")
        if status != 200 or content_type != "application/json" or not raw:
            await send({"type": "http.response.start", "status": status, "headers": headers})
            await send({"type": "http.response.body", "body": raw, "more_body": False})
            return

        challenge = os.urandom(32)
        nonce = os.urandom(12)
        key = hashlib.sha256(b"dentamia-login-v1:" + challenge).digest()
        ciphertext = AESGCM(key).encrypt(nonce, raw, b"/api/auth/login")
        envelope = json.dumps({
            "challenge": base64.urlsafe_b64encode(challenge).decode(),
            "nonce": base64.urlsafe_b64encode(nonce).decode(),
            "ciphertext": base64.urlsafe_b64encode(ciphertext).decode(),
        }).encode()
        headers = [(k, v) for k, v in headers if k.lower() not in {b"content-length", b"content-encoding", b"content-type"}]
        headers.extend([(b"content-type", _LOGIN_ENVELOPE.encode()), (b"content-length", str(len(envelope)).encode()), (b"cache-control", b"no-store")])
        await send({"type": "http.response.start", "status": status, "headers": headers})
        await send({"type": "http.response.body", "body": envelope, "more_body": False})


app.add_middleware(EncryptLoginResponseASGI)



@app.middleware("http")
async def clinical_key_error_handler(request: Request, call_next):
    try:
        return await call_next(request)
    except RuntimeError as exc:
        message = str(exc)
        if "FERNET_KEY" in message or "descifrar" in message or "clave Fernet original" in message:
            return JSONResponse(
                {"detail": "La clave Fernet no permite leer un registro clínico; revisa la clave original."},
                status_code=503,
                headers={"Cache-Control": "no-store"},
            )
        raise


@app.middleware("http")
async def install_aes_session_cookie(request: Request, call_next):
    response = await call_next(request)
    if request.url.path == "/api/auth/login" and request.method == "POST" and settings.fernet_key:
        # Preserve the existing login/JWT response while ensuring the HttpOnly
        # salt is present even if an older auth route implementation omits it.
        if not request.cookies.get("dentamia_payload_salt") and "dentamia_payload_salt" not in response.headers.get("set-cookie", ""):
            response.set_cookie(
                "dentamia_payload_salt",
                base64.urlsafe_b64encode(os.urandom(16)).decode("ascii"),
                httponly=True,
                secure=settings.environment.lower() == "production",
                samesite="strict",
                path="/api",
            )
    return response


# Authenticated payload encryption for JSON API bodies (AES-GCM); requires a persistent FERNET_KEY.
_PAYLOAD_ENVELOPE = "application/vnd.dentamia.encrypted+json"
_LOGIN_ENVELOPE = "application/vnd.dentamia.encrypted+json"


def _login_session_key(request: Request) -> bytes:
    """Create a per-login AES key from a browser-provided, one-time challenge."""
    challenge = request.headers.get("x-dentamia-login-challenge", "")
    try:
        padded = challenge + "=" * (-len(challenge) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("ascii"))
    except (ValueError, UnicodeEncodeError):
        raw = b""
    if len(raw) != 32:
        raise ValueError("Missing or invalid login encryption challenge")
    return hashlib.sha256(b"dentamia-login-v1:" + raw).digest()


def _decode_b64(value: str) -> bytes:
    normalized = value.replace("-", "+").replace("_", "/")
    normalized += "=" * (-len(normalized) % 4)
    return base64.b64decode(normalized)


def _normalize_json_response(response: Response) -> Response:
    headers = dict(response.headers)
    for name in ("content-length", "content-encoding", "transfer-encoding", "content-type"):
        headers.pop(name, None)
    body = getattr(response, "body", b"")
    for name in ("set-cookie", "access-control-allow-origin", "access-control-allow-credentials"):
        if name in response.headers:
            headers[name] = response.headers[name]
    return Response(body, status_code=response.status_code, headers=headers, media_type="application/json")


async def _normalize_buffered_response(response):
    content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type != "application/json" or response.status_code in {204, 304} or response.status_code >= 400:
        return response
    if response.headers.get("content-length") == "0":
        return response
    body = b"".join([chunk async for chunk in response.body_iterator])
    if not body:
        return Response(status_code=response.status_code, headers=dict(response.headers))
    headers = dict(response.headers)
    for name in ("content-length", "content-encoding", "transfer-encoding"):
        headers.pop(name, None)
    return Response(body, status_code=response.status_code, headers=headers, media_type="application/json")


@app.middleware("http")
async def encrypt_json_payloads(request: Request, call_next):
    if not settings.payload_encryption_enabled or not request.url.path.startswith("/api/"):
        return await call_next(request)

    if request.method == "OPTIONS":
        return await call_next(request)
    binary_response = request.headers.get("x-dentamia-binary-response") == "1"
    login_bootstrap = request.url.path == "/api/auth/login" and request.method == "POST"

    # Login responses are wrapped by EncryptLoginResponseASGI after FastAPI has
    # validated the plain JSON credentials. Only payload-key endpoints bootstrap.
    bootstrap = request.url.path == "/api/auth/payload-key"
    bootstrap = bootstrap or (
        request.url.path == "/api/auth/payload-key/refresh" and request.method == "POST"
    )
    rotate_payload_key = request.url.path == "/api/auth/payload-key/refresh" and request.method == "POST"

    # Without a key, preserve existing API behavior. The ORM still requires the
    # persistent key when encrypted-at-rest fields are read or written.
    if not settings.fernet_key:
        response = await call_next(request)
        if response.headers.get("content-type", "").startswith("application/json"):
            return await _normalize_buffered_response(response)
        return response
    if binary_response:
        return await call_next(request)

    # Routes that do not authenticate also cannot have a per-user session key.
    # Let FastAPI produce its normal public/401 response instead of returning
    # a JSON body that the browser is expected to decrypt.
    if not bootstrap and not request.headers.get("authorization", "").lower().startswith("bearer "):
        response = await call_next(request)
        if response.headers.get("content-type", "").startswith("application/json"):
            return await _normalize_buffered_response(response)
        return response
    if not bootstrap and not (
        request.url.path == "/api/auth/payload-key/refresh" and request.method == "POST"
    ) and request.method in {"POST", "PUT", "PATCH"}:
        content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
        if content_type not in {_PAYLOAD_ENVELOPE, "multipart/form-data", "application/octet-stream"}:
            return _normalize_json_response(JSONResponse({"detail": "Encrypted payload required"}, status_code=400))

    from app.core.security import derive_payload_key
    import jwt

    key = None
    if not bootstrap or rotate_payload_key:
        credentials = request.headers.get("authorization", "")
        if not credentials.lower().startswith("bearer "):
            return await call_next(request)
        try:
            claims = jwt.decode(credentials[7:], settings.secret_key, algorithms=[settings.algorithm])
            user_id = int(claims["sub"])
            salt_cookie = request.cookies.get("dentamia_payload_salt")
            if not salt_cookie:
                return JSONResponse({"detail": "Encryption session missing; log in again"}, status_code=401)
            salt = base64.urlsafe_b64decode(salt_cookie.encode("ascii"))
            if len(salt) != 16:
                raise ValueError("bad salt")
            key = derive_payload_key(user_id, salt)
        except Exception:
            return JSONResponse({"detail": "Encryption session invalid; log in again"}, status_code=401)

    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if not bootstrap and not login_bootstrap and content_type == _PAYLOAD_ENVELOPE:
        try:
            envelope = json.loads(await request.body())
            nonce = _decode_b64(envelope["nonce"])
            ciphertext = _decode_b64(envelope["ciphertext"])
            plaintext = AESGCM(key).decrypt(nonce, ciphertext, request.url.path.encode())
            async def receive():
                return {"type": "http.request", "body": plaintext, "more_body": False}
            request._receive = receive
            request._body = plaintext
            request.scope["headers"] = [(k, v) for k, v in request.scope["headers"] if k.lower() not in {b"content-type", b"content-length"}] + [(b"content-type", b"application/json"), (b"content-length", str(len(plaintext)).encode())]
        except Exception:
            return JSONResponse({"detail": "Encrypted request could not be authenticated"}, status_code=400)
    elif not bootstrap and not login_bootstrap and request.method in {"POST", "PUT", "PATCH"} and content_type not in {
        "multipart/form-data",
        "application/octet-stream",
    }:
        body = await request.body()
        if body:
            return JSONResponse({"detail": "Encrypted payload required"}, status_code=400)
    response = await call_next(request)
    if binary_response:
        return response
    response_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
    if rotate_payload_key:
        return response
    if response_type != "application/json" or bootstrap and not login_bootstrap:
        return response
    # Encrypt error JSON as well as success responses. Otherwise browsers that
    # received the encrypted request cannot parse FastAPI's plaintext error body.
    if response.status_code in {204, 304} or response.headers.get("content-length") == "0":
        return response
    chunks = [chunk async for chunk in response.body_iterator]
    raw_response = b"".join(chunks)
    if not raw_response:
        return Response(status_code=response.status_code, headers=dict(response.headers))
    if response.status_code >= 400:
        headers = dict(response.headers)
        for name in ("content-length", "content-encoding", "transfer-encoding"):
            headers.pop(name, None)
        return Response(raw_response, status_code=response.status_code, headers=headers, media_type="application/json")
    if not key:
        headers = dict(response.headers)
        for name in ("content-length", "content-encoding", "transfer-encoding", "content-type"):
            headers.pop(name, None)
        return Response(raw_response, status_code=response.status_code, headers=headers, media_type="application/json")
    nonce = os.urandom(12)
    ciphertext = AESGCM(key).encrypt(nonce, raw_response, request.url.path.encode())
    body = json.dumps({"nonce": base64.urlsafe_b64encode(nonce).decode(), "ciphertext": base64.urlsafe_b64encode(ciphertext).decode()}).encode()
    headers = dict(response.headers)
    for name in ("content-length", "content-encoding", "transfer-encoding", "content-type"):
        headers.pop(name, None)
    headers["cache-control"] = "no-store"
    return Response(body, status_code=response.status_code, headers=headers, media_type=_PAYLOAD_ENVELOPE)

for router in (
    auth.router,
    campanas.router,
    campanas.settings_router,
    pacientes.router,
    examenes.router,
    doctores.router,
    citas.router,
    tratamientos.router,
    facturacion.router,
    inventario.router,
    proveedores.router,
    compras.router,
    dashboard.router,
    reportes.router,
    ia.router,
    configuracion.router,
    diseno3d.router,
    respaldos.router,
):
    app.include_router(router)

# Archivos estáticos: radiografías, fotos clínicas y escaneos subidos
# No exponer directorios de uploads como rutas est?ticas; todo archivo sensible pasa por auth.


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Cache-Control", "no-store" if request.url.path.startswith("/api") else "no-cache")
    if request.url.path.startswith("/api"):
        response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    return response


@app.get("/api/health", tags=["Salud"])
def health():
    return {"status": "ok", "app": settings.app_name, "version": settings.app_version, "demo_mode": settings.demo_mode, "persistence": "memory" if settings.demo_mode else "database"}
