import { Component, signal } from '@angular/core';

interface Contacto {
  iniciales: string;
  nombre: string;
  cargo: string;
  correo: string;
  celular?: string;
  telefonoTel?: string;
  tema: string;
  color: 'ambar' | 'violeta';
}

@Component({
  selector: 'app-contacto',
  imports: [],
  template: `
    <main class="mx-auto max-w-5xl space-y-7">
      <header class="rounded-3xl bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-900 p-7 text-white shadow-lg sm:p-9">
        <p class="text-xs font-extrabold uppercase tracking-[.2em] text-amber-300">SmiloFun · Soporte</p>
        <h1 class="mt-2 text-3xl font-extrabold">Contáctenos</h1>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-purple-100">Comunícate directamente con nuestro equipo. Elige el contacto adecuado y envía tu consulta por correo.</p>
      </header>

      <section class="grid gap-5 md:grid-cols-2" aria-label="Contactos del equipo">
        @for (persona of contactos; track persona.correo) {
          <article class="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-purple-300 hover:shadow-xl">
            <div class="relative overflow-hidden bg-gradient-to-br from-purple-950 to-purple-800 p-6 text-white">
              <div class="absolute -right-8 -top-10 h-36 w-36 rounded-full border border-white/10"></div>
              <div class="absolute -right-2 -top-4 h-24 w-24 rounded-full border border-amber-300/20"></div>
              <div class="relative flex items-center gap-4">
                <div class="grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-2xl border border-amber-200/40 bg-amber-300 text-xl font-black text-purple-950 shadow-lg shadow-purple-950/30">{{ persona.iniciales }}</div>
                <div class="min-w-0">
                  <p class="text-[10px] font-bold uppercase tracking-[.17em] text-amber-300">Equipo SmiloFun</p>
                  <h2 class="mt-1 break-words text-xl font-extrabold leading-tight">{{ persona.nombre }}</h2>
                  <p class="mt-1 text-sm font-semibold text-purple-100">{{ persona.cargo }}</p>
                </div>
              </div>
            </div>

            <div class="space-y-4 p-6">
              <div class="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5">
                <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-100 text-purple-800">
                  <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0l-9.75 6.093-9.75-6.093"/></svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Correo electrónico</p>
                  <a class="break-all text-sm font-bold text-purple-800 hover:underline" [attr.href]="'mailto:' + persona.correo">{{ persona.correo }}</a>
                </div>
                <button class="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-white hover:text-purple-800" type="button" (click)="copiar(persona.correo, persona.correo)">{{ copiado() === persona.correo ? '✓ Copiado' : 'Copiar' }}</button>
              </div>

              @if (persona.celular) {
                <div class="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5">
                  <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/></svg>
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Teléfono</p>
                    <a class="text-sm font-bold text-slate-700 hover:text-purple-800 hover:underline" [attr.href]="'tel:' + persona.telefonoTel">{{ persona.celular }}</a>
                  </div>
                  <button class="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-white hover:text-purple-800" type="button" (click)="copiar(persona.celular, persona.correo + '-tel')">{{ copiado() === persona.correo + '-tel' ? '✓ Copiado' : 'Copiar' }}</button>
                </div>
              }

              <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <span class="rounded-full px-3 py-1 text-[11px] font-bold" [class.bg-amber-100]="persona.color === 'ambar'" [class.text-amber-800]="persona.color === 'ambar'" [class.bg-violet-100]="persona.color === 'violeta'" [class.text-violet-800]="persona.color === 'violeta'">{{ persona.tema }}</span>
                <div class="flex gap-2">
                  <a class="btn-primary text-xs" [attr.href]="'mailto:' + persona.correo">Escribir correo</a>
                  @if (persona.celular) { <a class="btn-ghost text-xs" [attr.href]="'tel:' + persona.telefonoTel">Llamar</a> }
                </div>
              </div>
            </div>
          </article>
        }
      </section>

      <p class="text-center text-xs text-slate-400">© 2026 SmiloFun · Centro Odontológico Inteligente</p>
    </main>
  `,
})
export class ContactoComponent {
  readonly contactos: Contacto[] = [
    {
      iniciales: 'MA',
      nombre: 'MAURICIO ANTONIO ANGULO MARTÍNEZ',
      cargo: 'Gerente de la División de Fábrica',
      correo: 'mauricioangulo4@gmail.com',
      celular: '(051) 938977259',
      telefonoTel: '051938977259',
      tema: 'Gestión y soporte',
      color: 'ambar',
    },
    {
      iniciales: 'FC',
      nombre: 'FARIDE CECILIA CONTRERAS CASIS',
      cargo: 'Coordinadora de Marketing',
      correo: 'faridecontrerascasis7@gmail.com',
      tema: 'Marketing y comunicación',
      color: 'violeta',
    },
  ];

  readonly copiado = signal<string | null>(null);

  copiar(valor: string, clave: string): void {
    const ok = () => {
      this.copiado.set(clave);
      setTimeout(() => { if (this.copiado() === clave) this.copiado.set(null); }, 2000);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(valor).then(ok, ok);
    else ok();
  }
}
