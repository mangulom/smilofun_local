import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Catalogos,
  Cita,
  Dashboard,
  Doctor,
  Empresa,
  ExamenImagen,
  Factura,
  HistorialNota,
  OdontogramaPieza,
  Paciente,
  PacienteResumen,
  Plan,
  Prediccion,
  Producto,
  Proveedor,
  CompraInsumo,
  ResumenIA,
  Rol,
  Sucursal,
  Tratamiento,
  Usuario,
  UsuarioAdmin,
} from './models';

type Query = Record<string, string | number | boolean | undefined | null>;

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  private params(query?: Query): HttpParams {
    let p = new HttpParams();
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') {
          p = p.set(k, String(v));
        }
      }
    }
    return p;
  }

  // Dashboard
  dashboard(empresa_id?: number): Observable<Dashboard> {
    return this.http.get<Dashboard>('/api/dashboard', { params: this.params({ empresa_id }) });
  }

  // Pacientes
  pacientes(query?: Query): Observable<Paciente[]> {
    return this.http.get<Paciente[]>('/api/pacientes', { params: this.params(query) });
  }
  paciente(id: number): Observable<Paciente> {
    return this.http.get<Paciente>(`/api/pacientes/${id}`);
  }
  crearPaciente(data: Partial<Paciente>): Observable<Paciente> {
    return this.http.post<Paciente>('/api/pacientes', data);
  }
  actualizarPaciente(id: number, data: Partial<Paciente>): Observable<Paciente> {
    return this.http.put<Paciente>(`/api/pacientes/${id}`, data);
  }
  resumenPaciente(id: number): Observable<PacienteResumen> {
    return this.http.get<PacienteResumen>(`/api/pacientes/${id}/resumen`);
  }
  historial(id: number): Observable<HistorialNota[]> {
    return this.http.get<HistorialNota[]>(`/api/pacientes/${id}/historial`);
  }
  agregarHistorial(id: number, data: any): Observable<HistorialNota> {
    return this.http.post<HistorialNota>(`/api/pacientes/${id}/historial`, data);
  }
  odontograma(id: number): Observable<OdontogramaPieza[]> {
    return this.http.get<OdontogramaPieza[]>(`/api/pacientes/${id}/odontograma`);
  }
  guardarOdontograma(id: number, items: OdontogramaPieza[]): Observable<OdontogramaPieza[]> {
    return this.http.put<OdontogramaPieza[]>(`/api/pacientes/${id}/odontograma`, items);
  }

  // Exámenes de imagen (radiografías, fotos, tomografías, escaneos)
  examenes(id: number): Observable<ExamenImagen[]> {
    return this.http.get<ExamenImagen[]>(`/api/pacientes/${id}/examenes`);
  }
  serieDICOM(pacienteId: number, examenId: number): Observable<{ examen_id: number; formato: string; instancias: { url: string; instance_number: number }[] }> {
    return this.http.get<{ examen_id: number; formato: string; instancias: { url: string; instance_number: number }[] }>(
      `/api/pacientes/${pacienteId}/examenes/${examenId}/serie`,
    );
  }
  subirExamen(id: number, form: FormData): Observable<ExamenImagen> {
    return this.http.post<ExamenImagen>(`/api/pacientes/${id}/examenes`, form);
  }
  actualizarExamen(id: number, examenId: number, data: Partial<ExamenImagen>): Observable<ExamenImagen> {
    return this.http.patch<ExamenImagen>(`/api/pacientes/${id}/examenes/${examenId}`, data);
  }
  eliminarExamen(id: number, examenId: number): Observable<void> {
    return this.http.delete<void>(`/api/pacientes/${id}/examenes/${examenId}`);
  }

  // Doctores
  doctores(query?: Query): Observable<Doctor[]> {
    return this.http.get<Doctor[]>('/api/doctores', { params: this.params(query) });
  }
  crearDoctor(data: Partial<Doctor>): Observable<Doctor> {
    return this.http.post<Doctor>('/api/doctores', data);
  }
  actualizarDoctor(id: number, data: Partial<Doctor>): Observable<Doctor> {
    return this.http.put<Doctor>(`/api/doctores/${id}`, data);
  }

  // Citas
  citas(query?: Query): Observable<Cita[]> {
    return this.http.get<Cita[]>('/api/citas', { params: this.params(query) });
  }
  crearCita(data: any): Observable<Cita> {
    return this.http.post<Cita>('/api/citas', data);
  }
  actualizarCita(id: number, data: any): Observable<Cita> {
    return this.http.put<Cita>(`/api/citas/${id}`, data);
  }
  estadoCita(id: number, estado: string): Observable<Cita> {
    return this.http.patch<Cita>(`/api/citas/${id}/estado`, { estado });
  }
  eliminarCita(id: number): Observable<void> {
    return this.http.delete<void>(`/api/citas/${id}`);
  }

  // Tratamientos y planes
  tratamientos(query?: Query): Observable<Tratamiento[]> {
    return this.http.get<Tratamiento[]>('/api/tratamientos', { params: this.params(query) });
  }
  crearTratamiento(data: Partial<Tratamiento>): Observable<Tratamiento> {
    return this.http.post<Tratamiento>('/api/tratamientos', data);
  }
  actualizarTratamiento(id: number, data: Partial<Tratamiento>): Observable<Tratamiento> {
    return this.http.put<Tratamiento>(`/api/tratamientos/${id}`, data);
  }
  planes(query?: Query): Observable<Plan[]> {
    return this.http.get<Plan[]>('/api/planes', { params: this.params(query) });
  }
  crearPlan(data: any): Observable<Plan> {
    return this.http.post<Plan>('/api/planes', data);
  }
  actualizarPlan(id: number, data: any): Observable<Plan> {
    return this.http.patch<Plan>(`/api/planes/${id}`, data);
  }

  // Facturación
  facturas(query?: Query): Observable<Factura[]> {
    return this.http.get<Factura[]>('/api/facturas', { params: this.params(query) });
  }
  crearFactura(data: any): Observable<Factura> {
    return this.http.post<Factura>('/api/facturas', data);
  }
  pagarFactura(id: number, data: { monto: number; metodo: string }): Observable<Factura> {
    return this.http.post<Factura>(`/api/facturas/${id}/pagos`, data);
  }
  anularFactura(id: number): Observable<Factura> {
    return this.http.patch<Factura>(`/api/facturas/${id}/anular`, {});
  }

  // Inventario
  productos(query?: Query): Observable<Producto[]> {
    return this.http.get<Producto[]>('/api/productos', { params: this.params(query) });
  }
  crearProducto(data: Partial<Producto>): Observable<Producto> {
    return this.http.post<Producto>('/api/productos', data);
  }
  actualizarProducto(id: number, data: Partial<Producto>): Observable<Producto> {
    return this.http.put<Producto>(`/api/productos/${id}`, data);
  }
  eliminarProducto(id: number): Observable<void> {
    return this.http.delete<void>(`/api/productos/${id}`);
  }
  movimiento(id: number, data: { tipo: string; cantidad: number; motivo?: string }) {
    return this.http.post(`/api/productos/${id}/movimientos`, data);
  }
  proveedores(query?: Query): Observable<Proveedor[]> {
    return this.http.get<Proveedor[]>('/api/proveedores', { params: this.params(query) });
  }
  crearProveedor(data: Partial<Proveedor>): Observable<Proveedor> {
    return this.http.post<Proveedor>('/api/proveedores', data);
  }
  actualizarProveedor(id: number, data: Partial<Proveedor>): Observable<Proveedor> {
    return this.http.put<Proveedor>(`/api/proveedores/${id}`, data);
  }
  eliminarProveedor(id: number): Observable<void> {
    return this.http.delete<void>(`/api/proveedores/${id}`);
  }
  compras(query?: Query): Observable<CompraInsumo[]> {
    return this.http.get<CompraInsumo[]>('/api/compras-insumos', { params: this.params(query) });
  }
  crearCompra(data: any): Observable<CompraInsumo> {
    return this.http.post<CompraInsumo>('/api/compras-insumos', data);
  }

  // Reportes
  reporteIngresos(query?: Query) {
    return this.http.get<{ detalle: { mes: string; total: number }[]; total: number; promedio: number }>(
      '/api/reportes/ingresos',
      { params: this.params(query) }
    );
  }
  reporteDoctores(query?: Query) {
    return this.http.get<{ doctor: string; citas: number; ingresos: number; color: string }[]>(
      '/api/reportes/doctores',
      { params: this.params(query) }
    );
  }
  reporteTratamientos(query?: Query) {
    return this.http.get<{ tratamiento: string; cantidad: number; total: number }[]>(
      '/api/reportes/tratamientos',
      { params: this.params(query) }
    );
  }
  reporteCitas(query?: Query) {
    return this.http.get<{ estado: string; cantidad: number; porcentaje: number }[]>(
      '/api/reportes/citas',
      { params: this.params(query) }
    );
  }

  // IA
  resumenIA(empresa_id?: number): Observable<ResumenIA> {
    return this.http.get<ResumenIA>('/api/ia/resumen', { params: this.params({ empresa_id }) });
  }
  noShow(query?: Query) {
    return this.http.get<any[]>('/api/ia/no-show', { params: this.params(query) });
  }
  pacientesRiesgo(limite = 10, empresa_id?: number) {
    return this.http.get<any[]>('/api/ia/pacientes-riesgo', {
      params: this.params({ limite, empresa_id }),
    });
  }
  recomendacionesIA(limite = 10, empresa_id?: number) {
    return this.http.get<any[]>('/api/ia/recomendaciones', {
      params: this.params({ limite, empresa_id }),
    });
  }
  proyeccionIngresos(meses = 6, empresa_id?: number) {
    return this.http.get<any>('/api/ia/proyeccion-ingresos', {
      params: this.params({ meses, empresa_id }),
    });
  }
  entrenarIA(empresa_id?: number) {
    return this.http.post<{ modelo: string; muestras: number; accuracy: number | null }>(
      '/api/ia/entrenar',
      {},
      { params: this.params({ empresa_id }) }
    );
  }
  prediccionesIA(limite = 50) {
    return this.http.get<Prediccion[]>('/api/ia/predicciones', { params: { limite } });
  }
  segmentacionIA(empresa_id?: number) {
    return this.http.get<any>('/api/ia/segmentacion', { params: this.params({ empresa_id }) });
  }
  demandaCitas(dias = 14, empresa_id?: number) {
    return this.http.get<any>('/api/ia/demanda-citas', {
      params: this.params({ dias, empresa_id }),
    });
  }
  inventarioIA(empresa_id?: number) {
    return this.http.get<any[]>('/api/ia/inventario', { params: this.params({ empresa_id }) });
  }
  agendaIA(empresa_id?: number) {
    return this.http.get<any>('/api/ia/agenda', { params: this.params({ empresa_id }) });
  }
  anomaliasIA(empresa_id?: number) {
    return this.http.get<any>('/api/ia/anomalias', { params: this.params({ empresa_id }) });
  }
  rentabilidadIA(limite = 12, empresa_id?: number) {
    return this.http.get<any[]>('/api/ia/rentabilidad', {
      params: this.params({ limite, empresa_id }),
    });
  }
  asistenteIA(pregunta: string, empresa_id?: number) {
    return this.http.post<any>('/api/ia/asistente', { pregunta, empresa_id });
  }

  // Diseño 3D Dental
  catalogoDiseno3D() {
    return this.http.get<any>('/api/diseno3d/catalogo');
  }
  generarDiseno3D(data: any) {
    return this.http.post<any>('/api/diseno3d/generar', data);
  }
  historialDiseno3D(empresa_id?: number, paciente_id?: number) {
    return this.http.get<any[]>('/api/diseno3d/historial', {
      params: this.params({ empresa_id, paciente_id }),
    });
  }
  geometriaDiseno3D(id: number) {
    return this.http.get<any>(`/api/diseno3d/${id}/geometria`);
  }

  // Configuración
  yo(): Observable<Usuario> {
    return this.http.get<Usuario>('/api/auth/me');
  }
  empresas(): Observable<Empresa[]> {
    return this.http.get<Empresa[]>('/api/empresas');
  }
  crearEmpresa(data: Partial<Empresa>): Observable<Empresa> {
    return this.http.post<Empresa>('/api/empresas', data);
  }
  actualizarEmpresa(id: number, data: Partial<Empresa>): Observable<Empresa> {
    return this.http.put<Empresa>(`/api/empresas/${id}`, data);
  }
  eliminarEmpresa(id: number): Observable<{ ok: boolean; id: number }> {
    return this.http.delete<{ ok: boolean; id: number }>(`/api/empresas/${id}`);
  }
  sucursales(): Observable<Sucursal[]> {
    return this.http.get<Sucursal[]>('/api/sucursales');
  }
  crearSucursal(data: Partial<Sucursal>): Observable<Sucursal> {
    return this.http.post<Sucursal>('/api/sucursales', data);
  }
  roles(): Observable<Rol[]> {
    return this.http.get<Rol[]>('/api/roles');
  }
  usuarios(): Observable<UsuarioAdmin[]> {
    return this.http.get<UsuarioAdmin[]>('/api/usuarios');
  }
  crearUsuario(data: {
    email: string;
    nombre: string;
    password: string;
    rol_id: number;
    doctor_id?: number | null;
    activo?: boolean;
    empresa_ids?: number[];
  }): Observable<UsuarioAdmin> {
    return this.http.post<UsuarioAdmin>('/api/usuarios', data);
  }
  actualizarUsuario(
    id: number,
    data: Partial<{
      email: string;
      nombre: string;
      password: string;
      rol_id: number;
      doctor_id: number | null;
      activo: boolean;
      empresa_ids: number[];
    }>
  ): Observable<UsuarioAdmin> {
    return this.http.put<UsuarioAdmin>(`/api/usuarios/${id}`, data);
  }
  eliminarUsuario(id: number): Observable<{ ok: boolean; id: number }> {
    return this.http.delete<{ ok: boolean; id: number }>(`/api/usuarios/${id}`);
  }
  catalogos(): Observable<Catalogos> {
    return this.http.get<Catalogos>('/api/catalogos');
  }
}
