import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { Factura, Paciente, Tratamiento } from '../../core/models';
import { PaginadorComponent } from '../../shared/paginador.component';
import { DialogService } from '../../shared/dialog.service';
import { LoadingService } from '../../shared/loading.service';

@Component({
  selector: 'app-facturacion',
  imports: [FormsModule, CurrencyPipe, DatePipe, PaginadorComponent],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Facturación</h1>
          <p class="text-sm text-slate-500">Emisión de comprobantes, pagos y control de caja.</p>
        </div>
        <div class="flex gap-2">
          <input class="input w-48" placeholder="🔍 Número o paciente…" [(ngModel)]="busqueda" (ngModelChange)="buscar()" />
          <button class="btn-primary" (click)="nueva()">+ Nueva factura</button>
        </div>
      </div>

      <!-- Resumen -->
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="card p-4 border-l-4 border-l-emerald-500">
          <p class="label">Facturado (año)</p>
          <p class="text-2xl font-extrabold text-emerald-600">{{ totalAnio() | currency: 'S/':'symbol':'1.0-0' }}</p>
        </div>
        <div class="card p-4 border-l-4 border-l-orange-400">
          <p class="label">Pendiente de cobro</p>
          <p class="text-2xl font-extrabold text-orange-600">{{ pendiente() | currency: 'S/':'symbol':'1.0-0' }}</p>
        </div>
        <div class="card p-4 border-l-4 border-l-blue-600">
          <p class="label">Documentos</p>
          <p class="text-2xl font-extrabold text-blue-700">{{ lista().length }}</p>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-100">
            <thead class="bg-slate-50">
              <tr>
                <th class="th">Número</th>
                <th class="th">Fecha</th>
                <th class="th">Paciente</th>
                <th class="th">Empresa</th>
                <th class="th text-right">Total</th>
                <th class="th text-right">Pagado</th>
                <th class="th">Estado</th>
                <th class="th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (f of paginaActual(); track f.id) {
                <tr class="hover:bg-primary-50/40">
                  <td class="td font-mono text-xs font-bold text-blue-700">{{ f.numero }}</td>
                  <td class="td text-xs text-slate-500">{{ f.fecha | date: 'dd/MM/yyyy' }}</td>
                  <td class="td font-semibold text-slate-800">{{ f.paciente.nombre_completo }}</td>
                  <td class="td text-xs text-slate-600">
                    <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span class="h-2 w-2 rounded-full" [style.background]="empresa.color(f.empresa_id)"></span>
                      {{ empresa.nombre(f.empresa_id) }}
                    </span>
                  </td>
                  <td class="td text-right font-bold">{{ f.total | currency: 'S/':'symbol':'1.2-2' }}</td>
                  <td class="td text-right text-emerald-600 font-semibold">{{ totalPagado(f) | currency: 'S/':'symbol':'1.2-2' }}</td>
                  <td class="td">
                    <span class="badge" [class]="clase(f.estado)">{{ f.estado }}</span>
                  </td>
                  <td class="td text-right whitespace-nowrap space-x-2">
                    @if (f.estado === 'emitida' || f.estado === 'parcial') {
                      <button class="text-xs font-semibold text-emerald-600 hover:underline" (click)="pagar(f)">Registrar pago</button>
                      <button class="text-xs font-semibold text-slate-400 hover:text-red-500" (click)="anular(f)">Anular</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td class="td py-10 text-center text-slate-400" colspan="8">Sin facturas.</td></tr>
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

    <!-- Modal nueva factura -->
    @if (modal()) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-primary-950/50 p-4 backdrop-blur-sm" (click)="modal.set(false)">
        <div class="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6" (click)="$event.stopPropagation()">
          <h2 class="mb-4 text-lg font-extrabold text-slate-800">Nueva factura</h2>
          <form class="space-y-4" (ngSubmit)="guardar()">
            <div>
              <label class="label">Paciente</label>
              <select class="input" name="paciente_id" [(ngModel)]="form.paciente_id" required>
                @for (p of pacientes(); track p.id) { <option [value]="p.id">{{ p.codigo }} — {{ p.nombre_completo }}</option> }
              </select>
            </div>

            <div class="rounded-xl border border-slate-200 p-4">
              <p class="label">Detalle</p>
              @for (d of form.detalles; track $index; let i = $index) {
                <div class="mb-2 flex flex-wrap items-center gap-2">
                  <select class="input flex-1 min-w-[200px] py-1.5 text-xs" [(ngModel)]="d.tratamiento_id" [name]="'tr' + i" (ngModelChange)="seleccionarTratamiento(d)">
                    <option [value]="null">— Personalizado —</option>
                    @for (t of tratamientos(); track t.id) { <option [value]="t.id">{{ t.nombre }}</option> }
                  </select>
                  <input class="input flex-1 min-w-[140px] py-1.5 text-xs" placeholder="Descripción" [name]="'de' + i" [(ngModel)]="d.descripcion">
                  <input class="input w-16 py-1.5 text-xs" type="number" [name]="'ca' + i" [(ngModel)]="d.cantidad">
                  <input class="input w-24 py-1.5 text-xs" type="number" step="0.5" [name]="'pr' + i" [(ngModel)]="d.precio_unitario">
                  <button type="button" class="text-red-400 hover:text-red-600" (click)="form.detalles.splice(i, 1)">✕</button>
                </div>
              }
              <button type="button" class="text-sm font-semibold text-primary-600 hover:underline" (click)="agregarDetalle()">+ Agregar línea</button>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div><label class="label">Descuento</label><input class="input" type="number" name="descuento" [(ngModel)]="form.descuento"></div>
              <div><label class="label">Impuesto</label><input class="input" type="number" name="impuesto" [(ngModel)]="form.impuesto"></div>
              <div><label class="label">Notas</label><input class="input" name="notas" [(ngModel)]="form.notas"></div>
            </div>

            <div class="flex justify-between border-t border-slate-100 pt-3 text-lg font-extrabold text-blue-700">
              <span class="text-sm font-medium text-slate-500 self-center">Total</span>
              {{ totalForm() | currency: 'S/':'symbol':'1.2-2' }}
            </div>

            @if (error()) { <p class="text-sm font-medium text-red-600">{{ error() }}</p> }
            <div class="flex justify-end gap-2">
              <button type="button" class="btn-ghost" (click)="modal.set(false)">Cancelar</button>
              <button class="btn-primary" [disabled]="guardando()">{{ guardando() ? 'Emitiendo…' : 'Emitir factura' }}</button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- Modal pago -->
    @if (pagoModal()) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-primary-950/50 p-4 backdrop-blur-sm" (click)="pagoModal.set(null)">
        <div class="card w-full max-w-md p-6" (click)="$event.stopPropagation()">
          <h2 class="mb-1 text-lg font-extrabold text-slate-800">Registrar pago</h2>
          <p class="mb-4 text-sm text-slate-500">Factura {{ pagoModal()!.numero }} · Total {{ pagoModal()!.total | currency: 'S/':'symbol':'1.2-2' }}</p>
          <form class="space-y-4" (ngSubmit)="confirmarPago()">
            <div><label class="label">Monto (S/)</label><input class="input" type="number" step="0.1" name="monto" [(ngModel)]="pagoForm.monto" required></div>
            <div>
              <label class="label">Método</label>
              <select class="input" name="metodo" [(ngModel)]="pagoForm.metodo">
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="yape">Yape</option>
                <option value="plin">Plin</option>
                <option value="transferencia">Transferencia</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div class="flex justify-end gap-2">
              <button type="button" class="btn-ghost" (click)="pagoModal.set(null)">Cancelar</button>
              <button class="btn-accent">Confirmar pago</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class FacturacionComponent {
  private dialog = inject(DialogService);
  private loading = inject(LoadingService);
  private api = inject(ApiService);
  empresa = inject(EmpresaService);

  lista = signal<Factura[]>([]);
  pacientes = signal<Paciente[]>([]);
  tratamientos = signal<Tratamiento[]>([]);
  busqueda = '';
  pagina = signal(1);
  tamanoPagina = signal(10);

  modal = signal(false);
  guardando = signal(false);
  error = signal<string | null>(null);
  form: any = {};

  pagoModal = signal<Factura | null>(null);
  pagoForm: any = { monto: 0, metodo: 'efectivo' };

  constructor() {
    effect(() => {
      const id = this.empresa.actualId();
      this.api.pacientes({ limit: 500, empresa_id: id }).subscribe((p) => this.pacientes.set(p));
      this.api.tratamientos({ activo: true, empresa_id: id }).subscribe((t) => this.tratamientos.set(t));
      this.cargar();
    });
  }

  cargar(): void {
    const loadingId = this.loading.show('OBTENIENDO FACTURAS');
    this.api
      .facturas({ search: this.busqueda || undefined, empresa_id: this.empresa.actualId() })
      .subscribe({ next: (f) => {
        this.lista.set(f);
        this.loading.hide(loadingId);
        const maxPag = Math.max(1, Math.ceil(f.length / this.tamanoPagina()));
        if (this.pagina() > maxPag) this.pagina.set(maxPag);
      }, error: e => { this.loading.hide(loadingId); void this.dialog.apiError(e, 'No se pudieron cargar las facturas.'); } });
  }

  buscar(): void {
    this.pagina.set(1);
    this.cargar();
  }

  paginaActual(): Factura[] {
    const ini = (this.pagina() - 1) * this.tamanoPagina();
    return this.lista().slice(ini, ini + this.tamanoPagina());
  }

  cambiarTamano(t: number): void {
    this.tamanoPagina.set(t);
    this.pagina.set(1);
  }

  totalPagado(f: Factura): number {
    return f.pagos.reduce((a, p) => a + Number(p.monto), 0);
  }

  totalAnio(): number {
    const anio = new Date().getFullYear();
    return this.lista()
      .filter((f) => new Date(f.fecha).getFullYear() === anio)
      .reduce((a, f) => a + Number(f.total), 0);
  }

  pendiente(): number {
    return this.lista()
      .filter((f) => f.estado === 'parcial' || f.estado === 'emitida')
      .reduce((a, f) => a + Number(f.total) - this.totalPagado(f), 0);
  }

  clase(estado: string): string {
    const mapa: Record<string, string> = {
      emitida: 'bg-slate-100 text-slate-600',
      parcial: 'bg-amber-100 text-amber-700',
      pagada: 'bg-emerald-100 text-emerald-700',
      anulada: 'bg-red-100 text-red-600',
    };
    return mapa[estado] ?? 'bg-slate-100 text-slate-600';
  }

  // Nueva factura
  nueva(): void {
    this.form = {
      paciente_id: this.pacientes()[0]?.id ?? null,
      descuento: 0,
      impuesto: 0,
      notas: '',
      detalles: [{ tratamiento_id: null, descripcion: 'Consulta odontológica', cantidad: 1, precio_unitario: 30 }],
    };
    this.error.set(null);
    this.modal.set(true);
  }

  agregarDetalle(): void {
    this.form.detalles.push({ tratamiento_id: null, descripcion: '', cantidad: 1, precio_unitario: 0 });
  }

  seleccionarTratamiento(d: any): void {
    const t = this.tratamientos().find((x) => x.id === Number(d.tratamiento_id));
    if (t) {
      d.descripcion = t.nombre;
      d.precio_unitario = Number(t.precio);
    }
  }

  totalForm(): number {
    const sub = (this.form.detalles ?? []).reduce(
      (a: number, d: any) => a + Number(d.cantidad || 0) * Number(d.precio_unitario || 0),
      0
    );
    return sub - Number(this.form.descuento || 0) + Number(this.form.impuesto || 0);
  }

  guardar(): void {
    const detalles = (this.form.detalles as any[])
      .map((d) => ({
        descripcion: d.descripcion || 'Procedimiento',
        cantidad: Number(d.cantidad || 1),
        precio_unitario: Number(d.precio_unitario || 0),
      }))
      .filter((d) => d.precio_unitario >= 0 && d.descripcion);
    if (!detalles.length) {
      this.error.set('Agrega al menos una línea.');
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    this.api
      .crearFactura({
        paciente_id: Number(this.form.paciente_id),
        sucursal_id: this.pacientes().find((p) => p.id === Number(this.form.paciente_id))?.sucursal_id ?? 1,
        descuento: Number(this.form.descuento || 0),
        impuesto: Number(this.form.impuesto || 0),
        notas: this.form.notas || null,
        empresa_id: this.empresa.actualId(),
        detalles,
      })
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.modal.set(false);
          void this.dialog.success({ title: 'Factura emitida', text: 'La factura se guardó correctamente.' });
          this.cargar();
        },
        error: (e) => {
          this.guardando.set(false);
          this.error.set(e?.error?.detail || 'No se pudo emitir la factura.');
          void this.dialog.apiError(e, 'No se pudo emitir la factura.');
        },
      });
  }

  // Pagos
  pagar(f: Factura): void {
    const saldo = Number(f.total) - this.totalPagado(f);
    this.pagoForm = { monto: saldo.toFixed(2), metodo: 'efectivo' };
    this.pagoModal.set(f);
  }

  confirmarPago(): void {
    const f = this.pagoModal()!;
    this.api.pagarFactura(f.id, { monto: Number(this.pagoForm.monto), metodo: this.pagoForm.metodo }).subscribe({
      next: () => {
        this.pagoModal.set(null);
        void this.dialog.success({ title: 'Pago registrado', text: 'El pago se guardó correctamente.' });
        this.cargar();
      },
      error: (e) => { void this.dialog.apiError(e, 'No se pudo registrar el pago.'); },
    });
  }

  async anular(f: Factura): Promise<void> {
    if (!await this.dialog.confirm({ title: '¿Anular factura?', text: `Se anulará la factura ${f.numero}.`, confirmText: 'Anular factura', danger: true })) return;
    this.api.anularFactura(f.id).subscribe({
      next: () => { void this.dialog.success({ title: 'Factura anulada' }); this.cargar(); },
      error: e => { void this.dialog.apiError(e, 'No se pudo anular la factura.'); },
    });
  }
}
