import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

interface AyudaItem {
  titulo: string;
  descripcion: string;
  pasos: string[];
  keywords?: string[];
  requiere?: string[];
  resultado?: string;
  advertencia?: string;
  consejos?: string[];
  ruta?: string;
  rutaLabel?: string;
}

interface AyudaSeccion {
  id: string;
  titulo: string;
  icono: string;
  items: AyudaItem[];
}

@Component({
  selector: 'app-ayuda',
  imports: [],
  template: `
    <!-- Botón circular de ayuda (izquierda de la campanita) -->
    <button
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-purple-800 bg-purple-900 text-sm font-extrabold text-amber-400 transition-colors hover:bg-purple-800 hover:text-amber-300"
      (click)="abierto.set(!abierto())"
      title="Centro de ayuda"
      aria-label="Centro de ayuda"
    >
      ?
    </button>

    @if (abierto()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-purple-950/60 p-4 backdrop-blur-sm"
        (click)="cerrar()"
      >
        <div
          class="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          aria-label="Centro de ayuda"
        >
          <!-- Cabecera: título + buscador + cerrar -->
          <div class="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-extrabold text-slate-800">
                  <span class="mr-1">💡</span>Centro de ayuda
                </h2>
                <p class="text-xs text-slate-500">
                  Manual práctico de SmiloFun · {{ secciones.length }} módulos · {{ totalPasos() }} pasos
                </p>
              </div>
              <button
                class="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                (click)="cerrar()"
                aria-label="Cerrar ayuda"
                title="Cerrar (Esc)"
              >
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="relative">
              <svg
                class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                class="input w-full !pl-9"
                #campoBusqueda
                [value]="busqueda()"
                (input)="onBuscar($event)"
                placeholder="Busca una tarea, campo, error o palabra clave… ( / )"
                aria-label="Buscar en la ayuda"
              />
              @if (busqueda()) {
                <button
                  class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                  (click)="busqueda.set('')"
                  aria-label="Limpiar búsqueda"
                >
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              }
            </div>
          </div>

          <!-- Cuerpo -->
          <div class="flex min-h-0 flex-1">
            <!-- Categorías -->
            <nav class="hidden w-56 shrink-0 space-y-1 overflow-y-auto border-r border-slate-100 bg-slate-50 p-3 md:block">
              <button class="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-bold" [class.bg-purple-950]="categoria() === 'inicio'" [class.text-white]="categoria() === 'inicio'" [class.text-slate-600]="categoria() !== 'inicio'" (click)="seleccionarCategoria('inicio')"><span>✨</span><span>Inicio rápido</span></button>
              <button class="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-slate-600 hover:bg-amber-50" (click)="mostrarFavoritos()"><span>⭐</span><span>Mis favoritos</span><span class="ml-auto text-[10px]">{{ favoritos().length }}</span></button>
              @if (recientes().length) {
                <p class="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Vistos recientemente</p>
                @for (reciente of articulosRecientes(); track reciente.titulo) { <button class="w-full truncate rounded-lg px-3 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-200" (click)="mostrarArticulo(reciente)">{{ reciente.titulo }}</button> }
              }
              <p class="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Módulos</p>
              @for (sec of secciones; track sec.id) {
                <button
                  class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold transition-colors"
                  [class]="categoria() === sec.id ? 'bg-purple-950 text-white' : 'text-slate-600 hover:bg-slate-200'"
                  (click)="seleccionarCategoria(sec.id)"
                >
                  <span>{{ sec.icono }}</span>
                  <span class="truncate">{{ sec.titulo }}</span>
                </button>
              }
            </nav>

            <!-- Contenido -->
            <div class="min-w-0 flex-1 overflow-y-auto p-5 sm:p-7">
              @if (!busqueda() && categoria() === 'inicio' && !vistaFavoritos() && !articuloSeleccionado()) {
                <section class="mb-7 overflow-hidden rounded-2xl bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-800 p-6 text-white sm:p-8">
                  <p class="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Centro de conocimiento</p>
                  <h3 class="mt-2 text-2xl font-extrabold sm:text-3xl">¿Qué necesitas hacer hoy?</h3>
                  <p class="mt-2 max-w-2xl text-sm text-purple-100">Instrucciones paso a paso para el trabajo clínico, la gestión del consultorio y la administración de tu cuenta.</p>
                  <div class="mt-5 grid gap-2 sm:grid-cols-3">
                @for (atajo of accesosRapidos; track atajo.titulo) {
                      <button class="rounded-xl border border-white/15 bg-white/10 p-3 text-left transition hover:bg-white/20" (click)="abrirAccesoRapido(atajo)">
                        <span class="text-lg">{{ atajo.icono }}</span><span class="ml-2 text-sm font-bold">{{ atajo.titulo }}</span>
                        <span class="mt-1 block text-xs text-purple-100">{{ atajo.descripcion }}</span>
                      </button>
                    }
                  </div>
                </section>
                <div class="mb-6 grid gap-3 sm:grid-cols-3">
                  <article class="rounded-xl border border-slate-200 p-4"><p class="text-2xl font-extrabold text-slate-800">{{ secciones.length }}</p><p class="text-xs text-slate-500">módulos documentados</p></article>
                  <article class="rounded-xl border border-slate-200 p-4"><p class="text-2xl font-extrabold text-slate-800">{{ totalArticulos() }}</p><p class="text-xs text-slate-500">guías paso a paso</p></article>
                  <article class="rounded-xl border border-slate-200 p-4"><p class="text-2xl font-extrabold text-slate-800">{{ totalPasos() }}</p><p class="text-xs text-slate-500">pasos explicados</p></article>
                </div>
              }
              @if (vistaFavoritos()) {
                <div class="mb-5"><h3 class="text-xl font-extrabold text-slate-800">Mis temas favoritos</h3><p class="text-sm text-slate-500">Tus guías guardadas para consultarlas rápidamente.</p></div>
                @for (item of articulosFavoritos(); track item.titulo) { <button class="mb-2 w-full rounded-xl border border-slate-200 p-4 text-left hover:border-purple-300 hover:bg-purple-50" (click)="abrirArticulo(item, seccionDe(item))"><p class="font-bold text-slate-800">⭐ {{ item.titulo }}</p><p class="mt-1 text-xs text-slate-500">{{ item.descripcion }}</p></button> }
                @if (!articulosFavoritos().length) { <p class="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Aún no has guardado favoritos. Usa la estrella dentro de una guía.</p> }
              } @else if (articuloSeleccionado()) {
                @let item = articuloSeleccionado()!;
                <article class="mx-auto max-w-3xl">
                  <button class="mb-4 text-xs font-bold text-purple-700 hover:underline" (click)="volverSeccion()">← Volver a {{ seccionDe(item)?.titulo || 'la guía' }}</button>
                  <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                    <div class="flex items-start justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-wider text-purple-700">{{ seccionDe(item)?.icono }} {{ seccionDe(item)?.titulo }}</p><h3 class="mt-2 text-2xl font-extrabold text-slate-900">{{ item.titulo }}</h3><p class="mt-2 text-sm leading-6 text-slate-600">{{ item.descripcion }}</p></div><button class="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-amber-50" (click)="alternarFavorito(item)" [attr.aria-label]="esFavorito(item) ? 'Quitar de favoritos' : 'Guardar en favoritos'">{{ esFavorito(item) ? '⭐ Guardado' : '☆ Guardar' }}</button></div>
                    @if (item.requiere?.length) { <div class="mt-5 rounded-xl bg-blue-50 p-4"><p class="text-xs font-bold uppercase tracking-wide text-blue-800">Antes de empezar</p><ul class="mt-2 list-inside list-disc space-y-1 text-sm text-blue-900">@for (r of item.requiere; track $index) { <li>{{ r }}</li> }</ul></div> }
                    <div class="mt-6"><h4 class="text-sm font-extrabold uppercase tracking-wide text-slate-500">Procedimiento</h4><ol class="mt-3 space-y-3">@for (paso of item.pasos; track $index) { <li class="flex gap-3"><span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-extrabold text-purple-800">{{ $index + 1 }}</span><span class="pt-1 text-sm leading-6 text-slate-700">{{ paso }}</span></li> }</ol></div>
                    @if (item.resultado) { <div class="mt-5 rounded-xl bg-emerald-50 p-4"><p class="text-xs font-bold uppercase tracking-wide text-emerald-800">Resultado esperado</p><p class="mt-1 text-sm text-emerald-900">{{ item.resultado }}</p></div> }
                    @if (item.advertencia) { <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p class="text-xs font-bold uppercase tracking-wide text-amber-900">Importante</p><p class="mt-1 text-sm text-amber-900">{{ item.advertencia }}</p></div> }
                    @if (item.consejos?.length) { <div class="mt-5"><h4 class="text-xs font-extrabold uppercase tracking-wide text-slate-500">Consejos</h4><ul class="mt-2 space-y-2">@for (c of item.consejos; track $index) { <li class="flex gap-2 text-sm text-slate-600"><span class="text-amber-500">✦</span>{{ c }}</li> }</ul></div> }
                    @if (item.ruta) { <button class="mt-6 inline-flex items-center gap-2 rounded-lg bg-purple-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-800" (click)="ir(item.ruta!)">{{ item.rutaLabel ?? 'Abrir módulo' }} →</button> }
                  </div>
                </article>
              }
              @if (!vistaFavoritos() && !articuloSeleccionado() && resultados(); as res) {
                <!-- Modo búsqueda: resultados planos agrupados por sección -->
                <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {{ contarResultados(res) }} guía(s) para "{{ busqueda() }}"
                </p>
                @for (sec of res; track sec.id) {
                  <div class="mb-5">
                    <p class="mb-2 text-sm font-bold text-slate-700">
                      {{ sec.icono }} {{ sec.titulo }}
                    </p>
                    <div class="space-y-2">
                      @for (item of sec.items; track item.titulo) {
                        <button
                          class="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-purple-300 hover:bg-purple-50/50"
                          (click)="abrirArticulo(item, sec)"
                        >
                          <p class="text-sm font-bold text-slate-800">{{ item.titulo }}</p>
                          <p class="mt-0.5 text-xs text-slate-500">{{ item.descripcion }}</p>
                        </button>
                      }
                    </div>
                  </div>
                }
                @if (contarResultados(res) === 0) {
                  <div class="py-10 text-center">
                    <p class="text-3xl">🔍</p>
                    <p class="mt-2 text-sm font-semibold text-slate-600">Sin resultados para "{{ busqueda() }}"</p>
                    <p class="text-xs text-slate-400">Prueba con otra palabra, por ejemplo: cita, factura, stock, IA…</p>
                  </div>
                }
              } @else if (!articuloSeleccionado() && !vistaFavoritos()) {
                <!-- Modo normal: sección seleccionada con acordeón -->
                <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {{ seccionActual().icono }} {{ seccionActual().titulo }} · {{ itemsSeccionActual().length }} guías
                </p>
                <div class="space-y-2">
                  @for (item of itemsSeccionActual(); track item.titulo) {
                    <div
                      class="overflow-hidden rounded-xl border transition-colors"
                      [class]="abiertoItem() === item.titulo ? 'border-purple-300 bg-purple-50/40' : 'border-slate-200 bg-white'"
                    >
                      <button
                        class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        (click)="toggle(item.titulo)"
                      >
                        <div class="min-w-0">
                          <p class="text-sm font-bold text-slate-800">{{ item.titulo }}</p>
                          <p class="mt-0.5 text-xs text-slate-500">{{ item.descripcion }}</p>
                        </div>
                        <svg
                          class="h-4 w-4 shrink-0 text-slate-400 transition-transform"
                          [class.rotate-180]="abiertoItem() === item.titulo"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <path d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      @if (abiertoItem() === item.titulo) {
                        <div class="border-t border-slate-100 px-4 py-3">
                          @if (item.requiere?.length) { <div class="mb-3 rounded-lg bg-blue-50 p-3"><p class="text-[11px] font-bold uppercase text-blue-800">Antes de empezar</p><ul class="mt-1 list-inside list-disc text-xs text-blue-900">@for (r of item.requiere; track $index) { <li>{{ r }}</li> }</ul></div> }
                          <p class="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            Pasos
                          </p>
                          <ol class="space-y-1.5">
                            @for (paso of item.pasos; track $index) {
                              <li class="flex items-start gap-2 text-sm text-slate-600">
                                <span
                                  class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700"
                                >
                                  {{ $index + 1 }}
                                </span>
                                <span>{{ paso }}</span>
                              </li>
                            }
                          </ol>
                          @if (item.resultado) { <p class="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900"><b>Resultado:</b> {{ item.resultado }}</p> }
                          @if (item.advertencia) { <p class="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><b>Importante:</b> {{ item.advertencia }}</p> }
                          @if (item.consejos?.length) {
                            <p class="mb-1.5 mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                              Consejos
                            </p>
                            <ul class="space-y-1">
                              @for (c of item.consejos; track $index) {
                                <li class="flex items-start gap-2 text-xs text-slate-500">
                                  <span class="mt-0.5 text-amber-500">★</span>
                                  <span>{{ c }}</span>
                                </li>
                              }
                            </ul>
                          }
                          @if (item.ruta) {
                            <button
                              class="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-purple-950 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-purple-800"
                              (click)="ir(item.ruta!)"
                            >
                              {{ item.rutaLabel ?? 'Ir al módulo' }}
                              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M5 12h14m-6-6l6 6-6 6" />
                              </svg>
                            </button>
                          }
                          <button class="ml-2 mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-amber-50" (click)="alternarFavorito(item)">{{ esFavorito(item) ? '⭐ Guardado' : '☆ Guardar favorito' }}</button>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Pie -->
          <div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
                  <p class="text-[11px] text-slate-400">
              SmiloFun · Manual de uso · Atajo de búsqueda: /
            </p>
            <button
              class="text-xs font-bold text-purple-700 transition-colors hover:text-purple-900 hover:underline"
              (click)="ir('/contacto')"
            >
              ¿Necesitas más ayuda? Contáctenos →
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AyudaComponent {
  private router = inject(Router);
  private readonly claveFavoritos = 'smilofun.ayuda.favoritos';
  private readonly claveRecientes = 'smilofun.ayuda.recientes';

  abierto = signal(false);
  busqueda = signal('');
  categoria = signal('inicio');
  abiertoItem = signal<string | null>(null);
  articuloSeleccionado = signal<AyudaItem | null>(null);
  vistaFavoritos = signal(false);
  favoritos = signal<string[]>(this.leerLista(this.claveFavoritos));
  recientes = signal<string[]>(this.leerLista(this.claveRecientes));

  readonly accesosRapidos = [
    { titulo: 'Registrar paciente', descripcion: 'Alta, búsqueda y ficha clínica', icono: '🦷', seccion: 'pacientes', item: 'Registrar paciente' },
    { titulo: 'Agendar cita', descripcion: 'Paciente, doctor y horario', icono: '📅', seccion: 'agenda', item: 'Crear una cita' },
    { titulo: 'Revisar plan de tratamiento', descripcion: 'Procedimientos, costos y aprobación', icono: '📝', seccion: 'pacientes', item: 'Planes de tratamiento' },
  ];
  abrirAccesoRapido(atajo: { item: string; seccion: string }): void {
    const section = this.secciones.find(s => s.id === atajo.seccion);
    const item = section?.items.find(i => i.titulo === atajo.item);
    if (item && section) this.abrirArticulo(item, section);
  }

  readonly secciones: AyudaSeccion[] = [
    {
      id: 'inicio',
      titulo: 'Inicio',
      icono: '🏠',
      items: [
        {
          titulo: 'Dashboard',
          descripcion: 'Resumen general del consultorio en tiempo real.',
          pasos: [
            'Al iniciar sesión verás los KPIs: citas de hoy, ingresos del mes, pacientes nuevos y tasa de asistencia.',
            'Revisa las próximas citas del día y su estado.',
            'Observa el top de tratamientos y las citas por doctor.',
            'Las alertas de stock y citas por confirmar aparecen en la campanita del header.',
          ],
          consejos: ['Todos los KPIs usan la empresa activa seleccionada en el header.'],
          ruta: '/dashboard',
          rutaLabel: 'Ir al Dashboard',
        },
        {
          titulo: 'Cambiar de empresa',
          descripcion: 'Si tu usuario tiene acceso a varias empresas, alterna entre ellas desde el header.',
          pasos: [
            'Ubica el selector de empresa en el centro del header (solo aparece si tienes más de una asignada).',
            'Elige la empresa deseada del menú desplegable.',
            'Todos los módulos se actualizan automáticamente con los datos de esa empresa.',
          ],
          consejos: ['La empresa activa se identifica por su color y la etiqueta "Activa".'],
          ruta: '/dashboard',
          rutaLabel: 'Ver Dashboard',
        },
        {
          titulo: 'Notificaciones y alertas',
          descripcion: 'La campanita del header agrupa alertas de inventario y citas por confirmar.',
          pasos: [
            'Haz clic en la campanita para abrir el panel de notificaciones.',
            'Revisa las pestañas "Inventario" (stock bajo) y "Citas" (por confirmar).',
            'Haz clic en "Ver" de cada notificación para ir directo al módulo.',
            'Usa el botón de actualizar para refrescar los datos.',
          ],
          consejos: ['El número de la campanita es la suma de alertas de stock y citas por confirmar.'],
          ruta: '/inventario',
          rutaLabel: 'Ver Inventario',
        },
      ],
    },
    {
      id: 'pacientes',
      titulo: 'Pacientes',
      icono: '🦷',
      items: [
        {
          titulo: 'Registrar paciente',
          descripcion: 'Da de alta a un paciente nuevo en el sistema.',
          pasos: [
            'Ve al módulo Pacientes.',
            'Haz clic en "Nuevo paciente".',
            'Completa los datos personales, contacto y datos de emergencia.',
            'Guarda el formulario.',
          ],
          consejos: ['El código del paciente (P-000XX) se genera automáticamente.'],
          requiere: ['Empresa activa seleccionada.', 'Datos personales básicos y sede de atención.'],
          resultado: 'El paciente aparece en la lista de la empresa activa y puede seleccionarse en citas y planes.',
          keywords: ['alta', 'nuevo', 'dni', 'empresa', 'sede'],
          advertencia: 'No registres datos de prueba en la base de pacientes real; protege la información personal y clínica.',
          ruta: '/pacientes',
          rutaLabel: 'Ir a Pacientes',
        },
        {
          titulo: 'Buscar pacientes',
          descripcion: 'Encuentra pacientes por nombre, apellido o código.',
          pasos: [
            'Usa el buscador de la lista de pacientes.',
            'Los resultados se filtran mientras escribes.',
            'Haz clic en la fila para abrir la ficha completa.',
          ],
          consejos: ['También puedes buscar por DNI si está registrado.'],
          ruta: '/pacientes',
          rutaLabel: 'Ir a Pacientes',
        },
        {
          titulo: 'Ficha del paciente',
          descripcion: 'Toda la información clínica y comercial de un paciente.',
          pasos: [
            'Abre un paciente desde la lista.',
            'La pestaña "Resumen" muestra citas totales, total gastado, saldo y próxima cita.',
            'Desde las pestañas accede a Historial, Odontograma, Exámenes, Planes y Piezas 3D.',
          ],
          consejos: ['El resumen incluye la tasa de inasistencia (no-show) del paciente.'],
          ruta: '/pacientes',
          rutaLabel: 'Ir a Pacientes',
        },
        {
          titulo: 'Historial clínico',
          descripcion: 'Registra las notas clínicas de cada atención.',
          pasos: [
            'En la ficha del paciente, abre la pestaña "Historial".',
            'Haz clic en "Nueva nota".',
            'Registra motivo, diagnóstico, tratamiento e indicaciones.',
            'Guarda la nota.',
          ],
          ruta: '/pacientes',
          rutaLabel: 'Ir a Pacientes',
        },
        {
          titulo: 'Odontograma',
          descripcion: 'Registro gráfico del estado de cada diente.',
          pasos: [
            'En la ficha del paciente, abre la pestaña "Odontograma".',
            'Selecciona un diente del diagrama.',
            'Elige el estado (sano, caries, tratado, extraído, etc.).',
            'Guarda los cambios.',
          ],
          consejos: ['Cada estado tiene un color distinto para lectura rápida.'],
          ruta: '/pacientes',
          rutaLabel: 'Ir a Pacientes',
        },
        {
          titulo: 'Exámenes de imagen',
          descripcion: 'Sube radiografías, fotos, tomografías y escaneos.',
          pasos: [
            'En la ficha del paciente, abre la pestaña "Exámenes".',
            'Haz clic en "Subir examen".',
            'Elige el archivo. Imágenes: hasta 15 MB; videos: hasta 200 MB; DICOM: hasta 512 MB; NIfTI/NRRD: hasta 1 GB.',
            'Indica el tipo y un título descriptivo.',
            'Guarda el examen.',
          ],
          consejos: ['Puedes marcar dientes sobre la imagen para señalar hallazgos.', 'Los formatos DICOM, NIfTI (.nii/.nii.gz) y NRRD (.nrrd) se abren con visor volumétrico cuando están registrados como examen.'],
          advertencia: 'Verifica paciente, tipo y archivo antes de guardar: los exámenes contienen información clínica sensible.',
          resultado: 'El examen queda asociado a la ficha y disponible para su visor según el tipo y formato.',
          keywords: ['dcm', 'dicom', 'nifti', 'nii', 'nii.gz', 'nrrd', 'tomografía', 'resonancia', 'volumen'],
          ruta: '/pacientes',
          rutaLabel: 'Ir a Pacientes',
        },
        {
          titulo: 'Planes de tratamiento',
          descripcion: 'Arma planes con procedimientos, dientes y precios.',
          pasos: [
            'En la ficha del paciente, abre la pestaña "Planes".',
            'Haz clic en "Nuevo plan".',
            'Agrega procedimientos indicando diente, superficie y precio.',
            'Define descuento y estado del plan (propuesto, aprobado, en progreso…).',
            'Guarda el plan.',
          ],
          ruta: '/tratamientos',
          rutaLabel: 'Ver Tratamientos',
        },
      ],
    },
    {
      id: 'agenda',
      titulo: 'Agenda',
      icono: '📅',
      items: [
        {
          titulo: 'Crear una cita',
          descripcion: 'Agenda una atención para un paciente.',
          pasos: [
            'Ve al módulo Agenda / Citas.',
            'Haz clic en "Nueva cita".',
            'Selecciona paciente, doctor, fecha y hora.',
            'Indica el motivo de la consulta.',
            'Guarda la cita.',
          ],
          requiere: ['Paciente registrado y activo.', 'Doctor disponible para la sede y horario elegidos.'],
          resultado: 'La cita aparece en la agenda con su estado inicial y los filtros de empresa/sede.',
          advertencia: 'Comprueba fecha, hora, paciente y doctor antes de confirmar.',
          ruta: '/citas',
          rutaLabel: 'Ir a Agenda',
        },
        {
          titulo: 'Estados de la cita',
          descripcion: 'Cada cita tiene un estado identificado por color.',
          pasos: [
            'Programada (azul): pendiente de confirmar con el paciente.',
            'Confirmada (azul): confirmada.',
            'En atención (amarillo): el paciente está siendo atendido.',
            'Completada (verde): atención finalizada.',
            'No asistió (rojo): el paciente no acudió.',
            'Cancelada (gris): anulada.',
          ],
          ruta: '/citas',
          rutaLabel: 'Ir a Agenda',
        },
        {
          titulo: 'Tablero por doctor',
          descripcion: 'La agenda se organiza por doctor y por día.',
          pasos: [
            'En Agenda, selecciona el doctor del selector.',
            'Las citas se muestran en tarjetas por día.',
            'Cambia el estado de cada cita con los botones de la tarjeta.',
          ],
          ruta: '/citas',
          rutaLabel: 'Ir a Agenda',
        },
        {
          titulo: 'Confirmar citas',
          descripcion: 'Convierte citas programadas en confirmadas.',
          pasos: [
            'Revisa la campanita del header: las citas programadas aparecen como pendientes.',
            'Abre la cita en la agenda.',
            'Cambia el estado a "Confirmada".',
          ],
          consejos: ['Confirmar a tiempo reduce las inasistencias.'],
          ruta: '/citas',
          rutaLabel: 'Ir a Agenda',
        },
      ],
    },
    {
      id: 'gestion',
      titulo: 'Gestión',
      icono: '💼',
      items: [
        {
          titulo: 'Facturar',
          descripcion: 'Genera una factura para un paciente.',
          pasos: [
            'Ve al módulo Facturación.',
            'Haz clic en "Nueva factura".',
            'Selecciona el paciente y agrega los detalles (descripción, cantidad, precio).',
            'Aplica descuento si corresponde.',
            'Guarda la factura.',
          ],
          requiere: ['Paciente y sede correctos.', 'Detalle, cantidades y precios revisados.'],
          advertencia: 'La factura genera un registro financiero. No la uses para simular una operación real.',
          resultado: 'La factura queda en el historial del paciente con el total calculado.',
          ruta: '/facturacion',
          rutaLabel: 'Ir a Facturación',
        },
        {
          titulo: 'Planes de tratamiento',
          descripcion: 'Prepara un plan y consúltalo en la ficha clínica.',
          pasos: ['Abre la ficha del paciente y selecciona Planes, o entra a Tratamientos.', 'Crea el plan y agrega procedimientos del catálogo.', 'Revisa dientes, superficies, precios, descuento y estado.', 'Guarda y confirma que el plan aparezca asociado al paciente.'],
          requiere: ['Paciente correcto y tratamientos del catálogo configurados.'],
          resultado: 'El plan queda visible para seguimiento y puede usarse como referencia de facturación según el flujo de la clínica.',
          advertencia: 'Valida el tratamiento y sus costos con el profesional antes de presentarlo al paciente.',
          ruta: '/tratamientos', rutaLabel: 'Abrir tratamientos', keywords: ['presupuesto', 'plan clínico', 'diente', 'procedimiento'],
        },
        {
          titulo: 'Registrar pagos',
          descripcion: 'Registra pagos totales o parciales de una factura.',
          pasos: [
            'Abre la factura desde la lista.',
            'Haz clic en "Registrar pago".',
            'Indica el monto y el método de pago.',
            'Guarda el pago.',
          ],
          consejos: ['Puedes registrar varios pagos parciales hasta cubrir el total.'],
          ruta: '/facturacion',
          rutaLabel: 'Ir a Facturación',
        },
        {
          titulo: 'Anular factura',
          descripcion: 'Anula una factura emitida por error.',
          pasos: [
            'Abre la factura.',
            'Haz clic en "Anular".',
            'Confirma la anulación.',
          ],
          consejos: ['La anulación queda registrada en el historial de la factura.'],
          ruta: '/facturacion',
          rutaLabel: 'Ir a Facturación',
        },
        {
          titulo: 'Inventario',
          descripcion: 'Gestiona productos, stock y alertas.',
          pasos: [
            'Ve al módulo Inventario.',
            'Haz clic en "Nuevo producto".',
            'Registra nombre, categoría, stock y stock mínimo.',
            'Guarda el producto.',
          ],
          requiere: ['Empresa activa y sede de inventario correctas.'],
          resultado: 'El producto aparece en inventario y puede asociarse a movimientos o compras.',
          ruta: '/inventario',
          rutaLabel: 'Ir a Inventario',
        },
        {
          titulo: 'Movimientos de stock',
          descripcion: 'Registra entradas y salidas de productos.',
          pasos: [
            'Abre el producto desde la lista.',
            'Haz clic en "Movimiento".',
            'Elige el tipo (entrada o salida) y la cantidad.',
            'Guarda el movimiento.',
          ],
          ruta: '/inventario',
          rutaLabel: 'Ir a Inventario',
        },
        {
          titulo: 'Alertas de stock',
          descripcion: 'Detecta productos por debajo del stock mínimo.',
          pasos: [
            'Usa el filtro "Solo alertas" en Inventario.',
            'Los productos con stock menor o igual al mínimo se resaltan.',
            'Repón stock registrando un movimiento de entrada.',
          ],
          consejos: ['Las alertas también aparecen en la campanita del header.'],
          ruta: '/inventario',
          rutaLabel: 'Ir a Inventario',
        },
        {
          titulo: 'Proveedores',
          descripcion: 'Administra el catálogo de proveedores de cada empresa.',
          pasos: ['Confirma la empresa activa en el encabezado.', 'Abre Inventario → Proveedores.', 'Usa la búsqueda y el filtro de estado para localizar registros.', 'Selecciona “Nuevo proveedor” y completa la razón social y los datos verificados.', 'Guarda y comprueba que el proveedor aparezca bajo la empresa activa.'],
          requiere: ['Permiso para administrar proveedores.', 'Razón social real; verifica RUC y contacto antes de registrarlos.'],
          resultado: 'El proveedor aparece solo en la empresa seleccionada y estará disponible en el formulario de compras.',
          advertencia: 'Un proveedor de demostración debe reemplazarse por datos reales antes de operar. Dar de baja no elimina compras históricas.',
          ruta: '/inventario/proveedores', rutaLabel: 'Abrir proveedores', keywords: ['ruc', 'catálogo', 'demo', 'empresa'],
        },
        {
          titulo: 'Compras de insumos y recepción',
          descripcion: 'Registra una compra real y recibe cantidades en el stock de la sede seleccionada.',
          pasos: ['Confirma empresa activa.', 'Ve a Inventario → Compras → Registrar compra.', 'Selecciona un proveedor activo de esa empresa.', 'Selecciona la sede: la lista de insumos se limita a esa sede.', 'Agrega cada insumo con cantidad y costo unitario comprobados.', 'Verifica subtotal, impuesto/cargos, referencia, fecha y total.', 'Guarda una sola vez y espera la confirmación; comprueba la compra y los movimientos de stock.'],
          requiere: ['Proveedor real y activo de la misma empresa.', 'Sede activa.', 'Insumos de esa sede.', 'Cantidades, costo, comprobante e impuesto basados en la compra real.'],
          resultado: 'Se registra la compra, se incrementa el stock por las cantidades recibidas y se conserva el movimiento asociado.',
          advertencia: 'Guardar tiene efecto financiero y modifica stock. No registres compras de prueba en producción; si hay error, verifica primero si la compra llegó a guardarse antes de reintentar.',
          ruta: '/inventario/compras', rutaLabel: 'Abrir compras', keywords: ['stock', 'recepción', 'factura proveedor', 'compra', 'sede', 'costo'],
        },
        {
          titulo: 'Catálogo de tratamientos',
          descripcion: 'Define los procedimientos y sus precios.',
          pasos: [
            'Ve al módulo Tratamientos.',
            'Haz clic en "Nuevo tratamiento".',
            'Registra nombre, categoría, precio y duración.',
            'Guarda el tratamiento.',
          ],
          ruta: '/tratamientos',
          rutaLabel: 'Ir a Tratamientos',
        },
        {
          titulo: 'Pagos y anulaciones',
          descripcion: 'Consulta saldos y registra pagos o anulaciones sobre una factura.',
          pasos: ['Abre Facturación y localiza la factura.', 'Verifica paciente, moneda, total y saldo pendiente.', 'Para cobrar, elige Registrar pago, introduce el importe efectivamente recibido y el método.', 'Guarda una sola vez y confirma que saldo y estado se actualizaron.', 'Para anular, usa la acción correspondiente y confirma solo si la operación es correcta.'],
          requiere: ['Factura de la empresa activa.', 'Importe y método confirmados con el comprobante real.'],
          advertencia: 'Pagos y anulaciones afectan registros financieros. No los pruebes en producción; comprueba el historial antes de reintentar.',
          resultado: 'El estado de la factura refleja el pago parcial/total o la anulación y se conserva el historial.',
          ruta: '/facturacion', rutaLabel: 'Abrir facturación', keywords: ['saldo', 'cobro', 'pago parcial', 'anular', 'finanzas'],
        },
        {
          titulo: 'Doctores',
          descripcion: 'Gestiona el equipo médico.',
          pasos: [
            'Ve al módulo Doctores.',
            'Haz clic en "Nuevo doctor".',
            'Registra datos personales, especialidad y color identificador.',
            'Guarda el doctor.',
          ],
          ruta: '/doctores',
          rutaLabel: 'Ir a Doctores',
        },
        {
          titulo: 'Reportes',
          descripcion: 'Analiza ingresos, doctores, tratamientos y citas.',
          pasos: [
            'Ve al módulo Reportes.',
            'Elige el rango de fechas.',
            'Explora los reportes de ingresos, doctores, tratamientos y citas.',
          ],
          ruta: '/reportes',
          rutaLabel: 'Ir a Reportes',
        },
        {
          titulo: 'Respaldos de base de datos',
          descripcion: 'Consulta y administra los respaldos disponibles según permisos.',
          pasos: ['Abre el módulo Respaldos.', 'Revisa fecha, tamaño y estado del archivo.', 'Descarga o crea un respaldo solo siguiendo la política del administrador.', 'Antes de restaurar, verifica el entorno destino, la fecha y que exista un respaldo reciente.'],
          requiere: ['Permiso administrativo.', 'Confirmación del entorno y de la política de retención.'],
          advertencia: 'Una restauración puede sobrescribir datos actuales. No ejecutes restauraciones como prueba.',
          resultado: 'El respaldo queda disponible en la ubicación y con el estado mostrados por el sistema.',
          ruta: '/respaldos', rutaLabel: 'Abrir respaldos', keywords: ['backup', 'restaurar', 'base de datos', 'exportar'],
        },
        {
          titulo: 'Empresas',
          descripcion: 'Administra las empresas del sistema (multi-tenant).',
          pasos: [
            'Ve al módulo Empresas.',
            'Haz clic en "Nueva empresa".',
            'Registra nombre, RUC, contacto y color.',
            'Guarda la empresa.',
          ],
          ruta: '/empresas',
          rutaLabel: 'Ir a Empresas',
        },
        {
          titulo: 'Usuarios y roles',
          descripcion: 'Crea usuarios y asigna roles y empresas.',
          pasos: [
            'Ve al módulo Usuarios.',
            'Haz clic en "Nuevo usuario".',
            'Asigna email, nombre, rol y empresas.',
            'Guarda el usuario.',
          ],
          consejos: ['Roles disponibles: admin, recepción y doctor.'],
          ruta: '/usuarios',
          rutaLabel: 'Ir a Usuarios',
        },
        {
          titulo: 'Configuración',
          descripcion: 'Cuenta, sedes, catálogo y roles.',
          pasos: [
            'Ve al módulo Configuración.',
            'Gestiona tu cuenta y cierra sesión si es necesario.',
            'Administra sedes y el catálogo de tratamientos.',
            'Revisa los roles y permisos del sistema.',
          ],
          ruta: '/configuracion',
          rutaLabel: 'Ir a Configuración',
        },
      ],
    },
    {
      id: 'ia',
      titulo: 'Inteligencia Artificial',
      icono: '🤖',
      items: [
        {
          titulo: 'Panel IA',
          descripcion: 'Resumen inteligente del consultorio.',
          pasos: [
            'Ve al Panel IA.',
            'Revisa el resumen generado: riesgo de inasistencia, proyección de ingresos y recomendaciones.',
            'Observa las métricas del modelo entrenado.',
            'Haz clic en "Reentrenar" para actualizar el modelo con los datos más recientes.',
          ],
          ruta: '/ia',
          rutaLabel: 'Ir al Panel IA',
        },
        {
          titulo: 'Asistente IA',
          descripcion: 'Chat que responde preguntas sobre el consultorio.',
          pasos: [
            'Ve al Asistente IA.',
            'Escribe una pregunta en lenguaje natural (ej: "¿cuántas citas hay mañana?").',
            'El asistente responde con datos reales del sistema.',
          ],
          ruta: '/ia/asistente',
          rutaLabel: 'Ir al Asistente',
        },
        {
          titulo: 'Riesgo de inasistencia',
          descripcion: 'Predice qué pacientes probablemente no asistirán.',
          pasos: [
            'Ve a Riesgo de Inasistencia.',
            'Revisa la probabilidad de no-show de cada cita.',
            'Filtra por riesgo alto.',
            'Usa la recomendación para llamar y confirmar al paciente.',
          ],
          ruta: '/ia/no-show',
          rutaLabel: 'Ir a Riesgo de Inasistencia',
        },
        {
          titulo: 'Proyección de ingresos',
          descripcion: 'Estima los ingresos de los próximos meses.',
          pasos: [
            'Ve a Proyección de Ingresos.',
            'Revisa la tendencia mes a mes.',
            'Observa el nivel de confianza del modelo.',
          ],
          ruta: '/ia/ingresos',
          rutaLabel: 'Ir a Proyección',
        },
        {
          titulo: 'Segmentación de pacientes',
          descripcion: 'Clasifica pacientes por valor para el consultorio.',
          pasos: [
            'Ve a Segmentación de Pacientes.',
            'Explora los segmentos por valor.',
            'Identifica pacientes de alto valor para fidelizar.',
          ],
          ruta: '/ia/pacientes',
          rutaLabel: 'Ir a Segmentación',
        },
        {
          titulo: 'Inventario predictivo',
          descripcion: 'Sugiere cuánto stock reponer antes de agotarse.',
          pasos: [
            'Ve a Inventario Predictivo.',
            'Revisa el stock sugerido por producto.',
            'Repón los productos antes de que se agoten.',
          ],
          ruta: '/ia/inventario',
          rutaLabel: 'Ir a Inventario Predictivo',
        },
        {
          titulo: 'Agenda inteligente',
          descripcion: 'Predice la demanda de citas por día.',
          pasos: [
            'Ve a Agenda Inteligente.',
            'Revisa la demanda proyectada por día.',
            'Planifica horarios y personal según la predicción.',
          ],
          ruta: '/ia/agenda',
          rutaLabel: 'Ir a Agenda Inteligente',
        },
        {
          titulo: 'Historial de predicciones',
          descripcion: 'Consulta todas las predicciones generadas.',
          pasos: [
            'Ve a Historial de Predicciones.',
            'Filtra por tipo de predicción.',
            'Revisa el detalle de cada una.',
          ],
          ruta: '/ia/historial',
          rutaLabel: 'Ir a Historial',
        },
      ],
    },
    {
      id: 'diseno3d',
      titulo: 'Diseño 3D',
      icono: '🧊',
      items: [
        {
          titulo: 'Diseño de prótesis',
          descripcion: 'Genera diseños 3D de prótesis dentales.',
          pasos: [
            'Ve al módulo Diseño de Prótesis.',
            'Selecciona el paciente.',
            'Elige el tipo de pieza a diseñar.',
            'Genera el diseño 3D.',
            'Descarga el archivo STL cuando esté listo.',
          ],
          requiere: ['Ficha del paciente correcta.', 'Datos de diseño clínicamente revisados.'],
          advertencia: 'El diseño generado debe ser revisado por el profesional responsable antes de fabricación o uso clínico.',
          ruta: '/diseno3d',
          rutaLabel: 'Ir a Diseño 3D',
        },
        {
          titulo: 'Catálogo de piezas',
          descripcion: 'Explora los tipos de piezas disponibles.',
          pasos: [
            'Ve al Catálogo de Piezas.',
            'Explora los tipos disponibles.',
            'Revisa los parámetros de cada pieza.',
          ],
          ruta: '/diseno3d/catalogo',
          rutaLabel: 'Ir al Catálogo',
        },
        {
          titulo: 'Historial de diseños',
          descripcion: 'Reabre o descarga diseños anteriores.',
          pasos: [
            'Ve al Historial de Diseños.',
            'Filtra por paciente si lo necesitas.',
            'Reabre o descarga diseños previos.',
          ],
          ruta: '/diseno3d/historial',
          rutaLabel: 'Ir al Historial',
        },
      ],
    },
    {
      id: 'faq',
      titulo: 'Preguntas frecuentes',
      icono: '❓',
      items: [
        {
          titulo: '¿Cómo cambio de empresa?',
          descripcion: 'Usa el selector del header, visible solo si tienes varias empresas asignadas.',
          pasos: ['Haz clic en el selector central del header.', 'Elige la empresa.', 'Todo el sistema se actualiza.'],
        },
        {
          titulo: '¿Qué significa cada color en las citas?',
          descripcion: 'Azul: programada/confirmada · Amarillo: en atención · Verde: completada · Rojo: no asistió · Gris: cancelada.',
          pasos: ['Consulta la leyenda en la parte superior de la agenda.'],
        },
        {
          titulo: '¿Qué formatos médicos puedo subir?',
          descripcion: 'Ficha del paciente → pestaña Exámenes → "Subir examen".',
          pasos: ['Abre la ficha del paciente y entra a Exámenes.', 'Elige el tipo correcto y selecciona el archivo.', 'Carga la imagen o video, un DICOM, NIfTI (.nii/.nii.gz) o NRRD (.nrrd).', 'Guarda y abre el visor asociado para verificar que el volumen se visualiza.'],
          consejos: ['Límites del backend: imágenes 15 MB, video 200 MB, DICOM 512 MB y volúmenes NIfTI/NRRD 1 GB.'],
          keywords: ['dcm', 'dicom', 'nifti', 'nii', 'nrrd', 'tomografía', 'resonancia'],
        },
        {
          titulo: '¿Cómo entreno el modelo de IA?',
          descripcion: 'Panel IA → botón "Reentrenar".',
          pasos: ['Ve al Panel IA.', 'Haz clic en "Reentrenar".', 'El modelo se actualiza con las citas históricas.'],
        },
        {
          titulo: '¿Cómo repongo stock?',
          descripcion: 'Inventario → abrir producto → Movimiento → Entrada.',
          pasos: ['Abre el producto.', 'Haz clic en "Movimiento".', 'Elige entrada, cantidad y guarda.'],
        },
        {
          titulo: '¿Cómo registro un pago parcial?',
          descripcion: 'Facturación → abrir factura → "Registrar pago".',
          pasos: ['Abre la factura.', 'Haz clic en "Registrar pago".', 'Indica monto y método.'],
        },
        {
          titulo: '¿Dónde veo las alertas?',
          descripcion: 'En la campanita del header: stock bajo y citas por confirmar.',
          pasos: ['Haz clic en la campanita.', 'Revisa las pestañas Inventario y Citas.'],
        },
        {
          titulo: '¿Cómo contacto soporte?',
          descripcion: 'Usa el módulo Contáctenos del menú lateral.',
          pasos: ['Ve a Contáctenos.', 'Envía tu consulta.'],
          ruta: '/contacto',
          rutaLabel: 'Ir a Contáctenos',
        },
        {
          titulo: '¿Qué hago si aparece un error al guardar?',
          descripcion: 'Pasos seguros para diagnosticar un error sin duplicar operaciones.',
          pasos: ['Lee el mensaje completo y anota el módulo, hora y acción, sin compartir contraseñas ni datos clínicos.', 'Para compras, pagos, facturas o citas, no pulses Guardar repetidamente.', 'Comprueba primero si el registro aparece en la lista o historial.', 'Si no aparece, captura el detalle de error y consulta al administrador.', 'Reintenta solo cuando se confirme que no hubo registro y los datos estén corregidos.'],
          advertencia: 'Un timeout o error visual no demuestra que la operación haya fallado en la base de datos.',
          keywords: ['error', 'guardar', 'duplicado', '500', 'backend', 'api'],
        },
      ],
    },
  ];

  private leerLista(clave: string): string[] {
    try {
      const valor = localStorage.getItem(clave);
      const datos: unknown = valor ? JSON.parse(valor) : [];
      return Array.isArray(datos) ? datos.filter((x): x is string => typeof x === 'string') : [];
    } catch { return []; }
  }

  totalArticulos(): number { return this.secciones.reduce((n, s) => n + s.items.length, 0); }

  itemsSeccionActual(): AyudaItem[] {
    const sec = this.seccionActual();
    if (sec.id === 'inicio') return [];
    if (sec.id !== 'favoritos') return sec.items;
    return this.articulosFavoritos();
  }

  seleccionarCategoria(id: string): void {
    this.vistaFavoritos.set(false);
    this.articuloSeleccionado.set(null);
    this.categoria.set(id);
    this.abiertoItem.set(null);
  }

  mostrarFavoritos(): void {
    this.busqueda.set('');
    this.articuloSeleccionado.set(null);
    this.vistaFavoritos.set(true);
  }

  todosArticulos(): AyudaItem[] { return this.secciones.flatMap(s => s.items); }

  seccionDe(item: AyudaItem): AyudaSeccion | undefined {
    return this.secciones.find(s => s.items.some(i => i.titulo === item.titulo));
  }

  articulosFavoritos(): AyudaItem[] {
    const guardados = new Set(this.favoritos());
    return this.todosArticulos().filter(i => guardados.has(i.titulo));
  }

  articulosRecientes(): AyudaItem[] {
    const mapa = new Map(this.todosArticulos().map(i => [i.titulo, i]));
    return this.recientes().map(t => mapa.get(t)).filter((i): i is AyudaItem => !!i).slice(0, 5);
  }

  esFavorito(item: AyudaItem): boolean { return this.favoritos().includes(item.titulo); }

  alternarFavorito(item: AyudaItem): void {
    const lista = this.esFavorito(item) ? this.favoritos().filter(t => t !== item.titulo) : [item.titulo, ...this.favoritos()];
    this.favoritos.set(lista);
    try { localStorage.setItem(this.claveFavoritos, JSON.stringify(lista)); } catch { /* storage opcional */ }
  }

  abrirArticulo(item: AyudaItem, seccion?: AyudaSeccion): void {
    const encontrada = seccion ?? this.seccionDe(item);
    this.vistaFavoritos.set(false);
    this.busqueda.set('');
    this.categoria.set(encontrada?.id ?? 'inicio');
    this.articuloSeleccionado.set(item);
    const lista = [item.titulo, ...this.recientes().filter(t => t !== item.titulo)].slice(0, 8);
    this.recientes.set(lista);
    try { localStorage.setItem(this.claveRecientes, JSON.stringify(lista)); } catch { /* storage opcional */ }
  }

  mostrarArticulo(item: AyudaItem): void { this.abrirArticulo(item); }

  volverSeccion(): void { this.articuloSeleccionado.set(null); }

  contarResultados(secciones: AyudaSeccion[]): number { return secciones.reduce((n, s) => n + s.items.length, 0); }

  seccionActual = computed(
    () => this.secciones.find((s) => s.id === this.categoria()) ?? this.secciones[0]
  );

  totalPasos = computed(() =>
    this.secciones.reduce((acc, sec) => acc + sec.items.reduce((a, i) => a + i.pasos.length, 0), 0)
  );

  resultados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    if (!q) return null;
    return this.secciones
      .map((sec) => ({
        ...sec,
        items: sec.items.filter(
          (it) =>
            it.titulo.toLowerCase().includes(q) ||
            it.descripcion.toLowerCase().includes(q) ||
            it.pasos.some((p) => p.toLowerCase().includes(q)) ||
            (it.consejos ?? []).some((c) => c.toLowerCase().includes(q)) ||
            (it.keywords ?? []).some((k) => k.toLowerCase().includes(q)) ||
            (it.requiere ?? []).some((r) => r.toLowerCase().includes(q)) ||
            (it.resultado ?? '').toLowerCase().includes(q) ||
            sec.titulo.toLowerCase().includes(q)
        ),
      }))
      .filter((sec) => sec.items.length > 0);
  });

  onBuscar(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  toggle(titulo: string): void {
    const item = this.seccionActual().items.find(i => i.titulo === titulo);
    if (item) this.abrirArticulo(item, this.seccionActual());
    else this.abiertoItem.set(this.abiertoItem() === titulo ? null : titulo);
  }

  ir(ruta: string): void {
    this.cerrar();
    this.router.navigate([ruta]);
  }

  cerrar(): void {
    this.abierto.set(false);
    this.busqueda.set('');
    this.abiertoItem.set(null);
    this.articuloSeleccionado.set(null);
    this.vistaFavoritos.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.abierto()) this.cerrar();
  }

  @HostListener('document:keydown', ['$event'])
  onAtajoBusqueda(evento: KeyboardEvent): void {
    if (!this.abierto() || evento.key !== '/' || evento.ctrlKey || evento.metaKey || evento.altKey) return;
    const destino = evento.target as HTMLElement | null;
    if (destino && ['INPUT', 'TEXTAREA'].includes(destino.tagName)) return;
    evento.preventDefault();
    document.querySelector<HTMLInputElement>('[aria-label="Buscar en la ayuda"]')?.focus();
  }
}
