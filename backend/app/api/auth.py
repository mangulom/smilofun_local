import base64
import os
from collections import defaultdict
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_token, hash_password, needs_password_rehash, verify_password
from app.core.config import settings
from app.models import Usuario, UsuarioEmpresa
from app.schemas import LoginRequest, TokenResponse, UsuarioOut

_LOGIN_ATTEMPTS: dict[str, list[float]] = defaultdict(list)
_LOGIN_LIMIT = 10
_LOGIN_WINDOW = 300
_DUMMY_PASSWORD_HASH = "$2b$12$2Wkbn6B/Vzj2CSND/4iJpeKFFw41wYpxL4n7NBbMWHS2n1OuG3FjK"
_PAYLOAD_SALT_COOKIE = "dentamia_payload_salt"

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])


def usuario_out(user: Usuario) -> UsuarioOut:
    """Usuario con las empresas que tiene asignadas (modo multiempresa)."""
    enlaces = sorted(user.empresas_link, key=lambda e: (not e.principal, e.empresa_id))
    empresas = [
        {
            "id": e.empresa_id,
            "nombre": e.empresa.nombre if e.empresa else f"Empresa {e.empresa_id}",
            "principal": bool(e.principal),
        }
        for e in enlaces
    ]
    return UsuarioOut(
        id=user.id,
        email=user.email,
        nombre=user.nombre,
        activo=user.activo,
        rol=user.rol,
        doctor_id=user.doctor_id,
        empresa_id=empresas[0]["id"] if empresas else None,
        empresas=empresas,
    )


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    ahora = monotonic()
    recientes = [t for t in _LOGIN_ATTEMPTS[ip] if ahora - t < _LOGIN_WINDOW]
    _LOGIN_ATTEMPTS[ip] = recientes
    if len(_LOGIN_ATTEMPTS) > 10000:
        for key in list(_LOGIN_ATTEMPTS)[:5000]:
            _LOGIN_ATTEMPTS.pop(key, None)
    if len(recientes) >= _LOGIN_LIMIT:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Demasiados intentos. Intenta nuevamente en unos minutos.")
    user = (
        db.execute(
            select(Usuario)
            .options(
                joinedload(Usuario.rol),
                joinedload(Usuario.empresas_link).joinedload(UsuarioEmpresa.empresa),
            )
            .where(Usuario.email == data.email)
        )
        .unique()
        .scalar_one_or_none()
    )
    password_hash = user.password_hash if user is not None else _DUMMY_PASSWORD_HASH
    password_ok = verify_password(data.password, password_hash)
    if user is None or not password_ok:
        _LOGIN_ATTEMPTS[ip].append(ahora)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciales incorrectas")
    _LOGIN_ATTEMPTS.pop(ip, None)
    if not user.activo:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Usuario inactivo")
    if needs_password_rehash(user.password_hash):
        user.password_hash = hash_password(data.password)
        db.commit()
    token = create_token(str(user.id), extra={"rol": user.rol.nombre if user.rol else None})
    if settings.fernet_key:
        response.set_cookie(_PAYLOAD_SALT_COOKIE, base64.urlsafe_b64encode(os.urandom(16)).decode("ascii"), httponly=True, secure=settings.environment.lower() == "production", samesite="strict", path="/api")
    return {"access_token": token, "token_type": "bearer", "usuario": usuario_out(user)}


@router.get("/me", response_model=UsuarioOut)
def me(user: Usuario = Depends(get_current_user)):
    return usuario_out(user)


@router.get("/payload-key")
def payload_key(request: Request, user: Usuario = Depends(get_current_user)):
    if not settings.fernet_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Payload encryption is not configured")
    encoded = request.cookies.get(_PAYLOAD_SALT_COOKIE)
    if not encoded:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Encryption session missing; log in again")
    try:
        from app.core.security import derive_payload_key
        salt = base64.urlsafe_b64decode(encoded.encode("ascii"))
        if len(salt) != 16:
            raise ValueError("invalid salt")
        key = derive_payload_key(user.id, salt)
    except Exception as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Encryption session invalid; log in again") from exc
    return {"key": base64.urlsafe_b64encode(key).decode("ascii")}


@router.post("/payload-key/refresh")
def refresh_payload_key(response: Response, user: Usuario = Depends(get_current_user)):
    """Rotate only the AES payload session key; leave the JWT intact."""
    if not settings.fernet_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Payload encryption is not configured")
    salt = os.urandom(16)
    response.set_cookie(
        _PAYLOAD_SALT_COOKIE,
        base64.urlsafe_b64encode(salt).decode("ascii"),
        httponly=True,
        secure=settings.environment.lower() == "production",
        samesite="strict",
        path="/api",
    )
    from app.core.security import derive_payload_key

    key = derive_payload_key(user.id, salt)
    return {"key": base64.urlsafe_b64encode(key).decode("ascii")}
