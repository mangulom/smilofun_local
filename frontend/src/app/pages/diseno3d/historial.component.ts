import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { PaginadorComponent } from '../../shared/paginador.component';

@Component({
  selector: 'app-diseno3d-historial',
  imports: [RouterLink, PaginadorComponent],
  template: `
    <div class="space-y-5">
      <div>
        <h1 class="text-2xl font-extrabold text-slate-800">Historial de Diseños</h1>
        <p class="text-sm text-slate-500">
          Diseños de prótesis generados, con acceso al visor 3D y al archivo STL.
        </p>
      </div>

      <div class="card overflow-hidden">
        @if (cargando()) {
          <p class="p-6 text-sm text-slate-400">Cargando historial…</p>
        } @else if (disenos().length === 0) {
          <div class="p-10 text-center">
            <p class="text-sm text-slate-500">Aún no hay diseños generados.</p>
            <a class="btn-primary mt-4" routerLink="/diseno3d">Crear el primer diseño</a>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50">
                <tr>
                  <th class="th">ID</th>
                  <th class="th">Pieza</th>
                  <th class="th">Paciente</th>
                  <th class="th">Medidas (mm)</th>
                  <th class="th">Volumen</th>
                  <th class="th">Ajuste</th>
                  <th class="th">Fecha</th>
                  <th class="th text-right">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (d of paginaActual(); track d.id) {
                  <tr class="hover:bg-slate-50">
                    <td class="td font-semibold text-slate-700">#{{ d.id }}</td>
                    <td class="td">
                      <p class="font-semibold text-slate-700">{{ nombrePieza(d.tipo) }}</p>
                      <p class="text-xs text-slate-400">{{ d.estilo }}</p>
                    </td>
                    <td class="td">{{ d.paciente ?? '—' }}</td>
                    <td class="td">{{ d.ancho }} × {{ d.alto }} × {{ d.profundidad }}</td>
                    <td class="td">{{ d.metricas?.volumen_mm3 ?? '—' }} mm³</td>
                    <td class="td">
                      @if (d.metricas?.ajuste_medio != null) {
                        <span class="badge bg-emerald-100 text-emerald-700">
                          {{ (d.metricas.ajuste_medio * 100).toFixed(1) }}%
                        </span>
                      } @else {
                        —
                      }
                    </td>
                    <td class="td">{{ fmtFecha(d.creado_en) }}</td>
                    <td class="td">
                      <div class="flex justify-end gap-2">
                        <a
                          class="btn-ghost !px-3 !py-1.5 text-xs"
                          [routerLink]="['/diseno3d']"
                          [queryParams]="{ diseno: d.id }"
                        >
                          Ver 3D
                        </a>
                        <a class="btn-accent !px-3 !py-1.5 text-xs" [href]="d.url_stl" download>
                          STL
                        </a>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-paginador
            [total]="disenos().length"
            [pageSize]="tamanoPagina()"
            [page]="pagina()"
            (pageChange)="pagina.set($event)"
            (pageSizeChange)="cambiarTamano($event)"
          />
        }
      </div>
    </div>
  `,
})
export class Diseno3DHistorialComponent {
  private api = inject(ApiService);
  private empresa = inject(EmpresaService);

  disenos = signal<any[]>([]);
  cargando = signal(true);
  pagina = signal(1);
  tamanoPagina = signal(10);

  private nombres: Record<string, string> = {
    molar: 'Molar',
    premolar: 'Premolar',
    canino: 'Canino',
    incisivo: 'Incisivo',
  };

  constructor() {
    this.api.historialDiseno3D(this.empresa.actualId()).subscribe({
      next: (r) => {
        this.disenos.set(r ?? []);
        this.cargando.set(false);
        const maxPag = Math.max(1, Math.ceil((r ?? []).length / this.tamanoPagina()));
        if (this.pagina() > maxPag) this.pagina.set(maxPag);
      },
      error: () => this.cargando.set(false),
    });
  }

  paginaActual(): any[] {
    const ini = (this.pagina() - 1) * this.tamanoPagina();
    return this.disenos().slice(ini, ini + this.tamanoPagina());
  }

  cambiarTamano(t: number): void {
    this.tamanoPagina.set(t);
    this.pagina.set(1);
  }

  nombrePieza(clave: string): string {
    return this.nombres[clave] ?? clave;
  }

  fmtFecha(iso?: string): string {
    if (!iso) return '—';
    const f = new Date(iso);
    return f.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}