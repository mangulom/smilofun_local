# Dentamia demo: Angular + FastAPI en un solo proyecto Vercel

## Configuración del proyecto

- Git: `mangulom/smilofun_local`, rama `demo-in-memory`.
- Root Directory: raíz del repositorio (`.`).
- `vercel.json` define el Build Command, output Angular, Function Python y rewrites `/api/*`.
- Build Command: `bash build-vercel.sh`.
- Output Directory: `frontend/dist/frontend/browser`.
- El build instala dependencias de `frontend` y `backend`, luego aplica Alembic y seed ficticio.

## Variables Vercel

Configurar en Production/Preview según el ambiente:

```text
DEMO_MODE=true
RESET_DEMO_ON_START=false
ENVIRONMENT=development
DATABASE_URL=postgresql+psycopg2://postgres.<PROJECT_REF>:<PASSWORD>@<SESSION_POOLER_HOST>:5432/postgres
SECRET_KEY=<secreto aleatorio, único de esta demo, mínimo 32 bytes>
PAYLOAD_ENCRYPTION_ENABLED=true
FERNET_KEY=<no necesaria para el demo; dejar vacía>
```

Usa la URI Session Pooler de Supabase. No la pegues en el repo ni en el chat. Si la password tiene símbolos reservados, percent-encode en la URI.

El build ejecuta `alembic upgrade head`; seed ficticio solo si no hay usuarios **y** empresas. No hay `DROP` en Postgres. Vercel Functions no vuelven a migrar/seedear en cada petición. No conectar una base con pacientes reales: cualquier esquema faltante puede recibir tablas de demo, así que usa un proyecto Supabase dedicado y vacío.

## Límites de demo

- CRUD tabular se persiste en el Postgres de demo para que sea consistente entre funciones.
- Archivos clínicos, DICOM, STL y respaldos están bloqueados; Vercel Functions limita request/response bodies a 4.5 MB.
- Envíos externos/campañas están bloqueados en el backend demo.
- Usuario semilla: `admin@dentamia.com` / `admin123`; restringe el acceso público o cámbialo antes de compartir ampliamente.
- Supabase Free puede pausar por inactividad y tiene cuotas; esta demo no tiene backups/SLA.

El endpoint `/api/health` indica `demo_mode: true` y `persistence: database` cuando usa Supabase.
