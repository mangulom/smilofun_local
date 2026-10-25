"""Datos de prueba realistas: histórico suficiente para entrenar la IA."""
from __future__ import annotations

import random
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import (
    Configuracion,
    Cita,
    DetalleFactura,
    Doctor,
    Factura,
    HistorialClinico,
    Odontograma,
    Paciente,
    Pago,
    PlanTratamiento,
    PlanTratamientoItem,
    Producto,
    Rol,
    Sucursal,
    Tratamiento,
    Usuario,
)

rng = random.Random(42)

NOMBRES_M = ["Juan", "Luis", "Miguel", "Carlos", "Diego", "Jorge", "Andrés", "Pedro", "Ricardo", "Fernando", "Sebastián", "Martín", "Alejandro", "Renzo", "Bruno"]
NOMBRES_F = ["María", "Lucía", "Valentina", "Camila", "Rosa", "Elena", "Sofía", "Gabriela", "Patricia", "Mónica", "Andrea", "Fiorella", "Milagros", "Stephanie", "Ruth"]
APELLIDOS = ["García", "Torres", "Quispe", "Mendoza", "Ríos", "Salazar", "Flores", "Cruz", "Vargas", "Rojas", "Paredes", "Soto", "Chávez", "Huamán", "Castro", "Aguilar", "Navarro", "Espinoza", "Miranda", "Zegarra"]

TRATAMIENTOS = [
    ("Limpieza dental (profilaxis)", "Prevención", 120, 45),
    ("Aplicación de flúor", "Prevención", 80, 30),
    ("Sellantes de fosas y fisuras", "Prevención", 70, 30),
    ("Resina composite", "Restauradora", 150, 40),
    ("Incrustación / onlay", "Restauradora", 550, 60),
    ("Endodoncia anterior", "Endodoncia", 350, 60),
    ("Endodoncia molar", "Endodoncia", 450, 90),
    ("Extracción simple", "Cirugía", 100, 30),
    ("Extracción quirúrgica (muela del juicio)", "Cirugía", 280, 60),
    ("Implante dental", "Implantología", 3500, 120),
    ("Corona de porcelona", "Prótesis", 800, 60),
    ("Puente fijo de 3 piezas", "Prótesis", 2200, 90),
    ("Prótesis parcial removible", "Prótesis", 1500, 90),
    ("Ortodoncia – mes a mes", "Ortodoncia", 300, 40),
    ("Blanqueamiento dental", "Estética", 600, 60),
    ("Radiografía panorámica", "Diagnóstico", 60, 15),
    ("Curetaje subgingival", "Periodoncia", 220, 45),
    ("Control y chequeo", "Prevención", 30, 20),
]

PRODUCTOS = [
    ("Guantes de nitrilo (caja x100)", "Descartables", "GN-100", 25, 10, 38, 60),
    ("Mascarillas quirúrgicas (caja x50)", "Descartables", "MQ-050", 18, 8, 25, 45),
    ("Carpuls de anestesia carticaína", "Anestésicos", "AN-010", 60, 20, 1.5, 3),
    ("Jeringas desechables 5 ml", "Descartables", "JD-005", 8, 15, 0.8, 1.5),
    ("Alginato de impresión (500 g)", "Impresión", "AL-500", 6, 4, 42, 70),
    ("Resina compuesta A2", "Restauradora", "RC-A2", 12, 6, 95, 160),
    ("Ácido ortofosfórico 37%", "Restauradora", "AO-037", 9, 5, 30, 55),
    ("Hipoclorito de sodio 5.25%", "Endodoncia", "HS-0525", 4, 6, 18, 35),
    ("EDTA líquido 17%", "Endodoncia", "ED-017", 5, 4, 22, 40),
    ("Ligas ortodónticas (bolsa)", "Ortodoncia", "LO-001", 30, 10, 12, 25),
    ("Brackets metálicos (set)", "Ortodoncia", "BR-MET", 7, 5, 85, 150),
    ("Escupideras descartables (bolsa x100)", "Descartables", "ES-100", 14, 6, 20, 35),
    ("Solución desinfectante 1 L", "Higiene", "SD-001", 3, 5, 28, 50),
    ("Cera gingival (frasco)", "Ortodoncia", "CG-001", 11, 4, 15, 28),
    ("Puntas de profilaxis (caja x100)", "Prevención", "PP-100", 2, 5, 45, 75),
]

ESTADOS_HISTORICO = [
    ("completada", 0.66),
    ("no_asistio", 0.15),
    ("cancelada", 0.11),
    ("confirmada", 0.04),
    ("programada", 0.04),
]


def _pick(weights):
    r, acc = rng.random(), 0
    for valor, w in weights:
        acc += w
        if r <= acc:
            return valor
    return weights[-1][0]


def _aleatorio_entre(a: date, b: date) -> date:
    return a + timedelta(days=rng.randint(0, (b - a).days))


def seed_if_empty(db: Session) -> bool:
    if db.scalar(select(func.count(Usuario.id))) > 0:
        return False

    # --- Roles y usuarios ---
    rol_admin = Rol(nombre="admin", descripcion="Administrador con acceso total")
    rol_doctor = Rol(nombre="doctor", descripcion="Profesional de la salud")
    rol_recepcion = Rol(nombre="recepcionista", descripcion="Agenda, pacientes y caja")
    db.add_all([rol_admin, rol_doctor, rol_recepcion])
    db.flush()

    # --- Sucursales ---
    centro = Sucursal(
        nombre="SmiloFun Centro",
        direccion="Av. Arequipa 1245, Lince",
        telefono="+51 1 555 0142",
        email="centro@dentamia.pe",
        ruc="20512345678",
        horario_apertura=time(8, 0),
        horario_cierre=time(20, 0),
    )
    sur = Sucursal(
        nombre="SmiloFun Sur",
        direccion="Av. Los Héroes 890, San Juan de Lurigancho",
        telefono="+51 1 555 0198",
        email="sur@dentamia.pe",
        ruc="20512345679",
        horario_apertura=time(9, 0),
        horario_cierre=time(19, 0),
    )
    db.add_all([centro, sur])
    db.flush()

    # --- Doctores ---
    doctores_data = [
        ("Valeria", "Mendoza", "valeria@dentamia.pe", "Ortodoncia", "2145678", "#7C3AED", centro.id),
        ("Carlos", "Ríos", "carlos@dentamia.pe", "Endodoncia", "2256789", "#FACC15", centro.id),
        ("Luciana", "Torres", "luciana@dentamia.pe", "Odontopediatría", "2367890", "#A855F7", centro.id),
        ("Marco", "Salazar", "marco@dentamia.pe", "Cirugía e Implantología", "2478901", "#EAB308", centro.id),
        ("Rosa", "Quispe", "rosa@dentamia.pe", "Periodoncia", "2589012", "#6D28D9", sur.id),
    ]
    doctores = [
        Doctor(
            nombres=n,
            apellidos=a,
            email=e,
            telefono=f"+51 9{i}8 555 {1000 + i}",
            especialidad=esp,
            cedula=ced,
            color=color,
            sucursal_id=suc,
        )
        for i, (n, a, e, esp, ced, color, suc) in enumerate(doctores_data)
    ]
    db.add_all(doctores)
    db.flush()

    db.add_all(
        [
            Usuario(email="admin@dentamia.com", password_hash=hash_password("admin123"),
                    nombre="Administrador SmiloFun", rol_id=rol_admin.id),
            Usuario(email="valeria@dentamia.com", password_hash=hash_password("doctor123"),
                    nombre="Dra. Valeria Mendoza", rol_id=rol_doctor.id, doctor_id=doctores[0].id),
            Usuario(email="recepcion@dentamia.com", password_hash=hash_password("recep123"),
                    nombre="Recepción Centro", rol_id=rol_recepcion.id),
        ]
    )

    # --- Catálogo de tratamientos ---
    tratamientos = [
        Tratamiento(nombre=n, categoria=c, precio=p, duracion_min=d,
                    descripcion=f"{n} — procedimiento estándar SmiloFun.")
        for n, c, p, d in TRATAMIENTOS
    ]
    db.add_all(tratamientos)
    db.flush()

    # --- Pacientes ---
    pacientes: list[Paciente] = []
    dnis_usados: set[str] = set()
    for i in range(35):
        sexo = rng.choice(["M", "F"])
        nombres = rng.choice(NOMBRES_M if sexo == "M" else NOMBRES_F)
        apellidos = f"{rng.choice(APELLIDOS)} {rng.choice(APELLIDOS)}"
        dni = str(rng.randint(10_000_000, 99_999_999))
        while dni in dnis_usados:
            dni = str(rng.randint(10_000_000, 99_999_999))
        dnis_usados.add(dni)
        edad = rng.randint(6, 78)
        fecha_nac = date.today() - timedelta(days=edad * 365 + rng.randint(0, 364))
        alergias = rng.choice([None, None, None, "Penicilina", "Látex", "Ibuprofeno", "Alergia a la lidocaína"])
        pac = Paciente(
            codigo=f"P-{i + 1:05d}",
            nombres=nombres,
            apellidos=apellidos,
            fecha_nacimiento=fecha_nac,
            sexo=sexo,
            dni=dni,
            telefono=f"+51 9{i % 10}{rng.randint(0, 9)} {rng.randint(100, 999)} {rng.randint(1000, 9999)}",
            email=f"{nombres.lower()}.{apellidos.split()[0].lower()}{i}@correo.com",
            direccion=f"{rng.choice(['Av. Brasil', 'Jr. Camaná', 'Av. México', 'Calle Los Olivos', 'Av. El Sol'])} {rng.randint(100, 9999)}",
            ocupacion=rng.choice(["Docente", "Ingeniero", "Estudiante", "Contador", "Comerciante", "Enfermera", "Abogado", None]),
            tipo_sangre=rng.choice(["O+", "A+", "B+", "AB+", "O-", "A-", None]),
            alergias=alergias,
            enfermedades=rng.choice([None, None, "Diabetes tipo 2", "Hipertensión", "Hipotiroidismo", "Asma"]),
            medicamentos=rng.choice([None, None, "Metformina 850 mg", "Losartán 50 mg", "Levotiroxina 50 mcg"]),
            emergencia_nombre=f"{rng.choice(NOMBRES_M + NOMBRES_F)} {apellidos.split()[0]}",
            emergencia_telefono=f"+51 9{rng.randint(1000000, 9999999)}",
            sucursal_id=centro.id if i < 28 else sur.id,
            creado_en=datetime.utcnow() - timedelta(days=rng.randint(1, 700)),
        )
        pacientes.append(pac)
    db.add_all(pacientes)
    db.flush()

    # --- Tratamiento de apoyo: piezas FDI adultas ---
    dientes_fdi = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
                   38, 37, 36, 35, 34, 33, 32, 31, 41, 42, 43, 44, 45, 46, 47, 48]

    # --- Odontogramas ---
    for pac in pacientes:
        if rng.random() < 0.7:
            for diente in rng.sample(dientes_fdi, rng.randint(0, 6)):
                estado = rng.choice(["caries", "caries", "restaurado", "ausente", "corona", "endodoncia", "implante"])
                db.add(Odontograma(
                    paciente_id=pac.id, diente=diente, superficie="",
                    estado=estado, fecha=datetime.utcnow() - timedelta(days=rng.randint(1, 400)),
                    doctor_id=rng.choice(doctores).id,
                ))

    # --- Citas: histórico 120 días + próximos 14 días ---
    hoy = date.today()
    slots = [time(h, m) for h in range(8, 19) for m in (0, 30)]
    citas: list[Cita] = []
    for dia in range(-120, 15):
        fecha = hoy + timedelta(days=dia)
        if fecha.weekday() == 6:  # domingo cerrado
            continue
        for doc in doctores:
            n = 0 if fecha.weekday() == 6 else rng.randint(0, 3 if fecha.weekday() < 6 else 2)
            if dia > 0:
                n = rng.randint(0, 3)
            usados = set()
            for _ in range(n):
                hora = rng.choice(slots)
                if hora in usados:
                    continue
                usados.add(hora)
                dur = rng.choice([30, 30, 45, 60])
                fin_dt = datetime.combine(fecha, hora) + timedelta(minutes=dur)
                pac = rng.choice(pacientes)
                if dia < 0:
                    estado = _pick(ESTADOS_HISTORICO)
                else:
                    estado = rng.choice(["programada", "confirmada", "programada", "confirmada", "completada"])
                cita = Cita(
                    paciente_id=pac.id,
                    doctor_id=doc.id,
                    sucursal_id=doc.sucursal_id,
                    fecha=fecha,
                    hora_inicio=hora,
                    hora_fin=fin_dt.time(),
                    estado=estado,
                    motivo=rng.choice([
                        "Control anual", "Dolor molar", "Limpieza", "Consulta ortodoncia",
                        "Resiente dolor", "Primera consulta", "Colocación de brackets",
                        "Extracción", "Blanqueamiento", "Endodoncia sesión 2", None,
                    ]),
                    recordatorio_enviado=(estado in ("confirmada", "completada")),
                    creado_en=datetime.combine(fecha, time(9, 0)) - timedelta(days=rng.randint(1, 45)),
                )
                citas.append(cita)
    db.add_all(citas)
    db.flush()

    # --- Historial clínico de citas completadas ---
    for cita in citas:
        if cita.estado == "completada" and rng.random() < 0.55:
            trat = rng.choice(tratamientos)
            db.add(HistorialClinico(
                paciente_id=cita.paciente_id,
                doctor_id=cita.doctor_id,
                cita_id=cita.id,
                fecha=datetime.combine(cita.fecha, cita.hora_inicio),
                motivo=cita.motivo or "Control",
                diagnostico=rng.choice([
                    "Caries oclusal en pieza 26", "Gingivitis generalizada leve",
                    "Necesidad de tratamiento endodóntico en pieza 36",
                    "Maloclusión clase II división 1", "Sano — solo requiere profilaxis",
                    "Fractura de esmalte en pieza 11",
                ]),
                tratamiento=trat.nombre,
                indicaciones=rng.choice([
                    "Evitar alimentos duros por 24 h", "Enjuague con clorhexidina 2 veces al día por 7 días",
                    "Acudir a control en 15 días", "Cepillado tres veces al día con hilo dental",
                ]),
                notas=None,
            ))

    # --- Facturación de citas completadas ---
    numero_por_anio: dict[int, int] = {}
    n_tratamientos = len(tratamientos)
    for cita in citas:
        if cita.estado != "completada" or rng.random() > 0.78:
            continue
        anio = cita.fecha.year
        numero_por_anio[anio] = numero_por_anio.get(anio, 0) + 1
        consulta = 30.0
        extra = float(tratamientos[rng.randrange(n_tratamientos)].precio)
        if rng.random() < 0.4:
            extra = 0.0
        subtotal = consulta + extra
        descuento = rng.choice([0.0, 0.0, 0.0, round(subtotal * 0.1, 2)])
        total = round(subtotal - descuento, 2)
        estado = _pick([("pagada", 0.8), ("parcial", 0.14), ("emitida", 0.06)])
        factura = Factura(
            numero=f"F-{anio}-{numero_por_anio[anio]:04d}",
            paciente_id=cita.paciente_id,
            sucursal_id=cita.sucursal_id,
            fecha=datetime.combine(cita.fecha, cita.hora_inicio),
            subtotal=round(subtotal, 2),
            descuento=descuento,
            impuesto=0.0,
            total=total,
            estado=estado,
            creado_por_id=None,
        )
        db.add(factura)
        db.flush()
        db.add(DetalleFactura(factura_id=factura.id, descripcion="Consulta odontológica",
                              cantidad=1, precio_unitario=consulta, subtotal=consulta))
        if extra > 0:
            trat = rng.choice(tratamientos)
            db.add(DetalleFactura(factura_id=factura.id, descripcion=trat.nombre,
                                  cantidad=1, precio_unitario=extra, subtotal=extra))
        if estado == "pagada":
            db.add(Pago(factura_id=factura.id, monto=total,
                        metodo=rng.choice(["efectivo", "tarjeta", "yape", "plin", "transferencia"]),
                        fecha=datetime.combine(cita.fecha, cita.hora_inicio)))
        elif estado == "parcial":
            db.add(Pago(factura_id=factura.id, monto=round(total * rng.uniform(0.3, 0.6), 2),
                        metodo=rng.choice(["efectivo", "yape"]),
                        fecha=datetime.combine(cita.fecha, cita.hora_inicio)))

    # --- Planes de tratamiento ---
    for idx, pac in enumerate(rng.sample(pacientes, 10)):
        items = rng.sample(tratamientos, rng.randint(2, 3))
        subtotal = sum(float(t.precio) for t in items)
        descuento = rng.choice([0.0, round(subtotal * 0.05, 2)])
        plan = PlanTratamiento(
            codigo=f"PT-{idx + 1:05d}",
            paciente_id=pac.id,
            doctor_id=rng.choice(doctores).id,
            estado=rng.choice(["propuesto", "aprobado", "en_progreso", "completado", "propuesto"]),
            subtotal=round(subtotal, 2),
            descuento=descuento,
            total=round(subtotal - descuento, 2),
            notas="Plan generado en la primera evaluación.",
            creado_en=datetime.utcnow() - timedelta(days=rng.randint(3, 90)),
        )
        db.add(plan)
        db.flush()
        for t in items:
            db.add(PlanTratamientoItem(
                plan_id=plan.id, tratamiento_id=t.id, descripcion=t.nombre,
                cantidad=1, precio_unitario=float(t.precio), subtotal=float(t.precio),
                diente=str(rng.choice(dientes_fdi)) if rng.random() < 0.5 else None,
                estado_item=rng.choice(["pendiente", "pendiente", "en_progreso", "completado"]),
            ))

    # --- Inventario ---
    for i, (nombre, cat, sku, stock, minimo, compra, venta) in enumerate(PRODUCTOS):
        venc = None
        if i in (7, 12):
            venc = hoy + timedelta(days=rng.randint(-20, 25))
        elif rng.random() < 0.3:
            venc = hoy + timedelta(days=rng.randint(90, 400))
        db.add(Producto(
            nombre=nombre, categoria=cat, sku=sku, stock=stock, stock_minimo=minimo,
            precio_compra=compra, precio_venta=venta, unidad="unidad",
            fecha_vencimiento=venc,
            sucursal_id=centro.id if i % 3 else sur.id,
        ))

    # --- Configuración de la clínica ---
    db.add_all([
        Configuracion(clave="nombre_clinica", valor="SmiloFun", descripcion="Nombre comercial"),
        Configuracion(clave="moneda", valor="PEN", descripcion="Moneda por defecto (S/)"),
        Configuracion(clave="zona_horaria", valor="America/Lima"),
        Configuracion(clave="recordatorio_horas", valor="24", descripcion="Horas antes para recordatorio"),
        Configuracion(clave="impuesto_porcentaje", valor="0", descripcion="IGV aplicado (0 = exonerado)"),
    ])

    db.commit()
    return True
