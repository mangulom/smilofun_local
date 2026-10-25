"""Conversión de volúmenes médicos (NIfTI/NRRD) a DICOM para visualización."""
from __future__ import annotations

import os
import gzip
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Tuple

import numpy as np
import pydicom
from pydicom.dataset import Dataset, FileDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid


def _normalizar_a_uint16(volumen: np.ndarray) -> np.ndarray:
    """Normaliza un volumen a uint16 para DICOM."""
    v = volumen.astype(np.float32)
    vmin = float(v.min())
    vmax = float(v.max())
    if vmax - vmin < 1e-6:
        return np.zeros_like(v, dtype=np.uint16)
    v = (v - vmin) / (vmax - vmin) * 65535.0
    return np.clip(v, 0, 65535).astype(np.uint16)


def inspeccionar_volumen(origen: Path, extension: str | None = None) -> dict[str, int]:
    """Valida que el archivo sea un volumen 3D legible y devuelve sus dimensiones."""
    extension = extension or (".nii.gz" if origen.name.lower().endswith(".nii.gz") else origen.suffix.lower())
    minimo = 352 if extension == ".nii" else 4
    if not origen.is_file() or origen.stat().st_size < minimo:
        size = origen.stat().st_size if origen.exists() else 0
        raise ValueError(f"archivo incompleto ({size} bytes); cabecera {extension} no válida")
    if extension == ".nrrd":
        import SimpleITK as sitk
        imagen = sitk.ReadImage(str(origen))
        dims = tuple(int(x) for x in imagen.GetSize())
    elif extension in {".nii", ".nii.gz"}:
        import nibabel as nib
        if extension == ".nii.gz":
            try:
                with gzip.open(origen, "rb") as comprimido:
                    cabecera = comprimido.read(352)
            except (OSError, EOFError) as exc:
                raise ValueError(f"GZIP NIfTI dañado o truncado: {exc}") from exc
            if len(cabecera) < 352:
                raise ValueError(f"NIfTI comprimido truncado: cabecera descomprimida de {len(cabecera)} bytes; se requieren 352")
            little = int.from_bytes(cabecera[0:4], "little") == 348
            big = int.from_bytes(cabecera[0:4], "big") == 348
            if not little and not big:
                raise ValueError("NIfTI-GZIP no contiene una cabecera NIfTI-1 válida")
        imagen = nib.load(str(origen))
        dims = tuple(int(x) for x in imagen.shape)
    else:
        raise ValueError("formato volumétrico no soportado")
    if len(dims) < 3 or any(x <= 1 for x in dims[:3]):
        raise ValueError(f"se requiere un volumen de al menos 3 dimensiones; encontradas: {dims}")
    if len(dims) > 3 and any(x > 1 for x in dims[3:]):
        raise ValueError(f"no se admiten volúmenes temporales 4D; dimensiones encontradas: {dims}")
    return {"x": dims[0], "y": dims[1], "z": dims[2]}


def _crear_dataset_dicom(
    pixel_array: np.ndarray,
    serie_uid: str,
    sop_instance_uid: str,
    numero_instancia: int,
    estudio_uid: str,
    paciente_id: int,
    tipo: str,
) -> FileDataset:
    """Crea un dataset DICOM válido para un corte."""
    file_meta = Dataset()
    file_meta.MediaStorageSOPClassUID = pydicom.uid.SecondaryCaptureImageStorage
    file_meta.MediaStorageSOPInstanceUID = sop_instance_uid
    file_meta.ImplementationClassUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = FileDataset(None, {}, file_meta=file_meta, preamble=b"\0" * 128)
    ds.SOPClassUID = file_meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = sop_instance_uid
    ds.StudyInstanceUID = estudio_uid
    ds.SeriesInstanceUID = serie_uid
    ds.Modality = "CT" if tipo == "tomografia" else "MR"
    ds.PatientName = f"PACIENTE^{paciente_id}"
    ds.PatientID = str(paciente_id)
    ds.StudyDate = date.today().strftime("%Y%m%d")
    ds.StudyTime = datetime.now().strftime("%H%M%S")
    ds.SeriesNumber = 1
    ds.InstanceNumber = numero_instancia
    ds.ContentDate = ds.StudyDate
    ds.ContentTime = ds.StudyTime
    ds.Rows, ds.Columns = pixel_array.shape
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.PixelData = pixel_array.tobytes()
    ds.is_little_endian = True
    ds.is_implicit_VR = False
    return ds


def convertir_a_dicom(origen: Path, destino_dir: Path, paciente_id: int, tipo: str) -> Tuple[str, int]:
    """
    Convierte NIfTI (.nii/.nii.gz) o NRRD a una serie DICOM.
    Retorna (nombre_archivo_dicom_principal, cantidad_cortes)
    """
    import nibabel as nib
    import SimpleITK as sitk

    destino_dir.mkdir(parents=True, exist_ok=True)
    extension = origen.suffix.lower()
    if extension == ".gz":
        # .nii.gz
        nombre_base = origen.name.replace(".nii.gz", "")
    else:
        nombre_base = origen.stem

    estudio_uid = generate_uid()
    serie_uid = generate_uid()

    volumen = None
    if extension == ".nrrd" or origen.suffixes[-1].lower() == ".nrrd":
        imagen = sitk.ReadImage(str(origen))
        volumen = sitk.GetArrayFromImage(imagen)  # (z, y, x)
    elif extension in (".nii", ".gz"):
        img = nib.load(str(origen))
        data = img.get_fdata()
        # nibabel suele dar (x,y,z) o (x,y,z,t); tomamos primer volumen si hay 4D
        if data.ndim == 4:
            data = data[:, :, :, 0]
        # Transponer a (z, y, x) para apilar cortes
        volumen = np.transpose(data, (2, 1, 0)) if data.ndim == 3 else data
    else:
        raise ValueError(f"Formato no soportado para conversión: {extension}")

    if volumen is None or volumen.ndim != 3:
        raise ValueError("No se pudo leer el volumen 3D")

    # Normalizar y guardar cada corte como DICOM
    archivos_creados = []
    for i in range(volumen.shape[0]):
        corte = volumen[i, :, :]
        corte_norm = _normalizar_a_uint16(corte)
        sop_uid = generate_uid()
        ds = _crear_dataset_dicom(
            corte_norm,
            serie_uid,
            sop_uid,
            i + 1,
            estudio_uid,
            paciente_id,
            tipo,
        )
        nombre_dcm = f"{uuid.uuid4().hex}_slice_{i+1:04d}.dcm"
        ruta_dcm = destino_dir / nombre_dcm
        ds.save_as(str(ruta_dcm), write_like_original=False)
        archivos_creados.append(nombre_dcm)

    # Retornamos el primer archivo como referencia; el visor DICOM puede cargar la serie
    # pero nuestro visor actual carga por URL individual. Guardamos todos los cortes.
    # Para compatibilidad con el visor actual, guardamos un archivo .dcmzip o simplemente
    # el primer corte con metadata indicando que es multi-corte
    principal = archivos_creados[0] if archivos_creados else ""
    return principal, len(archivos_creados)
