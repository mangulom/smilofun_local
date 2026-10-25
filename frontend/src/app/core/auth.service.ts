import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { LoginResponse, Usuario } from './models';

const KEY_TOKEN = 'dentamia_token';
const KEY_USER = 'dentamia_usuario';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly usuario = signal<Usuario | null>(this.leerUsuario());

  constructor(private http: HttpClient, private router: Router) {}

  private leerUsuario(): Usuario | null {
    try {
      const raw = localStorage.getItem(KEY_USER);
      return raw ? (JSON.parse(raw) as Usuario) : null;
    } catch {
      return null;
    }
  }

  get token(): string | null {
    return localStorage.getItem(KEY_TOKEN);
  }

  get autenticado(): boolean {
    return !!this.token;
  }

  login(email: string, password: string) {
    return this.http
      .post<LoginResponse>('/api/auth/login', { email, password })
      .pipe(
        tap((res) => {
          localStorage.setItem(KEY_TOKEN, res.access_token);
          localStorage.setItem(KEY_USER, JSON.stringify(res.usuario));
          // Al iniciar sesión, activar la empresa principal del usuario para no
          // quedar en una sucursal sin datos por una selección anterior.
          const emp = res.usuario?.empresa_id;
          if (emp) {
            localStorage.setItem('empresaActual', String(emp));
          } else {
            localStorage.removeItem('empresaActual');
          }
          this.usuario.set(res.usuario);
        })
      );
  }

  /** Refresca el perfil (rol, doctor y empresas asignadas) y lo persiste. */
  refrescar(): void {
    if (!this.token) return;
    this.http.get<Usuario>('/api/auth/me').subscribe({
      next: (u) => {
        localStorage.setItem(KEY_USER, JSON.stringify(u));
        this.usuario.set(u);
      },
    });
  }

  logout(): void {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_USER);
    this.usuario.set(null);
    this.router.navigate(['/login']);
  }
}
