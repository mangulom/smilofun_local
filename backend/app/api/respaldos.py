"""Respaldo y restauración de la base de datos (solo administradores)."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.core.database import engine
from app.models import Usuario
from app.services import respaldo

MAX_SUBIDA = 2 * 1024 * 1024 * 1024  # 2 GiB


def solo_admin(user: Usuario = Depends(get_current_user)) -> Usuario:
    rol = (user.rol.nombre if user.rol else "").strip().lower()
    if "admin" not in rol:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo un administrador puede gestionar los respaldos.")
    return user


router = APIRouter(prefix="/api/respaldos", tags=["Respaldos"], dependencies=[Depends(solo_admin)])


class RespaldoOut(BaseModel):
    nombre: str
    tamano: int
    creado: str
    tablas: int
    filas: int
    valido: bool
    tipo: str


class RespaldoIn(BaseModel):
    etiqueta: str | None = None


class RestaurarIn(BaseModel):
    confirmacion: str


class RestauracionOut(BaseModel):
    tablas: int
    filas: int
    respaldo_previo: str


def _ruta(nombre: str) -> Path:
    try:
        return respaldo.ruta_de(nombre)
    except FileNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Respaldo no encontrado.")
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.get("", response_model=list[RespaldoOut])
def listar():
    return respaldo.listar()


@router.post("", response_model=RespaldoOut, status_code=status.HTTP_201_CREATED)
def crear(datos: RespaldoIn | None = None):
    try:
        ruta = respaldo.crear(engine, etiqueta=datos.etiqueta if datos else None)
    except respaldo.RespaldoOcupado as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"No se pudo crear el respaldo: {exc}")
    return respaldo.describir(ruta)


@router.post("/subir", response_model=RespaldoOut, status_code=status.HTTP_201_CREATED)
async def subir(file: UploadFile = File(...)):
    """Guarda un respaldo proveniente de otro equipo (queda listo para restaurar)."""
    try:
        nombre = respaldo.nombre_seguro(file.filename or "")
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    respaldo.DIRECTORIO.mkdir(parents=True, exist_ok=True)
    destino = respaldo.DIRECTORIO / f"subido-{datetime.now():%Y%m%d-%H%M%S}-{nombre}"
    if destino.exists():
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya se subió un respaldo con ese nombre en este segundo.")
    tamano = 0
    try:
        with destino.open("wb") as salida:
            while bloque := await file.read(1024 * 1024):
                tamano += len(bloque)
                if tamano > MAX_SUBIDA:
                    raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "El respaldo supera los 2 GB.")
                salida.write(bloque)
        if tamano == 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "El archivo está vacío.")
        try:
            await run_in_threadpool(respaldo.verificar, destino)
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))
    except BaseException:
        destino.unlink(missing_ok=True)
        raise
    return respaldo.describir(destino)


@router.get("/{nombre}/descargar")
def descargar(nombre: str):
    ruta = _ruta(nombre)
    return FileResponse(ruta, media_type="application/gzip", filename=ruta.name)


@router.post("/{nombre}/restaurar", response_model=RestauracionOut)
def restaurar(nombre: str, datos: RestaurarIn):
    """Reemplaza todos los datos actuales por los del respaldo (acción destructiva)."""
    if datos.confirmacion.strip() != "RESTAURAR":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, 'Escribe "RESTAURAR" para confirmar.')
    ruta = _ruta(nombre)
    try:
        return respaldo.restaurar(engine, ruta)
    except respaldo.RespaldoOcupado as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc))
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"No se pudo restaurar; la base de datos quedó sin cambios. Detalle: {exc}",
        )


@router.delete("/{nombre}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(nombre: str):
    _ruta(nombre)
    respaldo.eliminar(nombre)