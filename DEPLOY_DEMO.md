# Demo de Dentamia en Vercel + Supabase

## Arquitectura

- Angular estático en Vercel (`frontend`).
- FastAPI como Vercel Function (entrypoint `backend/app.py`, que exporta la app de `backend/app/main.py`).
- Supabase Postgres compartido para que CRUD sea consistente entre invocaciones serverless.
- Seed ficticio de `backend/app/services/seed.py` solo cuando la base no tiene usuarios.
- Alembic crea el esquema vacío. No se ejecuta `drop_all` en Postgres.

Aunque la demo usa registros ficticios, las altas/ediciones/bajas persisten en la base Supabase del proyecto demo. No cargues datos clínicos reales.

## Límites intencionales

- Imágenes, DICOM, series, STL y backups están desactivados; no hay bucket de archivos configurado.
- No se guardan credenciales Gmail/WhatsApp/Meta ni se realizan envíos externos.
- El login demo es `admin@dentamia.com` / `admin123`; protege la URL o cambia la cuenta antes de hacerla pública.
- Supabase Free puede pausar tras 7 días sin actividad; revisa cuotas y crea un proyecto separado del de producción.

## Backend en Vercel

Importa la misma rama `demo-in-memory` como un servicio/proyecto FastAPI separado.

- Root Directory: repositorio raíz `.`
- Framework: FastAPI/Python
- Entry point: `backend/app.py` / `backend/pyproject.toml` (`tool.vercel.entrypoint = "app.main:app"`)
- Asegúrate de que Vercel instale dependencias desde `backend/requirements.txt`.
- Functions de Vercel reciben peticiones de forma serverless; Postgres es compartido, no SQLite RAM.

Environment Variables (Production y Preview según corresponda):

```text
DEMO_MODE=true
RESET_DEMO_ON_START=false
ENVIRONMENT=development
DATABASE_URL=postgresql+psycopg2://postgres.<PROJECT_REF>:<PASSWORD>@<SESSION_POOLER_HOST>:5432/postgres
SECRET_KEY=<secreto aleatorio nuevo de 32 bytes o más>
PAYLOAD_ENCRYPTION_ENABLED=true
CORS_ORIGINS=["https://<frontend-vercel-domain>"]
```

Toma host/usuario/puerto de **Supabase → Connect → Session pooler → URI**. Codifica la contraseña si contiene caracteres reservados. Nunca la pongas aquí ni en Git. No copies la contraseña o `DATABASE_URL` de este proyecto a otros sitios.

El Build Command debe ejecutar `cd backend && python vercel_build.py`; esto aplica Alembic y carga el seed solo si la base está vacía, antes de publicar. Las Functions no migran ni seed-ean en cada cold start. Verifica logs de Function y que `/api/health` devuelva `demo_mode: true` y `persistence: database`.

## Frontend en Vercel

- Root Directory: `frontend`
- Framework: Angular
- Build: `npm run build`
- Output: `dist/frontend/browser`
- `frontend/vercel.json` proporciona fallback SPA a `index.html`.
- `frontend/public/config.ini`: `api_url=https://<backend-vercel-domain>`.
- El backend debe permitir el origen exacto del frontend en `CORS_ORIGINS`.

## Seguridad/producción

No uses la configuración demo con pacientes. Producción requiere revisar controles de acceso, privacidad/regulación, PostgreSQL persistente con backups, `DEMO_MODE=false`, secretos propios, FERNET_KEY original y almacenamiento privado S3 para blobs clínicos. Vercel Hobby es de uso personal no comercial; verifica sus condiciones antes de publicar un servicio comercial.
