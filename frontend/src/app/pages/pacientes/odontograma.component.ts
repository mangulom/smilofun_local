import { Component, AfterViewInit, ElementRef, Input, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { ExamenImagen, OdontogramaPieza } from '../../core/models';
import { DicomViewerComponent } from '../../shared/dicom-viewer.component';
import { TomografiaViewerComponent } from '../../shared/tomografia-viewer.component';
import { ResonanciaViewerComponent } from '../../shared/resonancia-viewer.component';
import { DialogService } from '../../shared/dialog.service';

const COLORES: Record<string, string> = {
  sano: 'bg-white border-slate-300',
  caries: 'bg-red-500 border-red-600',
  restaurado: 'bg-sky-400 border-sky-500',
  ausente: 'bg-slate-300 border-slate-400',
  extraccion_indicada: 'bg-red-300 border-red-400',
  implante: 'bg-teal-500 border-teal-600',
  corona: 'bg-amber-400 border-amber-500',
  puente: 'bg-amber-200 border-amber-400',
  endodoncia: 'bg-primary-700 border-primary-800',
  protesis: 'bg-indigo-300 border-indigo-400',
  fractura: 'bg-rose-400 border-rose-500',
  movilidad: 'bg-orange-400 border-orange-500',
};

const ETIQUETAS: Record<string, string> = {
  sano: 'Sano', caries: 'Caries', restaurado: 'Restaurado', ausente: 'Ausente',
  extraccion_indicada: 'Extracción indicada', implante: 'Implante', corona: 'Corona',
  puente: 'Puente', endodoncia: 'Endodoncia', protesis: 'Prótesis',
  fractura: 'Fractura', movilidad: 'Movilidad',
};

const MAPA_HEX: Record<string, string> = {
  sano: '#ffffff',
  caries: '#ef4444',
  restaurado: '#38bdf8',
  ausente: '#94a3b8',
  extraccion_indicada: '#fca5a5',
  implante: '#14b8a6',
  corona: '#facc15',
  puente: '#fde68a',
  endodoncia: '#7C3AED',
  protesis: '#a5b4fc',
  fractura: '#fb7185',
  movilidad: '#fb923c',
};

const TIPOS_EXAMEN: Record<string, { label: string; color: string }> = {
  rx: { label: 'Radiografía', color: 'bg-sky-500 text-white' },
  intraoral: { label: 'Foto intraoral', color: 'bg-teal-500 text-white' },
  foto: { label: 'Foto clínica', color: 'bg-emerald-500 text-white' },
  tomografia: { label: 'Tomografía', color: 'bg-fuchsia-500 text-white' },
  resonancia: { label: 'Resonancia', color: 'bg-violet-500 text-white' },
  escaneo: { label: 'Escaneo 3D', color: 'bg-orange-500 text-white' },
  video: { label: 'Video', color: 'bg-rose-500 text-white' },
  otro: { label: 'Otro', color: 'bg-slate-500 text-white' },
};

// ---------------------------------------------------------------------------
// Geometría dental realista (dientes SVG de react-odontogram, licencia MIT)
// Cada cuadrante reutiliza las 8 piezas (1..8) con su transformación espejo.
// ---------------------------------------------------------------------------
interface DienteSvg {
  name: string;      // posición 1..8 dentro del cuadrante
  tipo: string;
  outline: string;   // silueta (contorno)
  shadow: string;    // relleno interior (corona)
  lines: string[];   // líneas de detalle
}

const DIENTES: DienteSvg[] = [
  {
    name: '1', tipo: 'Incisivo central',
    outline:
      'M173.951 1.698c-2.198.16-5.302.862-5.302.862s-5.531 1.025-7.781 2.27c-2.403 1.333-5.553 3.299-6.013 5.258-.432 1.84-.78 4.734-.491 6.832l.027.2c.348 2.527.865 6.28 1.239 10.316.186 2-.101 3.21.751 6.16.895 3.1 1.395 4.573 2.013 5.687.646 1.164 1.493 2.087 2.03 3.28.866 1.924 2.393 4.29 3.87 6.1a48.805 48.805 0 0 0 2.36 2.663c1.016 1.078 2.819 3.11 3.898 4.331 1.526 1.727 3.076 3.248 4.423 3.742 1.217.446 2.709.642 3.793.936 1.369.372 2.494.638 4.597 0 1.545-.468 2.725-.621 4.372-2.424 2.064-2.258 2.846-3.517 3.512-4.746 1.065-1.964 2.524-4.648 3.541-6.422.611-1.068 2.221-3.089 4.086-8.845 1.54-4.752 2.367-7.76 2.731-8.994.415-1.408 1.079-3.583 1.355-6.196.44-4.176 1.114-7.482 1.062-11.026-.044-3.046.104-5.04-1.065-6.306-.95-1.029-1.988-2.001-3.306-2.534-1.959-.79-3.775-1.358-5.298-1.592-1.351-.207-7.05-.35-11.219-.057-1.567.11-3.61.097-9.185.505Z',
    shadow:
      'M188.269 50.215c19.275-41.867 10.766-43.612 4.937-44.684-5.829-1.073-28.455 2.53-29.72 2.817-.442.218-8.911 0-4.767 19.54 3.416 16.105 16.193 26.596 17.244 27.265 3.148 2.003 8.837 2.595 12.306-4.938Z',
    lines: [
      'M160.472 14.727c.392-.402 4.317-3.309 8.941-5.47 3.097-1.448 7.773-1.629 11.207-1.749 8.759-.365 10.004.91 12.637 1.495.562.139.909.276 1.771.595',
    ],
  },
  {
    name: '2', tipo: 'Incisivo lateral',
    outline:
      'M135.016 60.41c3.443 1.355 7.834 2.73 9.601 2.346 4.185-.91 7.044-4.017 8.123-8.152 2.069-7.927 2.249-16.288 1.995-24.436-.113-3.596.72-16.81-4.184-18.444-8.135-6.14-32.088.494-36.979 8.055-5.013 7.751.878 21.131 5.56 27.728 3.862 5.44 9.714 10.474 15.884 12.903Z',
    shadow:
      'M134.65 55.386c2.732 1.076 6.217 2.167 7.62 1.862 3.321-.723 5.59-3.188 6.446-6.47 1.642-6.29 1.786-12.927 1.583-19.393-.089-2.854.572-13.342-3.32-14.638-6.456-4.873-25.466.392-29.348 6.393-3.979 6.152.696 16.77 4.413 22.006 3.064 4.317 7.709 8.313 12.606 10.24Z',
    lines: [
      'M121.569 28.952c.551-.984 6.354-8.214 12.866-9.045 3.238-.413 10.619-.17 11.838 0',
    ],
  },
  {
    name: '3', tipo: 'Canino',
    outline:
      'M77.63 64.236c1.692 1.401 15.516 14.583 34.698 16.903 5.569.674 15.058-7.184 15.789-12.89 1.335-10.423-12.444-29.205-21.965-33.703-4.542-2.145-25.892-4.039-28.523 2.939-2.471 6.557-6.596 21.29 0 26.751Z',
    shadow:
      'M123.285 66.267c1.072-8.368-10.234-23.94-17.99-27.603-3.72-1.757-21.206-3.308-23.36 2.407-1.757 4.66-4.09 13.284-2.306 18.17 4.15 11.36 40.897 28.573 43.656 7.026Z',
    lines: [
      'M82.84 60.043c-.01-.855-.193-4.63.256-8.12.667-5.185.703-5.866 1.29-8.106.437-1.666 2.083-4.91 17.487-3.748',
      'M101.438 68.49c.376-.045 2.284-5.112 9.498-6.344',
    ],
  },
  {
    name: '4', tipo: 'Primer premolar',
    outline:
      'M93.684 108.748c-7.498 3.397-35.368-7.397-35.596-7.441-1.429-.842-12.215-2.854-9.068-29.414.147-1.238 1.353-2.05 2.218-2.556.956-.559 3.157-1.595 7.587-2.794 2.707-.734 13.856-3.54 18.674-.92 2.216 1.206 6.363 4.117 10.473 7.036 4.11 2.919 10.958 8.715 13.327 11.338 2.291 2.537 10.324 13.75-7.615 24.751Z',
    shadow:
      'M91.495 105.931c-6.528 2.958-30.793-6.44-30.992-6.478-1.243-.734-10.634-2.486-7.895-25.61.128-1.078 1.178-1.785 1.932-2.225.832-.487 2.748-1.39 6.605-2.433 2.357-.639 12.064-3.082 16.258-.8 1.93 1.05 5.54 3.584 9.12 6.125 3.578 2.541 9.54 7.588 11.603 9.872 1.994 2.208 8.987 11.971-6.63 21.549Z',
    lines: [
      'M55.234 92.414c.022-.242.06-1.469.875-7.79.46-3.573 1.813-5.49 3.134-7.01 1.18-1.359 3.524-3.193 5.88-4.365 1.46-.632 3.029-1.126 6.044-1.776.826-.138 1.477-.175 2.526-.395',
      'M87.02 101.387c4.183-.792 8.747-9.774 8.747-9.774',
    ],
  },
  {
    name: '5', tipo: 'Segundo premolar',
    outline:
      'M33.396 127.652c-1.088-2.713-4.486-11.852-3.962-15.246.477-3.085 14.47-12.008 23.595-12.008 2.178 0 25.157 6.665 35.073 17.908 4.551 9.324-1.624 23.339-16.22 23.339-8.193 0-23.563-1.897-25.453-2.215-1.896-.319-4.317-1.128-6.596-2.321-1.289-.675-2-1.035-2.478-1.647-.655-.84-2.101-3.178-3.96-7.81Z',
    shadow:
      'M36.837 126.778c-.945-2.356-3.895-10.289-3.44-13.235.414-2.679 12.561-10.424 20.483-10.424 1.89 0 21.837 5.785 30.445 15.545 3.951 8.094-1.41 20.26-14.08 20.26-7.112 0-20.454-1.647-22.095-1.922-1.645-.277-3.747-.98-5.725-2.015-1.12-.586-1.737-.899-2.151-1.43-.57-.729-1.825-2.759-3.437-6.779Z',
    lines: [
      'M40.8 131.221c-4.003-20.278 8.442-20.974 13.779-23.692',
      'M74.056 134.729c6.35-4.264 6.343-10.503 6.489-11.448',
    ],
  },
  {
    name: '6', tipo: 'Primer molar',
    outline:
      'M35.539 203.323c-3.363.196-32.788-4.02-28.495-42.465 3.631-20.408 26.21-23.364 29.557-22.912 9.019-.745 25.727 6.743 29.255 9.403 4.546 3.427 7.384 5.681 8.606 7.092 2.436 2.814 4.499 5.11 4.7 6.313.284 1.703 1.317 4.72-2.248 9.687-2.453 3.418-2.957 6.663-2.856 10.223.118 4.185.37 9.754-.524 11.63-.592 1.244-.984 2.627-2.375 3.392-2.015 1.108-4.61 2.317-11.93 3.748-3.623.708-9.309 1.83-12.401 2.292-5.19.777-8.423 1.43-11.289 1.597Z',
    shadow:
      'M36.515 199.085c-2.927.17-28.54-3.499-24.803-36.963 3.16-17.764 22.814-20.337 25.727-19.944 10.82-.893 25.709 5.989 32.955 14.358 2.12 2.45 3.917 4.448 4.091 5.495.248 1.482.513 4.268-2.59 8.591-2.135 2.975-1.94 5.641-1.852 8.74.096 3.417 1.402 10.917-2.523 13.076-1.754.964-4.013 2.016-10.384 3.261-6.762 1.322-13.728 2.984-20.621 3.386Z',
    lines: [
      'M37.132 192.147c1.288-.372 3.385-2.071 5.183-5.438m9.008-35.98c1.188 1.224 2.114 6.385.15 11.363m0 0c-1.537 3.899-4.944 9.378-11.195 9.378 6.877.321 4.651 10.343 2.037 15.239m9.159-24.617c1.47-2.589 4.966-7.572 8.068-8.217m-17.227 32.834c-.186 2.348.044 7.351 2.458 8.584',
    ],
  },
  {
    name: '7', tipo: 'Segundo molar',
    outline:
      'M4.969 248.132c-1.188-2.74-14.708-27.152 12.319-42.139 1.836-1.018 24.508-7.711 45.28 10.874 2.274 2.035 4.455 3.579 5.403 5.102 1.414 2.271 2.128 3.435 1.687 5.606-.387 1.901-1.54 3.642-3.77 7.711-1.127 2.056-1.854 3.427-1.369 7.824.175 1.59.627 3.935.048 6.603-.466 2.147-.941 3.567-2.578 5.006-2.53 2.224-5.307 3.645-9.076 4.35-1.091.204-3.133.811-7.525 1.702-2.776.563-6.619 1.234-10.09 1.654-3.47.42-6.478.638-8.612.636-3.353-.002-6.734.031-9.465-1.48l-.018-.01c-1.654-.915-4.076-2.255-6.245-4.732-2.258-2.579-4.591-5.482-5.989-8.707Z',
    shadow:
      'M8.799 246.28c-1.128-2.352-12.843-23.709 10.756-36.796 1.604-.889 21.4-6.732 39.538 9.496 1.986 1.777 3.89 3.125 4.717 4.454 1.235 1.983 1.859 3 1.473 4.895-.337 1.66-1.343 3.18-3.291 6.734-.984 1.795-1.619 2.992-1.196 6.831.154 1.389.548 3.436.042 5.766-2.872 13.231-31.213 11.657-33.076 11.656h-.007c-2.936-.003-12.714-.01-18.956-13.036Z',
    lines: [
      'M32.14 255.091c.748-.303 2.28-2.378 3.103-5.721m-1.99-35.481c3.009 1.363 4.015 4.888 3.736 8.716m0 0c-.424 5.835-3.832 12.377-7.683 13.049 6.954 1.18 7.244 8.414 5.937 13.716m1.746-26.765c.327-2.24 1.82-6.958 5.19-7.91m-6.936 34.675c.65 2.172 2.55 6.507 4.967 6.471',
    ],
  },
  {
    name: '8', tipo: 'Tercer molar',
    outline:
      'M.895 291.331c-.362-1.218-.116-3.411-.164-3.892-.035-.34.124-3.438.727-5.558 1.04-2.82 1.808-4.74 2.573-5.752 1.413-1.872 3.913-4.769 7.135-7.2 2.288-1.726 5.003-3.187 8.133-4.339 2.249-.828 4.362-1.502 7.732-1.693 2.175-.123 5.25-.155 8.782.108s7.403.804 10.353 1.397 4.92 1.218 6.641 1.893c1.722.675 3.148 1.389 3.972 1.768 1.51.696 2.9 1.209 3.824 2.14 1.857 1.872 2.617 3.334 2.912 4.807.254 1.27.252 3.216-.224 4.531-.672 1.859-1.468 2.856-1.468 5.7 0 3.857 1.713 5.95 1.915 8.356.337 4.008.317 6.168-.42 7.485-.591 1.057-1.532 2.383-5.541 5.088-1.173.791-2.684 1.634-6.643 3.424-2.762 1.248-6.977 3.108-9.205 4.107-2.473 1.109-4.667 2.226-8.234 3.053-2.54.589-5.631.784-9.012.186-2.307-.408-5.449-1.183-9.107-3.827-3.928-2.839-6.53-4.897-7.497-6.041-.866-1.026-1.714-2.082-2.412-3.555-.904-1.905-2.272-3.643-3-5.916-.846-2.633-1.167-4.233-1.772-6.27Z',
    shadow:
      'M4.732 291.175c-.317-1.07-.101-2.994-.144-3.416-.03-.299.11-3.019.638-4.88.914-2.476 1.588-4.161 2.26-5.05 1.24-1.643 3.434-4.187 6.263-6.321 2.009-1.515 4.393-2.797 7.14-3.809 1.974-.727 3.83-1.318 6.788-1.486 1.91-.108 4.61-.136 7.71.095 3.1.231 6.498.706 9.088 1.226 2.59.521 4.319 1.07 5.83 1.662 1.512.592 2.764 1.22 3.487 1.553 1.326.61 2.547 1.061 3.357 1.878 1.63 1.643 2.298 2.927 2.557 4.22.223 1.115.221 2.824-.196 3.978-.59 1.632-1.29 2.507-1.29 5.004 0 3.385 1.504 5.223 1.682 7.335.296 3.519.278 5.416-.369 6.571-.52.928-1.345 2.093-4.865 4.467-1.03.695-2.355 1.435-5.831 3.006-2.425 1.096-6.126 2.728-8.082 3.606-2.17.973-4.096 1.954-7.228 2.68-2.229.517-4.944.688-7.912.163-2.024-.358-4.783-1.038-7.995-3.359-3.448-2.493-5.732-4.299-6.58-5.304-.761-.901-1.505-1.827-2.119-3.121-.793-1.672-1.994-3.198-2.634-5.193-.742-2.312-1.024-3.717-1.555-5.505Z',
    lines: [
      'M31.732 309.511c1.462-.897 2.585-3.672 2.93-6.726m-2.93-29.453c2.114 1.092 3.49 4.44 3.61 8.062m4.133-7.58c-1.353 1.058-4.074 4.057-4.134 7.58m0 0c.155 4.693-1.797 9.846-6.983 11.152 5.379-.357 6.859 5.305 6.303 10.239m4.557 7.24c-1.678-.671-4.938-3.058-4.557-7.24',
    ],
  },
];

const CUADRANTES = [
  { pref: '1', tf: '', nombre: 'Superior derecha' },
  { pref: '2', tf: 'scale(-1, 1) translate(-409, 0)', nombre: 'Superior izquierda' },
  { pref: '4', tf: 'scale(1, -1) translate(0, -694)', nombre: 'Inferior derecha' },
  { pref: '3', tf: 'scale(-1, -1) translate(-409, -694)', nombre: 'Inferior izquierda' },
];

const NOMBRES_PIEZA = [
  '', 'Incisivo central', 'Incisivo lateral', 'Canino',
  'Primer premolar', 'Segundo premolar', 'Primer molar', 'Segundo molar', 'Tercer molar',
];

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

@Component({
  selector: 'app-odontograma',
  imports: [FormsModule, DatePipe, DecimalPipe, DicomViewerComponent, TomografiaViewerComponent, ResonanciaViewerComponent],
  template: `
    <div class="space-y-5">
      <!-- ================= Barra de herramientas ================= -->
      <div class="card p-4">
        <div class="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div>
            <label class="label">Estado a aplicar</label>
            <select class="input w-52" [(ngModel)]="estadoSeleccionado">
              @for (e of estados; track e) { <option [value]="e">{{ etiqueta(e) }}</option> }
            </select>
          </div>
          <div>
            <label class="label">Superficie</label>
            <div class="flex flex-wrap gap-1">
              @for (s of superficies; track s.v) {
                <button
                  type="button"
                  class="rounded-lg border px-3 py-2 text-xs font-bold transition"
                  [class]="superficieSeleccionada === s.v ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300'"
                  (click)="superficieSeleccionada = s.v"
                >
                  {{ s.label }}
                </button>
              }
            </div>
          </div>
          <div class="ml-auto flex gap-2">
            <button class="btn-ghost" type="button" (click)="cargar()">Descartar</button>
            <button class="btn-primary" type="button" (click)="guardar()" [disabled]="guardando()">
              @if (guardando()) { Guardando… } @else { Guardar odontograma }
            </button>
          </div>
        </div>
        <!-- Estadística rápida -->
        <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          @for (e of estados; track e) {
            @if (conteo(e) > 0) {
              <span class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold" [class]="COLORES[e]">
                {{ etiqueta(e) }} <span class="opacity-70">{{ conteo(e) }}</span>
              </span>
            }
          }
          <span class="ml-auto text-[11px] text-slate-400">
            Clic en una pieza = aplicar estado · superficies en el panel lateral
          </span>
        </div>
      </div>

      <!-- ================= Odontograma + panel ================= -->
      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div class="card overflow-hidden p-4">
          <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-bold text-slate-700">Odontograma · notación FDI</h3>
            <span class="text-[11px] text-slate-400">Clic en la pieza o en su número para aplicar el estado</span>
          </div>
          <svg
            viewBox="-34 -34 477 762"
            class="mx-auto block w-full max-w-[480px] select-none"
            (click)="deseleccionar()"
          >
            <defs>
              <filter id="glowSel" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#7C3AED" flood-opacity="0.9" />
              </filter>
            </defs>

            <!-- Guías de medios -->
            <line x1="204.5" y1="-14" x2="204.5" y2="708" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="5 7" />
            <line x1="-14" y1="347" x2="423" y2="347" stroke="#e2e8f0" stroke-width="1.5" stroke-dasharray="5 7" />

            <!-- Rótulos de cuadrante -->
            <g font-size="10.5" font-weight="700" fill="#94a3b8">
              <text x="0" y="-18">SUP. DCHA (18–11)</text>
              <text x="409" y="-18" text-anchor="end">SUP. IZDA (21–28)</text>
              <text x="0" y="716">INF. DCHA (48–41)</text>
              <text x="409" y="716" text-anchor="end">INF. IZDA (31–38)</text>
            </g>

            <!-- Dientes -->
            <g (click)="$event.stopPropagation()">
              @for (q of CUADRANTES; track q.pref) {
                <g [attr.transform]="q.tf">
                  @for (t of DIENTES; track t.name) {
                    <g class="cursor-pointer" (click)="clicDiente(fdi(q.pref, t.name), $event)">
                      <title>Pieza {{ fdi(q.pref, t.name) }} — {{ etiqueta(estadoDe(fdi(q.pref, t.name))) }}</title>
                      <path [attr.d]="t.shadow" [attr.fill]="colorDiente(fdi(q.pref, t.name))" />
                      <path
                        [attr.d]="t.outline"
                        fill="none"
                        [attr.data-tooth]="t.name"
                        stroke-linejoin="round"
                        stroke-linecap="round"
                        [attr.stroke]="seleccion() === fdi(q.pref, t.name) ? '#7C3AED' : '#64748b'"
                        [attr.stroke-width]="seleccion() === fdi(q.pref, t.name) ? 3 : 2"
                        [attr.filter]="seleccion() === fdi(q.pref, t.name) ? 'url(#glowSel)' : null"
                      />
                      @for (ln of t.lines; track $index) {
                        <path
                          [attr.d]="ln"
                          fill="none"
                          stroke="#94a3b8"
                          stroke-width="1.3"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          opacity="0.85"
                        />
                      }
                      @if (marca(fdi(q.pref, t.name)); as mk) {
                        @if (xDe(t.name)) {
                          <path
                            [attr.d]="xDe(t.name)"
                            fill="none"
                            stroke-linecap="round"
                            stroke-width="3.4"
                            [attr.stroke]="mk === 'ausente' ? '#64748b' : '#dc2626'"
                          />
                        }
                      }
                    </g>
                  }
                </g>
              }
            </g>

            <!-- Etiquetas FDI (siempre derechas, fuera del espejo) -->
            <g>
              @for (lb of etiquasFDI(); track lb.fdi) {
                <g class="cursor-pointer" (click)="clicDiente(lb.fdi, $event)">
                  <text
                    [attr.x]="lb.x"
                    [attr.y]="lb.y"
                    text-anchor="middle"
                    font-size="13"
                    font-weight="800"
                    fill="#334155"
                    stroke="#ffffff"
                    stroke-width="3"
                    paint-order="stroke"
                    pointer-events="all"
                  >{{ lb.fdi }}</text>
                </g>
              }
            </g>
          </svg>
        </div>

        <!-- Panel de la pieza seleccionada -->
        <div class="card h-fit p-5">
          @if (seleccion(); as d) {
            <div class="mb-3 flex items-center justify-between">
              <div>
                <p class="text-2xl font-extrabold text-blue-700">Pieza {{ d }}</p>
                <p class="text-xs uppercase tracking-wide text-slate-400">{{ nombrePieza(d) }} · {{ cuadrante(d) }}</p>
              </div>
              <span class="badge text-lg" [class]="COLORES[estadoDe(d)]">{{ etiqueta(estadoDe(d)) }}</span>
            </div>

            <!-- Mapa de superficies -->
            <p class="label">
              Superficies — aplicar a: {{ superficieSeleccionada === '' ? 'pieza completa' : nombreSuperficie(superficieSeleccionada) }}
            </p>
            <div class="mb-4 flex items-start gap-3">
              <div class="grid shrink-0 grid-cols-3 gap-1">
                <span></span>
                <button type="button" [class]="celda(d, 'V')" [style.background]="colorCelda(d, 'V')" (click)="aplicarZona(d, 'V')" title="Vestibular">V</button>
                <span></span>
                <button type="button" [class]="celda(d, 'M')" [style.background]="colorCelda(d, 'M')" (click)="aplicarZona(d, 'M')" title="Mesial">M</button>
                <button type="button" [class]="celda(d, central(d))" [style.background]="colorCelda(d, central(d))" (click)="aplicarZona(d, central(d))" [title]="central(d) === 'I' ? 'Incisal' : 'Oclusal'">{{ central(d) }}</button>
                <button type="button" [class]="celda(d, 'D')" [style.background]="colorCelda(d, 'D')" (click)="aplicarZona(d, 'D')" title="Distal">D</button>
                <span></span>
                <button type="button" [class]="celda(d, 'L')" [style.background]="colorCelda(d, 'L')" (click)="aplicarZona(d, 'L')" title="Lingual / palatina">L</button>
                <span></span>
              </div>
              <div class="min-w-0 flex-1 space-y-1">
                @for (s of listaSuperficies(d); track s.sup) {
                  <div class="flex items-center justify-between rounded border border-slate-100 px-2 py-0.5 text-[11px]">
                    <span class="font-semibold text-slate-600">{{ nombreSuperficie(s.sup) }}</span>
                    <span class="flex items-center gap-1.5">
                      <span class="h-2.5 w-2.5 rounded border border-slate-300" [style.background]="MAPA[s.estado]"></span>
                      {{ etiqueta(s.estado) }}
                    </span>
                  </div>
                }
              </div>
            </div>
            <button
              type="button"
              class="mb-4 w-full rounded-lg border px-2 py-1.5 text-[11px] font-bold transition"
              [class]="superficieSeleccionada === '' ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300'"
              (click)="aplicarZona(d, '')"
            >
              Aplicar a la pieza completa
            </button>

            <!-- Chips de estados -->
            <p class="label">Aplicar estado</p>
            <div class="mb-4 grid grid-cols-2 gap-1.5">
              @for (e of estados; track e) {
                <button
                  type="button"
                  class="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition"
                  [class]="estadoSeleccionado === e ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-400' : 'border-slate-200 hover:border-primary-300'"
                  (click)="pintarEstado(d, e)"
                >
                  <span class="h-3.5 w-3.5 shrink-0 rounded border" [class]="COLORES[e]"></span>
                  <span class="truncate">{{ etiqueta(e) }}</span>
                </button>
              }
            </div>

            <!-- Notas de la pieza -->
            <label class="label">Notas de la pieza</label>
            <textarea class="input mb-3" rows="2" [(ngModel)]="notaDraft" placeholder="Ej: fractura esmalte cara oclusal…"></textarea>

            <div class="flex gap-2">
              <button type="button" class="btn-ghost flex-1 justify-center text-red-500" (click)="limpiarPieza(d)">Limpiar pieza</button>
            </div>
          } @else {
            <div class="py-8 text-center">
              <svg class="mx-auto h-12 w-12 text-primary-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5.5c-2-2.2-5.5-2.6-8-.5v13c2.5-2.1 6-1.7 8 .5 2-2.2 5.5-2.6 8-.5v-13c-2.5-2.1-6-1.7-8 .5z" />
                <path d="M12 5.5v13" />
              </svg>
              <p class="mt-3 text-sm font-semibold text-slate-600">Selecciona una pieza</p>
              <p class="mt-1 text-xs text-slate-400">Haz clic en un diente o en su número FDI para ver sus superficies y aplicar estados.</p>
            </div>
          }
        </div>
      </div>

      <!-- ================= Imágenes y videos del paciente ================= -->
      <div class="card p-5">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <!-- Icono SVG coloreado: rayos X + play -->
            <svg class="h-6 w-6 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.6" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <h3 class="font-bold text-slate-800">Estudios e imágenes (DICOM, radiografías, fotos y videos)</h3>
          </div>
          <span class="text-xs text-slate-400">DICOM hasta 512 MB · imágenes 15 MB · videos 200 MB</span>
        </div>

        <form class="grid gap-3 sm:grid-cols-2 lg:grid-cols-[auto_1fr_130px_150px_auto]" (ngSubmit)="subirExamen()">
          <label class="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-primary-200 bg-primary-50/50 px-4 py-2.5 transition hover:border-primary-400">
            @if (archivoSel(); as f) {
              <span class="max-w-[180px] truncate text-xs font-bold text-blue-700">{{ f.name }}</span>
              <span class="text-[10px] text-slate-500">{{ f.size / 1024 | number: '1.0-0' }} KB</span>
            } @else {
              <span class="text-xs font-semibold text-slate-500">Elegir archivo…</span>
            }
            <input id="odontograma-file" type="file" accept="image/*,video/*,.dcm,.dicom,.ima,application/dicom" class="hidden" (change)="onArchivo($event)" />
          </label>
          <div>
            <input class="input w-full" name="titulo" [(ngModel)]="formEx.titulo" placeholder="Título (ej: Panorámica control)">
          </div>
          <div>
            <select class="input w-full" name="diente" [(ngModel)]="formEx.diente">
              <option value="">Sin pieza</option>
              @for (d of todasPiezas; track d) { <option [value]="d">{{ d }}</option> }
            </select>
          </div>
          <div>
            <select class="input w-full" name="tipo" [(ngModel)]="formEx.tipo">
              @for (t of tiposLista; track t.v) { <option [value]="t.v">{{ t.label }}</option> }
            </select>
          </div>
          <button class="btn-primary justify-center" type="submit" [disabled]="subiendo() || !archivoSel()">
            @if (subiendo()) { Subiendo… } @else { Subir }
          </button>
        </form>
        @if (errorEx()) { <p class="mt-2 text-xs font-medium text-red-600">{{ errorEx() }}</p> }

        <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          @for (ex of examenes(); track ex.id) {
            <button type="button" class="group overflow-hidden rounded-xl border border-slate-200 text-left transition hover:border-primary-400 hover:shadow-md" (click)="mediaVisor.set(ex)">
              <div class="relative aspect-[4/3] bg-black">
                @if (esDicom(ex)) {
                  <div class="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-violet-950 to-slate-950 text-white">
                    <span class="rounded-md border border-fuchsia-300/50 bg-fuchsia-500/20 px-2 py-1 text-[10px] font-extrabold">DICOM</span>
                    <span class="text-[9px] text-fuchsia-100">Visor clínico</span>
                  </div>
                } @else if (esVideo(ex)) {
                  <video [src]="ex.url" preload="metadata" class="h-full w-full object-contain" muted></video>
                  <span class="absolute inset-0 flex items-center justify-center">
                    <span class="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white">
                      <svg class="ml-0.5 h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </span>
                } @else {
                  <img [src]="ex.url" [alt]="ex.titulo" class="h-full w-full object-contain" loading="lazy" />
                }
                <span class="absolute left-1.5 top-1.5 badge text-[9px]" [class]="tipoInfo(ex.tipo).color">{{ tipoInfo(ex.tipo).label }}</span>
              </div>
              <div class="p-2">
                <p class="truncate text-xs font-semibold text-slate-700 group-hover:text-primary-700">{{ ex.titulo }}</p>
                <p class="text-[10px] text-slate-400">{{ ex.fecha | date: 'dd/MM/yy' }} @if (ex.diente) { · {{ ex.diente }} }</p>
              </div>
            </button>
          } @empty {
            <div class="col-span-full rounded-xl border border-dashed border-slate-200 py-8 text-center">
              <p class="text-sm text-slate-400">Sin estudios. Sube una radiografía, foto o video del paciente.</p>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- ================= Visor de medios ================= -->
    @if (mediaVisor(); as m) {
      @if (esDicom(m)) {
        @if (m.tipo === 'tomografia') {
          <app-tomografia-viewer [url]="m.url" [titulo]="m.titulo" (cerrar)="mediaVisor.set(null)" />
        } @else if (m.tipo === 'resonancia') {
          <app-resonancia-viewer [url]="m.url" [titulo]="m.titulo" (cerrar)="mediaVisor.set(null)" />
        } @else {
          <app-dicom-viewer [url]="m.url" [titulo]="m.titulo" (cerrar)="mediaVisor.set(null)" />
        }
      } @else {
      <div class="fixed inset-0 z-50 flex flex-col bg-black/95">
        <div class="flex flex-wrap items-center gap-2 border-b border-white/10 bg-primary-900 px-4 py-3">
          <button class="rounded-lg border border-white/25 p-2 text-white/90 hover:border-red-400 hover:text-red-400" (click)="mediaVisor.set(null)" title="Cerrar">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <span class="font-bold text-white">{{ m.titulo }}</span>
          <span class="badge text-[10px]" [class]="tipoInfo(m.tipo).color">{{ tipoInfo(m.tipo).label }}</span>
          @if (m.diente) { <span class="badge bg-white/15 text-[10px] text-white">Pieza {{ m.diente }}</span> }
          <button class="ml-auto rounded-lg border border-white/25 p-2 text-red-300 hover:border-red-400 hover:text-red-400" (click)="eliminarExamen(m)" title="Eliminar">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3" /></svg>
          </button>
        </div>
        <div class="flex flex-1 items-center justify-center overflow-hidden p-4">
          @if (esVideo(m)) {
            <video [src]="m.url" controls autoplay class="max-h-full max-w-full rounded-xl shadow-2xl"></video>
          } @else {
            <img [src]="m.url" [alt]="m.titulo" class="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
          }
        </div>
        @if (m.descripcion) {
          <p class="border-t border-white/10 bg-primary-900 px-4 py-2.5 text-xs text-primary-200">{{ m.descripcion }}</p>
        }
      </div>
      }
    }
  `,
})
export class OdontogramaComponent implements AfterViewInit {
  private dialog = inject(DialogService);
  private api = inject(ApiService);
  private el = inject(ElementRef);

  private _pacienteId: string | number = 0;
  @Input({ required: true })
  set pacienteId(v: string | number) {
    this._pacienteId = v;
    if (v) {
      this.cargar();
      this.api.examenes(Number(v)).subscribe((e) => this.examenes.set(e));
    }
  }
  get pacienteId(): string | number {
    return this._pacienteId;
  }

  // Constantes para el template
  readonly DIENTES = DIENTES;
  readonly CUADRANTES = CUADRANTES;
  readonly COLORES = COLORES;
  readonly MAPA = MAPA_HEX;

  readonly estados = [
    'sano', 'caries', 'restaurado', 'ausente', 'extraccion_indicada',
    'implante', 'corona', 'puente', 'endodoncia', 'protesis', 'fractura', 'movilidad',
  ];
  readonly superficies = [
    { v: '', label: 'Pieza' },
    { v: 'V', label: 'V' },
    { v: 'L', label: 'L' },
    { v: 'O', label: 'O/I' },
    { v: 'M', label: 'M' },
    { v: 'D', label: 'D' },
  ];
  readonly tiposLista = [
    { v: 'rx', label: 'Radiografía (RX)' },
    { v: 'video', label: 'Video clínico' },
    { v: 'intraoral', label: 'Foto intraoral' },
    { v: 'foto', label: 'Foto clínica' },
    { v: 'tomografia', label: 'Tomografía / CBCT' },
    { v: 'resonancia', label: 'Resonancia magnética' },
    { v: 'escaneo', label: 'Escaneo 3D' },
    { v: 'otro', label: 'Otro' },
  ];
  readonly todasPiezas = [
    18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
    48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
  ];

  // Estado clínico
  piezas = signal<OdontogramaPieza[]>([]);
  guardando = signal(false);
  estadoSeleccionado = 'caries';
  superficieSeleccionada = '';
  seleccion = signal<number | null>(null);
  notaDraft = '';

  // Bounding boxes de las piezas (medidos en el navegador, cuadrante local)
  bboxes = signal<Record<string, BBox> | null>(null);

  // Multimedia
  examenes = signal<ExamenImagen[]>([]);
  archivoSel = signal<File | null>(null);
  subiendo = signal(false);
  errorEx = signal<string | null>(null);
  formEx: any = { tipo: 'rx', titulo: '', diente: '', fecha: '' };
  mediaVisor = signal<ExamenImagen | null>(null);

  // Etiquetas FDI calculadas (posición absoluta, fuera del arco)
  etiquasFDI = computed(() => {
    const boxes = this.bboxes();
    if (!boxes) return [];
    const out: { fdi: number; x: number; y: number }[] = [];
    for (const q of CUADRANTES) {
      for (const t of DIENTES) {
        const b = boxes[t.name];
        if (!b) continue;
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        // Centro absoluto tras la transformación del cuadrante
        const ax = q.pref === '2' || q.pref === '3' ? 409 - cx : cx;
        const ay = q.pref === '4' || q.pref === '3' ? 694 - cy : cy;
        // Empujar hacia afuera desde el centro de la boca (204.5, 347)
        const vx = ax - 204.5;
        const vy = ay - 347;
        const len = Math.hypot(vx, vy) || 1;
        const off = Math.max(b.w, b.h) / 2 + 14;
        out.push({
          fdi: +(q.pref + t.name),
          x: +(ax + (vx / len) * off).toFixed(1),
          y: +(ay + (vy / len) * off + 4.5).toFixed(1),
        });
      }
    }
    return out;
  });

  ngAfterViewInit(): void {
    // El componente solo se monta con la pestaña activa → el SVG es visible
    setTimeout(() => this.medirBboxes(), 120);
  }

  private medirBboxes(): void {
    const svg: SVGSVGElement | null = this.el.nativeElement.querySelector('svg');
    if (!svg) return;
    const boxes: Record<string, BBox> = {};
    svg.querySelectorAll<SVGPathElement>('path[data-tooth]').forEach((p) => {
      const k = p.getAttribute('data-tooth') ?? '';
      if (!k || boxes[k]) return;
      try {
        const b = p.getBBox();
        if (b.width > 0 && b.height > 0) {
          boxes[k] = { x: b.x, y: b.y, w: b.width, h: b.height };
        }
      } catch {
        /* sin bbox */
      }
    });
    if (Object.keys(boxes).length === DIENTES.length) {
      this.bboxes.set(boxes);
    }
  }

  // ------------------------------------------------------------------ datos
  cargar(): void {
    const pid = Number(this.pacienteId);
    if (!pid) return;
    this.api.odontograma(pid).subscribe((p) => this.piezas.set(p));
  }

  guardar(): void {
    const pid = Number(this.pacienteId);
    if (!pid) return;
    const d = this.seleccion();
    if (d !== null) {
      const lista = [...this.piezas()];
      const i = lista.findIndex((p) => p.diente === d && p.superficie === '');
      if (i >= 0) lista[i] = { ...lista[i], notas: this.notaDraft };
      else if (this.notaDraft) lista.push({ diente: d, superficie: '', estado: 'sano', notas: this.notaDraft });
      this.piezas.set(lista);
    }
    this.guardando.set(true);
    const payload = this.piezas().map((p) => ({
      diente: p.diente,
      superficie: p.superficie,
      estado: p.estado,
      notas: p.notas ?? undefined,
      doctor_id: null,
    }));
    this.api.guardarOdontograma(pid, payload).subscribe({
      next: (res) => {
        this.piezas.set(res);
        this.guardando.set(false);
        void this.dialog.success({ title: 'Odontograma guardado', text: 'Los cambios clínicos se guardaron correctamente.' });
      },
      error: (e) => { this.guardando.set(false); void this.dialog.apiError(e, 'No se pudo guardar el odontograma.'); },
    });
  }

  // ------------------------------------------------------------ interacción
  fdi(pref: string, name: string): number {
    return +(pref + name);
  }

  clicDiente(fdi: number, e?: Event): void {
    e?.stopPropagation();
    this.sincronizarNota(this.seleccion());
    this.seleccion.set(fdi);
    this.cargarNota(fdi);
    this.aplicar(fdi, this.superficieSeleccionada);
  }

  deseleccionar(): void {
    this.sincronizarNota(this.seleccion());
    this.seleccion.set(null);
  }

  pintarEstado(diente: number, estado: string): void {
    this.estadoSeleccionado = estado;
    this.aplicar(diente, this.superficieSeleccionada);
  }

  aplicarZona(diente: number, sup: string): void {
    this.superficieSeleccionada = sup;
    this.aplicar(diente, sup);
  }

  aplicar(diente: number, supCruda: string): void {
    // En dientes anteriores (1-3) la superficie central es I (incisal), no O
    const pos = this.pos(diente);
    const sup = supCruda === 'O' && pos <= 3 ? 'I' : supCruda;
    const estado = this.estadoSeleccionado;
    const lista = [...this.piezas()];
    const i = lista.findIndex((p) => p.diente === diente && p.superficie === sup);
    if (i >= 0) lista[i] = { ...lista[i], estado };
    else lista.push({ diente, superficie: sup, estado });
    this.piezas.set(lista);
  }

  async limpiarPieza(diente: number): Promise<void> {
    if (!await this.dialog.confirm({ title: '¿Limpiar pieza?', text: `Se quitarán todos los estados registrados para la pieza ${diente}.`, confirmText: 'Limpiar pieza', danger: true })) return;
    this.piezas.set(this.piezas().filter((p) => p.diente !== diente));
    this.notaDraft = '';
  }

  private sincronizarNota(diente: number | null): void {
    if (diente === null) return;
    const fila = this.piezas().find((p) => p.diente === diente && p.superficie === '');
    if (fila) this.piezas.set(this.piezas().map((p) => (p === fila ? { ...p, notas: this.notaDraft } : p)));
  }

  private cargarNota(diente: number): void {
    this.notaDraft = this.piezas().find((p) => p.diente === diente && p.superficie === '')?.notas ?? '';
  }

  // ------------------------------------------------------------- consultas
  pos(diente: number): number {
    return +(String(diente).slice(1));
  }

  estadoDe(diente: number, sup = ''): string {
    return this.piezas().find((p) => p.diente === diente && p.superficie === sup)?.estado ?? 'sano';
  }

  estadoSup(diente: number, sup: string): string {
    const lista = this.piezas();
    let f = lista.find((p) => p.diente === diente && p.superficie === sup);
    if (!f && sup === 'I') f = lista.find((p) => p.diente === diente && p.superficie === 'O');
    if (!f && sup === 'O') f = lista.find((p) => p.diente === diente && p.superficie === 'I');
    return f?.estado ?? 'sano';
  }

  conteo(estado: string): number {
    return this.piezas().filter((p) => p.superficie === '' && p.estado === estado).length;
  }

  listaSuperficies(diente: number): { sup: string; estado: string }[] {
    const c = this.central(diente);
    return [
      { sup: 'V', estado: this.estadoSup(diente, 'V') },
      { sup: 'M', estado: this.estadoSup(diente, 'M') },
      { sup: c, estado: this.estadoSup(diente, c) },
      { sup: 'D', estado: this.estadoSup(diente, 'D') },
      { sup: 'L', estado: this.estadoSup(diente, 'L') },
    ];
  }

  central(diente: number): string {
    return this.pos(diente) <= 3 ? 'I' : 'O';
  }

  nombrePieza(diente: number): string {
    return NOMBRES_PIEZA[this.pos(diente)] ?? 'Pieza';
  }

  cuadrante(diente: number): string {
    const q = String(diente)[0];
    return (
      { '1': 'Superior derecha', '2': 'Superior izquierda', '3': 'Inferior izquierda', '4': 'Inferior derecha' }[q] ??
      'Arcada'
    );
  }

  nombreSuperficie(s: string): string {
    if (s === '') return 'Pieza completa';
    if (s === 'O') return 'Oclusal';
    if (s === 'I') return 'Incisal';
    return { V: 'Vestibular', L: 'Lingual / palatina', M: 'Mesial', D: 'Distal' }[s] ?? s;
  }

  etiqueta(estado: string): string {
    return ETIQUETAS[estado] ?? estado;
  }

  colorDiente(diente: number): string {
    const estado = this.estadoDe(diente);
    if (estado === 'sano') return '#f8fafc';
    if (estado === 'ausente') return '#f1f5f9';
    return MAPA_HEX[estado] ?? '#f8fafc';
  }

  marca(diente: number): 'ausente' | 'extraccion' | null {
    const e = this.estadoDe(diente);
    if (e === 'ausente') return 'ausente';
    if (e === 'extraccion_indicada') return 'extraccion';
    return null;
  }

  xDe(name: string): string {
    const b = this.bboxes()?.[name];
    if (!b) return '';
    const p = 4;
    return (
      `M${(b.x + p).toFixed(1)},${(b.y + p).toFixed(1)} ` +
      `L${(b.x + b.w - p).toFixed(1)},${(b.y + b.h - p).toFixed(1)} ` +
      `M${(b.x + b.w - p).toFixed(1)},${(b.y + p).toFixed(1)} ` +
      `L${(b.x + p).toFixed(1)},${(b.y + b.h - p).toFixed(1)}`
    );
  }

  celda(diente: number, sup: string): string {
    const est = this.estadoSup(diente, sup);
    let c = 'flex h-10 w-10 items-center justify-center rounded border text-xs font-extrabold transition ';
    c += est === 'endodoncia' ? 'text-white border-primary-800 ' : 'text-slate-700 border-slate-300 ';
    if (this.superficieSeleccionada === sup) c += 'ring-2 ring-primary-500 ';
    return c;
  }

  colorCelda(diente: number, sup: string): string {
    return MAPA_HEX[this.estadoSup(diente, sup)] ?? '#ffffff';
  }

  // ------------------------------------------------------------- multimedia
  tipoInfo(tipo: string): { label: string; color: string } {
    return TIPOS_EXAMEN[tipo] ?? TIPOS_EXAMEN['otro'];
  }

  esVideo(ex: ExamenImagen): boolean {
    return (ex.mime ?? '').startsWith('video') || /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(ex.url);
  }

  esDicom(ex: ExamenImagen): boolean {
    return (ex.mime ?? '').toLowerCase().includes('dicom') || /\.(dcm|dicom|ima)(?:$|\?)/i.test(ex.url || ex.archivo);
  }

  onArchivo(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.errorEx.set(null);
    if (!file) {
      this.archivoSel.set(null);
      return;
    }
    const esVideo = file.type.startsWith('video') || /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(file.name);
    const esDicom = /\.(dcm|dicom|ima)$/i.test(file.name) || file.type.toLowerCase().includes('dicom');
    const limite = esVideo ? 200 * 1024 * 1024 : esDicom ? 512 * 1024 * 1024 : 15 * 1024 * 1024;
    if (file.size > limite) {
      this.errorEx.set(esVideo ? 'El video supera los 200 MB.' : esDicom ? 'El estudio DICOM supera los 512 MB.' : 'La imagen supera los 15 MB.');
      this.archivoSel.set(null);
      return;
    }
    this.archivoSel.set(file);
    if (!this.formEx.titulo) this.formEx.titulo = file.name.replace(/\.[^.]+$/, '');
    this.formEx.tipo = esVideo
      ? 'video'
      : esDicom && !['tomografia', 'resonancia'].includes(this.formEx.tipo)
        ? 'tomografia'
        : this.formEx.tipo === 'video'
          ? 'rx'
          : this.formEx.tipo;
  }

  subirExamen(): void {
    const file = this.archivoSel();
    const pid = Number(this.pacienteId);
    if (!file || !pid) {
      this.errorEx.set('Selecciona un archivo primero.');
      return;
    }
    if (!this.formEx.titulo?.trim()) {
      this.errorEx.set('El título es obligatorio.');
      return;
    }
    this.subiendo.set(true);
    this.errorEx.set(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tipo', this.formEx.tipo);
    fd.append('titulo', this.formEx.titulo.trim());
    if (this.formEx.diente) fd.append('diente', this.formEx.diente);
    const hoy = new Date().toISOString().slice(0, 10);
    fd.append('fecha', hoy);
    this.api.subirExamen(pid, fd).subscribe({
      next: (ex) => {
        this.examenes.set([ex, ...this.examenes()]);
        this.subiendo.set(false);
        void this.dialog.success({ title: 'Examen agregado', text: 'El archivo se guardó en la ficha del paciente.' });
        this.archivoSel.set(null);
        this.formEx = { tipo: this.formEx.tipo, titulo: '', diente: '', fecha: '' };
        const input = document.querySelector<HTMLInputElement>('#odontograma-file');
        if (input) input.value = '';
      },
      error: (e) => {
        this.subiendo.set(false);
        this.errorEx.set(e?.error?.detail || 'No se pudo subir el archivo.');
      },
    });
  }

  async eliminarExamen(ex: ExamenImagen): Promise<void> {
    const pid = Number(this.pacienteId);
    if (!await this.dialog.confirm({ title: '¿Eliminar examen?', text: `Se eliminará "${ex.titulo}" de este paciente.`, confirmText: 'Eliminar', danger: true })) return;
    this.api.eliminarExamen(pid, ex.id).subscribe({
      next: () => {
        this.examenes.set(this.examenes().filter((x) => x.id !== ex.id));
        this.mediaVisor.set(null);
        void this.dialog.success({ title: 'Examen eliminado' });
      },
      error: e => { void this.dialog.apiError(e, 'No se pudo eliminar el examen.'); },
    });
  }
}
