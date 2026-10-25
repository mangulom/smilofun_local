import { Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { NoShow, PacienteRiesgo, Prediccion, Recomendacion, ResumenIA } from '../../core/models';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const CLASE_RIESGO: Record<string, string> = {
  alto: 'bg-red-100 text-red-700 border-red-200',
  medio: 'bg-amber-100 text-amber-700 border-amber-200',
  bajo: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const COLOR_RIESGO: Record<string, string> = {
  alto: 'bg-red-500',
  medio: 'bg-amber-400',
  bajo: 'bg-emerald-500',
};

const TIPO_LABEL: Record<string, string> = {
  no_show: 'No-show',
  ingreso: 'Ingreso proyectado',
  riesgo: 'Riesgo dental',
  recomendacion: 'Recomendación',
};

@Component({
  selector: 'app-ia',
  imports: [FormsModule, CurrencyPipe, DatePipe, DecimalPipe, PercentPipe],
  template: `
    <div class="space-y-5">
      <!-- ============================ Cabecera ============================ -->
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Inteligencia artificial</h1>
          <p class="text-sm text-slate-500">
            Predicción de inasistencia (no-show), riesgo dental por paciente, proyección de ingresos y recomendaciones operativas.
          </p>
          @if (resumen(); as r) {
            <p class="mt-1 text-[11px] text-slate-400">Resumen generado {{ r.generado_en | date: 'dd/MM/yy HH:mm' }} · {{ r.total_pacientes_evaluados }} pacientes en base</p>
          }
        </div>
        <div class="flex gap-2">
          <button class="btn-ghost" type="button" (click)="cargar()" [disabled]="cargando()">
            {{ cargando() ? 'Actualizando…' : '⟳ Actualizar' }}
          </button>
          <button class="btn-primary" type="button" [disabled]="entrenando()" (click)="reentrenar()">
            {{ entrenando() ? 'Re-entrenando…' : '↻ Re-entrenar modelos' }}
          </button>
        </div>
      </div>

      @if (resumen(); as r) {
        <!-- ============================ KPIs ============================ -->
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div class="card p-4 border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50 to-white">
            <p class="label">Precisión modelo no-show</p>
            <p class="text-3xl font-extrabold text-blue-700">
              {{ r.metricas_modelo['accuracy'] != null ? (r.metricas_modelo['accuracy'] | percent: '1.1-1') : 'Reglas' }}
            </p>
            <p class="mt-1 text-xs text-slate-500">
              {{ r.metricas_modelo['modelo'] }} · {{ r.metricas_modelo['muestras'] }} muestras de entrenamiento
            </p>
          </div>
          <div class="card p-4 border-l-4 border-l-sky-500 bg-gradient-to-br from-sky-50 to-white">
            <p class="label">Citas analizadas (14 días)</p>
            <p class="text-3xl font-extrabold text-sky-700">{{ noShow().length }}</p>
            <p class="mt-1 text-xs text-slate-500">{{ dist().alto }} riesgo alto · {{ dist().medio }} medio · {{ dist().bajo }} bajo</p>
          </div>
          <div class="card p-4 border-l-4 border-l-orange-500 bg-gradient-to-br from-orange-50 to-white">
            <p class="label">Pacientes en riesgo dental</p>
            <p class="text-3xl font-extrabold text-orange-600">{{ riesgoPac().length }}</p>
            <p class="mt-1 text-xs text-slate-500">score máximo {{ scoreMax() | number: '1.0-0' }}/100 · {{ riesgoAltoPac() }} en nivel alto</p>
          </div>
          <div class="card p-4 border-l-4 border-l-green-500 bg-gradient-to-br from-green-50 to-white">
            <p class="label">Ingresos proyectados (próx. mes)</p>
            <p class="text-3xl font-extrabold text-green-700">{{ proxMes() | currency: 'S/':'symbol':'1.0-0' }}</p>
            <p class="mt-1 text-xs text-slate-500">tendencia {{ tendenciaProy() }} · confianza {{ confianzaProy() | percent: '1.0-0' }}</p>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div class="card p-4">
            <p class="label">Pacientes evaluados</p>
            <p class="text-2xl font-extrabold text-slate-700">{{ r.total_pacientes_evaluados }}</p>
            <p class="mt-1 text-xs text-slate-400">cruce de odontograma, citas y facturación</p>
          </div>
          <div class="card p-4">
            <p class="label">Recomendaciones activas</p>
            <p class="text-2xl font-extrabold text-slate-700">{{ recs().length }}</p>
            <p class="mt-1 text-xs text-slate-400">{{ recsAlta() }} de prioridad alta</p>
          </div>
          <div class="card p-4">
            <p class="label">Por cobrar (saldo parcial)</p>
            <p class="text-2xl font-extrabold text-slate-700">{{ cobrarPendiente() | currency: 'S/':'symbol':'1.0-0' }}</p>
            <p class="mt-1 text-xs text-slate-400">detectado en {{ facturasPendientes() }} factura(s)</p>
          </div>
          <div class="card p-4">
            <p class="label">Predicciones históricas</p>
            <p class="text-2xl font-extrabold text-slate-700">{{ hist().length }}</p>
            <p class="mt-1 text-xs text-slate-400">registradas en la tabla predicciones_ia</p>
          </div>
        </div>

        <!-- ====================== Modelo: cómo funciona ====================== -->
        <div class="card p-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-bold text-slate-800">⚙️ Cómo funciona el modelo</h2>
            <span class="badge bg-blue-100 text-blue-700">{{ r.metricas_modelo['modelo'] }}</span>
          </div>
          <div class="grid gap-5 lg:grid-cols-3">
            <div>
              <p class="label">Métricas de entrenamiento</p>
              <ul class="space-y-1.5 text-sm text-slate-600">
                <li class="flex justify-between border-b border-slate-100 pb-1"><span>Método</span><b>{{ modeloNombre() }}</b></li>
                <li class="flex justify-between border-b border-slate-100 pb-1"><span>Muestras</span><b>{{ r.metricas_modelo['muestras'] }}</b></li>
                <li class="flex justify-between border-b border-slate-100 pb-1"><span>Precisión (hold-out 25%)</span><b>{{ r.metricas_modelo['accuracy'] != null ? (r.metricas_modelo['accuracy'] | percent: '1.1-1') : '—' }}</b></li>
                <li class="flex justify-between"><span>Último entrenamiento</span><b>{{ fechaEntreno() }}</b></li>
              </ul>
              @if (r.metricas_modelo['accuracy'] != null) {
                <div class="mt-3 h-3 w-full rounded-full bg-slate-100">
                  <div class="h-3 rounded-full bg-gradient-to-r from-blue-600 to-blue-400" [style.width.%]="r.metricas_modelo['accuracy'] * 100"></div>
                </div>
              }
            </div>
            <div>
              <p class="label">Variables del modelo ({{ features().length }})</p>
              <div class="flex flex-wrap gap-1.5">
                @for (f of features(); track f) {
                  <span class="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">{{ f }}</span>
                }
              </div>
              <p class="mt-3 text-xs leading-relaxed text-slate-500">
                Regresión logística con peso de clase balanceado sobre citas históricas completadas y no asistidas;
                si hay menos de 20 muestras se aplica un motor de reglas determinista.
              </p>
            </div>
            <div>
              <p class="label">Interpretación</p>
              <ul class="space-y-1 text-xs leading-relaxed text-slate-600">
                <li>• <b>Probabilidad ≥ 50 %</b> → riesgo alto: confirmar por teléfono.</li>
                <li>• <b>25 – 49 %</b> → riesgo medio: recordatorio 48 h antes.</li>
                <li>• <b>&lt; 25 %</b> → riesgo bajo: recordatorio estándar.</li>
                <li>• El riesgo dental suma caries, piezas ausentes, restauraciones, antigüedad de la última visita e inasistencia histórica.</li>
                <li>• La proyección de ingresos usa regresión lineal sobre los últimos 12 meses facturados.</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- ====================== No-show ====================== -->
        <div class="card p-5">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 class="font-bold text-slate-800">⚠️ Riesgo de inasistencia (no-show) · próximos 14 días</h2>
            <div class="flex flex-wrap gap-1.5">
              <button type="button" class="rounded-full border px-3 py-1 text-xs font-bold transition" [class]="filtro() === 'todos' ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-primary-300'" (click)="filtro.set('todos')">Todos ({{ noShow().length }})</button>
              <button type="button" class="rounded-full border px-3 py-1 text-xs font-bold transition" [class]="filtro() === 'alto' ? 'border-red-500 bg-red-500 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-red-300'" (click)="filtro.set('alto')">Alto ({{ dist().alto }})</button>
              <button type="button" class="rounded-full border px-3 py-1 text-xs font-bold transition" [class]="filtro() === 'medio' ? 'border-amber-400 bg-amber-400 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-amber-300'" (click)="filtro.set('medio')">Medio ({{ dist().medio }})</button>
              <button type="button" class="rounded-full border px-3 py-1 text-xs font-bold transition" [class]="filtro() === 'bajo' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-300'" (click)="filtro.set('bajo')">Bajo ({{ dist().bajo }})</button>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-100">
              <thead class="bg-slate-50">
                <tr>
                  <th class="th">Paciente</th>
                  <th class="th">Día</th>
                  <th class="th">Cita</th>
                  <th class="th">En</th>
                  <th class="th text-center">Probabilidad</th>
                  <th class="th text-center">Riesgo</th>
                  <th class="th">Factores principales</th>
                  <th class="th"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (n of noShowFiltrado(); track n.cita_id) {
                  <tr class="cursor-pointer transition hover:bg-accent-50/50" (click)="abrirDetalle(n)">
                    <td class="td font-semibold text-slate-800">
                      <button type="button" class="text-left hover:text-primary-700 hover:underline" (click)="irPaciente(n, $event)">{{ n.paciente }}</button>
                    </td>
                    <td class="td text-xs font-semibold uppercase text-slate-500">{{ diaSemana(n.fecha) }}</td>
                    <td class="td text-xs text-slate-500">{{ n.fecha | date: 'dd/MM' }} · {{ n.hora }}</td>
                    <td class="td text-xs text-slate-400">{{ diasPara(n.fecha) }} d</td>
                    <td class="td">
                      <div class="flex items-center justify-center gap-2">
                        <div class="h-2 w-24 rounded-full bg-slate-100">
                          <div class="h-2 rounded-full" [class]="COLOR[n.riesgo]" [style.width.%]="n.probabilidad * 100"></div>
                        </div>
                        <span class="text-xs font-extrabold text-slate-700">{{ n.probabilidad | percent: '1.0-0' }}</span>
                      </div>
                    </td>
                    <td class="td text-center"><span class="badge border" [class]="CLASE[n.riesgo]">{{ n.riesgo }}</span></td>
                    <td class="td max-w-[260px] truncate text-xs text-slate-500" [title]="n.factores.join(' · ')">{{ n.factores.slice(0, 2).join(' · ') }}@if (n.factores.length > 2) { … +{{ n.factores.length - 2 }} }</td>
                    <td class="td text-right">
                      <span class="text-xs font-bold text-primary-600">Ver detalle →</span>
                    </td>
                  </tr>
                } @empty {
                  <tr><td class="td py-8 text-center text-slate-400" colspan="8">Sin citas en este filtro para los próximos 14 días.</td></tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Distribución -->
          <div class="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
            <div>
              <div class="mb-1 flex justify-between text-xs"><span class="font-semibold text-red-600">Riesgo alto</span><b>{{ dist().alto }}</b></div>
              <div class="h-2.5 rounded-full bg-slate-100"><div class="h-2.5 rounded-full bg-red-500" [style.width.%]="pctRiesgo(dist().alto)"></div></div>
            </div>
            <div>
              <div class="mb-1 flex justify-between text-xs"><span class="font-semibold text-amber-600">Riesgo medio</span><b>{{ dist().medio }}</b></div>
              <div class="h-2.5 rounded-full bg-slate-100"><div class="h-2.5 rounded-full bg-amber-400" [style.width.%]="pctRiesgo(dist().medio)"></div></div>
            </div>
            <div>
              <div class="mb-1 flex justify-between text-xs"><span class="font-semibold text-emerald-600">Riesgo bajo</span><b>{{ dist().bajo }}</b></div>
              <div class="h-2.5 rounded-full bg-slate-100"><div class="h-2.5 rounded-full bg-emerald-500" [style.width.%]="pctRiesgo(dist().bajo)"></div></div>
            </div>
          </div>
        </div>

        <div class="grid gap-6 xl:grid-cols-2">
          <!-- Proyección -->
          <div class="card p-5">
            <div class="mb-4 flex items-center justify-between gap-2">
              <h2 class="font-bold text-slate-800">📈 Proyección de ingresos (12 meses)</h2>
              <span class="badge" [class]="tendenciaProy() === 'creciente' ? 'bg-emerald-100 text-emerald-700' : tendenciaProy() === 'decreciente' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'">{{ tendenciaProy() }}</span>
            </div>
            <div class="space-y-3">
              @for (p of proyecciones(); track p.mes) {
                <div class="group cursor-default">
                  <div class="mb-1 flex justify-between text-sm">
                    <span class="font-semibold text-slate-700">{{ p.mes }} · confianza {{ p.confianza | percent: '1.0-0' }}</span>
                    <span class="font-extrabold text-blue-700">{{ p.proyectado | currency: 'S/':'symbol':'1.0-0' }}</span>
                  </div>
                  <div class="h-3 rounded-full bg-slate-100">
                    <div class="h-3 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all" [style.width.%]="barraProyeccion(p.proyectado)"></div>
                  </div>
                </div>
              } @empty {
                <p class="py-6 text-center text-sm text-slate-400">Sin proyección disponible.</p>
              }
            </div>
            <p class="mt-4 text-xs text-slate-400">Regresión lineal sobre la serie histórica de facturación (12 meses). La confianza es el R² de la recta ajustada.</p>
          </div>

          <!-- Riesgo dental -->
          <div class="card p-5">
            <div class="mb-4 flex items-center justify-between gap-2">
              <h2 class="font-bold text-slate-800">🦷 Pacientes con riesgo dental</h2>
              <span class="text-xs text-slate-400">clic para abrir la ficha</span>
            </div>
            <ul class="max-h-[360px] divide-y divide-slate-50 overflow-y-auto pr-1">
              @for (p of riesgoPac(); track p.paciente_id) {
                <li>
                  <button type="button" class="flex w-full items-center justify-between gap-3 py-2.5 text-left transition hover:bg-accent-50/50" (click)="router.navigate(['/pacientes', p.paciente_id])">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-semibold text-slate-700">{{ p.nombre }}</p>
                      <p class="truncate text-xs text-slate-400" [title]="p.motivos.join(' · ')">{{ p.motivos.join(' · ') }}</p>
                      <div class="mt-1 h-1.5 w-40 rounded-full bg-slate-100">
                        <div class="h-1.5 rounded-full" [class]="COLOR[p.riesgo]" [style.width.%]="p.score"></div>
                      </div>
                    </div>
                    <span class="shrink-0 text-right">
                      <span class="badge border" [class]="CLASE[p.riesgo]">{{ p.riesgo }}</span>
                      <span class="mt-1 block text-xs font-extrabold text-slate-600">{{ p.score | number: '1.0-0' }}/100</span>
                    </span>
                  </button>
                </li>
              } @empty {
                <li class="py-8 text-center text-sm text-slate-400">Sin pacientes en riesgo.</li>
              }
            </ul>
          </div>
        </div>

        <!-- Recomendaciones -->
        <div class="card p-5">
          <div class="mb-4 flex items-center justify-between gap-2">
            <h2 class="font-bold text-slate-800">💡 Recomendaciones del sistema</h2>
            <span class="text-xs text-slate-400">cada tarjeta lleva a su módulo</span>
          </div>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            @for (rec of recs(); track $index) {
              <div class="flex flex-col rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                <div class="flex items-start justify-between gap-2">
                  <p class="text-sm font-bold text-blue-800">{{ rec.titulo }}</p>
                  <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" [class]="rec.prioridad === 'alta' ? 'bg-red-100 text-red-600' : rec.prioridad === 'media' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'">{{ rec.prioridad }}</span>
                </div>
                <p class="mt-1 flex-1 text-xs leading-relaxed text-slate-600">{{ rec.descripcion }}</p>
                <button
                  type="button"
                  class="mt-3 flex items-center justify-center gap-1 rounded-lg border border-primary-300 bg-white px-3 py-1.5 text-xs font-bold text-primary-700 transition hover:border-primary-500 hover:bg-primary-600 hover:text-white disabled:opacity-50"
                  [disabled]="!rutaRecomendacion(rec)"
                  (click)="irRecomendacion(rec)"
                >
                  {{ rec.accion || 'Ver detalle' }} →
                </button>
              </div>
            } @empty {
              <p class="text-sm text-slate-400">Sin recomendaciones por el momento.</p>
            }
          </div>
        </div>

        <!-- Historial de predicciones -->
        <div class="card p-5">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 class="font-bold text-slate-800">🗂️ Historial de predicciones guardadas</h2>
            <select class="input w-40 py-1.5 text-xs" [ngModel]="limiteHist()" (ngModelChange)="cargarHist($event)">
              <option [value]="20">Últimas 20</option>
              <option [value]="50">Últimas 50</option>
              <option [value]="100">Últimas 100</option>
            </select>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-100">
              <thead class="bg-slate-50">
                <tr>
                  <th class="th">Tipo</th>
                  <th class="th">Generada</th>
                  <th class="th">Fecha objeto</th>
                  <th class="th">Entidad</th>
                  <th class="th text-center">Probabilidad</th>
                  <th class="th text-center">Clasificación</th>
                  <th class="th">Detalle</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (p of hist(); track p.id) {
                  <tr class="hover:bg-slate-50">
                    <td class="td text-xs font-semibold text-slate-700">{{ tipoLabel(p.tipo) }}</td>
                    <td class="td text-xs text-slate-500">{{ p.fecha_generacion | date: 'dd/MM/yy HH:mm' }}</td>
                    <td class="td text-xs text-slate-500">{{ p.fecha_objeto ? (p.fecha_objeto | date: 'dd/MM/yy') : '—' }}</td>
                    <td class="td text-xs text-slate-500">
                      {{ p.entidad_tipo }} {{ p.entidad_id ? '#' + p.entidad_id : '' }}
                      @if (p.paciente_id) {
                        <button
                          type="button"
                          class="ml-1.5 rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-bold text-primary-700 hover:bg-primary-100"
                          title="Ver ficha del paciente"
                          (click)="router.navigate(['/pacientes', p.paciente_id])"
                        >Ficha</button>
                      }
                    </td>
                    <td class="td text-center text-xs font-bold text-slate-700">{{ p.probabilidad != null ? (p.probabilidad | percent: '1.0-0') : '—' }}</td>
                    <td class="td text-center">
                      @if (p.clasificacion) {
                        <span class="badge border" [class]="CLASE[p.clasificacion] || 'bg-slate-100 text-slate-600'">{{ p.clasificacion }}</span>
                      } @else { — }
                    </td>
                    <td class="td max-w-[320px] truncate text-xs text-slate-500" [title]="resumenPrediccion(p)">{{ resumenPrediccion(p) }}</td>
                  </tr>
                } @empty {
                  <tr><td class="td py-8 text-center text-slate-400" colspan="7">Aún no hay predicciones guardadas: se registran al consultar una cita o al re-entrenar.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      } @else {
        <div class="card flex h-48 items-center justify-center text-sm text-slate-400">
          @if (error()) {
            <span class="font-medium text-red-500">{{ error() }}</span>
          } @else {
            Cargando resumen de IA…
          }
        </div>
      }
    </div>

    <!-- ==================== Modal detalle no-show ==================== -->
    @if (detalle(); as d) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" (click)="cerrarDetalle()">
        <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" (click)="$event.stopPropagation()">
          <div class="mb-4 flex items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-wide text-slate-400">Predicción de inasistencia</p>
              <h3 class="text-xl font-extrabold text-slate-800">{{ d.paciente }}</h3>
              <p class="text-sm text-slate-500">{{ diaSemana(d.fecha) }} {{ d.fecha | date: 'dd/MM/yyyy' }} · {{ d.hora }} · en {{ diasPara(d.fecha) }} día(s) · cita #{{ d.cita_id }}</p>
            </div>
            <span class="badge border text-sm" [class]="CLASE[d.riesgo]">riesgo {{ d.riesgo }}</span>
          </div>

          <div class="mb-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-semibold text-slate-600">Probabilidad de inasistencia</span>
              <span class="text-2xl font-extrabold" [class]="d.riesgo === 'alto' ? 'text-red-600' : d.riesgo === 'medio' ? 'text-amber-500' : 'text-emerald-600'">{{ d.probabilidad | percent: '1.0-0' }}</span>
            </div>
            <div class="h-4 w-full rounded-full bg-white">
              <div class="h-4 rounded-full" [class]="COLOR[d.riesgo]" [style.width.%]="d.probabilidad * 100"></div>
            </div>
          </div>

          <p class="label">Factores detectados ({{ d.factores.length }})</p>
          <ul class="mb-4 space-y-1.5">
            @for (f of d.factores; track $index) {
              <li class="flex items-start gap-2 text-sm text-slate-600">
                <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"></span>{{ f }}
              </li>
            } @empty {
              <li class="text-sm text-slate-400">Sin factores relevantes: cita de bajo riesgo.</li>
            }
          </ul>

          <div class="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p class="text-xs font-bold uppercase tracking-wide text-blue-600">Recomendación</p>
            <p class="mt-1 text-sm font-semibold text-slate-700">{{ d.recomendacion }}</p>
          </div>

          <div class="flex flex-wrap justify-end gap-2">
            <button class="btn-ghost" type="button" (click)="cerrarDetalle()">Cerrar</button>
            <button class="btn-ghost" type="button" (click)="router.navigate(['/citas']); cerrarDetalle()">Ver agenda</button>
            <button class="btn-primary" type="button" (click)="router.navigate(['/pacientes', d.paciente_id]); cerrarDetalle()">Ver ficha del paciente</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class IaComponent {
  api = inject(ApiService);
  router = inject(Router);
  empresa = inject(EmpresaService);

  readonly CLASE = CLASE_RIESGO;
  readonly COLOR = COLOR_RIESGO;

  resumen = signal<ResumenIA | null>(null);
  noShow = signal<NoShow[]>([]);
  riesgoPac = signal<PacienteRiesgo[]>([]);
  recs = signal<Recomendacion[]>([]);
  proyecciones = signal<{ mes: string; proyectado: number; confianza: number; tendencia: string }[]>([]);
  hist = signal<Prediccion[]>([]);
  filtro = signal<'todos' | 'alto' | 'medio' | 'bajo'>('todos');
  detalle = signal<NoShow | null>(null);
  limiteHist = signal(50);
  cargando = signal(false);
  entrenando = signal(false);
  error = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.empresa.actualId();
      this.cargar();
    });
  }

  cargar(): void {
    const emp = this.empresa.actualId();
    this.cargando.set(true);
    this.error.set(null);
    this.api.resumenIA(emp).subscribe({
      next: (r) => {
        this.resumen.set(r);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el resumen de IA.');
        this.cargando.set(false);
      },
    });
    this.api.noShow({ dias: 14, empresa_id: emp }).subscribe((lista) => this.noShow.set(lista as NoShow[]));
    this.api.pacientesRiesgo(50, emp).subscribe((lista) => this.riesgoPac.set(lista as PacienteRiesgo[]));
    this.api.recomendacionesIA(30, emp).subscribe((lista) => this.recs.set(lista as Recomendacion[]));
    this.api.proyeccionIngresos(12, emp).subscribe((r: any) => {
      this.proyecciones.set(r?.proyecciones ?? []);
    });
    this.cargarHist(this.limiteHist());
  }

  cargarHist(limite: number): void {
    this.limiteHist.set(Number(limite));
    this.api.prediccionesIA(this.limiteHist()).subscribe((lista) => this.hist.set(lista));
  }

  reentrenar(): void {
    this.entrenando.set(true);
    this.api.entrenarIA(this.empresa.actualId()).subscribe({
      next: () => {
        this.cargar();
        this.entrenando.set(false);
      },
      error: () => this.entrenando.set(false),
    });
  }

  // ---------------------------------------------------------------- clics
  abrirDetalle(n: NoShow): void {
    this.detalle.set(n);
  }

  cerrarDetalle(): void {
    this.detalle.set(null);
  }

  irPaciente(n: NoShow, e?: Event): void {
    e?.stopPropagation();
    if (n.paciente_id) this.router.navigate(['/pacientes', n.paciente_id]);
  }

  rutaRecomendacion(rec: Recomendacion): string | null {
    switch (rec.tipo) {
      case 'stock_bajo':
      case 'vencimientos':
        return '/inventario';
      case 'cobranza':
        return '/facturacion';
      case 'confirmaciones':
        return '/citas';
      case 'planes_pendientes':
        return '/tratamientos';
      case 'recall_pacientes':
        return '/pacientes';
      default:
        return null;
    }
  }

  irRecomendacion(rec: Recomendacion): void {
    const ruta = this.rutaRecomendacion(rec);
    if (ruta) this.router.navigate([ruta]);
  }

  // ------------------------------------------------------------ computed
  noShowFiltrado = computed(() => {
    const f = this.filtro();
    const lista = this.noShow();
    return f === 'todos' ? lista : lista.filter((n) => n.riesgo === f);
  });

  dist = computed(() => {
    const l = this.noShow();
    return {
      alto: l.filter((n) => n.riesgo === 'alto').length,
      medio: l.filter((n) => n.riesgo === 'medio').length,
      bajo: l.filter((n) => n.riesgo === 'bajo').length,
    };
  });

  proxMes(): number {
    const r = this.resumen();
    return r && r.proyeccion_ingresos.length > 0 ? r.proyeccion_ingresos[0].proyectado : 0;
  }

  scoreMax(): number {
    return this.riesgoPac().reduce((m, p) => Math.max(m, p.score), 0);
  }

  riesgoAltoPac(): number {
    return this.riesgoPac().filter((p) => p.riesgo === 'alto').length;
  }

  recsAlta(): number {
    return this.recs().filter((r) => r.prioridad === 'alta').length;
  }

  cobrarPendiente(): number {
    const rec = this.recs().find((r) => r.tipo === 'cobranza');
    const m = rec ? /S\/\s*([\d,\.]+)/.exec(rec.titulo) : null;
    return m ? Number(m[1].replace(/,/g, '')) : 0;
  }

  facturasPendientes(): number {
    const rec = this.recs().find((r) => r.tipo === 'cobranza');
    const m = rec ? /en\s+(\d+)\s+factura/.exec(rec.titulo) : null;
    return m ? Number(m[1]) : 0;
  }

  features(): string[] {
    return this.resumen()?.metricas_modelo['features'] ?? [];
  }

  modeloNombre(): string {
    const m = this.resumen()?.metricas_modelo['modelo'];
    return m === 'regresion_logistica'
      ? 'Regresión logística (scikit-learn)'
      : m === 'reglas'
        ? 'Motor de reglas determinista'
        : String(m ?? '—');
  }

  fechaEntreno(): string {
    const t = this.resumen()?.metricas_modelo['entrenado_en'];
    if (!t) return '—';
    return new Date(t).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  }

  tendenciaProy(): string {
    const r = this.resumen();
    return r && r.proyeccion_ingresos.length > 0 ? r.proyeccion_ingresos[0].tendencia : 'estable';
  }

  confianzaProy(): number {
    const r = this.resumen();
    return r && r.proyeccion_ingresos.length > 0 ? r.proyeccion_ingresos[0].confianza : 0;
  }

  // -------------------------------------------------------------- extras
  diaSemana(fecha: string): string {
    const d = new Date(fecha + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : DIAS[d.getDay()];
  }

  diasPara(fecha: string): number {
    const d = new Date(fecha + 'T00:00:00');
    if (isNaN(d.getTime())) return 0;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - hoy.getTime()) / 86400000);
  }

  pctRiesgo(n: number): number {
    const total = this.noShow().length || 1;
    return Math.max((n / total) * 100, n > 0 ? 4 : 0);
  }

  barraProyeccion(proyectado: number): number {
    const max = Math.max(...this.proyecciones().map((p) => p.proyectado), 1);
    return Math.max((proyectado / max) * 100, 5);
  }

  tipoLabel(tipo: string): string {
    return TIPO_LABEL[tipo] ?? tipo;
  }

  resumenPrediccion(p: Prediccion): string {
    const d = p.detalles;
    if (!d) return '—';
    if (typeof d['paciente'] === 'string') {
      return `${d['paciente']} · ${d['hora'] ?? ''}${d['recomendacion'] ? ' · ' + d['recomendacion'] : ''}`;
    }
    if (typeof d['mes'] === 'string') {
      return `Mes ${d['mes']} · confianza ${Math.round(Number(d['confianza'] ?? 0) * 100)} %`;
    }
    if (Array.isArray(d['factores'])) return (d['factores'] as string[]).join(' · ');
    if (typeof d['motivos'] === 'string') return d['motivos'];
    if (typeof d['recomendacion'] === 'string') return d['recomendacion'];
    try {
      return JSON.stringify(d).slice(0, 160);
    } catch {
      return '—';
    }
  }
}
