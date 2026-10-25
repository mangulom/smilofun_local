import { Component } from '@angular/core';

@Component({
  selector: 'app-footer',
  template: `
    <footer
      class="flex shrink-0 items-center justify-between border-t-2 border-amber-400/40 bg-purple-950 px-6 py-2.5"
    >
      <!-- Izquierda: marca -->
      <div class="flex items-center gap-2">
        <img src="logo.svg" alt="SmiloFun" class="h-6 w-6 shrink-0 rounded-md" />
        <span class="text-sm font-bold"
          ><span class="text-white">Smilo</span><span class="text-amber-400">Fun</span></span
        >
        <span class="text-xs text-amber-200/60">Gestión dental con IA</span>
        <span class="text-sm font-semibold text-amber-400">v1.0.0</span>
      </div>

      <!-- Derecha: tecnología -->
      <div class="flex items-center gap-2 text-xs">
        <span class="flex items-center gap-1.5">
          <!-- Base de datos -->
          <svg
            class="h-3.5 w-3.5 text-amber-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
            <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
          </svg>
          <span class="text-amber-200/60">PostgreSQL <span class="font-semibold text-amber-300">17</span></span>
        </span>
        <span class="h-1 w-1 rounded-full bg-amber-400/40"></span>
        <span class="flex items-center gap-1.5">
          <!-- Rayo / API -->
          <svg class="h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2L4.5 13.5H11l-1 8.5 9-12h-6.5L13 2z" />
          </svg>
          <span class="text-amber-200/60">FastAPI</span>
        </span>
        <span class="h-1 w-1 rounded-full bg-amber-400/40"></span>
        <span class="flex items-center gap-1.5">
          <!-- Escudo Angular -->
          <svg class="h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2L2.5 5.5 4 18.5 12 22l8-3.5 1.5-13L12 2zm0 2.3l6.2 11.4-.9 5.5L12 20l-5.3-1.8-.9-5.5L12 4.3z"
            />
            <path
              d="M12 6.5L7.5 16.5h1.9l.9-2.2h3.4l.9 2.2h1.9L12 6.5zm0 3.4l1.1 2.8h-2.2L12 9.9z"
            />
          </svg>
          <span class="text-amber-200/60">Angular <span class="font-semibold text-amber-300">19</span></span>
        </span>
      </div>
    </footer>
  `,
})
export class FooterComponent {}
