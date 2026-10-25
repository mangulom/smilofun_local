import { Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { PaginadorComponent } from '../../shared/paginador.component';

interface PredProducto {
  producto_id: number;
  nombre: string;
  sku: string | null;
  stock: number;
  stock_minimo: number;
  consumo_diario: number;
  dias_restantes: number | null;
  sugerido_pedido: number;
  riesgo: 'critico' | 'alto' | 'medio' | 'bajo';
}

const CLASE_RIESGO: Record<string, string> = {
  critico: 'bg-red-100 text-red-700 border-red-200',
  alto: 'bg-orange-100 text-orange-700 border-orange-200',
  medio: 'bg-amber-100 text-amber-700 border-amber-200',
  bajo: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const LABEL_RIESGO: Record<string, string> = {
  critico: 'Crítico',
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
};

@Component({
  selector: 'app-ia-inventario',
  imports: [DecimalPipe, PaginadorComponent],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Inventario predictivo</h1>
          <p class="text-sm text-slate-500">
            Estima el consumo diario y los días antes de agotarse para anticipar tus compras.
          </p>
        </div>
        <button class="btn-ghost" type="button" (click)="cargar()" [disabled]="cargando()">
          {{ cargando() ? 'Actualizando…' : '⟳ Actualizar' }}
        </button>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <div class="card p-4 border-l-4 border-l-red-500">
          <p class="label">Stock crítico</p>
          <p class="text-3xl font-extrabold text-red-600">{{ contar('critico') }}</p>
          <p class="text-xs text-slate-500 mt-1">menos de 7 días</p>
        </div>
        <div class="card p-4 border-l-4 border-l-orange-400">
          <p class="label">Riesgo alto</p>
          <p class="text-3xl font-extrabold text-orange-500">{{ contar('alto') }}</p>
          <p class="text-xs text-slate-500 mt-1">entre 7 y 15 días</p>
        </div>
        <div class="card p-4 border-l-4 border-l-blue-500">
          <p class="label">Unidades sugeridas</p>
          <p class="text-3xl font-extrabold text-blue-700">{{ totalSugerido() }}</p>
          <p class="text-xs text-slate-500 mt-1">pedido para cubrir 30 días</p>
        </div>
      </div>

      <div class="card overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th class="px-4 py-3">Producto</th>
              <th class="px-4 py-3">Stock</th>
              <th class="px-4 py-3">Consumo/día</th>
              <th class="px-4 py-3">Días restantes</th>
              <th class="px-4 py-3">Pedir</th>
              <th class="px-4 py-3">Riesgo</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (p of paginaActual(); track p.producto_id) {
              <tr class="transition hover:bg-slate-50">
                <td class="px-4 py-3">
                  <p class="font-semibold text-slate-700">{{ p.nombre }}</p>
                  <p class="text-xs text-slate-400">{{ p.sku }}</p>
                </td>
                <td class="px-4 py-3 text-slate-600">
                  {{ p.stock }} <span class="text-xs text-slate-400">/ mín {{ p.stock_minimo }}</span>
                </td>
                <td class="px-4 py-3 text-slate-600">{{ p.consumo_diario | number: '1.0-2' }}</td>
                <td class="px-4 py-3">
                  @if (p.dias_restantes !== null) {
                    <span class="font-semibold text-slate-700">{{ p.dias_restantes | number: '1.0-0' }} días</span>
                  } @else {
                    <span class="text-slate-400">sin consumo</span>
                  }
                </td>
                <td class="px-4 py-3">
                  @if (p.sugerido_pedido > 0) {
                    <span class="font-semibold text-blue-700">+{{ p.sugerido_pedido }}</span>
                  } @else {
                    <span class="text-slate-300">—</span>
                  }
                </td>
                <td class="px-4 py-3">
                  <span class="rounded-full border px-2 py-0.5 text-xs font-semibold" [class]="claseRiesgo(p.riesgo)">
                    {{ labelRiesgo(p.riesgo) }}
                  </span>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="px-4 py-10 text-center text-slate-400">
                  {{ cargando() ? 'Analizando inventario…' : 'Sin productos.' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
        <app-paginador
          [total]="productos().length"
          [pageSize]="tamanoPagina()"
          [page]="pagina()"
          (pageChange)="pagina.set($event)"
          (pageSizeChange)="cambiarTamano($event)"
        />
      </div>
    </div>
  `,
})
export class IaInventarioComponent {
  private api = inject(ApiService);
  private empresa = inject(EmpresaService);

  cargando = signal(false);
  productos = signal<PredProducto[]>([]);
  pagina = signal(1);
  tamanoPagina = signal(10);

  constructor() {
    effect(() => {
      const id = this.empresa.actualId();
      this.cargar(id);
    });
  }

  cargar(idEmpresa: number | null = this.empresa.actualId()): void {
    this.cargando.set(true);
    this.api.inventarioIA(idEmpresa ?? undefined).subscribe({
      next: (r) => {
        this.productos.set(r);
        this.cargando.set(false);
        const maxPag = Math.max(1, Math.ceil(r.length / this.tamanoPagina()));
        if (this.pagina() > maxPag) this.pagina.set(maxPag);
      },
      error: () => this.cargando.set(false),
    });
  }

  paginaActual(): PredProducto[] {
    const ini = (this.pagina() - 1) * this.tamanoPagina();
    return this.productos().slice(ini, ini + this.tamanoPagina());
  }

  cambiarTamano(t: number): void {
    this.tamanoPagina.set(t);
    this.pagina.set(1);
  }

  contar(riesgo: string): number {
    return this.productos().filter((p) => p.riesgo === riesgo).length;
  }

  totalSugerido(): number {
    return this.productos().reduce((s, p) => s + p.sugerido_pedido, 0);
  }

  claseRiesgo(r: string): string {
    return CLASE_RIESGO[r] ?? CLASE_RIESGO['bajo'];
  }

  labelRiesgo(r: string): string {
    return LABEL_RIESGO[r] ?? r;
  }
}
