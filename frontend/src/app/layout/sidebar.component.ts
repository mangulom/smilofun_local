import { Component, Input, Output, EventEmitter, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth.service';

interface NavItem {
  ruta: string;
  etiqueta: string;
  path: string;
  /** Solo se muestra a usuarios con rol de administrador. */
  soloAdmin?: boolean;
}

interface Seccion {
  titulo: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside
      class="font-roboto fixed inset-y-0 left-0 z-30 flex max-lg:w-64 flex-col bg-purple-950 text-purple-300 transition-all duration-300 lg:translate-x-0"
      [class.-translate-x-full]="!abierta"
      [class.w-64]="!colapsada"
      [class.w-16]="colapsada"
    >
      <!-- Marca -->
      <div class="flex items-center gap-3 border-b border-purple-900 px-4 py-5">
        <img src="logo.svg" alt="SmiloFun" class="h-8 w-8 shrink-0 rounded-lg" />
        @if (!colapsada) {
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-bold leading-tight text-white">
              <span>Smilo</span><span class="text-amber-400">Fun</span>
            </p>
            <p class="mt-0.5 text-[10px] leading-tight text-amber-400/80">
              Centro Odontológico Inteligente
            </p>
          </div>
          <button
            class="rounded-lg p-1.5 text-purple-300 transition hover:bg-purple-900 hover:text-white lg:hidden"
            (click)="cerrar.emit()"
            aria-label="Cerrar menú"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        }
      </div>

      <!-- Navegación por secciones -->
      <nav class="flex-1 space-y-6 overflow-y-auto px-2 py-4">
        @for (sec of secciones; track sec.titulo) {
          @if (hayVisibles(sec)) {
          <div>
            @if (!colapsada) {
              <p class="mb-2 px-3 text-[9px] font-semibold uppercase tracking-wider text-purple-400">
                {{ sec.titulo }}
              </p>
            }
            @for (item of sec.items; track item.ruta) {
              @if (!item.soloAdmin || esAdmin()) {
              <a
                [routerLink]="item.ruta"
                routerLinkActive="!bg-amber-400 !text-purple-950"
                [routerLinkActiveOptions]="{ exact: item.ruta === '/dashboard' || item.ruta === '/ia' || item.ruta === '/diseno3d' || item.ruta === '/inventario' }"
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors hover:bg-purple-900 hover:text-white"
                [title]="colapsada ? item.etiqueta : null"
              >
                <svg
                  class="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path [attr.d]="item.path" />
                </svg>
                @if (!colapsada) {
                  <span>{{ item.etiqueta }}</span>
                }
              </a>
              }
            }
          </div>
          }
        }
      </nav>

      <!-- Colapsar menú -->
      <button
        class="hidden items-center justify-center border-t border-purple-900 p-3 transition-colors hover:bg-purple-900 lg:flex"
        (click)="toggleColapsar.emit()"
        title="Colapsar menú"
        aria-label="Colapsar menú"
      >
        <svg
          class="h-5 w-5 transition-transform"
          [class.rotate-180]="colapsada"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      </button>
    </aside>
  `,
})
export class SidebarComponent {
  @Input() abierta = false;
  @Input() colapsada = false;
  @Output() cerrar = new EventEmitter<void>();
  @Output() toggleColapsar = new EventEmitter<void>();

  private readonly auth = inject(AuthService);
  hayVisibles(sec: Seccion): boolean {
    return sec.items.some((i) => !i.soloAdmin || this.esAdmin());
  }

  readonly esAdmin = computed(() =>
    (this.auth.usuario()?.rol?.nombre ?? '').toLowerCase().includes('admin'),
  );

  readonly secciones: Seccion[] = [
    {
      titulo: 'General',
      items: [
        {
          ruta: '/dashboard',
          etiqueta: 'Dashboard',
          path: 'M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75',
        },
        {
          ruta: '/pacientes',
          etiqueta: 'Pacientes',
          path: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
        },
        {
          ruta: '/citas',
          etiqueta: 'Agenda / Citas',
          path: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
        },
        {
          ruta: '/doctores',
          etiqueta: 'Doctores',
          path: 'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0',
        },
        {
          ruta: '/tratamientos',
          etiqueta: 'Tratamientos',
          path: 'M12 4C10.5 2.5 8 2 6 3 3.5 4.2 2.5 7 3 10c.4 2.4 1.5 4.6 2.4 6.8.6 1.5 1 3.2 2.1 3.2 1 0 1.3-1.2 1.6-2.6.3-1.4.6-2.8 1.4-2.8h.1c.8 0 1.1 1.4 1.4 2.8.3 1.4.6 2.6 1.6 2.6 1.1 0 1.5-1.7 2.1-3.2C19.5 14.6 20.6 12.4 21 10c.5-3-.5-5.8-3-7-2-1-4.5-.5-6 1z',
        },
      ],
    },
    {
      titulo: 'IA',
      items: [
        {
          ruta: '/ia',
          etiqueta: 'Panel IA',
          path: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z',
        },
        {
          ruta: '/ia/asistente',
          etiqueta: 'Asistente IA',
          path: 'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155',
        },
        {
          ruta: '/ia/no-show',
          etiqueta: 'Riesgo de Inasistencia',
          path: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
        },
        {
          ruta: '/ia/ingresos',
          etiqueta: 'Proyección de Ingresos',
          path: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
        },
        {
          ruta: '/ia/pacientes',
          etiqueta: 'Segmentación de Pacientes',
          path: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
        },
        {
          ruta: '/ia/inventario',
          etiqueta: 'Inventario Predictivo',
          path: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
        },
        {
          ruta: '/ia/agenda',
          etiqueta: 'Agenda Inteligente',
          path: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
        },
        {
          ruta: '/ia/historial',
          etiqueta: 'Historial de Predicciones',
          path: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
        },
      ],
    },
    {
      titulo: 'Diseño 3D Dental',
      items: [
        {
          ruta: '/diseno3d',
          etiqueta: 'Diseño de Prótesis',
          path: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
        },
        {
          ruta: '/diseno3d/catalogo',
          etiqueta: 'Catálogo de Piezas',
          path: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
        },
        {
          ruta: '/diseno3d/historial',
          etiqueta: 'Historial de Diseños',
          path: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
        },
      ],
    },
    {
      titulo: 'Gestión',
      items: [
        {
          ruta: '/facturacion',
          etiqueta: 'Facturación',
          path: 'M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z',
        },
        {
          ruta: '/inventario',
          etiqueta: 'Insumos',
          path: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
        },
        {
          ruta: '/inventario/proveedores',
          etiqueta: 'Proveedores',
          path: 'M16 11V7a4 4 0 0 0-8 0v4M5 11h14l1 10H4l1-10z',
        },
        {
          ruta: '/inventario/compras',
          etiqueta: 'Compras de insumos',
          path: 'M3 3h2l2.2 11.2A2 2 0 0 0 9.2 16H18a2 2 0 0 0 2-1.6L21 8H6M10 21h.01M18 21h.01',
        },
        {
          ruta: '/reportes',
          etiqueta: 'Reportes',
          path: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
        },
        {
          ruta: '/campanas',
          etiqueta: 'Campañas',
          soloAdmin: true,
          path: 'M3 11v2a1 1 0 001 1h2l4 5V5l-4 5H4a1 1 0 00-1 1zm9-3a5 5 0 010 8m3-11a9 9 0 010 14',
        },
        {
          ruta: '/empresas',
          etiqueta: 'Empresas',
          path: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
        },
        {
          ruta: '/usuarios',
          etiqueta: 'Usuarios',
          path: 'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z',
        },
        {
          ruta: '/configuracion',
          etiqueta: 'Configuración',
          path: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
        },
      ],
    },
    {
      titulo: 'Mantenimiento',
      items: [
        {
          ruta: '/mantenimiento/respaldo',
          etiqueta: 'Copia de Respaldo de Base de Datos',
          soloAdmin: true,
          path: 'M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3-3.582 3-8 3-8-1.343-8-3zm0 0v5c0 1.657 3.582 3 8 3s8-1.343 8-3V7m-16 5v5c0 1.657 3.582 3 8 3s8-1.343 8-3v-5',
        },
        {
          ruta: '/mantenimiento/restaurar',
          etiqueta: 'Restaurar Base de Datos',
          soloAdmin: true,
          path: 'M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4',
        },
      ],
    },
    {
      titulo: 'Soporte',
      items: [
        {
          ruta: '/contacto',
          etiqueta: 'Contáctenos',
          path: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0l-9.75 6.093-9.75-6.093',
        },
      ],
    },
  ];
}
