import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DicomModules, crearGrupoHerramientas, getDicomModules } from './dicom-runtime';
import { CorteDicom, EstudioDicom, corteAImageData, leerDicomSinComprimir, rangoDeCorte } from './dicom-simple';

/** Estado del visor propio (series sin comprimir, sin web workers). */
interface VisorNativo {
  cortes: CorteDicom[];
  canvas: HTMLCanvasElement;
  imagen: HTMLCanvasElement;
  datos?: ImageData;
  indice: number;
  centro: number;
  ancho: number;
  centroBase: number;
  anchoBase: number;
  invertido: boolean;
  invertidoBase: boolean;
  zoom: number;
  panX: number;
  panY: number;
  limpiar: () => void;
}

@Component({
  selector: 'app-resonancia-viewer',
  imports: [FormsModule],
  template: `
    <div #contenedor class="flex h-full min-h-0 flex-col bg-slate-950 text-white" [class.fixed]="pantallaCompleta()" [class.inset-0]="pantallaCompleta()" [class.z-[70]]="pantallaCompleta()">
      <header class="flex flex-wrap items-center gap-2 border-b border-white/10 bg-primary-900 px-4 py-3">
        <button class="icon-button" (click)="cerrar.emit()" title="Cerrar visor de resonancia" aria-label="Cerrar">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div class="min-w-0">
          <p class="truncate font-bold">{{ titulo }}</p>
          <p class="text-[10px] text-primary-200">Visor de resonancia magnética {{ modalidad() || 'MR' }} · cine de cortes</p>
        </div>
        <span class="badge bg-violet-500 text-[10px] text-white">RESONANCIA</span>

        <div class="ml-auto flex flex-wrap items-center gap-1.5">
          <!-- Cine -->
          <button
            class="flex items-center gap-1 rounded-lg border border-white/25 px-2.5 py-1 text-[11px] font-bold transition hover:border-accent-400 hover:text-accent-300"
            [class]="reproduciendo() ? 'border-accent-400 bg-accent-400 text-primary-950' : 'text-white/80'"
            (click)="alternarCine()"
            [disabled]="cortes() < 2 || !!error()"
            [title]="reproduciendo() ? 'Pausar cine' : 'Reproducir cine'"
          >
            @if (reproduciendo()) {
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5h3v14H8zM13 5h3v14h-3z" /></svg>
              Pausar
            } @else {
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z" /></svg>
              Cine
            }
          </button>
          <select
            class="cursor-pointer rounded-lg border border-white/25 bg-primary-900 px-1.5 py-1 text-[11px] font-bold text-white outline-none focus:border-accent-400"
            [ngModel]="velocidad()"
            (ngModelChange)="cambiarVelocidad($event)"
            [disabled]="!!error()"
            title="Velocidad del cine (cortes por segundo)"
            aria-label="Velocidad del cine"
          >
            @for (v of velocidades; track v) {
              <option [ngValue]="v">{{ v }} fps</option>
            }
          </select>
          <button
            class="rounded-lg border px-2.5 py-1 text-[11px] font-bold transition"
            [class]="bucle() ? 'border-accent-400 bg-accent-400 text-primary-950' : 'border-white/25 text-white/80 hover:border-accent-400 hover:text-accent-300'"
            (click)="bucle.set(!bucle())"
            [disabled]="!!error()"
            title="Repetir al llegar al último corte"
          >
            Bucle
          </button>
          <span class="mx-1 h-5 w-px bg-white/15"></span>
          <button class="icon-button" (click)="invertir()" [disabled]="!!error()" title="Invertir escala de grises">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" />
            </svg>
          </button>
          <button class="icon-button" (click)="autoContraste()" [disabled]="!!error()" title="Auto contraste">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10l1.4 1.4M3 12h2m14 0h2M5.6 18.4L7 17m10-10l1.4-1.4" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button class="icon-button" (click)="alternarPantallaCompleta()" [attr.aria-label]="pantallaCompleta() ? 'Restaurar en modal' : 'Pantalla completa'" [title]="pantallaCompleta() ? 'Restaurar en modal' : 'Pantalla completa'">
            @if (pantallaCompleta()) { <span class="px-1 text-xs font-bold">↙ Restaurar</span> } @else { <span class="px-1 text-xs font-bold">⛶ Pantalla completa</span> }
          </button>
          <button class="icon-button !border-red-300/50 hover:!border-red-400 hover:!text-red-300" (click)="cerrar.emit()" title="Cerrar visor"><span class="px-1 text-xs font-bold">Cerrar</span></button>
          <a class="icon-button" [href]="url" target="_blank" rel="noopener" title="Abrir archivo DICOM original">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
          </a>
        </div>
      </header>

      <main class="relative min-h-0 flex-1 bg-black">
        <div #viewport class="h-full w-full select-none touch-none" (contextmenu)="$event.preventDefault()"></div>

        @if (cargando()) {
          <div class="absolute inset-0 flex items-center justify-center bg-slate-950/70">
            <div class="rounded-xl bg-white/10 px-5 py-4 text-center shadow-xl">
              <div class="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-accent-400"></div>
              <p class="text-sm font-semibold">{{ estadoCarga() }}</p>
              @if (progresoCarga() > 0) { <p class="mt-1 text-xs text-primary-200">{{ progresoCarga() }} / {{ imageUrls.length || 1 }} cortes</p> }
            </div>
          </div>
        }

        @if (error(); as mensaje) {
          <div class="absolute inset-0 flex items-center justify-center p-5">
            <div class="max-w-md rounded-2xl border border-red-400/40 bg-slate-900 p-6 text-center shadow-2xl">
              <p class="font-bold text-red-300">No se pudo abrir la resonancia</p>
              <p class="mt-2 text-sm text-slate-300">{{ mensaje }}</p>
              <p class="mt-3 text-xs text-slate-500">Comprueba que el archivo sea un DICOM (MR) válido.</p>
            </div>
          </div>
        }

        @if (!cargando() && !error()) {
          <div class="pointer-events-none absolute left-3 top-3 rounded-lg border border-white/15 bg-slate-950/75 px-3 py-1.5">
            <p class="text-[10px] uppercase tracking-wide text-primary-300">Corte</p>
            <p class="font-mono text-sm font-bold text-white">{{ corteActual() }} / {{ cortes() }}</p>
          </div>
          @if (reproduciendo()) {
            <div class="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-lg border border-accent-400/40 bg-slate-950/75 px-3 py-1.5">
              <span class="h-2 w-2 animate-pulse rounded-full bg-accent-400"></span>
              <span class="text-xs font-bold text-accent-300">CINE {{ velocidad() }} fps</span>
            </div>
          }
        }
      </main>

      <footer class="border-t border-white/10 bg-primary-900 px-4 py-3">
        @if (cortes() > 1) {
          <div class="mx-auto flex max-w-3xl items-center gap-3">
            <button class="icon-button !p-1.5" (click)="moverCorte(-1)" [disabled]="corteActual() <= 1" title="Corte anterior">‹</button>
            <input
              class="h-1.5 flex-1 cursor-pointer accent-accent-400"
              type="range"
              min="1"
              [max]="cortes()"
              [value]="corteActual()"
              (input)="seleccionarCorte($event)"
              aria-label="Seleccionar corte de resonancia"
            />
            <button class="icon-button !p-1.5" (click)="moverCorte(1)" [disabled]="corteActual() >= cortes()" title="Corte siguiente">›</button>
          </div>
        }
        <p class="mt-2 text-center text-[11px] text-primary-200">
          Arrastrar izquierdo: ventana/nivel · rueda: cortes · botón central: mover · botón derecho: zoom · cine: reproduce la serie
        </p>
      </footer>
    </div>
  `,
  styles: [
    `
      .icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 0.6rem;
        padding: 0.5rem;
        color: #fff;
        transition: all 0.15s;
      }
      .icon-button:hover:not(:disabled) {
        border-color: #facc15;
        color: #facc15;
      }
      .icon-button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }
    `,
  ],
})
export class ResonanciaViewerComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) url!: string;
  @Input({ required: true }) titulo!: string;
  @Input() imageUrls: string[] = [];
  @Output() cerrar = new EventEmitter<void>();
  @ViewChild('viewport', { static: true }) private viewportHost!: ElementRef<HTMLDivElement>;
  @ViewChild('contenedor', { static: true }) private contenedor!: ElementRef<HTMLDivElement>;

  cargando = signal(true);
  estadoCarga = signal('Preparando visor DICOM…');
  progresoCarga = signal(0);
  error = signal<string | null>(null);
  cortes = signal(0);
  corteActual = signal(1);
  modalidad = signal('');
  reproduciendo = signal(false);
  velocidad = signal(8);
  bucle = signal(true);
  pantallaCompleta = signal(false);

  readonly velocidades = [2, 4, 8, 12, 16];

  private readonly identificador = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private readonly renderingEngineId = `mr-engine-${this.identificador}`;
  private readonly viewportId = `mr-viewport-${this.identificador}`;
  private readonly toolGroupId = `mr-tools-${this.identificador}`;
  private modules?: DicomModules;
  private engine?: any;
  private viewport?: any;
  private destruido = false;
  private onNuevoCorte?: EventListener;
  private temporizador?: ReturnType<typeof setInterval>;
  private cambiando = false;
  private nativo?: VisorNativo;
  private estadoAnteriorPantalla: { overflow: string; scrollY: number } | null = null;

  alternarPantallaCompleta(): void {
    if (!this.pantallaCompleta()) {
      this.estadoAnteriorPantalla = { overflow: document.body.style.overflow, scrollY: window.scrollY };
      document.body.style.overflow = 'hidden';
      this.pantallaCompleta.set(true);
    } else {
      this.pantallaCompleta.set(false);
      if (this.estadoAnteriorPantalla) {
        document.body.style.overflow = this.estadoAnteriorPantalla.overflow;
        window.scrollTo(0, this.estadoAnteriorPantalla.scrollY);
        this.estadoAnteriorPantalla = null;
      }
    }
    requestAnimationFrame(() => {
      this.engine?.resize(true, true);
      this.engine?.renderViewport(this.viewportId);
      this.redimensionarNativo();
    });
  }

  ngAfterViewInit(): void {
    void this.abrirEstudio();
  }

  ngOnDestroy(): void {
    this.destruido = true;
    if (this.estadoAnteriorPantalla) document.body.style.overflow = this.estadoAnteriorPantalla.overflow;
    this.detenerCine();
    this.nativo?.limpiar();
    this.nativo = undefined;
    if (this.modules) {
      if (this.onNuevoCorte) {
        this.viewportHost.nativeElement.removeEventListener(
          this.modules.core.Enums.Events.STACK_NEW_IMAGE,
          this.onNuevoCorte,
        );
      }
      this.modules.tools.ToolGroupManager.destroyToolGroup(this.toolGroupId);
      this.modules.loader.wadouri.dataSetCacheManager.purge();
    }
    this.engine?.destroy();
  }

  alternarCine(): void {
    if (this.reproduciendo()) {
      this.detenerCine();
      return;
    }
    if (this.cortes() < 2) return;
    if (this.corteActual() >= this.cortes()) void this.irACorte(1);
    this.reproduciendo.set(true);
    this.programar();
  }

  cambiarVelocidad(fps: number): void {
    this.velocidad.set(Number(fps) || 8);
    if (this.reproduciendo()) this.programar();
  }

  invertir(): void {
    if (this.nativo) {
      this.nativo.invertido = !this.nativo.invertido;
      this.dibujarNativo();
      return;
    }
    if (!this.viewport || !this.engine) return;
    const invertido = !this.viewport.getProperties().invert;
    this.viewport.setProperties({ invert: invertido });
    this.engine.renderViewport(this.viewportId);
  }

  autoContraste(): void {
    if (this.nativo) {
      // Restaura la ventana original del DICOM y la vista (zoom y desplazamiento).
      const n = this.nativo;
      n.centro = n.centroBase;
      n.ancho = n.anchoBase;
      n.zoom = 1;
      n.panX = 0;
      n.panY = 0;
      this.dibujarNativo();
      return;
    }
    if (!this.viewport || !this.engine) return;
    const invertido = !!this.viewport.getProperties().invert;
    this.viewport.resetProperties();
    this.viewport.setProperties({ invert: invertido });
    this.engine.renderViewport(this.viewportId);
  }

  moverCorte(delta: number): void {
    this.detenerCine();
    void this.irACorte(this.corteActual() + delta);
  }

  seleccionarCorte(evento: Event): void {
    this.detenerCine();
    void this.irACorte(Number((evento.target as HTMLInputElement).value));
  }

  private programar(): void {
    this.detenerCine(false);
    this.temporizador = setInterval(() => void this.avanzarCine(), Math.round(1000 / this.velocidad()));
  }

  private avanzarCine(): void {
    if (this.cambiando || this.destruido) return;
    const siguiente = this.corteActual() + 1;
    if (siguiente > this.cortes()) {
      if (this.bucle()) void this.irACorte(1);
      else this.detenerCine();
      return;
    }
    void this.irACorte(siguiente);
  }

  private detenerCine(actualizarEstado = true): void {
    if (this.temporizador) {
      clearInterval(this.temporizador);
      this.temporizador = undefined;
    }
    if (actualizarEstado) this.reproduciendo.set(false);
  }

  private async abrirEstudio(): Promise<void> {
    try {
      const urls = this.imageUrls.length ? this.imageUrls : [this.url];
      if (!urls[0]) throw new Error('La serie no contiene instancias DICOM.');

      // 1) Camino principal: descarga y decodificación propias en el hilo principal
      //    (series DICOM sin comprimir). No depende de web workers ni WebAssembly.
      this.estadoCarga.set(`Descargando serie de ${urls.length} cortes…`);
      const estudio = await this.descargarSerie(urls);
      if (this.destruido) return;
      if (estudio) {
        this.iniciarVisorNativo(estudio);
        return;
      }

      // 2) Respaldo: formatos comprimidos (JPEG, JPEG 2000, RLE…) con Cornerstone.
      this.estadoCarga.set('Preparando visor DICOM…');
      this.progresoCarga.set(0);
      const modules = await getDicomModules();
      if (this.destruido) return;
      this.modules = modules;

      this.engine = new modules.core.RenderingEngine(this.renderingEngineId);
      this.engine.enableElement({
        viewportId: this.viewportId,
        type: modules.core.Enums.ViewportType.STACK,
        element: this.viewportHost.nativeElement,
        defaultOptions: { background: [0, 0, 0] },
      });
      this.viewport = this.engine.getViewport(this.viewportId);

      const imageIds = urls.map(url => `wadouri:${url}`);
      this.estadoCarga.set(`Preparando serie de ${imageIds.length} cortes…`);
      crearGrupoHerramientas(modules, this.viewportId, this.renderingEngineId, this.toolGroupId);
      this.onNuevoCorte = () => this.corteActual.set(this.viewport.getCurrentImageIdIndex() + 1);
      this.viewportHost.nativeElement.addEventListener(
        modules.core.Enums.Events.STACK_NEW_IMAGE,
        this.onNuevoCorte,
      );

      // Cargar cada instancia explícitamente para evitar que setStack deje
      // cientos de descargas diferidas sin informar progreso al usuario.
      for (let i = 0; i < imageIds.length; i++) {
        this.estadoCarga.set(`Cargando corte ${i + 1} de ${imageIds.length}…`);
        await this.cargarImagenConTimeout(modules, imageIds[i], i + 1);
        this.progresoCarga.set(i + 1);
        if (this.destruido) return;
      }

      const dataSet = modules.loader.wadouri.dataSetCacheManager.get(urls[0]);
      this.cortes.set(imageIds.length);
      this.modalidad.set(dataSet?.string('x00080060') || 'MR');
      this.estadoCarga.set('Preparando visor…');
      await this.viewport.setStack(imageIds);
      this.viewport.resetCamera();
      this.engine.renderViewport(this.viewportId);
      this.cargando.set(false);
    } catch (error) {
      console.error('No se pudo cargar la resonancia DICOM', error);
      this.error.set(this.mensajeError(error));
      this.cargando.set(false);
    }
  }

  // ================= Visor propio (series sin comprimir) =================

  /** Descarga todos los cortes (4 en paralelo). Devuelve null si el formato requiere Cornerstone. */
  private async descargarSerie(urls: string[]): Promise<EstudioDicom | null> {
    const resultados: (EstudioDicom | undefined)[] = new Array(urls.length);
    let siguiente = 0;
    let completados = 0;
    let detener = false;

    const trabajador = async (): Promise<void> => {
      while (!detener && !this.destruido) {
        const i = siguiente++;
        if (i >= urls.length) return;
        try {
          const buffer = await this.descargarCorte(urls[i], i + 1);
          const estudio = leerDicomSinComprimir(buffer);
          if (!estudio) {
            detener = true;
            return;
          }
          resultados[i] = estudio;
        } catch (error) {
          detener = true;
          throw error;
        }
        completados++;
        this.progresoCarga.set(completados);
        this.estadoCarga.set(`Cargando corte ${completados} de ${urls.length}…`);
      }
    };

    await Promise.all(Array.from({ length: Math.min(4, urls.length) }, () => trabajador()));
    if (this.destruido) return null;
    const completos = resultados.filter((r): r is EstudioDicom => !!r);
    if (completos.length !== urls.length) return null;

    return {
      cortes: completos.flatMap(r => r.cortes),
      modalidad: completos[0].modalidad,
      centro: completos[0].centro,
      ancho: completos[0].ancho,
      invertido: completos[0].invertido,
    };
  }

  private async descargarCorte(url: string, numero: number): Promise<ArrayBuffer> {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), 30000);
    try {
      const respuesta = await fetch(url, { signal: control.signal });
      if (!respuesta.ok) {
        throw new Error(`No se pudo descargar el corte ${numero} (HTTP ${respuesta.status}).`);
      }
      return await respuesta.arrayBuffer();
    } catch (error) {
      if (control.signal.aborted) {
        throw new Error(`Tiempo agotado al descargar el corte ${numero}. Verifica que el backend esté activo.`);
      }
      if (error instanceof TypeError) {
        throw new Error(`No se pudo conectar con el servidor al descargar el corte ${numero}.`);
      }
      throw error;
    } finally {
      clearTimeout(temporizador);
    }
  }

  private iniciarVisorNativo(estudio: EstudioDicom): void {
    const host = this.viewportHost.nativeElement;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    host.appendChild(canvas);

    let centro = estudio.centro;
    let ancho = estudio.ancho;
    if (centro === null || ancho === null || ancho <= 0) {
      const rango = rangoDeCorte(estudio.cortes[0]);
      centro = (rango.min + rango.max) / 2;
      ancho = Math.max(rango.max - rango.min, 1);
    }

    const n: VisorNativo = {
      cortes: estudio.cortes,
      canvas,
      imagen: document.createElement('canvas'),
      indice: 0,
      centro,
      ancho,
      centroBase: centro,
      anchoBase: ancho,
      invertido: estudio.invertido,
      invertidoBase: estudio.invertido,
      zoom: 1,
      panX: 0,
      panY: 0,
      limpiar: () => {},
    };

    // Izquierdo: ventana/nivel · central: mover · derecho: zoom · rueda: cortes.
    let boton = -1;
    let ultimoX = 0;
    let ultimoY = 0;
    const alBajar = (e: PointerEvent): void => {
      boton = e.button;
      ultimoX = e.clientX;
      ultimoY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const alMover = (e: PointerEvent): void => {
      if (boton < 0) return;
      const dx = e.clientX - ultimoX;
      const dy = e.clientY - ultimoY;
      ultimoX = e.clientX;
      ultimoY = e.clientY;
      const k = Math.max(n.anchoBase / 256, 0.01);
      if (boton === 0) {
        n.ancho = Math.max(1, n.ancho + dx * k);
        n.centro += dy * k;
      } else if (boton === 1) {
        const dpr = window.devicePixelRatio || 1;
        n.panX += dx * dpr;
        n.panY += dy * dpr;
      } else if (boton === 2) {
        n.zoom = Math.min(Math.max(n.zoom * Math.exp(-dy * 0.01), 0.2), 20);
      }
      this.dibujarNativo();
    };
    const alSoltar = (): void => {
      boton = -1;
    };
    const alRodar = (e: WheelEvent): void => {
      e.preventDefault();
      this.moverCorte(e.deltaY > 0 ? 1 : -1);
    };
    canvas.addEventListener('pointerdown', alBajar);
    canvas.addEventListener('pointermove', alMover);
    canvas.addEventListener('pointerup', alSoltar);
    canvas.addEventListener('pointercancel', alSoltar);
    canvas.addEventListener('wheel', alRodar, { passive: false });
    const observador = new ResizeObserver(() => this.redimensionarNativo());
    observador.observe(host);
    n.limpiar = () => {
      observador.disconnect();
      canvas.removeEventListener('pointerdown', alBajar);
      canvas.removeEventListener('pointermove', alMover);
      canvas.removeEventListener('pointerup', alSoltar);
      canvas.removeEventListener('pointercancel', alSoltar);
      canvas.removeEventListener('wheel', alRodar);
      canvas.remove();
    };

    this.nativo = n;
    this.cortes.set(n.cortes.length);
    this.corteActual.set(1);
    this.modalidad.set(estudio.modalidad);
    this.redimensionarNativo();
    this.cargando.set(false);
  }

  private redimensionarNativo(): void {
    const n = this.nativo;
    if (!n) return;
    const dpr = window.devicePixelRatio || 1;
    const host = this.viewportHost.nativeElement;
    n.canvas.width = Math.max(1, Math.round(host.clientWidth * dpr));
    n.canvas.height = Math.max(1, Math.round(host.clientHeight * dpr));
    this.dibujarNativo();
  }

  private dibujarNativo(): void {
    const n = this.nativo;
    if (!n) return;
    const corte = n.cortes[n.indice];
    if (n.imagen.width !== corte.columnas || n.imagen.height !== corte.filas) {
      n.imagen.width = corte.columnas;
      n.imagen.height = corte.filas;
      n.datos = undefined;
    }
    const ctxImagen = n.imagen.getContext('2d');
    const ctx = n.canvas.getContext('2d');
    if (!ctxImagen || !ctx) return;
    n.datos ??= ctxImagen.createImageData(corte.columnas, corte.filas);
    corteAImageData(corte, n.centro, n.ancho, n.invertido, n.datos.data);
    ctxImagen.putImageData(n.datos, 0, 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, n.canvas.width, n.canvas.height);
    const escala = Math.min(n.canvas.width / corte.columnas, n.canvas.height / corte.filas) * n.zoom;
    const w = corte.columnas * escala;
    const h = corte.filas * escala;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(n.imagen, (n.canvas.width - w) / 2 + n.panX, (n.canvas.height - h) / 2 + n.panY, w, h);
  }

  private async irACorte(corte: number): Promise<void> {
    if (this.nativo) {
      const indice = Math.min(Math.max(corte - 1, 0), this.nativo.cortes.length - 1);
      this.nativo.indice = indice;
      this.corteActual.set(indice + 1);
      this.dibujarNativo();
      return;
    }
    if (!this.viewport || this.cortes() < 2 || this.cambiando) return;
    this.cambiando = true;
    try {
      const indice = Math.min(Math.max(corte - 1, 0), this.cortes() - 1);
      await this.viewport.setImageIdIndex(indice);
      this.corteActual.set(indice + 1);
    } finally {
      this.cambiando = false;
    }
  }

  private async cargarImagenConTimeout(modules: DicomModules, imageId: string, numeroCorte: number): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const imagen = modules.core.imageLoader.loadAndCacheImage(imageId, { requestType: 'interaction' });
      await Promise.race([
        imagen,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Tiempo agotado al descargar el corte ${numeroCorte}. Verifica que el backend y la sesión sigan activos.`)), 30000);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return 'El archivo no es compatible o está dañado.';
  }
}
