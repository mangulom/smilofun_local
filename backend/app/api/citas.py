from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_empresa_access
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
    user: Usuario = Depends(get_current_user),
):
    stmt = _cargar(select(Cita))
    assigned = {x.empresa_id for x in user.empresas_link}
    if empresa_id is not None:
        require_empresa_access(empresa_id, user)
        stmt = stmt.where(Cita.empresa_id == empresa_id)
    elif assigned:
        stmt = stmt.where(Cita.empresa_id.in_(assigned))
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
def crear(data: CitaCreate, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    if data.estado not in ESTADOS_CITA:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Estado inválido")
    paciente = db.get(Paciente, data.paciente_id)
    if paciente is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paciente no encontrado")
    empresa_id = data.empresa_id or paciente.empresa_id
    if empresa_id is not None:
        require_empresa_access(empresa_id, user)
    _validar_solape(db, data)
    doctor = db.get(Doctor, data.doctor_id)
    sucursal = db.get(Sucursal, data.sucursal_id)
    if doctor is None or sucursal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor o sede no encontrados")
    if doctor.empresa_id and doctor.empresa_id != empresa_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El doctor pertenece a otra empresa")
    if sucursal.empresa_id and sucursal.empresa_id != empresa_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La sede pertenece a otra empresa")
    payload = data.model_dump()
    payload["empresa_id"] = empresa_id or 1
    cita = Cita(**payload)
    db.add(cita)
    db.commit()
    return db.execute(_cargar(select(Cita)).where(Cita.id == cita.id)).scalar_one()


@router.get("/{cita_id}", response_model=CitaOut)
def obtener(cita_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    cita = db.execute(_cargar(select(Cita)).where(Cita.id == cita_id)).scalar_one_or_none()
    if cita is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada")
    require_empresa_access(cita.empresa_id, user)
    return cita


@router.put("/{cita_id}", response_model=CitaOut)
def actualizar(cita_id: int, data: CitaUpdate, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    cita = db.get(Cita, cita_id)
    if cita is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada")
    require_empresa_access(cita.empresa_id, user)
    cambios = data.model_dump(exclude_unset=True)
    cambios.pop("empresa_id", None)
    for attr, model, field in (("paciente_id", Paciente, "empresa_id"), ("doctor_id", Doctor, "empresa_id"), ("sucursal_id", Sucursal, "empresa_id")):
        if attr in cambios and cambios[attr] is not None:
            relacionado = db.get(model, cambios[attr])
            if relacionado is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"{attr} no encontrado")
            require_empresa_access(getattr(relacionado, field), user)
            if getattr(relacionado, field) and getattr(relacionado, field) != cita.empresa_id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se puede mover una cita a otra empresa")
    if "estado" in cambios and cambios["estado"] not in ESTADOS_CITA:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Estado inválido")
    _validar_solape(db, data, cita_id=cita_id)
    for key, value in cambios.items():
        setattr(cita, key, value)
    db.commit()
    return db.execute(_cargar(select(Cita)).where(Cita.id == cita_id)).scalar_one()


@router.patch("/{cita_id}/estado", response_model=CitaOut)
def cambiar_estado(cita_id: int, data: EstadoCitaUpdate, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    cita = db.get(Cita, cita_id)
    if cita is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada")
    require_empresa_access(cita.empresa_id, user)
    if data.estado not in ESTADOS_CITA:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Estado inválido")
    cita.estado = data.estado
    db.commit()
    return db.execute(_cargar(select(Cita)).where(Cita.id == cita_id)).scalar_one()


@router.delete("/{cita_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(cita_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    cita = db.get(Cita, cita_id)
    if cita is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada")
    require_empresa_access(cita.empresa_id, user)
    db.delete(cita)
    db.commit()
