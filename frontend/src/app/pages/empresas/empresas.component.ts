import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { Empresa } from '../../core/models';
import { PaginadorComponent } from '../../shared/paginador.component';
import { DialogService } from '../../shared/dialog.service';

const COLORES = [
  '#7c3aed',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
];

@Component({
  selector: 'app-empresas',
  imports: [FormsModule, PaginadorComponent],
  template: `
    <div class="space-y-5">
      <!-- Cabecera -->
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Empresas</h1>
          <p class="text-sm text-slate-500">
            Sedes o razones sociales que operan en SmiloFun: datos fiscales, contacto y estado.
          </p>
        </div>
        <button class="btn-primary" type="button" (click)="nuevo()">+ Nueva empresa</button>
      </div>

      <!-- KPIs -->
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="card border-l-4 border-l-blue-600 p-4">
          <p class="label">Total de empresas</p>
          <p class="text-3xl font-extrabold text-blue-700">{{ lista().length }}</p>
        </div>
        <div class="card border-l-4 border-l-emerald-500 p-4">
          <p class="label">Activas</p>
          <p class="text-3xl font-extrabold text-emerald-600">{{ activas() }}</p>
        </div>
        <div class="card border-l-4 border-l-slate-400 p-4">
          <p class="label">Inactivas</p>
          <p class="text-3xl font-extrabold text-slate-500">{{ lista().length - activas() }}</p>
        </div>
        <div class="card border-l-4 border-l-orange-400 p-4">
          <p class="label">Con RUC registrado</p>
          <p class="text-3xl font-extrabold text-orange-600">{{ conRuc() }}</p>
        </div>
      </div>

      <!-- Buscador + tabla -->
      <div class="card p-5">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-bold text-slate-800">Listado de empresas</h2>
          <div class="flex items-center gap-2">
            <input
              class="input w-56"
              placeholder="Buscar por nombre, RUC o ciudad…"
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
                <th class="th">Empresa</th>
                <th class="th">RUC</th>
                <th class="th">Contacto</th>
                <th class="th">Dirección</th>
                <th class="th text-center">Estado</th>
                <th class="th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (e of paginaActual(); track e.id) {
                <tr class="hover:bg-slate-50" [class]="esActiva(e) ? 'bg-amber-50/60' : ''">
                  <td class="td">
                    <div class="flex items-center gap-2.5">
                      <span
                        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white"
                        [style.background]="e.color || '#7c3aed'"
                      >
                        {{ iniciales(e.nombre) }}
                      </span>
                      <div>
                        <p class="font-semibold text-slate-800">{{ e.nombre }}</p>
                        @if (esActiva(e)) {
                          <span class="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                            Empresa activa
                          </span>
                        }
                      </div>
                    </div>
                  </td>
                  <td class="td text-xs text-slate-500">{{ e.ruc || '—' }}</td>
                  <td class="td text-xs text-slate-500">
                    <p>{{ e.telefono || '—' }}</p>
                    <p class="text-slate-400">{{ e.email || '—' }}</p>
                  </td>
                  <td class="td max-w-xs text-xs text-slate-500">{{ e.direccion || '—' }}</td>
                  <td class="td text-center">
                    <span
                      class="badge"
                      [class]="e.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'"
                      >{{ e.activo ? 'Activa' : 'Inactiva' }}</span
                    >
                  </td>
                  <td class="td text-right">
                    <div class="flex justify-end gap-1.5">
                      <button
                        class="btn-ghost px-2.5 py-1.5 text-xs"
                        type="button"
                        [disabled]="esActiva(e)"
                        (click)="usar(e)"
                      >
                        {{ esActiva(e) ? 'En uso' : 'Usar' }}
                      </button>
                      <button class="btn-ghost px-2.5 py-1.5 text-xs" type="button" (click)="editar(e)">
                        Editar
                      </button>
                      <button class="btn-ghost px-2.5 py-1.5 text-xs" type="button" (click)="alternar(e)">
                        {{ e.activo ? 'Desactivar' : 'Activar' }}
                      </button>
                      <button
                        class="btn-ghost px-2.5 py-1.5 text-xs text-red-500 hover:border-red-300"
                        type="button"
                        (click)="eliminar(e)"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td class="td py-10 text-center text-slate-400" colspan="6">
                    No se encontraron empresas con ese criterio.
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

    <!-- Modal empresa -->
    @if (modal()) {
      <div
        class="fixed inset-0 z-40 flex items-center justify-center bg-primary-950/50 p-4 backdrop-blur-sm"
        (click)="cerrar()"
      >
        <div class="card max-h-[90vh] w-full max-w-xl overflow-y-auto p-6" (click)="$event.stopPropagation()">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-extrabold text-slate-800">
              {{ editandoId() ? 'Editar empresa' : 'Nueva empresa' }}
            </h2>
            <button class="text-slate-400 hover:text-slate-600" type="button" (click)="cerrar()">✕</button>
          </div>

          <form class="grid gap-4 sm:grid-cols-2" (ngSubmit)="guardar()">
            <div class="sm:col-span-2">
              <label class="label">Nombre o razón social *</label>
              <input
                class="input"
                name="nombre"
                [(ngModel)]="form.nombre"
                required
                placeholder="SmiloFun Dental Centro"
              />
            </div>
            <div>
              <label class="label">RUC</label>
              <input class="input" name="ruc" [(ngModel)]="form.ruc" placeholder="20512345678" />
            </div>
            <div>
              <label class="label">Teléfono</label>
              <input class="input" name="telefono" [(ngModel)]="form.telefono" placeholder="(01) 555-0101" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Correo electrónico</label>
              <input
                class="input"
                type="email"
                name="email"
                [(ngModel)]="form.email"
                placeholder="contacto@smilofun.com"
              />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Dirección</label>
              <input
                class="input"
                name="direccion"
                [(ngModel)]="form.direccion"
                placeholder="Av. Principal 123, Lima"
              />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Color de identificación</label>
              <div class="flex flex-wrap items-center gap-2">
                @for (c of colores; track c) {
                  <button
                    type="button"
                    class="h-8 w-8 rounded-lg border-2 transition-transform hover:scale-110"
                    [class.border-slate-800]="form.color === c"
                    [class.border-transparent]="form.color !== c"
                    [style.background]="c"
                    (click)="form.color = c"
                    [attr.aria-label]="'Color ' + c"
                  ></button>
                }
                <input
                  class="input ml-1 w-32"
                  name="color"
                  [(ngModel)]="form.color"
                  placeholder="#7c3aed"
                />
              </div>
            </div>
            <div class="sm:col-span-2">
              <label class="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="activo" [(ngModel)]="form.activo" class="h-4 w-4 rounded" />
                Empresa activa
              </label>
            </div>

            @if (error()) {
              <div
                class="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
              >
                {{ error() }}
              </div>
            }

            <div class="flex justify-end gap-2 sm:col-span-2">
              <button class="btn-ghost" type="button" (click)="cerrar()">Cancelar</button>
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
export class EmpresasComponent {
  private api = inject(ApiService);
  private dialog = inject(DialogService);
  empresa = inject(EmpresaService);

  colores = COLORES;
  lista = this.empresa.lista;
  q = signal('');
  modal = signal(false);
  editandoId = signal<number | null>(null);
  guardando = signal(false);
  error = signal('');
  pagina = signal(1);
  tamanoPagina = signal(10);

  form: {
    nombre: string;
    ruc: string;
    telefono: string;
    email: string;
    direccion: string;
    color: string;
    activo: boolean;
  } = this.formVacio();

  activas = computed(() => this.lista().filter((e) => e.activo).length);
  conRuc = computed(() => this.lista().filter((e) => !!e.ruc).length);
  visibles = computed(() => {
    const t = this.q().toLowerCase().trim();
    if (!t) return this.lista();
    return this.lista().filter((e) =>
      [e.nombre, e.ruc, e.email, e.direccion, e.telefono]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t))
    );
  });

  constructor() {
    this.api.empresas().subscribe({
      next: (l) => {
        this.lista.set(l);
        const maxPag = Math.max(1, Math.ceil(this.visibles().length / this.tamanoPagina()));
        if (this.pagina() > maxPag) this.pagina.set(maxPag);
      },
      error: () => this.error.set('No se pudieron cargar las empresas.'),
    });
  }

  cambiarQ(v: string): void {
    this.q.set(v);
    this.pagina.set(1);
  }

  paginaActual(): Empresa[] {
    const ini = (this.pagina() - 1) * this.tamanoPagina();
    return this.visibles().slice(ini, ini + this.tamanoPagina());
  }

  cambiarTamano(t: number): void {
    this.tamanoPagina.set(t);
    this.pagina.set(1);
  }

  private formVacio() {
    return {
      nombre: '',
      ruc: '',
      telefono: '',
      email: '',
      direccion: '',
      color: COLORES[0],
      activo: true,
    };
  }

  iniciales(nombre: string): string {
    return nombre
      .split(' ')
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  }

  esActiva(e: Empresa): boolean {
    return e.id === this.empresa.actualId();
  }

  usar(e: Empresa): void {
    this.empresa.seleccionar(e.id);
  }

  nuevo(): void {
    this.editandoId.set(null);
    this.form = this.formVacio();
    this.error.set('');
    this.modal.set(true);
  }

  editar(e: Empresa): void {
    this.editandoId.set(e.id);
    this.form = {
      nombre: e.nombre,
      ruc: e.ruc ?? '',
      telefono: e.telefono ?? '',
      email: e.email ?? '',
      direccion: e.direccion ?? '',
      color: e.color || COLORES[0],
      activo: e.activo,
    };
    this.error.set('');
    this.modal.set(true);
  }

  cerrar(): void {
    this.modal.set(false);
    this.error.set('');
  }

  guardar(): void {
    if (!this.form.nombre.trim()) {
      this.error.set('El nombre de la empresa es obligatorio.');
      return;
    }
    this.guardando.set(true);
    this.error.set('');
    const id = this.editandoId();
    const payload = {
      nombre: this.form.nombre.trim(),
      ruc: this.form.ruc.trim() || null,
      telefono: this.form.telefono.trim() || null,
      email: this.form.email.trim() || null,
      direccion: this.form.direccion.trim() || null,
      color: this.form.color || COLORES[0],
      activo: this.form.activo,
    } as unknown as Partial<Empresa>;

    const peticion = id ? this.api.actualizarEmpresa(id, payload) : this.api.crearEmpresa(payload);
    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrar();
        void this.dialog.success({ title: id ? 'Empresa actualizada' : 'Empresa agregada', text: 'Los datos se guardaron correctamente.' });
        this.empresa.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(e?.error?.detail ?? 'No se pudo guardar la empresa.');
        void this.dialog.apiError(e, 'No se pudo guardar la empresa.');
      },
    });
  }

  alternar(e: Empresa): void {
    this.api.actualizarEmpresa(e.id, { activo: !e.activo } as Partial<Empresa>).subscribe({
      next: () => { void this.dialog.success({ title: e.activo ? 'Empresa desactivada' : 'Empresa activada' }); this.empresa.cargar(); },
      error: (err) => { this.error.set(err?.error?.detail ?? 'No se pudo cambiar el estado.'); void this.dialog.apiError(err, 'No se pudo cambiar el estado de la empresa.'); },
    });
  }

  async eliminar(e: Empresa): Promise<void> {
    if (!await this.dialog.confirm({ title: '¿Eliminar empresa?', text: `${e.nombre}. Esta acción no se puede deshacer.`, confirmText: 'Eliminar empresa', danger: true })) return;
    this.api.eliminarEmpresa(e.id).subscribe({
      next: () => this.empresa.cargar(),
      error: (err) => { this.error.set(err?.error?.detail ?? 'No se pudo eliminar la empresa.'); void this.dialog.apiError(err, 'No se pudo eliminar la empresa.'); },
    });
  }
}
