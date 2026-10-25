from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Cita, Paciente, PrediccionIA
from app.schemas import (
    NoShowPrediccion,
    PacienteRiesgo,
    PrediccionOut,
    ProyeccionIngresos,
    RecomendacionIA,
    ResumenIAOut,
)
from app.services import ia as ia_service

router = APIRouter(
    prefix="/api/ia",
    tags=["Inteligencia Artificial"],
    dependencies=[Depends(get_current_user)],
)


@router.post("/entrenar")
def entrenar(
    empresa_id: int | None = Query(default=None, description="Limita las predicciones guardadas por empresa"),
    db: Session = Depends(get_db),
):
    """(Re)entrena los modelos con el histórico de la clínica.

    Además guarda en `predicciones_ia` la tanda de predicciones de no-show de
    las próximas dos semanas y la proyección de ingresos, para que el
    historial de predicciones quede documentado.
    """
    métricas = ia_service.entrenar(db)

    hoy = date.today()
    citas = (
        db.execute(
            select(Cita)
            .where(
                Cita.fecha >= hoy,
                Cita.fecha <= hoy + timedelta(days=14),
                Cita.estado.in_(["programada", "confirmada"]),
                *([Cita.empresa_id == empresa_id] if empresa_id else []),
            )
            .order_by(Cita.fecha, Cita.hora_inicio)
            .limit(100)
        )
        .scalars()
        .all()
    )
    guardadas = 0
    for cita in citas:
        pred = ia_service.predecir_no_show(db, cita)
        db.add(
            PrediccionIA(
                tipo="no_show",
                fecha_objeto=cita.fecha,
                entidad_tipo="cita",
                entidad_id=cita.id,
                cita_id=cita.id,
                paciente_id=pred["paciente_id"],
                probabilidad=pred["probabilidad"],
                clasificacion=pred["riesgo"],
                detalles={
                    "factores": pred["factores"],
                    "recomendacion": pred["recomendacion"],
                    "paciente": pred["paciente"],
                    "hora": pred["hora"],
                },
            )
        )
        guardadas += 1

    for p in ia_service.proyectar_ingresos(db, meses=3, empresa_id=empresa_id):
        anio, mes = (int(x) for x in p["mes"].split("-"))
        db.add(
            PrediccionIA(
                tipo="ingreso",
                fecha_objeto=date(anio, mes, 1),
                valor=float(p["proyectado"]),
                clasificacion=p["tendencia"],
                detalles={"mes": p["mes"], "confianza": p["confianza"]},
            )
        )
        guardadas += 1

    db.commit()
    métricas["predicciones_guardadas"] = guardadas
    return métricas


@router.get("/metricas")
def metricas():
    return ia_service.metricas_modelo()


@router.get("/no-show", response_model=list[NoShowPrediccion])
def no_show_proximos(
    dias: int = Query(7, ge=1, le=60),
    min_probabilidad: float = Query(0.0, ge=0.0, le=1.0),
    empresa_id: int | None = Query(default=None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Riesgo de inasistencia de las próximas citas programadas."""
    hoy = date.today()
    citas = (
        db.execute(
            select(Cita)
            .where(
                Cita.fecha >= hoy,
                Cita.fecha <= hoy + timedelta(days=dias),
                Cita.estado.in_(["programada", "confirmada"]),
                *([Cita.empresa_id == empresa_id] if empresa_id else []),
            )
            .order_by(Cita.fecha, Cita.hora_inicio)
        )
        .scalars()
        .all()
    )
    salida: list[NoShowPrediccion] = []
    for cita in citas:
        pred = ia_service.predecir_no_show(db, cita)
        if pred["probabilidad"] >= min_probabilidad:
            salida.append(NoShowPrediccion(**pred))
    salida.sort(key=lambda p: -p.probabilidad)
    return salida[skip : skip + limit]


@router.get("/no-show/{cita_id}", response_model=NoShowPrediccion)
def no_show_cita(cita_id: int, db: Session = Depends(get_db)):
    """Predicción para una cita puntual (se persiste en predicciones_ia)."""
    cita = db.get(Cita, cita_id)
    if cita is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada")
    pred = ia_service.predecir_no_show(db, cita)
    db.add(
        PrediccionIA(
            tipo="no_show",
            fecha_objeto=cita.fecha,
            entidad_tipo="cita",
            entidad_id=cita.id,
            cita_id=cita.id,
            paciente_id=cita.paciente_id,
            probabilidad=pred["probabilidad"],
            clasificacion=pred["riesgo"],
            detalles={"factores": pred["factores"], "recomendacion": pred["recomendacion"]},
        )
    )
    db.commit()
    return NoShowPrediccion(**pred)


@router.get("/proyeccion-ingresos")
def proyeccion_ingresos(
    meses: int = Query(3, ge=1, le=12),
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    serie = ia_service.proyectar_ingresos(db, meses=meses, empresa_id=empresa_id)
    ultimo = serie[-1] if serie else {"tendencia": "estable", "confianza": 0}
    return {
        "proyecciones": serie,
        "tendencia": ultimo["tendencia"],
        "confianza": ultimo["confianza"],
    }


@router.get("/pacientes-riesgo", response_model=list[PacienteRiesgo])
def pacientes_riesgo(
    limite: int = Query(10, ge=1, le=50),
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return ia_service.pacientes_en_riesgo(db, limite=limite, empresa_id=empresa_id)


@router.get("/recomendaciones", response_model=list[RecomendacionIA])
def recomendaciones(
    limite: int = Query(10, ge=1, le=30),
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    return ia_service.recomendaciones(db, limite=limite, empresa_id=empresa_id)


@router.get("/resumen", response_model=ResumenIAOut)
def resumen(
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    hoy = date.today()
    citas = (
        db.execute(
            select(Cita)
            .where(
                Cita.fecha >= hoy,
                Cita.fecha <= hoy + timedelta(days=14),
                Cita.estado.in_(["programada", "confirmada"]),
                *([Cita.empresa_id == empresa_id] if empresa_id else []),
            )
            .order_by(Cita.fecha, Cita.hora_inicio)
            .limit(40)
        )
        .scalars()
        .all()
    )
    no_shows = [
        NoShowPrediccion(**ia_service.predecir_no_show(db, c))
        for c in citas
    ]
    no_shows.sort(key=lambda p: -p.probabilidad)
    riesgo_alto = [n for n in no_shows if n.riesgo != "bajo"][:6]
    riesgo_pacientes = [
        PacienteRiesgo(**r)
        for r in ia_service.pacientes_en_riesgo(db, limite=6, empresa_id=empresa_id)
    ]
    proy = [
        ProyeccionIngresos(**p)
        for p in ia_service.proyectar_ingresos(db, meses=3, empresa_id=empresa_id)
    ]
    recs = [
        RecomendacionIA(**r)
        for r in ia_service.recomendaciones(db, limite=8, empresa_id=empresa_id)
    ]
    total_pacientes = db.scalar(
        select(func.count(Paciente.id)).where(
            *([Paciente.empresa_id == empresa_id] if empresa_id else [])
        )
    ) or 0
    return ResumenIAOut(
        generado_en=datetime.utcnow(),
        no_show_riesgo_alto=riesgo_alto,
        proyeccion_ingresos=proy,
        pacientes_riesgo=riesgo_pacientes,
        recomendaciones=recs,
        metricas_modelo=ia_service.metricas_modelo(),
        total_pacientes_evaluados=total_pacientes,
    )


@router.get("/predicciones", response_model=list[PrediccionOut])
def historial(
    tipo: str | None = None,
    limite: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(PrediccionIA)
    if tipo:
        stmt = stmt.where(PrediccionIA.tipo == tipo)
    return (
        db.execute(
            stmt.order_by(PrediccionIA.fecha_generacion.desc()).offset(skip).limit(limite)
        )
        .scalars()
        .all()
    )


# ---------------------------------------------------------------------------
# Analítica avanzada (nuevas herramientas IA)
# ---------------------------------------------------------------------------


class PreguntaIA(BaseModel):
    pregunta: str
    empresa_id: int | None = None


@router.get("/segmentacion")
def segmentacion(
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Segmentación RFM de pacientes: VIP, recurrentes, en riesgo de fuga…"""
    return ia_service.segmentar_pacientes(db, empresa_id=empresa_id)


@router.get("/demanda-citas")
def demanda_citas(
    dias: int = Query(14, ge=1, le=60),
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Pronóstico de demanda de citas por día de la semana."""
    return ia_service.demanda_citas(db, dias=dias, empresa_id=empresa_id)


@router.get("/inventario")
def inventario(
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Predicción de consumo y reposición de insumos."""
    return ia_service.prediccion_inventario(db, empresa_id=empresa_id)


@router.get("/agenda")
def agenda(
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Optimización de agenda: horas pico, franjas libres y recomendaciones."""
    return ia_service.optimizar_agenda(db, empresa_id=empresa_id)


@router.get("/anomalias")
def anomalias(
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Anomalías de facturación (z-score mensual y facturas atípicas)."""
    return ia_service.anomalias_facturacion(db, empresa_id=empresa_id)


@router.get("/rentabilidad")
def rentabilidad(
    limite: int = Query(12, ge=1, le=30),
    empresa_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Ranking de tratamientos por ingresos generados."""
    return ia_service.rentabilidad_tratamientos(db, empresa_id=empresa_id, limite=limite)


@router.post("/asistente")
def asistente(payload: PreguntaIA, db: Session = Depends(get_db)):
    """Asistente IA: responde preguntas sobre la clínica combinando las métricas."""
    return ia_service.asistente(db, payload.pregunta, empresa_id=payload.empresa_id)
