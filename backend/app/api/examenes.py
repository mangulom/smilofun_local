"""Exámenes de imagen: radiografías, fotos clínicas, tomografías y escaneos."""
from __future__ import annotations

import uuid
import zipfile
import hashlib
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_empresa_access
from app.core.database import get_db
from app.models import TIPOS_EXAMEN, ExamenImagen, Paciente, Usuario
from app.schemas import ExamenImagenOut, ExamenImagenUpdate

router = APIRouter(
    prefix="/api",
    tags=["Exámenes de imagen"],
    dependencies=[Depends(get_current_user)],
)

# backend/app/api/examenes.py -> backend/uploads/examenes
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "examenes"
EXTENSIONES_IMAGEN = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
EXTENSIONES_DICOM = {".dcm", ".dicom", ".ima"}
EXTENSIONES_ZIP = {".zip"}
EXTENSIONES_VIDEO = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"}
EXTENSIONES_NIFTI = {".nii", ".nii.gz"}
EXTENSIONES_NRRD = {".nrrd"}
EXTENSIONES_VOLUMEN = EXTENSIONES_NIFTI | EXTENSIONES_NRRD
EXTENSIONES_PERMITIDAS = EXTENSIONES_IMAGEN | EXTENSIONES_DICOM | EXTENSIONES_ZIP | EXTENSIONES_VIDEO | EXTENSIONES_VOLUMEN
MAX_IMAGEN = 15 * 1024 * 1024   # 15 MiB
MAX_VIDEO = 200 * 1024 * 1024   # 200 MiB
MAX_DICOM = 512 * 1024 * 1024   # 512 MiB por instancia DICOM / multiframe
MAX_DICOM_ZIP = 1024 * 1024 * 1024  # límite upload serie empaquetada
MAX_DICOM_SERIE = 1500
MAX_DICOM_DESCOMPRIMIDO = 2 * 1024 * 1024 * 1024
MAX_VOLUMEN = 1024 * 1024 * 1024  # 1 GiB para volúmenes NIfTI/NRRD
MIME_VIDEO = ("video/",)


def _obtener_paciente(db: Session, paciente_id: int, user: Usuario | None = None) -> Paciente:
    paciente = db.get(Paciente, paciente_id)
    if paciente is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paciente no encontrado")
    if user is not None:
        require_empresa_access(paciente.empresa_id, user)
    return paciente


def _obtener_examen(db: Session, paciente_id: int, examen_id: int) -> ExamenImagen:
    examen = db.get(ExamenImagen, examen_id)
    if examen is None or examen.paciente_id != paciente_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Examen no encontrado")
    return examen


def _extraer_serie_dicom_segura(zip_path: Path, examen_id: int) -> list[dict]:
    """Extrae instancias DICOM de un ZIP aislándolas en una carpeta del examen."""
    destino = UPLOAD_DIR / f"serie_{examen_id}"
    destino.mkdir(parents=True, exist_ok=False)
    instancias: list[dict] = []
    total = 0
    try:
        with zipfile.ZipFile(zip_path) as archivo_zip:
            todos = [i for i in archivo_zip.infolist() if not i.is_dir()]
            if len(todos) > MAX_DICOM_SERIE:
                raise ValueError(f"El ZIP tiene demasiados archivos (máximo {MAX_DICOM_SERIE})")
            for info in todos:
                nombre_zip = info.filename.replace("\\", "/")
                partes_zip = nombre_zip.split("/")
                if nombre_zip.startswith("/") or (partes_zip and ":" in partes_zip[0]) or ".." in partes_zip:
                    raise ValueError("El ZIP contiene una ruta de archivo no permitida")
                if info.flag_bits & 0x1:
                    raise ValueError("ZIP cifrado no soportado; extrae el archivo primero")
                if info.file_size > 0 and info.compress_size > 0 and info.file_size / info.compress_size > 200:
                    raise ValueError("El ZIP excede el ratio máximo de compresión (posible ZIP bomb)")
            # Exportadores clínicos pueden incluir previews PNG/JPEG junto a
            # la serie. Ignorarlos; elegir solo instancias DICOM conocidas o
            # archivos sin extensión (p. ej. MR000017).
            candidatos = [
                i for i in todos
                if Path(i.filename).suffix.lower() in EXTENSIONES_DICOM
                or (
                    not Path(i.filename).suffix
                    and Path(i.filename).name.lower() not in {".ds_store", "thumbs.db", "desktop.ini"}
                    and not any(parte.lower().startswith("__macosx") for parte in Path(i.filename).parts)
                )
            ]
            if not candidatos:
                raise ValueError("El ZIP no contiene instancias DICOM (busqué .dcm/.dicom/.ima y archivos MRxxx sin extensión)")
            if len(candidatos) > MAX_DICOM_SERIE:
                raise ValueError(f"El ZIP contiene demasiadas instancias DICOM (máximo {MAX_DICOM_SERIE})")
            for info in candidatos:
                if info.file_size <= 0 or info.file_size > MAX_DICOM:
                    raise ValueError(f"Instancia DICOM con tamaño no permitido: {Path(info.filename).name}")
                total += info.file_size
                if total > MAX_DICOM_DESCOMPRIMIDO:
                    raise ValueError("La serie descomprimida supera el máximo de 2 GB")
                suffix = Path(info.filename).suffix.lower() or ".dcm"
                nombre = f"{len(instancias):05d}_{uuid.uuid4().hex}{suffix}"
                ruta = destino / nombre
                with archivo_zip.open(info) as src, ruta.open("wb") as dst:
                    while bloque := src.read(1024 * 1024):
                        dst.write(bloque)
                try:
                    import pydicom
                    ds = pydicom.dcmread(str(ruta), stop_before_pixels=True, force=False)
                    instance_number = int(getattr(ds, "InstanceNumber", len(instancias) + 1))
                except Exception as exc:
                    ruta.unlink(missing_ok=True)
                    raise ValueError(f"Instancia DICOM inválida dentro del ZIP: {Path(info.filename).name}") from exc
                instancias.append({"archivo": f"serie_{examen_id}/{nombre}", "instance_number": instance_number,
                                   "bytes": info.file_size, "sha256": hashlib.sha256(ruta.read_bytes()).hexdigest()})
        instancias.sort(key=lambda x: (x["instance_number"], x["archivo"]))
        if not instancias:
            raise ValueError("No se encontró ninguna instancia DICOM válida")
        return instancias
    except Exception:
        import shutil
        shutil.rmtree(destino, ignore_errors=True)
        raise


@router.get("/pacientes/{paciente_id}/examenes", response_model=list[ExamenImagenOut])
def listar_examenes(paciente_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    _obtener_paciente(db, paciente_id, user)
    examenes = (
        db.execute(
            select(ExamenImagen)
            .where(ExamenImagen.paciente_id == paciente_id)
            .order_by(ExamenImagen.fecha.desc(), ExamenImagen.id.desc())
        )
        .scalars()
        .all()
    )
    # Recupera metadata de registros anteriores a la migración sin abrir ni
    # alterar el archivo del estudio.
    for examen in examenes:
        if examen.formato_volumen or examen.dimensiones or examen.instancias_dicom:
            continue
        nombre = examen.archivo.lower()
        if nombre.endswith(".nrrd"):
            examen.formato_volumen = "NRRD"
        elif nombre.endswith(".nii.gz"):
            examen.formato_volumen = "NIfTI.GZ"
        elif nombre.endswith(".nii"):
            examen.formato_volumen = "NIfTI"
        elif (UPLOAD_DIR / examen.archivo).is_file():
            try:
                from app.services.dicom_convert import inspeccionar_volumen
                ruta = UPLOAD_DIR / examen.archivo
                nombre_real = ruta.name.lower()
                if nombre_real.endswith(".nrrd"):
                    examen.formato_volumen = "NRRD"
                    examen.dimensiones = inspeccionar_volumen(ruta, ".nrrd")
                elif nombre_real.endswith(".nii.gz"):
                    examen.formato_volumen = "NIfTI.GZ"
                    examen.dimensiones = inspeccionar_volumen(ruta, ".nii.gz")
                elif nombre_real.endswith(".nii"):
                    examen.formato_volumen = "NIfTI"
                    examen.dimensiones = inspeccionar_volumen(ruta, ".nii")
            except Exception:
                # Mantener listado para poder eliminar el examen inválido desde la ficha.
                examen.formato_volumen = examen.formato_volumen or "volumen_invalido"
        elif nombre.endswith(".zip"):
            serie_dir = UPLOAD_DIR / f"serie_{examen.id}"
            if serie_dir.is_dir():
                instancias = sorted(serie_dir.glob("*"))
                if instancias:
                    examen.formato_volumen = "DICOM-ZIP"
                    examen.instancias_dicom = [
                        {"archivo": f"serie_{examen.id}/{p.name}", "instance_number": i + 1, "bytes": p.stat().st_size}
                        for i, p in enumerate(instancias) if p.is_file()
                    ]
    return examenes


@router.get("/pacientes/{paciente_id}/examenes/{examen_id}/archivo/{nombre}")
def descargar_archivo_examen(paciente_id: int, examen_id: int, nombre: str, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    examen = _obtener_examen(db, paciente_id, examen_id)
    _obtener_paciente(db, paciente_id, user)
    base = UPLOAD_DIR.resolve()
    # A ZIP-series path is derived from the validated metadata, never from user input.
    raiz_serie = (base / f"serie_{examen.id}").resolve()
    if nombre == examen.archivo:
        ruta = (base / examen.archivo).resolve()
    else:
        permitidos_serie = {item.get("archivo", "").split("/")[-1] for item in (examen.instancias_dicom or [])}
        if nombre not in permitidos_serie:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Archivo no encontrado")
        ruta = (raiz_serie / nombre).resolve()
    if ruta.parent not in {base, raiz_serie}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Archivo no encontrado")
    if not ruta.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Archivo no encontrado")
    return FileResponse(ruta, media_type="application/octet-stream", filename=ruta.name, headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@router.get("/pacientes/{paciente_id}/examenes/{examen_id}/serie")
def obtener_serie_dicom(paciente_id: int, examen_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    examen = _obtener_examen(db, paciente_id, examen_id)
    _obtener_paciente(db, paciente_id, user)
    if not examen.instancias_dicom:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El examen no contiene una serie DICOM ZIP")
    base_url = f"/api/pacientes/{paciente_id}/examenes/{examen.id}/archivo"
    return {
        "examen_id": examen.id,
        "formato": examen.formato_volumen,
        "instancias": [
            {"url": f"{base_url}/{item['archivo'].split('/')[-1]}", "instance_number": item["instance_number"]}
            for item in examen.instancias_dicom
        ],
    }


@router.post(
    "/pacientes/{paciente_id}/examenes",
    response_model=ExamenImagenOut,
    status_code=status.HTTP_201_CREATED,
)
async def subir_examen(
    paciente_id: int,
    tipo: str = Form("rx"),
    titulo: str = Form(...),
    descripcion: str | None = Form(None),
    diente: str | None = Form(None),
    fecha: str | None = Form(None),
    doctor_id: int | None = Form(None),
    notas: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    paciente = _obtener_paciente(db, paciente_id, user)
    if doctor_id is not None:
        doctor = db.get(Doctor, doctor_id)
        if doctor is None or (doctor.empresa_id and doctor.empresa_id != paciente.empresa_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor no encontrado")

    if tipo not in TIPOS_EXAMEN:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Tipo de examen inválido: {tipo}")

    nombre_archivo = Path(file.filename or "imagen.png").name
    nombre_lower = nombre_archivo.lower()
    extension = ".nii.gz" if nombre_lower.endswith(".nii.gz") else Path(nombre_archivo).suffix.lower()
    if extension not in EXTENSIONES_PERMITIDAS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Formato no permitido ({extension}). Usa: {', '.join(sorted(EXTENSIONES_PERMITIDAS))}",
        )

    # Verificar el archivo del volumen por su formato real antes de clasificar
    # o almacenar el tipo clínico seleccionado por el usuario.
    es_video_archivo = extension in EXTENSIONES_VIDEO
    es_dicom_archivo = extension in EXTENSIONES_DICOM
    es_volumen_archivo = extension in EXTENSIONES_VOLUMEN
    es_zip_dicom = extension in EXTENSIONES_ZIP
    if es_zip_dicom:
        # Más cortes MR sin extensión (MR000001...) sugieren resonancia; PET/CT o
        # CT se seleccionan explícitamente por tipo en el formulario.
        tipo = "resonancia" if tipo not in ("tomografia", "resonancia") else tipo
    elif es_video_archivo and tipo != "video":
        tipo = "video"
    elif not es_video_archivo and tipo == "video":
        tipo = "tomografia" if (es_dicom_archivo or es_volumen_archivo) else "foto"
    elif extension == ".nrrd" and tipo not in ("tomografia", "resonancia"):
        tipo = "tomografia"
    elif extension in EXTENSIONES_NIFTI and tipo not in ("tomografia", "resonancia"):
        tipo = "tomografia"
    if es_zip_dicom:
        # Elegir modalidad a partir de los nombres en el ZIP; los DICOM MR de
        # datasets educativos suelen carecer de sufijo .dcm.
        tipo = "resonancia"

    es_video = extension in EXTENSIONES_VIDEO or (file.content_type or "").startswith(MIME_VIDEO)
    max_tamano = MAX_VIDEO if es_video else MAX_DICOM_ZIP if es_zip_dicom else MAX_DICOM if es_dicom_archivo else MAX_VOLUMEN if es_volumen_archivo else MAX_IMAGEN
    limite = "200 MB (video)" if es_video else "1 GB (serie DICOM ZIP)" if es_zip_dicom else "512 MB (DICOM)" if es_dicom_archivo else "1 GB (volumen)" if es_volumen_archivo else "15 MB (imagen)"

    if fecha:
        try:
            fecha_examen = date.fromisoformat(fecha)
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Fecha inválida (usa YYYY-MM-DD)")
    else:
        fecha_examen = date.today()

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    nombre_guardado = f"{uuid.uuid4().hex}{extension}"
    destino = UPLOAD_DIR / nombre_guardado
    tamano = 0
    try:
        with destino.open("wb") as salida:
            while bloque := await file.read(1024 * 1024):
                tamano += len(bloque)
                if tamano > max_tamano:
                    raise HTTPException(
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Máximo {limite} por archivo"
                    )
                salida.write(bloque)
    except Exception:
        destino.unlink(missing_ok=True)
        raise
    if tamano == 0:
        destino.unlink(missing_ok=True)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El archivo está vacío")

    mime_final_verificado = "application/octet-stream"
    if extension in EXTENSIONES_IMAGEN:
        try:
            from PIL import Image
            with Image.open(destino) as imagen:
                formato = imagen.format or ""
                imagen.verify()
            mime_final_verificado = Image.MIME.get(formato, "application/octet-stream")
            if not mime_final_verificado.startswith("image/"):
                raise ValueError("Tipo no imagen")
        except Exception as exc:
            destino.unlink(missing_ok=True)
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Imagen inv?lida") from exc
    if es_dicom_archivo:
        try:
            import pydicom
            pydicom.dcmread(str(destino), stop_before_pixels=True, force=False)
        except Exception as exc:
            destino.unlink(missing_ok=True)
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Archivo DICOM inv?lido") from exc
    elif extension in EXTENSIONES_VIDEO:
        mime_final_verificado = {".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".avi": "video/x-msvideo", ".mkv": "video/x-matroska", ".m4v": "video/mp4"}.get(extension, "application/octet-stream")
    dimensiones = None
    # Validar el archivo ya escrito en disco y eliminarlo solo si el volumen
    # realmente no es legible.
    if es_volumen_archivo:
        try:
            from app.services.dicom_convert import inspeccionar_volumen
            dimensiones = inspeccionar_volumen(destino, extension)
        except Exception as exc:
            destino.unlink(missing_ok=True)
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Volumen NIfTI/NRRD inv?lido") from exc
        mime_final = "application/octet-stream"
    elif es_zip_dicom:
        mime_final = "application/zip"
    elif extension in EXTENSIONES_IMAGEN:
        mime_final = mime_final_verificado
    else:
        mime_final = mime_final_verificado

    examen = ExamenImagen(
        paciente_id=paciente_id,
        doctor_id=doctor_id,
        tipo=tipo,
        titulo=(titulo.strip() or nombre_archivo)[:120],
        descripcion=(descripcion[:4000] if descripcion else None),
        diente=(diente[:10] if diente else None),
        fecha=fecha_examen,
        archivo=nombre_guardado,
        mime=mime_final,
        tamano=tamano,
        dimensiones=dimensiones,
        formato_volumen=("NRRD" if extension == ".nrrd" else "NIfTI.GZ" if extension == ".nii.gz" else "NIfTI" if extension == ".nii" else None),
        marcas=[],
        notas=(notas[:4000] if notas else None),
    )
    db.add(examen)
    db.flush()
    try:
        if es_zip_dicom:
            instancias = _extraer_serie_dicom_segura(destino, examen.id)
            examen.instancias_dicom = instancias
            examen.formato_volumen = "DICOM-ZIP"
            examen.dimensiones = {"x": 1, "y": 1, "z": len(instancias)}
        db.commit()
    except Exception as exc:
        db.rollback()
        destino.unlink(missing_ok=True)
        if isinstance(exc, ValueError):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "No se pudo registrar el examen; revisa los registros del servidor") from exc
    db.refresh(examen)
    return examen


@router.patch("/pacientes/{paciente_id}/examenes/{examen_id}", response_model=ExamenImagenOut)
def actualizar_examen(
    paciente_id: int,
    examen_id: int,
    data: ExamenImagenUpdate,
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    examen = _obtener_examen(db, paciente_id, examen_id)
    _obtener_paciente(db, paciente_id, user)
    for key, value in data.model_dump(exclude_unset=True).items():
        if key == "marcas" and value is not None:
            value = [m if isinstance(m, dict) else m.model_dump() for m in value]
        setattr(examen, key, value)
    db.commit()
    db.refresh(examen)
    return examen


@router.delete("/pacientes/{paciente_id}/examenes/{examen_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_examen(paciente_id: int, examen_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)):
    examen = _obtener_examen(db, paciente_id, examen_id)
    _obtener_paciente(db, paciente_id, user)
    archivo = UPLOAD_DIR / examen.archivo
    carpeta_serie = UPLOAD_DIR / f"serie_{examen.id}"
    db.delete(examen)
    db.commit()
    if archivo.is_file():
        try:
            archivo.unlink()
        except OSError:
            pass  # si no se pudo borrar el disco, el registro ya no existe
    if carpeta_serie.is_dir():
        import shutil
        shutil.rmtree(carpeta_serie, ignore_errors=True)
