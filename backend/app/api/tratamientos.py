from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Doctor, Paciente, PlanTratamiento, PlanTratamientoItem, Tratamiento
from app.schemas import (
    PlanCreate,
    PlanOut,
    PlanUpdate,
    TratamientoCreate,
    TratamientoOut,
    TratamientoUpdate,
)

router = APIRouter(tags=["Tratamientos y planes"], dependencies=[Depends(get_current_user)])


# ---------------------------------------------------------------------------
# Catálogo de tratamientos
# ---------------------------------------------------------------------------
@router.get("/api/tratamientos", response_model=list[TratamientoOut])
def listar_tratamientos(
    activo: bool | None = None,
    empresa_id: int | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    stmt = select(Tratamiento)
    if empresa_id:
        stmt = stmt.where(Tratamiento.empresa_id == empresa_id)
    if activo is not None:
        stmt = stmt.where(Tratamiento.activo == activo)
    if search:
        stmt = stmt.where(func.lower(Tratamiento.nombre).like(f"%{search.lower()}%"))
    return (
        db.execute(stmt.order_by(Tratamiento.categoria, Tratamiento.nombre).offset(skip).limit(limit))
        .scalars()
        .all()
    )


@router.post(
    "/api/tratamientos",
    response_model=TratamientoOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_tratamiento(data: TratamientoCreate, db: Session = Depends(get_db)):
    payload = data.model_dump()
    payload["empresa_id"] = payload.get("empresa_id") or 1
    obj = Tratamiento(**payload)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/api/tratamientos/{tratamiento_id}", response_model=TratamientoOut)
def actualizar_tratamiento(
    tratamiento_id: int, data: TratamientoUpdate, db: Session = Depends(get_db)
):
    obj = db.get(Tratamiento, tratamiento_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tratamiento no encontrado")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/api/tratamientos/{tratamiento_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_tratamiento(tratamiento_id: int, db: Session = Depends(get_db)):
    obj = db.get(Tratamiento, tratamiento_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tratamiento no encontrado")
    obj.activo = False
    db.commit()


# ---------------------------------------------------------------------------
# Planes de tratamiento
# ---------------------------------------------------------------------------
def _calcular_totales(items_data, descuento: float):
    subtotal = sum(i["cantidad"] * float(i["precio_unitario"]) for i in items_data)
    total = max(subtotal - descuento, 0)
    return round(subtotal, 2), round(total, 2)


def _siguiente_codigo_plan(db: Session) -> str:
    total = db.scalar(select(func.count(PlanTratamiento.id))) or 0
    return f"PT-{total + 1:05d}"


def _plan_con_relaciones(db: Session, plan_id: int) -> PlanTratamiento:
    plan = db.execute(
        select(PlanTratamiento)
        .options(
            selectinload(PlanTratamiento.items),
            selectinload(PlanTratamiento.paciente),
            selectinload(PlanTratamiento.doctor),
        )
        .where(PlanTratamiento.id == plan_id)
    ).scalar_one_or_none()
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan no encontrado")
    return plan


@router.get("/api/planes", response_model=list[PlanOut])
def listar_planes(
    paciente_id: int | None = None,
    doctor_id: int | None = None,
    empresa_id: int | None = None,
    estado: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    stmt = select(PlanTratamiento).options(
        selectinload(PlanTratamiento.items),
        selectinload(PlanTratamiento.paciente),
        selectinload(PlanTratamiento.doctor),
    )
    if empresa_id:
        stmt = stmt.where(PlanTratamiento.empresa_id == empresa_id)
    if paciente_id:
        stmt = stmt.where(PlanTratamiento.paciente_id == paciente_id)
    if doctor_id:
        stmt = stmt.where(PlanTratamiento.doctor_id == doctor_id)
    if estado:
        stmt = stmt.where(PlanTratamiento.estado == estado)
    return (
        db.execute(stmt.order_by(PlanTratamiento.creado_en.desc()).offset(skip).limit(limit))
        .scalars()
        .unique()
        .all()
    )


@router.post("/api/planes", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
def crear_plan(data: PlanCreate, db: Session = Depends(get_db)):
    if not data.items:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "El plan debe tener al menos un item")
    if db.get(Paciente, data.paciente_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paciente no encontrado")
    if db.get(Doctor, data.doctor_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor no encontrado")
    items_data = [i.model_dump() for i in data.items]
    subtotal, total = _calcular_totales(items_data, data.descuento)
    plan = PlanTratamiento(
        codigo=_siguiente_codigo_plan(db),
        empresa_id=data.empresa_id or 1,
        paciente_id=data.paciente_id,
        doctor_id=data.doctor_id,
        notas=data.notas,
        descuento=data.descuento,
        subtotal=subtotal,
        total=total,
    )
    db.add(plan)
    db.flush()
    for item in items_data:
        sub = item["cantidad"] * float(item["precio_unitario"])
        db.add(PlanTratamientoItem(plan_id=plan.id, subtotal=round(sub, 2), **item))
    db.commit()
    return _plan_con_relaciones(db, plan.id)


def _reconstruir_items(db: Session, plan: PlanTratamiento, items_data: list[dict]):
    plan.items.clear()
    db.flush()
    for item in items_data:
        sub = item["cantidad"] * float(item["precio_unitario"])
        db.add(PlanTratamientoItem(plan_id=plan.id, subtotal=round(sub, 2), **item))


@router.patch("/api/planes/{plan_id}", response_model=PlanOut)
def actualizar_plan(plan_id: int, data: PlanUpdate, db: Session = Depends(get_db)):
    plan = _plan_con_relaciones(db, plan_id)
    cambios = data.model_dump(exclude_unset=True)
    if "estado" in cambios:
        plan.estado = cambios["estado"]
    if "notas" in cambios:
        plan.notas = cambios["notas"]
    if "descuento" in cambios:
        plan.descuento = cambios["descuento"]
    if "items" in cambios and cambios["items"] is not None:
        if not cambios["items"]:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "El plan debe tener al menos un item"
            )
        _reconstruir_items(db, plan, cambios["items"])
    items_data = [
        {
            "tratamiento_id": i.tratamiento_id,
            "diente": i.diente,
            "superficie": i.superficie,
            "descripcion": i.descripcion,
            "cantidad": i.cantidad,
            "precio_unitario": i.precio_unitario,
        }
        for i in plan.items
    ]
    plan.subtotal, plan.total = _calcular_totales(items_data, float(plan.descuento))
    db.commit()
    return _plan_con_relaciones(db, plan_id)


@router.get("/api/planes/{plan_id}", response_model=PlanOut)
def obtener_plan(plan_id: int, db: Session = Depends(get_db)):
    return _plan_con_relaciones(db, plan_id)


@router.delete("/api/planes/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.get(PlanTratamiento, plan_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan no encontrado")
    db.delete(plan)
    db.commit()
