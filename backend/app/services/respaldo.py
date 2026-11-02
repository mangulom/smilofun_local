"""Respaldo y restauración lógica de la base de datos.

No depende de ``pg_dump``/``psql`` (que en Windows suelen no estar en el PATH): lee
y escribe las tablas del modelo con SQLAlchemy, por lo que funciona con cualquier
motor soportado.

Formato del archivo (``.jsonl.gz``, JSON Lines comprimido con gzip):

* línea 1 – cabecera: ``{"formato": "smilofun-backup", "version": 1, "tablas":
  {"pacientes": {"columnas": [...], "filas": 120}, ...}, ...}``
* siguientes – una fila por línea: ``{"t": "pacientes", "r": [valores en el orden de
  las columnas]}``, agrupadas por tabla y en orden de dependencias (padres primero).
* última línea – cierre: ``{"fin": true, "filas": <total>}``. Sin ella el archivo se
  considera incompleto, por lo que una copia truncada nunca se restaura.

El respaldo se toma dentro de una transacción ``REPEATABLE READ`` (PostgreSQL), de
modo que es consistente aunque la aplicación siga en uso. La restauración valida el
archivo completo antes de tocar la base, guarda un respaldo automático del estado
actual y reemplaza los datos en una única transacción: si algo falla, la base queda
exactamente como estaba.

Los archivos subidos (radiografías, DICOM, escaneos) viven en ``backend/uploads`` y
**no** forman parte de este respaldo.
"""
from __future__ import annotations

import base64
import gzip
import json
import os
import re
import threading
import zlib
from datetime import date, datetime, time, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable

from sqlalchemy import Integer, delete, inspect, select, text
from sqlalchemy.engine import Connection, Engine

from app import models  # noqa: F401  (registra todas las tablas en Base.metadata)
from app.core.config import settings
from app.core.database import Base

FORMATO = "smilofun-backup"
VERSION = 1
EXTENSION = ".jsonl.gz"
LOTE = 1000
PREFIJO_PREVIO = "antes-de-restaurar"

DIRECTORIO = (
    Path(settings.backup_dir).expanduser()
    if getattr(settings, "backup_dir", None)
    else Path(__file__).resolve().parents[2] / "backups"
)

_NOMBRE_VALIDO = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.jsonl\.gz$")
_bloqueo = threading.Lock()


class RespaldoOcupado(Exception):
    """Ya hay un respaldo o una restauración en curso."""


# --------------------------------------------------------------------------- #
# Conversión de valores                                                       #
# --------------------------------------------------------------------------- #
def codificar(valor: Any) -> Any:
    """Valor de la base → valor serializable en JSON."""
    if valor is None:
        return None
    if isinstance(valor, (datetime, date, time)):
        return valor.isoformat()
    if isinstance(valor, Decimal):
        return str(valor)
    if isinstance(valor, (bytes, bytearray, memoryview)):
        return base64.b64encode(bytes(valor)).decode("ascii")
    return valor


def decodificar(valor: Any, tipo: type | None) -> Any:
    """Valor leído del archivo → valor que espera la columna."""
    if valor is None or tipo is None:
        return valor
    if tipo is datetime:
        return datetime.fromisoformat(valor)
    if tipo is date:
        return date.fromisoformat(valor)
    if tipo is time:
        return time.fromisoformat(valor)
    if tipo is Decimal:
        return Decimal(str(valor))
    if tipo is bytes:
        return base64.b64decode(valor)
    return valor


def _como_json(objeto: Any) -> Any:
    """``default`` de json.dumps para valores anidados (p. ej. dentro de columnas JSON)."""
    convertido = codificar(objeto)
    return convertido if convertido is not objeto else str(objeto)


def _tipo_python(columna: Any) -> type | None:
    try:
        return columna.type.python_type
    except NotImplementedError:
        return None


def _linea(objeto: Any) -> str:
    return json.dumps(objeto, ensure_ascii=False, separators=(",", ":"), default=_como_json) + "\n"


# --------------------------------------------------------------------------- #
# Archivos                                                                    #
# --------------------------------------------------------------------------- #
def _abrir(ruta: Path):
    return gzip.open(ruta, "rt", encoding="utf-8")


def ruta_de(nombre: str) -> Path:
    """Resuelve un nombre de respaldo dentro de la carpeta de respaldos."""
    if not _NOMBRE_VALIDO.fullmatch(nombre or ""):
        raise ValueError("Nombre de respaldo no válido.")
    ruta = (DIRECTORIO / nombre).resolve()
    if ruta.parent != DIRECTORIO.resolve():
        raise ValueError("Nombre de respaldo no válido.")
    if not ruta.is_file():
        raise FileNotFoundError(nombre)
    return ruta


def nombre_seguro(original: str) -> str:
    """Convierte el nombre de un archivo subido en uno válido para la carpeta de respaldos."""
    base = re.sub(r"[^A-Za-z0-9._-]", "_", Path(original or "").name).lstrip("._-") or "respaldo"
    if not base.lower().endswith(EXTENSION):
        raise ValueError(f"El archivo debe ser un respaldo de SmiloFun ({EXTENSION}).")
    return base[: -len(EXTENSION)][:120] + EXTENSION


def leer_cabecera(ruta: Path) -> dict[str, Any]:
    """Lee y valida solo la primera línea del respaldo."""
    try:
        with _abrir(ruta) as archivo:
            cabecera = json.loads(archivo.readline())
    except (OSError, EOFError, zlib.error, UnicodeDecodeError, ValueError) as exc:
        raise ValueError("El archivo no es un respaldo válido de SmiloFun.") from exc
    if not isinstance(cabecera, dict) or cabecera.get("formato") != FORMATO:
        raise ValueError("El archivo no es un respaldo de SmiloFun.")
    if cabecera.get("version") != VERSION:
        raise ValueError(f"Versión de respaldo no soportada ({cabecera.get('version')}).")
    tablas = cabecera.get("tablas")
    if not isinstance(tablas, dict) or any(
        not isinstance(i, dict) or not isinstance(i.get("columnas"), list) or not isinstance(i.get("filas"), int)
        for i in tablas.values()
    ):
        raise ValueError("La cabecera del respaldo está dañada.")
    return cabecera


def verificar(ruta: Path) -> dict[str, Any]:
    """Recorre todo el archivo comprobando su integridad (sin tocar la base de datos)."""
    cabecera = leer_cabecera(ruta)
    tablas = cabecera["tablas"]
    posicion = {nombre: i for i, nombre in enumerate(tablas)}
    cuentas = dict.fromkeys(tablas, 0)
    cierre: dict[str, Any] | None = None
    ultima = -1
    try:
        with _abrir(ruta) as archivo:
            archivo.readline()
            for numero, linea in enumerate(archivo, start=2):
                if not linea.strip():
                    continue
                if cierre is not None:
                    raise ValueError("El respaldo contiene datos después de su final.")
                try:
                    objeto = json.loads(linea)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"El respaldo está dañado (línea {numero}).") from exc
                if not isinstance(objeto, dict):
                    raise ValueError(f"El respaldo está dañado (línea {numero}).")
                if "t" in objeto:
                    nombre, fila = objeto["t"], objeto.get("r")
                    if nombre not in posicion or not isinstance(fila, list):
                        raise ValueError(f"El respaldo está dañado (línea {numero}).")
                    if posicion[nombre] < ultima:
                        raise ValueError("Las tablas del respaldo no están en el orden esperado.")
                    if len(fila) != len(tablas[nombre]["columnas"]):
                        raise ValueError(f"Fila con columnas incorrectas en la tabla «{nombre}» (línea {numero}).")
                    ultima = posicion[nombre]
                    cuentas[nombre] += 1
                elif objeto.get("fin") is True:
                    cierre = objeto
                else:
                    raise ValueError(f"El respaldo está dañado (línea {numero}).")
    except (OSError, EOFError, zlib.error, UnicodeDecodeError) as exc:
        raise ValueError("El respaldo está dañado o incompleto.") from exc
    if cierre is None:
        raise ValueError("El respaldo está incompleto (no llegó a terminar de guardarse).")
    for nombre, info in tablas.items():
        if cuentas[nombre] != info["filas"]:
            raise ValueError(
                f"La tabla «{nombre}» debería tener {info['filas']} filas y el archivo trae {cuentas[nombre]}."
            )
    if cierre.get("filas") != sum(cuentas.values()):
        raise ValueError("El total de filas del respaldo no coincide.")
    return cabecera


def describir(ruta: Path) -> dict[str, Any]:
    """Datos para listar un respaldo (lectura rápida: solo la cabecera)."""
    estado = ruta.stat()
    creado = datetime.fromtimestamp(estado.st_mtime, timezone.utc).isoformat(timespec="seconds")
    tablas = filas = 0
    valido = True
    try:
        cabecera = leer_cabecera(ruta)
        creado = str(cabecera.get("creado") or creado)
        tablas = len(cabecera["tablas"])
        filas = sum(i["filas"] for i in cabecera["tablas"].values())
    except ValueError:
        valido = False
    return {
        "nombre": ruta.name,
        "tamano": estado.st_size,
        "creado": creado,
        "tablas": tablas,
        "filas": filas,
        "valido": valido,
        "tipo": "previo" if ruta.name.startswith(PREFIJO_PREVIO) else "manual",
    }


def listar() -> list[dict[str, Any]]:
    if not DIRECTORIO.is_dir():
        return []
    archivos = [p for p in DIRECTORIO.iterdir() if p.is_file() and _NOMBRE_VALIDO.fullmatch(p.name)]
    archivos.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return [describir(p) for p in archivos]


def eliminar(nombre: str) -> None:
    ruta_de(nombre).unlink()


# --------------------------------------------------------------------------- #
# Respaldo                                                                    #
# --------------------------------------------------------------------------- #
def _etiqueta(texto: str | None) -> str:
    limpio = re.sub(r"[^a-z0-9]+", "-", (texto or "").lower()).strip("-")
    return limpio[:40]


def _nuevo_destino(prefijo: str, etiqueta: str | None) -> Path:
    DIRECTORIO.mkdir(parents=True, exist_ok=True)
    base = f"{prefijo}-{datetime.now():%Y%m%d-%H%M%S}"
    if _etiqueta(etiqueta):
        base += f"-{_etiqueta(etiqueta)}"
    destino = DIRECTORIO / (base + EXTENSION)
    contador = 2
    while destino.exists():
        destino = DIRECTORIO / f"{base}-{contador}{EXTENSION}"
        contador += 1
    return destino


def _crear(engine: Engine, prefijo: str = "smilofun", etiqueta: str | None = None) -> Path:
    destino = _nuevo_destino(prefijo, etiqueta)
    parcial = destino.with_name(destino.name + ".tmp")
    conexion = engine.connect()
    if conexion.dialect.name == "postgresql":
        conexion = conexion.execution_options(isolation_level="REPEATABLE READ")
    try:
        with conexion:
            inspector = inspect(conexion)
            existentes = set(inspector.get_table_names())
            plan = []
            for tabla in Base.metadata.sorted_tables:
                if tabla.name not in existentes:
                    continue
                reales = {c["name"] for c in inspector.get_columns(tabla.name)}
                plan.append((tabla, [c for c in tabla.columns if c.name in reales]))

            cabecera = {
                "formato": FORMATO,
                "version": VERSION,
                "creado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "aplicacion": settings.app_name,
                "version_aplicacion": settings.app_version,
                "motor": conexion.dialect.name,
                "tablas": {},
            }
            for tabla, columnas in plan:
                total = conexion.execute(text(f"SELECT COUNT(*) FROM {conexion.dialect.identifier_preparer.quote(tabla.name)}")).scalar_one()
                cabecera["tablas"][tabla.name] = {"columnas": [c.name for c in columnas], "filas": int(total)}

            conexion = conexion.execution_options(stream_results=True, max_row_buffer=LOTE)
            with gzip.open(parcial, "wt", encoding="utf-8", compresslevel=6) as salida:
                salida.write(_linea(cabecera))
                escritas_total = 0
                for tabla, columnas in plan:
                    escritas = 0
                    for lote in conexion.execute(select(*columnas)).partitions(LOTE):
                        for fila in lote:
                            salida.write(_linea({"t": tabla.name, "r": [codificar(v) for v in fila]}))
                            escritas += 1
                    if escritas != cabecera["tablas"][tabla.name]["filas"]:
                        raise RuntimeError(
                            f"Los datos de «{tabla.name}» cambiaron mientras se respaldaban; vuelve a intentarlo."
                        )
                    escritas_total += escritas
                salida.write(_linea({"fin": True, "filas": escritas_total}))
        parcial.replace(destino)
        try:
            os.chmod(destino, 0o600)
        except OSError:
            pass
    except BaseException:
        parcial.unlink(missing_ok=True)
        raise
    return destino


def crear(engine: Engine, etiqueta: str | None = None) -> Path:
    """Crea un respaldo completo de la base de datos y devuelve su ruta."""
    if not _bloqueo.acquire(blocking=False):
        raise RespaldoOcupado("Hay otro respaldo o restauración en curso. Espera a que termine.")
    try:
        return _crear(engine, etiqueta=etiqueta)
    finally:
        _bloqueo.release()


# --------------------------------------------------------------------------- #
# Restauración                                                                #
# --------------------------------------------------------------------------- #
def _vaciar(conexion: Connection, tablas: list[Any]) -> None:
    if conexion.dialect.name == "postgresql":
        quote = conexion.dialect.identifier_preparer.quote
        nombres = ", ".join(quote(t.name) for t in tablas)
        conexion.execute(text(f"TRUNCATE TABLE {nombres} RESTART IDENTITY CASCADE"))
    else:
        for tabla in reversed(tablas):
            conexion.execute(delete(tabla))


def _reiniciar_secuencias(conexion: Connection, tablas: list[Any]) -> None:
    """Deja los autoincrementales por encima del mayor id restaurado (solo PostgreSQL)."""
    if conexion.dialect.name != "postgresql":
        return
    quote = conexion.dialect.identifier_preparer.quote
    for tabla in tablas:
        for columna in tabla.primary_key.columns:
            if isinstance(columna.type, Integer):
                c, t = quote(columna.name), quote(tabla.name)
                conexion.execute(
                    text(
                        f"SELECT setval(pg_get_serial_sequence(:tabla, :columna), "
                        f"COALESCE((SELECT MAX({c}) FROM {t}), 1), (SELECT MAX({c}) FROM {t}) IS NOT NULL)"
                    ),
                    {"tabla": t, "columna": columna.name},
                )


def _comprobar_compatibilidad(cabecera: dict[str, Any]) -> dict[str, Any]:
    modelo = {t.name: t for t in Base.metadata.sorted_tables}
    desconocidas = sorted(set(cabecera["tablas"]) - set(modelo))
    if desconocidas:
        raise ValueError(
            "El respaldo contiene tablas que esta versión de la aplicación no conoce: "
            + ", ".join(desconocidas)
            + "."
        )
    posicion = {nombre: i for i, nombre in enumerate(cabecera["tablas"])}
    for nombre in cabecera["tablas"]:
        for restriccion in modelo[nombre].foreign_key_constraints:
            padre = restriccion.referred_table.name
            if padre != nombre and padre in posicion and posicion[padre] > posicion[nombre]:
                raise ValueError("El orden de las tablas del respaldo no es compatible con esta versión.")
    return modelo


def _restaurar_filas(
    conexion: Connection, ruta: Path, cabecera: dict[str, Any], modelo: dict[str, Any], reales: dict[str, set[str]]
) -> int:
    total = 0
    actual: str | None = None
    convertir: Callable[[list[Any]], dict[str, Any]] | None = None
    lote: list[dict[str, Any]] = []

    def volcar() -> None:
        if lote and actual is not None:
            conexion.execute(modelo[actual].insert(), lote)
            lote.clear()

    with _abrir(ruta) as archivo:
        archivo.readline()
        for linea in archivo:
            if not linea.strip():
                continue
            objeto = json.loads(linea)
            if "t" not in objeto:
                continue
            nombre = objeto["t"]
            if nombre != actual:
                volcar()
                actual = nombre
                if nombre not in reales:
                    raise ValueError(f"La tabla «{nombre}» del respaldo no existe en la base de datos actual.")
                tabla = modelo[nombre]
                usables = [
                    (i, c, _tipo_python(tabla.columns[c]))
                    for i, c in enumerate(cabecera["tablas"][nombre]["columnas"])
                    if c in tabla.columns and c in reales[nombre]
                ]
                convertir = lambda fila, u=usables: {c: decodificar(fila[i], t) for i, c, t in u}  # noqa: E731
            lote.append(convertir(objeto["r"]))  # type: ignore[misc]
            total += 1
            if len(lote) >= LOTE:
                volcar()
        volcar()
    return total


def restaurar(engine: Engine, ruta: Path) -> dict[str, Any]:
    """Reemplaza TODOS los datos actuales por los del respaldo.

    Devuelve ``{"tablas", "filas", "respaldo_previo"}``. Si algo falla, la base queda
    intacta (la operación es una sola transacción) y se conserva el respaldo previo.
    """
    if not _bloqueo.acquire(blocking=False):
        raise RespaldoOcupado("Hay otro respaldo o restauración en curso. Espera a que termine.")
    try:
        cabecera = verificar(ruta)  # no se toca la base si el archivo no es íntegro
        modelo = _comprobar_compatibilidad(cabecera)
        previo = _crear(engine, prefijo=PREFIJO_PREVIO)
        with engine.begin() as conexion:
            inspector = inspect(conexion)
            existentes = set(inspector.get_table_names())
            tablas = [t for t in Base.metadata.sorted_tables if t.name in existentes]
            reales = {t.name: {c["name"] for c in inspector.get_columns(t.name)} for t in tablas}
            _vaciar(conexion, tablas)
            filas = _restaurar_filas(conexion, ruta, cabecera, modelo, reales)
            _reiniciar_secuencias(conexion, tablas)
        return {"tablas": len(cabecera["tablas"]), "filas": filas, "respaldo_previo": previo.name}
    finally:
        _bloqueo.release()