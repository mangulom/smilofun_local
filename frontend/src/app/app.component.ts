import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { IntroComponent } from './intro.component';
import { LoadingComponent } from './shared/loading.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, IntroComponent, LoadingComponent],
  template: `
    @if (showIntro()) {
      <app-intro />
    } @else {
      <router-outlet />
    }
    <app-loading />
  `,
})
export class AppComponent implements OnInit {
  showIntro = signal(true);

  constructor(private router: Router, private auth: AuthService) {}

  /** Intro de SmiloFun: 5 s de pantalla inicial y luego al panel o al login. */
  ngOnInit(): void {
    setTimeout(() => {
      this.showIntro.set(false);
      if (this.auth.autenticado) {
        this.router.navigate(['/']);
      } else {
        this.router.navigate(['/login']);
      }
    }, 5000);
  }
}
