from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import (
    auth,
    citas,
    compras,
    configuracion,
    dashboard,
    diseno3d,
    doctores,
    examenes,
    facturacion,
    ia,
    inventario,
    pacientes,
    proveedores,
    reportes,
    respaldos,
    tratamientos,
)
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 1) Crea tablas nuevas (empresas, usuario_empresas).
    Base.metadata.create_all(bind=engine)

    # 2) Migración ligera: agrega empresa_id, siembra empresas y backfilla.
    try:
        from sqlalchemy import text
        from sqlalchemy import inspect

        from app.models import Empresa, Usuario, UsuarioEmpresa

        tablas = [
            "pacientes",
            "citas",
            "doctores",
            "facturas",
            "productos",
            "proveedores",
            "compras_insumo",
            "examenes_imagen",
            "tratamientos",
            "planes_tratamiento",
        ]

        # a) Semilla de empresas ANTES de cualquier backfill (idempotente)
        db = SessionLocal()
        try:
            semilla = [
                ("SmiloFun Dental Centro", "20512345678", "(051) 938977259"),
                ("SmiloFun Dental Norte", "20545678901", "(051) 938977260"),
                ("SmiloFun Dental Sur", "20598765432", "(051) 938977261"),
            ]
            for nombre, ruc, tel in semilla:
                if db.query(Empresa).filter_by(nombre=nombre).first() is None:
                    db.add(Empresa(nombre=nombre, ruc=ruc, telefono=tel))
            db.commit()

            principal = db.query(Empresa).order_by(Empresa.id).first()
            empresas = db.query(Empresa).order_by(Empresa.id).all()
        finally:
            db.close()

        # b) Columnas empresa_id: una transacción por tabla para no anular el resto
        # Sucursales quedan vinculadas a empresas; null significa sede compartida.
        columnas_sucursales = {c["name"] for c in inspect(engine).get_columns("sucursales")}
        if "empresa_id" not in columnas_sucursales:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE sucursales ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)"))

        for tabla in tablas:
            with engine.begin() as conn:
                existe = conn.execute(
                    text(
                        "SELECT 1 FROM information_schema.columns "
                        "WHERE table_name = :t AND column_name = 'empresa_id'"
                    ),
                    {"t": tabla},
                ).first()
                if not existe:
                    conn.execute(
                        text(
                            f"ALTER TABLE {tabla} "
                            "ADD COLUMN empresa_id INTEGER REFERENCES empresas(id)"
                        )
                    )
                conn.execute(
                    text(f"UPDATE {tabla} SET empresa_id = :e WHERE empresa_id IS NULL"),
                    {"e": principal.id},
                )

        # Metadata para diferenciar volúmenes clínicos por su formato original.
        columnas_examenes = {c["name"] for c in inspect(engine).get_columns("examenes_imagen")}
        if "dimensiones" not in columnas_examenes:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE examenes_imagen ADD COLUMN dimensiones JSON NULL"))
        if "formato_volumen" not in columnas_examenes:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE examenes_imagen ADD COLUMN formato_volumen VARCHAR(20) NULL"))
        if "instancias_dicom" not in columnas_examenes:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE examenes_imagen ADD COLUMN instancias_dicom JSON NULL"))

        # c) Vínculos usuario ↔ empresas (multiempresa; admin en todas)
        db = SessionLocal()
        try:
            for usuario in db.query(Usuario).all():
                if db.query(UsuarioEmpresa).filter_by(usuario_id=usuario.id).first():
                    continue
                enlaces = empresas if "admin" in usuario.email else empresas[:1]
                for emp in enlaces:
                    db.add(
                        UsuarioEmpresa(
                            usuario_id=usuario.id,
                            empresa_id=emp.id,
                            principal=emp.id == enlaces[0].id,
                        )
                    )
            db.commit()
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 — la migración no debe bloquear el arranque
        print(f"[Multiempresa] Migración pospuesta: {exc}")

    # 3) Entrena la IA con el histórico disponible.
    try:
        from app.services import ia as ia_service

        db = SessionLocal()
        try:
            ia_service.entrenar(db)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 — el entrenamiento no debe bloquear el arranque
        print(f"[IA] Entrenamiento pospuesto: {exc}")
    yield


app = FastAPI(
    title="SmiloFun API",
    description="API de gestión de centros odontológicos con IA predictiva.",
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router,
    pacientes.router,
    examenes.router,
    doctores.router,
    citas.router,
    tratamientos.router,
    facturacion.router,
    inventario.router,
    proveedores.router,
    compras.router,
    dashboard.router,
    reportes.router,
    ia.router,
    configuracion.router,
    diseno3d.router,
    respaldos.router,
):
    app.include_router(router)

# Archivos estáticos: radiografías, fotos clínicas y escaneos subidos
_uploads = Path(__file__).resolve().parent.parent / "uploads"
_uploads.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads)), name="uploads")


@app.get("/api/health", tags=["Salud"])
def health():
    return {"status": "ok", "app": settings.app_name, "version": settings.app_version}
