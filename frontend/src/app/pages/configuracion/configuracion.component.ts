import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Rol, Sucursal, Tratamiento } from '../../core/models';
import { DialogService } from '../../shared/dialog.service';

/** Usuario de equipo: la API /api/usuarios devuelve `rol` como string. */
interface EquipoUsuario {
  id: number;
  email: string;
  nombre: string;
  activo: boolean;
  rol: string | null;
}

@Component({
  selector: 'app-configuracion',
  imports: [FormsModule],
  template: `
    <div class="space-y-5">
      <div>
        <h1 class="text-2xl font-extrabold text-slate-800">Configuración</h1>
        <p class="text-sm text-slate-500">Sedes, equipo, catálogos y preferencias de la clínica.</p>
      </div>

      <!-- Cuenta -->
      <div class="card p-5 flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-blue-600">
        <div class="flex items-center gap-4">
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 text-xl font-extrabold text-white">
            {{ auth.usuario()?.nombre?.charAt(0) ?? '?' }}
          </div>
          <div>
            <p class="font-bold text-slate-800">{{ auth.usuario()?.nombre }}</p>
            <p class="text-sm text-slate-500">{{ auth.usuario()?.email }} · Rol: <span class="badge bg-blue-100 text-blue-700">{{ auth.usuario()?.rol?.nombre }}</span></p>
          </div>
        </div>
        <button class="btn-ghost" (click)="auth.logout()">Cerrar sesión</button>
      </div>

      <!-- Sedes -->
      <section class="card p-5">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-bold text-slate-800">🏥 Sedes</h2>
          <button class="btn-primary py-1.5 text-xs" (click)="nuevaSede()">+ Nueva sede</button>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          @for (s of sedes(); track s.id) {
            <div class="rounded-xl border border-slate-200 p-4 hover:border-primary-300 transition">
              <div class="flex items-start justify-between">
                <p class="font-semibold text-slate-800">{{ s.nombre }}</p>
                @if (s.activa) { <span class="badge bg-emerald-100 text-emerald-700">Activa</span> }
              </div>
              <p class="mt-1 text-xs text-slate-500">{{ s.direccion || '—' }}</p>
              <p class="text-xs text-slate-400">{{ s.telefono || '—' }}</p>
            </div>
          } @empty {
            <p class="text-sm text-slate-400">Sin sedes registradas.</p>
          }
        </div>
      </section>

      <!-- Gmail campañas -->
      @if (auth.usuario()?.rol?.nombre === 'admin') {
        <section class="card space-y-4 border-l-4 border-l-red-500 p-5">
          <div><h2 class="font-bold text-slate-800">✉ Remitente de campañas Gmail</h2><p class="mt-1 text-sm text-slate-500">Configura la cuenta remitente y sus credenciales OAuth. Los secretos se guardan únicamente en el backend y nunca se vuelven a mostrar.</p></div>
          <div class="rounded-xl bg-slate-50 p-3 text-sm"><span class="font-semibold">Estado:</span> {{ gmailConfigurado() ? 'Conectado · ' + gmailSender() : 'Pendiente de configurar' }}</div>
          <form class="grid gap-3 md:grid-cols-2" (ngSubmit)="guardarGmail()">
            <div><label class="label">Cuenta Gmail remitente</label><input class="input" type="email" name="sender_email" [(ngModel)]="gmailForm.sender_email" required placeholder="campanas@tuclinica.com"></div>
            <div><label class="label">OAuth Client ID</label><input class="input" name="client_id" [(ngModel)]="gmailForm.client_id" required autocomplete="off"></div>
            <div><label class="label">OAuth Client Secret</label><input class="input" type="password" name="client_secret" [(ngModel)]="gmailForm.client_secret" required autocomplete="new-password"></div>
            <div><label class="label">OAuth Refresh Token</label><input class="input" type="password" name="refresh_token" [(ngModel)]="gmailForm.refresh_token" required autocomplete="new-password"></div>
            <div class="md:col-span-2 flex flex-wrap items-center justify-between gap-3"><p class="max-w-2xl text-xs text-amber-800">Configura OAuth de Google con el permiso de envío de Gmail. Usa la cuenta autorizada de la clínica; no compartas sus secretos.</p><button class="btn-primary" [disabled]="guardandoGmail()">{{ guardandoGmail() ? 'Guardando…' : 'Guardar configuración Gmail' }}</button></div>
          </form>
        </section>

        <section class="card space-y-4 border-l-4 border-l-emerald-600 p-5">
          <div><h2 class="font-bold text-slate-800">WhatsApp Business · campañas y recordatorios</h2><p class="mt-1 text-sm text-slate-500">Conecta WhatsApp Business Cloud API. El token se guarda solo en backend. Los envíos promocionales usan una plantilla aprobada por Meta y requieren opt-in de WhatsApp.</p></div>
          <div class="rounded-xl border border-slate-200 p-3 text-sm"><span class="font-semibold">Número telefónico de la clínica:</span> +51 938 977 259 <span class="block text-xs text-slate-500">Referencia del número; Meta debe aprobarlo y asignarle un Phone Number ID antes de habilitar envíos.</span></div>
          <div class="rounded-xl bg-slate-50 p-3 text-sm"><span class="font-semibold">Estado:</span> {{ whatsappConfigurado() ? 'Conectado · número ' + whatsappPhoneId() : 'Pendiente de configurar' }}</div>
          <form class="grid gap-3 md:grid-cols-2" (ngSubmit)="guardarWhatsApp()">
            <div><label class="label">Phone Number ID</label><input class="input" name="phone_number_id" [(ngModel)]="whatsappForm.phone_number_id" required></div>
            <div><label class="label">WhatsApp Business Account ID</label><input class="input" name="business_account_id" [(ngModel)]="whatsappForm.business_account_id" required></div>
            <div><label class="label">Access Token</label><input class="input" type="password" name="access_token" [(ngModel)]="whatsappForm.access_token" required autocomplete="new-password"></div>
            <div><label class="label">Nombre de plantilla aprobada</label><input class="input" name="campaign_template" [(ngModel)]="whatsappForm.campaign_template" required placeholder="promocion_clinica"></div>
            <div><label class="label">Idioma de plantilla</label><input class="input" name="template_language" [(ngModel)]="whatsappForm.template_language" required placeholder="es"></div>
            <div class="flex items-end justify-end"><button class="btn-primary" [disabled]="guardandoWhatsApp()">{{ guardandoWhatsApp() ? 'Guardando…' : 'Guardar WhatsApp' }}</button></div>
          </form>
        </section>
      }

      <!-- Equipo -->
      <section class="card p-5">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-bold text-slate-800">👥 Equipo de trabajo</h2>
          <span class="text-xs text-slate-400">{{ usuarios().length }} usuarios</span>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-100">
            <thead class="bg-slate-50">
              <tr>
                <th class="th">Nombre</th>
                <th class="th">Correo</th>
                <th class="th">Rol</th>
                <th class="th">Estado</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (u of usuarios(); track u.id) {
                <tr class="hover:bg-primary-50/40">
                  <td class="td font-semibold text-slate-800">{{ u.nombre }}</td>
                  <td class="td text-sm text-slate-500">{{ u.email }}</td>
                  <td class="td"><span class="badge" [class]="claseRol(u.rol)">{{ u.rol }}</span></td>
                  <td class="td">
                    <span class="badge" [class]="u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'">
                      {{ u.activo ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <div class="grid gap-6 xl:grid-cols-2">
        <!-- Catálogo -->
        <section class="card p-5">
          <h2 class="mb-4 font-bold text-slate-800">🦷 Catálogo de tratamientos</h2>
          <p class="mb-3 text-sm text-slate-500">{{ tratamientos().length }} procedimientos configurados.</p>
          <div class="flex flex-wrap gap-2">
            @for (t of tratamientos(); track t.id) {
              <span class="badge bg-blue-50 text-blue-700 border border-blue-100">{{ t.nombre }} · {{ t.precio }}</span>
            }
          </div>
          <p class="mt-4 text-xs text-slate-400">Gestión completa disponible en <b>Tratamientos → Catálogo</b>.</p>
        </section>

        <!-- Roles -->
        <section class="card p-5">
          <h2 class="mb-4 font-bold text-slate-800">🔐 Roles y permisos</h2>
          <ul class="space-y-3 text-sm">
            @for (r of roles(); track r.id) {
              <li class="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                <span class="badge" [class]="claseRol(r.nombre)">{{ r.nombre }}</span>
                <span class="text-slate-600">{{ descripcionRol(r.nombre) }}</span>
              </li>
            }
          </ul>
        </section>
      </div>

      <!-- Acerca de -->
      <section class="card p-5 bg-gradient-to-r from-blue-800 to-blue-600 text-white">
        <p class="text-lg font-extrabold"><span class="text-white">Smilo</span><span class="text-amber-400">Fun</span></p>
        <p class="text-sm text-blue-100">
          Sistema de gestión odontológica con inteligencia artificial · v1.0 ·
          Angular 19 + FastAPI + PostgreSQL 17
        </p>
      </section>
    </div>

    <!-- Modal sede -->
    @if (modalSede()) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-primary-950/50 p-4 backdrop-blur-sm" (click)="modalSede.set(false)">
        <div class="card w-full max-w-md p-6" (click)="$event.stopPropagation()">
          <h2 class="mb-4 text-lg font-extrabold text-slate-800">Nueva sede</h2>
          <form class="grid gap-4" (ngSubmit)="guardarSede()">
            <div><label class="label">Nombre *</label><input class="input" name="nombre" [(ngModel)]="formSede.nombre" required></div>
            <div><label class="label">Dirección</label><input class="input" name="direccion" [(ngModel)]="formSede.direccion"></div>
            <div><label class="label">Teléfono</label><input class="input" name="telefono" [(ngModel)]="formSede.telefono"></div>
            <div class="flex justify-end gap-2">
              <button type="button" class="btn-ghost" (click)="modalSede.set(false)">Cancelar</button>
              <button class="btn-primary">Crear</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class ConfiguracionComponent {
  private dialog = inject(DialogService);
  private api = inject(ApiService);
  auth = inject(AuthService);

  sedes = signal<Sucursal[]>([]);
  usuarios = signal<EquipoUsuario[]>([]);
  roles = signal<Rol[]>([]);
  tratamientos = signal<Tratamiento[]>([]);
  gmailConfigurado = signal(false);
  gmailSender = signal('');
  guardandoGmail = signal(false);
  gmailForm = { sender_email: '', client_id: '', client_secret: '', refresh_token: '' };
  whatsappConfigurado = signal(false);
  whatsappPhoneId = signal('');
  guardandoWhatsApp = signal(false);
  whatsappForm = { phone_number_id: '', business_account_id: '', access_token: '', campaign_template: '', template_language: 'es' };

  modalSede = signal(false);
  formSede: any = {};

  constructor() {
    this.cargar();
    if (this.auth.usuario()?.rol?.nombre === 'admin') this.api.configGmailCampanas().subscribe({
      next: x => { this.gmailConfigurado.set(x.configured); this.gmailSender.set(x.sender_email || ''); this.gmailForm.sender_email = x.sender_email || ''; },
      error: e => { void this.dialog.apiError(e, 'No se pudo consultar la configuración de Gmail.'); },
    });
    if (this.auth.usuario()?.rol?.nombre === 'admin') this.api.configWhatsAppCampanas().subscribe({
      next: x => { this.whatsappConfigurado.set(x.configured); this.whatsappPhoneId.set(x.phone_number_id || ''); Object.assign(this.whatsappForm, { phone_number_id: x.phone_number_id || '', business_account_id: x.business_account_id || '', campaign_template: x.campaign_template || '', template_language: x.template_language || 'es' }); },
      error: e => { void this.dialog.apiError(e, 'No se pudo consultar la configuración de WhatsApp.'); },
    });
  }

  cargar(): void {
    this.api.sucursales().subscribe((s) => this.sedes.set(s));
    this.api.usuarios().subscribe((u) => this.usuarios.set(u));
    this.api.roles().subscribe((r) => this.roles.set(r));
    this.api.tratamientos().subscribe((t) => this.tratamientos.set(t));
  }

  nuevaSede(): void {
    this.formSede = { nombre: '', direccion: '', telefono: '' };
    this.modalSede.set(true);
  }

  guardarSede(): void {
    this.api.crearSucursal({ ...this.formSede, empresa_id: this.auth.usuario()?.empresa_id ?? undefined, activa: true }).subscribe({
      next: () => {
        this.modalSede.set(false);
        this.cargar();
      },
      error: (e) => { void this.dialog.apiError(e, 'No se pudo crear la sede.'); },
    });
  }

  guardarGmail(): void {
    this.guardandoGmail.set(true);
    this.api.guardarConfigGmailCampanas(this.gmailForm).subscribe({
      next: r => {
        this.guardandoGmail.set(false); this.gmailConfigurado.set(r.configured); this.gmailSender.set(r.sender_email);
        this.gmailForm.client_id = ''; this.gmailForm.client_secret = ''; this.gmailForm.refresh_token = '';
        void this.dialog.success({ title: 'Remitente Gmail configurado', text: 'Las credenciales se guardaron en el backend.' });
      },
      error: e => { this.guardandoGmail.set(false); void this.dialog.apiError(e, 'No se pudo guardar la configuración Gmail.'); },
    });
  }

  guardarWhatsApp(): void {
    this.guardandoWhatsApp.set(true);
    this.api.guardarConfigWhatsAppCampanas(this.whatsappForm).subscribe({
      next: r => { this.guardandoWhatsApp.set(false); this.whatsappConfigurado.set(r.configured); this.whatsappPhoneId.set(r.phone_number_id); this.whatsappForm.access_token = ''; void this.dialog.success({ title: 'WhatsApp configurado', text: 'El token se guardó de forma segura en el backend.' }); },
      error: e => { this.guardandoWhatsApp.set(false); void this.dialog.apiError(e, 'No se pudo guardar WhatsApp.'); },
    });
  }

  claseRol(rol: string | null | undefined): string {
    const mapa: Record<string, string> = {
      admin: 'bg-blue-100 text-blue-700',
      recepcion: 'bg-orange-100 text-orange-700',
      doctor: 'bg-emerald-100 text-emerald-700',
    };
    if (!rol) return 'bg-slate-100 text-slate-600';
    return mapa[rol.toLowerCase()] ?? 'bg-slate-100 text-slate-600';
  }

  descripcionRol(rol: string): string {
    const mapa: Record<string, string> = {
      admin: 'Acceso total: configuración, equipo, facturación, reportes e IA.',
      recepcion: 'Agenda, pacientes, facturación e inventario.',
      doctor: 'Su agenda, ficha clínica, odontograma y planes de tratamiento.',
    };
    return mapa[rol] ?? '';
  }
}
