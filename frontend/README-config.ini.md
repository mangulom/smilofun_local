# Configurar la URL de API manualmente

El frontend carga `config.ini` antes de iniciar Angular. El archivo se publica como
`/config.ini`, así que cambiarlo no requiere recompilar la aplicación.

```ini
; Deja vacío para usar el proxy local de desarrollo
api_url=

; Para apuntar directamente a otro backend:
; api_url=http://192.168.1.50:8001
```

- Desarrollo: edita `frontend/public/config.ini`. Reinicia `npm start` si el servidor
  no detecta el cambio; recarga el navegador.
- Build: edita `frontend/dist/frontend/browser/config.ini` después de compilar y antes
  de distribuir/servir el frontend.
- `api_url` debe ser el origen del backend (`http://host:puerto`), sin `/api` al final.
- Usa un origen HTTPS para la app y el backend cuando se publique con HTTPS. El navegador
  bloqueará solicitudes HTTP mixtas.

El backend está configurado para permitir cualquier origen CORS (`*`). Debido a esa
política, CORS no permite cookies/credenciales; la API usa el token Bearer de la app.
