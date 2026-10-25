from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import MovimientoProducto, Producto, Sucursal
from app.schemas import (
    MovimientoIn,
    MovimientoOut,
    ProductoCreate,
    ProductoOut,
    ProductoUpdate,
)

router = APIRouter(
    prefix="/api/productos",
    tags=["Inventario"],
    dependencies=[Depends(get_current_user)],
)


def _con_alertas(p: Producto) -> ProductoOut:
    out = ProductoOut.model_validate(p)
    out.alerta_stock = p.stock <= p.stock_minimo
    out.alerta_vencimiento = bool(
        p.fecha_vencimiento and p.fecha_vencimiento <= date.today()
    )
    return out


@router.get("", response_model=list[ProductoOut])
def listar(
    search: str | None = None,
    categoria: str | None = None,
    empresa_id: int | None = None,
    sucursal_id: int | None = None,
    proveedor_id: int | None = None,
    solo_alertas: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    stmt = select(Producto).where(Producto.activo.is_(True))
    if empresa_id:
        stmt = stmt.where(Producto.empresa_id == empresa_id)
    if sucursal_id:
        stmt = stmt.where(Producto.sucursal_id == sucursal_id)
    if proveedor_id:
        from app.models import DetalleCompraInsumo, CompraInsumo
        stmt = stmt.where(Producto.id.in_(
            select(DetalleCompraInsumo.producto_id)
            .join(CompraInsumo, CompraInsumo.id == DetalleCompraInsumo.compra_id)
            .where(CompraInsumo.proveedor_id == proveedor_id)
        ))
    if categoria:
        stmt = stmt.where(Producto.categoria == categoria)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(
            Producto.nombre.ilike(like) | Producto.sku.ilike(like)  # type: ignore[union-attr]
        )
    productos = db.execute(stmt.order_by(Producto.nombre)).scalars().all()
    salida = [_con_alertas(p) for p in productos]
    if solo_alertas:
        salida = [p for p in salida if p.alerta_stock or p.alerta_vencimiento]
    return salida[skip : skip + limit]


@router.post("", response_model=ProductoOut, status_code=status.HTTP_201_CREATED)
def crear(data: ProductoCreate, db: Session = Depends(get_db)):
    if db.get(Sucursal, data.sucursal_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sucursal no encontrada")
    if data.sku:
        existe = db.execute(select(Producto).where(Producto.sku == data.sku)).scalar_one_or_none()
        if existe:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Ya existe un producto con SKU {data.sku}")
    payload = data.model_dump()
    payload["empresa_id"] = payload.get("empresa_id") or 1
    obj = Producto(**payload)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _con_alertas(obj)


@router.get("/{producto_id}", response_model=ProductoOut)
def obtener(producto_id: int, db: Session = Depends(get_db)):
    obj = db.get(Producto, producto_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado")
    return _con_alertas(obj)


@router.put("/{producto_id}", response_model=ProductoOut)
def actualizar(producto_id: int, data: ProductoUpdate, db: Session = Depends(get_db)):
    obj = db.get(Producto, producto_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return _con_alertas(obj)


@router.delete("/{producto_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(producto_id: int, db: Session = Depends(get_db)):
    obj = db.get(Producto, producto_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado")
    obj.activo = False
    db.commit()


@router.post("/{producto_id}/movimientos", response_model=MovimientoOut)
def registrar_movimiento(
    producto_id: int, data: MovimientoIn, db: Session = Depends(get_db)
):
    obj = db.get(Producto, producto_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado")
    if data.tipo == "salida" and obj.stock < data.cantidad:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Stock insuficiente (disponible: {obj.stock})",
        )
    obj.stock += data.cantidad if data.tipo == "entrada" else -data.cantidad
    mov = MovimientoProducto(
        producto_id=producto_id,
        tipo=data.tipo,
        cantidad=data.cantidad,
        motivo=data.motivo,
    )
    db.add(mov)
    db.commit()
    db.refresh(mov)
    return mov


@router.get("/{producto_id}/movimientos", response_model=list[MovimientoOut])
def listar_movimientos(producto_id: int, db: Session = Depends(get_db)):
    if db.get(Producto, producto_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado")
    return (
        db.execute(
            select(MovimientoProducto)
            .where(MovimientoProducto.producto_id == producto_id)
            .order_by(MovimientoProducto.fecha.desc())
        )
        .scalars()
        .all()
    )
