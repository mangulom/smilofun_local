import { Component, effect, inject, signal } from '@angular/core';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { Dashboard } from '../../core/models';
import { DialogService } from '../../shared/dialog.service';

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, CurrencyPipe, RouterLink],
  template: `
    <div class="space-y-6">
      <!-- Encabezado -->
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Dashboard</h1>
          <p class="text-sm text-slate-500">Resumen operativo de tu centro odontológico.</p>
        </div>
        <a routerLink="/citas" class="btn-accent">+ Nueva cita</a>
      </div>

      @if (error()) {
        <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo cargar el dashboard. ¿Está corriendo el backend en :8000?
        </div>
      }

      @if (data(); as d) {
        <!-- KPIs -->
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div class="card p-5 border-l-4 border-l-blue-500">
            <p class="label">Citas hoy</p>
            <p class="text-3xl font-extrabold text-blue-700">{{ d.citas_hoy }}</p>
            <p class="mt-1 text-xs text-slate-500">
              {{ d.citas_pendientes_confirmar }} por confirmar (7 días)
            </p>
          </div>
          <div class="card p-5 border-l-4 border-l-green-500">
            <p class="label">Ingresos del mes</p>
            <p class="text-3xl font-extrabold text-green-700">{{ d.ingresos_mes | currency: 'S/':'symbol':'1.0-0' }}</p>
            <p class="mt-1 text-xs" [class.text-emerald-600]="d.variacion_ingresos >= 0" [class.text-red-500]="d.variacion_ingresos < 0">
              {{ d.variacion_ingresos >= 0 ? '▲' : '▼' }} {{ d.variacion_ingresos }}% vs mes anterior
            </p>
          </div>
          <div class="card p-5 border-l-4 border-l-yellow-500">
            <p class="label">Pacientes nuevos (mes)</p>
            <p class="text-3xl font-extrabold text-yellow-600">{{ d.pacientes_nuevos_mes }}</p>
            <p class="mt-1 text-xs text-slate-500">{{ d.pacientes_total }} en total · {{ d.doctores_activos }} doctores</p>
          </div>
          <div class="card p-5 border-l-4 border-l-red-500">
            <p class="label">Tasa de asistencia</p>
            <p class="text-3xl font-extrabold text-red-600">{{ d.tasa_asistencia }}%</p>
            <div class="mt-2 h-1.5 w-full rounded-full bg-slate-100">
              <div class="h-1.5 rounded-full bg-red-500" [style.width.%]="d.tasa_asistencia"></div>
            </div>
          </div>
        </div>

        <div class="grid gap-6 xl:grid-cols-3">
          <!-- Serie de ingresos -->
          <div class="card p-5 xl:col-span-2">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="font-bold text-slate-800">Ingresos — últimos 12 meses</h2>
              <a routerLink="/reportes" class="text-xs font-semibold text-blue-600 hover:underline">Ver reportes →</a>
            </div>
            <div class="flex h-52 items-end gap-1.5">
              @for (m of d.serie_ingresos; track m.mes; let i = $index) {
                <div class="group relative flex flex-1 flex-col items-center justify-end h-full">
                  <div
                    class="w-full rounded-t-md transition-all"
                    [style.background]="colorBarra(i)"
                    [style.height.%]="altura(m.total, d.serie_ingresos)"
                  ></div>
                  <span class="mt-1.5 text-[9px] font-medium text-slate-400">{{ m.mes.slice(5) }}</span>
                  <span class="pointer-events-none absolute -top-7 hidden rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-semibold text-white group-hover:block">
                    {{ m.total | currency: 'S/':'symbol':'1.0-0' }}
                  </span>
                </div>
              }
            </div>
          </div>

          <!-- Próximas citas -->
          <div class="card p-5">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="font-bold text-slate-800">Próximas citas</h2>
              <a routerLink="/citas" class="text-xs font-semibold text-blue-600 hover:underline">Agenda →</a>
            </div>
            <div class="space-y-2.5">
              @for (c of d.proximas_citas; track c.id) {
                <div class="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5 hover:border-blue-200 hover:bg-blue-50/40 transition">
                  <div class="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg text-white text-xs font-bold" [style.background]="c.doctor.color">
                    {{ c.hora_inicio.slice(0, 5) }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold text-slate-800">{{ c.paciente.nombre_completo }}</p>
                    <p class="truncate text-xs text-slate-500">{{ c.fecha | date: 'dd/MM' }} · {{ c.doctor.nombre_completo }}</p>
                  </div>
                  <span class="badge" [class]="claseEstado(c.estado)">{{ estadoEsp(c.estado) }}</span>
                </div>
              } @empty {
                <p class="py-6 text-center text-sm text-slate-400">Sin citas programadas.</p>
              }
            </div>
          </div>
        </div>

        <div class="grid gap-6 xl:grid-cols-3">
          <!-- Por doctor -->
          <div class="card p-5">
            <h2 class="mb-4 font-bold text-slate-800">Citas por doctor (30 días)</h2>
            <div class="space-y-3">
              @for (doc of d.citas_por_doctor; track doc.doctor) {
                <div>
                  <div class="mb-1 flex justify-between text-xs">
                    <span class="font-medium text-slate-600">{{ doc.doctor }}</span>
                    <span class="font-bold text-slate-800">{{ doc.citas }}</span>
                  </div>
                  <div class="h-2 rounded-full bg-slate-100">
                    <div class="h-2 rounded-full" [style.width.%]="doc.citas * 100 / maxDoctor(d.citas_por_doctor)" [style.background]="doc.color"></div>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Top tratamientos -->
          <div class="card p-5">
            <h2 class="mb-4 font-bold text-slate-800">Tratamientos más rentables</h2>
            <ul class="space-y-2.5">
              @for (t of d.top_tratamientos; track t.tratamiento; let i = $index) {
                <li class="flex items-center justify-between gap-2 text-sm">
                  <span class="flex items-center gap-2 min-w-0">
                    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold" [class]="colorRank(i)">{{ i + 1 }}</span>
                    <span class="truncate text-slate-600">{{ t.tratamiento }}</span>
                  </span>
                  <span class="shrink-0 font-bold text-blue-700">{{ t.total | currency: 'S/':'symbol':'1.0-0' }}</span>
                </li>
              }
            </ul>
          </div>

          <!-- Alertas -->
          <div class="card p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
            <h2 class="mb-3 font-bold">⚡ Alertas operativas</h2>
            <ul class="space-y-3 text-sm">
              <li class="flex items-start gap-2">
                <span class="mt-0.5 text-red-400">●</span>
                <span><b>{{ d.stock_alertas }}</b> insumos con stock bajo o por vencer.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-0.5 text-yellow-400">●</span>
                <span><b>{{ d.citas_pendientes_confirmar }}</b> citas por confirmar en los próximos 7 días.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="mt-0.5 text-blue-400">●</span>
                <span>Asistencia del mes: <b>{{ d.tasa_asistencia }}%</b>.</span>
              </li>
            </ul>
            <a routerLink="/ia" class="mt-4 inline-flex w-full justify-center rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-600 transition">
              Ver recomendaciones de IA →
            </a>
          </div>
        </div>
      }
    </div>
  `,
})
export class DashboardComponent {
  private dialog = inject(DialogService);
  private api = inject(ApiService);
  empresa = inject(EmpresaService);
  data = signal<Dashboard | null>(null);
  error = signal(false);

  constructor() {
    effect(() => {
      const id = this.empresa.actualId();
      this.api.dashboard(id).subscribe({
        next: (d) => this.data.set(d),
        error: (e) => { this.error.set(true); void this.dialog.apiError(e, 'No se pudo cargar el dashboard.'); },
      });
    });
  }

  altura(total: number, serie: { total: number }[]): number {
    const max = Math.max(...serie.map((s) => s.total), 1);
    return Math.max((total / max) * 100, 3);
  }

  coloresBasicos = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#f97316', '#8b5cf6', '#06b6d4', '#ec4899'];

  colorBarra(i: number): string {
    return this.coloresBasicos[i % this.coloresBasicos.length];
  }

  coloresRank = [
    'bg-blue-100 text-blue-700',
    'bg-red-100 text-red-600',
    'bg-green-100 text-green-700',
    'bg-yellow-100 text-yellow-700',
    'bg-orange-100 text-orange-600',
    'bg-purple-100 text-purple-700',
  ];

  colorRank(i: number): string {
    return this.coloresRank[i % this.coloresRank.length];
  }

  maxDoctor(lista: { citas: number }[]): number {
    return Math.max(...lista.map((d) => d.citas), 1);
  }

  estadoEsp(estado: string): string {
    const mapa: Record<string, string> = {
      programada: 'Programada',
      confirmada: 'Confirmada',
      en_atencion: 'En atención',
      completada: 'Completada',
      cancelada: 'Cancelada',
      no_asistio: 'No asistió',
    };
    return mapa[estado] ?? estado;
  }

  claseEstado(estado: string): string {
    const mapa: Record<string, string> = {
      programada: 'bg-slate-100 text-slate-600',
      confirmada: 'bg-blue-100 text-blue-700',
      en_atencion: 'bg-amber-100 text-amber-700',
      completada: 'bg-emerald-100 text-emerald-700',
      cancelada: 'bg-red-100 text-red-600',
      no_asistio: 'bg-rose-100 text-rose-600',
    };
    return mapa[estado] ?? 'bg-slate-100 text-slate-600';
  }
}
