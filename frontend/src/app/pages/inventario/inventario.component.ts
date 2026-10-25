import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { Producto, Sucursal } from '../../core/models';
import { PaginadorComponent } from '../../shared/paginador.component';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-inventario',
  imports: [FormsModule, CurrencyPipe, DatePipe, PaginadorComponent, RouterLink, RouterLinkActive],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Inventario</h1>
          <p class="text-sm text-slate-500">
            {{ lista().length }} insumos ·
            <span class="font-semibold text-red-500">{{ alertas() }} con alerta</span>
          </p>
        </div>
        <nav class="flex gap-2" aria-label="Gestión de inventario">
          <a routerLink="/inventario" routerLinkActive="bg-primary-100 text-primary-800" [routerLinkActiveOptions]="{ exact: true }" class="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Insumos</a>
          <a routerLink="/inventario/proveedores" routerLinkActive="bg-primary-100 text-primary-800" class="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Proveedores</a>
          <a routerLink="/inventario/compras" routerLinkActive="bg-primary-100 text-primary-800" class="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Compras</a>
        </nav>
        <div class="flex gap-2">
          <input class="input w-44" placeholder="🔍 Buscar insumo…" [(ngModel)]="busqueda" (ngModelChange)="buscar()" />
          <label class="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" [(ngModel)]="soloAlertas" (ngModelChange)="buscar()" class="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500">
            Solo alertas
          </label>
          <button class="btn-primary" (click)="nuevo()">+ Insumo</button>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-100">
            <thead class="bg-slate-50">
              <tr>
                <th class="th">Insumo</th>
                <th class="th">Categoría</th>
                <th class="th">Stock</th>
                <th class="th">Vencimiento</th>
                <th class="th">Empresa</th>
                <th class="th text-right">Precio venta</th>
                <th class="th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (p of paginaActual(); track p.id) {
                <tr class="hover:bg-primary-50/40">
                  <td class="td">
                    <p class="font-semibold text-slate-800">{{ p.nombre }}</p>
                    <p class="text-xs text-slate-400 font-mono">{{ p.sku }}</p>
                  </td>
                  <td class="td"><span class="badge bg-blue-100 text-blue-700">{{ p.categoria || '—' }}</span></td>
                  <td class="td">
                    <span class="font-bold" [class]="p.alerta_stock ? 'text-red-600' : 'text-slate-700'">{{ p.stock }}</span>
                    <span class="text-xs text-slate-400"> / mín {{ p.stock_minimo }}</span>
                    @if (p.alerta_stock) { <span class="ml-1 badge bg-red-100 text-red-600">Bajo</span> }
                  </td>
                  <td class="td text-xs">
                    @if (p.fecha_vencimiento) {
                      <span [class]="p.alerta_vencimiento ? 'font-bold text-red-600' : 'text-slate-500'">
                        {{ p.fecha_vencimiento | date: 'dd/MM/yyyy' }}
                      </span>
                      @if (p.alerta_vencimiento) { <span class="ml-1 badge bg-red-100 text-red-600">Vencido</span> }
                    } @else { — }
                  </td>
                  <td class="td text-xs text-slate-600">
                    <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span class="h-2 w-2 rounded-full" [style.background]="empresa.color(p.empresa_id)"></span>
                      {{ empresa.nombre(p.empresa_id) }}
                    </span>
                  </td>
                  <td class="td text-right font-semibold">{{ p.precio_venta | currency: 'S/':'symbol':'1.2-2' }}</td>
                  <td class="td text-right whitespace-nowrap space-x-2">
                    <button class="text-xs font-semibold text-emerald-600 hover:underline" (click)="movimiento(p, 'entrada')">+ Entrada</button>
                    <button class="text-xs font-semibold text-amber-600 hover:underline" (click)="movimiento(p, 'salida')">− Salida</button>
                    <button class="text-xs font-semibold text-primary-600 hover:underline" (click)="editar(p)">Editar</button>
                    <button class="text-xs font-semibold text-red-600 hover:underline" (click)="eliminar(p)">Eliminar</button>
                  </td>
                </tr>
              } @empty {
                <tr><td class="td py-10 text-center text-slate-400" colspan="7">Sin productos.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <app-paginador
          [total]="lista().length"
          [pageSize]="tamanoPagina()"
          [page]="pagina()"
          (pageChange)="pagina.set($event)"
          (pageSizeChange)="cambiarTamano($event)"
        />
      </div>
    </div>

    <!-- Modal producto -->
    @if (modal()) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-primary-950/50 p-4 backdrop-blur-sm" (click)="modal.set(false)">
        <div class="card w-full max-w-xl p-6" (click)="$event.stopPropagation()">
          <h2 class="mb-4 text-lg font-extrabold text-slate-800">{{ editId() ? 'Editar' : 'Nuevo' }} insumo</h2>
          <form class="grid gap-4 sm:grid-cols-2" (ngSubmit)="guardar()">
            <div class="sm:col-span-2"><label class="label">Nombre *</label><input class="input" name="nombre" [(ngModel)]="form.nombre" required></div>
            <div><label class="label">Categoría</label><input class="input" name="categoria" [(ngModel)]="form.categoria"></div>
            <div><label class="label">SKU</label><input class="input" name="sku" [(ngModel)]="form.sku"></div>
            <div><label class="label">Stock</label><input class="input" type="number" name="stock" [(ngModel)]="form.stock"></div>
            <div><label class="label">Stock mínimo</label><input class="input" type="number" name="stock_minimo" [(ngModel)]="form.stock_minimo"></div>
            <div><label class="label">Precio compra</label><input class="input" type="number" step="0.1" name="precio_compra" [(ngModel)]="form.precio_compra"></div>
            <div><label class="label">Precio venta</label><input class="input" type="number" step="0.1" name="precio_venta" [(ngModel)]="form.precio_venta"></div>
            <div><label class="label">Vencimiento</label><input class="input" type="date" name="fecha_vencimiento" [(ngModel)]="form.fecha_vencimiento"></div>
            <div>
              <label class="label">Sede</label>
              <select class="input" name="sucursal_id" [(ngModel)]="form.sucursal_id">
                @for (s of sucursales(); track s.id) { <option [value]="s.id">{{ s.nombre }}</option> }
              </select>
            </div>
            <div class="sm:col-span-2 flex justify-end gap-2">
              <button type="button" class="btn-ghost" (click)="modal.set(false)">Cancelar</button>
              <button class="btn-primary" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Modal movimiento -->
    @if (movModal()) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-primary-950/50 p-4 backdrop-blur-sm" (click)="movModal.set(null)">
        <div class="card w-full max-w-sm p-6" (click)="$event.stopPropagation()">
          <h2 class="mb-1 text-lg font-extrabold text-slate-800">
            {{ movModal()!.tipo === 'entrada' ? 'Registrar entrada' : 'Registrar salida' }}
          </h2>
          <p class="mb-4 text-sm text-slate-500">{{ movModal()!.producto.nombre }} · Stock actual: {{ movModal()!.producto.stock }}</p>
          <form class="space-y-4" (ngSubmit)="confirmarMov()">
            <div><label class="label">Cantidad</label><input class="input" type="number" min="1" name="cantidad" [(ngModel)]="movForm.cantidad" required></div>
            <div><label class="label">Motivo</label><input class="input" name="motivo" [(ngModel)]="movForm.motivo" placeholder="Compra, consumo en consulta…"></div>
            <div class="flex justify-end gap-2">
              <button type="button" class="btn-ghost" (click)="movModal.set(null)">Cancelar</button>
              <button class="btn-primary">Confirmar</button>
            </div>
            @if (movError()) { <p class="text-sm font-medium text-red-600">{{ movError() }}</p> }
          </form>
        </div>
      </div>
    }
  `,
})
export class InventarioComponent {
  private api = inject(ApiService);
  empresa = inject(EmpresaService);

  lista = signal<Producto[]>([]);
  sucursales = signal<Sucursal[]>([]);
  busqueda = '';
  soloAlertas = false;
  pagina = signal(1);
  tamanoPagina = signal(10);

  modal = signal(false);
  editId = signal<number | null>(null);
  guardando = signal(false);
  form: any = {};

  movModal = signal<{ producto: Producto; tipo: string } | null>(null);
  movForm: any = { cantidad: 1, motivo: '' };
  movError = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.empresa.actualId();
      this.cargar();
    });
    this.api.sucursales().subscribe((s) => this.sucursales.set(s));
  }

  cargar(): void {
    this.api
      .productos({
        search: this.busqueda || undefined,
        solo_alertas: this.soloAlertas || undefined,
        empresa_id: this.empresa.actualId(),
      })
      .subscribe((p) => {
        this.lista.set(p);
        const maxPag = Math.max(1, Math.ceil(p.length / this.tamanoPagina()));
        if (this.pagina() > maxPag) this.pagina.set(maxPag);
      });
  }

  buscar(): void {
    this.pagina.set(1);
    this.cargar();
  }

  paginaActual(): Producto[] {
    const ini = (this.pagina() - 1) * this.tamanoPagina();
    return this.lista().slice(ini, ini + this.tamanoPagina());
  }

  cambiarTamano(t: number): void {
    this.tamanoPagina.set(t);
    this.pagina.set(1);
  }

  alertas(): number {
    return this.lista().filter((p) => p.alerta_stock || p.alerta_vencimiento).length;
  }

  nuevo(): void {
    this.form = {
      nombre: '', categoria: '', sku: '', stock: 0, stock_minimo: 5,
      precio_compra: 0, precio_venta: 0, fecha_vencimiento: '',
      sucursal_id: this.sucursales()[0]?.id ?? 1,
    };
    this.editId.set(null);
    this.modal.set(true);
  }

  editar(p: Producto): void {
    this.form = { ...p, fecha_vencimiento: p.fecha_vencimiento ?? '' };
    this.editId.set(p.id);
    this.modal.set(true);
  }

  guardar(): void {
    this.guardando.set(true);
    const payload = { ...this.form, sucursal_id: Number(this.form.sucursal_id), fecha_vencimiento: this.form.fecha_vencimiento || null };
    const req = this.editId()
      ? this.api.actualizarProducto(this.editId()!, payload)
      : this.api.crearProducto({ ...payload, empresa_id: this.empresa.actualId() });
    req.subscribe({
      next: () => {
        this.guardando.set(false);
        this.modal.set(false);
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        alert(e?.error?.detail || 'No se pudo guardar');
      },
    });
  }

  movimiento(p: Producto, tipo: string): void {
    this.movForm = { cantidad: 1, motivo: '' };
    this.movError.set(null);
    this.movModal.set({ producto: p, tipo });
  }

  eliminar(p: Producto): void {
    if (!confirm(`¿Dar de baja el insumo "${p.nombre}"? Se conservará el historial de movimientos.`)) return;
    this.api.eliminarProducto(p.id).subscribe({
      next: () => this.cargar(),
      error: (e) => alert(e?.error?.detail || 'No se pudo dar de baja el insumo.'),
    });
  }

  confirmarMov(): void {
    const m = this.movModal()!;
    this.api
      .movimiento(m.producto.id, { tipo: m.tipo, cantidad: Number(this.movForm.cantidad), motivo: this.movForm.motivo || undefined })
      .subscribe({
        next: () => {
          this.movModal.set(null);
          this.cargar();
        },
        error: (e) => this.movError.set(e?.error?.detail || 'No se pudo registrar'),
      });
  }
}
