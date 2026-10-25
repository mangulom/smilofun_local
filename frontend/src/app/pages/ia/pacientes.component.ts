import { Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';

interface SegmentoPaciente {
  paciente_id: number;
  codigo: string;
  nombre: string;
  citas: number;
  gasto: number;
  ultima: string | null;
  dias: number | null;
}

interface Segmento {
  clave: string;
  nombre: string;
  descripcion: string;
  color: string;
  total: number;
  valor: number;
  pacientes: SegmentoPaciente[];
}

@Component({
  selector: 'app-ia-pacientes',
  imports: [CurrencyPipe, DatePipe],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Segmentación de pacientes</h1>
          <p class="text-sm text-slate-500">
            Clasificación RFM: detecta pacientes VIP, en riesgo de fuga y dormidos para actuar a tiempo.
          </p>
        </div>
        <button class="btn-ghost" type="button" (click)="cargar()" [disabled]="cargando()">
          {{ cargando() ? 'Actualizando…' : '⟳ Actualizar' }}
        </button>
      </div>

      @if (data(); as d) {
        <p class="text-sm text-slate-400">Segmentando {{ d.total }} pacientes activos.</p>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          @for (s of d.segmentos; track s.clave) {
            <button
              type="button"
              class="card p-4 text-left transition hover:shadow-md"
              [class]="activo() === s.clave ? 'ring-2 ring-primary-500' : ''"
              (click)="seleccionar(s.clave)"
            >
              <div class="flex items-center justify-between">
                <span class="flex items-center gap-2 font-bold text-slate-700">
                  <span class="h-3 w-3 rounded-full" [style.background]="s.color"></span>{{ s.nombre }}
                </span>
                <span class="text-2xl font-extrabold" [style.color]="s.color">{{ s.total }}</span>
              </div>
              <p class="mt-1 text-xs text-slate-400">{{ s.descripcion }}</p>
              <p class="mt-3 text-sm text-slate-500">Valor histórico: <span class="font-semibold text-slate-700">{{ s.valor | currency: 'S/':'symbol':'1.0-0' }}</span></p>
            </button>
          }
        </div>

        @if (segmentoActivo(); as s) {
          <div class="card overflow-hidden">
            <div class="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 class="font-bold text-slate-800">{{ s.nombre }} — top pacientes</h2>
              <span class="text-xs text-slate-400">{{ s.total }} en el segmento</span>
            </div>
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th class="px-4 py-3">Paciente</th>
                  <th class="px-4 py-3">Citas completadas</th>
                  <th class="px-4 py-3">Gasto histórico</th>
                  <th class="px-4 py-3">Última visita</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (p of s.pacientes; track p.paciente_id) {
                  <tr class="cursor-pointer transition hover:bg-slate-50" (click)="irPaciente(p.paciente_id)">
                    <td class="px-4 py-3">
                      <p class="font-semibold text-slate-700">{{ p.nombre }}</p>
                      <p class="text-xs text-slate-400">{{ p.codigo }}</p>
                    </td>
                    <td class="px-4 py-3 text-slate-600">{{ p.citas }}</td>
                    <td class="px-4 py-3 font-semibold text-slate-700">{{ p.gasto | currency: 'S/':'symbol':'1.0-0' }}</td>
                    <td class="px-4 py-3 text-slate-500">
                      {{ p.ultima ? (p.ultima | date: 'dd/MM/yyyy') : 'Sin visitas' }}
                      @if (p.dias !== null) {
                        <span class="text-xs text-slate-400"> · hace {{ p.dias }} días</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4" class="px-4 py-8 text-center text-slate-400">Segmento vacío.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else {
        <div class="card p-10 text-center text-slate-400">
          {{ cargando() ? 'Analizando pacientes…' : 'Sin datos.' }}
        </div>
      }
    </div>
  `,
})
export class IaPacientesComponent {
  private api = inject(ApiService);
  private empresa = inject(EmpresaService);
  private router = inject(Router);

  cargando = signal(false);
  data = signal<{ total: number; segmentos: Segmento[] } | null>(null);
  activo = signal<string>('riesgo_fuga');

  constructor() {
    effect(() => {
      const id = this.empresa.actualId();
      this.cargar(id);
    });
  }

  cargar(idEmpresa: number | null = this.empresa.actualId()): void {
    this.cargando.set(true);
    this.api.segmentacionIA(idEmpresa ?? undefined).subscribe({
      next: (r) => {
        this.data.set(r);
        const segs: Segmento[] = r?.segmentos ?? [];
        const actual = segs.find((s) => s.clave === this.activo());
        if (!actual || actual.total === 0) {
          const conDatos = segs.find((s) => s.total > 0) ?? segs[0];
          if (conDatos) this.activo.set(conDatos.clave);
        }
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  segmentoActivo = computed<Segmento | null>(() => {
    const d = this.data();
    if (!d) return null;
    return d.segmentos.find((s) => s.clave === this.activo()) ?? d.segmentos[0] ?? null;
  });

  seleccionar(clave: string): void {
    this.activo.set(clave);
  }

  irPaciente(id: number): void {
    this.router.navigate(['/pacientes', id]);
  }
}
