import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ApiService } from '../../core/api.service';
import { EmpresaService } from '../../core/empresa.service';
import { DialogService } from '../../shared/dialog.service';

interface CatalogoPieza {
  clave: string;
  nombre: string;
  estilos: string[];
  descripcion: string;
  medidas: { ancho: number; alto: number; profundidad: number };
}

@Component({
  selector: 'app-diseno3d',
  imports: [FormsModule],
  template: `
    <div class="space-y-5">
      <div>
        <h1 class="text-2xl font-extrabold text-slate-800">Diseño de Prótesis 3D</h1>
        <p class="text-sm text-slate-500">
          Genera el molde digital de una pieza dental desde sus medidas y expórtalo como STL
          para impresión 3D.
        </p>
      </div>

      <div class="grid gap-5 xl:grid-cols-[380px_1fr]">
        <!-- Formulario -->
        <div class="card space-y-4 p-5">
          <div>
            <label class="label">Tipo de pieza</label>
            <select class="input" [ngModel]="selTipo" (ngModelChange)="cambiarTipo($event)">
              @for (p of piezas(); track p.clave) {
                <option [value]="p.clave">{{ p.nombre }}</option>
              }
            </select>
          </div>

          <div>
            <label class="label">Estilo / plantilla</label>
            <select class="input" [(ngModel)]="selEstilo">
              @for (e of estilos(); track e) {
                <option [value]="e">{{ e }}</option>
              }
            </select>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="label">Ancho mm</label>
              <input class="input" type="number" step="0.1" min="2" [(ngModel)]="ancho" />
            </div>
            <div>
              <label class="label">Alto mm</label>
              <input class="input" type="number" step="0.1" min="2" [(ngModel)]="alto" />
            </div>
            <div>
              <label class="label">Prof. mm</label>
              <input class="input" type="number" step="0.1" min="2" [(ngModel)]="profundidad" />
            </div>
          </div>

          <div>
            <label class="label">Paciente (opcional)</label>
            <select class="input" [(ngModel)]="pacienteId">
              <option [ngValue]="null">— Sin asignar —</option>
              @for (p of pacientes(); track p.id) {
                <option [ngValue]="p.id">{{ p.nombres }} {{ p.apellidos }}</option>
              }
            </select>
          </div>

          @if (error()) {
            <p class="text-sm text-red-600">{{ error() }}</p>
          }

          <div class="flex flex-wrap gap-2">
            <button class="btn-primary" type="button" (click)="generar()" [disabled]="generando()">
              {{ generando() ? 'Generando…' : 'Generar diseño 3D' }}
            </button>
            @if (urlStl()) {
              <a class="btn-accent" [href]="urlStl()" download>⬇ Descargar STL</a>
            }
          </div>
        </div>

        <!-- Visor 3D -->
        <div class="card overflow-hidden">
          <div class="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 class="font-bold text-slate-800">Visor 3D</h2>
            <label class="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-500">
              <input type="checkbox" [checked]="mostrarCalor()" (change)="toggleCalor($event)" />
              Mapa de calor de ajuste
            </label>
          </div>
          <div #viewer class="relative h-[440px] w-full bg-slate-900">
            @if (!metricas()) {
              <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-slate-400">
                Configura la pieza y pulsa «Generar diseño 3D» para ver el modelo.
              </div>
            }
          </div>
        </div>
      </div>

      @if (metricas(); as m) {
        <div class="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <div class="card p-4">
            <p class="text-xs uppercase tracking-wide text-slate-400">Vértices</p>
            <p class="text-xl font-extrabold text-slate-800">{{ m.vertices }}</p>
          </div>
          <div class="card p-4">
            <p class="text-xs uppercase tracking-wide text-slate-400">Caras</p>
            <p class="text-xl font-extrabold text-slate-800">{{ m.caras }}</p>
          </div>
          <div class="card p-4">
            <p class="text-xs uppercase tracking-wide text-slate-400">Volumen</p>
            <p class="text-xl font-extrabold text-slate-800">{{ m.volumen_mm3 }} mm³</p>
          </div>
          <div class="card p-4">
            <p class="text-xs uppercase tracking-wide text-slate-400">Área</p>
            <p class="text-xl font-extrabold text-slate-800">{{ m.area_mm2 }} mm²</p>
          </div>
          <div class="card p-4">
            <p class="text-xs uppercase tracking-wide text-slate-400">Ajuste</p>
            <p class="text-xl font-extrabold text-emerald-600">{{ (m.ajuste_medio * 100).toFixed(1) }}%</p>
          </div>
          <div class="card p-4">
            <p class="text-xs uppercase tracking-wide text-slate-400">Imprimible</p>
            <p class="text-xl font-extrabold" [class]="m.watertight ? 'text-emerald-600' : 'text-amber-500'">
              {{ m.watertight ? 'Sí' : 'Revisar' }}
            </p>
          </div>
        </div>

        <p class="text-xs text-slate-400">
          Dimensiones: {{ m.dimensiones_mm[0] }} × {{ m.dimensiones_mm[1] }} × {{ m.dimensiones_mm[2] }} mm ·
          Desviación geométrica: {{ m.desviacion_pct }}% (mapa de calor ilustrativo).
        </p>
      }
    </div>
  `,
})
export class Diseno3DComponent implements AfterViewInit, OnDestroy {
  private dialog = inject(DialogService);
  private api = inject(ApiService);
  private empresa = inject(EmpresaService);
  private route = inject(ActivatedRoute);

  @ViewChild('viewer') viewerRef?: ElementRef<HTMLDivElement>;

  piezas = signal<CatalogoPieza[]>([]);
  pacientes = signal<any[]>([]);
  estilos = signal<string[]>([]);
  generando = signal(false);
  error = signal('');
  metricas = signal<any | null>(null);
  urlStl = signal('');
  mostrarCalor = signal(true);

  selTipo = '';
  selEstilo = '';
  ancho = 10.5;
  alto = 9;
  profundidad = 11;
  pacienteId: number | null = null;

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private controls?: OrbitControls;
  private mesh?: THREE.Mesh;
  private material?: THREE.MeshStandardMaterial;
  private frame = 0;
  private ro?: ResizeObserver;
  private contenedor?: HTMLDivElement;
  private pendiente?: any;

  constructor() {
    const qp = this.route.snapshot.queryParamMap;
    const disenoId = qp.get('diseno');
    const tipo = qp.get('tipo');
    const pacienteParam = qp.get('paciente');

    this.api.catalogoDiseno3D().subscribe((r) => {
      this.piezas.set(r?.piezas ?? []);
      const primera = this.piezas()[0];
      if (tipo && this.piezas().some((p) => p.clave === tipo)) {
        this.cambiarTipo(tipo);
      } else if (primera) {
        this.cambiarTipo(primera.clave);
      }
    });
    this.api.pacientes({ limit: 500, empresa_id: this.empresa.actualId() }).subscribe((p) => {
      this.pacientes.set(p ?? []);
      if (pacienteParam && this.pacientes().some((x) => x.id === Number(pacienteParam))) {
        this.pacienteId = Number(pacienteParam);
      }
    });

    if (disenoId) {
      this.api.geometriaDiseno3D(Number(disenoId)).subscribe({
        next: (r) => {
          this.metricas.set(r.metricas);
          this.urlStl.set(r.url_stl);
          const dim = r.metricas?.dimensiones_mm;
          if (dim) {
            this.selTipo = r.tipo;
            this.selEstilo = r.estilo;
            this.ancho = dim[0];
            this.alto = dim[1];
            this.profundidad = dim[2];
          }
          if (r.paciente_id != null) {
            this.pacienteId = r.paciente_id;
          }
          this.dibujar(r);
        },
        error: (e) => { this.error.set('No se pudo cargar el diseño guardado.'); void this.dialog.apiError(e, 'No se pudo cargar el diseño guardado.'); },
      });
    }
  }

  cambiarTipo(clave: string): void {
    this.selTipo = clave;
    const pieza = this.piezas().find((p) => p.clave === clave);
    this.estilos.set(pieza?.estilos ?? []);
    this.selEstilo = pieza?.estilos[0] ?? '';
    if (pieza) {
      this.ancho = pieza.medidas.ancho;
      this.alto = pieza.medidas.alto;
      this.profundidad = pieza.medidas.profundidad;
    }
  }

  generar(): void {
    this.generando.set(true);
    this.error.set('');
    this.api
      .generarDiseno3D({
        tipo: this.selTipo,
        estilo: this.selEstilo,
        ancho: this.ancho,
        alto: this.alto,
        profundidad: this.profundidad,
        paciente_id: this.pacienteId,
        empresa_id: this.empresa.actualId(),
      })
      .subscribe({
        next: (r) => {
          this.metricas.set(r.metricas);
          this.urlStl.set(r.url_stl);
          this.dibujar(r);
          this.generando.set(false);
        },
        error: (e) => {
          this.error.set('No se pudo generar el diseño. Revisa los datos e inténtalo de nuevo.');
          this.generando.set(false);
          void this.dialog.apiError(e, 'No se pudo generar el diseño 3D.');
        },
      });
  }

  toggleCalor(ev: Event): void {
    this.mostrarCalor.set((ev.target as HTMLInputElement).checked);
    if (this.material) {
      this.material.vertexColors = this.mostrarCalor();
      this.material.color.set(this.mostrarCalor() ? 0xffffff : 0xcbd5e1);
      this.material.needsUpdate = true;
    }
  }

  ngAfterViewInit(): void {
    const cont = this.viewerRef?.nativeElement;
    if (!cont) return;
    this.contenedor = cont;
    const w = cont.clientWidth || 640;
    const h = cont.clientHeight || 440;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);
    this.camera.position.set(18, -26, 16);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    cont.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const luz1 = new THREE.DirectionalLight(0xffffff, 1.7);
    luz1.position.set(40, -30, 80);
    this.scene.add(luz1);
    const luz2 = new THREE.DirectionalLight(0xffffff, 0.6);
    luz2.position.set(-50, 40, 30);
    this.scene.add(luz2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.5;

    const animar = () => {
      this.frame = requestAnimationFrame(animar);
      this.controls?.update();
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    animar();

    this.ro = new ResizeObserver(() => this.ajustar());
    this.ro.observe(cont);

    if (this.pendiente) {
      this.dibujar(this.pendiente);
      this.pendiente = undefined;
    }
  }

  private ajustar(): void {
    const cont = this.contenedor;
    if (!cont || !this.renderer || !this.camera) return;
    const w = cont.clientWidth || 640;
    const h = cont.clientHeight || 440;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private dibujar(r: any): void {
    if (!this.scene || !this.camera || !this.controls) {
      this.pendiente = r;
      return;
    }
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(r.vertices.flat(), 3));
    const colores = (r.colors as number[][]).map((c) => [c[0] / 255, c[1] / 255, c[2] / 255]).flat();
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
    geo.setIndex(r.faces.flat());
    geo.computeVertexNormals();
    geo.center();
    geo.computeBoundingSphere();

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: this.mostrarCalor(),
      color: this.mostrarCalor() ? 0xffffff : 0xcbd5e1,
      metalness: 0.15,
      roughness: 0.55,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.scene.add(this.mesh);

    const radio = geo.boundingSphere?.radius ?? 8;
    const d = radio * 2.6;
    this.camera.position.set(d * 0.55, -d * 0.95, d * 0.55);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.ro?.disconnect();
    this.controls?.dispose();
    this.mesh?.geometry.dispose();
    this.material?.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
  }
}
