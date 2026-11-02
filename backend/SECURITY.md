# Configuraci?n segura de Dentamia

## Secretos y arranque

Configura los secretos fuera del repositorio (gestor de secretos/variables protegidas):

- `DATABASE_URL`: DSN de producci?n con usuario de m?nimos privilegios.
- `SECRET_KEY`: al menos 32 bytes aleatorios para JWT. Rotarla invalida todas las sesiones.
- `FERNET_KEY`: una clave Fernet persistente. Generaci?n: `..\.venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` (desde `backend`).
- `CORS_ORIGINS`: JSON con or?genes permitidos, p. ej. `["https://dentamia.example"]`.
- `ENVIRONMENT=production`.

### Configuración local en Windows

Desde `backend`, con el entorno virtual activo, ejecuta `python init_security.py` una sola vez. El inicializador reutiliza cualquier `FERNET_KEY` existente o `backend/.fernet.key`; si no encuentra ninguna, crea una clave nueva solo para esta instalación y la guarda en `backend/.fernet.key` (excluida de Git) y `backend/.env`. No borres ni regeneres esos archivos después de cifrar datos. El backend busca `backend/.env` independientemente del directorio desde el que se ejecute `run.py`.

En producci?n, la app falla al iniciar si faltan `SECRET_KEY`/`FERNET_KEY` o se configura SQLite. La clave Fernet es irrecuperable si se pierde; conserva una copia cifrada y segregada.

## Cifrado y hashes

Bcrypt es un hash unidireccional: no se descifra ni es ?de ida y vuelta?; se verifica con bcrypt. Los hashes legacy PBKDF2 se migran a bcrypt al pr?ximo login correcto. Fernet cifra/descifra los datos que Dentamia necesita volver a mostrar: campos cl?nicos de pacientes, notas/diagn?sticos del historial, notas del odontograma y metadatos de ex?menes. Los archivos cl?nicos subidos se mantienen en disco y no se cifran autom?ticamente en esta versi?n.

Para cifrar registros existentes: primero realiza un backup restaurable, configura la clave Fernet y ejecuta desde `backend`: `..\.venv\Scripts\python.exe -m app.services.migrar_encriptacion`. El migrador es idempotente; mantenlo apagado hasta haber respaldado y decidido d?nde almacenar la clave. Si se pierden los datos cifrados con una clave desconocida, no es posible descifrarlos.

## Cifrado del payload de API

Adem?s de TLS, Dentamia cifra bodies JSON autenticados con AES-GCM cuando `FERNET_KEY` est? configurada (AES-256-GCM/Web Crypto). Se negocia una clave por sesi?n a partir de `FERNET_KEY`, el usuario autenticado y una sal `HttpOnly`; la clave maestra no se entrega. El navegador guarda la clave de sesi?n solo en memoria/`sessionStorage`. JSON de login y del endpoint de intercambio de clave son bootstrap sobre TLS. Requests con `FormData` y binarios permanecen binarios, as? que dependen de HTTPS/TLS; no se cifran como JSON.

## Operaci?n

TLS es obligatorio al publicar la app. Limita or?genes CORS, configura rate limiting compartido en el proxy, limita el tama?o de requests, protege backups con permisos de sistema de archivos, rota credenciales potencialmente expuestas y no registres datos cl?nicos ni tokens. Los archivos subidos se sirven por endpoints con bearer token, no por rutas est?ticas.
