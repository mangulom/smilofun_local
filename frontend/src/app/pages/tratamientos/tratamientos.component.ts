import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { Doctor, Paciente, Plan, PlanItem, Tratamiento } from '../../core/models';
import { PaginadorComponent } from '../../shared/paginador.component';
import { DialogService } from '../../shared/dialog.service';

@Component({
  selector: 'app-tratamientos',
  imports: [FormsModule, CurrencyPipe, DatePipe, PaginadorComponent],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Tratamientos y planes</h1>
          <p class="text-sm text-slate-500">Catálogo de procedimientos y planes por paciente.</p>
        </div>
        <div class="flex gap-2">
          <button class="btn-ghost" (click)="nuevoTratamiento()">+ Tratamiento</button>
          <button class="btn-primary" (click)="nuevoPlan()">+ Nuevo plan</button>
        </div>
      </div>

      <div class="flex gap-1 border-b border-slate-200">
        <button
          class="px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px"
          [class]="tab() === 'catalogo' ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500'"
          (click)="tab.set('catalogo')"
        >Catálogo</button>
        <button
          class="px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px"
          [class]="tab() === 'planes' ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500'"
          (click)="tab.set('planes')"
        >Planes de tratamiento ({{ planes().length }})</button>
      </div>

      <!-- CATÁLOGO -->
      @if (tab() === 'catalogo') {
        <div class="card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-100">
              <thead class="bg-slate-50">
                <tr>
                  <th class="th">Tratamiento</th>
                  <th class="th">Categoría</th>
                  <th class="th">Duración</th>
                  <th class="th text-right">Precio</th>
                  <th class="th">Empresa</th>
                  <th class="th">Estado</th>
                  <th class="th text-right">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (t of paginaCatalogo(); track t.id) {
                  <tr class="hover:bg-primary-50/40">
                    <td class="td font-semibold text-slate-800">{{ t.nombre }}</td>
                    <td class="td"><span class="badge bg-blue-100 text-blue-700">{{ t.categoria || 'General' }}</span></td>
                    <td class="td text-slate-500">{{ t.duracion_min }} min</td>
                    <td class="td text-right font-bold text-blue-700">{{ t.precio | currency: 'S/':'symbol':'1.2-2' }}</td>
                    <td class="td text-xs text-slate-600">
                      <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span class="h-2 w-2 rounded-full" [style.background]="empresa.color(t.empresa_id)"></span>
                        {{ empresa.nombre(t.empresa_id) }}
                      </span>
                    </td>
                    <td class="td">
                      <span class="badge" [class]="t.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'">
                        {{ t.activo ? 'Activo' : 'Inactivo' }}
                      </span>
                    </td>
                    <td class="td text-right">
                      <button class="text-xs font-semibold text-primary-600 hover:underline" (click)="editarTratamiento(t)">Editar</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-paginador
            [total]="tratamientos().length"
            [pageSize]="tamanoCat()"
            [page]="paginaCat()"
            (pageChange)="paginaCat.set($event)"
            (pageSizeChange)="cambiarTamanoCat($event)"
          />
        </div>
      }

      <!-- PLANES -->
      @if (tab() === 'planes') {
        <div class="grid gap-4 lg:grid-cols-2">
          @for (p of paginaPlanes(); track p.id) {
            <div class="card p-5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span class="font-mono text-sm font-bold text-blue-700">{{ p.codigo }}</span>
                  <span class="ml-2 font-semibold text-slate-800">{{ p.paciente.nombre_completo }}</span>
                </div>
                <span class="badge" [class]="clasePlan(p.estado)">{{ p.estado }}</span>
              </div>
              <ul class="mt-3 space-y-1 text-sm text-slate-600">
                @for (i of p.items; track i.id) {
                  <li class="flex justify-between gap-2">
                    <span>{{ i.descripcion }} @if (i.diente) { <b class="text-primary-600">(pieza {{ i.diente }})</b> }</span>
                    <span class="font-semibold">{{ i.precio_unitario | currency: 'S/':'symbol':'1.0-0' }}</span>
                  </li>
                }
              </ul>
              <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <div class="text-xs text-slate-500">
                  Dr. {{ p.doctor.nombre_completo }} · {{ p.creado_en | date: 'dd/MM/yyyy' }}
                  @if (p.descuento > 0) { · Descuento {{ p.descuento | currency: 'S/':'symbol':'1.0-0' }} }
                </div>
                <span class="text-lg font-extrabold text-blue-700">{{ p.total | currency: 'S/':'symbol':'1.0-0' }}</span>
              </div>
              <div class="mt-3 flex gap-2">
                <select class="input flex-1 py-1.5 text-xs" [ngModel]="p.estado" (ngModelChange)="cambiarEstadoPlan(p, $event)">
                  <option value="propuesto">Propuesto</option>
                  <option value="aprobado">Aprobado</option>
                  <option value="en_progreso">En progreso</option>
                  <option value="completado">Completado</option>
                  <option value="rechazado">Rechazado</option>
                </select>
              </div>
            </div>
          } @empty {
            <p class="col-span-full py-10 text-center text-sm text-slate-400">No hay planes creados.</p>
          }
        </div>
        <app-paginador
          [total]="planes().length"
          [pageSize]="tamanoPlan()"
          [page]="paginaPlan()"
          (pageChange)="paginaPlan.set($event)"
          (pageSizeChange)="cambiarTamanoPlan($event)"
        />
      }
    </div>

    <!-- Modal tratamiento -->
    @if (modalTrat()) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-primary-950/50 p-4 backdrop-blur-sm" (click)="modalTrat.set(false)">
        <div class="card w-full max-w-lg p-6" (click)="$event.stopPropagation()">
          <h2 class="mb-4 text-lg font-extrabold text-slate-800">{{ editId() ? 'Editar' : 'Nuevo' }} tratamiento</h2>
          <form class="grid gap-4 sm:grid-cols-2" (ngSubmit)="guardarTratamiento()">
            <div class="sm:col-span-2"><label class="label">Nombre *</label><input class="input" name="nombre" [(ngModel)]="formT.nombre" required></div>
            <div><label class="label">Categoría</label><input class="input" name="categoria" [(ngModel)]="formT.categoria"></div>
            <div><label class="label">Precio (S/)</label><input class="input" type="number" step="0.5" name="precio" [(ngModel)]="formT.precio"></div>
            <div><label class="label">Duración (min)</label><input class="input" type="number" name="duracion_min" [(ngModel)]="formT.duracion_min"></div>
            <div class="sm:col-span-2"><label class="label">Descripción</label><textarea class="input" rows="2" name="descripcion" [(ngModel)]="formT.descripcion"></textarea></div>
            <div class="sm:col-span-2 flex justify-end gap-2">
              <button type="button" class="btn-ghost" (click)="modalTrat.set(false)">Cancelar</button>
              <button class="btn-primary">Guardar</button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Modal plan -->
    @if (modalPlan()) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-primary-950/50 p-4 backdrop-blur-sm" (click)="modalPlan.set(false)">
        <div class="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6" (click)="$event.stopPropagation()">
          <h2 class="mb-4 text-lg font-extrabold text-slate-800">Nuevo plan de tratamiento</h2>
          <form class="space-y-4" (ngSubmit)="guardarPlan()">
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="label">Paciente</label>
                <select class="input" name="paciente_id" [(ngModel)]="formP.paciente_id" required>
                  @for (p of pacientes(); track p.id) { <option [value]="p.id">{{ p.nombre_completo }}</option> }
                </select>
              </div>
              <div>
                <label class="label">Doctor</label>
                <select class="input" name="doctor_id" [(ngModel)]="formP.doctor_id" required>
                  @for (d of doctores(); track d.id) { <option [value]="d.id">{{ d.nombre_completo }}</option> }
                </select>
              </div>
            </div>

            <div class="rounded-xl border border-slate-200 p-4">
              <p class="label">Ítems del plan</p>
              @for (item of formP.items; track $index; let i = $index) {
                <div class="mb-2 flex flex-wrap items-center gap-2">
                  <select class="input flex-1 min-w-[220px] py-1.5 text-xs" [(ngModel)]="item.tratamiento_id" [name]="'t' + i">
                    <option [value]="null">— Personalizado —</option>
                    @for (t of tratamientos(); track t.id) { <option [value]="t.id">{{ t.nombre }} ({{ t.precio }})</option> }
                  </select>
                  <input class="input w-32 py-1.5 text-xs" placeholder="Descripción" [name]="'d' + i" [(ngModel)]="item.descripcion">
                  <input class="input w-16 py-1.5 text-xs" placeholder="Pieza" [name]="'pieza' + i" [(ngModel)]="item.diente">
                  <input class="input w-24 py-1.5 text-xs" type="number" placeholder="Precio" [name]="'p' + i" [(ngModel)]="item.precio_unitario">
                  <button type="button" class="text-red-400 hover:text-red-600" (click)="formP.items.splice(i, 1)">✕</button>
                </div>
              }
              <button type="button" class="text-sm font-semibold text-primary-600 hover:underline" (click)="agregarItem()">+ Agregar ítem</button>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div><label class="label">Descuento</label><input class="input" type="number" name="descuento" [(ngModel)]="formP.descuento"></div>
              <div class="col-span-2"><label class="label">Notas</label><input class="input" name="notas" [(ngModel)]="formP.notas"></div>
            </div>

            <div class="flex justify-between border-t border-slate-100 pt-3">
              <span class="text-sm text-slate-500">Total estimado</span>
              <span class="text-lg font-extrabold text-blue-700">{{ totalPlan() | currency: 'S/':'symbol':'1.2-2' }}</span>
            </div>

            @if (errorPlan()) { <p class="text-sm font-medium text-red-600">{{ errorPlan() }}</p> }
            <div class="flex justify-end gap-2">
              <button type="button" class="btn-ghost" (click)="modalPlan.set(false)">Cancelar</button>
              <button class="btn-primary" [disabled]="guardandoPlan()">{{ guardandoPlan() ? 'Guardando…' : 'Crear plan' }}</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class TratamientosComponent {
  private dialog = inject(DialogService);
  private api = inject(ApiService);
  empresa = inject(EmpresaService);

  tab = signal<'catalogo' | 'planes'>('catalogo');
  tratamientos = signal<Tratamiento[]>([]);
  planes = signal<Plan[]>([]);
  pacientes = signal<Paciente[]>([]);
  doctores = signal<Doctor[]>([]);
  paginaCat = signal(1);
  tamanoCat = signal(10);
  paginaPlan = signal(1);
  tamanoPlan = signal(10);

  modalTrat = signal(false);
  editId = signal<number | null>(null);
  formT: any = {};

  modalPlan = signal(false);
  guardandoPlan = signal(false);
  errorPlan = signal<string | null>(null);
  formP: any = {};

  constructor() {
    effect(() => {
      const id = this.empresa.actualId();
      this.api.pacientes({ limit: 500, empresa_id: id }).subscribe((p) => this.pacientes.set(p));
      this.api.doctores({ empresa_id: id }).subscribe((d) => this.doctores.set(d));
      this.cargar();
    });
  }

  cargar(): void {
    const id = this.empresa.actualId();
    this.api.tratamientos({ empresa_id: id }).subscribe((t) => {
      this.tratamientos.set(t);
      const maxPag = Math.max(1, Math.ceil(t.length / this.tamanoCat()));
      if (this.paginaCat() > maxPag) this.paginaCat.set(maxPag);
    });
    this.api.planes({ empresa_id: id }).subscribe((p) => {
      this.planes.set(p);
      const maxPag = Math.max(1, Math.ceil(p.length / this.tamanoPlan()));
      if (this.paginaPlan() > maxPag) this.paginaPlan.set(maxPag);
    });
  }

  paginaCatalogo(): Tratamiento[] {
    const ini = (this.paginaCat() - 1) * this.tamanoCat();
    return this.tratamientos().slice(ini, ini + this.tamanoCat());
  }

  cambiarTamanoCat(t: number): void {
    this.tamanoCat.set(t);
    this.paginaCat.set(1);
  }

  paginaPlanes(): Plan[] {
    const ini = (this.paginaPlan() - 1) * this.tamanoPlan();
    return this.planes().slice(ini, ini + this.tamanoPlan());
  }

  cambiarTamanoPlan(t: number): void {
    this.tamanoPlan.set(t);
    this.paginaPlan.set(1);
  }

  // Catálogo
  nuevoTratamiento(): void {
    this.formT = { nombre: '', categoria: '', precio: 0, duracion_min: 30, descripcion: '' };
    this.editId.set(null);
    this.modalTrat.set(true);
  }

  editarTratamiento(t: Tratamiento): void {
    this.formT = { ...t };
    this.editId.set(t.id);
    this.modalTrat.set(true);
  }

  guardarTratamiento(): void {
    const req = this.editId()
        ? this.api.actualizarTratamiento(this.editId()!, this.formT)
        : this.api.crearTratamiento({ ...this.formT, empresa_id: this.empresa.actualId() });
    const editando = this.editId() !== null;
    req.subscribe({
      next: () => { this.modalTrat.set(false); void this.dialog.success({ title: editando ? 'Tratamiento actualizado' : 'Tratamiento agregado' }); this.cargar(); },
      error: e => { void this.dialog.apiError(e, 'No se pudo guardar el tratamiento.'); },
    });
  }

  // Planes
  nuevoPlan(): void {
    this.formP = {
      paciente_id: this.pacientes()[0]?.id ?? null,
      doctor_id: this.doctores()[0]?.id ?? null,
      descuento: 0,
      notas: '',
      items: [{ tratamiento_id: null, descripcion: '', diente: '', precio_unitario: 0, cantidad: 1 }],
    };
    this.errorPlan.set(null);
    this.modalPlan.set(true);
  }

  agregarItem(): void {
    this.formP.items.push({ tratamiento_id: null, descripcion: '', diente: '', precio_unitario: 0, cantidad: 1 });
  }

  totalPlan(): number {
    const sub = (this.formP.items ?? []).reduce(
      (acc: number, i: any) => acc + Number(i.precio_unitario || 0) * Number(i.cantidad || 1),
      0
    );
    return Math.max(sub - Number(this.formP.descuento || 0), 0);
  }

  guardarPlan(): void {
    const items = (this.formP.items as any[])
      .map((i) => {
        const t = this.tratamientos().find((x) => x.id === Number(i.tratamiento_id));
        return {
          tratamiento_id: t ? t.id : null,
          descripcion: i.descripcion || t?.nombre || 'Procedimiento',
          diente: i.diente || null,
          cantidad: Number(i.cantidad || 1),
          precio_unitario: Number(i.precio_unitario || t?.precio || 0),
        };
      })
      .filter((i) => i.descripcion);
    if (!items.length) {
      this.errorPlan.set('Agrega al menos un ítem con descripción.');
      return;
    }
    this.guardandoPlan.set(true);
    this.errorPlan.set(null);
    this.api
      .crearPlan({
        paciente_id: Number(this.formP.paciente_id),
        doctor_id: Number(this.formP.doctor_id),
        descuento: Number(this.formP.descuento || 0),
      notas: this.formP.notas || null,
      empresa_id: this.empresa.actualId(),
      items,
    })
      .subscribe({
        next: () => {
          this.guardandoPlan.set(false);
          this.modalPlan.set(false);
          this.tab.set('planes');
          void this.dialog.success({ title: 'Plan creado', text: 'El plan de tratamiento se guardó correctamente.' });
          this.cargar();
        },
        error: (e) => {
          this.guardandoPlan.set(false);
          this.errorPlan.set(e?.error?.detail || 'No se pudo crear el plan.');
          void this.dialog.apiError(e, 'No se pudo crear el plan de tratamiento.');
        },
      });
  }

  cambiarEstadoPlan(p: Plan, estado: string): void {
    this.api.actualizarPlan(p.id, { estado }).subscribe({
      next: () => { void this.dialog.success({ title: 'Plan actualizado', text: `Nuevo estado: ${estado.replace('_', ' ')}.` }); this.cargar(); },
      error: e => { void this.dialog.apiError(e, 'No se pudo actualizar el plan.'); },
    });
  }

  clasePlan(estado: string): string {
    const mapa: Record<string, string> = {
      propuesto: 'bg-slate-100 text-slate-600',
      aprobado: 'bg-blue-100 text-blue-700',
      en_progreso: 'bg-amber-100 text-amber-700',
      completado: 'bg-emerald-100 text-emerald-700',
      rechazado: 'bg-red-100 text-red-600',
    };
    return mapa[estado] ?? 'bg-slate-100 text-slate-600';
  }
}
