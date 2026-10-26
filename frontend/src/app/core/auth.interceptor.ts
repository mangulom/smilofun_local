import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { apiUrl } from './runtime-config';
import { finalize } from 'rxjs';
import { LoadingService } from '../shared/loading.service';

const KEY_TOKEN = 'dentamia_token';
const KEY_USER = 'dentamia_usuario';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const loading = inject(LoadingService);
  if (req.url === '/api' || req.url.startsWith('/api/')) req = req.clone({ url: apiUrl(req.url) });
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
  const fileUpload = req.body instanceof FormData || req.body instanceof Blob;
  const loadingMessage = isMutation
    ? fileUpload ? 'SUBIENDO ARCHIVO' : 'GUARDANDO CAMBIOS'
    : loadingMessageFor(req.url);
  const loadingId = loadingMessage ? loading.show(loadingMessage) : null;
  const token = localStorage.getItem(KEY_TOKEN);
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }
  return next(req).pipe(
    finalize(() => { if (loadingId !== null) loading.hide(loadingId); }),
    catchError((err: HttpErrorResponse) => {
      // Sesión expirada o token inválido: limpiar y volver al login en vez de
      // dejar las pantallas vacías sin explicación.
      const esLogin = req.url.includes('/api/auth/login');
      if (err.status === 401 && !esLogin) {
        localStorage.removeItem(KEY_TOKEN);
        localStorage.removeItem(KEY_USER);
        router.navigate(['/login'], { queryParams: { redirect: router.url } });
      }
      return throwError(() => err);
    })
  );
};

function loadingMessageFor(url: string): string | null {
  if (!url.includes('/api/')) return null;
  if (url.includes('/examenes/')) return 'CARGANDO ESTUDIOS E IMÁGENES';
  if (url.includes('/pacientes')) return 'OBTENIENDO DATOS DEL PACIENTE';
  if (url.includes('/citas')) return 'OBTENIENDO AGENDA';
  if (url.includes('/doctores')) return 'OBTENIENDO LISTA DE DOCTORES';
  if (url.includes('/facturas')) return 'OBTENIENDO FACTURAS';
  if (url.includes('/productos')) return 'OBTENIENDO INVENTARIO';
  if (url.includes('/proveedores')) return 'OBTENIENDO PROVEEDORES';
  if (url.includes('/compras-insumos')) return 'OBTENIENDO COMPRAS';
  if (url.includes('/tratamientos') || url.includes('/planes')) return 'OBTENIENDO TRATAMIENTOS Y PLANES';
  if (url.includes('/empresas')) return 'OBTENIENDO EMPRESAS';
  if (url.includes('/usuarios')) return 'OBTENIENDO USUARIOS';
  if (url.includes('/reportes')) return 'PREPARANDO REPORTES';
  if (url.includes('/ia/')) return 'ANALIZANDO DATOS';
  if (url.includes('/diseno3d')) return 'OBTENIENDO DATOS DE DISEÑO 3D';
  if (url.includes('/respaldos')) return 'OBTENIENDO RESPALDOS';
  if (url.includes('/dashboard')) return 'ACTUALIZANDO DASHBOARD';
  if (url.includes('/sucursales')) return 'OBTENIENDO SEDES';
  return 'OBTENIENDO INFORMACIÓN';
}
