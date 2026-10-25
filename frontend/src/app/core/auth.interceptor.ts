import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

const KEY_TOKEN = 'dentamia_token';
const KEY_USER = 'dentamia_usuario';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = localStorage.getItem(KEY_TOKEN);
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }
  return next(req).pipe(
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
