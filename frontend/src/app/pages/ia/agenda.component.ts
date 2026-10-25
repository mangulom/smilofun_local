import { Component, effect, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';

interface HoraOcupacion {
  hora: string;
  citas: number;
}

interface DiaOcupacion {
  dia: string;
  citas: number;
}

interface ForecastDia {
  fecha: string;
  dia: string;
  esperado: number;
  agendadas: number;
}

@Component({
  selector: 'app-ia-agenda',
  imports: [FormsModule, DatePipe, DecimalPipe],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Agenda inteligente</h1>
          <p class="text-sm text-slate-500">
            Patrones de ocupación por hora y día, y pronóstico de demanda para las próximas citas.
          </p>
        </div>
        <div class="flex items-end gap-2">
          <div>
            <label class="label">Pronóstico</label>
            <select class="input w-32" [(ngModel)]="diasForecast" (ngModelChange)="cargar()">
              <option [ngValue]="7">7 días</option>
              <option [ngValue]="14">14 días</option>
              <option [ngValue]="30">30 días</option>
            </select>
          </div>
          <button class="btn-ghost" type="button" (click)="cargar()" [disabled]="cargando()">
            {{ cargando() ? 'Actualizando…' : '⟳ Actualizar' }}
          </button>
        </div>
      </div>

      @if (recomendaciones().length) {
        <div class="card border-l-4 border-l-blue-500 p-5">
          <h2 class="mb-3 font-bold text-slate-800">Recomendaciones</h2>
          <ul class="space-y-2">
            @for (r of recomendaciones(); track r) {
              <li class="flex items-start gap-2 text-sm text-slate-600">
                <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"></span>{{ r }}
              </li>
            }
          </ul>
        </div>
      }

      <div class="grid gap-6 xl:grid-cols-2">
        <!-- Ocupación por hora -->
        <div class="card p-5">
          <h2 class="mb-4 font-bold text-slate-800">Ocupación por hora (30 días)</h2>
          <div class="space-y-1.5">
            @for (h of horas(); track h.hora) {
              <div class="flex items-center gap-3 text-xs">
                <span class="w-12 text-slate-400">{{ h.hora }}</span>
                <div class="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div class="h-full rounded-full bg-blue-500" [style.width.%]="pctHora(h.citas)"></div>
                </div>
                <span class="w-8 text-right font-semibold text-slate-600">{{ h.citas }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Ocupación por día -->
        <div class="card p-5">
          <h2 class="mb-4 font-bold text-slate-800">Ocupación por día (30 días)</h2>
          <div class="flex h-52 items-end gap-3">
            @for (d of dias(); track d.dia) {
              <div class="group relative flex flex-1 flex-col items-center justify-end h-full">
                <span class="pointer-events-none absolute -top-5 text-[10px] font-semibold text-slate-500">{{ d.citas }}</span>
                <div class="w-full rounded-t-lg bg-gradient-to-t from-blue-600 to-blue-400" [style.height.%]="pctDia(d.citas)"></div>
                <span class="mt-1.5 text-[11px] uppercase text-slate-400">{{ d.dia }}</span>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Pronóstico -->
      <div class="card overflow-hidden">
        <div class="border-b border-slate-100 px-5 py-3">
          <h2 class="font-bold text-slate-800">Pronóstico de demanda</h2>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th class="px-4 py-3">Fecha</th>
              <th class="px-4 py-3">Día</th>
              <th class="px-4 py-3">Agendadas</th>
              <th class="px-4 py-3">Esperado</th>
              <th class="px-4 py-3">Cobertura</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (f of forecast(); track f.fecha) {
              <tr class="transition hover:bg-slate-50">
                <td class="px-4 py-2.5 text-slate-600">{{ f.fecha | date: 'dd/MM/yyyy' }}</td>
                <td class="px-4 py-2.5 capitalize text-slate-500">{{ f.dia }}</td>
                <td class="px-4 py-2.5 font-semibold text-slate-700">{{ f.agendadas }}</td>
                <td class="px-4 py-2.5 text-slate-500">{{ f.esperado | number: '1.0-1' }}</td>
                <td class="px-4 py-2.5">
                  <div class="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                    <div class="h-full rounded-full" [class]="coberturaColor(f)" [style.width.%]="cobertura(f)"></div>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="px-4 py-8 text-center text-slate-400">Sin pronóstico.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class IaAgendaComponent {
  private api = inject(ApiService);
  private empresa = inject(EmpresaService);

  cargando = signal(false);
  horas = signal<HoraOcupacion[]>([]);
  dias = signal<DiaOcupacion[]>([]);
  recomendaciones = signal<string[]>([]);
  forecast = signal<ForecastDia[]>([]);

  diasForecast = 14;

  constructor() {
    effect(() => {
      const id = this.empresa.actualId();
      this.cargar(id);
    });
  }

  cargar(idEmpresa: number | null = this.empresa.actualId()): void {
    this.cargando.set(true);
    this.api.agendaIA(idEmpresa ?? undefined).subscribe({
      next: (r) => {
        this.horas.set(r?.horas ?? []);
        this.dias.set(r?.dias ?? []);
        this.recomendaciones.set(r?.recomendaciones ?? []);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
    this.api.demandaCitas(this.diasForecast, idEmpresa ?? undefined).subscribe({
      next: (r) => this.forecast.set(r?.forecast ?? []),
      error: () => this.forecast.set([]),
    });
  }

  private maxHora(): number {
    return Math.max(1, ...this.horas().map((h) => h.citas));
  }

  private maxDia(): number {
    return Math.max(1, ...this.dias().map((d) => d.citas));
  }

  pctHora(v: number): number {
    return Math.round((v / this.maxHora()) * 100);
  }

  pctDia(v: number): number {
    return v > 0 ? Math.max(Math.round((v / this.maxDia()) * 100), 4) : 0;
  }

  cobertura(f: ForecastDia): number {
    if (!f.esperado) return f.agendadas > 0 ? 100 : 0;
    return Math.min(100, Math.round((f.agendadas / f.esperado) * 100));
  }

  coberturaColor(f: ForecastDia): string {
    const c = this.cobertura(f);
    if (c >= 80) return 'bg-emerald-500';
    if (c >= 40) return 'bg-amber-400';
    return 'bg-red-400';
  }
}
