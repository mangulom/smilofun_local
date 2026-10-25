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
import { DicomModules, crearGrupoHerramientas, getDicomModules } from './dicom-runtime';

type PresetCT = 'hueso' | 'tejido' | 'pulmon';

@Component({
  selector: 'app-tomografia-viewer',
  template: `
    <div #contenedor class="flex h-full min-h-0 flex-col bg-slate-950 text-white" [class.fixed]="pantallaCompleta()" [class.inset-0]="pantallaCompleta()" [class.z-[70]]="pantallaCompleta()">
      <header class="flex flex-wrap items-center gap-2 border-b border-white/10 bg-primary-900 px-4 py-3">
        <button class="icon-button" (click)="cerrar.emit()" title="Cerrar visor de tomografía" aria-label="Cerrar">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div class="min-w-0">
          <p class="truncate font-bold">{{ titulo }}</p>
          <p class="text-[10px] text-primary-200">
            Visor de tomografía {{ modalidad() || 'CT' }} · densidad Hounsfield
          </p>
        </div>
        <span class="badge bg-fuchsia-500 text-[10px] text-white">TOMOGRAFÍA</span>

        <div class="ml-auto flex flex-wrap items-center gap-1.5">
          @for (p of presets; track p.clave) {
            <button
              class="rounded-lg border px-2.5 py-1 text-[11px] font-bold transition"
              [class]="preset() === p.clave ? 'border-accent-400 bg-accent-400 text-primary-950' : 'border-white/25 text-white/80 hover:border-accent-400 hover:text-accent-300'"
              (click)="aplicarPreset(p.clave)"
              [disabled]="!!error()"
              [title]="p.detalle"
            >
              {{ p.label }}
            </button>
          }
          <span class="mx-1 h-5 w-px bg-white/15"></span>
          <button class="icon-button" (click)="invertir()" [disabled]="!!error()" title="Invertir escala de grises">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" />
            </svg>
          </button>
          <button class="icon-button" (click)="reiniciar()" [disabled]="!!error()" title="Restablecer vista">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
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
              <p class="font-bold text-red-300">No se pudo abrir la tomografía</p>
              <p class="mt-2 text-sm text-slate-300">{{ mensaje }}</p>
              <p class="mt-3 text-xs text-slate-500">Comprueba que el archivo sea un DICOM (CT/CBCT) válido.</p>
            </div>
          </div>
        }

        <!-- Lectura de densidad en el cursor -->
        @if (!cargando() && !error()) {
          <div class="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-white/15 bg-slate-950/75 px-3 py-1.5">
            <p class="text-[10px] uppercase tracking-wide text-primary-300">Densidad</p>
            <p class="font-mono text-sm font-bold text-accent-300">{{ hu() ?? '—' }}</p>
          </div>
          <div class="pointer-events-none absolute bottom-3 right-3 rounded-lg border border-white/15 bg-slate-950/75 px-3 py-1.5 text-right">
            <p class="text-[10px] uppercase tracking-wide text-primary-300">Preset</p>
            <p class="text-sm font-bold text-white">{{ presetLabel() }}</p>
          </div>
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
              aria-label="Seleccionar corte de tomografía"
            />
            <button class="icon-button !p-1.5" (click)="moverCorte(1)" [disabled]="corteActual() >= cortes()" title="Corte siguiente">›</button>
            <span class="w-24 text-right text-xs font-bold text-accent-400">{{ corteActual() }} / {{ cortes() }}</span>
          </div>
        }
        <p class="mt-2 text-center text-[11px] text-primary-200">
          Arrastrar izquierdo: ventana/nivel · rueda: cortes · botón central: mover · botón derecho: zoom · presets: hueso/tejido/pulmón
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
export class TomografiaViewerComponent implements AfterViewInit, OnDestroy {
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
  preset = signal<PresetCT>('hueso');
  hu = signal<string | null>(null);
  pantallaCompleta = signal(false);

  readonly presets: { clave: PresetCT; label: string; centro: number; ancho: number; detalle: string }[] = [
    { clave: 'hueso', label: 'Hueso', centro: 400, ancho: 2000, detalle: 'Ventana ósea (W 2000 / L 400)' },
    { clave: 'tejido', label: 'Tejido blando', centro: 40, ancho: 400, detalle: 'Ventana de tejido blando (W 400 / L 40)' },
    { clave: 'pulmon', label: 'Pulmón', centro: -600, ancho: 1500, detalle: 'Ventana pulmonar (W 1500 / L -600)' },
  ];

  private readonly identificador = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private readonly renderingEngineId = `ct-engine-${this.identificador}`;
  private readonly viewportId = `ct-viewport-${this.identificador}`;
  private readonly toolGroupId = `ct-tools-${this.identificador}`;
  private modules?: DicomModules;
  private engine?: any;
  private viewport?: any;
  private destruido = false;
  private onNuevoCorte?: EventListener;
  private onMoverRaton?: (evento: MouseEvent) => void;
  private ultimaLectura = 0;
  private huDisponible = true;
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
    });
  }

  ngAfterViewInit(): void {
    void this.abrirEstudio();
  }

  ngOnDestroy(): void {
    this.destruido = true;
    if (this.estadoAnteriorPantalla) document.body.style.overflow = this.estadoAnteriorPantalla.overflow;
    if (this.modules) {
      if (this.onNuevoCorte) {
        this.viewportHost.nativeElement.removeEventListener(
          this.modules.core.Enums.Events.STACK_NEW_IMAGE,
          this.onNuevoCorte,
        );
      }
      if (this.onMoverRaton) this.viewportHost.nativeElement.removeEventListener('mousemove', this.onMoverRaton);
      this.modules.tools.ToolGroupManager.destroyToolGroup(this.toolGroupId);
      this.modules.loader.wadouri.dataSetCacheManager.purge();
    }
    this.engine?.destroy();
  }

  presetLabel(): string {
    return this.presets.find((p) => p.clave === this.preset())?.label ?? 'Hueso';
  }

  aplicarPreset(clave: PresetCT): void {
    const def = this.presets.find((p) => p.clave === clave);
    if (!def) return;
    this.preset.set(clave);
    if (!this.viewport) return;
    this.viewport.setProperties({
      voiRange: { lower: def.centro - def.ancho / 2, upper: def.centro + def.ancho / 2 },
    });
    this.engine?.renderViewport(this.viewportId);
  }

  invertir(): void {
    if (!this.viewport || !this.engine) return;
    const invertido = !this.viewport.getProperties().invert;
    this.viewport.setProperties({ invert: invertido });
    this.engine.renderViewport(this.viewportId);
  }

  reiniciar(): void {
    if (!this.viewport || !this.engine) return;
    this.viewport.resetCamera();
    this.viewport.resetProperties();
    this.aplicarPreset('hueso');
  }

  moverCorte(delta: number): void {
    void this.irACorte(this.corteActual() + delta);
  }

  seleccionarCorte(evento: Event): void {
    void this.irACorte(Number((evento.target as HTMLInputElement).value));
  }

  private async abrirEstudio(): Promise<void> {
    try {
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

      const urls = this.imageUrls.length ? this.imageUrls : [this.url];
      if (!urls[0]) throw new Error('La serie no contiene instancias DICOM.');
      const imageIds = urls.map(url => `wadouri:${url}`);
      this.estadoCarga.set(`Preparando serie de ${imageIds.length} cortes…`);
      crearGrupoHerramientas(modules, this.viewportId, this.renderingEngineId, this.toolGroupId);
      this.onNuevoCorte = () => this.corteActual.set(this.viewport.getCurrentImageIdIndex() + 1);
      this.viewportHost.nativeElement.addEventListener(
        modules.core.Enums.Events.STACK_NEW_IMAGE,
        this.onNuevoCorte,
      );

      for (let i = 0; i < imageIds.length; i++) {
        this.estadoCarga.set(`Cargando corte ${i + 1} de ${imageIds.length}…`);
        await this.cargarImagenConTimeout(modules, imageIds[i], i + 1);
        this.progresoCarga.set(i + 1);
        if (this.destruido) return;
      }
      if (this.destruido) return;
      const dataSet = modules.loader.wadouri.dataSetCacheManager.get(urls[0]);
      this.cortes.set(imageIds.length);
      this.modalidad.set(dataSet?.string('x00080060') || 'CT');
      this.estadoCarga.set('Preparando visor…');
      await this.viewport.setStack(imageIds);
      this.viewport.resetCamera();
      this.engine.renderViewport(this.viewportId);
      this.aplicarPreset('hueso');

      this.onMoverRaton = (evento: MouseEvent) => void this.actualizarDensidad(evento);
      this.viewportHost.nativeElement.addEventListener('mousemove', this.onMoverRaton);
      this.cargando.set(false);
    } catch (error) {
      console.error('No se pudo cargar la tomografía DICOM', error);
      this.error.set(this.mensajeError(error));
      this.cargando.set(false);
    }
  }

  /** Lee el valor del píxel bajo el cursor y lo convierte a unidades Hounsfield. */
  private async actualizarDensidad(evento: MouseEvent): Promise<void> {
    if (!this.huDisponible || !this.viewport) return;
    const ahora = Date.now();
    if (ahora - this.ultimaLectura < 60) return;
    this.ultimaLectura = ahora;

    try {
      if (typeof this.viewport.canvasToWorld !== 'function' || typeof this.viewport.getImageData !== 'function') {
        this.huDisponible = false;
        return;
      }
      const rect = this.viewportHost.nativeElement.getBoundingClientRect();
      const x = evento.clientX - rect.left;
      const y = evento.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        this.hu.set(null);
        return;
      }

      const datos = this.viewport.getImageData();
      if (!datos?.imageData || !datos?.dimensions) {
        this.hu.set(null);
        return;
      }

      const mundo = this.viewport.canvasToWorld([x, y]);
      const indices = typeof this.viewport.worldToIndex === 'function' ? this.viewport.worldToIndex(mundo) : null;
      if (!indices) {
        this.hu.set(null);
        return;
      }

      const [i, j] = indices.map((n: number) => Math.round(n));
      const [ancho, alto] = datos.dimensions;
      if (i < 0 || j < 0 || i >= ancho || j >= alto) {
        this.hu.set(null);
        return;
      }

      const crudo = datos.imageData[j * ancho + i];
      if (typeof crudo !== 'number') {
        this.hu.set(null);
        return;
      }

      let pendiente = 1;
      let intercepto = 0;
      try {
        const imagenId = this.viewport.getCurrentImageId?.();
        const lut = imagenId ? this.modules?.core?.metaData?.get?.('modalityLutModule', imagenId) : null;
        pendiente = Number(lut?.rescaleSlope ?? 1) || 1;
        intercepto = Number(lut?.rescaleIntercept ?? 0) || 0;
      } catch {
        // Sin LUT de modalidad: se muestra el valor crudo.
      }

      this.hu.set(`${Math.round(crudo * pendiente + intercepto)} HU`);
    } catch {
      this.huDisponible = false;
      this.hu.set(null);
    }
  }

  private async irACorte(corte: number): Promise<void> {
    if (!this.viewport || this.cortes() < 2) return;
    const indice = Math.min(Math.max(corte - 1, 0), this.cortes() - 1);
    await this.viewport.setImageIdIndex(indice);
    this.corteActual.set(indice + 1);
  }

  private async cargarImagenConTimeout(modules: DicomModules, imageId: string, numeroCorte: number): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        modules.core.imageLoader.loadAndCacheImage(imageId, { requestType: 'interaction' }),
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
