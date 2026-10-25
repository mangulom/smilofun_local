import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { EmpresaService } from '../core/empresa.service';

@Component({
  selector: 'app-notificaciones',
  imports: [DatePipe],
  template: `
    <!-- Campanita de notificaciones -->
    <button
      class="relative rounded-lg p-2 transition-colors hover:bg-purple-900"
      (click)="abierto.set(!abierto())"
      title="Notificaciones"
      aria-label="Notificaciones"
    >
      <svg
        class="h-5 w-5 text-purple-200"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      @if (total() > 0) {
        <span
          class="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-purple-950"
        >
          {{ total() }}
        </span>
      }
    </button>

    @if (abierto()) {
      <div class="fixed inset-0 z-40" (click)="abierto.set(false)"></div>
      <div
        class="absolute right-0 z-50 mt-2 flex w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-label="Notificaciones"
      >
        <!-- Cabecera -->
        <div class="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div>
            <p class="text-sm font-bold text-slate-800">🔔 Notificaciones</p>
            <p class="text-[11px] text-slate-500">
              {{ total() }} pendiente(s) · {{ empresa.nombreActual() }}
            </p>
          </div>
          <button
            class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
            (click)="recargar()"
            title="Actualizar"
            aria-label="Actualizar notificaciones"
          >
            <svg
              class="h-4 w-4"
              [class.animate-spin]="cargando()"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M4 4v5h5M20 20v-5h-5M4.5 9a8 8 0 0114.4-2.9M19.5 15a8 8 0 01-14.4 2.9" />
            </svg>
          </button>
        </div>

        <!-- Pestañas -->
        <div class="flex border-b border-slate-100">
          <button
            class="flex-1 px-3 py-2 text-xs font-bold transition-colors"
            [class]="tab() === 'stock' ? 'border-b-2 border-purple-950 text-purple-950' : 'text-slate-400 hover:text-slate-600'"
            (click)="tab.set('stock')"
          >
            Inventario ({{ stockBajo().length }})
          </button>
          <button
            class="flex-1 px-3 py-2 text-xs font-bold transition-colors"
            [class]="tab() === 'citas' ? 'border-b-2 border-purple-950 text-purple-950' : 'text-slate-400 hover:text-slate-600'"
            (click)="tab.set('citas')"
          >
            Citas ({{ citasPendientes().length }})
          </button>
        </div>

        <!-- Lista -->
        <div class="max-h-80 overflow-y-auto">
          @if (tab() === 'stock') {
            @if (stockBajo().length === 0) {
              <div class="px-4 py-8 text-center">
                <p class="text-2xl">✅</p>
                <p class="mt-1 text-sm font-semibold text-slate-600">Sin alertas de stock</p>
                <p class="text-xs text-slate-400">Todos los productos están por encima de su stock mínimo.</p>
              </div>
            } @else {
              <ul class="divide-y divide-slate-100">
                @for (p of stockBajo(); track p.id) {
                  <li class="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50">
                    <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500"></span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-semibold text-slate-800">{{ p.nombre }}</p>
                      <p class="text-xs text-slate-500">
                        Stock: <b class="text-red-600">{{ p.stock }}</b> {{ p.unidad }} · mínimo {{ p.stock_minimo }}
                      </p>
                    </div>
                    <button
                      class="shrink-0 text-xs font-bold text-purple-700 transition-colors hover:text-purple-900 hover:underline"
                      (click)="ir('/inventario')"
                    >
                      Ver →
                    </button>
                  </li>
                }
              </ul>
            }
          } @else {
            @if (citasPendientes().length === 0) {
              <div class="px-4 py-8 text-center">
                <p class="text-2xl">🎉</p>
                <p class="mt-1 text-sm font-semibold text-slate-600">Sin citas por confirmar</p>
                <p class="text-xs text-slate-400">No hay citas programadas para los próximos 7 días.</p>
              </div>
            } @else {
              <ul class="divide-y divide-slate-100">
                @for (c of citasPendientes(); track c.id) {
                  <li class="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50">
                    <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500"></span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-semibold text-slate-800">{{ c.paciente.nombre_completo }}</p>
                      <p class="truncate text-xs text-slate-500">
                        {{ c.fecha | date: 'EEE d MMM' }} · {{ c.hora_inicio }} · {{ c.doctor.nombre_completo }}
                      </p>
                    </div>
                    <button
                      class="shrink-0 text-xs font-bold text-purple-700 transition-colors hover:text-purple-900 hover:underline"
                      (click)="ir('/citas')"
                    >
                      Ver →
                    </button>
                  </li>
                }
              </ul>
            }
          }
        </div>

        <!-- Pie -->
        <div class="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5">
          <button
            class="text-xs font-bold text-slate-500 transition-colors hover:text-slate-800"
            (click)="ir('/inventario')"
          >
            Ver inventario
          </button>
          <button
            class="text-xs font-bold text-slate-500 transition-colors hover:text-slate-800"
            (click)="ir('/citas')"
          >
            Ver agenda
          </button>
        </div>
      </div>
    }
  `,
})
export class NotificacionesComponent {
  private router = inject(Router);
  private api = inject(ApiService);
  empresa = inject(EmpresaService);

  abierto = signal(false);
  tab = signal<'stock' | 'citas'>('stock');
  cargando = signal(false);
  productos = signal<any[]>([]);
  citas = signal<any[]>([]);

  constructor() {
    this.empresa.cargar();
    effect(() => {
      const id = this.empresa.actualId();
      this.cargarDatos(id);
    });
  }

  cargarDatos(id: number | null): void {
    this.cargando.set(true);
    const q = { empresa_id: id ?? undefined, limit: 500 };
    this.api.productos(q).subscribe({
      next: (p) => {
        this.productos.set(p);
        this.cargando.set(false);
      },
      error: () => {
        this.productos.set([]);
        this.cargando.set(false);
      },
    });
    this.api.citas(q).subscribe({
      next: (c) => {
        this.citas.set(c);
        this.cargando.set(false);
      },
      error: () => {
        this.citas.set([]);
        this.cargando.set(false);
      },
    });
  }

  recargar(): void {
    this.cargarDatos(this.empresa.actualId());
  }

  /** Productos activos con stock menor o igual al mínimo, ordenados por déficit. */
  stockBajo = computed(() =>
    this.productos()
      .filter((p) => p.activo && p.stock <= p.stock_minimo)
      .sort((a, b) => b.stock_minimo - b.stock - (a.stock_minimo - a.stock))
      .slice(0, 20)
  );

  /** Citas programadas (pendientes de confirmar) en los próximos 7 días. */
  citasPendientes = computed(() => {
    const hoy = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const desde = fmt(hoy);
    const hasta = fmt(new Date(hoy.getTime() + 7 * 86400000));
    return this.citas()
      .filter((c) => c.estado === 'programada' && c.fecha >= desde && c.fecha <= hasta)
      .sort((a, b) => (a.fecha + a.hora_inicio).localeCompare(b.fecha + b.hora_inicio))
      .slice(0, 20);
  });

  total = computed(() => this.stockBajo().length + this.citasPendientes().length);

  ir(ruta: string): void {
    this.abierto.set(false);
    this.router.navigate([ruta]);
  }
}