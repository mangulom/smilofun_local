from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import (
    ESTADOS_DIENTE,
    Cita,
    Doctor,
    Factura,
    HistorialClinico,
    Odontograma,
    Paciente,
    Pago,
    PlanTratamiento,
    Sucursal,
    Usuario,
)
from app.schemas import (
    HistorialCreate,
    HistorialOut,
    OdontogramaItem,
    OdontogramaOut,
    PacienteCreate,
    PacienteOut,
    PacienteResumen,
    PacienteUpdate,
)

router = APIRouter(
    prefix="/api/pacientes",
    tags=["Pacientes"],
    dependencies=[Depends(get_current_user)],
)


def _siguiente_codigo(db: Session) -> str:
    total = db.scalar(select(func.count(Paciente.id))) or 0
    return f"P-{total + 1:05d}"


@router.get("", response_model=list[PacienteOut])
def listar(
    search: str | None = Query(None, description="Busca por nombre, DNI o código"),
    sucursal_id: int | None = None,
    empresa_id: int | None = None,
    activo: bool | None = True,
    skip: int = 0,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
):
    stmt = select(Paciente)
    if empresa_id:
        stmt = stmt.where(Paciente.empresa_id == empresa_id)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            func.lower(Paciente.nombres).like(like.lower())
            | func.lower(Paciente.apellidos).like(like.lower())
            | func.lower(Paciente.codigo).like(like.lower())
            | func.lower(func.coalesce(Paciente.dni, "")).like(like.lower())
        )
    if sucursal_id:
        stmt = stmt.where(Paciente.sucursal_id == sucursal_id)
    if activo is not None:
        stmt = stmt.where(Paciente.activo == activo)
    stmt = stmt.order_by(Paciente.creado_en.desc()).offset(skip).limit(limit)
    return db.execute(stmt).scalars().all()


@router.post("", response_model=PacienteOut, status_code=status.HTTP_201_CREATED)
def crear(data: PacienteCreate, db: Session = Depends(get_db)):
    if data.dni:
        existe = db.execute(select(Paciente).where(Paciente.dni == data.dni)).scalar_one_or_none()
        if existe:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Ya existe un paciente con DNI {data.dni}")
    payload = data.model_dump()
    payload["empresa_id"] = payload.get("empresa_id") or 1
    sucursal = db.get(Sucursal, payload["sucursal_id"])
    if sucursal is None or not sucursal.activa:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sede activa no encontrada")
    if sucursal.empresa_id and sucursal.empresa_id != payload["empresa_id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La sede seleccionada pertenece a otra empresa")
    paciente = Paciente(**payload, codigo=_siguiente_codigo(db))
    db.add(paciente)
    db.commit()
    db.refresh(paciente)
    return paciente


@router.get("/{paciente_id}", response_model=PacienteOut)
def obtener(paciente_id: int, db: Session = Depends(get_db)):
    paciente = db.get(Paciente, paciente_id)
    if paciente is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paciente no encontrado")
    return paciente


@router.put("/{paciente_id}", response_model=PacienteOut)
def actualizar(paciente_id: int, data: PacienteUpdate, db: Session = Depends(get_db)):
    paciente = db.get(Paciente, paciente_id)
    if paciente is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paciente no encontrado")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(paciente, key, value)
    db.commit()
    db.refresh(paciente)
    return paciente


@router.delete("/{paciente_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(paciente_id: int, db: Session = Depends(get_db)):
    paciente = db.get(Paciente, paciente_id)
    if paciente is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paciente no encontrado")
    paciente.activo = False
    db.commit()


# ---------------------------------------------------------------------------
# Resumen clínico/financiero del paciente
# ---------------------------------------------------------------------------
@router.get("/{paciente_id}/resumen", response_model=PacienteResumen)
def resumen(paciente_id: int, db: Session = Depends(get_db)):
    paciente = db.get(Paciente, paciente_id)
    if paciente is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paciente no encontrado")

    hoy = date.today()
    total_citas = db.scalar(
        select(func.count(Cita.id)).where(Cita.paciente_id == paciente_id)
    ) or 0
    no_show = db.scalar(
        select(func.count(Cita.id)).where(
            Cita.paciente_id == paciente_id, Cita.estado == "no_asistio"
        )
    ) or 0
    proxima = db.execute(
        select(Cita)
        .options(selectinload(Cita.paciente), selectinload(Cita.doctor))
        .where(
            Cita.paciente_id == paciente_id,
            Cita.fecha >= hoy,
            Cita.estado.in_(["programada", "confirmada"]),
        )
        .order_by(Cita.fecha, Cita.hora_inicio)
        .limit(1)
    ).scalar_one_or_none()
    ultima_visita = db.scalar(
        select(func.max(Cita.fecha)).where(
            Cita.paciente_id == paciente_id, Cita.estado == "completada"
        )
    )
    total_gastado = float(
        db.scalar(
            select(func.coalesce(func.sum(Factura.total), 0)).where(
                Factura.paciente_id == paciente_id,
                Factura.estado.in_(["pagada", "parcial", "emitida"]),
            )
        )
        or 0
    )
    saldo_total = float(
        db.scalar(
            select(func.coalesce(func.sum(Factura.total), 0)).where(
                Factura.paciente_id == paciente_id, Factura.estado != "anulada"
            )
        )
        or 0
    )
    pagado = float(
        db.scalar(
            select(func.coalesce(func.sum(Pago.monto), 0))
            .join(Factura, Pago.factura_id == Factura.id)
            .where(Factura.paciente_id == paciente_id, Factura.estado != "anulada")
        )
        or 0
    )
    planes_activos = db.scalar(
        select(func.count(PlanTratamiento.id)).where(
            PlanTratamiento.paciente_id == paciente_id,
            PlanTratamiento.estado.in_(["aprobado", "en_progreso"]),
        )
    ) or 0
    dientes_afectados = db.scalar(
        select(func.count(Odontograma.id)).where(
            Odontograma.paciente_id == paciente_id, Odontograma.estado != "sano"
        )
    ) or 0
    return PacienteResumen(
        paciente=PacienteOut.model_validate(paciente),
        total_citas=total_citas,
        proxima_cita=proxima,
        ultima_visita=ultima_visita,
        total_gastado=total_gastado,
        saldo_pendiente=round(max(saldo_total - pagado, 0), 2),
        planes_activos=planes_activos,
        dientes_afectados=dientes_afectados,
        tasa_no_show=round(no_show / total_citas, 3) if total_citas else 0,
    )


# ---------------------------------------------------------------------------
# Historial clínico
# ---------------------------------------------------------------------------
@router.get("/{paciente_id}/historial", response_model=list[HistorialOut])
def historial(paciente_id: int, db: Session = Depends(get_db)):
    return db.execute(
        select(HistorialClinico)
        .options(joinedload(HistorialClinico.doctor))
        .where(HistorialClinico.paciente_id == paciente_id)
        .order_by(HistorialClinico.fecha.desc())
    ).scalars().all()


@router.post(
    "/{paciente_id}/historial",
    response_model=HistorialOut,
    status_code=status.HTTP_201_CREATED,
)
def agregar_historial(
    paciente_id: int, data: HistorialCreate, db: Session = Depends(get_db)
):
    if db.get(Paciente, paciente_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paciente no encontrado")
    if db.get(Doctor, data.doctor_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor no encontrado")
    nota = HistorialClinico(paciente_id=paciente_id, **data.model_dump())
    db.add(nota)
    db.commit()
    db.refresh(nota)
    return db.execute(
        select(HistorialClinico)
        .options(joinedload(HistorialClinico.doctor))
        .where(HistorialClinico.id == nota.id)
    ).scalar_one()


# ---------------------------------------------------------------------------
# Odontograma
# ---------------------------------------------------------------------------
@router.get("/{paciente_id}/odontograma", response_model=list[OdontogramaOut])
def obtener_odontograma(paciente_id: int, db: Session = Depends(get_db)):
    return db.execute(
        select(Odontograma)
        .where(Odontograma.paciente_id == paciente_id)
        .order_by(Odontograma.diente, Odontograma.superficie)
    ).scalars().all()


@router.put("/{paciente_id}/odontograma", response_model=list[OdontogramaOut])
def guardar_odontograma(
    paciente_id: int, items: list[OdontogramaItem], db: Session = Depends(get_db)
):
    """Upsert parcial: actualiza/agrega las piezas enviadas y conserva el resto."""
    if db.get(Paciente, paciente_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paciente no encontrado")
    for item in items:
        if item.estado not in ESTADOS_DIENTE:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Estado '{item.estado}' inválido. Válidos: {', '.join(ESTADOS_DIENTE)}",
            )
        existente = db.execute(
            select(Odontograma).where(
                Odontograma.paciente_id == paciente_id,
                Odontograma.diente == item.diente,
                Odontograma.superficie == item.superficie,
            )
        ).scalar_one_or_none()
        if existente:
            existente.estado = item.estado
            existente.notas = item.notas
            existente.doctor_id = item.doctor_id
            existente.fecha = datetime.utcnow()
        else:
            db.add(
                Odontograma(
                    paciente_id=paciente_id,
                    diente=item.diente,
                    superficie=item.superficie,
                    estado=item.estado,
                    notas=item.notas,
                    doctor_id=item.doctor_id,
                )
            )
    db.commit()
    return obtener_odontograma(paciente_id, db)
