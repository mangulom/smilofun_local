from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_token, verify_password
from app.models import Usuario, UsuarioEmpresa
from app.schemas import LoginRequest, TokenResponse, UsuarioOut

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
def login(data: LoginRequest, db: Session = Depends(get_db)):
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
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciales incorrectas")
    if not user.activo:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Usuario inactivo")
    token = create_token(str(user.id), extra={"rol": user.rol.nombre if user.rol else None})
    return TokenResponse(access_token=token, usuario=usuario_out(user))


@router.get("/me", response_model=UsuarioOut)
def me(user: Usuario = Depends(get_current_user)):
    return usuario_out(user)
