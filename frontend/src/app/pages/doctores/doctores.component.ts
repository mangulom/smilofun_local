import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { Doctor, Sucursal } from '../../core/models';
import { PaginadorComponent } from '../../shared/paginador.component';

@Component({
  selector: 'app-doctores',
  imports: [FormsModule, PaginadorComponent],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Doctores</h1>
          <p class="text-sm text-slate-500">{{ lista().length }} profesionales activos</p>
        </div>
        <button class="btn-primary" (click)="nuevo()">+ Nuevo doctor</button>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        @for (d of paginaActual(); track d.id) {
          <div class="card overflow-hidden">
            <div class="h-14" [style.background]="'linear-gradient(135deg, ' + d.color + ', ' + d.color + '99)'"></div>
            <div class="p-5 -mt-8">
              <div class="flex items-end gap-3">
                <div class="flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-white text-lg font-extrabold text-white shadow" [style.background]="d.color">
                  {{ d.nombres[0] }}{{ d.apellidos[0] }}
                </div>
                <div class="pb-1">
                  <p class="font-bold text-slate-800">{{ d.nombre_completo }}</p>
                  <p class="text-xs text-slate-500">{{ d.especialidad || 'Odontología general' }}</p>
                </div>
              </div>
              <dl class="mt-4 space-y-1.5 text-xs text-slate-500">
                <div class="flex justify-between"><dt>Email</dt><dd class="font-medium text-slate-700">{{ d.email || '—' }}</dd></div>
                <div class="flex justify-between"><dt>Teléfono</dt><dd class="font-medium text-slate-700">{{ d.telefono || '—' }}</dd></div>
                <div class="flex justify-between"><dt>Cédula</dt><dd class="font-medium text-slate-700">{{ d.cedula || '—' }}</dd></div>
                <div class="flex justify-between"><dt>Sede</dt><dd class="font-medium text-slate-700">{{ nombreSucursal(d.sucursal_id) }}</dd></div>
                <div class="flex justify-between">
                  <dt>Empresa</dt>
                  <dd class="flex items-center gap-1.5 font-medium text-slate-700">
                    <span class="h-2 w-2 rounded-full" [style.background]="empresa.color(d.empresa_id)"></span>
                    {{ empresa.nombre(d.empresa_id) }}
                  </dd>
                </div>
              </dl>
              <div class="mt-4 flex gap-2">
                <button class="btn-ghost flex-1 justify-center text-xs" (click)="editar(d)">Editar</button>
                <button class="btn-ghost flex-1 justify-center text-xs" (click)="alternar(d)">{{ d.activo ? 'Desactivar' : 'Activar' }}</button>
              </div>
            </div>
          </div>
        }
      </div>
      <app-paginador
        [total]="lista().length"
        [pageSize]="tamanoPagina()"
        [page]="pagina()"
        (pageChange)="pagina.set($event)"
        (pageSizeChange)="cambiarTamano($event)"
      />
    </div>

    <!-- Modal -->
    @if (modal()) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-primary-950/50 p-4 backdrop-blur-sm" (click)="modal.set(false)">
        <div class="card w-full max-w-xl p-6" (click)="$event.stopPropagation()">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-extrabold text-slate-800">{{ editandoId() ? 'Editar doctor' : 'Nuevo doctor' }}</h2>
            <button class="text-slate-400 hover:text-slate-600" (click)="modal.set(false)">✕</button>
          </div>
          <form class="grid gap-4 sm:grid-cols-2" (ngSubmit)="guardar()">
            <div><label class="label">Nombres *</label><input class="input" name="nombres" [(ngModel)]="form.nombres" required></div>
            <div><label class="label">Apellidos *</label><input class="input" name="apellidos" [(ngModel)]="form.apellidos" required></div>
            <div><label class="label">Email</label><input class="input" type="email" name="email" [(ngModel)]="form.email"></div>
            <div><label class="label">Teléfono</label><input class="input" name="telefono" [(ngModel)]="form.telefono"></div>
            <div><label class="label">Especialidad</label><input class="input" name="especialidad" [(ngModel)]="form.especialidad" placeholder="Ortodoncia…"></div>
            <div><label class="label">Cédula</label><input class="input" name="cedula" [(ngModel)]="form.cedula"></div>
            <div>
              <label class="label">Color en la agenda</label>
              <input class="input h-11 p-1" type="color" name="color" [(ngModel)]="form.color">
            </div>
            <div>
              <label class="label">Sede</label>
              <select class="input" name="sucursal_id" [(ngModel)]="form.sucursal_id" required>
                @for (s of sucursales(); track s.id) { <option [value]="s.id">{{ s.nombre }}</option> }
              </select>
            </div>
            @if (error()) { <p class="sm:col-span-2 text-sm font-medium text-red-600">{{ error() }}</p> }
            <div class="sm:col-span-2 flex justify-end gap-2 pt-1">
              <button type="button" class="btn-ghost" (click)="modal.set(false)">Cancelar</button>
              <button class="btn-primary" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class DoctoresComponent {
  private api = inject(ApiService);
  empresa = inject(EmpresaService);

  lista = signal<Doctor[]>([]);
  sucursales = signal<Sucursal[]>([]);
  modal = signal(false);
  editandoId = signal<number | null>(null);
  guardando = signal(false);
  error = signal<string | null>(null);
  form: any = {};
  pagina = signal(1);
  tamanoPagina = signal(10);

  constructor() {
    effect(() => {
      this.empresa.actualId();
      this.cargar();
    });
    this.api.sucursales().subscribe((s) => this.sucursales.set(s));
  }

  cargar(): void {
    this.api.doctores({ activo: '', empresa_id: this.empresa.actualId() }).subscribe((d) => {
      this.lista.set(d);
      const maxPag = Math.max(1, Math.ceil(d.length / this.tamanoPagina()));
      if (this.pagina() > maxPag) this.pagina.set(maxPag);
    });
  }

  paginaActual(): Doctor[] {
    const ini = (this.pagina() - 1) * this.tamanoPagina();
    return this.lista().slice(ini, ini + this.tamanoPagina());
  }

  cambiarTamano(t: number): void {
    this.tamanoPagina.set(t);
    this.pagina.set(1);
  }

  nombreSucursal(id: number): string {
    return this.sucursales().find((s) => s.id === id)?.nombre ?? '—';
  }

  nuevo(): void {
    this.form = {
      nombres: '', apellidos: '', email: '', telefono: '', especialidad: '',
      cedula: '', color: '#7C3AED', sucursal_id: this.sucursales()[0]?.id ?? 1,
    };
    this.editandoId.set(null);
    this.error.set(null);
    this.modal.set(true);
  }

  editar(d: Doctor): void {
    this.form = { ...d };
    this.editandoId.set(d.id);
    this.error.set(null);
    this.modal.set(true);
  }

  guardar(): void {
    this.guardando.set(true);
    this.error.set(null);
    const payload = { ...this.form, sucursal_id: Number(this.form.sucursal_id) };
    const req = this.editandoId()
      ? this.api.actualizarDoctor(this.editandoId()!, payload)
      : this.api.crearDoctor({ ...payload, empresa_id: this.empresa.actualId() });
    req.subscribe({
      next: () => {
        this.guardando.set(false);
        this.modal.set(false);
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(e?.error?.detail || 'No se pudo guardar.');
      },
    });
  }

  alternar(d: Doctor): void {
    this.api.actualizarDoctor(d.id, { activo: !d.activo }).subscribe({ next: () => this.cargar() });
  }
}
