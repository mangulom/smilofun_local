// Asistente IA de SmiloFun: chat heurístico sobre los datos de la empresa activa.
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';

interface Mensaje {
  rol: 'usuario' | 'ia';
  texto: string;
  datos?: any[];
}

@Component({
  selector: 'app-ia-asistente',
  imports: [FormsModule],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Asistente IA</h1>
          <p class="text-sm text-slate-500">
            Pregunta en lenguaje natural sobre pacientes, ingresos, citas, riesgo, inventario y deudas.
          </p>
        </div>
        <button class="btn-ghost" type="button" (click)="limpiar()">Limpiar</button>
      </div>

      <div class="card flex h-[70vh] flex-col overflow-hidden">
        <div class="flex-1 space-y-4 overflow-y-auto p-5">
          @for (m of mensajes(); track $index) {
            <div class="flex" [class.justify-end]="m.rol === 'usuario'">
              <div
                class="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm"
                [class]="m.rol === 'usuario' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700'"
              >
                <p class="whitespace-pre-line">{{ m.texto }}</p>
                @if (m.datos?.length) {
                  <div class="mt-3 space-y-1.5 border-t border-slate-300/40 pt-2">
                    @for (d of m.datos; track $index) {
                      <div class="flex justify-between gap-4 text-xs">
                        <span class="text-slate-500">{{ etiqueta(d) }}</span>
                        <span class="font-semibold text-slate-700">{{ valor(d) }}</span>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }
          @if (cargando()) {
            <div class="flex">
              <div class="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400">Analizando…</div>
            </div>
          }
        </div>

        <!-- Sugerencias -->
        <div class="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
          @for (s of sugerencias; track s) {
            <button
              type="button"
              class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-primary-400 hover:text-primary-700"
              (click)="preguntar(s)"
            >
              {{ s }}
            </button>
          }
        </div>

        <!-- Entrada -->
        <form class="flex items-center gap-2 border-t border-slate-100 p-4" (ngSubmit)="enviar()">
          <input
            class="input flex-1"
            type="text"
            name="pregunta"
            placeholder="Escribe tu pregunta…"
            [(ngModel)]="texto"
            [disabled]="cargando()"
            autocomplete="off"
          />
          <button class="btn-primary" type="submit" [disabled]="cargando() || !texto.trim()">Enviar</button>
        </form>
      </div>
    </div>
  `,
})
export class IaAsistenteComponent {
  private api = inject(ApiService);
  private empresa = inject(EmpresaService);

  cargando = signal(false);
  mensajes = signal<Mensaje[]>([]);
  texto = '';

  readonly sugerencias = [
    '¿Cuántos pacientes tengo?',
    '¿Cuánto voy a facturar?',
    'Riesgo de inasistencia',
    'Stock bajo',
    'Tratamientos más rentables',
    '¿Qué me recomiendas?',
  ];

  constructor() {
    effect(() => {
      // Reinicia la conversación al cambiar de empresa.
      this.empresa.actualId();
      this.limpiar();
    });
  }

  limpiar(): void {
    this.mensajes.set([
      {
        rol: 'ia',
        texto:
          '¡Hola! Soy tu asistente de SmiloFun. Pregúntame por pacientes, ingresos, citas, ' +
          'riesgo de inasistencia, inventario o deudas de la empresa activa.',
      },
    ]);
  }

  preguntar(p: string): void {
    this.texto = p;
    this.enviar();
  }

  enviar(): void {
    const pregunta = this.texto.trim();
    if (!pregunta || this.cargando()) return;
    this.texto = '';
    this.mensajes.update((m) => [...m, { rol: 'usuario', texto: pregunta }]);
    this.cargando.set(true);

    this.api.asistenteIA(pregunta, this.empresa.actualId() ?? undefined).subscribe({
      next: (r) => {
        this.mensajes.update((m) => [
          ...m,
          { rol: 'ia', texto: r?.respuesta ?? 'No pude procesar la pregunta.', datos: r?.datos },
        ]);
        this.cargando.set(false);
      },
      error: () => {
        this.mensajes.update((m) => [
          ...m,
          { rol: 'ia', texto: 'Ocurrió un error al consultar. Intenta de nuevo.', datos: undefined },
        ]);
        this.cargando.set(false);
      },
    });
  }

  etiqueta(d: any): string {
    if (d == null) return '';
    return d.nombre ?? d.titulo ?? d.paciente ?? d.mes ?? d.tratamiento ?? d.fecha ?? this.json(d);
  }

  valor(d: any): string {
    if (d == null) return '';
    if (typeof d !== 'object') return String(d);
    const partes: string[] = [];
    for (const k of Object.keys(d)) {
      if (['nombre', 'titulo', 'paciente', 'mes', 'tratamiento', 'fecha'].includes(k)) continue;
      const v = d[k];
      if (v === null || v === undefined) continue;
      partes.push(`${k}: ${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`);
    }
    return partes.join(' · ') || this.json(d);
  }

  private json(d: any): string {
    try {
      return JSON.stringify(d);
    } catch {
      return '';
    }
  }
}

