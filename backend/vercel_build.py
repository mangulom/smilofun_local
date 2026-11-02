"""Idempotently create/migrate and seed the shared demo database during deploy."""
from alembic import command
from alembic.config import Config

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.models import Empresa, Usuario, UsuarioEmpresa
from app.services.seed import seed_if_empty


def main() -> None:
    if not settings.demo_mode:
        return
    if settings.database_url.startswith("sqlite"):
        raise RuntimeError("Vercel demo needs a shared PostgreSQL DATABASE_URL")
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    command.upgrade(config, "head")
    with SessionLocal() as db:
        if db.query(Usuario).count() == 0:
            seed_if_empty(db)
        if db.query(Empresa).count() == 0:
            db.add_all([
                Empresa(nombre="SmiloFun Demo Centro", ruc="20500000001", telefono="(051) 900000001"),
                Empresa(nombre="SmiloFun Demo Norte", ruc="20500000002", telefono="(051) 900000002"),
                Empresa(nombre="SmiloFun Demo Sur", ruc="20500000003", telefono="(051) 900000003"),
            ])
            db.flush()
        companies = db.query(Empresa).order_by(Empresa.id).all()
        for user in db.query(Usuario).all():
            if db.query(UsuarioEmpresa).filter_by(usuario_id=user.id).first():
                continue
            assigned = companies if "admin" in user.email else companies[:1]
            for company in assigned:
                db.add(UsuarioEmpresa(usuario_id=user.id, empresa_id=company.id, principal=company.id == assigned[0].id))
        db.commit()
    engine.dispose()
    print("Vercel demo PostgreSQL schema ready; fictional seed is present.")


if __name__ == "__main__":
    main()
