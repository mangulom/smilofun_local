import { Component, inject, signal, viewChild, Input, OnInit, ElementRef, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, CurrencyPipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import {
  Doctor,
  ExamenImagen,
  ExamenMarca,
  HistorialNota,
  Paciente,
  PacienteResumen,
  Plan,
} from '../../core/models';
import { OdontogramaComponent } from './odontograma.component';
import { DicomViewerComponent } from '../../shared/dicom-viewer.component';
import { TomografiaViewerComponent } from '../../shared/tomografia-viewer.component';
import { ResonanciaViewerComponent } from '../../shared/resonancia-viewer.component';
import { VolumenViewerComponent } from '../../shared/volumen-viewer.component';
import { DialogService } from '../../shared/dialog.service';

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

@Component({
  selector: 'app-paciente-detalle',
  imports: [FormsModule, DatePipe, CurrencyPipe, DecimalPipe, RouterLink, OdontogramaComponent, DicomViewerComponent, TomografiaViewerComponent, ResonanciaViewerComponent, VolumenViewerComponent],
  template: `
    <div class="space-y-5">
      @if (paciente(); as p) {
        <!-- Cabecera -->
        <div class="card p-5">
          <div class="flex flex-wrap items-start gap-4">
            <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-900 text-xl font-extrabold text-accent-400">
              {{ p.nombre_completo.slice(0, 1) }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h1 class="text-xl font-extrabold text-slate-800">{{ p.nombre_completo }}</h1>
                <span class="badge bg-blue-100 text-blue-700">{{ p.codigo }}</span>
                @if (p.alergias) {
                  <span class="badge bg-red-100 text-red-700">⚠ Alergia: {{ p.alergias }}</span>
                }
                @if (p.enfermedades) {
                  <span class="badge bg-amber-100 text-amber-700">{{ p.enfermedades }}</span>
                }
              </div>
              <p class="mt-1 text-sm text-slate-500">
                {{ p.dni || 'Sin DNI' }} · {{ p.telefono || 'Sin teléfono' }} ·
                {{ p.sexo === 'F' ? 'Femenino' : p.sexo === 'M' ? 'Masculino' : 'Otro' }}
                @if (p.fecha_nacimiento) { · {{ p.fecha_nacimiento | date: 'dd/MM/yyyy' }} }
                @if (p.tipo_sangre) { · Sangre {{ p.tipo_sangre }} }
              </p>
            </div>
            <a routerLink="/pacientes" class="btn-ghost">← Volver</a>
          </div>

          @if (resumen(); as r) {
            <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
<div class="rounded-xl bg-blue-50 p-3">
                <p class="label">Citas totales</p>
                <p class="text-xl font-extrabold text-blue-700">{{ r.total_citas }}</p>
              </div>
              <div class="rounded-xl bg-orange-400/15 p-3">
                <p class="label">Total gastado</p>
                <p class="text-xl font-extrabold text-orange-600">{{ r.total_gastado | currency: 'S/':'symbol':'1.0-0' }}</p>
              </div>
              <div class="rounded-xl bg-red-50 p-3">
                <p class="label">Saldo pendiente</p>
                <p class="text-xl font-extrabold text-red-600">{{ r.saldo_pendiente | currency: 'S/':'symbol':'1.0-0' }}</p>
              </div>
              <div class="rounded-xl bg-emerald-50 p-3">
                <p class="label">Piezas afectadas</p>
                <p class="text-xl font-extrabold text-emerald-600">{{ r.dientes_afectados }}</p>
              </div>
              <div class="rounded-xl bg-slate-100 p-3">
                <p class="label">Inasistencias</p>
                <p class="text-xl font-extrabold text-slate-700">{{ (r.tasa_no_show * 100).toFixed(0) }}%</p>
              </div>
            </div>
          }
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 overflow-x-auto border-b border-slate-200">
          @for (t of tabs; track t.id) {
            <button
              class="whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px"
              [class]="tab() === t.id ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'"
              (click)="tab.set(t.id)"
            >
{{ t.etiqueta }}
              @if (t.id === 'examenes' && examenes().length) {
                <span class="ml-1 badge bg-blue-100 text-blue-700">{{ examenes().length }}</span>
              }
              @if (t.id === 'piezas3d' && piezas3d().length) {
                <span class="ml-1 badge bg-blue-100 text-blue-700">{{ piezas3d().length }}</span>
              }
            </button>
          }
        </div>

        <!-- RESUMEN -->
        @if (tab() === 'resumen') {
          <div class="grid gap-5 lg:grid-cols-2">
            <div class="card p-5">
              <h3 class="mb-3 font-bold text-slate-800">Ficha clínica</h3>
              <dl class="grid grid-cols-2 gap-y-3 text-sm">
                <dt class="text-slate-500">Ocupación</dt><dd class="font-medium">{{ p.ocupacion || '—' }}</dd>
                <dt class="text-slate-500">Dirección</dt><dd class="font-medium">{{ p.direccion || '—' }}</dd>
                <dt class="text-slate-500">Medicamentos</dt><dd class="font-medium">{{ p.medicamentos || '—' }}</dd>
                <dt class="text-slate-500">Emergencia</dt>
                <dd class="font-medium">{{ p.emergencia_nombre || '—' }} {{ p.emergencia_telefono ? '(' + p.emergencia_telefono + ')' : '' }}</dd>
                <dt class="text-slate-500">Notas</dt><dd class="font-medium col-span-2">{{ p.notas || '—' }}</dd>
              </dl>
            </div>
            <div class="card p-5">
              <h3 class="mb-3 font-bold text-slate-800">Planes de tratamiento</h3>
              @if (planes().length) {
                <ul class="space-y-2">
                  @for (pl of planes(); track pl.id) {
                    <li class="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm">
                      <span>
                        <b class="font-mono text-blue-700">{{ pl.codigo }}</b>
                        · {{ pl.items.length }} procedimientos
                      </span>
                      <span class="flex items-center gap-2">
                        <span class="badge" [class]="clasePlan(pl.estado)">{{ pl.estado }}</span>
                        <b>{{ pl.total | currency: 'S/':'symbol':'1.0-0' }}</b>
                      </span>
                    </li>
                  }
                </ul>
              } @else {
                <p class="text-sm text-slate-400">Sin planes registrados.</p>
              }
            </div>
          </div>
        }

        <!-- HISTORIAL -->
        @if (tab() === 'historial') {
          <div class="grid gap-5 lg:grid-cols-3">
            <div class="card p-5 lg:col-span-2">
              <h3 class="mb-4 font-bold text-slate-800">Historial clínico</h3>
              <div class="space-y-3">
                @for (n of historial(); track n.id) {
                  <div class="rounded-xl border border-slate-100 p-4">
                    <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span class="text-sm font-bold text-blue-700">{{ n.fecha | date: 'dd/MM/yyyy HH:mm' }}</span>
                      <span class="text-xs text-slate-500">{{ n.doctor.nombre_completo }}</span>
                    </div>
                    @if (n.motivo) { <p class="text-sm"><b class="text-slate-600">Motivo:</b> {{ n.motivo }}</p> }
                    @if (n.diagnostico) { <p class="text-sm"><b class="text-slate-600">Diagnóstico:</b> {{ n.diagnostico }}</p> }
                    @if (n.tratamiento) { <p class="text-sm"><b class="text-slate-600">Tratamiento:</b> {{ n.tratamiento }}</p> }
                    @if (n.indicaciones) { <p class="text-sm text-slate-500"><b>Indicaciones:</b> {{ n.indicaciones }}</p> }
                  </div>
                } @empty {
                  <p class="py-6 text-center text-sm text-slate-400">Sin evoluciones registradas.</p>
                }
              </div>
            </div>
            <div class="card h-fit p-5">
              <h3 class="mb-4 font-bold text-slate-800">Nueva evolución</h3>
              <form class="space-y-3" (ngSubmit)="guardarNota()">
                <div>
                  <label class="label">Doctor</label>
                  <select class="input" name="doctor_id" [(ngModel)]="notaForm.doctor_id" required>
                    @for (d of doctores(); track d.id) { <option [value]="d.id">{{ d.nombre_completo }}</option> }
                  </select>
                </div>
                <div><label class="label">Motivo</label><input class="input" name="motivo" [(ngModel)]="notaForm.motivo"></div>
                <div><label class="label">Diagnóstico</label><textarea class="input" rows="2" name="diagnostico" [(ngModel)]="notaForm.diagnostico"></textarea></div>
                <div><label class="label">Tratamiento realizado</label><textarea class="input" rows="2" name="tratamiento" [(ngModel)]="notaForm.tratamiento"></textarea></div>
                <div><label class="label">Indicaciones</label><textarea class="input" rows="2" name="indicaciones" [(ngModel)]="notaForm.indicaciones"></textarea></div>
                <button class="btn-primary w-full justify-center" [disabled]="guardandoNota()">Guardar evolución</button>
                @if (notaOk()) { <p class="text-sm font-medium text-emerald-600">✓ Evolución guardada</p> }
              </form>
            </div>
          </div>
        }

        <!-- ODONTOGRAMA AVANZADO -->
        @if (tab() === 'odontograma') {
          <app-odontograma [pacienteId]="id" />
        }
        <!-- EXÁMENES DE IMAGEN -->
        @if (tab() === 'examenes') {
          <div class="grid gap-5 lg:grid-cols-3">
            <!-- Subir examen -->
            <div class="card h-fit p-5">
              <h3 class="mb-4 flex items-center gap-2 font-bold text-slate-800">
                <svg class="h-5 w-5 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                Subir estudio, imagen o video
              </h3>
              <form class="space-y-3" (ngSubmit)="subirExamen()">
                <label class="block cursor-pointer rounded-xl border-2 border-dashed border-primary-200 bg-primary-50/50 p-4 text-center transition hover:border-primary-400">
                  @if (archivoSel(); as f) {
                    <p class="text-sm font-bold text-blue-700">{{ f.name }}</p>
                    <p class="text-xs text-slate-500">{{ f.size / 1024 | number: '1.0-0' }} KB · listo para subir</p>
                  } @else {
                    <!-- Icono de rayos X de color -->
                    <svg class="mx-auto h-8 w-8 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8 8l8 8M16 8l-8 8" />
                      <circle cx="12" cy="12" r="3.5" />
                    </svg>
                    <p class="mt-1 text-xs text-slate-500">ZIP con DICOM (≤1 GB), NIfTI/NRRD (≤1 GB), DICOM, imagen o video</p>
                  }
                  <input type="file" accept="image/*,video/*,.dcm,.dicom,.ima,.nii,.nii.gz,.nrrd,.zip,application/dicom,application/gzip,application/zip" class="mt-2 block w-full text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-blue-100 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-blue-700" (change)="onArchivo($event)" />
                </label>

                <div>
                  <label class="label">Tipo</label>
                  <select class="input" name="tipo" [(ngModel)]="formEx.tipo">
                    @for (t of tiposLista; track t.v) { <option [value]="t.v">{{ t.label }}</option> }
                  </select>
                </div>
                <div><label class="label">Título *</label><input class="input" name="titulo" [(ngModel)]="formEx.titulo" required placeholder="Ej: Panorámica inicial"></div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="label">Pieza FDI</label>
                    <select class="input" name="diente" [(ngModel)]="formEx.diente">
                      <option value="">— Sin vincular —</option>
                      @for (d of todasPiezas; track d) { <option [value]="d">{{ d }}</option> }
                    </select>
                  </div>
                  <div><label class="label">Fecha</label><input class="input" type="date" name="fecha" [(ngModel)]="formEx.fecha"></div>
                </div>
                <div><label class="label">Descripción</label><textarea class="input" rows="2" name="descripcion" [(ngModel)]="formEx.descripcion" placeholder="Hallazgos, indicaciones…"></textarea></div>
                <button class="btn-primary w-full justify-center" [disabled]="subiendo() || !archivoSel()">
                  @if (subiendo()) { Subiendo y validando volumen… } @else { Subir examen }
                </button>
                @if (subiendo() && archivoSel()) {
                  <p class="text-xs text-slate-500">{{ archivoSel()!.name }} · {{ (archivoSel()!.size / 1048576) | number:'1.1-1' }} MB. La validación puede tardar unos segundos.</p>
                }
                @if (errorEx()) { <p class="text-xs font-medium text-red-600">{{ errorEx() }}</p> }
              </form>
            </div>

            <!-- Grid de estudios -->
            <div class="lg:col-span-2">
              <div class="card p-5">
                <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 class="font-bold text-slate-800">Estudios ({{ examenes().length }})</h3>
                  <span class="text-xs text-slate-400">Clic en una imagen para abrir el visor interactivo</span>
                </div>
                <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  @for (ex of examenes(); track ex.id) {
                    <div class="group overflow-hidden rounded-xl border border-slate-200 transition hover:border-primary-400 hover:shadow-md">
                      <button class="block w-full text-left" (click)="abrirVisor(ex)">
                        <div class="relative aspect-[4/3] bg-primary-950">
                          @if (esSerieZip(ex)) {
                            <div class="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-cyan-950 to-slate-950 text-white"><span class="rounded-lg border border-cyan-300/50 bg-cyan-500/20 px-3 py-1 text-xs font-extrabold">SERIE DICOM · ZIP</span><span class="text-[10px] text-cyan-100">{{ ex.instancias_dicom?.length || 0 }} cortes · abrir como serie</span></div>
                          } @else if (esVolumen(ex)) {
                            <div class="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-indigo-950 to-slate-950 text-white">
              <span class="rounded-lg border border-indigo-300/50 bg-indigo-500/20 px-3 py-1 text-xs font-extrabold tracking-wide">{{ formatoVolumen(ex) }}</span>
              <span class="text-[10px] text-indigo-100">{{ etiquetaVolumen(ex) }}</span>
                              @if (!volumenValido(ex)) { <span class="rounded bg-red-500/80 px-2 py-1 text-[10px]">Volumen inválido o incompleto ({{ ex.tamano }} bytes)</span> }
                            </div>
                          } @else if (esDicom(ex)) {
                            <div class="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-violet-950 to-slate-950 text-white">
                              <span class="rounded-lg border border-fuchsia-300/50 bg-fuchsia-500/20 px-3 py-1 text-xs font-extrabold tracking-wide">DICOM</span>
                              <span class="text-[10px] text-fuchsia-100">Abrir visor clínico</span>
                            </div>
                          } @else if (esVideo(ex)) {
                            <video [src]="urlArchivo(ex)" preload="metadata" class="h-full w-full object-contain" muted></video>
                            <span class="absolute inset-0 flex items-center justify-center">
                              <span class="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white">
                                <svg class="ml-0.5 h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                              </span>
                            </span>
} @else {
                            <img [src]="urlArchivo(ex)" [alt]="ex.titulo" class="h-full w-full object-contain" loading="lazy" />
                          }
                          <span class="absolute left-2 top-1.5 badge text-[10px]" [class]="tipoInfo(ex.tipo).color">{{ tipoInfo(ex.tipo).label }}</span>
                          @if (ex.marcas?.length) {
                            <span class="absolute right-2 top-1.5 badge bg-blue-400 text-[10px] text-white">
                              ● {{ ex.marcas!.length }} marcas
                            </span>
                          }
                        </div>
                        <div class="p-3">
                          <p class="truncate text-sm font-semibold text-slate-800 group-hover:text-primary-700">{{ ex.titulo }}</p>
                          <p class="text-xs text-slate-500">
                            {{ ex.fecha | date: 'dd/MM/yyyy' }} · {{ ex.tamano / 1024 | number: '1.0-0' }} KB
                            @if (ex.diente) { · Pieza {{ ex.diente }} }
                          </p>
                        </div>
                      </button>
                      <div class="flex justify-between border-t border-slate-100 px-3 py-2">
                        <button class="text-xs font-semibold text-primary-600 hover:underline" (click)="abrirVisor(ex)">Abrir visor</button>
                        <button class="text-xs font-semibold text-red-400 hover:text-red-600" (click)="eliminarExamen(ex)">Eliminar</button>
                      </div>
                    </div>
                  } @empty {
                    <div class="col-span-full rounded-xl border border-dashed border-slate-200 py-10 text-center">
                      <svg class="mx-auto h-10 w-10 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                      <p class="mt-2 text-sm text-slate-400">Sin exámenes aún. Sube la primera radiografía.</p>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
}

        <!-- PIEZAS 3D ASIGNADAS -->
        @if (tab() === 'piezas3d') {
          <div class="card p-5">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 class="font-bold text-slate-800">Piezas 3D asignadas ({{ piezas3d().length }})</h3>
              <a class="btn-primary !px-3 !py-1.5 text-xs" [routerLink]="['/diseno3d']" [queryParams]="{ paciente: id }">
                + Nueva pieza 3D
              </a>
            </div>

            @if (cargandoPiezas3d()) {
              <p class="text-sm text-slate-400">Cargando diseños…</p>
            } @else if (piezas3d().length === 0) {
              <div class="rounded-xl border border-dashed border-slate-200 py-10 text-center">
                <svg class="mx-auto h-10 w-10 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
                <p class="mt-2 text-sm text-slate-400">Este paciente aún no tiene piezas 3D asignadas.</p>
              </div>
            } @else {
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="bg-slate-50">
                    <tr>
                      <th class="th">Pieza</th>
                      <th class="th">Estilo</th>
                      <th class="th">Medidas (mm)</th>
                      <th class="th">Volumen</th>
                      <th class="th">Ajuste</th>
                      <th class="th">Fecha</th>
                      <th class="th text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (d of piezas3d(); track d.id) {
                      <tr class="hover:bg-slate-50">
                        <td class="td font-semibold text-slate-700">{{ nombrePieza(d.tipo) }}</td>
                        <td class="td text-xs text-slate-500">{{ d.estilo }}</td>
                        <td class="td">{{ d.ancho }} × {{ d.alto }} × {{ d.profundidad }}</td>
                        <td class="td">{{ d.metricas?.volumen_mm3 ?? '—' }} mm³</td>
                        <td class="td">
                          @if (d.metricas?.ajuste_medio != null) {
                            <span class="badge bg-emerald-100 text-emerald-700">{{ (d.metricas.ajuste_medio * 100).toFixed(1) }}%</span>
                          } @else {
                            —
                          }
                        </td>
                        <td class="td">{{ fmtFecha(d.creado_en) }}</td>
                        <td class="td">
                          <div class="flex justify-end gap-2">
                            <a class="btn-ghost !px-3 !py-1.5 text-xs" [routerLink]="['/diseno3d']" [queryParams]="{ diseno: d.id }">Ver 3D</a>
                            <button class="btn-accent !px-3 !py-1.5 text-xs" (click)="descargarDiseno(d.id)">STL</button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }
      } @else {
        <p class="py-16 text-center text-slate-400">Cargando paciente…</p>
      }
    </div>

    <!-- ============ VISOR INTERACTIVO DE EXÁMENES ============ -->
    @if (visor(); as v) {
    @if (esSerieZip(v)) {
        <div class="fixed inset-0 z-[60] flex items-center justify-center bg-primary-950/75 p-3 sm:p-6" (click)="cerrarVisor()" role="dialog" aria-modal="true" [attr.aria-label]="'Visor de serie DICOM ' + v.titulo">
          <div class="relative h-[92vh] w-[96vw] max-w-[1600px] overflow-hidden rounded-2xl border border-white/20 bg-slate-950 shadow-2xl" (click)="$event.stopPropagation()">
            @if (v.tipo === 'tomografia') { <app-tomografia-viewer [url]="v.url" [titulo]="v.titulo" [imageUrls]="dicomSerie()[v.id] || []" (cerrar)="cerrarVisor()" /> }
            @else { <app-resonancia-viewer [url]="v.url" [titulo]="v.titulo" [imageUrls]="dicomSerie()[v.id] || []" (cerrar)="cerrarVisor()" /> }
          </div>
        </div>
      } @else if (esVolumen(v)) {
        <div class="fixed inset-0 z-[60] flex items-center justify-center bg-primary-950/75 p-3 sm:p-6" (click)="cerrarVisor()" role="dialog" aria-modal="true" [attr.aria-label]="'Visor volumétrico de ' + v.titulo">
          <div class="relative h-[92vh] w-[96vw] max-w-[1600px] overflow-hidden rounded-2xl border border-white/20 bg-slate-950 shadow-2xl" (click)="$event.stopPropagation()">
            <app-volumen-viewer [url]="v.url" [titulo]="v.titulo" [tipo]="v.tipo" [formato]="formatoVolumen(v)" [dimensiones]="v.dimensiones || null" (cerrar)="cerrarVisor()" />
          </div>
        </div>
      } @else if (esSerieZip(v)) {
        <div class="fixed inset-0 z-[60] flex items-center justify-center bg-primary-950/75 p-3 sm:p-6" (click)="cerrarVisor()" role="dialog" aria-modal="true" [attr.aria-label]="'Visor de serie DICOM ' + v.titulo">
          <div class="relative h-[92vh] w-[96vw] max-w-[1600px] overflow-hidden rounded-2xl border border-white/20 bg-slate-950 shadow-2xl" (click)="$event.stopPropagation()">
            @if (v.tipo === 'tomografia') { <app-tomografia-viewer [url]="v.url" [titulo]="v.titulo" [imageUrls]="dicomSerie()[v.id] || []" (cerrar)="cerrarVisor()" /> }
            @else { <app-resonancia-viewer [url]="v.url" [titulo]="v.titulo" [imageUrls]="dicomSerie()[v.id] || []" (cerrar)="cerrarVisor()" /> }
          </div>
        </div>
      } @else if (esDicom(v)) {
        <div class="fixed inset-0 z-[60] flex items-center justify-center bg-primary-950/75 p-3 sm:p-6" (click)="cerrarVisor()" (keydown.escape)="cerrarVisor()" role="dialog" aria-modal="true" [attr.aria-label]="'Visor de ' + v.titulo">
          <div class="relative h-[92vh] w-[96vw] max-w-[1600px] overflow-hidden rounded-2xl border border-white/20 bg-slate-950 shadow-2xl" (click)="$event.stopPropagation()" (keydown.escape)="cerrarVisor()">
            @if (v.tipo === 'tomografia') {
              <app-tomografia-viewer [url]="v.url" [titulo]="v.titulo" [imageUrls]="dicomSerie()[v.id] || []" (cerrar)="cerrarVisor()" />
            } @else if (v.tipo === 'resonancia') {
              <app-resonancia-viewer [url]="v.url" [titulo]="v.titulo" [imageUrls]="dicomSerie()[v.id] || []" (cerrar)="cerrarVisor()" />
            } @else {
              <app-dicom-viewer [url]="v.url" [titulo]="v.titulo" (cerrar)="cerrarVisor()" />
            }
          </div>
        </div>
      } @else {
      <div class="fixed inset-0 z-50 flex flex-col bg-primary-950/95 backdrop-blur-sm">
        <!-- Barra de herramientas -->
        <div class="flex flex-wrap items-center gap-2 border-b border-white/10 bg-primary-900 px-4 py-3">
          <button class="rounded-lg border border-white/25 p-2 text-white/90 hover:border-red-400 hover:text-red-400" (click)="cerrarVisor()" title="Cerrar">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <span class="font-bold text-white">{{ v.titulo }}</span>
          <span class="badge text-[10px]" [class]="tipoInfo(v.tipo).color">{{ tipoInfo(v.tipo).label }}</span>
          @if (v.diente) { <span class="badge bg-white/15 text-white text-[10px]">Pieza {{ v.diente }}</span> }
          @if (v.marcas?.length) { <span class="badge bg-accent-400 text-[10px] text-primary-900">{{ v.marcas!.length }} marcas</span> }
          @if (guardandoMarca()) { <span class="text-[11px] text-accent-300">Guardando…</span> }

          <div class="ml-auto flex flex-wrap items-center gap-2">
            @if (!esVideo(v)) {
              <!-- Zoom -->
              <button class="tool-btn" (click)="zoomPor(1 / 1.25)" title="Alejar">
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5M8 11h6" /></svg>
              </button>
              <span class="w-14 text-center text-xs font-bold text-accent-400">{{ (zoom() * 100) | number: '1.0-0' }}%</span>
              <button class="tool-btn" (click)="zoomPor(1.25)" title="Acercar">
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5M8 11h6M11 8v6" /></svg>
              </button>
              <!-- Rotar -->
              <button class="tool-btn" (click)="rotar()" title="Rotar 90°">
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
              </button>
              <!-- Ajustar -->
              <button class="tool-btn" (click)="ajustar()" title="Ajustar a la pantalla">
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
              </button>
              <!-- Marcar -->
              <button
                class="tool-btn"
                [class]="marcando() ? 'border-accent-400 bg-accent-400 text-primary-900' : ''"
                (click)="toggleMarca()"
                title="Marcar hallazgo sobre la imagen"
              >
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
              </button>
              @if (marcando()) {
                <select class="input w-28 py-1.5 text-xs" [(ngModel)]="piezaMarca" title="Pieza a marcar">
                  <option value="">Sin pieza</option>
                  @for (d of todasPiezas; track d) { <option [value]="d">{{ d }}</option> }
                </select>
              }
            }
            <!-- Descargar -->
            <a class="tool-btn" [href]="v.url" target="_blank" rel="noopener" title="Abrir archivo">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
            </a>
          </div>
        </div>

        @if (esVideo(v)) {
          <!-- Reproductor de video -->
          <div class="flex flex-1 items-center justify-center overflow-hidden p-4">
            <video [src]="v.url" controls autoplay class="max-h-full max-w-full rounded-xl shadow-2xl"></video>
          </div>
        } @else {
        <!-- Lienzo -->
        <div
          #visorEl
          class="relative flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
          (wheel)="onWheel($event)"
          (pointerdown)="iniDrag($event)"
          (pointermove)="moverDrag($event)"
          (pointerup)="finDrag($event)"
          (pointercancel)="finDrag($event)"
        >
          <div
            class="absolute left-1/2 top-1/2 origin-center will-change-transform"
            [style.transform]="transformImg()"
            (click)="clickImagen($event)"
          >
            <img
              #imgEl
              [src]="v.url"
              alt=""
              class="block max-w-none select-none"
              [style.width.px]="natural().w || undefined"
              draggable="false"
              (load)="onImgLoad($event)"
            />
            <!-- Marcadores de hallazgos -->
            @for (m of v.marcas ?? []; track $index; let i = $index) {
              <button
                class="absolute z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-red-500 text-[10px] font-extrabold text-white shadow-lg transition hover:scale-125"
                [style.left.%]="m.x * 100"
                [style.top.%]="m.y * 100"
                [style.transform]="'translate(-50%, -50%) scale(' + escalaInversa() + ')'"
                [title]="tooltipMarca(m)"
                (click)="quitarMarca(i, $event)"
              >
                {{ m.diente || '?' }}
              </button>
            }
          </div>

          @if (marcando()) {
            <div class="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-accent-400 px-5 py-2 text-xs font-extrabold text-primary-900 shadow-xl">
              Modo marca activo: pieza {{ piezaMarca || 'sin vincular' }} · haz clic sobre la imagen
            </div>
          } @else if (natural().w) {
            <div class="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-primary-900/80 px-4 py-1.5 text-[11px] text-primary-200">
              Rueda = zoom · arrastrar = mover · botón ⌖ = marcar hallazgo
            </div>
          }
        </div>
        }

        <!-- Pie del visor: lista de marcas -->
        @if (!esVideo(v) && v.marcas?.length) {
          <div class="max-h-32 overflow-y-auto border-t border-white/10 bg-primary-900 px-4 py-2.5">
            <div class="flex flex-wrap gap-2">
              @for (m of v.marcas!; track $index; let i = $index) {
                <span class="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] text-white">
                  <span class="h-2 w-2 rounded-full bg-red-400"></span>
                  {{ m.diente ? 'Pieza ' + m.diente : 'Hallazgo' }}
                  @if (m.nota) { · {{ m.nota }} }
                  <button class="ml-1 text-red-300 hover:text-red-400" (click)="quitarMarca(i, $event)">✕</button>
                </span>
              }
            </div>
          </div>
        }
      </div>
      }
    }
  `,
  styles: [
    `
      .tool-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.5rem;
        border-radius: 0.6rem;
        border: 1px solid rgba(255, 255, 255, 0.25);
        color: #fff;
        transition: all 0.15s;
      }
      .tool-btn:hover {
        border-color: #facc15;
        color: #facc15;
      }
    `,
  ],
})
export class PacienteDetalleComponent implements OnInit, OnDestroy {
  private dialog = inject(DialogService);
  private api = inject(ApiService);

  @Input({ required: true }) id!: string | number;

readonly tabs = [
    { id: 'resumen', etiqueta: 'Resumen' },
    { id: 'historial', etiqueta: 'Historial clínico' },
    { id: 'odontograma', etiqueta: 'Odontograma' },
    { id: 'examenes', etiqueta: 'Exámenes de imagen' },
    { id: 'piezas3d', etiqueta: 'Piezas 3D' },
  ];
  readonly todasPiezas = [
    18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
    48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
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

  tab = signal('resumen');
  paciente = signal<Paciente | null>(null);
  resumen = signal<PacienteResumen | null>(null);
historial = signal<HistorialNota[]>([]);
  planes = signal<Plan[]>([]);
  doctores = signal<Doctor[]>([]);
  piezas3d = signal<any[]>([]);
  cargandoPiezas3d = signal(false);

  guardandoNota = signal(false);
  notaOk = signal(false);
  notaForm: any = { doctor_id: null, motivo: '', diagnostico: '', tratamiento: '', indicaciones: '' };

  // --- Exámenes de imagen ---
  examenes = signal<ExamenImagen[]>([]);
  archivoSel = signal<File | null>(null);
  subiendo = signal(false);
  errorEx = signal<string | null>(null);
  formEx: any = { tipo: 'rx', titulo: '', diente: '', fecha: '', descripcion: '' };

  // --- Visor interactivo ---
  visor = signal<ExamenImagen | null>(null);
  zoom = signal(1);
  rot = signal(0);
  pan = signal({ x: 0, y: 0 });
  natural = signal({ w: 0, h: 0 });
  marcando = signal(false);
  piezaMarca = '';
  guardandoMarca = signal(false);
  private fit = 1;
  private arrastrando = false;
  private ultimoPunto: { x: number; y: number } | null = null;

  private visorEl = viewChild<ElementRef<HTMLDivElement>>('visorEl');
  private imgEl = viewChild<ElementRef<HTMLImageElement>>('imgEl');
  dicomSerie = signal<Record<number, string[]>>({});
  private archivoUrls = new Map<number, string>();

  ngOnInit(): void {
    this.cargar();
    this.api.doctores().subscribe((d) => {
      this.doctores.set(d);
      this.notaForm.doctor_id = d[0]?.id ?? null;
    });
    this.api.planes({ paciente_id: Number(this.id) }).subscribe((p) => this.planes.set(p));
  }

  cargar(): void {
    const pid = Number(this.id);
    this.api.paciente(pid).subscribe((p) => this.paciente.set(p));
    this.api.resumenPaciente(pid).subscribe((r) => this.resumen.set(r));
    this.api.historial(pid).subscribe((h) => this.historial.set(h));
    this.api.examenes(pid).subscribe((e) => {
      this.examenes.set(e);
      for (const examen of e) this.cargarArchivoSeguro(examen);
    });
    this.cargandoPiezas3d.set(true);
    this.api.historialDiseno3D(undefined, pid).subscribe({
      next: (d) => {
        this.piezas3d.set(d ?? []);
        this.cargandoPiezas3d.set(false);
      },
      error: () => this.cargandoPiezas3d.set(false),
    });
  }

  // --- Historial ---
  guardarNota(): void {
    this.guardandoNota.set(true);
    this.api
      .agregarHistorial(Number(this.id), { ...this.notaForm, doctor_id: Number(this.notaForm.doctor_id) })
      .subscribe({
        next: () => {
          this.guardandoNota.set(false);
          this.notaOk.set(true);
          void this.dialog.success({ title: 'Evolución guardada', text: 'La nota clínica se agregó al historial.' });
          this.api.historial(Number(this.id)).subscribe((h) => this.historial.set(h));
          setTimeout(() => this.notaOk.set(false), 2500);
          this.notaForm = { ...this.notaForm, motivo: '', diagnostico: '', tratamiento: '', indicaciones: '' };
        },
        error: (e) => { this.guardandoNota.set(false); void this.dialog.apiError(e, 'No se pudo guardar la evolución clínica.'); },
      });
  }

clasePlan(estado: string): string {
    const mapa: Record<string, string> = {
      propuesto: 'bg-slate-100 text-slate-600',
      aprobado: 'bg-blue-100 text-blue-700',
      en_progreso: 'bg-amber-100 text-amber-700',
      completado: 'bg-emerald-100 text-emerald-700',
      rechazado: 'bg-red-100 text-red-600',
    };
    return mapa[estado] ?? 'bg-slate-100 text-slate-600';
  }

  // ================= Piezas 3D asignadas =================
  private nombresPieza: Record<string, string> = {
    molar: 'Molar',
    premolar: 'Premolar',
    canino: 'Canino',
    incisivo: 'Incisivo',
  };

  nombrePieza(clave: string): string {
    return this.nombresPieza[clave] ?? clave;
  }

  fmtFecha(iso?: string): string {
    if (!iso) return '—';
    const f = new Date(iso);
    return f.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // ================= Exámenes de imagen =================
  esVideo(ex: ExamenImagen): boolean {
    return (ex.mime ?? '').startsWith('video') || /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(ex.url);
  }

  esDicom(ex: ExamenImagen): boolean {
    return !this.esVolumen(ex) && !this.esSerieZip(ex) && ((ex.mime ?? '').toLowerCase().includes('dicom') || /\.(dcm|dicom|ima)(?:$|\?)/i.test(ex.url || ex.archivo));
  }

  esSerieZip(ex: ExamenImagen): boolean { return ex.formato_volumen === 'DICOM-ZIP' || !!ex.instancias_dicom?.length || /\.zip(?:$|\?)/i.test(ex.archivo || ex.url || ''); }

  esVolumen(ex: ExamenImagen): boolean {
    const nombre = `${ex.archivo || ''} ${ex.url || ''}`;
    return /\.(nii(?:\.gz)?|nrrd)(?:$|[?\s])/i.test(nombre) ||
      ex.formato_volumen === 'NIfTI' || ex.formato_volumen === 'NRRD';
  }

  formatoVolumen(ex: ExamenImagen): string {
    if (ex.formato_volumen) return ex.formato_volumen;
    const nombre = `${ex.archivo || ''} ${ex.url || ''}`;
    if (/\.nii\.gz(?:$|[?\s])/i.test(nombre)) return 'NIfTI.GZ';
    if (/\.nii(?:$|[?\s])/i.test(nombre)) return 'NIfTI';
    return /\.nrrd(?:$|\?)/i.test(nombre) ? 'NRRD' : 'NIfTI';
  }

  etiquetaVolumen(ex: ExamenImagen): string {
    const d = ex.dimensiones;
    return d?.x && d?.y && d?.z ? `${d.x} × ${d.y} × ${d.z} voxeles` : 'Volumen 3D';
  }

  volumenValido(ex: ExamenImagen): boolean {
    const nombre=ex.archivo || ex.url || '';
    if (/\.nii\.gz(?:$|[?\s])/i.test(nombre) || ex.formato_volumen === 'NIfTI.GZ') return ex.tamano >= 64;
    return (ex.dimensiones?.x || 0) > 1 && (ex.dimensiones?.y || 0) > 1 && (ex.dimensiones?.z || 0) > 1 && ex.tamano >= 64;
  }

  tipoInfo(tipo: string): { label: string; color: string } {
    return TIPOS_EXAMEN[tipo] ?? TIPOS_EXAMEN['otro'];
  }

  onArchivo(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.errorEx.set(null);
    if (file) {
      const esVideo = file.type.startsWith('video') || /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(file.name);
      const esZip = /\.zip$/i.test(file.name) || file.type.toLowerCase().includes('zip');
      const esDicom = /\.(dcm|dicom|ima)$/i.test(file.name) || file.type.toLowerCase().includes('dicom');
      const esVolumen = /\.(nii(?:\.gz)?|nrrd)$/i.test(file.name);
      const limite = esVideo ? 200 * 1024 * 1024 : esZip ? 1024 * 1024 * 1024 : esDicom ? 512 * 1024 * 1024 : esVolumen ? 1024 * 1024 * 1024 : 15 * 1024 * 1024;
      // No bloqueamos por tamaño en cliente: .nii.gz puede tener cabecera corta;
      // el servidor descomprime y valida cabecera, dimensiones y voxeles reales.
      if (esVolumen) {
        if (file.name.toLowerCase().endsWith('.nrrd')) this.formEx.tipo = this.formEx.tipo === 'resonancia' ? 'resonancia' : 'tomografia';
        else if (!['tomografia','resonancia'].includes(this.formEx.tipo)) this.formEx.tipo = 'tomografia';
      }
      if (esZip) this.formEx.tipo = 'resonancia';
      if (file.size > limite) {
        this.errorEx.set(esVideo ? 'El video supera los 200 MB.' : (esDicom || esZip) ? 'El estudio DICOM supera 1 GB.' : esVolumen ? 'El volumen supera 1 GB.' : 'La imagen supera los 15 MB.');
        this.archivoSel.set(null);
        return;
      }
      if (esVideo && this.formEx.tipo !== 'video') this.formEx.tipo = 'video';
      if (esDicom && !['tomografia', 'resonancia'].includes(this.formEx.tipo)) this.formEx.tipo = 'tomografia';
      if (!esVideo && this.formEx.tipo === 'video') this.formEx.tipo = 'rx';
    }
    this.archivoSel.set(file);
    if (file && !this.formEx.titulo) {
      this.formEx.titulo = file.name.replace(/\.[^.]+$/, '');
    }
  }

  subirExamen(): void {
    const file = this.archivoSel();
    if (!file) {
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
    if (this.formEx.fecha) fd.append('fecha', this.formEx.fecha);
    if (this.formEx.descripcion) fd.append('descripcion', this.formEx.descripcion);

    this.api.subirExamen(Number(this.id), fd).subscribe({
      next: (ex) => {
        this.examenes.set([ex, ...this.examenes()]);
        this.cargarArchivoSeguro(ex);
        this.subiendo.set(false);
        void this.dialog.success({ title: ex.tipo === 'tomografia' ? 'Tomografía agregada' : 'Examen agregado', text: `${ex.titulo} se guardó y validó correctamente.` });
        this.archivoSel.set(null);
        this.formEx = { tipo: 'rx', titulo: '', diente: '', fecha: '', descripcion: '' };
        const input = document.querySelector<HTMLInputElement>('input[type="file"]');
        if (input) input.value = '';
      },
      error: (e) => {
        this.subiendo.set(false);
        this.archivoSel.set(null);
        const detalle = e?.error?.detail || e?.message || `HTTP ${e?.status || 'sin conexión'}`;
        this.errorEx.set(`No se pudo subir “${file.name}” (${file.size} bytes). Motivo: ${detalle}`);
        void this.dialog.apiError(e, `No se pudo subir “${file.name}”.`);
      },
    });
  }

  async eliminarExamen(ex: ExamenImagen): Promise<void> {
    if (!await this.dialog.confirm({ title: '¿Eliminar examen?', text: `Se eliminará "${ex.titulo}" de la ficha del paciente.`, confirmText: 'Eliminar', danger: true })) return;
    this.api.eliminarExamen(Number(this.id), ex.id).subscribe({
      next: () => { const url = this.archivoUrls.get(ex.id); if (url) URL.revokeObjectURL(url); this.archivoUrls.delete(ex.id); this.examenes.set(this.examenes().filter((x) => x.id !== ex.id)); void this.dialog.success({ title: 'Examen eliminado' }); },
      error: e => { void this.dialog.apiError(e, 'No se pudo eliminar el examen.'); },
    });
  }

  // ================= Visor interactivo =================
  urlArchivo(ex: ExamenImagen): string { return this.archivoUrls.get(ex.id) ?? ''; }

  descargarDiseno(id: number): void {
    this.api.archivoDiseno3D(id).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `diseno-${id}.stl`; a.click(); URL.revokeObjectURL(url);
    });
  }

  private cargarArchivoSeguro(ex: ExamenImagen): void {
    if (this.archivoUrls.has(ex.id)) return;
    this.api.archivoExamen(Number(this.id), ex.id, ex.archivo).subscribe({
      next: blob => {
        if (!blob.size) return;
        this.archivoUrls.set(ex.id, URL.createObjectURL(blob));
      },
      error: () => { /* el endpoint aplica el control de acceso; no exponer URL directa */ },
    });
  }

  ngOnDestroy(): void {
    for (const url of this.archivoUrls.values()) URL.revokeObjectURL(url);
    this.archivoUrls.clear();
    for (const urls of Object.values(this.dicomSerie())) urls.forEach(URL.revokeObjectURL);
  }

  abrirVisor(ex: ExamenImagen): void {
    if (this.esVolumen(ex) && !this.volumenValido(ex)) {
      void this.dialog.warning({ title: 'Volumen no válido', text: `El archivo ${ex.archivo} no contiene un volumen 3D válido. Tamaño registrado: ${ex.tamano} bytes. El archivo original no se ha modificado; elimina este registro de prueba y vuelve a subir un NRRD/NIfTI válido.` });
      return;
    }
    if (this.esSerieZip(ex) && !this.dicomSerie()[ex.id]) {
      this.api.serieDICOM(Number(this.id), ex.id).subscribe({
        next: r => {
          if (!r.instancias.length) { void this.dialog.warning({ title: 'Serie DICOM vacía', text: 'El ZIP no contiene cortes DICOM para mostrar.' }); return; }
          const urls: string[] = [];
          for (const instancia of r.instancias) {
            const nombre = instancia.url.split('/').pop() || '';
            this.api.archivoExamen(Number(this.id), ex.id, nombre).subscribe(blob => {
              urls.push(URL.createObjectURL(blob));
              if (urls.length === r.instancias.length) {
                this.dicomSerie.update(x => ({ ...x, [ex.id]: [...urls] }));
                this.visor.set({ ...ex, formato_volumen: 'DICOM-ZIP', tipo: ex.tipo === 'tomografia' ? 'tomografia' : 'resonancia' });
              }
            });
          }
          return;
        },
        error: e => { void this.dialog.apiError(e, 'No se pudo leer la serie DICOM del ZIP.'); },
      });
      return;
    }
    this.visor.set(ex);
    this.zoom.set(1);
    this.rot.set(0);
    this.pan.set({ x: 0, y: 0 });
    this.natural.set({ w: 0, h: 0 });
    this.marcando.set(false);
    this.fit = 1;
  }

  cerrarVisor(): void {
    this.visor.set(null);
    this.marcando.set(false);
  }

  onImgLoad(e: Event): void {
    const img = e.target as HTMLImageElement;
    this.natural.set({ w: img.naturalWidth, h: img.naturalHeight });
    this.calcularFit();
  }

  private calcularFit(): void {
    const el = this.visorEl()?.nativeElement;
    const n = this.natural();
    if (!el || !n.w || !n.h) return;
    const r = el.getBoundingClientRect();
    this.fit = Math.max(Math.min((r.width - 48) / n.w, (r.height - 48) / n.h), 0.03);
  }

  transformImg(): string {
    const { x, y } = this.pan();
    const escala = this.fit * this.zoom();
    return `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${this.rot()}deg) scale(${escala})`;
  }

  escalaInversa(): number {
    return 1 / Math.max(this.fit * this.zoom(), 0.0001);
  }

  zoomPor(factor: number): void {
    this.zoom.set(Math.min(Math.max(this.zoom() * factor, 0.25), 8));
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoomPor(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }

  rotar(): void {
    this.rot.set((this.rot() + 90) % 360);
  }

  ajustar(): void {
    this.zoom.set(1);
    this.rot.set(0);
    this.pan.set({ x: 0, y: 0 });
    this.calcularFit();
  }

  // Arrastre (pan)
  iniDrag(e: PointerEvent): void {
    if (this.marcando()) return;
    this.arrastrando = true;
    this.ultimoPunto = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  moverDrag(e: PointerEvent): void {
    if (!this.arrastrando || !this.ultimoPunto) return;
    const dx = e.clientX - this.ultimoPunto.x;
    const dy = e.clientY - this.ultimoPunto.y;
    this.ultimoPunto = { x: e.clientX, y: e.clientY };
    this.pan.set({ x: this.pan().x + dx, y: this.pan().y + dy });
  }

  finDrag(_e?: Event): void {
    this.arrastrando = false;
    this.ultimoPunto = null;
  }

  // Marcadores de hallazgos
  toggleMarca(): void {
    const activar = !this.marcando();
    this.marcando.set(activar);
    if (activar) {
      // El posicionamiento exacto de marcas requiere rotación 0
      this.rot.set(0);
      if (!this.piezaMarca) this.piezaMarca = '';
    }
  }

  clickImagen(e: MouseEvent): void {
    if (!this.marcando()) return;
    const img = this.imgEl()?.nativeElement;
    const v = this.visor();
    if (!img || !v) return;

    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let fx = (e.clientX - r.left) / r.width;
    let fy = (e.clientY - r.top) / r.height;
    if (this.rot() === 180) {
      fx = 1 - fx;
      fy = 1 - fy;
    }
    fx = Math.min(Math.max(fx, 0), 1);
    fy = Math.min(Math.max(fy, 0), 1);

    const marca: ExamenMarca = { x: fx, y: fy, diente: this.piezaMarca || null, nota: null };
    const marcas = [...(v.marcas ?? []), marca];
    this.visor.set({ ...v, marcas });
    this.sincronizarMarcas(marcas);
  }

  async quitarMarca(index: number, e: Event): Promise<void> {
    e.stopPropagation();
    const v = this.visor();
    if (!v) return;
    if (!await this.dialog.confirm({ title: '¿Eliminar marca?', text: 'La marca se quitará del examen.', confirmText: 'Eliminar', danger: true })) return;
    const marcas = (v.marcas ?? []).filter((_, i) => i !== index);
    this.visor.set({ ...v, marcas });
    this.sincronizarMarcas(marcas);
  }

  tooltipMarca(m: ExamenMarca): string {
    if (m.nota) return `${m.diente ? 'Pieza ' + m.diente + ' — ' : ''}${m.nota}`;
    return m.diente ? `Pieza ${m.diente}` : 'Hallazgo';
  }

  private sincronizarMarcas(marcas: ExamenMarca[]): void {
    const v = this.visor();
    if (!v) return;
    this.guardandoMarca.set(true);
    this.api.actualizarExamen(Number(this.id), v.id, { marcas }).subscribe({
      next: (actualizado) => {
        this.visor.set({ ...v, ...actualizado, marcas });
        this.examenes.set(this.examenes().map((x) => (x.id === actualizado.id ? { ...x, marcas } : x)));
        this.guardandoMarca.set(false);
      },
      error: () => {
        this.guardandoMarca.set(false);
        void this.dialog.apiError(null, 'No se pudieron guardar las marcas.');
      },
    });
  }
}
