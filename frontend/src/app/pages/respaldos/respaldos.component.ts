import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Respaldo, ResultadoRestauracion } from '../../core/models';
import { DialogService } from '../../shared/dialog.service';

@Component({
  selector: 'app-respaldos',
  imports: [FormsModule, DatePipe, DecimalPipe],
  template: `
    <div class="space-y-5">
      <!-- Cabecera -->
      @if (modoDemo()) {
        <div class="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Respaldos y restauración están deshabilitados: esta demo solo mantiene datos en memoria y se reinicia al apagar.</div>
      }
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          @if (esRestaurar) {
            <h1 class="text-2xl font-extrabold text-slate-800">Restaurar Base de Datos</h1>
            <p class="text-sm text-slate-500">
              Elige una copia de respaldo para devolver el sistema al estado en que estaba en esa fecha.
            </p>
          } @else {
            <h1 class="text-2xl font-extrabold text-slate-800">Copia de Respaldo de Base de Datos</h1>
            <p class="text-sm text-slate-500">
              Crea copias de seguridad de toda la información del sistema y descárgalas para guardarlas.
            </p>
          }
        </div>
        <div class="flex flex-wrap items-center gap-2">
          @if (esRestaurar) {
            <button class="btn-ghost" type="button" (click)="selector.click()" [disabled]="ocupado()">
              {{ subiendo() ? 'Subiendo…' : 'Subir archivo de respaldo' }}
            </button>
            <input #selector type="file" class="hidden" accept=".gz,.jsonl.gz" (change)="subir($event)" />
          } @else {
            <input class="input w-52" placeholder="Etiqueta (opcional)" maxlength="40" [(ngModel)]="etiqueta" [disabled]="ocupado()" />
            <button class="btn-primary" type="button" (click)="crear()" [disabled]="ocupado()">
              {{ creando() ? 'Creando respaldo…' : '+ Crear respaldo ahora' }}
            </button>
          }
        </div>
      </div>

      @if (esRestaurar) {
        <div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <b>Atención:</b> restaurar <b>reemplaza todos los datos actuales</b> por los del respaldo elegido. Antes de hacerlo se guarda
          automáticamente una copia del estado actual. Si el respaldo viene de otro equipo, súbelo con «Subir archivo de respaldo».
        </div>
      } @else {
        <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          El respaldo incluye <b>todos los datos de la base</b> (pacientes, citas, facturas, inventario, usuarios, configuración…).
          <b>No incluye los archivos subidos</b> (radiografías, DICOM, escaneos): guárdalos copiando la carpeta
          <code class="rounded bg-amber-100 px-1">backend/uploads</code>. Los respaldos contienen datos de pacientes: guárdalos en un lugar seguro.
        </div>
      }

      @if (exito(); as mensaje) {
        <p class="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{{ mensaje }}</p>
      }
      @if (error(); as mensaje) {
        <p class="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{{ mensaje }}</p>
      }

      <!-- Listado -->
      <div class="card overflow-hidden">
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 class="font-bold text-slate-800">{{ esRestaurar ? 'Respaldos disponibles para restaurar' : 'Respaldos guardados' }}</h2>
          <span class="text-xs text-slate-400">{{ lista().length }} archivo(s) · {{ totalTamano() }}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full">
            <thead class="bg-slate-50">
              <tr>
                <th class="th">Respaldo</th>
                <th class="th">Fecha</th>
                <th class="th">Tamaño</th>
                <th class="th text-right">Registros</th>
                <th class="th">Origen</th>
                <th class="th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (b of lista(); track b.nombre) {
                <tr>
                  <td class="td font-mono text-xs font-semibold">{{ b.nombre }}</td>
                  <td class="td">{{ b.creado | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td class="td">{{ formatoTamano(b.tamano) }}</td>
                  <td class="td text-right">
                    @if (b.valido) { {{ b.filas | number }} <span class="text-xs text-slate-400">en {{ b.tablas }} tablas</span> }
                    @else { <span class="badge bg-red-100 text-red-700">Dañado</span> }
                  </td>
                  <td class="td">
                    @if (b.tipo === 'previo') {
                      <span class="badge bg-slate-100 text-slate-600" title="Creado automáticamente antes de una restauración">Previo a restaurar</span>
                    } @else {
                      <span class="badge bg-sky-100 text-sky-700">Manual</span>
                    }
                  </td>
                  <td class="td">
                    <div class="flex justify-end gap-3 text-sm font-semibold">
                      @if (esRestaurar) {
                        <button class="text-amber-600 disabled:opacity-40" (click)="pedirRestaurar(b)" [disabled]="ocupado() || !b.valido">Restaurar</button>
                      } @else {
                        <button class="text-primary-700 disabled:opacity-40" (click)="descargar(b)" [disabled]="ocupado()">Descargar</button>
                        <button class="text-red-500 disabled:opacity-40" (click)="eliminar(b)" [disabled]="ocupado()">Eliminar</button>
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="td py-10 text-center text-slate-400">
                    {{ cargando() ? 'Cargando…' : esRestaurar ? 'No hay respaldos para restaurar. Crea uno en «Copia de Respaldo de Base de Datos» o sube un archivo.' : 'Todavía no hay respaldos. Crea el primero con «Crear respaldo ahora».' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Confirmación de restauración -->
      @if (esRestaurar && aRestaurar(); as b) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-primary-950/60 p-4" (click)="cancelar()">
          <section class="card w-full max-w-lg p-6" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
            @if (!resultado()) {
              <h2 class="text-lg font-extrabold text-red-600">Restaurar base de datos</h2>
              <p class="mt-2 text-sm text-slate-600">
                Vas a <b>reemplazar todos los datos actuales</b> por los del respaldo
                <span class="font-mono text-xs font-semibold">{{ b.nombre }}</span>
                ({{ b.creado | date: 'dd/MM/yyyy HH:mm' }}). Todo lo registrado después de esa fecha se perderá.
              </p>
              <ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                <li>Antes de restaurar se guarda automáticamente un respaldo del estado actual.</li>
                <li>Si algo falla, la base queda como estaba.</li>
                <li>Se reemplazan también los usuarios: tendrás que iniciar sesión de nuevo.</li>
                <li>No uses la aplicación mientras dura el proceso.</li>
              </ul>
              <label class="label mt-4" for="confirmacion">Escribe <b>RESTAURAR</b> para confirmar</label>
              <input id="confirmacion" class="input" autocomplete="off" [(ngModel)]="confirmacion" [disabled]="restaurando()" />
              @if (errorRestaurar(); as mensaje) {
                <p class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{{ mensaje }}</p>
              }
              <div class="mt-5 flex justify-end gap-2">
                <button class="btn-ghost" type="button" (click)="cancelar()" [disabled]="restaurando()">Cancelar</button>
                <button
                  class="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  type="button"
                  (click)="restaurar(b)"
                  [disabled]="restaurando() || confirmacion.trim() !== 'RESTAURAR'"
                >
                  {{ restaurando() ? 'Restaurando…' : 'Restaurar ahora' }}
                </button>
              </div>
            } @else {
              <h2 class="text-lg font-extrabold text-emerald-700">Restauración completada</h2>
              <p class="mt-2 text-sm text-slate-600">
                Se restauraron {{ resultado()!.filas | number }} registros de {{ resultado()!.tablas }} tablas.
                El estado anterior quedó guardado como
                <span class="font-mono text-xs font-semibold">{{ resultado()!.respaldo_previo }}</span>.
              </p>
              <p class="mt-2 text-sm text-slate-600">Inicia sesión de nuevo para continuar con los datos restaurados.</p>
              <div class="mt-5 flex justify-end">
                <button class="btn-primary" type="button" (click)="reingresar()">Iniciar sesión de nuevo</button>
              </div>
            }
          </section>
        </div>
      }
    </div>
  `,
})
export class RespaldosComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private dialog = inject(DialogService);
  modoDemo = signal(false);
  readonly esRestaurar = inject(ActivatedRoute).snapshot.data['modo'] === 'restaurar';

  lista = signal<Respaldo[]>([]);
  cargando = signal(true);
  creando = signal(false);
  subiendo = signal(false);
  restaurando = signal(false);
  error = signal('');
  exito = signal('');
  errorRestaurar = signal('');
  aRestaurar = signal<Respaldo | null>(null);
  resultado = signal<ResultadoRestauracion | null>(null);
  etiqueta = '';
  confirmacion = '';

  ocupado = computed(() => this.creando() || this.subiendo() || this.restaurando());
  totalTamano = computed(() => this.formatoTamano(this.lista().reduce((suma, b) => suma + b.tamano, 0)));

  constructor() {
    this.api.health().subscribe({ next: result => this.modoDemo.set(result.demo_mode === true) });
    this.cargar();
  }

  cargar(): void {
    if (this.modoDemo()) { this.lista.set([]); this.cargando.set(false); return; }
    this.api.respaldos().subscribe({
      next: lista => {
        this.lista.set(lista);
        this.cargando.set(false);
      },
      error: e => {
        this.cargando.set(false);
        this.error.set(this.mensaje(e, 'No se pudo cargar la lista de respaldos.'));
      },
    });
  }

  crear(): void {
    if (this.modoDemo()) return;
    this.limpiarMensajes();
    this.creando.set(true);
    this.api.crearRespaldo(this.etiqueta.trim() || undefined).subscribe({
      next: b => {
        this.creando.set(false);
        this.etiqueta = '';
        this.exito.set(`Respaldo creado: ${b.nombre} (${b.filas} registros).`);
        void this.dialog.success({ title: 'Respaldo creado', text: `${b.nombre} (${b.filas} registros).` });
        this.cargar();
      },
      error: e => {
        this.creando.set(false);
        this.error.set(this.mensaje(e, 'No se pudo crear el respaldo.'));
      },
    });
  }

  subir(evento: Event): void {
    if (this.modoDemo()) return;
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    this.limpiarMensajes();
    this.subiendo.set(true);
    this.api.subirRespaldo(archivo).subscribe({
      next: b => {
        this.subiendo.set(false);
        this.exito.set(`Respaldo subido y verificado: ${b.nombre}. Ya puedes restaurarlo.`);
        void this.dialog.success({ title: 'Respaldo cargado', text: 'El archivo se subió y verificó correctamente.' });
        this.cargar();
      },
      error: e => {
        this.subiendo.set(false);
        this.error.set(this.mensaje(e, 'No se pudo subir el respaldo.'));
      },
    });
  }

  descargar(b: Respaldo): void {
    if (this.modoDemo()) return;
    this.limpiarMensajes();
    this.api.descargarRespaldo(b.nombre).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = b.nombre;
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
      error: () => this.error.set('No se pudo descargar el respaldo.'),
    });
  }

  async eliminar(b: Respaldo): Promise<void> {
    if (!await this.dialog.confirm({ title: '¿Eliminar respaldo?', text: `${b.nombre}. Esta acción no se puede deshacer.`, confirmText: 'Eliminar respaldo', danger: true })) return;
    this.limpiarMensajes();
    this.api.eliminarRespaldo(b.nombre).subscribe({
      next: () => {
        this.exito.set(`Respaldo eliminado: ${b.nombre}.`);
        this.cargar();
      },
      error: e => this.error.set(this.mensaje(e, 'No se pudo eliminar el respaldo.')),
    });
  }

  pedirRestaurar(b: Respaldo): void {
    this.limpiarMensajes();
    this.confirmacion = '';
    this.errorRestaurar.set('');
    this.resultado.set(null);
    this.aRestaurar.set(b);
  }

  cancelar(): void {
    if (this.restaurando()) return;
    this.aRestaurar.set(null);
    if (this.resultado()) this.reingresar();
  }

  restaurar(b: Respaldo): void {
    if (this.modoDemo()) return;
    this.errorRestaurar.set('');
    this.restaurando.set(true);
    this.api.restaurarRespaldo(b.nombre, this.confirmacion.trim()).subscribe({
      next: r => {
        this.restaurando.set(false);
        this.resultado.set(r);
        void this.dialog.success({ title: 'Restauración completada', text: 'La base de datos informó que el proceso terminó.' });
      },
      error: e => {
        this.restaurando.set(false);
        this.errorRestaurar.set(this.mensaje(e, 'No se pudo restaurar el respaldo. La base de datos quedó sin cambios.'));
      },
    });
  }

  reingresar(): void {
    this.aRestaurar.set(null);
    this.resultado.set(null);
    this.auth.logout();
  }

  formatoTamano(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  private limpiarMensajes(): void {
    this.error.set('');
    this.exito.set('');
  }

  private mensaje(e: unknown, porDefecto: string): string {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) return 'No se pudo conectar con el servidor. Comprueba que el backend esté en marcha.';
      if (e.status === 403) return 'Solo un administrador puede gestionar los respaldos.';
      const detalle = e.error?.detail;
      if (typeof detalle === 'string' && detalle) return detalle;
    }
    return porDefecto;
  }
}
