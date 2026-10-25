"""Diseno 3D Dental: genera mallas de piezas dentales (protesis / moldes) a
partir de plantillas anatomicas reales (Universidad de Dundee, CC BY 4.0),
calcula un mapa de calor de ajuste por curvatura y exporta STL listo para
impresion 3D.

Plantillas: backend/app/assets/diseno3d/*.stl (decimadas, watertight, altura=1).
Si falta una plantilla, cae a una geometria procedural simple.
"""
from __future__ import annotations

import uuid
from functools import lru_cache
from pathlib import Path

import numpy as np
import trimesh

# ---------------------------------------------------------------------------
# Catalogo de piezas (estilos tomados del flujo de referencia)
# ---------------------------------------------------------------------------
CATALOGO = [
    {
        "clave": "molar",
        "nombre": "Molar",
        "estilos": ["Molar_Style_A", "Molar_Style_B"],
        "descripcion": "Pieza posterior con 4 cuspides; modelo anatomico real.",
        "medidas": {"ancho": 10.5, "alto": 9.0, "profundidad": 11.0},
    },
    {
        "clave": "premolar",
        "nombre": "Premolar",
        "estilos": ["Molar_Style_A", "Molar_Style_B"],
        "descripcion": "Pieza intermedia con 2 cuspides; modelo anatomico real.",
        "medidas": {"ancho": 8.0, "alto": 8.0, "profundidad": 9.0},
    },
    {
        "clave": "canino",
        "nombre": "Canino",
        "estilos": ["Canine_Ref_B"],
        "descripcion": "Pieza con punta marcada para desgarrar; modelo anatomico real.",
        "medidas": {"ancho": 7.5, "alto": 11.0, "profundidad": 8.5},
    },
    {
        "clave": "incisivo",
        "nombre": "Incisivo",
        "estilos": ["Incisor_E"],
        "descripcion": "Pieza anterior de borde cortante; modelo anatomico real.",
        "medidas": {"ancho": 8.5, "alto": 10.5, "profundidad": 6.0},
    },
]

_ASSETS = Path(__file__).resolve().parent.parent / "assets" / "diseno3d"
_UPLOADS = Path(__file__).resolve().parent.parent.parent / "uploads" / "diseno3d"

# estilo -> archivo de plantilla anatomica
_PLANTILLAS = {
    "molar": {"Molar_Style_A": "molar_a", "Molar_Style_B": "molar_b"},
    "premolar": {"Molar_Style_A": "premolar_a", "Molar_Style_B": "premolar_b"},
    "canino": {"Canine_Ref_B": "canino"},
    "incisivo": {"Incisor_E": "incisivo"},
}


@lru_cache(maxsize=16)
def _cargar_plantilla(clave: str) -> trimesh.Trimesh | None:
    ruta = _ASSETS / f"{clave}.stl"
    if not ruta.exists():
        return None
    try:
        return trimesh.load(str(ruta), force="mesh")
    except Exception:  # noqa: BLE001
        return None


def _construir(tipo: str, estilo: str, ancho: float, alto: float, profundidad: float) -> trimesh.Trimesh:
    """Construye la pieza: plantilla anatomica escalada (eje Z = altura, base en z=0)."""
    clave = _PLANTILLAS.get(tipo, {}).get(estilo, "")
    plantilla = _cargar_plantilla(clave) if clave else None
    if plantilla is not None:
        m = plantilla.copy()
        ext = m.extents
        sx = ancho / ext[0] if ext[0] else 1.0
        sy = profundidad / ext[1] if ext[1] else 1.0
        sz = alto / ext[2] if ext[2] else 1.0
        m.apply_scale([sx, sy, sz])
        m.apply_translation([-m.centroid[0], -m.centroid[1], -m.bounds[0][2]])
        return m
    return _construir_procedural(tipo, ancho, alto, profundidad)


# ---------------------------------------------------------------------------
# Fallback procedural (solo si falta la plantilla)
# ---------------------------------------------------------------------------
def _elipsoide(a: float, b: float, c: float, subdiv: int = 3) -> trimesh.Trimesh:
    m = trimesh.creation.icosphere(subdivisions=subdiv, radius=1.0)
    m.apply_scale([a, b, c])
    return m


def _esfera(r: float, centro) -> trimesh.Trimesh:
    m = trimesh.creation.icosphere(subdivisions=2, radius=r)
    m.apply_translation(centro)
    return m


def _union(mallas: list[trimesh.Trimesh]) -> trimesh.Trimesh:
    try:
        return trimesh.boolean.union(mallas, engine="manifold")
    except Exception:  # noqa: BLE001 — cae a concatenacion si el motor no esta
        return trimesh.util.concatenate(mallas)


def _construir_procedural(tipo: str, ancho: float, alto: float, profundidad: float) -> trimesh.Trimesh:
    """Construye la malla de la pieza con el eje Z como altura (0..alto)."""
    a, b, c = ancho / 2.0, profundidad / 2.0, alto / 2.0
    base = _elipsoide(a, b, c)
    base.apply_translation([0, 0, c])  # base en z=0
    partes = [base]

    if tipo == "molar":
        r = 0.20 * ancho
        for sx in (-1, 1):
            for sy in (-1, 1):
                partes.append(_esfera(r, [sx * 0.45 * a, sy * 0.45 * b, alto * 0.98]))
    elif tipo == "premolar":
        r = 0.22 * ancho
        for sx in (-1, 1):
            partes.append(_esfera(r, [sx * 0.5 * a, 0, alto * 0.98]))
    elif tipo == "canino":
        cono = trimesh.creation.cone(radius=0.30 * a, height=0.6 * alto)
        cono.apply_translation([0, 0, alto])  # punta arriba
        partes.append(cono)
    elif tipo == "incisivo":
        cuna = trimesh.creation.box(extents=[ancho * 0.9, profundidad * 0.55, alto * 0.28])
        cuna.apply_translation([0, 0, alto * 0.92])
        partes.append(cuna)

    return _union(partes)


# ---------------------------------------------------------------------------
# Mapa de calor
# ---------------------------------------------------------------------------
def _colormap(t: float) -> list[int]:
    """verde -> amarillo -> rojo para t en [0, 1]."""
    t = float(min(1.0, max(0.0, t)))
    if t < 0.5:
        k = t / 0.5
        r = int(34 + (250 - 34) * k)
        g = int(197 + (204 - 197) * k)
        bl = int(94 + (21 - 94) * k)
    else:
        k = (t - 0.5) / 0.5
        r = int(250 + (239 - 250) * k)
        g = int(204 + (68 - 204) * k)
        bl = int(21 + (68 - 21) * k)
    return [r, g, bl, 255]


def _suavizar(malla: trimesh.Trimesh, valores: np.ndarray, pasadas: int = 2) -> np.ndarray:
    """Suaviza valores por vertice promediando con sus vecinos."""
    v = valores.copy()
    vecinos = malla.vertex_neighbors
    for _ in range(pasadas):
        nuevo = v.copy()
        for i in range(len(v)):
            nv = vecinos[i]
            if len(nv):
                nuevo[i] = (v[i] + float(np.mean(v[nv]))) / 2.0
        v = nuevo
    return v


def _mapa_calor(malla: trimesh.Trimesh) -> tuple[np.ndarray, np.ndarray]:
    """Curvatura media por vertice normalizada -> colores y valor t en [0,1]."""
    verts = np.asarray(malla.vertices, dtype=float)
    try:
        radio = 0.08 * float(np.max(malla.extents))
        curv = trimesh.curvature.discrete_mean_curvature_measure(malla, malla.vertices, radio)
    except Exception:  # noqa: BLE001
        curv = np.zeros(len(verts))
    curv = _suavizar(malla, curv)
    p95 = float(np.percentile(np.abs(curv), 95))
    if p95 <= 0:
        p95 = 1.0
    t = np.clip(np.abs(curv) / p95, 0.0, 1.0)
    colores = np.array([_colormap(x) for x in t], dtype=np.uint8)
    return colores, t


# ---------------------------------------------------------------------------
# Generacion
# ---------------------------------------------------------------------------
def generar(tipo: str, estilo: str, ancho: float, alto: float, profundidad: float) -> dict:
    """Genera la pieza y devuelve geometria (vertices/faces/colores) + metricas."""
    malla = _construir(tipo, estilo, ancho, alto, profundidad)

    verts = np.asarray(malla.vertices, dtype=float)
    colores, t = _mapa_calor(malla)
    malla.visual.vertex_colors = colores

    # Exporta STL
    _UPLOADS.mkdir(parents=True, exist_ok=True)
    nombre = f"{tipo}_{uuid.uuid4().hex[:10]}.stl"
    malla.export(file_obj=str(_UPLOADS / nombre), file_type="stl")

    try:
        volumen = float(abs(malla.volume))
    except Exception:  # noqa: BLE001
        volumen = 0.0

    vertices = np.round(verts, 3).tolist()
    caras = np.asarray(malla.faces, dtype=int).tolist()

    ajuste_medio = float(np.mean(t))
    metricas = {
        "vertices": int(len(verts)),
        "caras": int(len(caras)),
        "volumen_mm3": round(volumen, 2),
        "area_mm2": round(float(malla.area), 2),
        "watertight": bool(malla.is_watertight),
        "dimensiones_mm": [round(float(x), 2) for x in malla.extents],
        "ajuste_medio": round(1.0 - ajuste_medio, 3),
        "desviacion_pct": round(ajuste_medio * 100, 1),
    }

    return {
        "vertices": vertices,
        "faces": caras,
        "colors": colores[:, :3].tolist(),
        "archivo": nombre,
        "url_stl": f"/uploads/diseno3d/{nombre}",
        "metricas": metricas,
    }