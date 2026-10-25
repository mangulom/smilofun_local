import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { Cita, Doctor, Paciente } from '../../core/models';

@Component({
  selector: 'app-citas',
  imports: [FormsModule, DatePipe],
  template: `
    <div class="space-y-5">
      <!-- Barra superior -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">Agenda de citas</h1>
          <p class="text-sm text-slate-500">Vista por doctor · {{ fechaSeleccionada | date: "EEEE d 'de' MMMM, y" }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input type="date" class="input w-44" [(ngModel)]="fechaTexto" (ngModelChange)="cargar()" />
          <button class="btn-ghost" (click)="moverDia(-1)">← Ayer</button>
          <button class="btn-ghost" (click)="hoy()">Hoy</button>
          <button class="btn-ghost" (click)="moverDia(1)">Mañana →</button>
          <button class="btn-primary" (click)="nuevaCita()">+ Nueva cita</button>
        </div>
      </div>

      @if (error()) {
        <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {{ error() }}
        </div>
      }

      <!-- Leyenda de estados -->
      <div class="flex flex-wrap gap-3 text-xs text-slate-500">
        <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded-full bg-slate-400"></span>Programada</span>
        <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded-full bg-blue-500"></span>Confirmada</span>
        <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded-full bg-amber-400"></span>En atención</span>
        <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded-full bg-emerald-500"></span>Completada</span>
        <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded-full bg-red-400"></span>Cancelada / No asistió</span>
      </div>

      <!-- Columnas por doctor -->
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        @for (doc of doctores(); track doc.id) {
          <div class="card overflow-hidden">
            <div class="flex items-center gap-3 border-b border-slate-100 px-4 py-3" [style.background]="doc.color + '1a'">
              <span class="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white" [style.background]="doc.color">
                {{ doc.nombres[0] }}{{ doc.apellidos[0] }}
              </span>
              <div class="min-w-0">
                <p class="truncate text-sm font-bold text-slate-800">{{ doc.nombre_completo }}</p>
                <p class="truncate text-[11px] text-slate-500">{{ doc.especialidad || 'Odontología general' }}</p>
              </div>
              <span class="ml-auto rounded-lg bg-white/70 px-2 py-1 text-xs font-bold" [style.color]="doc.color">
                {{ citasDe(doc.id).length }}
              </span>
            </div>
            <div class="max-h-[540px] space-y-2 overflow-y-auto p-3">
              @for (c of citasDe(doc.id); track c.id) {
                <div class="rounded-xl border-l-4 bg-slate-50 p-3 transition hover:bg-white hover:shadow-sm" [style.borderLeftColor]="colorEstado(c.estado)">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-extrabold text-slate-800">{{ c.hora_inicio.slice(0, 5) }} – {{ c.hora_fin.slice(0, 5) }}</span>
                    <select
                      class="rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold outline-none focus:border-primary-400"
                      [ngModel]="c.estado"
                      (ngModelChange)="cambiarEstado(c, $event)"
                    >
                      <option value="programada">Programada</option>
                      <option value="confirmada">Confirmada</option>
                      <option value="en_atencion">En atención</option>
                      <option value="completada">Completada</option>
                      <option value="cancelada">Cancelada</option>
                      <option value="no_asistio">No asistió</option>
                    </select>
                  </div>
                  <p class="mt-1 truncate text-sm font-semibold text-blue-700">{{ c.paciente.nombre_completo }}</p>
                  <p class="truncate text-xs text-slate-500">{{ c.motivo || 'Sin motivo registrado' }}</p>
                  <div class="mt-2 flex items-center justify-between">
                    <span class="text-[10px] font-medium text-slate-400">{{ c.paciente.codigo }} · {{ c.paciente.telefono || 's/tel' }}</span>
                    <span class="text-[10px] font-semibold text-slate-500">
                      <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" [style.background]="empresa.color(c.empresa_id)"></span>{{ empresa.nombre(c.empresa_id) }}
                    </span>
                    <button class="text-[11px] font-semibold text-red-400 hover:text-red-600" (click)="eliminar(c)">✕</button>
                  </div>
                </div>
              } @empty {
                <p class="py-8 text-center text-xs text-slate-400">Sin citas para este doctor.</p>
              }
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Modal nueva cita -->
    @if (modal()) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-primary-950/50 p-4 backdrop-blur-sm" (click)="modal.set(false)">
        <div class="card w-full max-w-lg p-6" (click)="$event.stopPropagation()">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-extrabold text-slate-800">Nueva cita</h2>
            <button class="text-slate-400 hover:text-slate-600" (click)="modal.set(false)">✕</button>
          </div>
          <form class="space-y-4" (ngSubmit)="guardar()">
            <div>
              <label class="label">Paciente</label>
              <input class="input" placeholder="🔍 Buscar por nombre o código…" [(ngModel)]="filtroPaciente" name="filtro" (ngModelChange)="filtrarPacientes()" />
              <select class="input mt-2" name="paciente_id" [(ngModel)]="form.paciente_id" required size="6">
                @for (p of pacientesFiltrados(); track p.id) {
                  <option [value]="p.id">{{ p.codigo }} — {{ p.nombre_completo }}</option>
                }
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Doctor</label>
                <select class="input" name="doctor_id" [(ngModel)]="form.doctor_id" required>
                  @for (d of doctores(); track d.id) { <option [value]="d.id">{{ d.nombre_completo }}</option> }
                </select>
              </div>
              <div>
                <label class="label">Fecha</label>
                <input class="input" type="date" name="fecha" [(ngModel)]="form.fecha" required />
              </div>
              <div>
                <label class="label">Hora inicio</label>
                <select class="input" name="hora_inicio" [(ngModel)]="form.hora_inicio" required>
                  @for (h of horas; track h) { <option [value]="h">{{ h }}</option> }
                </select>
              </div>
              <div>
                <label class="label">Duración</label>
                <select class="input" name="duracion" [(ngModel)]="form.duracion" required>
                  <option [value]="30">30 min</option>
                  <option [value]="45">45 min</option>
                  <option [value]="60">60 min</option>
                  <option [value]="90">90 min</option>
                </select>
              </div>
            </div>
            <div>
              <label class="label">Motivo</label>
              <input class="input" name="motivo" [(ngModel)]="form.motivo" placeholder="Control, dolor, limpieza…" />
            </div>
            @if (errorModal()) {
              <p class="text-sm font-medium text-red-600">{{ errorModal() }}</p>
            }
            <div class="flex justify-end gap-2">
              <button type="button" class="btn-ghost" (click)="modal.set(false)">Cancelar</button>
              <button class="btn-primary" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Crear cita' }}</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class CitasComponent {
  private api = inject(ApiService);
  empresa = inject(EmpresaService);

  doctores = signal<Doctor[]>([]);
  todasPacientes = signal<Paciente[]>([]);
  pacientesFiltrados = signal<Paciente[]>([]);
  citas = signal<Cita[]>([]);
  modal = signal(false);
  guardando = signal(false);
  error = signal<string | null>(null);
  errorModal = signal<string | null>(null);

  fechaTexto = new Date().toISOString().slice(0, 10);
  filtroPaciente = '';

  readonly horas: string[] = [];
  form: any = {};

  constructor() {
    for (let h = 8; h < 20; h++) {
      this.horas.push(`${String(h).padStart(2, '0')}:00`);
      this.horas.push(`${String(h).padStart(2, '0')}:30`);
    }
    effect(() => {
      const id = this.empresa.actualId();
      this.api.doctores({ empresa_id: id }).subscribe((d) => this.doctores.set(d));
      this.api.pacientes({ limit: 500, empresa_id: id }).subscribe((p) => {
        this.todasPacientes.set(p);
        this.pacientesFiltrados.set(p.slice(0, 50));
      });
      this.cargar();
    });
  }

  get fechaSeleccionada(): Date {
    return new Date(this.fechaTexto + 'T00:00:00');
  }

  cargar(): void {
    this.error.set(null);
    this.api.citas({ fecha: this.fechaTexto, empresa_id: this.empresa.actualId() }).subscribe({
      next: (c) => this.citas.set(c),
      error: () => this.error.set('No se pudieron cargar las citas.'),
    });
  }

  moverDia(delta: number): void {
    const d = this.fechaSeleccionada;
    d.setDate(d.getDate() + delta);
    this.fechaTexto = d.toISOString().slice(0, 10);
    this.cargar();
  }

  hoy(): void {
    this.fechaTexto = new Date().toISOString().slice(0, 10);
    this.cargar();
  }

  citasDe(doctorId: number): Cita[] {
    return this.citas()
      .filter((c) => c.doctor_id === doctorId)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  }

  colorEstado(estado: string): string {
    const mapa: Record<string, string> = {
      programada: '#94a3b8', confirmada: '#3b82f6', en_atencion: '#facc15',
      completada: '#22c55e', cancelada: '#ef4444', no_asistio: '#f43f5e',
    };
    return mapa[estado] ?? '#94a3b8';
  }

  cambiarEstado(cita: Cita, estado: string): void {
    this.api.estadoCita(cita.id, estado).subscribe({
      next: () => this.cargar(),
      error: (e) => this.error.set(e?.error?.detail || 'No se pudo cambiar el estado'),
    });
  }

  eliminar(cita: Cita): void {
    if (!confirm(`¿Eliminar la cita de ${cita.paciente.nombre_completo}?`)) return;
    this.api.eliminarCita(cita.id).subscribe({ next: () => this.cargar() });
  }

  nuevaCita(): void {
    this.form = {
      paciente_id: null,
      doctor_id: this.doctores()[0]?.id ?? null,
      fecha: this.fechaTexto,
      hora_inicio: '09:00',
      duracion: 30,
      motivo: '',
    };
    this.filtroPaciente = '';
    this.pacientesFiltrados.set(this.todasPacientes().slice(0, 50));
    this.errorModal.set(null);
    this.modal.set(true);
  }

  filtrarPacientes(): void {
    const q = this.filtroPaciente.toLowerCase();
    const base = this.todasPacientes();
    const res = q
      ? base.filter(
          (p) =>
            p.nombre_completo.toLowerCase().includes(q) ||
            p.codigo.toLowerCase().includes(q) ||
            (p.dni ?? '').includes(q)
        )
      : base;
    this.pacientesFiltrados.set(res.slice(0, 50));
  }

  guardar(): void {
    if (!this.form.paciente_id) {
      this.errorModal.set('Selecciona un paciente.');
      return;
    }
    this.guardando.set(true);
    this.errorModal.set(null);
    const [h, m] = this.form.hora_inicio.split(':').map(Number);
    const fin = new Date(2000, 0, 1, h, m + Number(this.form.duracion));
    const doctor = this.doctores().find((d) => d.id === Number(this.form.doctor_id));
    this.api
      .crearCita({
        paciente_id: Number(this.form.paciente_id),
        doctor_id: Number(this.form.doctor_id),
        sucursal_id: doctor?.sucursal_id ?? 1,
        fecha: this.form.fecha,
        hora_inicio: this.form.hora_inicio,
        hora_fin: `${String(fin.getHours()).padStart(2, '0')}:${String(fin.getMinutes()).padStart(2, '0')}`,
        motivo: this.form.motivo || null,
      estado: 'programada',
      empresa_id: this.empresa.actualId(),
    })
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.modal.set(false);
          if (this.form.fecha === this.fechaTexto) this.cargar();
        },
        error: (e) => {
          this.guardando.set(false);
          this.errorModal.set(e?.error?.detail || 'No se pudo crear la cita.');
        },
      });
  }
}
