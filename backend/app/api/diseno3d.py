"""API de Diseno 3D Dental: catalogo, generacion de mallas y historial."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import DisenoProtesis, Paciente, Usuario
from app.services import diseno3d as svc

router = APIRouter(
    prefix="/api/diseno3d",
    tags=["Diseno 3D Dental"],
    dependencies=[Depends(get_current_user)],
)

_POR_CLAVE = {p["clave"]: p for p in svc.CATALOGO}


class GenerarDisenoIn(BaseModel):
    tipo: str
    estilo: str | None = None
    ancho: float | None = None
    alto: float | None = None
    profundidad: float | None = None
    paciente_id: int | None = None
    empresa_id: int | None = None


@router.get("/catalogo")
def catalogo():
    """Piezas disponibles con sus estilos y medidas por defecto."""
    return {"piezas": svc.CATALOGO}


@router.post("/generar", status_code=status.HTTP_201_CREATED)
def generar(
    datos: GenerarDisenoIn,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    """Genera la malla de la pieza, guarda el STL y registra el diseno."""
    pieza = _POR_CLAVE.get(datos.tipo)
    if pieza is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Tipo de pieza invalido: {datos.tipo}")

    def_med = pieza["medidas"]
    ancho = datos.ancho or def_med["ancho"]
    alto = datos.alto or def_med["alto"]
    profundidad = datos.profundidad or def_med["profundidad"]
    estilo = datos.estilo or pieza["estilos"][0]

    geo = svc.generar(datos.tipo, estilo, ancho, alto, profundidad)

    registro = DisenoProtesis(
        empresa_id=datos.empresa_id or (user.empresa_id if hasattr(user, "empresa_id") else 1),
        paciente_id=datos.paciente_id,
        tipo=datos.tipo,
        estilo=estilo,
        ancho=ancho,
        alto=alto,
        profundidad=profundidad,
        archivo=geo["archivo"],
        metricas=geo["metricas"],
        creado_por_id=user.id,
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)

    return {
        "id": registro.id,
        "tipo": datos.tipo,
        "estilo": estilo,
        "paciente_id": registro.paciente_id,
        "ancho": ancho,
        "alto": alto,
        "profundidad": profundidad,
        "url_stl": geo["url_stl"],
        "vertices": geo["vertices"],
        "faces": geo["faces"],
        "colors": geo["colors"],
        "metricas": geo["metricas"],
    }


@router.get("/historial")
def historial(
    empresa_id: int | None = Query(default=None),
    paciente_id: int | None = Query(default=None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Disenos guardados, mas recientes primero. Filtra por empresa y/o paciente."""
    stmt = select(DisenoProtesis).options(joinedload(DisenoProtesis.paciente))
    if empresa_id:
        stmt = stmt.where(DisenoProtesis.empresa_id == empresa_id)
    if paciente_id:
        stmt = stmt.where(DisenoProtesis.paciente_id == paciente_id)
    stmt = stmt.order_by(DisenoProtesis.id.desc()).offset(skip).limit(limit)
    filas = db.execute(stmt).scalars().all()
    return [
        {
            "id": d.id,
            "tipo": d.tipo,
            "estilo": d.estilo,
            "paciente": d.paciente.nombre_completo if d.paciente else None,
            "paciente_id": d.paciente_id,
            "ancho": float(d.ancho or 0),
            "alto": float(d.alto or 0),
            "profundidad": float(d.profundidad or 0),
            "url_stl": d.url,
            "metricas": d.metricas,
            "creado_en": d.creado_en.isoformat() if d.creado_en else None,
        }
        for d in filas
    ]


@router.get("/{diseno_id}/geometria")
def geometria(diseno_id: int, db: Session = Depends(get_db)):
    """Reconstruye la geometria de un diseno guardado (misma forma determinista)."""
    d = db.get(DisenoProtesis, diseno_id)
    if d is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Diseno no encontrado")
    geo = svc.generar(d.tipo, d.estilo, float(d.ancho), float(d.alto), float(d.profundidad))
    return {
        "id": d.id,
        "tipo": d.tipo,
        "estilo": d.estilo,
        "paciente_id": d.paciente_id,
        "paciente": d.paciente.nombre_completo if d.paciente else None,
        "url_stl": d.url,
        "vertices": geo["vertices"],
        "faces": geo["faces"],
        "colors": geo["colors"],
        "metricas": geo["metricas"],
    }
