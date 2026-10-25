"""Esquemas Pydantic (request/response) de la API Dentamia."""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Sexo = Literal["M", "F", "O"]
EstadoCita = Literal[
    "programada", "confirmada", "en_atencion", "completada", "cancelada", "no_asistio"
]
EstadoPlan = Literal["propuesto", "aprobado", "en_progreso", "completado", "rechazado"]
EstadoFactura = Literal["emitida", "parcial", "pagada", "anulada"]
MetodoPago = Literal["efectivo", "tarjeta", "yape", "plin", "transferencia", "otro"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # Multiempresa: columna opcional compartida por todas las respuestas
    empresa_id: int | None = None


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UsuarioOut(ORMModel):
    id: int
    email: EmailStr
    nombre: str
    activo: bool
    rol: "RolOut"
    doctor_id: int | None = None
    empresa_id: int | None = None
    empresas: list["EmpresaResumen"] = []


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioOut


class UsuarioCreate(BaseModel):
    email: EmailStr
    nombre: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=6, max_length=128)
    rol_id: int
    doctor_id: int | None = None
    activo: bool = True
    empresa_ids: list[int] = []


class UsuarioUpdate(BaseModel):
    email: EmailStr | None = None
    nombre: str | None = Field(default=None, min_length=3, max_length=120)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    rol_id: int | None = None
    doctor_id: int | None = None
    activo: bool | None = None
    empresa_ids: list[int] | None = None


class RolOut(ORMModel):
    id: int
    nombre: str
    descripcion: str | None = None


class EmpresaCreate(BaseModel):
    nombre: str = Field(min_length=3, max_length=120)
    ruc: str | None = None
    telefono: str | None = None
    email: EmailStr | None = None
    direccion: str | None = None
    color: str = "#7C3AED"
    activo: bool = True


class EmpresaUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=3, max_length=120)
    ruc: str | None = None
    telefono: str | None = None
    email: EmailStr | None = None
    direccion: str | None = None
    color: str | None = None
    activo: bool | None = None


class EmpresaOut(ORMModel):
    id: int
    nombre: str
    ruc: str | None = None
    telefono: str | None = None
    email: str | None = None
    direccion: str | None = None
    color: str = "#7C3AED"
    activo: bool = True
    creado_en: datetime | None = None


class EmpresaResumen(BaseModel):
    """Empresa ligera embebida en el listado de usuarios."""

    id: int
    nombre: str
    principal: bool = False


# ---------------------------------------------------------------------------
# Sucursal / configuración
# ---------------------------------------------------------------------------
class SucursalBase(BaseModel):
    nombre: str
    direccion: str | None = None
    telefono: str | None = None
    email: str | None = None
    ruc: str | None = None
    horario_apertura: time = time(8, 0)
    horario_cierre: time = time(20, 0)
    activa: bool = True


class SucursalCreate(SucursalBase):
    pass


class SucursalUpdate(BaseModel):
    nombre: str | None = None
    direccion: str | None = None
    telefono: str | None = None
    email: str | None = None
    ruc: str | None = None
    horario_apertura: time | None = None
    horario_cierre: time | None = None
    activa: bool | None = None


class SucursalOut(ORMModel):
    id: int
    nombre: str
    direccion: str | None
    telefono: str | None
    email: str | None
    ruc: str | None
    horario_apertura: time
    horario_cierre: time
    activa: bool


class ConfiguracionOut(ORMModel):
    id: int
    clave: str
    valor: str | None
    descripcion: str | None


class ConfiguracionUpdate(BaseModel):
    clave: str
    valor: str | None = None
    descripcion: str | None = None


# ---------------------------------------------------------------------------
# Doctores
# ---------------------------------------------------------------------------
class DoctorBase(BaseModel):
    empresa_id: int | None = None
    nombres: str
    apellidos: str
    email: EmailStr | None = None
    telefono: str | None = None
    especialidad: str | None = None
    cedula: str | None = None
    color: str = "#7C3AED"
    sucursal_id: int
    activo: bool = True


class DoctorCreate(DoctorBase):
    pass


class DoctorUpdate(BaseModel):
    empresa_id: int | None = None
    nombres: str | None = None
    apellidos: str | None = None
    email: EmailStr | None = None
    telefono: str | None = None
    especialidad: str | None = None
    cedula: str | None = None
    color: str | None = None
    sucursal_id: int | None = None
    activo: bool | None = None


class DoctorOut(ORMModel):
    id: int
    nombres: str
    apellidos: str
    email: str | None
    telefono: str | None
    especialidad: str | None
    cedula: str | None
    color: str
    sucursal_id: int
    activo: bool
    nombre_completo: str


# ---------------------------------------------------------------------------
# Pacientes
# ---------------------------------------------------------------------------
class PacienteBase(BaseModel):
    empresa_id: int | None = None
    nombres: str
    apellidos: str
    fecha_nacimiento: date | None = None
    sexo: Sexo | None = None
    dni: str | None = None
    telefono: str | None = None
    email: EmailStr | None = None
    direccion: str | None = None
    ocupacion: str | None = None
    tipo_sangre: str | None = None
    alergias: str | None = None
    enfermedades: str | None = None
    medicamentos: str | None = None
    antecedentes: str | None = None
    emergencia_nombre: str | None = None
    emergencia_telefono: str | None = None
    notas: str | None = None
    sucursal_id: int
    activo: bool = True


class PacienteCreate(PacienteBase):
    pass


class PacienteUpdate(BaseModel):
    empresa_id: int | None = None
    nombres: str | None = None
    apellidos: str | None = None
    fecha_nacimiento: date | None = None
    sexo: Sexo | None = None
    dni: str | None = None
    telefono: str | None = None
    email: EmailStr | None = None
    direccion: str | None = None
    ocupacion: str | None = None
    tipo_sangre: str | None = None
    alergias: str | None = None
    enfermedades: str | None = None
    medicamentos: str | None = None
    antecedentes: str | None = None
    emergencia_nombre: str | None = None
    emergencia_telefono: str | None = None
    notas: str | None = None
    sucursal_id: int | None = None
    activo: bool | None = None


class PacienteOut(ORMModel):
    id: int
    codigo: str
    nombres: str
    apellidos: str
    fecha_nacimiento: date | None
    sexo: str | None
    dni: str | None
    telefono: str | None
    email: str | None
    direccion: str | None
    ocupacion: str | None
    tipo_sangre: str | None
    alergias: str | None
    enfermedades: str | None
    medicamentos: str | None
    antecedentes: str | None
    emergencia_nombre: str | None
    emergencia_telefono: str | None
    notas: str | None
    sucursal_id: int
    activo: bool
    creado_en: datetime
    nombre_completo: str


class PacienteResumen(BaseModel):
    paciente: PacienteOut
    total_citas: int = 0
    proxima_cita: "CitaOut | None" = None
    ultima_visita: date | None = None
    total_gastado: float = 0
    saldo_pendiente: float = 0
    planes_activos: int = 0
    dientes_afectados: int = 0
    tasa_no_show: float = 0


# ---------------------------------------------------------------------------
# Historial clínico / Odontograma
# ---------------------------------------------------------------------------
class HistorialCreate(BaseModel):
    doctor_id: int
    cita_id: int | None = None
    motivo: str | None = None
    diagnostico: str | None = None
    tratamiento: str | None = None
    indicaciones: str | None = None
    notas: str | None = None


class HistorialOut(ORMModel):
    id: int
    paciente_id: int
    doctor_id: int
    cita_id: int | None
    fecha: datetime
    motivo: str | None
    diagnostico: str | None
    tratamiento: str | None
    indicaciones: str | None
    notas: str | None
    doctor: DoctorOut


class OdontogramaItem(BaseModel):
    diente: int = Field(ge=11, le=85)
    superficie: str = ""
    estado: str = "sano"
    notas: str | None = None
    doctor_id: int | None = None


class OdontogramaOut(ORMModel):
    id: int
    paciente_id: int
    diente: int
    superficie: str
    estado: str
    fecha: datetime
    doctor_id: int | None
    notas: str | None


# ---------------------------------------------------------------------------
# Citas
# ---------------------------------------------------------------------------
class CitaBase(BaseModel):
    empresa_id: int | None = None
    paciente_id: int
    doctor_id: int
    sucursal_id: int
    fecha: date
    hora_inicio: time
    hora_fin: time
    motivo: str | None = None
    notas: str | None = None
    estado: EstadoCita = "programada"


class CitaCreate(CitaBase):
    pass


class CitaUpdate(BaseModel):
    empresa_id: int | None = None
    paciente_id: int | None = None
    doctor_id: int | None = None
    sucursal_id: int | None = None
    fecha: date | None = None
    hora_inicio: time | None = None
    hora_fin: time | None = None
    motivo: str | None = None
    notas: str | None = None
    estado: EstadoCita | None = None


class CitaOut(ORMModel):
    id: int
    paciente_id: int
    doctor_id: int
    sucursal_id: int
    fecha: date
    hora_inicio: time
    hora_fin: time
    estado: str
    motivo: str | None
    notas: str | None
    recordatorio_enviado: bool
    creado_en: datetime
    paciente: PacienteOut
    doctor: DoctorOut


class EstadoCitaUpdate(BaseModel):
    estado: EstadoCita


# ---------------------------------------------------------------------------
# Tratamientos / planes
# ---------------------------------------------------------------------------
class TratamientoBase(BaseModel):
    empresa_id: int | None = None
    nombre: str
    categoria: str | None = None
    descripcion: str | None = None
    precio: float = 0
    duracion_min: int = 30
    activo: bool = True


class TratamientoCreate(TratamientoBase):
    pass


class TratamientoUpdate(BaseModel):
    empresa_id: int | None = None
    nombre: str | None = None
    categoria: str | None = None
    descripcion: str | None = None
    precio: float | None = None
    duracion_min: int | None = None
    activo: bool | None = None


class TratamientoOut(ORMModel):
    id: int
    nombre: str
    categoria: str | None
    descripcion: str | None
    precio: float
    duracion_min: int
    activo: bool


class PlanItemIn(BaseModel):
    tratamiento_id: int | None = None
    diente: str | None = None
    superficie: str | None = None
    descripcion: str
    cantidad: int = 1
    precio_unitario: float = 0


class PlanItemOut(ORMModel):
    id: int
    plan_id: int
    tratamiento_id: int | None
    diente: str | None
    superficie: str | None
    descripcion: str
    estado_item: str
    cantidad: int
    precio_unitario: float
    subtotal: float


class PlanCreate(BaseModel):
    empresa_id: int | None = None
    paciente_id: int
    doctor_id: int
    notas: str | None = None
    descuento: float = 0
    items: list[PlanItemIn]


class PlanUpdate(BaseModel):
    empresa_id: int | None = None
    estado: EstadoPlan | None = None
    notas: str | None = None
    descuento: float | None = None
    items: list[PlanItemIn] | None = None


class PlanOut(ORMModel):
    id: int
    codigo: str
    paciente_id: int
    doctor_id: int
    estado: str
    subtotal: float
    descuento: float
    total: float
    notas: str | None
    creado_en: datetime
    items: list[PlanItemOut]
    paciente: PacienteOut
    doctor: DoctorOut


# ---------------------------------------------------------------------------
# Facturación
# ---------------------------------------------------------------------------
class DetalleIn(BaseModel):
    descripcion: str
    cantidad: int = 1
    precio_unitario: float


class DetalleOut(ORMModel):
    id: int
    descripcion: str
    cantidad: int
    precio_unitario: float
    subtotal: float


class PagoIn(BaseModel):
    monto: float
    metodo: MetodoPago = "efectivo"
    referencia: str | None = None


class PagoOut(ORMModel):
    id: int
    fecha: datetime
    monto: float
    metodo: str
    referencia: str | None


class FacturaCreate(BaseModel):
    empresa_id: int | None = None
    paciente_id: int
    sucursal_id: int
    plan_id: int | None = None
    descuento: float = 0
    impuesto: float = 0  # monto calculado por el cliente o 0
    notas: str | None = None
    detalles: list[DetalleIn]


class FacturaOut(ORMModel):
    id: int
    numero: str
    paciente_id: int
    sucursal_id: int
    plan_id: int | None
    fecha: datetime
    subtotal: float
    descuento: float
    impuesto: float
    total: float
    estado: str
    notas: str | None
    detalles: list[DetalleOut]
    pagos: list[PagoOut]
    paciente: PacienteOut


# ---------------------------------------------------------------------------
# Inventario
# ---------------------------------------------------------------------------
class ProductoBase(BaseModel):
    empresa_id: int | None = None
    nombre: str
    categoria: str | None = None
    sku: str | None = None
    descripcion: str | None = None
    stock: int = 0
    stock_minimo: int = 5
    unidad: str = "unidad"
    precio_compra: float = 0
    precio_venta: float = 0
    fecha_vencimiento: date | None = None
    sucursal_id: int
    activo: bool = True


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    empresa_id: int | None = None
    nombre: str | None = None
    categoria: str | None = None
    sku: str | None = None
    descripcion: str | None = None
    stock: int | None = None
    stock_minimo: int | None = None
    unidad: str | None = None
    precio_compra: float | None = None
    precio_venta: float | None = None
    fecha_vencimiento: date | None = None
    activo: bool | None = None


class ProductoOut(ORMModel):
    id: int
    nombre: str
    categoria: str | None
    sku: str | None
    descripcion: str | None
    stock: int
    stock_minimo: int
    unidad: str
    precio_compra: float
    precio_venta: float
    fecha_vencimiento: date | None
    sucursal_id: int
    activo: bool
    alerta_stock: bool = False
    alerta_vencimiento: bool = False


class MovimientoIn(BaseModel):
    tipo: Literal["entrada", "salida"]
    cantidad: int = Field(gt=0)
    motivo: str | None = None


class MovimientoOut(ORMModel):
    id: int
    producto_id: int
    tipo: str
    cantidad: int
    motivo: str | None
    fecha: datetime


class ProveedorBase(BaseModel):
    empresa_id: int | None = None
    nombre: str
    ruc: str | None = None
    contacto: str | None = None
    telefono: str | None = None
    email: EmailStr | None = None
    direccion: str | None = None
    notas: str | None = None
    activo: bool = True


class ProveedorCreate(ProveedorBase):
    pass


class ProveedorUpdate(BaseModel):
    nombre: str | None = None
    ruc: str | None = None
    contacto: str | None = None
    telefono: str | None = None
    email: EmailStr | None = None
    direccion: str | None = None
    notas: str | None = None
    activo: bool | None = None


class ProveedorOut(ProveedorBase, ORMModel):
    id: int
    creado_en: datetime


class DetalleCompraCreate(BaseModel):
    producto_id: int
    cantidad: int = Field(gt=0, le=100000)
    costo_unitario: float = Field(ge=0, le=99_999_999.99)


class CompraInsumoCreate(BaseModel):
    empresa_id: int | None = None
    proveedor_id: int
    sucursal_id: int
    referencia: str | None = None
    fecha: date = Field(default_factory=date.today)
    impuesto: float = Field(default=0, ge=0, le=99_999_999.99)
    notas: str | None = None
    detalles: list[DetalleCompraCreate] = Field(min_length=1, max_length=200)

    @field_validator("fecha")
    @classmethod
    def validar_fecha_compra(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("La fecha de compra no puede ser futura")
        return value


class DetalleCompraOut(ORMModel):
    id: int
    producto_id: int
    cantidad: int
    costo_unitario: float
    subtotal: float
    producto: dict


class CompraInsumoOut(ORMModel):
    id: int
    empresa_id: int | None
    proveedor_id: int
    sucursal_id: int
    usuario_id: int | None
    numero: str
    referencia: str | None
    fecha: date
    estado: str
    moneda: str
    subtotal: float
    impuesto: float
    total: float
    notas: str | None
    creado_en: datetime
    proveedor: ProveedorOut
    detalles: list[DetalleCompraOut]


# ---------------------------------------------------------------------------
# Dashboard / reportes
# ---------------------------------------------------------------------------
class IngresoMensual(BaseModel):
    mes: str
    total: float


class DashboardOut(BaseModel):
    citas_hoy: int
    citas_hoy_por_estado: dict[str, int]
    proximas_citas: list[CitaOut]
    ingresos_mes: float
    ingresos_mes_anterior: float
    variacion_ingresos: float
    pacientes_nuevos_mes: int
    pacientes_total: int
    doctores_activos: int
    tasa_asistencia: float
    citas_pendientes_confirmar: int
    stock_alertas: int
    serie_ingresos: list[IngresoMensual]
    top_tratamientos: list[dict[str, Any]]
    citas_por_doctor: list[dict[str, Any]]


class ReporteIngresosOut(BaseModel):
    detalle: list[IngresoMensual]
    total: float
    promedio: float


class ReporteDoctorOut(BaseModel):
    doctor: str
    citas: int
    ingresos: float
    color: str


class ReporteTratamientoOut(BaseModel):
    tratamiento: str
    cantidad: int
    total: float


# ---------------------------------------------------------------------------
# IA
# ---------------------------------------------------------------------------
class NoShowPrediccion(BaseModel):
    cita_id: int
    paciente_id: int
    paciente: str
    fecha: date
    hora: str
    probabilidad: float
    riesgo: Literal["bajo", "medio", "alto"]
    factores: list[str] = []
    recomendacion: str = ""


class ProyeccionIngresos(BaseModel):
    mes: str
    proyectado: float
    confianza: float
    tendencia: Literal["creciente", "estable", "decreciente"]


class PacienteRiesgo(BaseModel):
    paciente_id: int
    codigo: str
    nombre: str
    score: float
    riesgo: Literal["bajo", "medio", "alto"]
    motivos: list[str]


class RecomendacionIA(BaseModel):
    tipo: str
    prioridad: Literal["alta", "media", "baja"]
    titulo: str
    descripcion: str
    entidad_tipo: str | None = None
    entidad_id: int | None = None
    accion: str | None = None


class ResumenIAOut(BaseModel):
    generado_en: datetime
    no_show_riesgo_alto: list[NoShowPrediccion]
    proyeccion_ingresos: list[ProyeccionIngresos]
    pacientes_riesgo: list[PacienteRiesgo]
    recomendaciones: list[RecomendacionIA]
    metricas_modelo: dict[str, Any]
    total_pacientes_evaluados: int


class PrediccionOut(ORMModel):
    id: int
    tipo: str
    fecha_generacion: datetime
    fecha_objeto: date | None
    entidad_tipo: str | None
    entidad_id: int | None
    valor: float | None
    probabilidad: float | None
    clasificacion: str | None
    detalles: dict | None
    estado: str
    cita_id: int | None = None
    paciente_id: int | None = None


# ---------------------------------------------------------------------------
# Exámenes de imagen (radiografías, fotos, tomografías, resonancias, escaneos)
# ---------------------------------------------------------------------------
TipoExamen = Literal["rx", "foto", "tomografia", "resonancia", "intraoral", "escaneo", "video", "otro"]


class ExamenMarca(BaseModel):
    """Marcador superpuesto a la imagen; x/y son fracciones 0..1 del tamaño natural."""

    x: float
    y: float
    diente: str | None = None
    nota: str | None = None


class ExamenImagenOut(ORMModel):
    id: int
    paciente_id: int
    doctor_id: int | None
    tipo: str
    titulo: str
    descripcion: str | None
    diente: str | None
    fecha: date
    archivo: str
    url: str
    mime: str
    tamano: int
    dimensiones: dict[str, int] | None = None
    formato_volumen: str | None = None
    instancias_dicom: list[dict[str, Any]] | None = None
    marcas: list[ExamenMarca] | None
    notas: str | None
    creado_en: datetime


class ExamenImagenUpdate(BaseModel):
    titulo: str | None = None
    tipo: TipoExamen | None = None
    descripcion: str | None = None
    diente: str | None = None
    notas: str | None = None
    marcas: list[ExamenMarca] | None = None
