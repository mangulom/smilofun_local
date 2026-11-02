from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_empresa_access
from app.core.database import get_db
from app.models import (
    Cita,
    DetalleFactura,
    Doctor,
    Factura,
    Paciente,
    Producto,
    Usuario,
)
from app.schemas import DashboardOut, IngresoMensual

router = APIRouter(
    prefix="/api/dashboard",
    tags=["Dashboard"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=DashboardOut)
def dashboard(
    empresa_id: int | None = Query(default=None, description="Filtra los indicadores por empresa"),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    assigned = {x.empresa_id for x in user.empresas_link}
    if empresa_id is not None:
        require_empresa_access(empresa_id, user)
    elif assigned:
        empresa_id = next(iter(assigned))
    hoy = date.today()
    mes_inicio = hoy.replace(day=1)
    mes_anterior_inicio = (mes_inicio - timedelta(days=1)).replace(day=1)
    hoy_30 = hoy - timedelta(days=30)

    def _emp(stmt, modelo):
        """Aplica el filtro de empresa cuando se indica."""
        return stmt.where(modelo.empresa_id == empresa_id) if empresa_id else stmt

    # Citas de hoy
    citas_hoy_rows = db.execute(
        _emp(
            select(Cita.estado, func.count(Cita.id)).where(Cita.fecha == hoy),
            Cita,
        ).group_by(Cita.estado)
    ).all()
    por_estado = {r[0]: r[1] for r in citas_hoy_rows}
    citas_hoy = sum(por_estado.values())

    proximas = (
        db.execute(
            _emp(
                select(Cita)
                .options(selectinload(Cita.paciente), selectinload(Cita.doctor))
                .where(
                    Cita.fecha >= hoy,
                    Cita.estado.in_(["programada", "confirmada"]),
                ),
                Cita,
            )
            .order_by(Cita.fecha, Cita.hora_inicio)
            .limit(8)
        )
        .scalars()
        .unique()
        .all()
    )

    def _ingresos(desde, hasta) -> float:
        stmt = select(func.coalesce(func.sum(Factura.total), 0)).where(
            Factura.estado.in_(["pagada", "parcial"]),
            func.date(Factura.fecha) >= desde,
            func.date(Factura.fecha) <= hasta,
        )
        return float(db.scalar(_emp(stmt, Factura)) or 0)

    ingresos_mes = _ingresos(mes_inicio, hoy)
    ingresos_mes_anterior = _ingresos(mes_anterior_inicio, mes_inicio - timedelta(days=1))
    variacion = (
        round((ingresos_mes - ingresos_mes_anterior) / ingresos_mes_anterior * 100, 1)
        if ingresos_mes_anterior
        else 0.0
    )

    pacientes_nuevos_mes = db.scalar(
        _emp(
            select(func.count(Paciente.id)).where(func.date(Paciente.creado_en) >= mes_inicio),
            Paciente,
        )
    ) or 0
    pacientes_total = db.scalar(
        _emp(
            select(func.count(Paciente.id)).where(Paciente.activo.is_(True)),
            Paciente,
        )
    ) or 0
    doctores_activos = db.scalar(
        _emp(
            select(func.count(Doctor.id)).where(Doctor.activo.is_(True)),
            Doctor,
        )
    ) or 0

    completadas = db.scalar(
        _emp(
            select(func.count(Cita.id)).where(
                Cita.estado == "completada", Cita.fecha >= hoy_30
            ),
            Cita,
        )
    ) or 0
    no_asistio = db.scalar(
        _emp(
            select(func.count(Cita.id)).where(Cita.estado == "no_asistio", Cita.fecha >= hoy_30),
            Cita,
        )
    ) or 0
    canceladas = db.scalar(
        _emp(
            select(func.count(Cita.id)).where(Cita.estado == "cancelada", Cita.fecha >= hoy_30),
            Cita,
        )
    ) or 0
    terminadas = completadas + no_asistio + canceladas
    tasa_asistencia = round(completadas / terminadas * 100, 1) if terminadas else 100.0

    pendientes_confirmar = db.scalar(
        _emp(
            select(func.count(Cita.id)).where(
                Cita.estado == "programada",
                Cita.fecha >= hoy,
                Cita.fecha <= hoy + timedelta(days=7),
            ),
            Cita,
        )
    ) or 0

    stock_alertas = db.scalar(
        _emp(
            select(func.count(Producto.id)).where(
                Producto.activo.is_(True), Producto.stock <= Producto.stock_minimo
            ),
            Producto,
        )
    ) or 0

    # Serie de ingresos últimos 12 meses
    serie: list[IngresoMensual] = []
    for i in range(11, -1, -1):
        m_start = mes_inicio
        for _ in range(i):
            m_start = (m_start.replace(day=1) - timedelta(days=1)).replace(day=1)
        next_start = (m_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        total = _ingresos(m_start, next_start - timedelta(days=1))
        serie.append(IngresoMensual(mes=m_start.strftime("%Y-%m"), total=round(total, 2)))

    # Top tratamientos (por detalle de factura, últimos 6 meses)
    seis_meses = mes_inicio - timedelta(days=180)
    top_rows = db.execute(
        select(
            DetalleFactura.descripcion,
            func.sum(DetalleFactura.cantidad).label("cantidad"),
            func.sum(DetalleFactura.subtotal).label("total"),
        )
        .join(Factura, DetalleFactura.factura_id == Factura.id)
        .where(
            func.date(Factura.fecha) >= seis_meses,
            Factura.estado != "anulada",
            *([Factura.empresa_id == empresa_id] if empresa_id else []),
        )
        .group_by(DetalleFactura.descripcion)
        .order_by(func.sum(DetalleFactura.subtotal).desc())
        .limit(6)
    ).all()
    top_tratamientos = [
        {"tratamiento": r.descripcion, "cantidad": int(r.cantidad), "total": float(r.total)}
        for r in top_rows
    ]

    # Citas por doctor (30 días)
    doctor_rows = db.execute(
        select(
            Doctor.nombres,
            Doctor.apellidos,
            Doctor.color,
            func.count(Cita.id).label("total"),
        )
        .join(Cita)
        .where(
            Cita.doctor_id == Doctor.id,
            Cita.fecha >= hoy_30,
            Cita.estado != "cancelada",
            *([Cita.empresa_id == empresa_id] if empresa_id else []),
            *([Doctor.empresa_id == empresa_id] if empresa_id else []),
        )
        .group_by(Doctor.id)
        .order_by(func.count(Cita.id).desc())
    ).all()
    citas_por_doctor = [
        {
            "doctor": f"{r.nombres} {r.apellidos}",
            "citas": int(r.total),
            "color": r.color,
        }
        for r in doctor_rows
    ]

    return DashboardOut(
        citas_hoy=citas_hoy,
        citas_hoy_por_estado=por_estado,
        proximas_citas=proximas,
        ingresos_mes=round(ingresos_mes, 2),
        ingresos_mes_anterior=round(ingresos_mes_anterior, 2),
        variacion_ingresos=variacion,
        pacientes_nuevos_mes=pacientes_nuevos_mes,
        pacientes_total=pacientes_total,
        doctores_activos=doctores_activos,
        tasa_asistencia=tasa_asistencia,
        citas_pendientes_confirmar=pendientes_confirmar,
        stock_alertas=stock_alertas,
        serie_ingresos=serie,
        top_tratamientos=top_tratamientos,
        citas_por_doctor=citas_por_doctor,
    )
