# Demo desplegable (datos volátiles)

## Alcance

La demo usa un SQLite anónimo en RAM (`StaticPool`) y carga los datos ficticios de `backend/app/services/seed.py` al iniciar. Las altas/cambios/bajas relacionales viven mientras el proceso está activo. Con `RESET_DEMO_ON_START=true`, se vuelven a generar al reiniciar/desplegar.

El backend fuerza `sqlite://` cuando `DEMO_MODE=true`, aunque se haya configurado accidentalmente otra `DATABASE_URL`, y aborta si `ENVIRONMENT=production`. No copies los secretos del `.env` local a ningún proveedor.

## Límites intencionales de la demo

- Uploads y descargas de imágenes clínicas/DICOM, series DICOM, STL y respaldos están deshabilitados: el modo memoria no conserva bytes ni debe fingir que los guardó.
- Configurar secretos de integraciones y enviar campañas externas está deshabilitado.
- Los registros de exámenes ficticios del seed pueden mostrarse; no tienen blobs asociados.
- Para CRUD de la interfaz se conserva el login de demo `admin@dentamia.com` / `admin123`. Cámbialo antes de hacer pública la URL o restríngela con protección de acceso del host.
- Usa solo datos ficticios; no cargues pacientes ni estudios reales.

## Variables Render (demo)

```text
DEMO_MODE=true
RESET_DEMO_ON_START=true
ENVIRONMENT=development
SECRET_KEY=<secreto aleatorio de al menos 32 bytes, no el secreto local>
PAYLOAD_ENCRYPTION_ENABLED=true
CORS_ORIGINS=["https://<tu-proyecto>.vercel.app"]
```

No configures `DATABASE_URL` ni `FERNET_KEY` para esta demo. El arranque fuerza SQLite en memoria y rechaza producción.

Comando de inicio sugerido para Render: `cd backend && python run.py` (el servicio debe exponer `PORT`; `run.py` lo respeta). El servicio Free se duerme por inactividad, así que el estado de memoria se reinicia y vuelve al seed.

## Vercel (frontend)

- Root Directory: `frontend`
- Framework: Angular (o Other)
- Build: `npm run build`
- Output Directory: `dist/frontend/browser`
- Variable de entorno/archivo público de runtime `config.ini`: `api_url=https://<tu-api-render>`

Comprueba que las rutas SPA usan fallback a `index.html`. El frontend se conecta directamente a la API HTTPS; CORS en Render debe permitir el origen exacto de Vercel.

## Producción real

No uses el modo demo para pacientes. Producción requiere PostgreSQL persistente, `DEMO_MODE=false`, `ENVIRONMENT=production`, `SECRET_KEY` y la `FERNET_KEY` original, backups probados y almacenamiento privado de objetos para los archivos clínicos. La demo no es una vía de restauración de registros reales.
