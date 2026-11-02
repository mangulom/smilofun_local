from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, require_empresa_access, require_roles
from app.core.database import get_db
from app.models import Cita, Doctor, Sucursal, Usuario
from app.schemas import CitaOut, DoctorCreate, DoctorOut, DoctorUpdate

router = APIRouter(
    prefix="/api/doctores",
    tags=["Doctores"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[DoctorOut])
def listar(
    sucursal_id: int | None = None,
    empresa_id: int | None = None,
    activo: bool | None = True,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    stmt = select(Doctor)
    assigned = {x.empresa_id for x in user.empresas_link}
    if empresa_id is not None:
        require_empresa_access(empresa_id, user)
        stmt = stmt.where(Doctor.empresa_id == empresa_id)
    elif assigned:
        stmt = stmt.where(Doctor.empresa_id.in_(assigned))
    if sucursal_id:
        stmt = stmt.where(Doctor.sucursal_id == sucursal_id)
    if activo is not None:
        stmt = stmt.where(Doctor.activo == activo)
    return db.execute(stmt.order_by(Doctor.apellidos).offset(skip).limit(limit)).scalars().all()


@router.post("", response_model=DoctorOut, status_code=status.HTTP_201_CREATED)
def crear(data: DoctorCreate, db: Session = Depends(get_db), user: Usuario = Depends(require_roles("admin"))):
    sucursal = db.get(Sucursal, data.sucursal_id)
    if sucursal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sucursal no encontrada")
    empresa_id = data.empresa_id or sucursal.empresa_id or (user.empresas_link[0].empresa_id if user.empresas_link else 1)
    require_empresa_access(empresa_id, user)
    if sucursal.empresa_id and sucursal.empresa_id != empresa_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La sede pertenece a otra empresa")
    if data.email:
        existe = db.execute(select(Doctor).where(Doctor.email == data.email)).scalar_one_or_none()
        if existe:
            raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un doctor con ese email")
    payload = data.model_dump()
    payload["empresa_id"] = empresa_id
    doctor = Doctor(**payload)
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return doctor


@router.get("/{doctor_id}", response_model=DoctorOut)
def obtener(doctor_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor no encontrado")
    require_empresa_access(doctor.empresa_id, user)
    return doctor


@router.put("/{doctor_id}", response_model=DoctorOut)
def actualizar(doctor_id: int, data: DoctorUpdate, db: Session = Depends(get_db), user: Usuario = Depends(require_roles("admin"))):
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor no encontrado")
    require_empresa_access(doctor.empresa_id, user)
    cambios = data.model_dump(exclude_unset=True)
    cambios.pop("empresa_id", None)
    for key, value in cambios.items():
        setattr(doctor, key, value)
    db.commit()
    db.refresh(doctor)
    return doctor


@router.delete("/{doctor_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(doctor_id: int, db: Session = Depends(get_db), user: Usuario = Depends(require_roles("admin"))):
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor no encontrado")
    require_empresa_access(doctor.empresa_id, user)
    doctor.activo = False
    db.commit()


@router.get("/{doctor_id}/agenda", response_model=list[CitaOut])
def agenda(
    doctor_id: int,
    fecha: date | None = Query(None, description="Fecha puntual (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    doctor = db.get(Doctor, doctor_id)
    if doctor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor no encontrado")
    require_empresa_access(doctor.empresa_id, user)
    stmt = (
        select(Cita)
        .options(selectinload(Cita.paciente), selectinload(Cita.doctor))
        .where(Cita.doctor_id == doctor_id)
    )
    if fecha:
        stmt = stmt.where(Cita.fecha == fecha)
    return (
        db.execute(stmt.order_by(Cita.fecha, Cita.hora_inicio)).scalars().unique().all()
    )
