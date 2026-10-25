import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { Prediccion } from '../../core/models';
import { PaginadorComponent } from '../../shared/paginador.component';

const TIPO_LABEL: Record<string, string> = {
  no_show: 'No-show',
  ingreso: 'Ingreso proyectado',
  riesgo: 'Riesgo dental',
  recomendacion: 'Recomendación',
};

const CLASE_RIESGO: Record<string, string> = {
  alto: 'bg-red-100 text-red-700 border-red-200',
  medio: 'bg-amber-100 text-amber-700 border-amber-200',
  bajo: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  creciente: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  estable: 'bg-slate-100 text-slate-600 border-slate-200',
  decreciente: 'bg-red-100 text-red-700 border-red-200',
};

@Component({
  selector: 'app-ia-historial',
  imports: [FormsModule, DatePipe, DecimalPipe, PercentPipe, PaginadorComponent],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Historial de predicciones</h1>
          <p class="text-sm text-slate-500">
            Registro de las predicciones generadas (no-show e ingresos) al re-entrenar los modelos.
          </p>
        </div>
        <div class="flex items-end gap-2">
          <div>
            <label class="label">Tipo</label>
            <select class="input w-44" [(ngModel)]="filtro" (ngModelChange)="cambiarFiltro($event)">
              <option value="">Todos</option>
              <option value="no_show">No-show</option>
              <option value="ingreso">Ingresos</option>
            </select>
          </div>
          <button class="btn-ghost" type="button" (click)="cargar()" [disabled]="cargando()">
            {{ cargando() ? 'Actualizando…' : '⟳ Actualizar' }}
          </button>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <div class="card p-4 border-l-4 border-l-blue-500">
          <p class="label">Registros</p>
          <p class="text-3xl font-extrabold text-blue-700">{{ lista().length }}</p>
        </div>
        <div class="card p-4 border-l-4 border-l-red-500">
          <p class="label">No-show alto</p>
          <p class="text-3xl font-extrabold text-red-600">{{ contar('no_show', 'alto') }}</p>
        </div>
        <div class="card p-4 border-l-4 border-l-green-500">
          <p class="label">Proyecciones de ingreso</p>
          <p class="text-3xl font-extrabold text-green-700">{{ contar('ingreso') }}</p>
        </div>
      </div>

      <div class="card overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th class="px-4 py-3">Generada</th>
              <th class="px-4 py-3">Tipo</th>
              <th class="px-4 py-3">Objeto</th>
              <th class="px-4 py-3">Valor</th>
              <th class="px-4 py-3">Clasificación</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (p of paginaActual(); track p.id) {
              <tr class="transition hover:bg-slate-50">
                <td class="px-4 py-3 text-slate-500">{{ p.fecha_generacion | date: 'dd/MM/yy HH:mm' }}</td>
                <td class="px-4 py-3 font-semibold text-slate-700">{{ tipoLabel(p.tipo) }}</td>
                <td class="px-4 py-3 text-slate-500">{{ p.fecha_objeto ? (p.fecha_objeto | date: 'dd/MM/yyyy') : '—' }}</td>
                <td class="px-4 py-3 text-slate-600">
                  @if (p.tipo === 'no_show' && p.probabilidad !== null && p.probabilidad !== undefined) {
                    {{ p.probabilidad | percent: '1.0-0' }}
                  } @else if (p.valor !== null && p.valor !== undefined) {
                    {{ p.valor | number: '1.0-2' }}
                  } @else {
                    —
                  }
                </td>
                <td class="px-4 py-3">
                  @if (p.clasificacion) {
                    <span class="rounded-full border px-2 py-0.5 text-xs font-semibold capitalize" [class]="claseRiesgo(p.clasificacion)">
                      {{ p.clasificacion }}
                    </span>
                  } @else {
                    <span class="text-slate-300">—</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="px-4 py-10 text-center text-slate-400">
                  {{ cargando() ? 'Cargando…' : 'Sin predicciones registradas. Re-entrena los modelos desde el Panel IA.' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
        <app-paginador
          [total]="lista().length"
          [pageSize]="tamanoPagina()"
          [page]="pagina()"
          (pageChange)="pagina.set($event)"
          (pageSizeChange)="cambiarTamano($event)"
        />
      </div>
    </div>
  `,
})
export class IaHistorialComponent {
  private api = inject(ApiService);
  private empresa = inject(EmpresaService);

  cargando = signal(false);
  predicciones = signal<Prediccion[]>([]);
  filtro = '';
  pagina = signal(1);
  tamanoPagina = signal(10);

  constructor() {
    effect(() => {
      this.empresa.actualId();
      this.cargar();
    });
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.prediccionesIA(100).subscribe({
      next: (r) => {
        this.predicciones.set(r);
        this.cargando.set(false);
        const maxPag = Math.max(1, Math.ceil(this.lista().length / this.tamanoPagina()));
        if (this.pagina() > maxPag) this.pagina.set(maxPag);
      },
      error: () => this.cargando.set(false),
    });
  }

  cambiarFiltro(f: string): void {
    this.filtro = f;
    this.pagina.set(1);
  }

  paginaActual(): Prediccion[] {
    const ini = (this.pagina() - 1) * this.tamanoPagina();
    return this.lista().slice(ini, ini + this.tamanoPagina());
  }

  cambiarTamano(t: number): void {
    this.tamanoPagina.set(t);
    this.pagina.set(1);
  }

  lista = computed(() => {
    const f = this.filtro;
    const l = this.predicciones();
    return f ? l.filter((p) => p.tipo === f) : l;
  });

  contar(tipo: string, clasificacion?: string): number {
    return this.predicciones().filter(
      (p) => p.tipo === tipo && (!clasificacion || p.clasificacion === clasificacion)
    ).length;
  }

  tipoLabel(t: string): string {
    return TIPO_LABEL[t] ?? t;
  }

  claseRiesgo(c: string): string {
    return CLASE_RIESGO[c] ?? 'bg-slate-100 text-slate-600 border-slate-200';
  }
}
