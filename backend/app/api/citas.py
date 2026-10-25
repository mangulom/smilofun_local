from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import ESTADOS_CITA, Cita, Doctor, Paciente, Sucursal, Usuario
from app.schemas import CitaCreate, CitaOut, CitaUpdate, EstadoCitaUpdate

router = APIRouter(
    prefix="/api/citas",
    tags=["Citas"],
    dependencies=[Depends(get_current_user)],
)

_CARGABLES = ["programada", "confirmada", "en_atencion"]


def _cargar(stmt):
    return stmt.options(selectinload(Cita.paciente), selectinload(Cita.doctor))


def _validar_solape(db: Session, data: CitaCreate | CitaUpdate, cita_id: int | None = None):
    """Evita doble asignación de un doctor en el mismo horario."""
    doctor_id = data.doctor_id
    fecha = data.fecha
    inicio = data.hora_inicio
    fin = data.hora_fin
    if not (doctor_id and fecha and inicio and fin):
        return
    if fin <= inicio:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "hora_fin debe ser posterior a hora_inicio")
    stmt = select(Cita).where(
        Cita.doctor_id == doctor_id,
        Cita.fecha == fecha,
        Cita.estado.in_(_CARGABLES),
        Cita.hora_inicio < fin,
        Cita.hora_fin > inicio,
    )
    if cita_id:
        stmt = stmt.where(Cita.id != cita_id)
    if db.execute(stmt).first():
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "El doctor ya tiene una cita en ese horario",
        )


@router.get("", response_model=list[CitaOut])
def listar(
    fecha: date | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    doctor_id: int | None = None,
    paciente_id: int | None = None,
    empresa_id: int | None = None,
    estado: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    stmt = _cargar(select(Cita))
    if empresa_id:
        stmt = stmt.where(Cita.empresa_id == empresa_id)
    if fecha:
        stmt = stmt.where(Cita.fecha == fecha)
    if desde:
        stmt = stmt.where(Cita.fecha >= desde)
    if hasta:
        stmt = stmt.where(Cita.fecha <= hasta)
    if doctor_id:
        stmt = stmt.where(Cita.doctor_id == doctor_id)
    if paciente_id:
        stmt = stmt.where(Cita.paciente_id == paciente_id)
    if estado:
        stmt = stmt.where(Cita.estado == estado)
    return (
        db.execute(stmt.order_by(Cita.fecha, Cita.hora_inicio).offset(skip).limit(limit))
        .scalars()
        .unique()
        .all()
    )


@router.post("", response_model=CitaOut, status_code=status.HTTP_201_CREATED)
def crear(data: CitaCreate, db: Session = Depends(get_db)):
    if data.estado not in ESTADOS_CITA:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Estado inválido")
    if db.get(Paciente, data.paciente_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paciente no encontrado")
    if db.get(Doctor, data.doctor_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor no encontrado")
    if db.get(Sucursal, data.sucursal_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sucursal no encontrada")
    _validar_solape(db, data)
    payload = data.model_dump()
    payload["empresa_id"] = payload.get("empresa_id") or 1
    cita = Cita(**payload)
    db.add(cita)
    db.commit()
    return db.execute(_cargar(select(Cita)).where(Cita.id == cita.id)).scalar_one()


@router.get("/{cita_id}", response_model=CitaOut)
def obtener(cita_id: int, db: Session = Depends(get_db)):
    cita = db.execute(_cargar(select(Cita)).where(Cita.id == cita_id)).scalar_one_or_none()
    if cita is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada")
    return cita


@router.put("/{cita_id}", response_model=CitaOut)
def actualizar(cita_id: int, data: CitaUpdate, db: Session = Depends(get_db)):
    cita = db.get(Cita, cita_id)
    if cita is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada")
    cambios = data.model_dump(exclude_unset=True)
    if "estado" in cambios and cambios["estado"] not in ESTADOS_CITA:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Estado inválido")
    _validar_solape(db, data, cita_id=cita_id)
    for key, value in cambios.items():
        setattr(cita, key, value)
    db.commit()
    return db.execute(_cargar(select(Cita)).where(Cita.id == cita_id)).scalar_one()


@router.patch("/{cita_id}/estado", response_model=CitaOut)
def cambiar_estado(cita_id: int, data: EstadoCitaUpdate, db: Session = Depends(get_db)):
    cita = db.get(Cita, cita_id)
    if cita is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada")
    if data.estado not in ESTADOS_CITA:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Estado inválido")
    cita.estado = data.estado
    db.commit()
    return db.execute(_cargar(select(Cita)).where(Cita.id == cita_id)).scalar_one()


@router.delete("/{cita_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(cita_id: int, db: Session = Depends(get_db)):
    cita = db.get(Cita, cita_id)
    if cita is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada")
    db.delete(cita)
    db.commit()
