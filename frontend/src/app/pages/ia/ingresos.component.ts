// Proyección de ingresos IA (con histórico de anomalías).
import { Component, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, PercentPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { Proyeccion } from '../../core/models';

@Component({
  selector: 'app-ia-ingresos',
  imports: [FormsModule, CurrencyPipe, PercentPipe],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Proyección de ingresos</h1>
          <p class="text-sm text-slate-500">
            Pronóstico de facturación basado en el histórico de la empresa activa.
          </p>
        </div>
        <div class="flex items-end gap-2">
          <div>
            <label class="label">Meses</label>
            <select class="input w-28" [(ngModel)]="meses" (ngModelChange)="cargar()">
              <option [ngValue]="3">3</option>
              <option [ngValue]="6">6</option>
              <option [ngValue]="12">12</option>
            </select>
          </div>
          <button class="btn-ghost" type="button" (click)="cargar()" [disabled]="cargando()">
            {{ cargando() ? 'Actualizando…' : '⟳ Actualizar' }}
          </button>
        </div>
      </div>

      @if (proyecciones(); as p) {
        <!-- KPIs -->
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div class="card p-5 border-l-4 border-l-blue-500">
            <p class="label">Próximo mes</p>
            <p class="text-3xl font-extrabold text-blue-700">
              {{ (p.length ? p[0].proyectado : 0) | currency: 'S/':'symbol':'1.0-0' }}
            </p>
          </div>
          <div class="card p-5 border-l-4 border-l-orange-500">
            <p class="label">Total proyectado</p>
            <p class="text-3xl font-extrabold text-orange-600">{{ totalProyectado() | currency: 'S/':'symbol':'1.0-0' }}</p>
            <p class="text-xs text-slate-500 mt-1">{{ p.length }} meses</p>
          </div>
          <div class="card p-5 border-l-4" [class]="tendenciaColor()">
            <p class="label">Tendencia</p>
            <p class="text-2xl font-extrabold capitalize text-slate-800">{{ tendencia() }}</p>
          </div>
          <div class="card p-5 border-l-4 border-l-green-500">
            <p class="label">Confianza</p>
            <p class="text-3xl font-extrabold text-green-700">{{ confianza() | percent: '1.0-0' }}</p>
          </div>
        </div>

        <!-- Gráfico -->
        <div class="card p-5">
          <h2 class="mb-4 font-bold text-slate-800">Ingresos proyectados por mes</h2>
          <div class="flex h-56 items-end gap-3">
            @for (m of p; track m.mes; let i = $index) {
              <div class="group relative flex flex-1 flex-col items-center justify-end h-full">
                <span class="pointer-events-none absolute -top-5 text-[10px] font-semibold text-slate-500">
                  {{ m.proyectado | currency: 'S/':'symbol':'1.0-0' }}
                </span>
                <div
                  class="w-full rounded-t-lg transition-all"
                  [style.background]="colorBarra(i)"
                  [style.height.%]="altura(m.proyectado)"
                  [title]="m.mes + ': ' + (m.proyectado | currency: 'S/':'symbol':'1.0-0')"
                ></div>
                <span class="mt-1.5 text-[10px] text-slate-400">{{ m.mes }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Histórico reciente -->
        @if (historico().length) {
          <div class="card p-5">
            <h2 class="mb-4 font-bold text-slate-800">Ingresos mensuales históricos</h2>
            <div class="flex h-40 items-end gap-2">
              @for (h of historico(); track h.mes) {
                <div class="group relative flex flex-1 flex-col items-center justify-end h-full">
                  <span class="pointer-events-none absolute -top-4 hidden text-[10px] font-semibold text-slate-500 group-hover:block">
                    {{ h.total | currency: 'S/':'symbol':'1.0-0' }}
                  </span>
                  <div
                    class="w-full rounded-t transition-all"
                    [class]="h.anomalia ? 'bg-red-400' : 'bg-slate-300'"
                    [style.height.%]="alturaHist(h.total)"
                    [title]="h.mes + ': ' + (h.total | currency: 'S/':'symbol':'1.0-0')"
                  ></div>
                  <span class="mt-1.5 text-[10px] text-slate-400">{{ h.mes.slice(5) }}</span>
                </div>
              }
            </div>
            <p class="mt-3 text-xs text-slate-400">Barras rojas = meses atípicos detectados por el análisis de anomalías.</p>
          </div>
        }
      } @else {
        <div class="card p-10 text-center text-slate-400">
          {{ cargando() ? 'Cargando proyección…' : 'Sin datos suficientes.' }}
        </div>
      }
    </div>
  `,
})
export class IaIngresosComponent {
  private api = inject(ApiService);
  private empresa = inject(EmpresaService);

  cargando = signal(false);
  proyecciones = signal<Proyeccion[] | null>(null);
  tendencia = signal<string>('estable');
  confianza = signal<number>(0);
  historico = signal<{ mes: string; total: number; anomalia: boolean }[]>([]);

  meses = 6;

  constructor() {
    effect(() => {
      const id = this.empresa.actualId();
      this.cargar(id);
    });
  }

  cargar(idEmpresa: number | null = this.empresa.actualId()): void {
    this.cargando.set(true);
    this.api.proyeccionIngresos(this.meses, idEmpresa ?? undefined).subscribe({
      next: (r) => {
        this.proyecciones.set(r.proyecciones ?? []);
        this.tendencia.set(r.tendencia ?? 'estable');
        this.confianza.set(r.confianza ?? 0);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
    this.api.anomaliasIA(idEmpresa ?? undefined).subscribe({
      next: (r) => this.historico.set((r?.mensual ?? []).slice(-12)),
      error: () => this.historico.set([]),
    });
  }

  totalProyectado(): number {
    return (this.proyecciones() ?? []).reduce((s, m) => s + m.proyectado, 0);
  }

  private maxProy(): number {
    return Math.max(1, ...(this.proyecciones() ?? []).map((m) => m.proyectado));
  }

  private maxHist(): number {
    return Math.max(1, ...this.historico().map((h) => h.total));
  }

  altura(valor: number): number {
    return Math.max((valor / this.maxProy()) * 100, 3);
  }

  coloresBasicos = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#f97316', '#8b5cf6', '#06b6d4', '#ec4899'];

  colorBarra(i: number): string {
    return this.coloresBasicos[i % this.coloresBasicos.length];
  }

  alturaHist(valor: number): number {
    return Math.max((valor / this.maxHist()) * 100, 3);
  }

  tendenciaColor(): string {
    switch (this.tendencia()) {
      case 'creciente':
        return 'border-l-emerald-500';
      case 'decreciente':
        return 'border-l-red-500';
      default:
        return 'border-l-slate-400';
    }
  }
}
