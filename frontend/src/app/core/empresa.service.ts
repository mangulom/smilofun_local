import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Empresa } from './models';

const CLAVE = 'empresaActual';

@Injectable({ providedIn: 'root' })
export class EmpresaService {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  /** Todas las empresas del sistema (para nombres y colores). */
  readonly lista = signal<Empresa[]>([]);
  readonly actualId = signal<number>(Number(localStorage.getItem(CLAVE)) || 0);

  /** Solo las empresas asignadas al usuario que inició sesión. */
  readonly asignadas = computed<Empresa[]>(() => {
    const ids = (this.auth.usuario()?.empresas ?? []).map((e) => e.id);
    const todas = this.lista();
    if (!ids.length) return todas;
    return todas.filter((e) => ids.includes(e.id));
  });

  readonly actual = computed(
    () => this.asignadas().find((e) => e.id === this.actualId()) ?? this.asignadas()[0] ?? null
  );
  readonly nombreActual = computed(() => this.actual()?.nombre ?? 'Empresa');
  readonly colorActual = computed(() => this.actual()?.color ?? '#7c3aed');
  readonly tieneVarias = computed(() => this.asignadas().length > 1);

  cargar(): void {
    // Refresca el perfil para conocer las empresas asignadas al usuario.
    this.auth.refrescar();
    this.api.empresas().subscribe({
      next: (lista) => {
        this.lista.set(lista);
        const permitidas = this.asignadas();
        if (!permitidas.length) return;
        const guardada = Number(localStorage.getItem(CLAVE)) || this.actualId();
        const principal = this.auth.usuario()?.empresa_id ?? 0;
        const objetivo = permitidas.some((e) => e.id === guardada)
          ? guardada
          : permitidas.some((e) => e.id === principal)
            ? principal
            : permitidas[0].id;
        if (objetivo && objetivo !== this.actualId()) this.seleccionar(objetivo);
      },
    });
  }

  seleccionar(id: number): void {
    this.actualId.set(id);
    localStorage.setItem(CLAVE, String(id));
  }

  nombre(id?: number | null): string {
    if (id === null || id === undefined) return '—';
    return this.lista().find((e) => e.id === id)?.nombre ?? `Empresa ${id}`;
  }

  color(id?: number | null): string {
    if (id === null || id === undefined) return '#94a3b8';
    return this.lista().find((e) => e.id === id)?.color ?? '#94a3b8';
  }
}
