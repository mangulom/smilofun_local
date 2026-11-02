from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import CompraInsumo, Empresa, Proveedor, Usuario
from app.schemas import ProveedorCreate, ProveedorOut, ProveedorUpdate

router = APIRouter(prefix="/api/proveedores", tags=["Proveedores"], dependencies=[Depends(get_current_user)])


def _empresa_usuario(user: Usuario, empresa_id: int | None) -> int | None:
    empresa_id = empresa_id or (user.empresas_link[0].empresa_id if user.empresas_link else None)
    if user.empresas_link and empresa_id not in {x.empresa_id for x in user.empresas_link}:
        raise HTTPException(403, "No tienes acceso a esa empresa")
    return empresa_id


@router.get("", response_model=list[ProveedorOut])
def listar(
    empresa_id: int | None = None,
    search: str | None = Query(None, max_length=120),
    activo: bool | None = True,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if empresa_id is None and user.empresas_link:
        empresa_id = user.empresas_link[0].empresa_id
    stmt = select(Proveedor)
    if empresa_id:
        if user.empresas_link and empresa_id not in {x.empresa_id for x in user.empresas_link}:
            raise HTTPException(403, "No tienes acceso a esa empresa")
        stmt = stmt.where(Proveedor.empresa_id == empresa_id)
    elif user.empresas_link:
        stmt = stmt.where(Proveedor.empresa_id.in_([x.empresa_id for x in user.empresas_link]))
    if activo is not None:
        stmt = stmt.where(Proveedor.activo == activo)
    if search:
        like = f"%{search.strip().lower().replace(chr(37), chr(92) + chr(37)).replace(chr(95), chr(92) + chr(95))}%"
        stmt = stmt.where(Proveedor.nombre.ilike(like, escape="\\") | func.coalesce(Proveedor.ruc, "").ilike(like, escape="\\"))
    return db.execute(stmt.order_by(Proveedor.nombre).offset(skip).limit(limit)).scalars().all()


@router.post("", response_model=ProveedorOut, status_code=status.HTTP_201_CREATED)
def crear(data: ProveedorCreate, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    empresa_id = _empresa_usuario(user, data.empresa_id)
    if empresa_id and not db.get(Empresa, empresa_id):
        raise HTTPException(404, "Empresa no encontrada")
    nombre = data.nombre.strip()
    if not nombre:
        raise HTTPException(422, "El nombre del proveedor es obligatorio")
    if data.ruc and db.scalar(select(Proveedor.id).where(Proveedor.empresa_id == empresa_id, Proveedor.ruc == data.ruc.strip())):
        raise HTTPException(409, "Ya existe un proveedor con ese RUC en la empresa")
    datos = data.model_dump(exclude={"empresa_id"})
    datos["nombre"] = nombre
    datos["ruc"] = data.ruc.strip() if data.ruc else None
    proveedor = Proveedor(**datos, empresa_id=empresa_id)
    db.add(proveedor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "No se pudo guardar el proveedor: verifica RUC y datos duplicados")
    db.refresh(proveedor)
    return proveedor


@router.get("/{proveedor_id}", response_model=ProveedorOut)
def obtener(proveedor_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    proveedor = db.get(Proveedor, proveedor_id)
    if not proveedor:
        raise HTTPException(404, "Proveedor no encontrado")
    if user.empresas_link and proveedor.empresa_id not in {x.empresa_id for x in user.empresas_link}:
        raise HTTPException(403, "No tienes acceso a este proveedor")
    return proveedor


@router.put("/{proveedor_id}", response_model=ProveedorOut)
def actualizar(proveedor_id: int, data: ProveedorUpdate, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    proveedor = db.get(Proveedor, proveedor_id)
    if not proveedor:
        raise HTTPException(404, "Proveedor no encontrado")
    if user.empresas_link and proveedor.empresa_id not in {x.empresa_id for x in user.empresas_link}:
        raise HTTPException(403, "No tienes acceso a este proveedor")
    cambios = data.model_dump(exclude_unset=True)
    if cambios.get("nombre") is not None:
        cambios["nombre"] = cambios["nombre"].strip()
        if not cambios["nombre"]:
            raise HTTPException(422, "El nombre del proveedor es obligatorio")
    if cambios.get("ruc"):
        cambios["ruc"] = cambios["ruc"].strip()
        duplicado = db.scalar(select(Proveedor.id).where(
            Proveedor.empresa_id == proveedor.empresa_id,
            Proveedor.ruc == cambios["ruc"], Proveedor.id != proveedor_id,
        ))
        if duplicado:
            raise HTTPException(409, "Ya existe otro proveedor con ese RUC")
    for key, value in cambios.items():
        setattr(proveedor, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "No se pudo actualizar el proveedor")
    db.refresh(proveedor)
    return proveedor


@router.delete("/{proveedor_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(proveedor_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    proveedor = db.get(Proveedor, proveedor_id)
    if not proveedor:
        raise HTTPException(404, "Proveedor no encontrado")
    if user.empresas_link and proveedor.empresa_id not in {x.empresa_id for x in user.empresas_link}:
        raise HTTPException(403, "No tienes acceso a este proveedor")
    compras = db.scalar(select(CompraInsumo.id).where(CompraInsumo.proveedor_id == proveedor_id).limit(1))
    if compras:
        raise HTTPException(409, "El proveedor tiene compras registradas; puedes desactivarlo mediante edición")
    proveedor.activo = False  # baja lógica: preserva el historial de compras
    db.commit()
