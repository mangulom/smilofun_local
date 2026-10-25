from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import (
    CompraInsumo,
    DetalleCompraInsumo,
    MovimientoProducto,
    Producto,
    Proveedor,
    Sucursal,
    Usuario,
)
from app.schemas import CompraInsumoCreate, CompraInsumoOut

router = APIRouter(prefix="/api/compras-insumos", tags=["Compras de insumos"], dependencies=[Depends(get_current_user)])


def _siguiente_numero(db: Session) -> str:
    prefijo = f"COMP-{date.today():%Y%m%d}-"
    existentes = db.execute(select(CompraInsumo.numero).where(CompraInsumo.numero.like(f"{prefijo}%"))).scalars().all()
    siguiente = max((int(x.rsplit("-", 1)[-1]) for x in existentes if x.rsplit("-", 1)[-1].isdigit()), default=0) + 1
    numero = f"{prefijo}{siguiente:04d}"
    while db.scalar(select(CompraInsumo.id).where(CompraInsumo.numero == numero)):
        siguiente += 1
        numero = f"{prefijo}{siguiente:04d}"
    return numero


def _pertenece_a_empresa(user: Usuario, empresa_id: int | None) -> bool:
    return (not user.empresas_link) or (empresa_id in {e.empresa_id for e in user.empresas_link})


def _cargar(db: Session, compra_id: int) -> CompraInsumo | None:
    return db.execute(
        select(CompraInsumo)
        .options(joinedload(CompraInsumo.proveedor), selectinload(CompraInsumo.detalles).joinedload(DetalleCompraInsumo.producto))
        .where(CompraInsumo.id == compra_id)
    ).unique().scalar_one_or_none()


@router.get("", response_model=list[CompraInsumoOut])
def listar(
    empresa_id: int | None = None,
    proveedor_id: int | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    empresa_id = empresa_id or (user.empresas_link[0].empresa_id if user.empresas_link else None)
    stmt = select(CompraInsumo).options(
        joinedload(CompraInsumo.proveedor),
        selectinload(CompraInsumo.detalles).joinedload(DetalleCompraInsumo.producto),
    )
    if empresa_id:
        if not _pertenece_a_empresa(user, empresa_id):
            raise HTTPException(403, "No tienes acceso a esa empresa")
        stmt = stmt.where(CompraInsumo.empresa_id == empresa_id)
    elif user.empresas_link:
        stmt = stmt.where(CompraInsumo.empresa_id.in_([e.empresa_id for e in user.empresas_link]))
    if proveedor_id:
        stmt = stmt.where(CompraInsumo.proveedor_id == proveedor_id)
    if desde:
        stmt = stmt.where(CompraInsumo.fecha >= desde)
    if hasta:
        stmt = stmt.where(CompraInsumo.fecha <= hasta)
    return db.execute(stmt.order_by(CompraInsumo.fecha.desc(), CompraInsumo.id.desc())).unique().scalars().all()


@router.get("/{compra_id}", response_model=CompraInsumoOut)
def obtener(compra_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    compra = _cargar(db, compra_id)
    if not compra:
        raise HTTPException(404, "Compra no encontrada")
    if not _pertenece_a_empresa(user, compra.empresa_id):
        raise HTTPException(403, "No tienes acceso a esta compra")
    return compra


@router.post("", response_model=CompraInsumoOut, status_code=status.HTTP_201_CREATED)
def crear(data: CompraInsumoCreate, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    empresa_id = data.empresa_id or (user.empresas_link[0].empresa_id if user.empresas_link else 1)
    if not _pertenece_a_empresa(user, empresa_id):
        raise HTTPException(403, "No puedes registrar compras para otra empresa")
    proveedor = db.get(Proveedor, data.proveedor_id)
    sucursal = db.get(Sucursal, data.sucursal_id)
    if not proveedor or not proveedor.activo:
        raise HTTPException(404, "Proveedor activo no encontrado")
    if not sucursal or not sucursal.activa:
        raise HTTPException(404, "Sucursal activa no encontrada")
    if proveedor.empresa_id and proveedor.empresa_id != empresa_id:
        raise HTTPException(400, "El proveedor pertenece a otra empresa")
    if sucursal.empresa_id and sucursal.empresa_id != empresa_id:
        raise HTTPException(400, "La sucursal pertenece a otra empresa")
    if not sucursal.activa:
        raise HTTPException(400, "La sucursal está inactiva")

    cantidades: dict[int, int] = {}
    costo_total_por_producto: dict[int, Decimal] = {}
    for linea in data.detalles:
        cantidades[linea.producto_id] = cantidades.get(linea.producto_id, 0) + linea.cantidad
        costo_total_por_producto[linea.producto_id] = costo_total_por_producto.get(linea.producto_id, Decimal("0")) + Decimal(str(linea.cantidad)) * Decimal(str(linea.costo_unitario))
    productos = {}
    for producto_id in cantidades:
        producto = db.get(Producto, producto_id)
        if not producto or not producto.activo:
            raise HTTPException(404, f"Insumo {producto_id} no encontrado o inactivo")
        if producto.sucursal_id != data.sucursal_id:
            raise HTTPException(400, f"El insumo {producto.nombre} pertenece a otra sede")
        if producto.empresa_id and producto.empresa_id != empresa_id:
            raise HTTPException(400, f"El insumo {producto.nombre} pertenece a otra empresa")
        productos[producto_id] = producto
    if any(producto.stock + cantidades[pid] > 2_147_483_647 for pid, producto in productos.items()):
        raise HTTPException(422, "La cantidad de la compra supera el máximo de stock permitido")

    subtotal = sum((Decimal(str(i.cantidad)) * Decimal(str(i.costo_unitario)) for i in data.detalles), Decimal("0"))
    impuesto = Decimal(str(data.impuesto)).quantize(Decimal("0.01"))
    total = subtotal + impuesto
    if total > Decimal("999999999.99"):
        raise HTTPException(422, "El total de la compra supera el límite permitido")

    compra = CompraInsumo(
        empresa_id=empresa_id, proveedor_id=proveedor.id, sucursal_id=sucursal.id,
        usuario_id=user.id, numero=_siguiente_numero(db), referencia=data.referencia,
        fecha=data.fecha, estado="recibida", subtotal=subtotal, impuesto=impuesto,
        total=total, notas=data.notas,
    )
    try:
        for linea in data.detalles:
            producto = productos[linea.producto_id]
            importe = (Decimal(str(linea.cantidad)) * Decimal(str(linea.costo_unitario))).quantize(Decimal("0.01"))
            compra.detalles.append(DetalleCompraInsumo(
                producto_id=producto.id, cantidad=linea.cantidad,
                costo_unitario=Decimal(str(linea.costo_unitario)), subtotal=importe,
            ))
        db.add(compra)
        db.flush()
        for producto_id, cantidad in cantidades.items():
            producto = productos[producto_id]
            producto.stock += cantidad
            producto.precio_compra = (costo_total_por_producto[producto_id] / Decimal(cantidad)).quantize(Decimal("0.01"))
            db.add(MovimientoProducto(
                producto_id=producto_id, tipo="entrada", cantidad=cantidad,
                motivo=f"Compra {compra.numero} · {proveedor.nombre}", usuario_id=user.id,
            ))
        db.commit()
    except Exception:
        db.rollback()
        raise
    guardada = _cargar(db, compra.id)
    return guardada
