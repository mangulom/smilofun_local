import { Component, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from './sidebar.component';
import { HeaderComponent } from './header.component';
import { FooterComponent } from './footer.component';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, NgClass, SidebarComponent, HeaderComponent, FooterComponent],
  template: `
    <div class="h-screen overflow-hidden bg-slate-100">
      <!-- Sidebar -->
      <app-sidebar
        [abierta]="sidebarAbierta()"
        [colapsada]="sidebarColapsada()"
        (cerrar)="sidebarAbierta.set(false)"
        (toggleColapsar)="sidebarColapsada.set(!sidebarColapsada())"
        class="lg:fixed lg:inset-y-0 lg:left-0 lg:z-30"
      />
      @if (sidebarAbierta()) {
        <div
          class="fixed inset-0 z-20 bg-purple-950/50 backdrop-blur-sm lg:hidden"
          (click)="sidebarAbierta.set(false)"
        ></div>
      }

      <!-- Área principal: header arriba, footer SIEMPRE visible abajo, solo el contenido hace scroll -->
      <div
        class="flex h-screen w-full flex-col overflow-hidden"
        [ngClass]="sidebarColapsada() ? 'lg:pl-16' : 'lg:pl-64'"
      >
        <app-header (abrirSidebar)="sidebarAbierta.set(true)" />
        <main class="flex-1 overflow-y-auto p-6">
          <router-outlet />
        </main>
        <app-footer />
      </div>
    </div>
  `,
})
export class LayoutComponent {
  sidebarAbierta = signal(false);
  sidebarColapsada = signal(false);
}
