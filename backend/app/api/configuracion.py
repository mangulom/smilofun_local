from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import hash_password
from app.models import (
    ESTADOS_CITA,
    ESTADOS_DIENTE,
    ESTADOS_FACTURA,
    ESTADOS_PLAN,
    METODOS_PAGO,
    SUPERFICIES_DIENTE,
    Configuracion,
    Doctor,
    Empresa,
    Rol,
    Sucursal,
    Usuario,
    UsuarioEmpresa,
)
from app.schemas import (
    ConfiguracionOut,
    ConfiguracionUpdate,
    DoctorOut,
    EmpresaCreate,
    EmpresaOut,
    EmpresaUpdate,
    RolOut,
    SucursalCreate,
    SucursalOut,
    SucursalUpdate,
    UsuarioCreate,
    UsuarioUpdate,
)

router = APIRouter(
    prefix="/api",
    tags=["Configuración"],
    dependencies=[Depends(get_current_user)],
)


# --- Sucursales (centros odontológicos) ---
@router.get("/sucursales", response_model=list[SucursalOut])
def listar_sucursales(db: Session = Depends(get_db)):
    return db.execute(select(Sucursal).order_by(Sucursal.nombre)).scalars().all()


@router.post("/sucursales", response_model=SucursalOut, status_code=status.HTTP_201_CREATED)
def crear_sucursal(data: SucursalCreate, db: Session = Depends(get_db)):
    obj = Sucursal(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/sucursales/{sucursal_id}", response_model=SucursalOut)
def actualizar_sucursal(
    sucursal_id: int, data: SucursalUpdate, db: Session = Depends(get_db)
):
    obj = db.get(Sucursal, sucursal_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sucursal no encontrada")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


# --- Configuración clave/valor ---
@router.get("/configuraciones", response_model=list[ConfiguracionOut])
def listar_configuraciones(db: Session = Depends(get_db)):
    return db.execute(select(Configuracion).order_by(Configuracion.clave)).scalars().all()


@router.put("/configuraciones", response_model=list[ConfiguracionOut])
def guardar_configuraciones(items: list[ConfiguracionUpdate], db: Session = Depends(get_db)):
    for item in items:
        existente = db.execute(
            select(Configuracion).where(Configuracion.clave == item.clave)
        ).scalar_one_or_none()
        if existente:
            existente.valor = item.valor
            if item.descripcion is not None:
                existente.descripcion = item.descripcion
        else:
            db.add(
                Configuracion(clave=item.clave, valor=item.valor, descripcion=item.descripcion)
            )
    db.commit()
    return db.execute(select(Configuracion).order_by(Configuracion.clave)).scalars().all()


# --- Empresas (multiempresa) ---
@router.get("/empresas", response_model=list[EmpresaOut])
def listar_empresas(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return (
        db.execute(select(Empresa).order_by(Empresa.nombre).offset(skip).limit(limit))
        .scalars()
        .all()
    )


@router.post("/empresas", response_model=EmpresaOut, status_code=status.HTTP_201_CREATED)
def crear_empresa(data: EmpresaCreate, db: Session = Depends(get_db)):
    if (
        db.execute(
            select(Empresa).where(func.lower(Empresa.nombre) == data.nombre.lower())
        ).scalar_one_or_none()
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una empresa con ese nombre")
    obj = Empresa(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/empresas/{empresa_id}", response_model=EmpresaOut)
def actualizar_empresa(empresa_id: int, data: EmpresaUpdate, db: Session = Depends(get_db)):
    obj = db.get(Empresa, empresa_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Empresa no encontrada")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/empresas/{empresa_id}")
def eliminar_empresa(empresa_id: int, db: Session = Depends(get_db)):
    obj = db.get(Empresa, empresa_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Empresa no encontrada")
    if db.query(UsuarioEmpresa).filter_by(empresa_id=empresa_id).first():
        raise HTTPException(
            status.HTTP_409_CONFLICT, "No se puede eliminar: hay usuarios vinculados"
        )
    db.delete(obj)
    db.commit()
    return {"ok": True, "id": empresa_id}


# --- Equipo / usuarios (CRUD) ---
@router.get("/usuarios")
def listar_usuarios(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    usuarios = db.execute(select(Usuario).order_by(Usuario.nombre).offset(skip).limit(limit)).scalars().all()
    return [_usuario_dict(u) for u in usuarios]


@router.post("/usuarios", status_code=status.HTTP_201_CREATED)
def crear_usuario(data: UsuarioCreate, db: Session = Depends(get_db)):
    existe = db.execute(
        select(Usuario).where(func.lower(Usuario.email) == data.email.lower())
    ).scalar_one_or_none()
    if existe:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un usuario con ese correo")
    if db.get(Rol, data.rol_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El rol indicado no existe")
    if data.doctor_id is not None and db.get(Doctor, data.doctor_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El doctor indicado no existe")
    empresa_ids = data.empresa_ids or []
    for eid in empresa_ids:
        if db.get(Empresa, eid) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "La empresa indicada no existe")

    obj = Usuario(
        email=data.email.strip().lower(),
        nombre=data.nombre.strip(),
        password_hash=hash_password(data.password),
        rol_id=data.rol_id,
        doctor_id=data.doctor_id,
        activo=data.activo,
    )
    db.add(obj)
    db.flush()
    for eid in (empresa_ids or [1]):
        db.add(
            UsuarioEmpresa(
                usuario_id=obj.id, empresa_id=eid, principal=eid == (empresa_ids[0] if empresa_ids else 1)
            )
        )
    db.commit()
    db.refresh(obj)
    return _usuario_dict(obj)


@router.put("/usuarios/{usuario_id}")
def actualizar_usuario(
    usuario_id: int,
    data: UsuarioUpdate,
    db: Session = Depends(get_db),
    actual: Usuario = Depends(get_current_user),
):
    obj = db.get(Usuario, usuario_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")

    cambios = data.model_dump(exclude_unset=True)

    if "email" in cambios and cambios["email"]:
        duplicado = db.execute(
            select(Usuario).where(
                func.lower(Usuario.email) == cambios["email"].lower(),
                Usuario.id != usuario_id,
            )
        ).scalar_one_or_none()
        if duplicado:
            raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un usuario con ese correo")
        cambios["email"] = cambios["email"].strip().lower()

    if cambios.get("rol_id") is not None and db.get(Rol, cambios["rol_id"]) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El rol indicado no existe")
    if cambios.get("doctor_id") is not None and db.get(Doctor, cambios["doctor_id"]) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El doctor indicado no existe")

    # Desactivarse a uno mismo dejaría la sesión sin usuario válido
    if usuario_id == actual.id and cambios.get("activo") is False:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes desactivar tu propio usuario")

    password = cambios.pop("password", None)
    empresa_ids = cambios.pop("empresa_ids", None)

    for key, value in cambios.items():
        setattr(obj, key, value)
    if password:
        obj.password_hash = hash_password(password)

    if empresa_ids is not None:
        for eid in empresa_ids:
            if db.get(Empresa, eid) is None:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "La empresa indicada no existe")
        if not empresa_ids:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "El usuario debe pertenecer al menos a una empresa"
            )
        db.query(UsuarioEmpresa).filter_by(usuario_id=usuario_id).delete()
        for eid in empresa_ids:
            db.add(
                UsuarioEmpresa(
                    usuario_id=usuario_id, empresa_id=eid, principal=eid == empresa_ids[0]
                )
            )

    db.commit()
    db.refresh(obj)
    return _usuario_dict(obj)


@router.delete("/usuarios/{usuario_id}")
def eliminar_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    actual: Usuario = Depends(get_current_user),
):
    obj = db.get(Usuario, usuario_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    if usuario_id == actual.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes eliminar tu propio usuario")
    db.delete(obj)
    db.commit()
    return {"ok": True, "id": usuario_id}


def _usuario_dict(u: Usuario) -> dict:
    enlaces = sorted(u.empresas_link, key=lambda e: (not e.principal, e.empresa_id))
    empresas = [
        {
            "id": e.empresa.id,
            "nombre": e.empresa.nombre,
            "principal": e.principal,
        }
        for e in enlaces
        if e.empresa is not None
    ]
    return {
        "id": u.id,
        "email": u.email,
        "nombre": u.nombre,
        "activo": u.activo,
        "rol": u.rol.nombre if u.rol else None,
        "rol_id": u.rol_id,
        "doctor_id": u.doctor_id,
        "doctor": u.doctor.nombre_completo if u.doctor else None,
        "creado_en": u.creado_en.isoformat() if u.creado_en else None,
        "empresa_id": empresas[0]["id"] if empresas else None,
        "empresas": empresas,
    }


@router.get("/roles", response_model=list[RolOut])
def listar_roles(db: Session = Depends(get_db)):
    return db.execute(select(Rol)).scalars().all()


@router.get("/doctores-activos", response_model=list[DoctorOut])
def doctores_activos(db: Session = Depends(get_db)):
    return db.execute(
        select(Doctor).where(Doctor.activo.is_(True)).order_by(Doctor.apellidos)
    ).scalars().all()


# --- Catálogos para el frontend ---
@router.get("/catalogos")
def catalogos():
    return {
        "estados_cita": ESTADOS_CITA,
        "estados_diente": ESTADOS_DIENTE,
        "superficies_diente": SUPERFICIES_DIENTE,
        "estados_plan": ESTADOS_PLAN,
        "estados_factura": ESTADOS_FACTURA,
        "metodos_pago": METODOS_PAGO,
    }
