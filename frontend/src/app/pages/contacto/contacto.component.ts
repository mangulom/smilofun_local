import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-contacto',
  imports: [],
  template: `
    <div class="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 class="text-2xl font-extrabold text-slate-800">Contáctenos</h1>
        <p class="text-sm text-slate-500">
          Información de contacto para soporte, dudas o mejoras del sistema SmiloFun.
        </p>
      </div>

      <!-- Tarjeta principal de contacto -->
      <div class="card overflow-hidden">
        <div class="bg-purple-950 px-6 py-5 text-white">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Contacto</p>
          <div class="mt-3 flex items-center gap-4">
            <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-xl font-extrabold text-purple-950">
              MA
            </div>
            <div class="min-w-0">
              <p class="text-lg font-extrabold leading-tight break-words">{{ nombre }}</p>
              <p class="mt-1 text-xs text-purple-300">SmiloFun · Centro Odontológico Inteligente</p>
            </div>
          </div>
        </div>

        <div class="divide-y divide-slate-100">
          <!-- Nombre -->
          <div class="flex flex-wrap items-center gap-3 px-6 py-4">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.25a7.5 7.5 0 0115 0" />
              </svg>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-[11px] uppercase tracking-wide text-slate-400">Nombre completo</p>
              <p class="font-semibold text-slate-700">{{ nombre }}</p>
            </div>
            <button class="btn-ghost text-xs" type="button" (click)="copiar(nombre, 'nombre')">
              {{ copiado() === 'nombre' ? '✓ Copiado' : 'Copiar' }}
            </button>
          </div>

          <!-- Correo -->
          <div class="flex flex-wrap items-center gap-3 px-6 py-4">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0l-9.75 6.093-9.75-6.093" />
              </svg>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-[11px] uppercase tracking-wide text-slate-400">Correo electrónico</p>
              <a class="font-semibold text-primary-700 hover:underline" [attr.href]="'mailto:' + correo">{{ correo }}</a>
            </div>
            <button class="btn-ghost text-xs" type="button" (click)="copiar(correo, 'correo')">
              {{ copiado() === 'correo' ? '✓ Copiado' : 'Copiar' }}
            </button>
            <a class="btn-primary text-xs" [attr.href]="'mailto:' + correo">Escribir</a>
          </div>

          <!-- Celular -->
          <div class="flex flex-wrap items-center gap-3 px-6 py-4">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-[11px] uppercase tracking-wide text-slate-400">Celular</p>
              <a class="font-semibold text-slate-700 hover:text-primary-700 hover:underline" [attr.href]="'tel:' + telefonoTel">{{ celular }}</a>
            </div>
            <button class="btn-ghost text-xs" type="button" (click)="copiar(celular, 'celular')">
              {{ copiado() === 'celular' ? '✓ Copiado' : 'Copiar' }}
            </button>
            <a class="btn-primary text-xs" [attr.href]="'tel:' + telefonoTel">Llamar</a>
          </div>
        </div>
      </div>

      <!-- Tarjetas rápidas -->
      <div class="grid gap-4 sm:grid-cols-2">
        <a class="card group flex items-center gap-3 p-4 transition hover:border-primary-400" [attr.href]="'mailto:' + correo">
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-100 text-accent-700">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0l-9.75 6.093-9.75-6.093" />
            </svg>
          </span>
          <span class="min-w-0">
            <span class="block text-sm font-bold text-slate-700 group-hover:text-primary-700">Enviar correo</span>
            <span class="block truncate text-xs text-slate-400">{{ correo }}</span>
          </span>
        </a>
        <a class="card group flex items-center gap-3 p-4 transition hover:border-primary-400" [attr.href]="'tel:' + telefonoTel">
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
          </span>
          <span class="min-w-0">
            <span class="block text-sm font-bold text-slate-700 group-hover:text-primary-700">Llamar por celular</span>
            <span class="block truncate text-xs text-slate-400">{{ celular }}</span>
          </span>
        </a>
      </div>

      <p class="text-center text-xs text-slate-400">
        © 2026 SmiloFun · Postgres 17 · FastAPI · Angular 19
      </p>
    </div>
  `,
})
export class ContactoComponent {
  readonly nombre = 'MAURICIO ANTONIO ANGULO MARTÍNEZ';
  readonly correo = 'mauricioangulo4@gmail.com';
  readonly celular = '(051) 938977259';
  /** Solo dígitos para los enlaces tel: */
  readonly telefonoTel = '051938977259';

  readonly copiado = signal<string | null>(null);

  copiar(valor: string, clave: string): void {
    const ok = () => {
      this.copiado.set(clave);
      setTimeout(() => {
        if (this.copiado() === clave) this.copiado.set(null);
      }, 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(valor).then(ok, ok);
    } else {
      ok();
    }
  }
}
