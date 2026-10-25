import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { Paciente, Sucursal } from '../../core/models';
import { PaginadorComponent } from '../../shared/paginador.component';

@Component({
  selector: 'app-pacientes',
  imports: [FormsModule, DatePipe, RouterLink, PaginadorComponent],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Pacientes</h1>
          <p class="text-sm text-slate-500">{{ lista().length }} pacientes registrados</p>
        </div>
        <div class="flex gap-2">
          <input
            class="input w-56"
            placeholder="🔍 Buscar nombre, DNI o código…"
            [(ngModel)]="busqueda"
            (ngModelChange)="buscar()"
          />
          <button class="btn-primary" (click)="abrirFormulario()">+ Nuevo paciente</button>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-100">
            <thead class="bg-slate-50">
              <tr>
                <th class="th">Código</th>
                <th class="th">Paciente</th>
                <th class="th">DNI</th>
                <th class="th">Teléfono</th>
                <th class="th">Últ. visita</th>
                <th class="th">Empresa</th>
                <th class="th">Estado</th>
                <th class="th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (p of paginaActual(); track p.id) {
                <tr class="hover:bg-primary-50/40 transition">
                  <td class="td font-mono text-xs text-blue-700">{{ p.codigo }}</td>
                  <td class="td">
                    <a [routerLink]="['/pacientes', p.id]" class="font-semibold text-slate-800 hover:text-primary-700 hover:underline">
                      {{ p.nombre_completo }}
                    </a>
                    @if (p.alergias) {
                      <span class="ml-2 badge bg-red-100 text-red-600" title="{{ p.alergias }}">⚠ Alergia</span>
                    }
                    <p class="text-xs text-slate-400">{{ p.email }}</p>
                  </td>
                  <td class="td">{{ p.dni || '—' }}</td>
                  <td class="td">{{ p.telefono || '—' }}</td>
                  <td class="td text-xs text-slate-500">{{ p.creado_en | date: 'dd/MM/yyyy' }}</td>
                  <td class="td text-xs text-slate-600">
                    <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span class="h-2 w-2 rounded-full" [style.background]="empresa.color(p.empresa_id)"></span>
                      {{ empresa.nombre(p.empresa_id) }}
                    </span>
                  </td>
                  <td class="td">
                    <span class="badge" [class]="p.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'">
                      {{ p.activo ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                  <td class="td text-right space-x-2 whitespace-nowrap">
                    <a [routerLink]="['/pacientes', p.id]" class="text-xs font-semibold text-primary-600 hover:underline">Ficha</a>
                    <button class="text-xs font-semibold text-slate-500 hover:text-primary-600" (click)="editar(p)">Editar</button>
                  </td>
                </tr>
              } @empty {
                <tr><td class="td text-center text-slate-400 py-8" colspan="8">No se encontraron pacientes.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <app-paginador
          [total]="lista().length"
          [pageSize]="tamanoPagina()"
          [page]="pagina()"
          (pageChange)="pagina.set($event)"
          (pageSizeChange)="cambiarTamano($event)"
        />
      </div>
    </div>

    <!-- Modal -->
    @if (modalAbierto()) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-primary-950/50 p-4 backdrop-blur-sm" (click)="cerrar()">
        <div class="card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6" (click)="$event.stopPropagation()">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-extrabold text-slate-800">
              {{ editandoId() ? 'Editar paciente' : 'Nuevo paciente' }}
            </h2>
            <button class="text-slate-400 hover:text-slate-600" (click)="cerrar()">✕</button>
          </div>

          <form class="grid gap-4 sm:grid-cols-2" (ngSubmit)="guardar()">
            <div><label class="label">Nombres *</label><input class="input" name="nombres" [(ngModel)]="form.nombres" required></div>
            <div><label class="label">Apellidos *</label><input class="input" name="apellidos" [(ngModel)]="form.apellidos" required></div>
            <div><label class="label">DNI</label><input class="input" name="dni" [(ngModel)]="form.dni"></div>
            <div><label class="label">Fecha de nacimiento</label><input class="input" type="date" name="fecha_nacimiento" [(ngModel)]="form.fecha_nacimiento"></div>
            <div>
              <label class="label">Sexo</label>
              <select class="input" name="sexo" [(ngModel)]="form.sexo">
                <option value="">—</option><option value="M">Masculino</option>
                <option value="F">Femenino</option><option value="O">Otro</option>
              </select>
            </div>
            <div><label class="label">Teléfono</label><input class="input" name="telefono" [(ngModel)]="form.telefono"></div>
            <div><label class="label">Email</label><input class="input" type="email" name="email" [(ngModel)]="form.email"></div>
            <div><label class="label">Tipo de sangre</label><input class="input" name="tipo_sangre" [(ngModel)]="form.tipo_sangre" placeholder="O+"></div>
            <div class="sm:col-span-2"><label class="label">Dirección</label><input class="input" name="direccion" [(ngModel)]="form.direccion"></div>
            <div class="sm:col-span-2"><label class="label">Alergias</label><input class="input" name="alergias" [(ngModel)]="form.alergias" placeholder="Penicilina, látex…"></div>
            <div class="sm:col-span-2"><label class="label">Enfermedades / antecedentes</label><input class="input" name="enfermedades" [(ngModel)]="form.enfermedades"></div>
            <div><label class="label">Contacto de emergencia</label><input class="input" name="emergencia_nombre" [(ngModel)]="form.emergencia_nombre"></div>
            <div><label class="label">Tel. emergencia</label><input class="input" name="emergencia_telefono" [(ngModel)]="form.emergencia_telefono"></div>
            <div>
              <label class="label">Centro / Sede</label>
              <select class="input" name="sucursal_id" [(ngModel)]="form.sucursal_id" required>
                @for (s of sucursales(); track s.id) { <option [value]="s.id">{{ s.nombre }}</option> }
              </select>
            </div>
            <div class="sm:col-span-2 flex justify-end gap-2 pt-2">
              <button type="button" class="btn-ghost" (click)="cerrar()">Cancelar</button>
              <button class="btn-primary" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
            </div>
            @if (error()) {
              <p class="sm:col-span-2 text-sm font-medium text-red-600">{{ error() }}</p>
            }
          </form>
        </div>
      </div>
    }
  `,
})
export class PacientesComponent {
  private api = inject(ApiService);
  empresa = inject(EmpresaService);

  lista = signal<Paciente[]>([]);
  sucursales = signal<Sucursal[]>([]);
  modalAbierto = signal(false);
  editandoId = signal<number | null>(null);
  guardando = signal(false);
  error = signal<string | null>(null);
  busqueda = '';
  pagina = signal(1);
  tamanoPagina = signal(10);

  form: any = this.formVacio();

  constructor() {
    effect(() => {
      this.empresa.actualId();
      this.cargar();
    });
    this.api.sucursales().subscribe((s) => this.sucursales.set(s));
  }

  formVacio() {
    return {
      nombres: '', apellidos: '', dni: '', fecha_nacimiento: '', sexo: '',
      telefono: '', email: '', tipo_sangre: '', direccion: '', alergias: '',
      enfermedades: '', emergencia_nombre: '', emergencia_telefono: '',
      sucursal_id: 1,
    };
  }

  cargar(): void {
    this.api
      .pacientes({ search: this.busqueda || undefined, empresa_id: this.empresa.actualId() })
      .subscribe((p) => {
        this.lista.set(p);
        const maxPag = Math.max(1, Math.ceil(p.length / this.tamanoPagina()));
        if (this.pagina() > maxPag) this.pagina.set(maxPag);
      });
  }

  buscar(): void {
    this.pagina.set(1);
    this.cargar();
  }

  paginaActual(): Paciente[] {
    const ini = (this.pagina() - 1) * this.tamanoPagina();
    return this.lista().slice(ini, ini + this.tamanoPagina());
  }

  cambiarTamano(t: number): void {
    this.tamanoPagina.set(t);
    this.pagina.set(1);
  }

  abrirFormulario(): void {
    this.form = this.formVacio();
    this.editandoId.set(null);
    this.error.set(null);
    this.modalAbierto.set(true);
  }

  editar(p: Paciente): void {
    this.form = {
      nombres: p.nombres, apellidos: p.apellidos, dni: p.dni ?? '',
      fecha_nacimiento: p.fecha_nacimiento ?? '', sexo: p.sexo ?? '',
      telefono: p.telefono ?? '', email: p.email ?? '', tipo_sangre: p.tipo_sangre ?? '',
      direccion: p.direccion ?? '', alergias: p.alergias ?? '', enfermedades: p.enfermedades ?? '',
      emergencia_nombre: p.emergencia_nombre ?? '', emergencia_telefono: p.emergencia_telefono ?? '',
      sucursal_id: p.sucursal_id,
    };
    this.editandoId.set(p.id);
    this.error.set(null);
    this.modalAbierto.set(true);
  }

  cerrar(): void {
    this.modalAbierto.set(false);
  }

  guardar(): void {
    if (!this.form.nombres || !this.form.apellidos) {
      this.error.set('Nombres y apellidos son obligatorios.');
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    const payload = { ...this.form, sucursal_id: Number(this.form.sucursal_id) };
    const req = this.editandoId()
      ? this.api.actualizarPaciente(this.editandoId()!, payload)
      : this.api.crearPaciente({ ...payload, empresa_id: this.empresa.actualId() });
    req.subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrar();
        this.cargar();
      },
      error: (err) => {
        this.guardando.set(false);
        this.error.set(err?.error?.detail || 'No se pudo guardar.');
      },
    });
  }
}
