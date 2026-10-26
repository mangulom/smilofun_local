import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { cargarConfiguracion } from './app/core/runtime-config';

cargarConfiguracion()
  .then(() => bootstrapApplication(AppComponent, appConfig))
  .catch((err) => console.error(err));
