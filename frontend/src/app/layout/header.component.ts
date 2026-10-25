import { Component, Output, EventEmitter, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '../core/auth.service';
import { EmpresaService } from '../core/empresa.service';
import { AyudaComponent } from '../shared/ayuda.component';
import { NotificacionesComponent } from '../shared/notificaciones.component';

@Component({
  selector: 'app-header',
  imports: [DatePipe, AyudaComponent, NotificacionesComponent],
  template: `
    <header
      class="flex shrink-0 items-center justify-between border-b border-purple-900 bg-purple-950 px-6 py-3"
    >
      <!-- Izquierda: menú móvil, marca y fecha -->
      <div class="flex items-center gap-4">
        <button
          class="rounded-lg p-2 text-purple-200 transition-colors hover:bg-purple-900 lg:hidden"
          (click)="abrirSidebar.emit()"
          aria-label="Abrir menú"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div class="flex items-center gap-2">
          <img src="logo.svg" alt="SmiloFun" class="h-7 w-7 shrink-0 rounded-md" />
          <h2 class="text-lg font-bold text-white">Smilo<span class="text-amber-400">Fun</span></h2>
        </div>

        <p class="hidden text-xs text-purple-300 md:block">
          {{ hoy | date: "EEEE d 'de' MMMM, y" }}
        </p>
      </div>

      <!-- Centro: selector de empresa (solo las asignadas al usuario) -->
      @if (empresa.tieneVarias()) {
        <div class="hidden items-center gap-2 md:flex">
          <span
            class="h-2.5 w-2.5 rounded-full ring-2 ring-white/10"
            [style.background]="empresa.colorActual()"
          ></span>
          <div class="relative">
            <select
              class="cursor-pointer appearance-none rounded-lg border border-purple-800 bg-purple-900 py-2 pl-3 pr-9 text-sm font-semibold text-white outline-none transition-colors hover:bg-purple-800 focus:border-amber-400"
              [value]="empresa.actualId()"
              (change)="cambiarEmpresa($event)"
              aria-label="Empresa activa"
              title="Empresa activa"
            >
              @for (e of empresa.asignadas(); track e.id) {
                <option [value]="e.id">{{ e.nombre }}</option>
              }
            </select>
            <svg
              class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          <span
            class="hidden rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-purple-950 lg:inline-block"
            [style.background]="empresa.colorActual()"
          >
            Activa
          </span>
        </div>
      } @else if (empresa.actual()) {
        <div class="hidden items-center gap-2 md:flex" title="Empresa asignada">
          <span class="h-2.5 w-2.5 rounded-full" [style.background]="empresa.colorActual()"></span>
          <span class="text-sm font-semibold text-white">{{ empresa.nombreActual() }}</span>
        </div>
      }

      <!-- Derecha: ayuda, notificaciones, usuario -->
      <div class="flex items-center gap-3">
        <app-ayuda />
        <app-notificaciones />

        <!-- Menú de usuario -->
        <div class="relative">
          <button
            class="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-purple-900"
            (click)="menuAbierto.set(!menuAbierto())"
          >
            <div
              class="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-purple-950"
            >
              {{ iniciales() }}
            </div>
            <div class="hidden text-left md:block">
              <p class="text-sm font-semibold leading-tight text-white">
                {{ auth.usuario()?.nombre }}
              </p>
              <p class="text-[10px] font-medium uppercase tracking-wide text-amber-400">
                {{ auth.usuario()?.rol?.nombre }}
              </p>
            </div>
          </button>

          @if (menuAbierto()) {
            <div class="fixed inset-0 z-40" (click)="menuAbierto.set(false)"></div>
            <div
              class="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            >
              <div class="border-b border-slate-100 px-4 py-3">
                <p class="text-sm font-medium text-slate-800">{{ auth.usuario()?.nombre }}</p>
                <p class="text-xs text-slate-500">{{ auth.usuario()?.email }}</p>
              </div>
              <button
                class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                (click)="auth.logout()"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Cerrar Sesión
              </button>
            </div>
          }
        </div>
      </div>
    </header>
  `,
})
export class HeaderComponent {
  @Output() abrirSidebar = new EventEmitter<void>();

  auth = inject(AuthService);
  empresa = inject(EmpresaService);
  hoy = new Date();
  menuAbierto = signal(false);

  constructor() {
    this.empresa.cargar();
  }

  cambiarEmpresa(evento: Event): void {
    const id = Number((evento.target as HTMLSelectElement).value);
    if (!Number.isNaN(id)) this.empresa.seleccionar(id);
  }

  iniciales(): string {
    const nombre = this.auth.usuario()?.nombre ?? 'U';
    return nombre
      .split(' ')
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  }
}
