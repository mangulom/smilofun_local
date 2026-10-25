// Modelos TypeScript espejo de la API Dentamia

export interface Rol {
  id: number;
  nombre: string;
  descripcion?: string;
}

export interface Empresa {
  id: number;
  nombre: string;
  ruc?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  color: string;
  activo: boolean;
  creado_en?: string | null;
}

export interface EmpresaAsignada {
  id: number;
  nombre: string;
  principal: boolean;
}

export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  activo: boolean;
  rol: Rol;
  doctor_id?: number | null;
  empresa_id?: number | null;
  empresas?: EmpresaAsignada[];
}

/** Usuario devuelto por GET /api/usuarios (listado de administración). */
export interface UsuarioAdmin {
  id: number;
  email: string;
  nombre: string;
  activo: boolean;
  rol: string | null;
  rol_id: number;
  doctor_id?: number | null;
  doctor?: string | null;
  creado_en?: string | null;
  empresa_id?: number | null;
  empresas?: EmpresaAsignada[];
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  usuario: Usuario;
}

export interface Sucursal {
  id: number;
  nombre: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  ruc?: string;
  horario_apertura: string;
  horario_cierre: string;
  activa: boolean;
  empresa_id?: number | null;
}

export interface Doctor {
  id: number;
  nombres: string;
  apellidos: string;
  email?: string;
  telefono?: string;
  especialidad?: string;
  cedula?: string;
  color: string;
  sucursal_id: number;
  activo: boolean;
  nombre_completo: string;
  empresa_id?: number | null;
}

export interface Paciente {
  id: number;
  codigo: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento?: string;
  sexo?: string;
  dni?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  ocupacion?: string;
  tipo_sangre?: string;
  alergias?: string;
  enfermedades?: string;
  medicamentos?: string;
  antecedentes?: string;
  emergencia_nombre?: string;
  emergencia_telefono?: string;
  notas?: string;
  sucursal_id: number;
  activo: boolean;
  creado_en: string;
  nombre_completo: string;
  empresa_id?: number | null;
}

export interface PacienteResumen {
  paciente: Paciente;
  total_citas: number;
  proxima_cita?: Cita | null;
  ultima_visita?: string | null;
  total_gastado: number;
  saldo_pendiente: number;
  planes_activos: number;
  dientes_afectados: number;
  tasa_no_show: number;
}

export interface Cita {
  id: number;
  paciente_id: number;
  doctor_id: number;
  sucursal_id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
  motivo?: string;
  notas?: string;
  recordatorio_enviado: boolean;
  creado_en: string;
  paciente: Paciente;
  doctor: Doctor;
  empresa_id?: number | null;
}

export interface Tratamiento {
  id: number;
  nombre: string;
  categoria?: string;
  descripcion?: string;
  precio: number;
  duracion_min: number;
  activo: boolean;
  empresa_id?: number | null;
}

export interface PlanItem {
  id?: number;
  plan_id?: number;
  tratamiento_id?: number | null;
  diente?: string | null;
  superficie?: string | null;
  descripcion: string;
  estado_item?: string;
  cantidad: number;
  precio_unitario: number;
  subtotal?: number;
}

export interface Plan {
  id: number;
  codigo: string;
  paciente_id: number;
  doctor_id: number;
  estado: string;
  subtotal: number;
  descuento: number;
  total: number;
  notas?: string;
  creado_en: string;
  items: PlanItem[];
  paciente: Paciente;
  doctor: Doctor;
  empresa_id?: number | null;
}

export interface Factura {
  id: number;
  numero: string;
  paciente_id: number;
  sucursal_id: number;
  plan_id?: number;
  fecha: string;
  subtotal: number;
  descuento: number;
  impuesto: number;
  total: number;
  estado: string;
  notas?: string;
  detalles: { id: number; descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[];
  pagos: { id: number; fecha: string; monto: number; metodo: string; referencia?: string }[];
  paciente: Paciente;
  empresa_id?: number | null;
}

export interface Producto {
  id: number;
  nombre: string;
  categoria?: string;
  sku?: string;
  descripcion?: string;
  stock: number;
  stock_minimo: number;
  unidad: string;
  precio_compra: number;
  precio_venta: number;
  fecha_vencimiento?: string;
  sucursal_id: number;
  activo: boolean;
  alerta_stock: boolean;
  alerta_vencimiento: boolean;
  empresa_id?: number | null;
}

export interface Proveedor {
  id: number;
  empresa_id?: number | null;
  nombre: string;
  ruc?: string | null;
  contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  notas?: string | null;
  activo: boolean;
  creado_en: string;
}

export interface DetalleCompraInsumo {
  id: number;
  producto_id: number;
  cantidad: number;
  costo_unitario: number;
  subtotal: number;
  producto: Producto;
}

export interface CompraInsumo {
  id: number;
  empresa_id?: number | null;
  proveedor_id: number;
  sucursal_id: number;
  usuario_id?: number | null;
  numero: string;
  referencia?: string | null;
  fecha: string;
  estado: string;
  moneda: string;
  subtotal: number;
  impuesto: number;
  total: number;
  notas?: string | null;
  creado_en: string;
  proveedor: Proveedor;
  detalles: DetalleCompraInsumo[];
}

export interface IngresoMensual {
  mes: string;
  total: number;
}

export interface Dashboard {
  citas_hoy: number;
  citas_hoy_por_estado: Record<string, number>;
  proximas_citas: Cita[];
  ingresos_mes: number;
  ingresos_mes_anterior: number;
  variacion_ingresos: number;
  pacientes_nuevos_mes: number;
  pacientes_total: number;
  doctores_activos: number;
  tasa_asistencia: number;
  citas_pendientes_confirmar: number;
  stock_alertas: number;
  serie_ingresos: IngresoMensual[];
  top_tratamientos: { tratamiento: string; cantidad: number; total: number }[];
  citas_por_doctor: { doctor: string; citas: number; color: string }[];
}

export interface NoShow {
  cita_id: number;
  paciente_id: number;
  paciente: string;
  fecha: string;
  hora: string;
  probabilidad: number;
  riesgo: 'bajo' | 'medio' | 'alto';
  factores: string[];
  recomendacion: string;
}

export interface Prediccion {
  id: number;
  tipo: string;
  fecha_generacion: string;
  fecha_objeto?: string | null;
  entidad_tipo?: string | null;
  entidad_id?: number | null;
  valor?: number | null;
  probabilidad?: number | null;
  clasificacion?: string | null;
  detalles?: Record<string, any> | null;
  estado: string;
  cita_id?: number | null;
  paciente_id?: number | null;
}

export interface Proyeccion {
  mes: string;
  proyectado: number;
  confianza: number;
  tendencia: 'creciente' | 'estable' | 'decreciente';
}

export interface PacienteRiesgo {
  paciente_id: number;
  codigo: string;
  nombre: string;
  score: number;
  riesgo: 'bajo' | 'medio' | 'alto';
  motivos: string[];
}

export interface Recomendacion {
  tipo: string;
  prioridad: 'alta' | 'media' | 'baja';
  titulo: string;
  descripcion: string;
  entidad_tipo?: string;
  entidad_id?: number;
  accion?: string;
}

export interface ResumenIA {
  generado_en: string;
  no_show_riesgo_alto: NoShow[];
  proyeccion_ingresos: Proyeccion[];
  pacientes_riesgo: PacienteRiesgo[];
  recomendaciones: Recomendacion[];
  metricas_modelo: Record<string, any>;
  total_pacientes_evaluados: number;
}

export interface HistorialNota {
  id: number;
  paciente_id: number;
  doctor_id: number;
  fecha: string;
  motivo?: string;
  diagnostico?: string;
  tratamiento?: string;
  indicaciones?: string;
  notas?: string;
  doctor: Doctor;
}

export interface OdontogramaPieza {
  id?: number;
  paciente_id?: number;
  diente: number;
  superficie: string;
  estado: string;
  fecha?: string;
  doctor_id?: number | null;
  notas?: string;
}

/** Marcador superpuesto a un examen de imagen (fracciones 0..1 del tamaño natural). */
export interface ExamenMarca {
  x: number;
  y: number;
  diente?: string | null;
  nota?: string | null;
}

export interface ExamenImagen {
  id: number;
  paciente_id: number;
  doctor_id?: number | null;
  tipo: string; // rx | foto | tomografia | resonancia | intraoral | escaneo | otro
  titulo: string;
  descripcion?: string | null;
  diente?: string | null;
  fecha: string;
  archivo: string;
  url: string;
  mime: string;
  tamano: number;
  dimensiones?: { x?: number; y?: number; z?: number; componentes?: number } | null;
  formato_volumen?: string | null;
  instancias_dicom?: { archivo: string; instance_number: number; bytes: number }[] | null;
  marcas?: ExamenMarca[] | null;
  notas?: string | null;
  creado_en: string;
}

export interface Catalogos {
  estados_cita: string[];
  estados_diente: string[];
  superficies_diente: string[];
  estados_plan: string[];
  estados_factura: string[];
  metodos_pago: string[];
}
