import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { Doctor, Rol, UsuarioAdmin } from '../../core/models';
import { PaginadorComponent } from '../../shared/paginador.component';
import { DialogService } from '../../shared/dialog.service';

const COLOR_ROL: Record<string, string> = {
  Administrador: 'bg-purple-100 text-purple-700 border-purple-200',
  Doctor: 'bg-sky-100 text-sky-700 border-sky-200',
  'Médico': 'bg-sky-100 text-sky-700 border-sky-200',
  'Recepción': 'bg-amber-100 text-amber-700 border-amber-200',
  Recepcionista: 'bg-amber-100 text-amber-700 border-amber-200',
  Contabilidad: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

@Component({
  selector: 'app-usuarios',
  imports: [FormsModule, DatePipe, PaginadorComponent],
  template: `
    <div class="space-y-5">
      <!-- Cabecera -->
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Usuarios</h1>
          <p class="text-sm text-slate-500">
            Cuentas de acceso al sistema: creación, edición, roles y activación.
          </p>
        </div>
        <button class="btn-primary" type="button" (click)="nuevo()">+ Nuevo usuario</button>
      </div>

      <!-- KPIs -->
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="card border-l-4 border-l-blue-600 p-4">
          <p class="label">Total de usuarios</p>
          <p class="text-3xl font-extrabold text-blue-700">{{ lista().length }}</p>
        </div>
        <div class="card border-l-4 border-l-emerald-500 p-4">
          <p class="label">Activos</p>
          <p class="text-3xl font-extrabold text-emerald-600">{{ activos() }}</p>
        </div>
        <div class="card border-l-4 border-l-slate-400 p-4">
          <p class="label">Inactivos</p>
          <p class="text-3xl font-extrabold text-slate-500">{{ lista().length - activos() }}</p>
        </div>
        <div class="card border-l-4 border-l-orange-400 p-4">
          <p class="label">Con doctor vinculado</p>
          <p class="text-3xl font-extrabold text-orange-600">{{ conDoctor() }}</p>
        </div>
      </div>

      <!-- Buscador + tabla -->
      <div class="card p-5">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-bold text-slate-800">Listado de usuarios</h2>
          <div class="flex items-center gap-2">
            <input
              class="input w-56"
              placeholder="Buscar por nombre, correo o rol…"
              [ngModel]="q()"
              (ngModelChange)="cambiarQ($event)"
            />
            <span class="text-xs text-slate-400">{{ visibles().length }} resultado(s)</span>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-100">
            <thead class="bg-slate-50">
              <tr>
                <th class="th">Usuario</th>
                <th class="th">Correo</th>
                <th class="th">Rol</th>
                <th class="th">Doctor vinculado</th>
                <th class="th">Empresas</th>
                <th class="th">Creado</th>
                <th class="th text-center">Estado</th>
                <th class="th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (u of paginaActual(); track u.id) {
                <tr class="hover:bg-slate-50">
                  <td class="td">
                    <div class="flex items-center gap-2.5">
                      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-extrabold text-blue-700">
                        {{ iniciales(u.nombre) }}
                      </span>
                      <span class="font-semibold text-slate-800">{{ u.nombre }}</span>
                    </div>
                  </td>
                  <td class="td text-xs text-slate-500">{{ u.email }}</td>
                  <td class="td">
                    <span class="badge border" [class]="colorRol(u.rol)">{{ u.rol || '—' }}</span>
                  </td>
                  <td class="td text-xs text-slate-500">{{ u.doctor || '—' }}</td>
                  <td class="td">
                    <div class="flex flex-wrap items-center gap-1">
                      @for (emp of u.empresas ?? []; track emp.id) {
                        <span
                          class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                        >
                          <span
                            class="h-1.5 w-1.5 rounded-full"
                            [style.background]="empresa.color(emp.id)"
                          ></span>
                          {{ emp.nombre }}
                          @if (emp.principal) {
                            <span class="text-amber-600">★</span>
                          }
                        </span>
                      } @empty {
                        <span class="text-xs text-slate-400">—</span>
                      }
                    </div>
                  </td>
                  <td class="td text-xs text-slate-400">{{ u.creado_en ? (u.creado_en | date: 'dd/MM/yy') : '—' }}</td>
                  <td class="td text-center">
                    <span
                      class="badge"
                      [class]="u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'"
                      >{{ u.activo ? 'Activo' : 'Inactivo' }}</span
                    >
                  </td>
                  <td class="td text-right">
                    <div class="flex justify-end gap-1.5">
                      <button class="btn-ghost px-2.5 py-1.5 text-xs" type="button" (click)="editar(u)">Editar</button>
                      <button class="btn-ghost px-2.5 py-1.5 text-xs" type="button" (click)="alternar(u)">
                        {{ u.activo ? 'Desactivar' : 'Activar' }}
                      </button>
                      <button class="btn-ghost px-2.5 py-1.5 text-xs text-red-500 hover:border-red-300" type="button" (click)="eliminar(u)">
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td class="td py-10 text-center text-slate-400" colspan="8">
                    No se encontraron usuarios con ese criterio.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-paginador
          [total]="visibles().length"
          [pageSize]="tamanoPagina()"
          [page]="pagina()"
          (pageChange)="pagina.set($event)"
          (pageSizeChange)="cambiarTamano($event)"
        />
      </div>
    </div>

    <!-- Modal usuario -->
    @if (modal()) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-primary-950/50 p-4 backdrop-blur-sm" (click)="modal.set(false)">
        <div class="card max-h-[90vh] w-full max-w-xl overflow-y-auto p-6" (click)="$event.stopPropagation()">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-extrabold text-slate-800">
              {{ editandoId() ? 'Editar usuario' : 'Nuevo usuario' }}
            </h2>
            <button class="text-slate-400 hover:text-slate-600" type="button" (click)="modal.set(false)">✕</button>
          </div>

          <form class="grid gap-4 sm:grid-cols-2" (ngSubmit)="guardar()">
            <div class="sm:col-span-2">
              <label class="label">Nombre completo *</label>
              <input class="input" name="nombre" [(ngModel)]="form.nombre" required placeholder="Nombre y apellidos">
            </div>
            <div class="sm:col-span-2">
              <label class="label">Correo electrónico *</label>
              <input class="input" type="email" name="email" [(ngModel)]="form.email" required placeholder="usuario@dentamia.com">
            </div>
            <div>
              <label class="label">Rol *</label>
              <select class="input" name="rol_id" [(ngModel)]="form.rol_id" required>
                @for (r of roles(); track r.id) {
                  <option [value]="r.id">{{ r.nombre }}</option>
                }
              </select>
            </div>
            <div>
              <label class="label">Doctor vinculado</label>
              <select class="input" name="doctor_id" [(ngModel)]="form.doctor_id">
                <option [value]="''">Sin vincular</option>
                @for (d of doctores(); track d.id) {
                  <option [value]="d.id">{{ d.nombre_completo }}</option>
                }
              </select>
            </div>
            <div class="sm:col-span-2">
              <label class="label">
                {{ editandoId() ? 'Nueva contraseña (opcional)' : 'Contraseña *' }}
              </label>
              <input
                class="input"
                type="password"
                name="password"
                [(ngModel)]="form.password"
                [required]="!editandoId()"
                placeholder="{{ editandoId() ? 'Dejar en blanco para mantener la actual' : 'Mínimo 6 caracteres' }}"
                autocomplete="new-password"
              >
              <p class="mt-1 text-[11px] text-slate-400">
                Se guarda cifrada con PBKDF2 (200 000 iteraciones); nunca se almacena en texto plano.
              </p>
            </div>
            <div class="sm:col-span-2">
              <label class="label">Empresas asignadas</label>
              <div class="flex flex-wrap gap-2">
                @for (e of empresa.lista(); track e.id) {
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                    [class]="
                      estaAsignada(e.id)
                        ? 'border-primary-300 bg-primary-50 text-primary-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    "
                    (click)="alternarEmpresa(e.id)"
                  >
                    <span class="h-2 w-2 rounded-full" [style.background]="e.color"></span>
                    {{ e.nombre }}
                  </button>
                }
              </div>
              <p class="mt-1 text-[11px] text-slate-400">
                El usuario verá y gestionará datos de las empresas seleccionadas.
              </p>
            </div>
            <div class="flex items-center gap-2 sm:col-span-2">
              <input class="h-4 w-4 accent-primary-600" type="checkbox" id="u-activo" name="activo" [(ngModel)]="form.activo">
              <label for="u-activo" class="text-sm text-slate-600">Usuario activo (puede iniciar sesión)</label>
            </div>
            @if (error()) {
              <p class="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                {{ error() }}
              </p>
            }
            <div class="flex justify-end gap-2 pt-1 sm:col-span-2">
              <button class="btn-ghost" type="button" (click)="modal.set(false)">Cancelar</button>
              <button class="btn-primary" type="submit" [disabled]="guardando()">
                {{ guardando() ? 'Guardando…' : 'Guardar' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class UsuariosComponent {
  private api = inject(ApiService);
  private dialog = inject(DialogService);
  empresa = inject(EmpresaService);

  lista = signal<UsuarioAdmin[]>([]);
  roles = signal<Rol[]>([]);
  doctores = signal<Doctor[]>([]);
  q = signal('');
  modal = signal(false);
  editandoId = signal<number | null>(null);
  guardando = signal(false);
  error = signal<string | null>(null);
  form: any = {};
  pagina = signal(1);
  tamanoPagina = signal(10);

  constructor() {
    this.cargar();
    this.api.roles().subscribe((r) => this.roles.set(r));
    this.api.doctores({ activo: '' }).subscribe((d) => this.doctores.set(d));
    this.empresa.cargar();
  }

  estaAsignada(id: number): boolean {
    return (this.form.empresa_ids ?? []).includes(id);
  }

  alternarEmpresa(id: number): void {
    const ids: number[] = [...(this.form.empresa_ids ?? [])];
    const i = ids.indexOf(id);
    if (i >= 0) ids.splice(i, 1);
    else ids.push(id);
    this.form.empresa_ids = ids;
  }

  cargar(): void {
    this.api.usuarios().subscribe((u) => {
      this.lista.set(u);
      const maxPag = Math.max(1, Math.ceil(this.visibles().length / this.tamanoPagina()));
      if (this.pagina() > maxPag) this.pagina.set(maxPag);
    });
  }

  cambiarQ(v: string): void {
    this.q.set(v);
    this.pagina.set(1);
  }

  paginaActual(): UsuarioAdmin[] {
    const ini = (this.pagina() - 1) * this.tamanoPagina();
    return this.visibles().slice(ini, ini + this.tamanoPagina());
  }

  cambiarTamano(t: number): void {
    this.tamanoPagina.set(t);
    this.pagina.set(1);
  }

  visibles = computed(() => {
    const texto = this.q().trim().toLowerCase();
    const lista = this.lista();
    if (!texto) return lista;
    return lista.filter((u) =>
      [u.nombre, u.email, u.rol ?? '', u.doctor ?? ''].some((c) => c.toLowerCase().includes(texto))
    );
  });

  activos = computed(() => this.lista().filter((u) => u.activo).length);
  conDoctor = computed(() => this.lista().filter((u) => u.doctor_id).length);

  iniciales(nombre: string): string {
    const p = nombre.trim().split(/\s+/);
    return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
  }

  colorRol(rol: string | null): string {
    return (rol && COLOR_ROL[rol]) || 'bg-slate-100 text-slate-600 border-slate-200';
  }

  nuevo(): void {
    this.form = {
      nombre: '',
      email: '',
      password: '',
      rol_id: this.roles()[0]?.id ?? 1,
      doctor_id: '',
      activo: true,
      empresa_ids: [this.empresa.actualId()],
    };
    this.editandoId.set(null);
    this.error.set(null);
    this.modal.set(true);
  }

  editar(u: UsuarioAdmin): void {
    this.form = {
      nombre: u.nombre,
      email: u.email,
      password: '',
      rol_id: u.rol_id,
      doctor_id: u.doctor_id ?? '',
      activo: u.activo,
      empresa_ids: (u.empresas ?? []).map((e) => e.id),
    };
    this.editandoId.set(u.id);
    this.error.set(null);
    this.modal.set(true);
  }

  guardar(): void {
    const nombre = String(this.form.nombre ?? '').trim();
    const email = String(this.form.email ?? '').trim();
    const password = String(this.form.password ?? '');

    if (nombre.length < 3) {
      this.error.set('El nombre debe tener al menos 3 caracteres.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      this.error.set('Ingresa un correo electrónico válido.');
      return;
    }
    if (!this.editandoId() && password.length < 6) {
      this.error.set('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (this.editandoId() && password && password.length < 6) {
      this.error.set('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    this.guardando.set(true);
    this.error.set(null);

    const doctorId = this.form.doctor_id === '' || this.form.doctor_id == null ? null : Number(this.form.doctor_id);
    const base = {
      nombre,
      email,
      rol_id: Number(this.form.rol_id),
      doctor_id: doctorId,
      activo: !!this.form.activo,
      empresa_ids: (this.form.empresa_ids ?? []) as number[],
    };

    const editando = this.editandoId() !== null;
    const req = editando
      ? this.api.actualizarUsuario(this.editandoId()!, password ? { ...base, password } : base)
      : this.api.crearUsuario({ ...base, password });

    req.subscribe({
      next: () => {
        this.guardando.set(false);
        this.modal.set(false);
        void this.dialog.success({ title: editando ? 'Usuario actualizado' : 'Usuario agregado', text: 'Los datos se guardaron correctamente.' });
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(e?.error?.detail || 'No se pudo guardar el usuario.');
        void this.dialog.apiError(e, 'No se pudo guardar el usuario.');
      },
    });
  }

  alternar(u: UsuarioAdmin): void {
    this.api.actualizarUsuario(u.id, { activo: !u.activo }).subscribe({
      next: () => { void this.dialog.success({ title: u.activo ? 'Usuario desactivado' : 'Usuario activado' }); this.cargar(); },
      error: (e) => { void this.dialog.apiError(e, 'No se pudo cambiar el estado.'); },
    });
  }

  async eliminar(u: UsuarioAdmin): Promise<void> {
    if (!await this.dialog.confirm({ title: '¿Eliminar usuario?', text: `${u.nombre} (${u.email}). Esta acción no se puede deshacer.`, confirmText: 'Eliminar usuario', danger: true })) {
      return;
    }
    this.api.eliminarUsuario(u.id).subscribe({
      next: () => { void this.dialog.success({ title: 'Usuario eliminado' }); this.cargar(); },
      error: (e) => { void this.dialog.apiError(e, 'No se pudo eliminar el usuario.'); },
    });
  }
}
