import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';

interface CatalogoPieza {
  clave: string;
  nombre: string;
  estilos: string[];
  descripcion: string;
  medidas: { ancho: number; alto: number; profundidad: number };
}

@Component({
  selector: 'app-diseno3d-catalogo',
  imports: [],
  template: `
    <div class="space-y-5">
      <div>
        <h1 class="text-2xl font-extrabold text-slate-800">Catálogo de Piezas</h1>
        <p class="text-sm text-slate-500">
          Tipos de piezas dentales disponibles para generar el molde digital en 3D.
        </p>
      </div>

      @if (cargando()) {
        <p class="text-sm text-slate-400">Cargando catálogo…</p>
      } @else {
        <div class="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          @for (p of piezas(); track p.clave) {
            <div class="card flex flex-col p-5">
              <div class="mb-3 flex h-24 items-center justify-center rounded-xl bg-purple-950">
                <svg class="h-12 w-12 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
              </div>
              <h2 class="text-lg font-extrabold text-slate-800">{{ p.nombre }}</h2>
              <p class="mt-1 flex-1 text-sm text-slate-500">{{ p.descripcion }}</p>

              <div class="mt-3 flex flex-wrap gap-1.5">
                @for (e of p.estilos; track e) {
                  <span class="badge bg-purple-100 text-purple-700">{{ e }}</span>
                }
              </div>

              <div class="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
                <div>
                  <p class="text-[10px] uppercase tracking-wide text-slate-400">Ancho</p>
                  <p class="text-sm font-bold text-slate-700">{{ p.medidas.ancho }} mm</p>
                </div>
                <div>
                  <p class="text-[10px] uppercase tracking-wide text-slate-400">Alto</p>
                  <p class="text-sm font-bold text-slate-700">{{ p.medidas.alto }} mm</p>
                </div>
                <div>
                  <p class="text-[10px] uppercase tracking-wide text-slate-400">Prof.</p>
                  <p class="text-sm font-bold text-slate-700">{{ p.medidas.profundidad }} mm</p>
                </div>
              </div>

              <button class="btn-primary mt-4 w-full justify-center" type="button" (click)="disenar(p.clave)">
                Diseñar esta pieza
              </button>
            </div>
          }
        </div>

        <p class="text-xs text-slate-400">
          Modelos anatómicos © University of Dundee, School of Dentistry — licencia
          Creative Commons Attribution (CC BY 4.0).
        </p>
      }
    </div>
  `,
})
export class Diseno3DCatalogoComponent {
  private api = inject(ApiService);
  private router = inject(Router);

  piezas = signal<CatalogoPieza[]>([]);
  cargando = signal(true);

  constructor() {
    this.api.catalogoDiseno3D().subscribe({
      next: (r) => {
        this.piezas.set(r?.piezas ?? []);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }

  disenar(clave: string): void {
    this.router.navigate(['/diseno3d'], { queryParams: { tipo: clave } });
  }
}