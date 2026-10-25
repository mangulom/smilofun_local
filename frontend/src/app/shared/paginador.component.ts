import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-paginador',
  imports: [FormsModule],
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
      <p class="text-xs text-slate-500">
        Mostrando <b>{{ inicio() }}–{{ fin() }}</b> de <b>{{ total() }}</b> registros
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <select
          class="input !w-auto !py-1.5 text-xs"
          [ngModel]="pageSize()"
          (ngModelChange)="cambiarTamano($event)"
          title="Registros por página"
        >
          <option [ngValue]="10">10 / página</option>
          <option [ngValue]="15">15 / página</option>
          <option [ngValue]="20">20 / página</option>
        </select>
        <button
          type="button"
          class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:border-blue-400 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
          (click)="ir(page() - 1)"
          [disabled]="page() <= 1"
        >‹ Anterior</button>
        <span class="text-xs font-semibold text-slate-600">Página {{ page() }} de {{ totalPaginas() }}</span>
        <button
          type="button"
          class="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:border-blue-400 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
          (click)="ir(page() + 1)"
          [disabled]="page() >= totalPaginas()"
        >Siguiente ›</button>
      </div>
    </div>
  `,
})
export class PaginadorComponent {
  total = input(0);
  pageSize = input(10);
  page = input(1);

  pageChange = output<number>();
  pageSizeChange = output<number>();

  totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total() / this.pageSize()));
  }

  inicio(): number {
    if (this.total() === 0) return 0;
    return (this.page() - 1) * this.pageSize() + 1;
  }

  fin(): number {
    return Math.min(this.page() * this.pageSize(), this.total());
  }

  ir(p: number): void {
    if (p < 1 || p > this.totalPaginas() || p === this.page()) return;
    this.pageChange.emit(p);
  }

  cambiarTamano(t: number): void {
    this.pageSizeChange.emit(t);
  }
}