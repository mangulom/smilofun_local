import { authenticatedFetch } from './authenticated-fetch';
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

@Component({
  selector: 'app-dicom-viewer',
  template: `
    <div #contenedor class="flex h-full min-h-0 flex-col bg-slate-950 text-white" [class.fixed]="pantallaCompleta()" [class.inset-0]="pantallaCompleta()" [class.z-[70]]="pantallaCompleta()">
      <header class="flex flex-wrap items-center gap-2 border-b border-white/10 bg-primary-900 px-4 py-3">
        <button class="icon-button" (click)="cerrar.emit()" title="Cerrar visor DICOM" aria-label="Cerrar visor DICOM">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div class="min-w-0">
          <p class="truncate font-bold">{{ titulo }}</p>
          <p class="text-[10px] text-primary-200">Visor DICOM · {{ modalidad() || 'estudio médico' }}</p>
        </div>
        <span class="badge bg-fuchsia-500 text-[10px] text-white">DICOM</span>

        <div class="ml-auto flex flex-wrap items-center gap-2">
          @if (cortes() > 1) {
            <span class="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white">
              Corte {{ corteActual() }} / {{ cortes() }}
            </span>
          }
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
          <button class="icon-button" (click)="alternarPantallaCompleta()" [attr.aria-label]="pantallaCompleta() ? 'Restaurar en modal' : 'Pantalla completa'" [title]="pantallaCompleta() ? 'Restaurar en modal' : 'Pantalla completa'">{{ pantallaCompleta() ? '↙ Restaurar' : '⛶ Pantalla completa' }}</button>
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
              <p class="text-sm font-semibold">Cargando estudio DICOM…</p>
            </div>
          </div>
        }

        @if (error(); as mensaje) {
          <div class="absolute inset-0 flex items-center justify-center p-5">
            <div class="max-w-md rounded-2xl border border-red-400/40 bg-slate-900 p-6 text-center shadow-2xl">
              <p class="font-bold text-red-300">No se pudo abrir el estudio DICOM</p>
              <p class="mt-2 text-sm text-slate-300">{{ mensaje }}</p>
              <p class="mt-3 text-xs text-slate-500">Comprueba que el archivo sea un DICOM Part 10 válido.</p>
            </div>
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
              aria-label="Seleccionar corte DICOM"
            />
            <button class="icon-button !p-1.5" (click)="moverCorte(1)" [disabled]="corteActual() >= cortes()" title="Corte siguiente">›</button>
          </div>
        }
        <p class="mt-2 text-center text-[11px] text-primary-200">
          Arrastrar izquierdo: ventana/nivel · rueda: cortes · botón central: mover · botón derecho: zoom
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
export class DicomViewerComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) url!: string;
  @Input({ required: true }) titulo!: string;
  @Output() cerrar = new EventEmitter<void>();
  @ViewChild('viewport', { static: true }) private viewportHost!: ElementRef<HTMLDivElement>;
  @ViewChild('contenedor', { static: true }) private contenedor!: ElementRef<HTMLDivElement>;

  cargando = signal(true);
  error = signal<string | null>(null);
  cortes = signal(0);
  corteActual = signal(1);
  modalidad = signal('');
  pantallaCompleta = signal(false);

  private readonly identificador = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private readonly renderingEngineId = `dicom-engine-${this.identificador}`;
  private readonly viewportId = `dicom-viewport-${this.identificador}`;
  private readonly toolGroupId = `dicom-tools-${this.identificador}`;
  private modules?: DicomModules;
  private engine?: any;
  private protectedBlobUrl?: string;
  private viewport?: any;
  private destruido = false;
  private onNuevoCorte?: EventListener;
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
    requestAnimationFrame(() => { this.engine?.resize(true, true); this.engine?.renderViewport(this.viewportId); });
  }

  ngAfterViewInit(): void {
    void this.abrirEstudio();
  }

  ngOnDestroy(): void {
    if (this.protectedBlobUrl) URL.revokeObjectURL(this.protectedBlobUrl);
    this.destruido = true;
    if (this.estadoAnteriorPantalla) document.body.style.overflow = this.estadoAnteriorPantalla.overflow;
    if (this.onNuevoCorte && this.modules) {
      this.viewportHost.nativeElement.removeEventListener(this.modules.core.Enums.Events.STACK_NEW_IMAGE, this.onNuevoCorte);
    }
    if (this.modules) {
      this.modules.tools.ToolGroupManager.destroyToolGroup(this.toolGroupId);
      // Solo hay un visor DICOM modal activo; liberar la caché evita retener volúmenes grandes.
      this.modules.loader.wadouri.dataSetCacheManager.purge();
    }
    this.engine?.destroy();
  }

  async reiniciar(): Promise<void> {
    if (!this.viewport || !this.engine) return;
    this.viewport.resetCamera();
    this.viewport.resetProperties();
    this.engine.renderViewport(this.viewportId);
  }

  invertir(): void {
    if (!this.viewport || !this.engine) return;
    const invertido = !this.viewport.getProperties().invert;
    this.viewport.setProperties({ invert: invertido });
    this.engine.renderViewport(this.viewportId);
  }

  moverCorte(delta: number): void {
    void this.irACorte(this.corteActual() + delta);
  }

  seleccionarCorte(evento: Event): void {
    const corte = Number((evento.target as HTMLInputElement).value);
    void this.irACorte(corte);
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

      const protegido = await authenticatedFetch(this.url);
      if (!protegido.ok) throw new Error(`No se pudo descargar el estudio (HTTP ${protegido.status}).`);
      const blobProtegido = await protegido.blob();
      const urlLocal = URL.createObjectURL(blobProtegido);
      this.protectedBlobUrl = urlLocal;
      const imageIdBase = `wadouri:${urlLocal}`;
      await modules.core.imageLoader.loadAndCacheImage(imageIdBase);
      if (this.destruido) return;

      const dataSet = modules.loader.wadouri.dataSetCacheManager.get(this.url);
      const cantidadCortes = Math.max(1, Number(dataSet?.intString('x00280008')) || 1);
      this.cortes.set(cantidadCortes);
      this.modalidad.set(dataSet?.string('x00080060') || '');

      const imageIds = Array.from({ length: cantidadCortes }, (_, indice) => {
        if (cantidadCortes === 1) return imageIdBase;
        const separador = this.url.includes('?') ? '&' : '?';
        return `wadouri:${this.url}${separador}frame=${indice + 1}`;
      });

      this.configurarHerramientas(modules);
      this.onNuevoCorte = () => this.corteActual.set(this.viewport.getCurrentImageIdIndex() + 1);
      this.viewportHost.nativeElement.addEventListener(modules.core.Enums.Events.STACK_NEW_IMAGE, this.onNuevoCorte);

      await this.viewport.setStack(imageIds);
      this.viewport.resetCamera();
      this.engine.renderViewport(this.viewportId);
      this.cargando.set(false);
    } catch (error) {
      console.error('No se pudo cargar el estudio DICOM', error);
      this.error.set(this.mensajeError(error));
      this.cargando.set(false);
    }
  }

  private configurarHerramientas(modules: DicomModules): void {
    crearGrupoHerramientas(modules, this.viewportId, this.renderingEngineId, this.toolGroupId);
  }

  private async irACorte(corte: number): Promise<void> {
    if (!this.viewport || this.cortes() < 2) return;
    const indice = Math.min(Math.max(corte - 1, 0), this.cortes() - 1);
    await this.viewport.setImageIdIndex(indice);
    this.corteActual.set(indice + 1);
  }

  private mensajeError(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return 'El archivo no es compatible o está dañado.';
  }
}
