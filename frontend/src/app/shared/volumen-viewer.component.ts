import { authenticatedFetch } from './authenticated-fetch';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

type Volumen = { datos: Float32Array; x: number; y: number; z: number; min: number; max: number; offset: number };

@Component({
  selector: 'app-volumen-viewer',
  imports: [DecimalPipe],
  template: `
    <div class="flex h-full min-h-0 flex-col bg-slate-950 text-white" [class.fixed]="pantallaCompleta()" [class.inset-0]="pantallaCompleta()" [class.z-[70]]="pantallaCompleta()">
      <header class="flex flex-wrap items-center gap-2 border-b border-white/10 bg-primary-900 px-4 py-3">
        <div class="min-w-0"><p class="truncate font-bold">{{ titulo }}</p><p class="text-[10px] text-primary-200">Volumen {{ formato }} · {{ dimensionesTexto() }}</p></div>
        <span class="badge bg-indigo-500 text-[10px] text-white">{{ tipo === 'resonancia' ? 'RESONANCIA' : 'TOMOGRAFÍA' }}</span>
        <div class="ml-auto flex flex-wrap items-center gap-1.5">
          <button class="tool" (click)="invertir()">{{ invertido() ? 'Escala normal' : 'Invertir escala' }}</button>
          <button class="tool" (click)="restablecer()">Restablecer ventana</button>
          <button class="tool" (click)="alternarPantallaCompleta()">{{ pantallaCompleta() ? '↙ Restaurar en modal' : '⛶ Pantalla completa' }}</button>
          <button class="tool !border-red-300/60 hover:!text-red-200" (click)="cerrar.emit()">Cerrar ✕</button>
        </div>
      </header>
      <main class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-2">
        <canvas #lienzo class="max-h-full max-w-full object-contain" aria-label="Corte del estudio volumétrico"></canvas>
        @if (cargando()) { <div class="absolute inset-0 grid place-items-center bg-black/80"><div class="text-center"><div class="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-accent-400"></div><p>Cargando y validando volumen…</p></div></div> }
        @if (error(); as e) { <div class="absolute inset-0 grid place-items-center bg-black/90 p-6"><div class="max-w-lg rounded-xl border border-red-400/30 bg-slate-900 p-6 text-center"><h3 class="font-bold text-red-300">No se pudo visualizar el volumen</h3><p class="mt-2 text-sm text-slate-200">{{ e }}</p><p class="mt-3 text-xs text-slate-400">Verifica que el archivo sea un NRRD o NIfTI 3D válido. El archivo original no se modificó.</p></div></div> }
      </main>
      <footer class="border-t border-white/10 bg-primary-900 px-4 py-3">
        @if (volumen(); as v) { <div class="mx-auto grid max-w-5xl gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center"><button class="tool" (click)="moverCorte(-1)" [disabled]="corte() <= 0">Anterior</button><label class="flex items-center gap-3 text-xs text-white"><span>Corte axial</span><input class="w-full accent-accent-400" type="range" min="0" [max]="v.z - 1" [value]="corte()" (input)="cambiarCorte($event)"><span class="w-20 text-right font-mono">{{ corte()+1 }} / {{ v.z }}</span></label><button class="tool" (click)="moverCorte(1)" [disabled]="corte() >= v.z-1">Siguiente</button></div>
          <div class="mx-auto mt-3 grid max-w-3xl gap-2 sm:grid-cols-[auto_1fr_auto_1fr]"><label class="text-xs text-primary-200">Centro {{ centro() | number:'1.0-0' }}</label><input type="range" [min]="v.min" [max]="v.max" [value]="centro()" (input)="setCentro($event)"><label class="text-xs text-primary-200">Ventana {{ ventana() | number:'1.0-0' }}</label><input type="range" min="1" [max]="maxVentana()" [value]="ventana()" (input)="setVentana($event)"></div>
        } @else if (!error() && !cargando()) { <p class="text-center text-xs text-primary-200">No se encontró un volumen 3D que pueda visualizarse.</p> }
      </footer>
    </div>
  `,
  styles: [`
    .tool{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.25);border-radius:.6rem;padding:.5rem .75rem;color:#fff;font-size:.75rem;font-weight:700;white-space:nowrap}
    .tool:hover:not(:disabled){border-color:#facc15;color:#facc15}.tool:disabled{opacity:.45;cursor:not-allowed}
  `],
})
export class VolumenViewerComponent implements AfterViewInit, OnDestroy {
  @Input({required:true}) url!: string;
  @Input({required:true}) titulo!: string;
  @Input() tipo = 'tomografia';
  @Input() formato = 'NRRD';
  @Input() dimensiones: {x?:number;y?:number;z?:number} | null = null;
  @Output() cerrar = new EventEmitter<void>();
  @ViewChild('lienzo',{static:true}) lienzo!: ElementRef<HTMLCanvasElement>;
  volumen = signal<Volumen|null>(null); cargando = signal(true); error = signal<string|null>(null);
  corte = signal(0); centro = signal(0); ventana = signal(1); invertido = signal(false); pantallaCompleta = signal(false);
  private abortador?: AbortController;
  private raf = 0;

  ngAfterViewInit(): void { void this.cargar(); }
  ngOnDestroy(): void { this.abortador?.abort(); if (this.raf) cancelAnimationFrame(this.raf); }
  dimensionesTexto(): string { const d=this.volumen(); return d ? `${d.x} × ${d.y} × ${d.z} voxeles` : this.dimensiones?.x ? `${this.dimensiones.x} × ${this.dimensiones.y} × ${this.dimensiones.z} voxeles` : 'dimensiones por validar'; }
  maxVentana(): number { const v=this.volumen(); return v ? Math.max(2,v.max-v.min) : 2; }
  cambiarCorte(e: Event): void { this.corte.set(Number((e.target as HTMLInputElement).value)); this.renderizar(); }
  moverCorte(delta: number): void { const v=this.volumen(); if(!v)return; this.corte.set(Math.min(v.z-1,Math.max(0,this.corte()+delta))); this.renderizar(); }
  setCentro(e: Event): void { this.centro.set(Number((e.target as HTMLInputElement).value)); this.renderizar(); }
  setVentana(e: Event): void { this.ventana.set(Math.max(1,Number((e.target as HTMLInputElement).value))); this.renderizar(); }
  invertir(): void { this.invertido.update(x=>!x); this.renderizar(); }
  restablecer(): void { const v=this.volumen(); if(!v)return; this.centro.set((v.min+v.max)/2); this.ventana.set(Math.max(1,v.max-v.min)); this.invertido.set(false); this.renderizar(); }
  alternarPantallaCompleta(): void { this.pantallaCompleta.update(x=>!x); requestAnimationFrame(()=>this.renderizar()); }

  private async cargar(): Promise<void> {
    this.abortador = new AbortController();
    try {
      const res=await authenticatedFetch(this.url,{signal:this.abortador.signal});
      if(!res.ok) throw new Error(`No se pudo descargar el estudio (HTTP ${res.status}).`);
      const buffer=await res.arrayBuffer();
      const format=this.formato.toUpperCase();
      if(format==='NRRD') await this.leerNrrd(buffer); else if(format.startsWith('NIFTI')) await this.leerNifti(buffer,format==='NIFTI.GZ'); else throw new Error(`Formato volumétrico no reconocido: ${this.formato}`);
    } catch(e:any) { if(e?.name!=='AbortError') this.error.set(e?.message || 'Archivo no compatible o dañado.'); }
    finally { this.cargando.set(false); }
  }

  private async leerNrrd(buffer: ArrayBuffer): Promise<void> {
    const bytes=new Uint8Array(buffer); const magic='NRRD';
    if(new TextDecoder().decode(bytes.slice(0,4))!==magic) throw new Error('La cabecera NRRD no es válida.');
    let sep=-1, sepLen=0;
    for(let i=4;i<Math.min(bytes.length-1,65536);i++) { if(bytes[i]===10&&bytes[i+1]===10){sep=i;sepLen=2;break;} if(i<bytes.length-3&&bytes[i]===13&&bytes[i+1]===10&&bytes[i+2]===13&&bytes[i+3]===10){sep=i;sepLen=4;break;} }
    if(sep<0) throw new Error('No se encontró el final de la cabecera NRRD.');
    const header=new TextDecoder().decode(bytes.slice(0,sep)); const kv=new Map<string,string>();
    for(const raw of header.split(/\r?\n/)){const line=raw.trim(); if(!line||line.startsWith('#'))continue; const m=line.match(/^([^:=]+)\s*[:=]\s*(.*)$/); if(m)kv.set(m[1].trim().toLowerCase(),m[2].trim());}
    const sizes=(kv.get('sizes')||'').split(/\s+/).map(Number); if(sizes.length!==3||sizes.some(n=>!Number.isInteger(n)||n<2)) throw new Error('El NRRD no es un volumen 3D válido.');
    const cantidad=sizes[0]*sizes[1]*sizes[2]; if(cantidad>150_000_000) throw new Error('El volumen excede la capacidad segura de visualización en el navegador.');
    const tipo=(kv.get('type')||'').toLowerCase(); const little=(kv.get('endian')||'little').toLowerCase()!=='big'; const encoding=(kv.get('encoding')||'raw').toLowerCase();
    const dataFile=kv.get('data file');
    if(dataFile) throw new Error('Este NRRD referencia un archivo de datos externo; sube el volumen como archivo NRRD único.');
    let payload=bytes.slice(sep+sepLen);
    if(encoding==='gzip'||encoding==='gz') {
      const fflate=await import('fflate');
      payload=fflate.gunzipSync(payload);
    } else if(encoding!=='raw') throw new Error(`Codificación NRRD “${encoding}” no soportada.`);
    const view=new DataView(payload.buffer,payload.byteOffset,payload.byteLength); let bytesPer=0; let leer:(i:number)=>number;
    if(['uchar','unsigned char','uint8','uint8_t'].includes(tipo)){bytesPer=1;leer=i=>view.getUint8(i);}
    else if(['short','short int','signed short','int16','int16_t'].includes(tipo)){bytesPer=2;leer=i=>view.getInt16(i,little);}
    else if(['ushort','unsigned short','uint16','uint16_t'].includes(tipo)){bytesPer=2;leer=i=>view.getUint16(i,little);}
    else if(['int','int32','int32_t'].includes(tipo)){bytesPer=4;leer=i=>view.getInt32(i,little);}
    else if(['uint','uint32','uint32_t'].includes(tipo)){bytesPer=4;leer=i=>view.getUint32(i,little);}
    else if(['float','float32'].includes(tipo)){bytesPer=4;leer=i=>view.getFloat32(i,little);}
    else if(['double','float64'].includes(tipo)){bytesPer=8;leer=i=>view.getFloat64(i,little);}
    else throw new Error(`Tipo de dato NRRD “${tipo}” no soportado.`);
    if(view.byteLength<cantidad*bytesPer) throw new Error('El NRRD está truncado: faltan datos de voxeles.');
    const offset=0;
    const dims=[...sizes];
    this.terminarCarga(dims[0],dims[1],dims[2],cantidad,slice=>index=>{
      const x=index%dims[0]; const y=Math.floor(index/dims[0]);
      const linear=x+dims[0]*(y+dims[1]*slice);
      return leer(offset+linear*bytesPer);
    });
  }

  private async leerNifti(buffer: ArrayBuffer,zipped:boolean): Promise<void> {
    if (zipped) {
      const fflate=await import('fflate');
      let inflated: Uint8Array;
      try { inflated=fflate.gunzipSync(new Uint8Array(buffer)); }
      catch { throw new Error(`El NIfTI comprimido está incompleto o no es GZIP válido (${buffer.byteLength} bytes).`); }
      buffer=inflated.buffer.slice(inflated.byteOffset,inflated.byteOffset+inflated.byteLength);
    }
    const view=new DataView(buffer); if(buffer.byteLength<352) throw new Error(`NIfTI inválido o truncado (${buffer.byteLength} bytes; se esperaba al menos 352).`);
    const headerLE=view.getInt32(0,true)===348; const headerBE=view.getInt32(0,false)===348; if(!headerLE&&!headerBE) throw new Error('Cabecera NIfTI no reconocida.'); const le=headerLE;
    const dims=Array.from({length:8},(_,i)=>view.getInt16(40+2*i,le)); const ndim=dims[0]; if(ndim<3||ndim>3||dims[1]<1||dims[2]<1||dims[3]<1) throw new Error('Se requiere un volumen NIfTI 3D (no 4D).');
    const [x,y,z]=[dims[1],dims[2],dims[3]]; const count=x*y*z; if(count>150_000_000) throw new Error('El volumen excede la capacidad segura de visualización en el navegador.');
    const datatype=view.getInt16(70,le); const voxOffset=Math.max(352,Math.floor(view.getFloat32(108,le))); const slope=view.getFloat32(112,le)||1; const intercept=view.getFloat32(116,le)||0;
    let bpe=0, read:(o:number)=>number;
    if(datatype===2){bpe=1;read=o=>view.getUint8(o);}else if(datatype===4){bpe=2;read=o=>view.getInt16(o,le);}else if(datatype===512){bpe=2;read=o=>view.getUint16(o,le);}else if(datatype===8){bpe=4;read=o=>view.getInt32(o,le);}else if(datatype===768){bpe=4;read=o=>view.getUint32(o,le);}else if(datatype===16){bpe=4;read=o=>view.getFloat32(o,le);}else if(datatype===64){bpe=8;read=o=>view.getFloat64(o,le);}else throw new Error(`Tipo de pixel NIfTI ${datatype} no soportado.`);
    if(voxOffset+count*bpe>buffer.byteLength) throw new Error('El NIfTI está truncado o sus datos están comprimidos.');
    this.terminarCarga(x,y,z,count,slice=>index=>read(voxOffset+(index+slice*x*y)*bpe)*slope+intercept);
  }

  private terminarCarga(x:number,y:number,z:number,count:number,leerCorte:(slice:number)=>(i:number)=>number): void {
    const datos=new Float32Array(count); let min=Infinity,max=-Infinity;
    let pos=0; for(let s=0;s<z;s++){const leer=leerCorte(s);for(let i=0;i<x*y;i++){const v=leer(i);datos[pos++]=v;if(Number.isFinite(v)){if(v<min)min=v;if(v>max)max=v;}}}
    if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min) throw new Error('El volumen no contiene un rango de intensidades visualizable.');
    const muestra: number[] = [];
    const paso=Math.max(1,Math.floor(count/200000));
    for(let i=0;i<count;i+=paso){const v=datos[i];if(Number.isFinite(v))muestra.push(v);}
    muestra.sort((a,b)=>a-b);
    const low=muestra[Math.floor((muestra.length-1)*0.01)] ?? min;
    const high=muestra[Math.floor((muestra.length-1)*0.99)] ?? max;
    const win=Math.max(1,high-low);
    this.volumen.set({datos,x,y,z,min,max,offset:0}); this.corte.set(Math.floor(z/2)); this.centro.set((high+low)/2); this.ventana.set(win); this.renderizar();
  }

  private renderizar(): void {
    const v=this.volumen(); const canvas=this.lienzo?.nativeElement; if(!v||!canvas)return;
    const ctx=canvas.getContext('2d'); if(!ctx)return; canvas.width=v.x; canvas.height=v.y;
    const image=ctx.createImageData(v.x,v.y); const low=this.centro()-this.ventana()/2; const scale=255/Math.max(1,this.ventana()); const offset=this.corte()*v.x*v.y;
    for(let y=0;y<v.y;y++)for(let x=0;x<v.x;x++){const src=offset+(v.y-1-y)*v.x+x; const gray=Math.max(0,Math.min(255,Math.round((v.datos[src]-low)*scale))); const g=this.invertido()?255-gray:gray; const dst=(y*v.x+x)*4; image.data[dst]=g;image.data[dst+1]=g;image.data[dst+2]=g;image.data[dst+3]=255;}
    ctx.putImageData(image,0,0);
  }
}
