import { Component } from '@angular/core';

/**
 * Intro animado de SmiloFun: pantalla completa con degradado índigo/púrpura,
 * logo, nombre del producto letra a letra cayendo desde arriba (la cola
 * "Fun" en ámbar), subtítulos y barra de progreso que se llena en 5 s.
 */
@Component({
  selector: 'app-intro',
  template: `
    <div
      class="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 overflow-hidden"
    >
      <div class="absolute inset-0 opacity-10">
        <div class="absolute inset-0" [style.background-image]="patron"></div>
      </div>

      <div class="relative flex flex-col items-center intro-fade-in">
        <img
          src="logo.svg"
          alt="SmiloFun"
          class="w-24 h-24 rounded-3xl shadow-2xl shadow-purple-900/60 mb-6"
        />

        <h1 class="text-4xl font-bold text-white tracking-tight">
          @for (l of letras; track l.char + '-' + l.delay) {
            <span
              class="letter"
              [class.text-amber-400]="l.fun"
              [style.animation-delay]="l.delay + 's'"
              >{{ l.char }}</span
            >
          }
        </h1>

        <p class="text-indigo-300 text-sm mt-3 tracking-[0.3em] uppercase">
          Centro Odontológico Inteligente
        </p>
        <p class="text-indigo-400/70 text-xs mt-1">
          Pacientes · Odontograma · Citas · Facturación
        </p>

        <div class="w-48 h-1 bg-white/10 rounded-full mt-10 overflow-hidden">
          <div class="h-full bg-amber-400 rounded-full intro-bar"></div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      @keyframes introFadeIn {
        0% {
          opacity: 0;
          transform: scale(0.92);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      .intro-fade-in {
        animation: introFadeIn 0.8s ease-out both;
      }

      @keyframes introBar {
        0% {
          width: 0%;
        }
        to {
          width: 100%;
        }
      }
      .intro-bar {
        animation: introBar 5s linear forwards;
      }

      .letter {
        display: inline-block;
        opacity: 0;
        animation: letterDrop 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }
      @keyframes letterDrop {
        0% {
          transform: translateY(-60vh);
          opacity: 0;
        }
        55% {
          transform: translateY(8px);
          opacity: 1;
        }
        75% {
          transform: translateY(-4px);
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `,
  ],
})
export class IntroComponent {
  /** "SmiloFun" letra a letra: "Smilo" en blanco y la cola "Fun" en ámbar. */
  letras = 'SmiloFun'
    .split('')
    .map((char, i) => ({ char, fun: i >= 5, delay: i * 0.09 }));

  /** Mismo patrón de cruces SVG de fondo, al 10 % de opacidad. */
  patron = `url('data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ffffff" fill-opacity="0.4"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')`;
}
