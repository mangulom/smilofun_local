"""Dependencias compartidas de la API."""
from __future__ import annotations

import jwt as pyjwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models import Usuario

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autenticado")
    try:
        payload = decode_token(credentials.credentials)
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión expirada")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inv?lido")
    user = db.get(Usuario, user_id)
    if user is None or not user.activo:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no encontrado o inactivo")
    return user


def require_roles(*roles: str):
    def dependency(user: Usuario = Depends(get_current_user)) -> Usuario:
        if user.rol and user.rol.nombre not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Permisos insuficientes")
        return user

    return dependency


def require_empresa_access(empresa_id: int | None, user: Usuario) -> None:
    if empresa_id is None:
        return
    allowed = {link.empresa_id for link in user.empresas_link}
    if allowed and empresa_id not in allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes acceso a esta empresa")
