"""One-time/idempotent encryption of existing clinical text columns."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import encrypt_sensitive
from app.models import ExamenImagen, HistorialClinico, Odontograma, Paciente


def cifrar_datos_existentes(db: Session) -> dict[str, int]:
    updated = {"pacientes": 0, "historial": 0, "odontograma": 0, "examenes": 0}
    paciente_fields = ("alergias", "enfermedades", "medicamentos", "antecedentes", "notas", "direccion", "emergencia_nombre", "emergencia_telefono")
    historial_fields = ("motivo", "diagnostico", "tratamiento", "indicaciones", "notas")
    examen_fields = ("titulo", "descripcion", "diente", "notas")
    for model, fields, key in ((Paciente, paciente_fields, "pacientes"), (HistorialClinico, historial_fields, "historial"), (Odontograma, ("notas",), "odontograma"), (ExamenImagen, examen_fields, "examenes")):
        for row in db.execute(select(model)).scalars():
            changed = False
            for field in fields:
                old = getattr(row, field)
                new = encrypt_sensitive(old)
                if old != new:
                    setattr(row, field, new)
                    changed = True
            if changed:
                updated[key] += 1
    db.commit()
    return updated
