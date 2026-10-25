import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe, PercentPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { NoShow } from '../../core/models';
import { PaginadorComponent } from '../../shared/paginador.component';

const CLASE_RIESGO: Record<string, string> = {
  alto: 'bg-red-100 text-red-700 border-red-200',
  medio: 'bg-amber-100 text-amber-700 border-amber-200',
  bajo: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const COLOR_RIESGO: Record<string, string> = {
  alto: 'bg-red-500',
  medio: 'bg-amber-400',
  bajo: 'bg-emerald-500',
};

@Component({
  selector: 'app-ia-no-show',
  imports: [FormsModule, DatePipe, PercentPipe, PaginadorComponent],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Riesgo de inasistencia</h1>
          <p class="text-sm text-slate-500">
            Predicción de no-show para las próximas citas: prioriza confirmaciones y recordatorios.
          </p>
        </div>
        <button class="btn-ghost" type="button" (click)="cargar()" [disabled]="cargando()">
          {{ cargando() ? 'Actualizando…' : '⟳ Actualizar' }}
        </button>
      </div>

      <!-- KPI -->
      <div class="grid gap-4 sm:grid-cols-4">
        <div class="card p-4 border-l-4 border-l-blue-500">
          <p class="label">Citas evaluadas</p>
          <p class="text-3xl font-extrabold text-blue-700">{{ citas().length }}</p>
          <p class="text-xs text-slate-500 mt-1">próximos {{ dias }} días</p>
        </div>
        <div class="card p-4 border-l-4 border-l-red-500">
          <p class="label">Riesgo alto</p>
          <p class="text-3xl font-extrabold text-red-600">{{ dist().alto }}</p>
          <p class="text-xs text-slate-500 mt-1">requieren llamada</p>
        </div>
        <div class="card p-4 border-l-4 border-l-amber-400">
          <p class="label">Riesgo medio</p>
          <p class="text-3xl font-extrabold text-amber-600">{{ dist().medio }}</p>
          <p class="text-xs text-slate-500 mt-1">enviar recordatorio</p>
        </div>
        <div class="card p-4 border-l-4 border-l-emerald-500">
          <p class="label">Riesgo bajo</p>
          <p class="text-3xl font-extrabold text-emerald-600">{{ dist().bajo }}</p>
          <p class="text-xs text-slate-500 mt-1">sin acción extra</p>
        </div>
      </div>

      <!-- Filtros -->
      <div class="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label class="label">Horizonte</label>
          <select class="input w-36" [(ngModel)]="dias" (ngModelChange)="recargar()">
            <option [ngValue]="7">7 días</option>
            <option [ngValue]="14">14 días</option>
            <option [ngValue]="30">30 días</option>
          </select>
        </div>
        <div>
          <label class="label">Probabilidad mínima</label>
          <input class="input w-36" type="number" min="0" max="1" step="0.1" [(ngModel)]="minProb" (ngModelChange)="recargar()" />
        </div>
        <div class="ml-auto flex gap-1">
          @for (f of filtros; track f) {
            <button
              type="button"
              class="rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition"
              [class]="filtro() === f ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
              (click)="cambiarFiltro(f)"
            >
              {{ f }}
            </button>
          }
        </div>
      </div>

      <!-- Tabla -->
      <div class="card overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th class="px-4 py-3">Paciente</th>
              <th class="px-4 py-3">Fecha</th>
              <th class="px-4 py-3">Probabilidad</th>
              <th class="px-4 py-3">Riesgo</th>
              <th class="px-4 py-3">Recomendación</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (n of paginaActual(); track n.cita_id) {
              <tr class="cursor-pointer transition hover:bg-slate-50" (click)="verDetalle(n)">
                <td class="px-4 py-3 font-semibold text-slate-700">{{ n.paciente }}</td>
                <td class="px-4 py-3 text-slate-500">
                  {{ n.fecha | date: 'dd/MM' }} · {{ n.hora }}
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                      <div class="h-full rounded-full" [class]="colorRiesgo(n.riesgo)" [style.width.%]="n.probabilidad * 100"></div>
                    </div>
                    <span class="text-xs font-semibold text-slate-600">{{ n.probabilidad | percent: '1.0-0' }}</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span class="rounded-full border px-2 py-0.5 text-xs font-semibold capitalize" [class]="claseRiesgo(n.riesgo)">
                    {{ n.riesgo }}
                  </span>
                </td>
                <td class="px-4 py-3 text-slate-500">{{ n.recomendacion }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="px-4 py-10 text-center text-slate-400">
                  {{ cargando() ? 'Cargando…' : 'Sin citas para los filtros seleccionados.' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
        <app-paginador
          [total]="listaFiltrada().length"
          [pageSize]="tamanoPagina()"
          [page]="pagina()"
          (pageChange)="pagina.set($event)"
          (pageSizeChange)="cambiarTamano($event)"
        />
      </div>

      <!-- Detalle -->
      @if (detalle(); as d) {
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" (click)="detalle.set(null)">
          <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" (click)="$event.stopPropagation()">
            <div class="flex items-start justify-between">
              <div>
                <h2 class="text-lg font-bold text-slate-800">{{ d.paciente }}</h2>
                <p class="text-sm text-slate-500">{{ d.fecha | date: 'EEEE dd/MM/yyyy' }} · {{ d.hora }}</p>
              </div>
              <span class="rounded-full border px-3 py-1 text-xs font-semibold capitalize" [class]="claseRiesgo(d.riesgo)">
                {{ d.riesgo }} · {{ d.probabilidad | percent: '1.0-0' }}
              </span>
            </div>
            <div class="mt-5">
              <p class="label">Factores de riesgo</p>
              <ul class="mt-1 space-y-1">
                @for (f of d.factores; track f) {
                  <li class="flex items-center gap-2 text-sm text-slate-600">
                    <span class="h-1.5 w-1.5 rounded-full bg-amber-400"></span>{{ f }}
                  </li>
                } @empty {
                  <li class="text-sm text-slate-400">Sin factores relevantes.</li>
                }
              </ul>
            </div>
            <div class="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
              <span class="font-semibold">Acción sugerida: </span>{{ d.recomendacion }}
            </div>
            <div class="mt-5 flex justify-end gap-2">
              <button class="btn-ghost" type="button" (click)="irPaciente(d)">Ver paciente</button>
              <button class="btn-primary" type="button" (click)="detalle.set(null)">Cerrar</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class IaNoShowComponent {
  private api = inject(ApiService);
  private empresa = inject(EmpresaService);
  private router = inject(Router);

  cargando = signal(false);
  citas = signal<NoShow[]>([]);
  filtro = signal<'todos' | 'alto' | 'medio' | 'bajo'>('todos');
  detalle = signal<NoShow | null>(null);
  pagina = signal(1);
  tamanoPagina = signal(10);

  dias = 14;
  minProb = 0;
  readonly filtros: Array<'todos' | 'alto' | 'medio' | 'bajo'> = ['todos', 'alto', 'medio', 'bajo'];

  constructor() {
    effect(() => {
      const id = this.empresa.actualId();
      this.cargar(id);
    });
  }

  cargar(idEmpresa: number | null = this.empresa.actualId()): void {
    this.cargando.set(true);
    this.api
      .noShow({ dias: this.dias, min_probabilidad: this.minProb, empresa_id: idEmpresa ?? undefined })
      .subscribe({
        next: (r) => {
          this.citas.set(r);
          this.cargando.set(false);
          const maxPag = Math.max(1, Math.ceil(this.listaFiltrada().length / this.tamanoPagina()));
          if (this.pagina() > maxPag) this.pagina.set(maxPag);
        },
        error: () => this.cargando.set(false),
      });
  }

  recargar(): void {
    this.pagina.set(1);
    this.cargar();
  }

  cambiarFiltro(f: 'todos' | 'alto' | 'medio' | 'bajo'): void {
    this.filtro.set(f);
    this.pagina.set(1);
  }

  paginaActual(): NoShow[] {
    const ini = (this.pagina() - 1) * this.tamanoPagina();
    return this.listaFiltrada().slice(ini, ini + this.tamanoPagina());
  }

  cambiarTamano(t: number): void {
    this.tamanoPagina.set(t);
    this.pagina.set(1);
  }

  listaFiltrada = computed(() => {
    const f = this.filtro();
    const lista = this.citas();
    return f === 'todos' ? lista : lista.filter((n) => n.riesgo === f);
  });

  dist = computed(() => {
    const l = this.citas();
    return {
      alto: l.filter((n) => n.riesgo === 'alto').length,
      medio: l.filter((n) => n.riesgo === 'medio').length,
      bajo: l.filter((n) => n.riesgo === 'bajo').length,
    };
  });

  claseRiesgo(r: string): string {
    return CLASE_RIESGO[r] ?? CLASE_RIESGO['bajo'];
  }

  colorRiesgo(r: string): string {
    return COLOR_RIESGO[r] ?? COLOR_RIESGO['bajo'];
  }

  verDetalle(n: NoShow): void {
    this.detalle.set(n);
  }

  irPaciente(n: NoShow): void {
    this.detalle.set(null);
    if (n.paciente_id) this.router.navigate(['/pacientes', n.paciente_id]);
  }
}
