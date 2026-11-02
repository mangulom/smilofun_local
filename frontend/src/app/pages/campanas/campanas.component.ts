import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EmpresaService } from '../../core/empresa.service';
import { ApiService } from '../../core/api.service';
import { DialogService } from '../../shared/dialog.service';
import { LoadingService } from '../../shared/loading.service';

interface Oferta { tratamiento: string; precioRegular: number; precioOferta: number; }

@Component({
  selector: 'app-campanas',
  imports: [FormsModule],
  template: `
    <div class="mx-auto max-w-7xl space-y-6">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div><p class="text-xs font-bold uppercase tracking-[.18em] text-purple-700">Marketing · {{ empresa.nombreActual() }}</p><h1 class="mt-1 text-3xl font-extrabold text-slate-900">Campañas promocionales</h1><p class="mt-2 max-w-3xl text-sm text-slate-500">Diseña un correo promocional con varias ofertas, revisa el HTML y su vista previa antes de enviarlo.</p></div>
        <span class="rounded-full border px-3 py-1.5 text-xs font-bold" [class.border-emerald-300]="gmailConfigurado()" [class.bg-emerald-50]="gmailConfigurado()" [class.text-emerald-800]="gmailConfigurado()" [class.border-amber-300]="!gmailConfigurado()" [class.bg-amber-50]="!gmailConfigurado()" [class.text-amber-800]="!gmailConfigurado()">{{ gmailConfigurado() ? 'Gmail conectado' : 'Gmail no conectado' }}</span>
      </header>

      <section class="grid gap-3 md:grid-cols-2">
        <article class="rounded-2xl border border-red-100 bg-white p-4 shadow-sm"><p class="text-xs font-extrabold uppercase tracking-wider text-red-700">✉ Gmail · correo promocional</p><p class="mt-1 text-sm text-slate-600">{{ gmailConfigurado() ? 'Remitente: ' + gmailRemitente() + '. Solo pacientes con consentimiento vigente y sin baja.' : 'Configura el remitente y OAuth desde Configuración para habilitar envíos.' }}</p></article>
        <article class="rounded-2xl border border-fuchsia-100 bg-white p-4 shadow-sm"><p class="text-xs font-extrabold uppercase tracking-wider text-fuchsia-700">▶ Meta · Reel promocional</p><p class="mt-1 text-sm text-slate-600">{{ metaConfigurado() ? 'Meta está configurado; publicar requiere un video vertical y confirmación.' : 'Un Reel se publica en la cuenta, no se envía como mensaje privado. Meta aún requiere app, permisos y video.' }}</p></article>
      </section>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,.9fr)]">
        <section class="card space-y-5 p-5 sm:p-6">
          <div><h2 class="text-lg font-extrabold text-slate-800">Contenido de campaña</h2><p class="text-xs text-slate-500">Completa los datos; la vista previa se actualiza al instante.</p></div>
          <div><label class="label">Nombre interno de campaña</label><input class="input" [(ngModel)]="nombre" placeholder="Ej.: Sonríe esta temporada"></div>
          <div><label class="label">Asunto del correo</label><input class="input" [(ngModel)]="asunto" placeholder="Una oferta especial para tu sonrisa"></div>
          <div><label class="label">Título principal</label><input class="input" [(ngModel)]="titulo" placeholder="¡Ofertas para cuidar tu sonrisa!"></div>
          <div><label class="label">Mensaje</label><textarea class="input" rows="3" [(ngModel)]="mensaje" placeholder="Escribe una introducción breve para tus pacientes."></textarea></div>

          <section class="rounded-xl border border-slate-200 p-4">
            <div class="flex items-center justify-between gap-3"><div><h3 class="font-bold text-slate-800">Ofertas de tratamientos</h3><p class="text-xs text-slate-500">Agrega uno o más tratamientos y precios.</p></div><button class="btn-ghost text-sm" type="button" (click)="agregarOferta()">+ Añadir tratamiento</button></div>
            <div class="mt-4 space-y-3">
              @for (oferta of ofertas(); track $index) {
                <div class="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_115px_115px_auto] sm:items-end">
                  <div><label class="label">Tratamiento / promoción</label><input class="input" [(ngModel)]="oferta.tratamiento" [name]="'tratamiento' + $index" placeholder="Limpieza dental"></div>
                  <div><label class="label">Precio regular</label><input class="input" type="number" min="0" step="0.01" [(ngModel)]="oferta.precioRegular" [name]="'regular' + $index"></div>
                  <div><label class="label">Precio oferta</label><input class="input" type="number" min="0" step="0.01" [(ngModel)]="oferta.precioOferta" [name]="'oferta' + $index"></div>
                  <button class="rounded-lg px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50" type="button" (click)="quitarOferta($index)" [disabled]="ofertas().length === 1" aria-label="Quitar oferta">Quitar</button>
                  @if (descuento(oferta) > 0) { <p class="sm:col-span-4 text-xs font-bold text-emerald-700">Ahorro {{ descuento(oferta) }}% · S/ {{ ahorro(oferta).toFixed(2) }}</p> }
                </div>
              }
            </div>
          </section>

          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="label">Texto del botón</label><input class="input" [(ngModel)]="textoBoton" placeholder="Reserva tu cita"></div>
            <div><label class="label">Enlace de reserva (opcional)</label><input class="input" type="url" [(ngModel)]="urlBoton" placeholder="https://tu-sitio/reservar"></div>
          </div>

          @if (error()) { <p class="rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ error() }}</p> }
          @if (resultado()) { <p class="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{{ resultado() }}</p> }
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Envío real.</b> Revisa empresa, contenido y destinatarios con consentimiento vigente antes de confirmar.</div>
          <div class="flex flex-wrap gap-2"><button class="btn-ghost" type="button" (click)="copiarHtml()">{{ copiado() ? 'HTML copiado' : 'Copiar HTML' }}</button><button class="btn-ghost" type="button" disabled title="La publicación Reel requiere permisos Meta y video">Preparar Reel (requiere Meta)</button><button class="btn-ghost" type="button" [disabled]="guardando()" (click)="guardarBorrador()">{{ guardando() ? 'Guardando…' : 'Guardar borrador' }}</button><button class="btn-primary" type="button" [disabled]="!gmailConfigurado() || !campanaId() || enviando()" (click)="enviar('gmail')">{{ enviando() ? 'Enviando…' : 'Enviar por Gmail' }}</button><button class="btn-primary" type="button" [disabled]="!whatsappConfigurado() || !campanaId() || enviando()" (click)="enviar('whatsapp')">Enviar por WhatsApp</button></div>
        </section>

        <section class="card overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4"><div><h2 class="font-extrabold text-slate-800">Vista previa del correo</h2><p class="text-xs text-slate-500">Asunto: {{ asunto || 'Sin asunto' }}</p></div><button class="btn-ghost text-xs" type="button" (click)="verHtml.set(!verHtml())">{{ verHtml() ? 'Ver campaña' : 'Ver HTML' }}</button></div>
          @if (verHtml()) { <pre class="max-h-[70vh] overflow-auto whitespace-pre-wrap break-all bg-slate-950 p-4 text-xs text-emerald-200">{{ html() }}</pre> }
          @else { <iframe title="Vista previa segura de la campaña" class="h-[680px] w-full bg-slate-100" [srcdoc]="html()" sandbox=""></iframe> }
        </section>
      </div>
    </div>
  `,
})
export class CampanasComponent {
  readonly empresa = inject(EmpresaService);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(DialogService);
  private readonly loading = inject(LoadingService);
  nombre = 'Campaña odontológica';
  asunto = 'Una oferta especial para tu sonrisa';
  titulo = '¡Cuida tu sonrisa con nuestras ofertas!';
  mensaje = 'En SmiloFun queremos acompañarte con tratamientos y precios especiales. Elige la opción ideal para ti.';
  textoBoton = 'Solicitar información';
  urlBoton = '';
  ofertas = signal<Oferta[]>([{ tratamiento: 'Limpieza dental', precioRegular: 120, precioOferta: 89 }]);
  verHtml = signal(false);
  copiado = signal(false);
  gmailConfigurado = signal(false);
  whatsappConfigurado = signal(false);
  gmailRemitente = signal('');
  metaConfigurado = signal(false);
  guardando = signal(false);
  enviando = signal(false);
  campanaId = signal<number | null>(null);
  error = signal('');
  resultado = signal('');
  html = computed(() => this.generarHtml());

  constructor() {
    this.api.estadoCampanas().subscribe({
      next: state => { this.gmailConfigurado.set(state.gmail.configured); this.whatsappConfigurado.set(state.whatsapp?.configured ?? false); this.metaConfigurado.set(state.meta_reels.configured); },
      error: e => { void this.dialog.apiError(e, 'No se pudo comprobar la configuración de campañas.'); },
    });
    this.api.configGmailCampanas().subscribe({ next: x => this.gmailRemitente.set(x.sender_email || '') });
  }

  agregarOferta(): void { this.ofertas.update(list => [...list, { tratamiento: '', precioRegular: 0, precioOferta: 0 }]); }
  quitarOferta(index: number): void { if (this.ofertas().length > 1) this.ofertas.update(list => list.filter((_, i) => i !== index)); }
  descuento(o: Oferta): number { return o.precioRegular > 0 && o.precioOferta >= 0 ? Math.max(0, Math.min(99, Math.round((1 - o.precioOferta / o.precioRegular) * 100))) : 0; }
  ahorro(o: Oferta): number { return Math.max(0, Number(o.precioRegular || 0) - Number(o.precioOferta || 0)); }

  async copiarHtml(): Promise<void> {
    try { await navigator.clipboard.writeText(this.html()); this.copiado.set(true); setTimeout(() => this.copiado.set(false), 1800); }
    catch { this.copiado.set(false); }
  }

  guardarBorrador(): void {
    const loadingId = this.loading.show('GUARDANDO BORRADOR DE CAMPAÑA');
    this.error.set(''); this.resultado.set(''); this.guardando.set(true);
    this.api.crearCampana({ empresa_id: this.empresa.actualId(), nombre: this.nombre, asunto: this.asunto, html: this.html(), canales: ['gmail'] }).subscribe({
      next: campaign => { this.guardando.set(false); this.loading.hide(loadingId); this.campanaId.set(campaign.id); this.resultado.set(`Borrador guardado (#${campaign.id}).`); void this.dialog.success({ title: 'Borrador guardado', text: `Campaña #${campaign.id}` }); },
      error: e => { this.guardando.set(false); this.loading.hide(loadingId); this.error.set(e?.error?.detail || 'No se pudo guardar el borrador.'); void this.dialog.apiError(e, 'No se pudo guardar el borrador.'); },
    });
  }

  async enviar(canal: 'gmail' | 'whatsapp'): Promise<void> {
    const id = this.campanaId();
    if (!id || (canal === 'gmail' ? !this.gmailConfigurado() : !this.whatsappConfigurado())) return;
    const confirmado = await this.dialog.confirm({ title: `¿Enviar campaña por ${canal === 'gmail' ? 'Gmail' : 'WhatsApp'}?`, text: `Se enviará solo a pacientes activos con consentimiento de ${canal} vigente y sin baja, de la empresa activa. WhatsApp usa una plantilla aprobada por Meta.`, confirmText: 'Enviar campaña' });
    if (!confirmado) return;
    const loadingId = this.loading.show('ENVIANDO CAMPAÑA POR GMAIL');
    this.enviando.set(true); this.error.set(''); this.resultado.set('');
    this.api.enviarCampana(id, true, canal).subscribe({
      next: r => { this.enviando.set(false); this.loading.hide(loadingId); this.resultado.set(`Estado ${r.estado}: ${r.enviados} enviados, ${r.fallidos} fallidos.`); void this.dialog.success({ title: 'Envío finalizado', text: this.resultado() }); },
      error: e => { this.enviando.set(false); this.loading.hide(loadingId); this.error.set(e?.error?.detail || 'No se pudo enviar la campaña.'); void this.dialog.apiError(e, 'No se pudo enviar la campaña.'); },
    });
  }

  private escape(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  }

  private generarHtml(): string {
    const ofertasHtml = this.ofertas().filter(o => o.tratamiento.trim()).map(o => {
      const d = this.descuento(o);
      return `<tr><td style="padding:18px;border:1px solid #eee;border-radius:14px;background:#fff"><table role="presentation" width="100%"><tr><td><strong style="font-size:18px;color:#32105f">${this.escape(o.tratamiento)}</strong><br><span style="color:#777;text-decoration:line-through">S/ ${Number(o.precioRegular || 0).toFixed(2)}</span> &nbsp; <b style="font-size:20px;color:#581c87">S/ ${Number(o.precioOferta || 0).toFixed(2)}</b></td><td align="right" width="92"><span style="display:inline-block;background:#facc15;color:#32105f;font-weight:900;padding:15px 10px;border-radius:50%;transform:rotate(10deg)">${d}%<br>OFF</span></td></tr></table></td></tr><tr><td height="12"></td></tr>`;
    }).join('');
    const safeUrl = /^https:\/\//i.test(this.urlBoton.trim()) ? this.escape(this.urlBoton.trim()) : '#';
    const cta = this.escape(this.textoBoton || 'Solicitar información');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${this.escape(this.asunto)}</title></head><body style="margin:0;background:#f4f1fa;font-family:Arial,sans-serif;color:#252033"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 10px;background:#f4f1fa"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:22px;overflow:hidden"><tr><td style="padding:34px 32px;background:linear-gradient(135deg,#32105f,#6d28d9);color:#fff"><p style="margin:0 0 10px;color:#facc15;font-weight:bold;letter-spacing:2px;font-size:12px">SMILOFUN · ${this.escape(this.empresa.nombreActual())}</p><h1 style="margin:0;font-size:30px;line-height:1.2">${this.escape(this.titulo)}</h1></td></tr><tr><td style="padding:28px 30px"><p style="font-size:16px;line-height:1.6;color:#514b60">${this.escape(this.mensaje)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${ofertasHtml}</table><p style="text-align:center;margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#581c87;color:#fff;text-decoration:none;padding:15px 24px;border-radius:10px;font-weight:bold">${cta}</a></p><p style="font-size:12px;line-height:1.5;color:#8a8495;text-align:center">Promoción sujeta a disponibilidad y evaluación profesional. Contacta a la clínica para confirmar condiciones.</p></td></tr><tr><td style="padding:18px;text-align:center;background:#faf9fc;color:#8a8495;font-size:11px">Recibiste este mensaje por ser paciente de ${this.escape(this.empresa.nombreActual())}.<br><a href="#baja" style="color:#6d28d9">Preferencias de comunicación / darse de baja</a></td></tr></table></td></tr></table></body></html>`;
  }
}
