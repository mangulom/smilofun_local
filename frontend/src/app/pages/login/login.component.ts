import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="min-h-screen grid lg:grid-cols-2">
      <!-- Panel de marca -->
      <div class="relative hidden lg:flex flex-col justify-between bg-gradient-to-br from-primary-800 via-primary-900 to-primary-950 p-12 text-white overflow-hidden">
        <div class="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl"></div>
        <div class="absolute -left-16 bottom-24 h-64 w-64 rounded-full bg-primary-500/40 blur-3xl"></div>

        <div class="relative flex items-center gap-3">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent shadow-lg shadow-accent/30">
            <svg class="h-7 w-7 text-primary-900" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4c-1.5-1.5-4-2-6-1C3.5 4.2 2.5 7 3 10c.4 2.4 1.5 4.6 2.4 6.8.6 1.5 1 3.2 2.1 3.2 1 0 1.3-1.2 1.6-2.6.3-1.4.6-2.8 1.4-2.8h.1c.8 0 1.1 1.4 1.4 2.8.3 1.4.6 2.6 1.6 2.6 1.1 0 1.5-1.7 2.1-3.2C19.5 14.6 20.6 12.4 21 10c.5-3-.5-5.8-3-7-2-1-4.5-.5-6 1z" />
            </svg>
          </div>
          <span class="text-2xl font-extrabold tracking-tight"
            ><span class="text-white">Smilo</span><span class="text-amber-400">Fun</span></span
          >
        </div>

        <div class="relative max-w-md">
          <h1 class="text-4xl font-extrabold leading-tight">
            Tu clínica odontológica,
            <span class="text-accent-400">anticipándose al futuro</span>
          </h1>
          <p class="mt-4 text-primary-200 leading-relaxed">
            Agenda, pacientes, odontograma, facturación e inteligencia artificial predictiva
            en una sola plataforma.
          </p>
          <ul class="mt-8 space-y-3 text-sm">
            @for (f of beneficios; track f) {
              <li class="flex items-center gap-3">
                <span class="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-primary-900">✓</span>
                {{ f }}
              </li>
            }
          </ul>
        </div>

        <p class="relative text-xs text-primary-300">© 2026 <span class="font-semibold text-white">Smilo</span><span class="font-semibold text-amber-400">Fun</span> · Postgres 17 · FastAPI · Angular 19</p>
      </div>

      <!-- Formulario -->
      <div class="flex items-center justify-center p-6 sm:p-12 bg-slate-50">
        <div class="w-full max-w-md">
          <div class="card p-8">
            <div class="mb-6 flex items-center gap-3 lg:hidden">
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-700 text-accent-400 font-extrabold">S</div>
              <span class="rounded-xl bg-primary-900 px-3 py-1.5 text-xl font-extrabold tracking-tight"
                ><span class="text-white">Smilo</span><span class="text-amber-400">Fun</span></span
              >
            </div>
            <h2 class="text-2xl font-extrabold text-slate-800">Bienvenido de vuelta</h2>
            <p class="mt-1 text-sm text-slate-500">Ingresa a tu panel de gestión odontológica.</p>

            <form class="mt-6 space-y-4" (ngSubmit)="ingresar()">
              <div>
                <label class="label" for="email">Correo electrónico</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  class="input"
                  placeholder="admin@dentamia.com"
                  [(ngModel)]="email"
                  required
                />
              </div>
              <div>
                <label class="label" for="password">Contraseña</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  class="input"
                  placeholder="••••••••"
                  [(ngModel)]="password"
                  required
                />
              </div>

              @if (error()) {
                <div class="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-700">
                  {{ error() }}
                </div>
              }

              <button class="btn-primary w-full justify-center py-3" [disabled]="cargando()">
                @if (cargando()) {
                  <span class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
                  Ingresando…
                } @else {
                  Iniciar sesión
                }
              </button>
            </form>

            <div class="mt-6 rounded-xl bg-primary-50 border border-primary-100 p-4 text-xs text-primary-800">
              <p class="font-bold uppercase tracking-wide text-primary-600 mb-1">Cuentas demo</p>
              <p><b>admin&#64;dentamia.com</b> · admin123 (administrador)</p>
              <p><b>recepcion&#64;dentamia.com</b> · recep123 (recepción)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = 'admin@dentamia.com';
  password = 'admin123';
  cargando = signal(false);
  error = signal<string | null>(null);

  readonly beneficios = [
    'Agenda inteligente por doctor con detección de conflictos',
    'Odontograma digital y ficha clínica completa',
    'Facturación, caja e inventario con alertas',
    'IA: predicción de inasistencia y proyección de ingresos',
  ];

  ingresar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => {
        const redirect =
          this.route.snapshot.queryParamMap.get('redirect') || '/dashboard';
        this.router.navigateByUrl(redirect);
      },
      error: (err) => {
        this.cargando.set(false);
        this.error.set(err?.error?.detail || 'No se pudo iniciar sesión. Verifica que el backend esté corriendo.');
      },
    });
  }
}
