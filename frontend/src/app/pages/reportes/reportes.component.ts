import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';

@Component({
  selector: 'app-reportes',
  imports: [FormsModule, CurrencyPipe],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Reportes y métricas</h1>
          <p class="text-sm text-slate-500">Analítica de la clínica para la toma de decisiones.</p>
        </div>
        <div class="flex items-end gap-2">
          <div>
            <label class="label">Desde</label>
            <input class="input w-40" type="date" [(ngModel)]="desde" (ngModelChange)="cargar()" />
          </div>
          <div>
            <label class="label">Hasta</label>
            <input class="input w-40" type="date" [(ngModel)]="hasta" (ngModelChange)="cargar()" />
          </div>
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="card p-5 border-l-4 border-l-blue-500">
          <p class="label">Ingresos del período</p>
          <p class="text-3xl font-extrabold text-blue-700">{{ ingresos()?.total | currency: 'S/':'symbol':'1.0-0' }}</p>
          <p class="text-xs text-slate-500 mt-1">Promedio mensual {{ ingresos()?.promedio | currency: 'S/':'symbol':'1.0-0' }}</p>
        </div>
        <div class="card p-5 border-l-4 border-l-orange-500">
          <p class="label">Citas totales</p>
          <p class="text-3xl font-extrabold text-orange-600">{{ totalCitas() }}</p>
          <p class="text-xs text-slate-500 mt-1">en el rango seleccionado</p>
        </div>
        <div class="card p-5 border-l-4 border-l-green-500">
          <p class="label">Procedimientos facturados</p>
          <p class="text-3xl font-extrabold text-green-700">{{ totalProcedimientos() }}</p>
          <p class="text-xs text-slate-500 mt-1">líneas de detalle</p>
        </div>
      </div>

      <div class="grid gap-6 xl:grid-cols-2">
        <!-- Ingresos por mes -->
        <div class="card p-5">
          <h2 class="mb-4 font-bold text-slate-800">Ingresos por mes</h2>
          <div class="flex h-56 items-end gap-2">
            @for (m of ingresos()?.detalle ?? []; track m.mes; let i = $index) {
              <div class="group relative flex flex-1 flex-col items-center justify-end h-full">
                <div
                  class="w-full rounded-t-md transition-all"
                  [style.background]="colorBarra(i)"
                  [style.height.%]="altura(m.total)"
                ></div>
                <span class="mt-1.5 text-[9px] font-semibold text-slate-500">{{ m.mes.slice(2) }}</span>
                <span class="pointer-events-none absolute -top-6 hidden rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                  {{ m.total | currency: 'S/':'symbol':'1.0-0' }}
                </span>
              </div>
            } @empty {
              <p class="self-center w-full text-center text-sm text-slate-400">Sin datos en el rango.</p>
            }
          </div>
        </div>

        <!-- Citas por estado -->
        <div class="card p-5">
          <h2 class="mb-4 font-bold text-slate-800">Distribución de citas</h2>
          <div class="space-y-3">
            @for (e of estados(); track e.estado) {
              <div>
                <div class="mb-1 flex justify-between text-xs">
                  <span class="font-medium text-slate-600">{{ etiquetaEstado(e.estado) }}</span>
                  <span class="font-bold text-slate-800">{{ e.cantidad }} · {{ e.porcentaje }}%</span>
                </div>
                <div class="h-2.5 rounded-full bg-slate-100">
                  <div class="h-2.5 rounded-full" [style.width.%]="e.porcentaje" [style.background]="colorEstado(e.estado)"></div>
                </div>
              </div>
            } @empty {
              <p class="py-6 text-center text-sm text-slate-400">Sin citas en el rango.</p>
            }
          </div>
        </div>

        <!-- Por doctor -->
        <div class="card p-5">
          <h2 class="mb-4 font-bold text-slate-800">Desempeño por doctor</h2>
          <table class="min-w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th class="py-2">Doctor</th>
                <th class="py-2 text-right">Citas atendidas</th>
                <th class="py-2 text-right">Producción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (d of doctores(); track d.doctor) {
                <tr>
                  <td class="py-2.5 font-semibold text-slate-700">
                    <span class="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" [style.background]="d.color"></span>
                    {{ d.doctor }}
                  </td>
                  <td class="py-2.5 text-right font-bold text-slate-800">{{ d.citas }}</td>
                  <td class="py-2.5 text-right font-bold text-blue-700">{{ d.ingresos | currency: 'S/':'symbol':'1.0-0' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Top tratamientos -->
        <div class="card p-5">
          <h2 class="mb-4 font-bold text-slate-800">Top procedimientos facturados</h2>
          <table class="min-w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th class="py-2">Procedimiento</th>
                <th class="py-2 text-right">Cant.</th>
                <th class="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (t of tratamientos(); track t.tratamiento) {
                <tr>
                  <td class="py-2.5 font-medium text-slate-700">{{ t.tratamiento }}</td>
                  <td class="py-2.5 text-right">{{ t.cantidad }}</td>
                  <td class="py-2.5 text-right font-bold text-blue-700">{{ t.total | currency: 'S/':'symbol':'1.0-0' }}</td>
                </tr>
              } @empty {
                <tr><td class="py-6 text-center text-slate-400" colspan="3">Sin datos.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class ReportesComponent {
  private api = inject(ApiService);
  empresa = inject(EmpresaService);

  desde = `${new Date().getFullYear()}-01-01`;
  hasta = new Date().toISOString().slice(0, 10);

  ingresos = signal<{ detalle: { mes: string; total: number }[]; total: number; promedio: number } | null>(null);
  estados = signal<{ estado: string; cantidad: number; porcentaje: number }[]>([]);
  doctores = signal<{ doctor: string; citas: number; ingresos: number; color: string }[]>([]);
  tratamientos = signal<{ tratamiento: string; cantidad: number; total: number }[]>([]);

  constructor() {
    effect(() => {
      this.empresa.actualId();
      this.cargar();
    });
  }

  cargar(): void {
    const r = { desde: this.desde, hasta: this.hasta, empresa_id: this.empresa.actualId() };
    this.api.reporteIngresos(r).subscribe((i) => this.ingresos.set(i));
    this.api.reporteCitas(r).subscribe((e) => this.estados.set(e));
    this.api.reporteDoctores(r).subscribe((d) => this.doctores.set(d));
    this.api.reporteTratamientos(r).subscribe((t) => this.tratamientos.set(t));
  }

  altura(total: number): number {
    const max = Math.max(...(this.ingresos()?.detalle ?? []).map((d) => d.total), 1);
    return Math.max((total / max) * 100, 3);
  }

  coloresBasicos = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#f97316', '#8b5cf6', '#06b6d4', '#ec4899'];

  colorBarra(i: number): string {
    return this.coloresBasicos[i % this.coloresBasicos.length];
  }

  totalCitas(): number {
    return this.estados().reduce((a, e) => a + e.cantidad, 0);
  }

  totalProcedimientos(): number {
    return this.tratamientos().reduce((a, t) => a + t.cantidad, 0);
  }

  etiquetaEstado(estado: string): string {
    const mapa: Record<string, string> = {
      programada: 'Programadas', confirmada: 'Confirmadas', en_atencion: 'En atención',
      completada: 'Completadas', cancelada: 'Canceladas', no_asistio: 'No asistieron',
    };
    return mapa[estado] ?? estado;
  }

  colorEstado(estado: string): string {
    const mapa: Record<string, string> = {
      programada: '#94a3b8', confirmada: '#3b82f6', en_atencion: '#facc15',
      completada: '#22c55e', cancelada: '#ef4444', no_asistio: '#ec4899',
    };
    return mapa[estado] ?? '#94a3b8';
  }
}
