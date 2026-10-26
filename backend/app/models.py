"""Modelos SQLAlchemy de Dentamia — centro de gestión odontológica."""
from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# ---------------------------------------------------------------------------
# Catálogos y seguridad
# ---------------------------------------------------------------------------


class Rol(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(50), unique=True)
    descripcion: Mapped[str | None] = mapped_column(Text)

    usuarios: Mapped[list["Usuario"]] = relationship(back_populates="rol")


class Empresa(Base):
    """Empresa / organización propietaria de los datos (modo multiempresa)."""

    __tablename__ = "empresas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), unique=True)
    ruc: Mapped[str | None] = mapped_column(String(20))
    telefono: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(120))
    direccion: Mapped[str | None] = mapped_column(String(200))
    color: Mapped[str] = mapped_column(String(20), default="#7C3AED")
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    vinculos: Mapped[list["UsuarioEmpresa"]] = relationship(
        back_populates="empresa", cascade="all, delete-orphan"
    )


class UsuarioEmpresa(Base):
    """Pertenencia de un usuario a una empresa (multiempresa; `principal` marca la activa)."""

    __tablename__ = "usuario_empresas"
    __table_args__ = (PrimaryKeyConstraint("usuario_id", "empresa_id"),)

    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    empresa_id: Mapped[int] = mapped_column(ForeignKey("empresas.id"))
    principal: Mapped[bool] = mapped_column(Boolean, default=False)

    usuario: Mapped["Usuario"] = relationship(back_populates="empresas_link")
    empresa: Mapped["Empresa"] = relationship(back_populates="vinculos")


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    nombre: Mapped[str] = mapped_column(String(120))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    rol_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    doctor_id: Mapped[int | None] = mapped_column(ForeignKey("doctores.id"), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    rol: Mapped[Rol] = relationship(back_populates="usuarios")
    doctor: Mapped["Doctor | None"] = relationship(back_populates="usuario")
    empresas_link: Mapped[list["UsuarioEmpresa"]] = relationship(
        back_populates="usuario", cascade="all, delete-orphan"
    )


class Sucursal(Base):
    """Centro odontológico (sede)."""

    __tablename__ = "sucursales"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), nullable=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120))
    direccion: Mapped[str | None] = mapped_column(String(200))
    telefono: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(120))
    ruc: Mapped[str | None] = mapped_column(String(20))
    horario_apertura: Mapped[time] = mapped_column(Time, default=time(8, 0))
    horario_cierre: Mapped[time] = mapped_column(Time, default=time(20, 0))
    activa: Mapped[bool] = mapped_column(Boolean, default=True)

    doctores: Mapped[list["Doctor"]] = relationship(back_populates="sucursal")


class Configuracion(Base):
    __tablename__ = "configuraciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    clave: Mapped[str] = mapped_column(String(80), unique=True)
    valor: Mapped[str | None] = mapped_column(Text)
    descripcion: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Equipo clínico
# ---------------------------------------------------------------------------


class Doctor(Base):
    __tablename__ = "doctores"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), default=1)
    nombres: Mapped[str] = mapped_column(String(100))
    apellidos: Mapped[str] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(120), unique=True)
    telefono: Mapped[str | None] = mapped_column(String(30))
    especialidad: Mapped[str | None] = mapped_column(String(100))
    cedula: Mapped[str | None] = mapped_column(String(30))
    color: Mapped[str] = mapped_column(String(20), default="#7C3AED")  # color en la agenda
    sucursal_id: Mapped[int] = mapped_column(ForeignKey("sucursales.id"))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    sucursal: Mapped[Sucursal] = relationship(back_populates="doctores")
    usuario: Mapped["Usuario | None"] = relationship(back_populates="doctor", uselist=False)
    citas: Mapped[list["Cita"]] = relationship(back_populates="doctor")

    @property
    def nombre_completo(self) -> str:
        return f"Dr. {self.nombres} {self.apellidos}" if not self.nombres.lower().startswith(
            ("dra", "dr")
        ) else f"{self.nombres} {self.apellidos}"


# ---------------------------------------------------------------------------
# Pacientes
# ---------------------------------------------------------------------------


class Paciente(Base):
    __tablename__ = "pacientes"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), default=1)
    codigo: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    nombres: Mapped[str] = mapped_column(String(100))
    apellidos: Mapped[str] = mapped_column(String(100))
    fecha_nacimiento: Mapped[date | None] = mapped_column(Date)
    sexo: Mapped[str | None] = mapped_column(String(1))  # M / F / O
    dni: Mapped[str | None] = mapped_column(String(20), unique=True)
    telefono: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(120))
    direccion: Mapped[str | None] = mapped_column(String(200))
    ocupacion: Mapped[str | None] = mapped_column(String(100))
    tipo_sangre: Mapped[str | None] = mapped_column(String(10))
    alergias: Mapped[str | None] = mapped_column(Text)
    enfermedades: Mapped[str | None] = mapped_column(Text)
    medicamentos: Mapped[str | None] = mapped_column(Text)
    antecedentes: Mapped[str | None] = mapped_column(Text)
    emergencia_nombre: Mapped[str | None] = mapped_column(String(120))
    emergencia_telefono: Mapped[str | None] = mapped_column(String(30))
    notas: Mapped[str | None] = mapped_column(Text)
    sucursal_id: Mapped[int] = mapped_column(ForeignKey("sucursales.id"))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    sucursal: Mapped[Sucursal] = relationship()
    citas: Mapped[list["Cita"]] = relationship(back_populates="paciente")
    historial: Mapped[list["HistorialClinico"]] = relationship(
        back_populates="paciente", order_by="HistorialClinico.fecha.desc()"
    )
    odontograma: Mapped[list["Odontograma"]] = relationship(back_populates="paciente")
    planes: Mapped[list["PlanTratamiento"]] = relationship(back_populates="paciente")
    facturas: Mapped[list["Factura"]] = relationship(back_populates="paciente")
    examenes: Mapped[list["ExamenImagen"]] = relationship(
        back_populates="paciente", cascade="all, delete-orphan"
    )

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombres} {self.apellidos}"


class HistorialClinico(Base):
    __tablename__ = "historial_clinico"

    id: Mapped[int] = mapped_column(primary_key=True)
    paciente_id: Mapped[int] = mapped_column(ForeignKey("pacientes.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctores.id"))
    cita_id: Mapped[int | None] = mapped_column(ForeignKey("citas.id"), nullable=True)
    fecha: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    motivo: Mapped[str | None] = mapped_column(String(200))
    diagnostico: Mapped[str | None] = mapped_column(Text)
    tratamiento: Mapped[str | None] = mapped_column(Text)
    indicaciones: Mapped[str | None] = mapped_column(Text)
    notas: Mapped[str | None] = mapped_column(Text)

    paciente: Mapped[Paciente] = relationship(back_populates="historial")
    doctor: Mapped[Doctor] = relationship()


# Estados posibles de una pieza dental (odontograma FDI)
ESTADOS_DIENTE = [
    "sano",
    "caries",
    "restaurado",
    "ausente",
    "extraccion_indicada",
    "implante",
    "corona",
    "puente",
    "endodoncia",
    "protesis",
    "fractura",
    "movilidad",
]

SUPERFICIES_DIENTE = ["M", "D", "O", "V", "L"]  # Mesial, Distal, Oclusal, Vestibular, Lingual


class Odontograma(Base):
    __tablename__ = "odontograma"
    __table_args__ = (
        UniqueConstraint("paciente_id", "diente", "superficie", name="uq_odontograma_pieza"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    paciente_id: Mapped[int] = mapped_column(ForeignKey("pacientes.id"), index=True)
    diente: Mapped[int] = mapped_column(Integer)  # numeración FDI: 11-48, 51-85
    superficie: Mapped[str] = mapped_column(String(5), default="")  # "" = pieza completa
    estado: Mapped[str] = mapped_column(String(30), default="sano")
    fecha: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    doctor_id: Mapped[int | None] = mapped_column(ForeignKey("doctores.id"), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text)

    paciente: Mapped[Paciente] = relationship(back_populates="odontograma")
    doctor: Mapped[Doctor | None] = relationship()


# ---------------------------------------------------------------------------
# Agenda / Citas
# ---------------------------------------------------------------------------

ESTADOS_CITA = [
    "programada",
    "confirmada",
    "en_atencion",
    "completada",
    "cancelada",
    "no_asistio",
]


class Cita(Base):
    __tablename__ = "citas"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), default=1)
    paciente_id: Mapped[int] = mapped_column(ForeignKey("pacientes.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctores.id"), index=True)
    sucursal_id: Mapped[int] = mapped_column(ForeignKey("sucursales.id"))
    fecha: Mapped[date] = mapped_column(Date, index=True)
    hora_inicio: Mapped[time] = mapped_column(Time)
    hora_fin: Mapped[time] = mapped_column(Time)
    estado: Mapped[str] = mapped_column(String(20), default="programada")
    motivo: Mapped[str | None] = mapped_column(String(200))
    notas: Mapped[str | None] = mapped_column(Text)
    recordatorio_enviado: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    paciente: Mapped[Paciente] = relationship(back_populates="citas")
    doctor: Mapped[Doctor] = relationship(back_populates="citas")
    sucursal: Mapped[Sucursal] = relationship()


# ---------------------------------------------------------------------------
# Tratamientos y planes
# ---------------------------------------------------------------------------


class Tratamiento(Base):
    __tablename__ = "tratamientos"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), default=1)
    nombre: Mapped[str] = mapped_column(String(120))
    categoria: Mapped[str | None] = mapped_column(String(80))
    descripcion: Mapped[str | None] = mapped_column(Text)
    precio: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    duracion_min: Mapped[int] = mapped_column(Integer, default=30)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


ESTADOS_PLAN = ["propuesto", "aprobado", "en_progreso", "completado", "rechazado"]
ESTADOS_ITEM_PLAN = ["pendiente", "en_progreso", "completado"]


class PlanTratamiento(Base):
    __tablename__ = "planes_tratamiento"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), default=1)
    codigo: Mapped[str] = mapped_column(String(20), unique=True)
    paciente_id: Mapped[int] = mapped_column(ForeignKey("pacientes.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctores.id"))
    estado: Mapped[str] = mapped_column(String(20), default="propuesto")
    subtotal: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    descuento: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    notas: Mapped[str | None] = mapped_column(Text)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    paciente: Mapped[Paciente] = relationship(back_populates="planes")
    doctor: Mapped[Doctor] = relationship()
    items: Mapped[list["PlanTratamientoItem"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan"
    )


class PlanTratamientoItem(Base):
    __tablename__ = "planes_tratamiento_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("planes_tratamiento.id", ondelete="CASCADE"), index=True
    )
    tratamiento_id: Mapped[int | None] = mapped_column(ForeignKey("tratamientos.id"), nullable=True)
    diente: Mapped[str | None] = mapped_column(String(10))
    superficie: Mapped[str | None] = mapped_column(String(10))
    descripcion: Mapped[str] = mapped_column(String(200))
    estado_item: Mapped[str] = mapped_column(String(20), default="pendiente")
    cantidad: Mapped[int] = mapped_column(Integer, default=1)
    precio_unitario: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    subtotal: Mapped[float] = mapped_column(Numeric(10, 2), default=0)

    plan: Mapped[PlanTratamiento] = relationship(back_populates="items")
    tratamiento: Mapped[Tratamiento | None] = relationship()


# ---------------------------------------------------------------------------
# Facturación
# ---------------------------------------------------------------------------

ESTADOS_FACTURA = ["emitida", "parcial", "pagada", "anulada"]
METODOS_PAGO = ["efectivo", "tarjeta", "yape", "plin", "transferencia", "otro"]


class Factura(Base):
    __tablename__ = "facturas"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), default=1)
    numero: Mapped[str] = mapped_column(String(20), unique=True)
    paciente_id: Mapped[int] = mapped_column(ForeignKey("pacientes.id"), index=True)
    sucursal_id: Mapped[int] = mapped_column(ForeignKey("sucursales.id"))
    plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("planes_tratamiento.id"), nullable=True
    )
    fecha: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    subtotal: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    descuento: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    impuesto: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    estado: Mapped[str] = mapped_column(String(20), default="emitida")
    notas: Mapped[str | None] = mapped_column(Text)
    creado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)

    paciente: Mapped[Paciente] = relationship(back_populates="facturas")
    sucursal: Mapped[Sucursal] = relationship()
    plan: Mapped[PlanTratamiento | None] = relationship()
    detalles: Mapped[list["DetalleFactura"]] = relationship(
        back_populates="factura", cascade="all, delete-orphan"
    )
    pagos: Mapped[list["Pago"]] = relationship(
        back_populates="factura", cascade="all, delete-orphan"
    )


class DetalleFactura(Base):
    __tablename__ = "detalles_factura"

    id: Mapped[int] = mapped_column(primary_key=True)
    factura_id: Mapped[int] = mapped_column(
        ForeignKey("facturas.id", ondelete="CASCADE"), index=True
    )
    descripcion: Mapped[str] = mapped_column(String(200))
    cantidad: Mapped[int] = mapped_column(Integer, default=1)
    precio_unitario: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    subtotal: Mapped[float] = mapped_column(Numeric(10, 2), default=0)

    factura: Mapped[Factura] = relationship(back_populates="detalles")


class Pago(Base):
    __tablename__ = "pagos"

    id: Mapped[int] = mapped_column(primary_key=True)
    factura_id: Mapped[int] = mapped_column(
        ForeignKey("facturas.id", ondelete="CASCADE"), index=True
    )
    fecha: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    monto: Mapped[float] = mapped_column(Numeric(10, 2))
    metodo: Mapped[str] = mapped_column(String(20), default="efectivo")
    referencia: Mapped[str | None] = mapped_column(String(80))

    factura: Mapped[Factura] = relationship(back_populates="pagos")


# ---------------------------------------------------------------------------
# Inventario
# ---------------------------------------------------------------------------


class Producto(Base):
    __tablename__ = "productos"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), default=1)
    nombre: Mapped[str] = mapped_column(String(120))
    categoria: Mapped[str | None] = mapped_column(String(80))
    sku: Mapped[str | None] = mapped_column(String(40), unique=True)
    descripcion: Mapped[str | None] = mapped_column(Text)
    stock: Mapped[int] = mapped_column(Integer, default=0)
    stock_minimo: Mapped[int] = mapped_column(Integer, default=5)
    unidad: Mapped[str] = mapped_column(String(20), default="unidad")
    precio_compra: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    precio_venta: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    fecha_vencimiento: Mapped[date | None] = mapped_column(Date)
    sucursal_id: Mapped[int] = mapped_column(ForeignKey("sucursales.id"))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class MovimientoProducto(Base):
    __tablename__ = "movimientos_producto"

    id: Mapped[int] = mapped_column(primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(10))  # entrada / salida
    cantidad: Mapped[int] = mapped_column(Integer)
    motivo: Mapped[str | None] = mapped_column(String(200))
    fecha: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)

    producto: Mapped[Producto] = relationship()


class Proveedor(Base):
    __tablename__ = "proveedores"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), default=1, index=True)
    nombre: Mapped[str] = mapped_column(String(160), index=True)
    ruc: Mapped[str | None] = mapped_column(String(20))
    contacto: Mapped[str | None] = mapped_column(String(120))
    telefono: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(120))
    direccion: Mapped[str | None] = mapped_column(String(240))
    notas: Mapped[str | None] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    compras: Mapped[list["CompraInsumo"]] = relationship(back_populates="proveedor")


class CompraInsumo(Base):
    __tablename__ = "compras_insumo"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), default=1, index=True)
    proveedor_id: Mapped[int] = mapped_column(ForeignKey("proveedores.id"), index=True)
    sucursal_id: Mapped[int] = mapped_column(ForeignKey("sucursales.id"), index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    numero: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    referencia: Mapped[str | None] = mapped_column(String(100))
    fecha: Mapped[date] = mapped_column(Date, default=date.today, index=True)
    estado: Mapped[str] = mapped_column(String(20), default="recibida")
    moneda: Mapped[str] = mapped_column(String(3), default="PEN")
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    impuesto: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    notas: Mapped[str | None] = mapped_column(Text)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    proveedor: Mapped[Proveedor] = relationship(back_populates="compras")
    sucursal: Mapped[Sucursal] = relationship()
    usuario: Mapped["Usuario | None"] = relationship()
    detalles: Mapped[list["DetalleCompraInsumo"]] = relationship(
        back_populates="compra", cascade="all, delete-orphan", order_by="DetalleCompraInsumo.id"
    )


class DetalleCompraInsumo(Base):
    __tablename__ = "detalles_compra_insumo"

    id: Mapped[int] = mapped_column(primary_key=True)
    compra_id: Mapped[int] = mapped_column(ForeignKey("compras_insumo.id", ondelete="CASCADE"), index=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("productos.id"), index=True)
    cantidad: Mapped[int] = mapped_column(Integer)
    costo_unitario: Mapped[float] = mapped_column(Numeric(10, 2))
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2))

    compra: Mapped[CompraInsumo] = relationship(back_populates="detalles")
    producto: Mapped[Producto] = relationship()


# ---------------------------------------------------------------------------
# IA / Predicciones
# ---------------------------------------------------------------------------


class PrediccionIA(Base):
    __tablename__ = "predicciones_ia"

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(30), index=True)  # no_show / ingreso / riesgo / recomendacion
    fecha_generacion: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    fecha_objeto: Mapped[date | None] = mapped_column(Date, nullable=True)
    entidad_tipo: Mapped[str | None] = mapped_column(String(30), nullable=True)
    entidad_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    paciente_id: Mapped[int | None] = mapped_column(ForeignKey("pacientes.id"), nullable=True)
    cita_id: Mapped[int | None] = mapped_column(ForeignKey("citas.id"), nullable=True)
    valor: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    probabilidad: Mapped[float | None] = mapped_column(Numeric(5, 4), nullable=True)
    clasificacion: Mapped[str | None] = mapped_column(String(30), nullable=True)
    detalles: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), default="activa")  # activa / aplicada / descartada

    paciente: Mapped[Paciente | None] = relationship()
    cita: Mapped["Cita | None"] = relationship()


# ---------------------------------------------------------------------------
# Exámenes de imagen (radiografías, fotos clínicas, escaneos…)
# ---------------------------------------------------------------------------

TIPOS_EXAMEN = ["rx", "foto", "tomografia", "resonancia", "intraoral", "escaneo", "video", "otro"]


class ExamenImagen(Base):
    __tablename__ = "examenes_imagen"

    id: Mapped[int] = mapped_column(primary_key=True)
    paciente_id: Mapped[int] = mapped_column(ForeignKey("pacientes.id"), index=True)
    doctor_id: Mapped[int | None] = mapped_column(ForeignKey("doctores.id"), nullable=True)
    tipo: Mapped[str] = mapped_column(String(20), default="rx")  # rx / foto / tomografia / resonancia / intraoral / escaneo / otro
    titulo: Mapped[str] = mapped_column(String(120))
    descripcion: Mapped[str | None] = mapped_column(Text)
    diente: Mapped[str | None] = mapped_column(String(10))  # pieza FDI vinculada (opcional)
    fecha: Mapped[date] = mapped_column(Date, default=lambda: date.today())
    archivo: Mapped[str] = mapped_column(String(200))  # nombre físico en uploads/examenes
    mime: Mapped[str] = mapped_column(String(80), default="image/png")
    tamano: Mapped[int] = mapped_column(Integer, default=0)
    dimensiones: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    formato_volumen: Mapped[str | None] = mapped_column(String(20), nullable=True)
    instancias_dicom: Mapped[list | None] = mapped_column(JSON, nullable=True)
    marcas: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [{x, y, diente, nota}]
    notas: Mapped[str | None] = mapped_column(Text)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    paciente: Mapped[Paciente] = relationship(back_populates="examenes")
    doctor: Mapped["Doctor | None"] = relationship()

    @property
    def url(self) -> str:
        return f"/uploads/examenes/{self.archivo}"


# ---------------------------------------------------------------------------
# Diseno 3D Dental (protesis / moldes para impresion)
# ---------------------------------------------------------------------------


class DisenoProtesis(Base):
    __tablename__ = "disenos_protesis"

    id: Mapped[int] = mapped_column(primary_key=True)
    empresa_id: Mapped[int | None] = mapped_column(ForeignKey("empresas.id"), default=1)
    paciente_id: Mapped[int | None] = mapped_column(
        ForeignKey("pacientes.id"), nullable=True, index=True
    )
    # Pieza: molar / premolar / canino / incisivo
    tipo: Mapped[str] = mapped_column(String(20), index=True)
    estilo: Mapped[str] = mapped_column(String(40), default="Standard")
    ancho: Mapped[float] = mapped_column(Numeric(6, 2), default=0)
    alto: Mapped[float] = mapped_column(Numeric(6, 2), default=0)
    profundidad: Mapped[float] = mapped_column(Numeric(6, 2), default=0)
    archivo: Mapped[str] = mapped_column(String(200))  # nombre fisico en uploads/diseno3d
    metricas: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    creado_por_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuarios.id"), nullable=True
    )
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    paciente: Mapped["Paciente | None"] = relationship()

    @property
    def url(self) -> str:
        return f"/uploads/diseno3d/{self.archivo}"
