import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { Proveedor } from '../../core/models';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DialogService } from '../../shared/dialog.service';
import { LoadingService } from '../../shared/loading.service';

@Component({
  selector: 'app-proveedores',
  imports: [FormsModule, RouterLink, RouterLinkActive],
  template: `
    <div class="space-y-5">
      <nav class="flex flex-wrap gap-2" aria-label="Gestión de inventario"><a routerLink="/inventario" routerLinkActive="bg-primary-100 text-primary-800" [routerLinkActiveOptions]="{ exact: true }" class="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Insumos</a><a routerLink="/inventario/proveedores" routerLinkActive="bg-primary-100 text-primary-800" class="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Proveedores</a><a routerLink="/inventario/compras" routerLinkActive="bg-primary-100 text-primary-800" class="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Compras</a></nav>
      <div class="flex flex-wrap items-end justify-between gap-3"><div><h1 class="text-2xl font-extrabold text-slate-800">Proveedores</h1><p class="text-sm text-slate-500">{{ empresa.nombreActual() }} · Catálogo de proveedores · {{ lista().length }} registrados</p></div><div class="flex flex-wrap gap-2"><input class="input w-64" placeholder="Buscar nombre o RUC" [(ngModel)]="search" (ngModelChange)="cargar()"><select class="input w-36" aria-label="Estado de proveedores" [(ngModel)]="filtroActivo" (ngModelChange)="cargar()"><option value="activos">Activos</option><option value="inactivos">Inactivos</option><option value="todos">Todos</option></select><button class="btn-primary" (click)="nuevo()">+ Proveedor</button></div></div>
      @if (cargando()) { <p class="text-sm text-slate-500">Cargando proveedores…</p> }
      @if (errorCarga()) { <p class="rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ errorCarga() }}</p> }
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">@for (p of lista(); track p.id) {<article class="card p-5"><div class="flex items-start justify-between gap-3"><div><h2 class="font-bold text-slate-800">{{ p.nombre }}</h2><p class="text-xs text-slate-400">RUC {{ p.ruc || '—' }}</p></div><span class="badge" [class.bg-emerald-100]="p.activo" [class.text-emerald-700]="p.activo" [class.bg-slate-100]="!p.activo" [class.text-slate-500]="!p.activo">{{ p.activo ? 'Activo' : 'Inactivo' }}</span></div><div class="mt-4 space-y-1 text-sm text-slate-600"><p>{{ p.contacto || 'Sin contacto' }}</p><p>{{ p.telefono || 'Sin teléfono' }}</p><p>{{ p.email || 'Sin correo' }}</p><p class="text-xs text-slate-400">{{ p.direccion || 'Sin dirección' }}</p></div><div class="mt-4 flex justify-end gap-3"><button class="text-sm font-semibold text-primary-700" (click)="editar(p)">Editar</button>@if (p.activo) {<button class="text-sm font-semibold text-red-500" (click)="baja(p)">Dar de baja</button>} @else {<button class="text-sm font-semibold text-emerald-700" (click)="reactivar(p)">Reactivar</button>}</div></article>} @empty {<div class="card col-span-full p-10 text-center text-slate-400">No hay proveedores para este filtro.</div>}</div>
      @if (modal()) {<div class="fixed inset-0 z-50 flex items-center justify-center bg-primary-950/50 p-4" (click)="modal.set(false)"><section class="card w-full max-w-2xl p-6" (click)="$event.stopPropagation()"><div class="mb-4 flex justify-between"><h2 class="text-lg font-extrabold">{{ editId() ? 'Editar proveedor' : 'Nuevo proveedor' }}</h2><button (click)="modal.set(false)">✕</button></div><form class="grid gap-3 sm:grid-cols-2" (ngSubmit)="guardar()"><div class="sm:col-span-2"><label class="label">Nombre / razón social *</label><input class="input" name="nombre" [(ngModel)]="form.nombre" required></div><div><label class="label">RUC</label><input class="input" name="ruc" [(ngModel)]="form.ruc"></div><div><label class="label">Contacto</label><input class="input" name="contacto" [(ngModel)]="form.contacto"></div><div><label class="label">Teléfono</label><input class="input" name="telefono" [(ngModel)]="form.telefono"></div><div><label class="label">Correo</label><input class="input" type="email" name="email" [(ngModel)]="form.email"></div><div class="sm:col-span-2"><label class="label">Dirección</label><input class="input" name="direccion" [(ngModel)]="form.direccion"></div><div class="sm:col-span-2"><label class="label">Notas</label><textarea class="input" name="notas" rows="2" [(ngModel)]="form.notas"></textarea></div><div class="sm:col-span-2 flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="modal.set(false)">Cancelar</button><button class="btn-primary" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar proveedor' }}</button></div>@if(error()){<p class="sm:col-span-2 text-sm text-red-600">{{ error() }}</p>}</form></section></div>}
    </div>
  `,
})
export class ProveedoresComponent {
  private api = inject(ApiService); readonly empresa = inject(EmpresaService);
  private dialog = inject(DialogService);
  private loading = inject(LoadingService);
  lista = signal<Proveedor[]>([]); modal = signal(false); editId = signal<number | null>(null); guardando = signal(false); cargando = signal(false); error = signal(''); errorCarga = signal('');
  search = ''; filtroActivo: 'activos' | 'inactivos' | 'todos' = 'activos'; form: any = this.vacio();
  constructor() { effect(() => { this.empresa.actualId(); this.cargar(); }); }
  vacio(): any { return { nombre: '', ruc: '', contacto: '', telefono: '', email: '', direccion: '', notas: '', activo: true }; }
  cargar(): void {
    const empresaId = this.empresa.actualId();
    if (!empresaId) { this.lista.set([]); this.errorCarga.set('Selecciona una empresa activa para ver sus proveedores.'); return; }
    const activo = this.filtroActivo === 'todos' ? null : this.filtroActivo === 'activos';
    this.cargando.set(true); this.errorCarga.set('');
    this.api.proveedores({ empresa_id: empresaId, search: this.search || undefined, activo }).subscribe({
      next: p => { this.lista.set(p); this.cargando.set(false); },
      error: e => { this.cargando.set(false); this.errorCarga.set(e?.error?.detail || 'No se pudieron cargar los proveedores de la empresa activa.'); void this.dialog.apiError(e, 'No se pudieron cargar los proveedores.'); },
    });
  }
  nuevo(): void { this.form = this.vacio(); this.editId.set(null); this.error.set(''); this.modal.set(true); }
  editar(p: Proveedor): void { this.form = { ...p }; this.editId.set(p.id); this.error.set(''); this.modal.set(true); }
  guardar(): void { this.guardando.set(true); this.error.set(''); const req = this.editId() ? this.api.actualizarProveedor(this.editId()!, this.form) : this.api.crearProveedor({ ...this.form, empresa_id: this.empresa.actualId() }); req.subscribe({ next: () => { this.guardando.set(false); this.modal.set(false); void this.dialog.success({ title: 'Proveedor guardado' }); this.cargar(); }, error: e => { this.guardando.set(false); this.error.set(e?.error?.detail || 'No se pudo guardar proveedor.'); void this.dialog.apiError(e, 'No se pudo guardar el proveedor.'); } }); }
  async baja(p: Proveedor): Promise<void> { if (!await this.dialog.confirm({ title: '¿Dar de baja proveedor?', text: `${p.nombre}. Sus compras se conservarán.`, confirmText: 'Dar de baja', danger: true })) return; this.api.eliminarProveedor(p.id).subscribe({ next: () => this.cargar(), error: e => { void this.dialog.apiError(e, 'No se pudo dar de baja el proveedor.'); } }); }
  reactivar(p: Proveedor): void { this.api.actualizarProveedor(p.id, { activo: true }).subscribe({ next: () => this.cargar(), error: e => { void this.dialog.apiError(e, 'No se pudo reactivar el proveedor.'); } }); }
}
