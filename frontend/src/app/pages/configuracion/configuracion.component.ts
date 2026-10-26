import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Rol, Sucursal, Tratamiento } from '../../core/models';
import { DialogService } from '../../shared/dialog.service';

/** Usuario de equipo: la API /api/usuarios devuelve `rol` como string. */
interface EquipoUsuario {
  id: number;
  email: string;
  nombre: string;
  activo: boolean;
  rol: string | null;
}

@Component({
  selector: 'app-configuracion',
  imports: [FormsModule],
  template: `
    <div class="space-y-5">
      <div>
        <h1 class="text-2xl font-extrabold text-slate-800">Configuración</h1>
        <p class="text-sm text-slate-500">Sedes, equipo, catálogos y preferencias de la clínica.</p>
      </div>

      <!-- Cuenta -->
      <div class="card p-5 flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-blue-600">
        <div class="flex items-center gap-4">
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 text-xl font-extrabold text-white">
            {{ auth.usuario()?.nombre?.charAt(0) ?? '?' }}
          </div>
          <div>
            <p class="font-bold text-slate-800">{{ auth.usuario()?.nombre }}</p>
            <p class="text-sm text-slate-500">{{ auth.usuario()?.email }} · Rol: <span class="badge bg-blue-100 text-blue-700">{{ auth.usuario()?.rol?.nombre }}</span></p>
          </div>
        </div>
        <button class="btn-ghost" (click)="auth.logout()">Cerrar sesión</button>
      </div>

      <!-- Sedes -->
      <section class="card p-5">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-bold text-slate-800">🏥 Sedes</h2>
          <button class="btn-primary py-1.5 text-xs" (click)="nuevaSede()">+ Nueva sede</button>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          @for (s of sedes(); track s.id) {
            <div class="rounded-xl border border-slate-200 p-4 hover:border-primary-300 transition">
              <div class="flex items-start justify-between">
                <p class="font-semibold text-slate-800">{{ s.nombre }}</p>
                @if (s.activa) { <span class="badge bg-emerald-100 text-emerald-700">Activa</span> }
              </div>
              <p class="mt-1 text-xs text-slate-500">{{ s.direccion || '—' }}</p>
              <p class="text-xs text-slate-400">{{ s.telefono || '—' }}</p>
            </div>
          } @empty {
            <p class="text-sm text-slate-400">Sin sedes registradas.</p>
          }
        </div>
      </section>

      <!-- Equipo -->
      <section class="card p-5">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-bold text-slate-800">👥 Equipo de trabajo</h2>
          <span class="text-xs text-slate-400">{{ usuarios().length }} usuarios</span>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-100">
            <thead class="bg-slate-50">
              <tr>
                <th class="th">Nombre</th>
                <th class="th">Correo</th>
                <th class="th">Rol</th>
                <th class="th">Estado</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (u of usuarios(); track u.id) {
                <tr class="hover:bg-primary-50/40">
                  <td class="td font-semibold text-slate-800">{{ u.nombre }}</td>
                  <td class="td text-sm text-slate-500">{{ u.email }}</td>
                  <td class="td"><span class="badge" [class]="claseRol(u.rol)">{{ u.rol }}</span></td>
                  <td class="td">
                    <span class="badge" [class]="u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'">
                      {{ u.activo ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <div class="grid gap-6 xl:grid-cols-2">
        <!-- Catálogo -->
        <section class="card p-5">
          <h2 class="mb-4 font-bold text-slate-800">🦷 Catálogo de tratamientos</h2>
          <p class="mb-3 text-sm text-slate-500">{{ tratamientos().length }} procedimientos configurados.</p>
          <div class="flex flex-wrap gap-2">
            @for (t of tratamientos(); track t.id) {
              <span class="badge bg-blue-50 text-blue-700 border border-blue-100">{{ t.nombre }} · {{ t.precio }}</span>
            }
          </div>
          <p class="mt-4 text-xs text-slate-400">Gestión completa disponible en <b>Tratamientos → Catálogo</b>.</p>
        </section>

        <!-- Roles -->
        <section class="card p-5">
          <h2 class="mb-4 font-bold text-slate-800">🔐 Roles y permisos</h2>
          <ul class="space-y-3 text-sm">
            @for (r of roles(); track r.id) {
              <li class="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                <span class="badge" [class]="claseRol(r.nombre)">{{ r.nombre }}</span>
                <span class="text-slate-600">{{ descripcionRol(r.nombre) }}</span>
              </li>
            }
          </ul>
        </section>
      </div>

      <!-- Acerca de -->
      <section class="card p-5 bg-gradient-to-r from-blue-800 to-blue-600 text-white">
        <p class="text-lg font-extrabold"><span class="text-white">Smilo</span><span class="text-amber-400">Fun</span></p>
        <p class="text-sm text-blue-100">
          Sistema de gestión odontológica con inteligencia artificial · v1.0 ·
          Angular 19 + FastAPI + PostgreSQL 17
        </p>
      </section>
    </div>

    <!-- Modal sede -->
    @if (modalSede()) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-primary-950/50 p-4 backdrop-blur-sm" (click)="modalSede.set(false)">
        <div class="card w-full max-w-md p-6" (click)="$event.stopPropagation()">
          <h2 class="mb-4 text-lg font-extrabold text-slate-800">Nueva sede</h2>
          <form class="grid gap-4" (ngSubmit)="guardarSede()">
            <div><label class="label">Nombre *</label><input class="input" name="nombre" [(ngModel)]="formSede.nombre" required></div>
            <div><label class="label">Dirección</label><input class="input" name="direccion" [(ngModel)]="formSede.direccion"></div>
            <div><label class="label">Teléfono</label><input class="input" name="telefono" [(ngModel)]="formSede.telefono"></div>
            <div class="flex justify-end gap-2">
              <button type="button" class="btn-ghost" (click)="modalSede.set(false)">Cancelar</button>
              <button class="btn-primary">Crear</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class ConfiguracionComponent {
  private dialog = inject(DialogService);
  private api = inject(ApiService);
  auth = inject(AuthService);

  sedes = signal<Sucursal[]>([]);
  usuarios = signal<EquipoUsuario[]>([]);
  roles = signal<Rol[]>([]);
  tratamientos = signal<Tratamiento[]>([]);

  modalSede = signal(false);
  formSede: any = {};

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.api.sucursales().subscribe((s) => this.sedes.set(s));
    this.api.usuarios().subscribe((u) => this.usuarios.set(u));
    this.api.roles().subscribe((r) => this.roles.set(r));
    this.api.tratamientos().subscribe((t) => this.tratamientos.set(t));
  }

  nuevaSede(): void {
    this.formSede = { nombre: '', direccion: '', telefono: '' };
    this.modalSede.set(true);
  }

  guardarSede(): void {
    this.api.crearSucursal({ ...this.formSede, empresa_id: this.auth.usuario()?.empresa_id ?? undefined, activa: true }).subscribe({
      next: () => {
        this.modalSede.set(false);
        this.cargar();
      },
      error: (e) => { void this.dialog.apiError(e, 'No se pudo crear la sede.'); },
    });
  }

  claseRol(rol: string | null | undefined): string {
    const mapa: Record<string, string> = {
      admin: 'bg-blue-100 text-blue-700',
      recepcion: 'bg-orange-100 text-orange-700',
      doctor: 'bg-emerald-100 text-emerald-700',
    };
    if (!rol) return 'bg-slate-100 text-slate-600';
    return mapa[rol.toLowerCase()] ?? 'bg-slate-100 text-slate-600';
  }

  descripcionRol(rol: string): string {
    const mapa: Record<string, string> = {
      admin: 'Acceso total: configuración, equipo, facturación, reportes e IA.',
      recepcion: 'Agenda, pacientes, facturación e inventario.',
      doctor: 'Su agenda, ficha clínica, odontograma y planes de tratamiento.',
    };
    return mapa[rol] ?? '';
  }
}
