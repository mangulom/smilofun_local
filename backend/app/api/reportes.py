from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, true
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Cita, DetalleFactura, Doctor, Factura, Paciente, PlanTratamiento
from app.schemas import (
    IngresoMensual,
    ReporteDoctorOut,
    ReporteIngresosOut,
    ReporteTratamientoOut,
)

router = APIRouter(
    prefix="/api/reportes",
    tags=["Reportes"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/ingresos", response_model=ReporteIngresosOut)
def ingresos(
    desde: date = Query(default_factory=lambda: date(date.today().year, 1, 1)),
    hasta: date = Query(default_factory=date.today),
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(
            func.to_char(Factura.fecha, "YYYY-MM").label("mes"),
            func.coalesce(func.sum(Factura.total), 0).label("total"),
        )
        .where(
            Factura.estado.in_(["pagada", "parcial"]),
            func.date(Factura.fecha) >= desde,
            func.date(Factura.fecha) <= hasta,
            *([Factura.empresa_id == empresa_id] if empresa_id else []),
        )
        .group_by("mes")
        .order_by("mes")
    ).all()
    detalle = [IngresoMensual(mes=r.mes, total=float(r.total)) for r in rows]
    total = sum(d.total for d in detalle)
    return ReporteIngresosOut(
        detalle=detalle, total=round(total, 2), promedio=round(total / len(detalle), 2) if detalle else 0
    )


@router.get("/doctores", response_model=list[ReporteDoctorOut])
def por_doctores(
    desde: date = Query(default_factory=lambda: date(date.today().year, 1, 1)),
    hasta: date = Query(default_factory=date.today),
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Citas atendidas y producción (planes) por doctor."""
    citas_rows = db.execute(
        select(
            Doctor.id,
            Doctor.nombres,
            Doctor.apellidos,
            Doctor.color,
            func.count(Cita.id).label("citas"),
        )
        .outerjoin(
            Cita,
            (Cita.doctor_id == Doctor.id)
            & (Cita.estado == "completada")
            & (Cita.fecha >= desde)
            & (Cita.fecha <= hasta)
            & (
                (Cita.empresa_id == empresa_id) if empresa_id else true()
            ),
        )
        .where(*([Doctor.empresa_id == empresa_id] if empresa_id else []))
        .group_by(Doctor.id)
    ).all()
    produccion = dict(
        db.execute(
            select(
                PlanTratamiento.doctor_id,
                func.coalesce(func.sum(PlanTratamiento.total), 0),
            )
            .where(
                PlanTratamiento.estado.in_(["aprobado", "en_progreso", "completado"]),
                func.date(PlanTratamiento.creado_en) >= desde,
                func.date(PlanTratamiento.creado_en) <= hasta,
                *([PlanTratamiento.empresa_id == empresa_id] if empresa_id else []),
            )
            .group_by(PlanTratamiento.doctor_id)
        ).all()
    )
    return [
        ReporteDoctorOut(
            doctor=f"Dr. {r.nombres} {r.apellidos}",
            citas=int(r.citas),
            ingresos=float(produccion.get(r.id, 0)),
            color=r.color,
        )
        for r in citas_rows
    ]


@router.get("/tratamientos", response_model=list[ReporteTratamientoOut])
def tratamientos(
    desde: date = Query(default_factory=lambda: date(date.today().year, 1, 1)),
    hasta: date = Query(default_factory=date.today),
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(
            DetalleFactura.descripcion,
            func.sum(DetalleFactura.cantidad).label("cantidad"),
            func.sum(DetalleFactura.subtotal).label("total"),
        )
        .join(Factura, DetalleFactura.factura_id == Factura.id)
        .where(
            func.date(Factura.fecha) >= desde,
            func.date(Factura.fecha) <= hasta,
            Factura.estado != "anulada",
            *([Factura.empresa_id == empresa_id] if empresa_id else []),
        )
        .group_by(DetalleFactura.descripcion)
        .order_by(func.sum(DetalleFactura.subtotal).desc())
        .limit(20)
    ).all()
    return [
        ReporteTratamientoOut(tratamiento=r.descripcion, cantidad=int(r.cantidad), total=float(r.total))
        for r in rows
    ]


@router.get("/pacientes-nuevos")
def pacientes_nuevos(
    desde: date = Query(default_factory=lambda: date(date.today().year, 1, 1)),
    hasta: date = Query(default_factory=date.today),
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(
            func.to_char(Paciente.creado_en, "YYYY-MM").label("mes"),
            func.count(Paciente.id).label("total"),
        )
        .where(
            func.date(Paciente.creado_en) >= desde,
            func.date(Paciente.creado_en) <= hasta,
            *([Paciente.empresa_id == empresa_id] if empresa_id else []),
        )
        .group_by("mes")
        .order_by("mes")
    ).all()
    return [{"mes": r.mes, "total": int(r.total)} for r in rows]


@router.get("/citas")
def citas_por_estado(
    desde: date = Query(default_factory=lambda: date(date.today().year, 1, 1)),
    hasta: date = Query(default_factory=date.today),
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(Cita.estado, func.count(Cita.id))
        .where(
            Cita.fecha >= desde,
            Cita.fecha <= hasta,
            *([Cita.empresa_id == empresa_id] if empresa_id else []),
        )
        .group_by(Cita.estado)
    ).all()
    total = sum(r[1] for r in rows) or 1
    return [
        {"estado": r[0], "cantidad": int(r[1]), "porcentaje": round(r[1] / total * 100, 1)}
        for r in rows
    ]
