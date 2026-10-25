"""Servicios de inteligencia de Dentamia.

Modelos ligeros entrenados con los datos históricos de la clínica:
- Clasificador de no-show (regresión logística)
- Proyección de ingresos (regresión lineal)
- Score de riesgo dental por paciente
- Recomendaciones basadas en reglas
"""
from __future__ import annotations

import threading
from datetime import date, datetime, timedelta

import numpy as np
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Cita,
    DetalleFactura,
    Doctor,
    Factura,
    MovimientoProducto,
    Odontograma,
    Paciente,
    Pago,
    PlanTratamiento,
    PlanTratamientoItem,
    Producto,
    Tratamiento,
)

_lock = threading.Lock()
_modelo_no_show: dict = {
    "model": None,
    "n_muestras": 0,
    "accuracy": None,
    "entrenado_en": None,
}

FEATURE_NAMES = [
    "día_semana",
    "hora",
    "días_de_anticipación",
    "tasa_historica_de_inasistencia",
    "edad",
    "citas_previas",
    "confirmada",
]


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def _edad(fecha_nac: date | None) -> int:
    if not fecha_nac:
        return 30
    hoy = date.today()
    return hoy.year - fecha_nac.year - ((hoy.month, hoy.day) < (fecha_nac.month, fecha_nac.day))


def _tasa_no_show(db: Session, paciente_id: int) -> tuple[float, int]:
    """Tasa de inasistencia del paciente (sin contar la cita actual)."""
    total = db.scalar(
        select(func.count(Cita.id)).where(
            Cita.paciente_id == paciente_id,
            Cita.estado.in_(["completada", "no_asistio"]),
        )
    ) or 0
    if total == 0:
        return 0.0, 0
    fallos = db.scalar(
        select(func.count(Cita.id)).where(
            Cita.paciente_id == paciente_id, Cita.estado == "no_asistio"
        )
    ) or 0
    return fallos / total, total


def _features_cita(cita: Cita, paciente: Paciente, tasa_previa: float, citas_previas: int) -> list[float]:
    creado = cita.creado_en.date() if cita.creado_en else cita.fecha
    anticipacion = max((cita.fecha - creado).days, 0)
    return [
        float(cita.fecha.weekday()),
        float(cita.hora_inicio.hour + cita.hora_inicio.minute / 60),
        float(min(anticipacion, 120)),
        float(tasa_previa),
        float(_edad(paciente.fecha_nacimiento)),
        float(min(citas_previas, 50)),
        1.0 if cita.estado == "confirmada" else 0.0,
    ]


# ---------------------------------------------------------------------------
# Entrenamiento del clasificador de no-show
# ---------------------------------------------------------------------------
def entrenar(db: Session) -> dict:
    """(Re)entrena el modelo con el histórico de citas."""
    filas = db.execute(
        select(Cita, Paciente)
        .join(Paciente, Cita.paciente_id == Paciente.id)
        .where(Cita.estado.in_(["completada", "no_asistio"]))
    ).all()
    X, y = [], []
    for cita, paciente in filas:
        tasa, previas = _tasa_no_show(db, paciente.id)
        X.append(_features_cita(cita, paciente, tasa, previas))
        y.append(1 if cita.estado == "no_asistio" else 0)

    métricas = {
        "muestras": len(X),
        "positivas": int(sum(y)),
        "modelo": "sin_entrenar",
        "accuracy": None,
    }
    if len(X) < 20 or len(set(y)) < 2:
        with _lock:
            _modelo_no_show["model"] = None
            _modelo_no_show["n_muestras"] = len(X)
            _modelo_no_show["accuracy"] = None
            _modelo_no_show["entrenado_en"] = datetime.utcnow()
        métricas["modelo"] = "reglas"  # fallback determinista
        return métricas

    Xa, ya = np.array(X), np.array(y)
    modelo = LogisticRegression(max_iter=1000, class_weight="balanced")
    Xtr, Xte, ytr, yte = train_test_split(Xa, ya, test_size=0.25, random_state=42, stratify=ya)
    modelo.fit(Xtr, ytr)
    accuracy = float(accuracy_score(yte, modelo.predict(Xte)))
    modelo.fit(Xa, ya)  # reentrena con todo el histórico para producción

    with _lock:
        _modelo_no_show["model"] = modelo
        _modelo_no_show["n_muestras"] = len(X)
        _modelo_no_show["accuracy"] = round(accuracy, 3)
        _modelo_no_show["entrenado_en"] = datetime.utcnow()
    métricas.update({"modelo": "regresion_logistica", "accuracy": round(accuracy, 3)})
    return métricas


def metricas_modelo() -> dict:
    with _lock:
        return {
            "modelo": "regresion_logistica"
            if _modelo_no_show["model"] is not None
            else "reglas",
            "muestras": _modelo_no_show["n_muestras"],
            "accuracy": _modelo_no_show["accuracy"],
            "entrenado_en": _modelo_no_show["entrenado_en"].isoformat()
            if _modelo_no_show["entrenado_en"]
            else None,
            "features": FEATURE_NAMES,
        }


# ---------------------------------------------------------------------------
# Predicción de no-show
# ---------------------------------------------------------------------------
def _score_reglas(feats: list[float]) -> tuple[float, list[str]]:
    """Fallback cuando no hay datos suficientes para entrenar."""
    dow, hora, anticipacion, tasa_previa, _edad_v, previas, confirmada = feats
    factores, p = [], 0.05
    if tasa_previa > 0:
        p += 0.45 * tasa_previa
        factores.append(f"Histórico de inasistencia del paciente: {tasa_previa:.0%}")
    if dow in (0, 5):  # lunes o sábado
        p += 0.08
        factores.append("Día de la semana con mayor inasistencia")
    if hora >= 17:
        p += 0.10
        factores.append("Cita en horario tarde")
    if anticipacion > 30:
        p += 0.10
        factores.append("Agendada con mucha anticipación (>30 días)")
    if previas == 0:
        p += 0.06
        factores.append("Paciente nuevo (sin visitas previas)")
    if confirmada:
        p -= 0.12
        factores.append("Cita confirmada por el paciente")
    return float(np.clip(p, 0.01, 0.95)), factores


def predecir_no_show(db: Session, cita: Cita) -> dict:
    paciente = db.get(Paciente, cita.paciente_id)
    if paciente is None:
        raise ValueError("Paciente no encontrado")
    tasa, previas = _tasa_no_show(db, paciente.id)
    feats = _features_cita(cita, paciente, tasa, previas)

    with _lock:
        modelo = _modelo_no_show["model"]
    factores: list[str] = []
    if modelo is not None:
        proba = float(modelo.predict_proba([feats])[0][1])
        coef = modelo.coef_[0]
        orden = np.argsort(-np.abs(coef))[:3]
        for i in orden:
            nombre = FEATURE_NAMES[i]
            if abs(coef[i]) > 0.01:
                signo = "incrementa" if coef[i] > 0 else "reduce"
                factores.append(f"{nombre} {signo} el riesgo")
        if not factores:
            factores.append("Combinación de factores de la cita")
    else:
        proba, factores = _score_reglas(feats)

    riesgo = "alto" if proba >= 0.5 else "medio" if proba >= 0.25 else "bajo"
    if riesgo == "alto":
        recomendacion = "Confirmar la cita por teléfono y enviar recordatorio 24 h antes."
    elif riesgo == "medio":
        recomendacion = "Enviar recordatorio por WhatsApp/correo 48 h antes."
    else:
        recomendacion = "Recordatorio automático estándar."
    return {
        "cita_id": cita.id,
        "paciente_id": paciente.id,
        "paciente": paciente.nombre_completo,
        "fecha": cita.fecha,
        "hora": cita.hora_inicio.strftime("%H:%M"),
        "probabilidad": round(proba, 4),
        "riesgo": riesgo,
        "factores": factores,
        "recomendacion": recomendacion,
    }


# ---------------------------------------------------------------------------
# Proyección de ingresos
# ---------------------------------------------------------------------------
def proyectar_ingresos(db: Session, meses: int = 3, empresa_id: int | None = None) -> list[dict]:
    hoy = date.today()
    meses_hist: list[tuple[str, float]] = []
    for i in range(11, -1, -1):
        anio, mes = hoy.year, hoy.month - i
        while mes <= 0:
            mes += 12
            anio -= 1
        inicio = date(anio, mes, 1)
        fin = (date(anio + (mes == 12), (mes % 12) + 1, 1)) - timedelta(days=1)
        fin = min(fin, hoy)
        total = float(
            db.scalar(
                select(func.coalesce(func.sum(Factura.total), 0)).where(
                    Factura.estado.in_(["pagada", "parcial"]),
                    func.date(Factura.fecha) >= inicio,
                    func.date(Factura.fecha) <= fin,
                    *([Factura.empresa_id == empresa_id] if empresa_id else []),
                )
            )
            or 0
        )
        meses_hist.append((inicio.strftime("%Y-%m"), round(total, 2)))

    salidas = []
    valores = [v for _, v in meses_hist]
    if len(valores) >= 3 and max(valores) > 0:
        X = np.arange(len(valores)).reshape(-1, 1)
        y = np.array(valores, dtype=float)
        reg = LinearRegression().fit(X, y)
        pred = reg.predict(np.arange(len(valores), len(valores) + meses).reshape(-1, 1))
        r2 = float(reg.score(X, y))
        pendiente = float(reg.coef_[0])
        tendencia = "creciente" if pendiente > 5 else "decreciente" if pendiente < -5 else "estable"
        ultimo_anio, ultimo_mes = hoy.year, hoy.month
        for k in range(meses):
            mes = ultimo_mes + k + 1
            anio = ultimo_anio
            while mes > 12:
                mes -= 12
                anio += 1
            salidas.append(
                {
                    "mes": f"{anio}-{mes:02d}",
                    "proyectado": round(float(pred[k]), 2),
                    "confianza": round(max(min(r2, 1.0), 0.0), 3),
                    "tendencia": tendencia,
                }
            )
    else:
        ultimo_anio, ultimo_mes = hoy.year, hoy.month
        for k in range(meses):
            mes = ultimo_mes + k + 1
            anio = ultimo_anio
            while mes > 12:
                mes -= 12
                anio += 1
            salidas.append(
                {
                    "mes": f"{anio}-{mes:02d}",
                    "proyectado": 0.0,
                    "confianza": 0.0,
                    "tendencia": "estable",
                }
            )
    return salidas


# ---------------------------------------------------------------------------
# Riesgo dental por paciente
# ---------------------------------------------------------------------------
def _clasificar(score: float) -> str:
    return "alto" if score >= 60 else "medio" if score >= 30 else "bajo"


def pacientes_en_riesgo(db: Session, limite: int = 10, empresa_id: int | None = None) -> list[dict]:
    pacientes = db.execute(
        select(Paciente)
        .where(
            Paciente.activo.is_(True),
            *([Paciente.empresa_id == empresa_id] if empresa_id else []),
        )
        .limit(500)
    ).scalars().all()
    resultados = []
    hoy = date.today()
    for pac in pacientes:
        motivos: list[str] = []
        score = 0.0
        piezas = db.execute(
            select(Odontograma.estado, func.count(Odontograma.id))
            .where(Odontograma.paciente_id == pac.id, Odontograma.estado != "sano")
            .group_by(Odontograma.estado)
        ).all()
        conteo = {r[0]: r[1] for r in piezas}
        caries = conteo.get("caries", 0)
        ausentes = conteo.get("ausente", 0)
        restauradas = conteo.get("restaurado", 0) + conteo.get("corona", 0) + conteo.get("endodoncia", 0)
        if caries:
            score += min(caries * 15, 45)
            motivos.append(f"{caries} pieza(s) con caries sin tratar")
        if ausentes:
            score += min(ausentes * 5, 15)
            motivos.append(f"{ausentes} pieza(s) ausente(s)")
        if restauradas >= 4:
            score += 8
            motivos.append(f"{restauradas} piezas restauradas (historial de caries)")

        ultima = db.scalar(
            select(func.max(Cita.fecha)).where(
                Cita.paciente_id == pac.id, Cita.estado == "completada"
            )
        )
        if ultima is None:
            score += 10
            motivos.append("Nunca ha completado una visita")
        else:
            dias = (hoy - ultima).days
            if dias > 365:
                score += 25
                motivos.append(f"Sin control odontológico desde hace {dias} días")
            elif dias > 180:
                score += 15
                motivos.append(f"Última visita hace {dias} días")
            elif dias > 90:
                score += 6
                motivos.append(f"Última visita hace {dias} días")

        tasa, previas = _tasa_no_show(db, pac.id)
        if tasa >= 0.34 and previas >= 3:
            score += 12
            motivos.append(f"Alta inasistencia a citas ({tasa:.0%})")

        score = min(round(score, 1), 100.0)
        if score >= 30:
            resultados.append(
                {
                    "paciente_id": pac.id,
                    "codigo": pac.codigo,
                    "nombre": pac.nombre_completo,
                    "score": score,
                    "riesgo": _clasificar(score),
                    "motivos": motivos,
                }
            )
    resultados.sort(key=lambda r: -r["score"])
    return resultados[:limite]


# ---------------------------------------------------------------------------
# Recomendaciones accionables
# ---------------------------------------------------------------------------
def recomendaciones(db: Session, limite: int = 10, empresa_id: int | None = None) -> list[dict]:
    hoy = date.today()
    out: list[dict] = []
    emp = (lambda modelo: [modelo.empresa_id == empresa_id] if empresa_id else [])

    # 1. Pacientes inactivos → recall
    limite_inactivo = hoy - timedelta(days=180)
    inactivos = db.execute(
        select(func.count(Cita.paciente_id))
        .join(Paciente, Paciente.id == Cita.paciente_id)
        .where(Paciente.activo.is_(True), *emp(Paciente))
        .group_by(Cita.paciente_id)
        .having(func.max(Cita.fecha) < limite_inactivo)
    ).all()
    if inactivos:
        out.append(
            {
                "tipo": "recall_pacientes",
                "prioridad": "media",
                "titulo": f"{len(inactivos)} paciente(s) sin visita en más de 6 meses",
                "descripcion": "Campaña de recall para reactivar pacientes dormidos y llenar la agenda.",
                "entidad_tipo": None,
                "entidad_id": None,
                "accion": "Crear campaña de recordatorios",
            }
        )

    # 2. Stock bajo
    bajos = db.execute(
        select(Producto).where(
            Producto.activo.is_(True),
            Producto.stock <= Producto.stock_minimo,
            *emp(Producto),
        )
    ).scalars().all()
    if bajos:
        nombres = ", ".join(p.nombre for p in bajos[:4])
        out.append(
            {
                "tipo": "stock_bajo",
                "prioridad": "alta",
                "titulo": f"{len(bajos)} insumo(s) con stock bajo",
                "descripcion": f"Reponer antes de agotarse: {nombres}.",
                "entidad_tipo": "producto",
                "entidad_id": bajos[0].id,
                "accion": "Ver inventario",
            }
        )

    # 3. Productos por vencer
    por_vencer = db.execute(
        select(Producto).where(
            Producto.activo.is_(True),
            Producto.fecha_vencimiento != None,  # noqa: E711
            Producto.fecha_vencimiento <= hoy + timedelta(days=30),
            *emp(Producto),
        )
    ).scalars().all()
    if por_vencer:
        out.append(
            {
                "tipo": "vencimientos",
                "prioridad": "alta",
                "titulo": f"{len(por_vencer)} insumo(s) próximo(s) a vencer",
                "descripcion": "Revisar uso o devolución para evitar merma.",
                "entidad_tipo": "producto",
                "entidad_id": por_vencer[0].id,
                "accion": "Ver inventario",
            }
        )

    # 4. Facturas con saldo pendiente
    pendientes = db.execute(
        select(Factura).where(Factura.estado == "parcial", *emp(Factura)).limit(50)
    ).scalars().all()
    if pendientes:
        saldo = 0.0
        for f in pendientes:
            pagado = float(
                db.scalar(
                    select(func.coalesce(func.sum(Pago.monto), 0)).where(Pago.factura_id == f.id)
                )
                or 0
            )
            saldo += float(f.total) - pagado
        if saldo > 0:
            out.append(
                {
                    "tipo": "cobranza",
                    "prioridad": "media",
                    "titulo": f"S/ {saldo:,.2f} por cobrar en {len(pendientes)} factura(s)",
                    "descripcion": "Facturas con pagos parciales: gestionar cobro.",
                    "entidad_tipo": "factura",
                    "entidad_id": pendientes[0].id,
                    "accion": "Ver facturación",
                }
            )

    # 5. Citas por confirmar (mañana)
    manana = hoy + timedelta(days=1)
    por_confirmar = db.scalar(
        select(func.count(Cita.id)).where(
            Cita.fecha == manana, Cita.estado == "programada", *emp(Cita)
        )
    ) or 0
    if por_confirmar:
        out.append(
            {
                "tipo": "confirmaciones",
                "prioridad": "alta",
                "titulo": f"{por_confirmar} cita(s) de mañana sin confirmar",
                "descripcion": "Confirmar hoy reduce el riesgo de inasistencia.",
                "entidad_tipo": "cita",
                "entidad_id": None,
                "accion": "Ver agenda",
            }
        )

    # 6. Planes propuestos sin respuesta
    planes = db.scalar(
        select(func.count(PlanTratamiento.id)).where(
            PlanTratamiento.estado == "propuesto",
            PlanTratamiento.creado_en <= datetime.utcnow() - timedelta(days=7),
            *emp(PlanTratamiento),
        )
    ) or 0
    if planes:
        out.append(
            {
                "tipo": "planes_pendientes",
                "prioridad": "media",
                "titulo": f"{planes} plan(es) de tratamiento sin aprobación",
                "descripcion": "Planes propuestos hace más de 7 días: hacer seguimiento comercial.",
                "entidad_tipo": "plan",
                "entidad_id": None,
                "accion": "Ver planes",
            }
        )

    orden = {"alta": 0, "media": 1, "baja": 2}
    out.sort(key=lambda r: orden.get(r["prioridad"], 3))
    return out[:limite]


# ---------------------------------------------------------------------------
# Segmentación de pacientes (RFM simplificado)
# ---------------------------------------------------------------------------
DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]

SEGMENTOS = [
    ("dormido", "Dormidos", "Sin visitas hace más de un año", "#dc2626"),
    ("riesgo_fuga", "En riesgo de fuga", "Sin visitas entre 6 y 12 meses", "#f59e0b"),
    ("vip", "VIP", "Alto gasto y recurrencia", "#7c3aed"),
    ("activo", "Activos", "Pacientes en seguimiento", "#0ea5e9"),
    ("nuevo", "Nuevos", "Sin visitas completadas o una sola", "#10b981"),
]


def segmentar_pacientes(db: Session, empresa_id: int | None = None) -> dict:
    """Agrupa a los pacientes en segmentos accionables (RFM simplificado)."""
    hoy = date.today()
    pacientes = (
        db.execute(
            select(Paciente)
            .where(
                Paciente.activo.is_(True),
                *([Paciente.empresa_id == empresa_id] if empresa_id else []),
            )
            .limit(500)
        )
        .scalars()
        .all()
    )
    filas: list[dict] = []
    for p in pacientes:
        completadas = db.scalar(
            select(func.count(Cita.id)).where(
                Cita.paciente_id == p.id, Cita.estado == "completada"
            )
        ) or 0
        gasto = float(
            db.scalar(
                select(func.coalesce(func.sum(Factura.total), 0)).where(
                    Factura.paciente_id == p.id,
                    Factura.estado.in_(["pagada", "parcial"]),
                )
            )
            or 0
        )
        ultima = db.scalar(
            select(func.max(Cita.fecha)).where(
                Cita.paciente_id == p.id, Cita.estado == "completada"
            )
        )
        filas.append(
            {
                "paciente_id": p.id,
                "codigo": p.codigo,
                "nombre": p.nombre_completo,
                "citas": int(completadas),
                "gasto": round(gasto, 2),
                "ultima": ultima.isoformat() if ultima else None,
                "dias": (hoy - ultima).days if ultima else None,
            }
        )

    gastos = [f["gasto"] for f in filas if f["gasto"] > 0]
    p80 = float(np.percentile(gastos, 80)) if gastos else 0.0

    for f in filas:
        dias = f["dias"]
        if dias is None:
            f["segmento"] = "nuevo" if f["citas"] == 0 else "riesgo_fuga"
        elif dias > 365:
            f["segmento"] = "dormido"
        elif dias > 180:
            f["segmento"] = "riesgo_fuga"
        elif f["citas"] >= 3 and p80 > 0 and f["gasto"] >= p80:
            f["segmento"] = "vip"
        elif f["citas"] <= 1:
            f["segmento"] = "nuevo"
        else:
            f["segmento"] = "activo"

    salida = []
    for clave, nombre, desc, color in SEGMENTOS:
        grupo = [f for f in filas if f["segmento"] == clave]
        grupo.sort(key=lambda x: -x["gasto"])
        salida.append(
            {
                "clave": clave,
                "nombre": nombre,
                "descripcion": desc,
                "color": color,
                "total": len(grupo),
                "valor": round(sum(x["gasto"] for x in grupo), 2),
                "pacientes": grupo[:10],
            }
        )
    return {"total": len(filas), "segmentos": salida}


# ---------------------------------------------------------------------------
# Predicción de demanda de citas
# ---------------------------------------------------------------------------
def demanda_citas(db: Session, dias: int = 14, empresa_id: int | None = None) -> dict:
    """Promedio histórico por día de la semana y pronóstico de la agenda."""
    hoy = date.today()
    desde = hoy - timedelta(days=83)
    fechas = (
        db.execute(
            select(Cita.fecha).where(
                Cita.fecha >= desde,
                Cita.fecha <= hoy,
                *([Cita.empresa_id == empresa_id] if empresa_id else []),
            )
        )
        .scalars()
        .all()
    )
    conteo: dict[int, int] = {i: 0 for i in range(7)}
    for f in fechas:
        conteo[f.weekday()] += 1
    semanas = 12.0
    promedios = {i: round(conteo[i] / semanas, 1) for i in range(7)}
    historico = [{"dia": DIAS_SEMANA[i], "promedio": promedios[i]} for i in range(7)]

    forecast = []
    for k in range(1, dias + 1):
        d = hoy + timedelta(days=k)
        agendadas = db.scalar(
            select(func.count(Cita.id)).where(
                Cita.fecha == d,
                *([Cita.empresa_id == empresa_id] if empresa_id else []),
            )
        ) or 0
        forecast.append(
            {
                "fecha": d.isoformat(),
                "dia": DIAS_SEMANA[d.weekday()],
                "esperado": promedios[d.weekday()],
                "agendadas": int(agendadas),
            }
        )
    return {"historico_semana": historico, "forecast": forecast}


# ---------------------------------------------------------------------------
# Predicción de inventario / reposición
# ---------------------------------------------------------------------------
def prediccion_inventario(db: Session, empresa_id: int | None = None) -> list[dict]:
    """Consumo promedio (90 días) y días estimados antes de agotarse."""
    desde = datetime.utcnow() - timedelta(days=90)
    productos = (
        db.execute(
            select(Producto).where(
                Producto.activo.is_(True),
                *([Producto.empresa_id == empresa_id] if empresa_id else []),
            )
        )
        .scalars()
        .all()
    )
    out = []
    for pr in productos:
        salidas = db.scalar(
            select(func.coalesce(func.sum(MovimientoProducto.cantidad), 0)).where(
                MovimientoProducto.producto_id == pr.id,
                MovimientoProducto.tipo == "salida",
                MovimientoProducto.fecha >= desde,
            )
        ) or 0
        consumo = float(salidas) / 90.0
        dias = round(pr.stock / consumo, 1) if consumo > 0 else None
        sugerido = max(int(round(consumo * 30 - pr.stock)), 0) if consumo > 0 else 0
        if dias is None:
            riesgo = "bajo"
        elif dias < 7:
            riesgo = "critico"
        elif dias < 15:
            riesgo = "alto"
        elif dias < 30:
            riesgo = "medio"
        else:
            riesgo = "bajo"
        out.append(
            {
                "producto_id": pr.id,
                "nombre": pr.nombre,
                "sku": pr.sku,
                "stock": int(pr.stock),
                "stock_minimo": int(pr.stock_minimo),
                "consumo_diario": round(consumo, 2),
                "dias_restantes": dias,
                "sugerido_pedido": sugerido,
                "riesgo": riesgo,
            }
        )
    out.sort(
        key=lambda x: (x["dias_restantes"] is None, x["dias_restantes"] or 0),
    )
    return out


# ---------------------------------------------------------------------------
# Optimización de agenda
# ---------------------------------------------------------------------------
def optimizar_agenda(db: Session, empresa_id: int | None = None) -> dict:
    """Ocupación por hora y día para detectar picos y franjas libres."""
    hoy = date.today()
    desde = hoy - timedelta(days=29)
    citas = (
        db.execute(
            select(Cita).where(
                Cita.fecha >= desde,
                Cita.fecha <= hoy,
                *([Cita.empresa_id == empresa_id] if empresa_id else []),
            )
        )
        .scalars()
        .all()
    )
    por_hora: dict[int, int] = {h: 0 for h in range(8, 20)}
    por_dia: dict[int, int] = {d: 0 for d in range(6)}
    for c in citas:
        h = c.hora_inicio.hour
        if h in por_hora:
            por_hora[h] += 1
        if c.fecha.weekday() < 6:
            por_dia[c.fecha.weekday()] += 1

    horas = [{"hora": f"{h:02d}:00", "citas": por_hora[h]} for h in range(8, 20)]
    dias = [{"dia": DIAS_SEMANA[i], "citas": por_dia[i]} for i in range(6)]

    pico = sorted(horas, key=lambda x: -x["citas"])[:3]
    libres = [h["hora"] for h in horas if h["citas"] == 0][:4]
    top_dia = max(dias, key=lambda x: x["citas"]) if dias else None

    recs: list[str] = []
    if top_dia and top_dia["citas"] > 0:
        recs.append(
            f"{top_dia['dia']} es el día de mayor demanda ({top_dia['citas']} citas): refuerza personal."
        )
    if pico and pico[0]["citas"] > 0:
        recs.append(
            "Horas pico: " + ", ".join(h["hora"] for h in pico) + ". Prioriza ahí las confirmaciones."
        )
    if libres:
        recs.append(
            "Franjas con baja ocupación: " + ", ".join(libres) + ". Ofrece promociones para llenarlas."
        )
    return {"horas": horas, "dias": dias, "recomendaciones": recs}


# ---------------------------------------------------------------------------
# Anomalías en facturación
# ---------------------------------------------------------------------------
def anomalias_facturacion(db: Session, empresa_id: int | None = None) -> dict:
    """Detecta meses de ingresos atípicos y facturas fuera de rango (z-score)."""
    hoy = date.today()
    mensual = []
    for i in range(11, -1, -1):
        anio, mes = hoy.year, hoy.month - i
        while mes <= 0:
            mes += 12
            anio -= 1
        inicio = date(anio, mes, 1)
        fin = (date(anio + (mes == 12), (mes % 12) + 1, 1)) - timedelta(days=1)
        total = float(
            db.scalar(
                select(func.coalesce(func.sum(Factura.total), 0)).where(
                    Factura.estado.in_(["pagada", "parcial"]),
                    func.date(Factura.fecha) >= inicio,
                    func.date(Factura.fecha) <= fin,
                    *([Factura.empresa_id == empresa_id] if empresa_id else []),
                )
            )
            or 0
        )
        mensual.append({"mes": f"{anio}-{mes:02d}", "total": round(total, 2)})

    vals = np.array([m["total"] for m in mensual], dtype=float)
    mu, sd = float(vals.mean()), float(vals.std())
    for m in mensual:
        z = (m["total"] - mu) / sd if sd > 0 else 0.0
        m["z"] = round(z, 2)
        m["anomalia"] = abs(z) >= 1.5

    desde = hoy - timedelta(days=90)
    facturas = (
        db.execute(
            select(Factura).where(
                func.date(Factura.fecha) >= desde,
                *([Factura.empresa_id == empresa_id] if empresa_id else []),
            )
        )
        .scalars()
        .all()
    )
    anom = []
    if len(facturas) > 5:
        tots = np.array([float(f.total) for f in facturas], dtype=float)
        mu2, sd2 = float(tots.mean()), float(tots.std())
        for f in facturas:
            z = (float(f.total) - mu2) / sd2 if sd2 > 0 else 0.0
            if abs(z) >= 2.5:
                anom.append(
                    {
                        "numero": f.numero,
                        "total": float(f.total),
                        "fecha": f.fecha.isoformat(),
                        "z": round(z, 2),
                    }
                )
    anom.sort(key=lambda x: -abs(x["z"]))
    return {"mensual": mensual, "facturas": anom[:10]}


# ---------------------------------------------------------------------------
# Rentabilidad por tratamiento
# ---------------------------------------------------------------------------
def rentabilidad_tratamientos(
    db: Session, empresa_id: int | None = None, limite: int = 12
) -> list[dict]:
    filas = db.execute(
        select(
            PlanTratamientoItem.tratamiento_id,
            func.coalesce(func.sum(PlanTratamientoItem.subtotal), 0),
            func.coalesce(func.sum(PlanTratamientoItem.cantidad), 0),
        )
        .join(PlanTratamiento, PlanTratamiento.id == PlanTratamientoItem.plan_id)
        .where(
            PlanTratamientoItem.tratamiento_id != None,  # noqa: E711
            *([PlanTratamiento.empresa_id == empresa_id] if empresa_id else []),
        )
        .group_by(PlanTratamientoItem.tratamiento_id)
    ).all()
    nombres = {t.id: t.nombre for t in db.execute(select(Tratamiento)).scalars()}
    out = [
        {
            "tratamiento_id": r[0],
            "nombre": nombres.get(r[0], f"Tratamiento #{r[0]}"),
            "ingresos": round(float(r[1] or 0), 2),
            "cantidad": int(r[2] or 0),
        }
        for r in filas
    ]
    out.sort(key=lambda x: -x["ingresos"])
    return out[:limite]


# ---------------------------------------------------------------------------
# Asistente (motor de intenciones por palabras clave)
# ---------------------------------------------------------------------------
def _total_pacientes(db: Session, empresa_id: int | None) -> int:
    return int(
        db.scalar(
            select(func.count(Paciente.id)).where(
                Paciente.activo.is_(True),
                *([Paciente.empresa_id == empresa_id] if empresa_id else []),
            )
        )
        or 0
    )


def asistente(db: Session, pregunta: str, empresa_id: int | None = None) -> dict:
    """Responde preguntas frecuentes sobre la clínica combinando las métricas IA."""
    q = (pregunta or "").lower().strip()
    mp = (lambda modelo: [modelo.empresa_id == empresa_id] if empresa_id else [])
    hoy = date.today()

    if not q or any(k in q for k in ["hola", "buenas", "ayuda", "qué puedes", "que puedes", "opciones"]):
        return {
            "intent": "ayuda",
            "respuesta": "Puedo darte cifras de pacientes, ingresos, citas, riesgo de inasistencia, "
            "inventario, tratamientos y deudas. Prueba: «¿cuántos pacientes tengo?», "
            "«riesgo de inasistencia», «¿cuánto voy a facturar?», «stock bajo» o «¿qué me recomiendas?».",
        }

    if "recomien" in q or "sugerencia" in q or "sugiere" in q:
        recs = recomendaciones(db, limite=5, empresa_id=empresa_id)
        return {
            "intent": "recomendaciones",
            "respuesta": "Estas son mis recomendaciones prioritarias:",
            "datos": [{"titulo": r["titulo"], "prioridad": r["prioridad"]} for r in recs],
        }

    if any(k in q for k in ["paciente", "cuántos pacientes", "cuantos pacientes"]):
        return {
            "intent": "pacientes",
            "respuesta": f"Tienes {_total_pacientes(db, empresa_id)} pacientes activos en esta empresa.",
        }

    if any(k in q for k in ["ingreso", "factur", "venta", "dinero", "proyec", "cobr"]):
        ingreso_mes = float(
            db.scalar(
                select(func.coalesce(func.sum(Factura.total), 0)).where(
                    Factura.estado.in_(["pagada", "parcial"]),
                    func.extract("month", Factura.fecha) == hoy.month,
                    func.extract("year", Factura.fecha) == hoy.year,
                    *mp(Factura),
                )
            )
            or 0
        )
        proy = proyectar_ingresos(db, meses=1, empresa_id=empresa_id)
        prox = proy[0]["proyectado"] if proy else 0
        return {
            "intent": "ingresos",
            "respuesta": f"Ingresos de este mes: S/ {ingreso_mes:,.2f}. "
            f"Proyección del próximo mes: S/ {prox:,.2f}.",
            "datos": proy,
        }

    if any(k in q for k in ["cita", "agenda", "hoy", "mañana", "manana"]):
        citas_hoy = db.scalar(
            select(func.count(Cita.id)).where(Cita.fecha == hoy, *mp(Cita))
        ) or 0
        semana = db.scalar(
            select(func.count(Cita.id)).where(
                Cita.fecha >= hoy, Cita.fecha <= hoy + timedelta(days=7), *mp(Cita)
            )
        ) or 0
        return {
            "intent": "citas",
            "respuesta": f"Hoy hay {int(citas_hoy)} citas y en los próximos 7 días {int(semana)}.",
        }

    if any(k in q for k in ["riesgo", "inasist", "no-show", "no show", "falt", "no asist"]):
        citas = (
            db.execute(
                select(Cita).where(
                    Cita.fecha >= hoy,
                    Cita.fecha <= hoy + timedelta(days=14),
                    Cita.estado.in_(["programada", "confirmada"]),
                    *mp(Cita),
                )
            )
            .scalars()
            .all()
        )
        preds = [predecir_no_show(db, c) for c in citas]
        altos = [p for p in preds if p["riesgo"] != "bajo"]
        altos.sort(key=lambda p: -p["probabilidad"])
        return {
            "intent": "no_show",
            "respuesta": f"{len(altos)} de {len(preds)} citas próximas tienen riesgo medio/alto de inasistencia.",
            "datos": [
                {"paciente": p["paciente"], "fecha": str(p["fecha"]), "probabilidad": p["probabilidad"]}
                for p in altos[:5]
            ],
        }

    if any(k in q for k in ["stock", "inventario", "insumo", "producto", "reponer"]):
        bajos = prediccion_inventario(db, empresa_id=empresa_id)
        criticos = [p for p in bajos if p["riesgo"] in ("critico", "alto")]
        return {
            "intent": "inventario",
            "respuesta": f"{len(criticos)} insumo(s) requieren reposición pronta.",
            "datos": criticos[:6],
        }

    if any(k in q for k in ["tratamiento", "rentab", "servicio"]):
        rent = rentabilidad_tratamientos(db, empresa_id=empresa_id, limite=5)
        return {
            "intent": "tratamientos",
            "respuesta": "Tratamientos con más ingresos:",
            "datos": rent,
        }

    if any(k in q for k in ["deuda", "moroso", "pendiente", "por cobrar", "pago"]):
        recs = recomendaciones(db, limite=10, empresa_id=empresa_id)
        cob = next((r for r in recs if r["tipo"] == "cobranza"), None)
        return {
            "intent": "cobranza",
            "respuesta": cob["titulo"] if cob else "No hay saldos pendientes relevantes.",
        }

    return {
        "intent": "resumen",
        "respuesta": f"Tienes {_total_pacientes(db, empresa_id)} pacientes activos. "
        "Pregúntame por ingresos, citas, riesgo de inasistencia, inventario, tratamientos o deudas.",
    }
