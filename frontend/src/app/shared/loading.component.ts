import { Component, inject } from '@angular/core';
import { LoadingService } from './loading.service';

@Component({
  selector: 'app-loading',
  standalone: true,
  template: `
    @if (loading.active()) {
      <div class="loading-backdrop" role="status" aria-live="assertive" aria-atomic="true">
        <div class="loading-card">
          <div class="loading-orbit" aria-hidden="true">
            <span class="loading-orbit-ring ring-one"></span>
            <span class="loading-orbit-ring ring-two"></span>
            <span class="loading-orbit-ring ring-three"></span>
            <span class="loading-core"><span class="loading-tooth">✦</span></span>
            <span class="loading-spark spark-one">✦</span>
            <span class="loading-spark spark-two">·</span>
            <span class="loading-spark spark-three">✧</span>
          </div>
          <p class="loading-message">{{ loading.message() }}</p>
          <div class="loading-progress" aria-hidden="true"><span></span></div>
          <span class="loading-caption">SMILOFUN · GESTIÓN INTELIGENTE</span>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { position: relative; z-index: 10000; }
    .loading-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 1.25rem; background: rgb(21 12 43 / 50%); backdrop-filter: blur(7px); animation: loading-fade-in .18s ease-out; }
    .loading-card { width: min(21rem, 90vw); min-height: 19rem; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 2rem 1.5rem; border: 1px solid rgb(255 255 255 / 70%); border-radius: 1.75rem; background: linear-gradient(150deg, #fff 0%, #faf7ff 58%, #f3edff 100%); box-shadow: 0 30px 90px rgb(20 8 44 / 35%), inset 0 1px 0 #fff; }
    .loading-orbit { position: relative; width: 8rem; height: 8rem; display: grid; place-items: center; margin-bottom: 1.5rem; }
    .loading-orbit-ring { position: absolute; inset: 0; border: 1px solid rgb(124 58 237 / 18%); border-radius: 50%; }
    .ring-one { animation: orbit-spin 5s linear infinite; border-top: 2px solid #8b5cf6; border-right-color: transparent; }
    .ring-two { inset: .65rem; border: 1px dashed rgb(139 92 246 / 40%); animation: orbit-spin 8s linear infinite reverse; }
    .ring-three { inset: 1.35rem; border-left: 2px solid #f4b400; border-bottom-color: transparent; animation: orbit-spin 3.5s linear infinite; }
    .loading-core { width: 4.2rem; height: 4.2rem; display: grid; place-items: center; border-radius: 1.35rem; color: white; background: linear-gradient(145deg, #7c3aed, #3b1678); box-shadow: 0 12px 25px rgb(91 33 182 / 30%); animation: core-float 1.7s ease-in-out infinite; }
    .loading-tooth { font-size: 2rem; line-height: 1; color: #facc15; text-shadow: 0 0 16px rgb(250 204 21 / 45%); animation: core-glow 1.3s ease-in-out infinite alternate; }
    .loading-spark { position: absolute; color: #eab308; font-weight: 900; animation: spark-pulse 1.3s ease-in-out infinite alternate; }
    .spark-one { top: .3rem; right: .25rem; font-size: 1rem; }.spark-two { bottom: .5rem; left: .1rem; font-size: 2rem; color: #8b5cf6; animation-delay: .4s; }.spark-three { top: 2rem; left: .2rem; font-size: 1.2rem; color: #a78bfa; animation-delay: .7s; }
    .loading-message { min-height: 1.5rem; margin: 0; text-align: center; color: #32105f; font-size: .9rem; font-weight: 900; letter-spacing: .16em; }
    .loading-progress { width: 11rem; height: .28rem; overflow: hidden; margin-top: 1rem; border-radius: 999px; background: #e9ddff; }
    .loading-progress span { display: block; width: 42%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #7c3aed, #facc15); animation: progress-slide 1.15s ease-in-out infinite; }
    .loading-caption { margin-top: 1rem; color: #8b7aa7; font-size: .56rem; font-weight: 800; letter-spacing: .18em; }
    @keyframes loading-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes orbit-spin { to { transform: rotate(360deg); } }
    @keyframes core-float { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-4px) scale(1.04); } }
    @keyframes core-glow { from { transform: scale(.92) rotate(-8deg); } to { transform: scale(1.08) rotate(8deg); } }
    @keyframes spark-pulse { from { opacity: .45; transform: scale(.8); } to { opacity: 1; transform: scale(1.15); } }
    @keyframes progress-slide { from { transform: translateX(-120%); } to { transform: translateX(260%); } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; } }
  `],
})
export class LoadingComponent { readonly loading = inject(LoadingService); }
