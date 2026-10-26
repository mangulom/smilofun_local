/**
 * Lector DICOM mínimo y sin dependencias para series de resonancia sin comprimir.
 *
 * Soporta Little Endian explícito e implícito, 8/16 bits, un solo canal (escala de
 * grises) y multiframe. Para cualquier otro formato (JPEG, JPEG 2000, RLE, color,
 * big endian…) devuelve `null` y el visor recurre a Cornerstone.
 *
 * No usa web workers ni WebAssembly: todo se decodifica en el hilo principal, de modo
 * que una descarga correcta siempre termina en imagen (o en un error legible).
 */

export interface CorteDicom {
  filas: number;
  columnas: number;
  pixeles: Int16Array | Uint16Array | Uint8Array;
  pendiente: number;
  intercepto: number;
}

export interface EstudioDicom {
  cortes: CorteDicom[];
  modalidad: string;
  centro: number | null;
  ancho: number | null;
  /** MONOCHROME1: el valor mínimo se muestra en blanco. */
  invertido: boolean;
}

const TS_IMPLICITO = '1.2.840.10008.1.2';
const TS_EXPLICITO = '1.2.840.10008.1.2.1';
const INDEFINIDO = 0xffffffff;
const VR_LARGO = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'SV', 'UC', 'UN', 'UR', 'UT', 'UV']);

/**
 * Devuelve el estudio decodificado, `null` si el formato no es compatible con este
 * lector, o lanza un Error si el archivo no es un DICOM válido o está truncado.
 */
export function leerDicomSinComprimir(buffer: ArrayBuffer): EstudioDicom | null {
  const total = buffer.byteLength;
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (total < 140 || String.fromCharCode(bytes[128], bytes[129], bytes[130], bytes[131]) !== 'DICM') {
    throw new Error('El archivo no tiene una cabecera DICOM válida.');
  }

  const texto = (ini: number, largo: number): string => {
    let s = '';
    const fin = Math.min(ini + largo, total);
    for (let i = ini; i < fin; i++) {
      if (bytes[i] === 0) break;
      s += String.fromCharCode(bytes[i]);
    }
    return s.trim();
  };
  const u16 = (p: number): number => view.getUint16(p, true);
  const u32 = (p: number): number => view.getUint32(p, true);

  // --- Meta información del archivo (siempre Little Endian explícito) ---
  let pos = 132;
  let sintaxis = TS_EXPLICITO;
  while (pos + 8 <= total && u16(pos) === 0x0002) {
    const elemento = u16(pos + 2);
    const vr = String.fromCharCode(bytes[pos + 4], bytes[pos + 5]);
    const largo = VR_LARGO.has(vr) ? u32(pos + 8) : u16(pos + 6);
    const cabecera = VR_LARGO.has(vr) ? 12 : 8;
    if (elemento === 0x0010) sintaxis = texto(pos + cabecera, largo);
    pos += cabecera + largo;
  }
  if (sintaxis !== TS_EXPLICITO && sintaxis !== TS_IMPLICITO) return null;
  const explicito = sintaxis === TS_EXPLICITO;

  const cabeceraEn = (p: number): { largo: number; cabecera: number } => {
    if (p + 8 > total) throw new Error('Archivo DICOM truncado.');
    if (explicito) {
      const vr = String.fromCharCode(bytes[p + 4], bytes[p + 5]);
      if (VR_LARGO.has(vr)) return { largo: u32(p + 8), cabecera: 12 };
      return { largo: u16(p + 6), cabecera: 8 };
    }
    return { largo: u32(p + 4), cabecera: 8 };
  };

  // Salto de elementos anidados (secuencias con o sin longitud definida).
  const saltarElemento = (p: number): number => {
    const { largo, cabecera } = cabeceraEn(p);
    const inicio = p + cabecera;
    return largo === INDEFINIDO ? saltarSecuencia(inicio) : inicio + largo;
  };
  const saltarItemIndefinido = (p: number): number => {
    while (p + 8 <= total) {
      if (u16(p) === 0xfffe && u16(p + 2) === 0xe00d) return p + 8;
      p = saltarElemento(p);
    }
    throw new Error('Secuencia DICOM sin terminar.');
  };
  const saltarSecuencia = (p: number): number => {
    while (p + 8 <= total) {
      const grupo = u16(p);
      const elemento = u16(p + 2);
      const largo = u32(p + 4);
      p += 8;
      if (grupo === 0xfffe && elemento === 0xe0dd) return p;
      if (grupo !== 0xfffe || elemento !== 0xe000) throw new Error('Secuencia DICOM mal formada.');
      p = largo === INDEFINIDO ? saltarItemIndefinido(p) : p + largo;
    }
    throw new Error('Secuencia DICOM sin terminar.');
  };

  // --- Conjunto de datos ---
  let filas = 0;
  let columnas = 0;
  let muestras = 1;
  let bitsAsignados = 16;
  let representacion = 0;
  let cuadros = 1;
  let fotometria = 'MONOCHROME2';
  let modalidad = 'MR';
  let centro: number | null = null;
  let ancho: number | null = null;
  let pendiente = 1;
  let intercepto = 0;
  let pixelData: { ini: number; largo: number } | null = null;

  const numero = (ini: number, largo: number): number | null => {
    const n = parseFloat(texto(ini, largo).split('\\')[0]);
    return Number.isFinite(n) ? n : null;
  };

  while (pos + 8 <= total) {
    const tag = ((u16(pos) << 16) | u16(pos + 2)) >>> 0;
    const { largo, cabecera } = cabeceraEn(pos);
    const ini = pos + cabecera;
    if (tag === 0x7fe00010) {
      if (largo === INDEFINIDO) return null; // pixel data encapsulado (comprimido)
      pixelData = { ini, largo: Math.min(largo, total - ini) };
      break;
    }
    if (largo === INDEFINIDO) {
      pos = saltarSecuencia(ini);
      continue;
    }
    switch (tag) {
      case 0x00280002: muestras = u16(ini); break;
      case 0x00280004: fotometria = texto(ini, largo); break;
      case 0x00280008: cuadros = Math.max(1, Math.round(numero(ini, largo) ?? 1)); break;
      case 0x00280010: filas = u16(ini); break;
      case 0x00280011: columnas = u16(ini); break;
      case 0x00280100: bitsAsignados = u16(ini); break;
      case 0x00280103: representacion = u16(ini); break;
      case 0x00281050: centro = numero(ini, largo); break;
      case 0x00281051: ancho = numero(ini, largo); break;
      case 0x00281052: intercepto = numero(ini, largo) ?? 0; break;
      case 0x00281053: pendiente = numero(ini, largo) ?? 1; break;
      case 0x00080060: modalidad = texto(ini, largo) || 'MR'; break;
    }
    pos = ini + largo;
  }

  if (!pixelData || filas <= 0 || columnas <= 0) {
    throw new Error('El archivo DICOM no contiene una imagen (faltan filas, columnas o píxeles).');
  }
  if (muestras !== 1 || (bitsAsignados !== 16 && bitsAsignados !== 8)) return null;

  const bytesPorCuadro = filas * columnas * (bitsAsignados / 8);
  if (pixelData.largo < bytesPorCuadro) {
    throw new Error('Los datos de píxel del DICOM están incompletos (archivo truncado).');
  }
  const n = Math.max(1, Math.min(cuadros, Math.floor(pixelData.largo / bytesPorCuadro)));
  const cortes: CorteDicom[] = [];
  for (let k = 0; k < n; k++) {
    // slice() copia y garantiza la alineación que exigen los arrays de 16 bits.
    const copia = buffer.slice(pixelData.ini + k * bytesPorCuadro, pixelData.ini + (k + 1) * bytesPorCuadro);
    const pixeles =
      bitsAsignados === 8 ? new Uint8Array(copia) : representacion === 1 ? new Int16Array(copia) : new Uint16Array(copia);
    cortes.push({ filas, columnas, pixeles, pendiente, intercepto });
  }
  return { cortes, modalidad, centro, ancho, invertido: fotometria === 'MONOCHROME1' };
}

/** Rango de valores (ya con pendiente/intercepto aplicados) de un corte. */
export function rangoDeCorte(corte: CorteDicom): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  const p = corte.pixeles;
  for (let i = 0; i < p.length; i++) {
    const v = p[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const a = min * corte.pendiente + corte.intercepto;
  const b = max * corte.pendiente + corte.intercepto;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/** Convierte un corte a RGBA en escala de grises con la ventana (centro/ancho) dada. */
export function corteAImageData(
  corte: CorteDicom,
  centro: number,
  ancho: number,
  invertido: boolean,
  destino: Uint8ClampedArray,
): void {
  const p = corte.pixeles;
  const ventana = Math.max(ancho, 1);
  const inferior = centro - ventana / 2;
  const factor = 255 / ventana;
  const { pendiente, intercepto } = corte;
  for (let i = 0, o = 0; i < p.length; i++, o += 4) {
    let g = ((p[i] * pendiente + intercepto) - inferior) * factor;
    if (g < 0) g = 0;
    else if (g > 255) g = 255;
    if (invertido) g = 255 - g;
    destino[o] = g;
    destino[o + 1] = g;
    destino[o + 2] = g;
    destino[o + 3] = 255;
  }
}
