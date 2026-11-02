from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_empresa_access, require_roles
from app.core.database import get_db
from app.models import DetalleFactura, Factura, Paciente, Pago, PlanTratamiento, Sucursal, Usuario
from app.schemas import (
    FacturaCreate,
    FacturaOut,
    PagoIn,
    PagoOut,
    ReporteIngresosOut,
)

router = APIRouter(
    prefix="/api/facturas",
    tags=["Facturación"],
    dependencies=[Depends(get_current_user)],
)


def _siguiente_numero(db: Session, anio: int) -> str:
    total = db.scalar(
        select(func.count(Factura.id)).where(func.extract("year", Factura.fecha) == anio)
    ) or 0
    return f"F-{anio}-{total + 1:04d}"


def _cargar(db: Session, factura_id: int) -> Factura:
    factura = db.execute(
        select(Factura)
        .options(
            selectinload(Factura.detalles),
            selectinload(Factura.pagos),
            selectinload(Factura.paciente),
        )
        .where(Factura.id == factura_id)
    ).scalar_one_or_none()
    if factura is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Factura no encontrada")
    return factura


@router.get("", response_model=list[FacturaOut])
def listar(
    estado: str | None = None,
    paciente_id: int | None = None,
    search: str | None = Query(None, max_length=120, description="Número de factura o nombre del paciente"),
    empresa_id: int | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    stmt = select(Factura).options(
        selectinload(Factura.detalles),
        selectinload(Factura.pagos),
        selectinload(Factura.paciente),
    )
    allowed = {x.empresa_id for x in user.empresas_link}
    if empresa_id is not None:
        require_empresa_access(empresa_id, user)
        stmt = stmt.where(Factura.empresa_id == empresa_id)
    elif allowed:
        stmt = stmt.where(Factura.empresa_id.in_(allowed))
    if estado:
        stmt = stmt.where(Factura.estado == estado)
    if paciente_id:
        stmt = stmt.where(Factura.paciente_id == paciente_id)
    if desde:
        stmt = stmt.where(func.date(Factura.fecha) >= desde)
    if hasta:
        stmt = stmt.where(func.date(Factura.fecha) <= hasta)
    if search:
        like = f"%{search.lower().replace(chr(37), chr(92) + chr(37)).replace(chr(95), chr(92) + chr(95))}%"
        stmt = stmt.join(Paciente, Factura.paciente_id == Paciente.id).where(
            func.lower(Factura.numero).like(like, escape="\\")
            | func.lower(Paciente.nombres).like(like, escape="\\")
            | func.lower(Paciente.apellidos).like(like, escape="\\")
        )
    return (
        db.execute(stmt.order_by(Factura.fecha.desc()).offset(skip).limit(limit))
        .scalars()
        .unique()
        .all()
    )


@router.post("", response_model=FacturaOut, status_code=status.HTTP_201_CREATED)
def crear(data: FacturaCreate, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    if not data.detalles:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "La factura debe tener detalles")
    paciente = db.get(Paciente, data.paciente_id)
    if paciente is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paciente no encontrado")
    empresa_id = paciente.empresa_id or (user.empresas_link[0].empresa_id if user.empresas_link else 1)
    require_empresa_access(empresa_id, user)
    if data.empresa_id is not None and data.empresa_id != empresa_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La factura no puede pertenecer a otra empresa")
    sucursal = db.get(Sucursal, data.sucursal_id)
    if sucursal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sucursal no encontrada")
    if sucursal.empresa_id and sucursal.empresa_id != empresa_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La sede pertenece a otra empresa")
    if data.plan_id:
        plan = db.get(PlanTratamiento, data.plan_id)
        if plan is None or plan.empresa_id and plan.empresa_id != empresa_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan no encontrado")
    subtotal = sum(d.cantidad * float(d.precio_unitario) for d in data.detalles)
    total = round(subtotal - data.descuento + data.impuesto, 2)
    factura = Factura(
        numero=_siguiente_numero(db, date.today().year),
        empresa_id=empresa_id,
        paciente_id=data.paciente_id,
        sucursal_id=data.sucursal_id,
        plan_id=data.plan_id,
        descuento=data.descuento,
        impuesto=data.impuesto,
        subtotal=round(subtotal, 2),
        total=total,
        notas=data.notas,
    )
    db.add(factura)
    db.flush()
    for detalle in data.detalles:
        db.add(
            DetalleFactura(
                factura_id=factura.id,
                descripcion=detalle.descripcion,
                cantidad=detalle.cantidad,
                precio_unitario=detalle.precio_unitario,
                subtotal=round(detalle.cantidad * float(detalle.precio_unitario), 2),
            )
        )
    db.commit()
    return _cargar(db, factura.id)


@router.get("/resumen", response_model=ReporteIngresosOut)
def resumen(
    desde: date | None = None,
    hasta: date | None = None,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    desde = desde or date(date.today().year, 1, 1)
    hasta = hasta or date.today()
    stmt = (
        select(
            func.strftime("%Y-%m", Factura.fecha).label("mes"),
            func.coalesce(func.sum(Factura.total), 0).label("total"),
        )
        .where(
            Factura.estado.in_(["pagada", "parcial"]),
            func.date(Factura.fecha) >= desde,
            func.date(Factura.fecha) <= hasta,
            *([Factura.empresa_id.in_([x.empresa_id for x in user.empresas_link])] if user.empresas_link else []),
        )
        .group_by("mes")
        .order_by("mes")
    )
    filas = db.execute(stmt).all()
    detalle = [{"mes": f.mes, "total": float(f.total)} for f in filas]
    total = sum(d["total"] for d in detalle)
    return ReporteIngresosOut(
        detalle=detalle,
        total=round(total, 2),
        promedio=round(total / len(detalle), 2) if detalle else 0,
    )


@router.get("/{factura_id}", response_model=FacturaOut)
def obtener(factura_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    factura = _cargar(db, factura_id)
    require_empresa_access(factura.empresa_id, user)
    return factura


@router.post("/{factura_id}/pagos", response_model=FacturaOut)
def registrar_pago(factura_id: int, data: PagoIn, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    factura = _cargar(db, factura_id)
    require_empresa_access(factura.empresa_id, user)
    if factura.estado == "anulada":
        raise HTTPException(status.HTTP_409_CONFLICT, "No se puede pagar una factura anulada")
    if factura.estado == "pagada":
        raise HTTPException(status.HTTP_409_CONFLICT, "La factura ya está pagada")
    if data.monto <= 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "El monto debe ser positivo")
    db.add(Pago(factura_id=factura.id, monto=data.monto, metodo=data.metodo, referencia=data.referencia))
    db.flush()
    pagado = float(
        db.scalar(select(func.coalesce(func.sum(Pago.monto), 0)).where(Pago.factura_id == factura.id))
        or 0
    )
    if pagado >= float(factura.total):
        factura.estado = "pagada"
    elif pagado > 0:
        factura.estado = "parcial"
    db.commit()
    return _cargar(db, factura_id)


@router.patch("/{factura_id}/anular", response_model=FacturaOut)
def anular(factura_id: int, db: Session = Depends(get_db), user: Usuario = Depends(require_roles("admin"))):
    factura = _cargar(db, factura_id)
    require_empresa_access(factura.empresa_id, user)
    if factura.estado == "pagada":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "No se puede anular una factura pagada"
        )
    factura.estado = "anulada"
    db.commit()
    return _cargar(db, factura_id)
