
import asyncio
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from datetime import datetime

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# ============================================================
# CONFIGURACIÓN
# ============================================================

BASE = Path(__file__).resolve().parent
URL = "http://localhost:4200"

ANCHO_CAPTURA = 1600
ALTO_CAPTURA = 900

ANCHO_REEL = 1080
ALTO_REEL = 1920

CARPETA_CAPTURAS = BASE / "capturas"
CARPETA_TEMPORAL = BASE / "captura_temporal"
CARPETA_RESULTADOS = BASE / "resultados"

ARCHIVO_REPORTE = CARPETA_RESULTADOS / "reporte_pruebas.json"
ARCHIVO_VIDEO = BASE / "dentamia_reel.mp4"
ARCHIVO_VOZ = BASE / "voz_dentamia.mp3"
ARCHIVO_VIDEO_TEMPORAL = BASE / "recorrido_dentamia.webm"

VOZ_TTS = "es-PE-CamilaNeural"

RUTAS = [
    ("Dashboard", "dashboard"),
    ("Pacientes", "pacientes"),
    ("Detalle de paciente", "pacientes/1"),
    ("Citas", "citas"),
    ("Doctores", "doctores"),
    ("Tratamientos", "tratamientos"),
    ("Facturación", "facturacion"),
    ("Inventario", "inventario"),
    ("Proveedores", "inventario/proveedores"),
    ("Compras", "inventario/compras"),
    ("Reportes", "reportes"),
    ("Asistente IA", "ia/asistente"),
    ("IA No-show", "ia/no-show"),
    ("IA Ingresos", "ia/ingresos"),
    ("IA Pacientes", "ia/pacientes"),
    ("IA Inventario", "ia/inventario"),
    ("IA Agenda", "ia/agenda"),
    ("Historial IA", "ia/historial"),
    ("Módulo IA", "ia"),
    ("Catálogo 3D", "diseno3d/catalogo"),
    ("Historial 3D", "diseno3d/historial"),
    ("Diseño 3D", "diseno3d"),
    ("Respaldo", "mantenimiento/respaldo"),
    ("Restauración", "mantenimiento/restaurar"),
    ("Configuración", "configuracion"),
    ("Empresas", "empresas"),
    ("Usuarios", "usuarios"),
    ("Contacto", "contacto"),
]

TEXTO_NARRACION = """
Bienvenido a Dentamia, la plataforma inteligente para la gestión odontológica.

Administra pacientes, citas, doctores, tratamientos y facturación desde un solo lugar.

Controla inventarios, proveedores, compras y reportes de tu clínica.

Con inteligencia artificial, Dentamia facilita el análisis de pacientes,
la gestión de agendas y el seguimiento de ingresos.

Explora las herramientas de diseño dental en tres dimensiones y consulta
el historial de tus trabajos.

Dentamia integra gestión, inteligencia artificial y tecnología odontológica
para optimizar el trabajo de tu clínica.
"""


# ============================================================
# UTILIDADES
# ============================================================

def crear_carpetas():
    for carpeta in (
        CARPETA_CAPTURAS,
        CARPETA_TEMPORAL,
        CARPETA_RESULTADOS,
    ):
        carpeta.mkdir(parents=True, exist_ok=True)


def buscar_ffmpeg():
    ejecutable = shutil.which("ffmpeg")
    if ejecutable:
        return ejecutable

    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return None


def guardar_json(ruta, contenido):
    ruta.write_text(
        json.dumps(contenido, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def esperar_pantalla(pagina):
    try:
        pagina.wait_for_load_state("domcontentloaded", timeout=10000)
    except PlaywrightTimeoutError:
        pass

    try:
        pagina.wait_for_load_state("networkidle", timeout=2500)
    except PlaywrightTimeoutError:
        pass

    pagina.wait_for_timeout(1200)


def parece_login(pagina):
    url_actual = pagina.url.lower()
    if "login" in url_actual or "iniciar-sesion" in url_actual:
        return True

    try:
        return pagina.locator(
            'input[type="password"]'
        ).is_visible(timeout=800)
    except Exception:
        return False


# ============================================================
# PRUEBAS DE PANTALLAS Y COMPONENTES
# ============================================================

def probar_componentes(pagina):
    resultado = {
        "url": pagina.url,
        "titulo": "",
        "enlaces": [],
        "botones": [],
        "campos": [],
        "errores_consola": [],
        "errores_pagina": [],
    }

    try:
        resultado["titulo"] = pagina.title()
    except Exception:
        pass

    # Enlaces visibles
    try:
        enlaces = pagina.locator("a:visible")
        cantidad = min(enlaces.count(), 150)

        for indice in range(cantidad):
            elemento = enlaces.nth(indice)
            try:
                resultado["enlaces"].append({
                    "texto": (elemento.inner_text(timeout=500) or "").strip()[:120],
                    "href": elemento.get_attribute("href"),
                })
            except Exception:
                continue
    except Exception:
        pass

    # Botones visibles
    try:
        botones = pagina.locator("button:visible")
        cantidad = min(botones.count(), 150)

        for indice in range(cantidad):
            elemento = botones.nth(indice)
            try:
                resultado["botones"].append({
                    "texto": (elemento.inner_text(timeout=500) or "").strip()[:120],
                    "deshabilitado": elemento.is_disabled(),
                })
            except Exception:
                continue
    except Exception:
        pass

    # Campos visibles
    try:
        campos = pagina.locator(
            'input:visible, select:visible, textarea:visible'
        )
        cantidad = min(campos.count(), 150)

        for indice in range(cantidad):
            elemento = campos.nth(indice)
            try:
                resultado["campos"].append({
                    "tipo": elemento.get_attribute("type"),
                    "nombre": elemento.get_attribute("name"),
                    "placeholder": elemento.get_attribute("placeholder"),
                    "deshabilitado": elemento.is_disabled(),
                })
            except Exception:
                continue
    except Exception:
        pass

    return resultado


def recorrer_rutas(pagina):
    reporte = {
        "fecha": datetime.now().isoformat(timespec="seconds"),
        "base_url": URL,
        "resolucion": {
            "ancho": ANCHO_CAPTURA,
            "alto": ALTO_CAPTURA,
        },
        "pantallas": [],
    }

    for indice, (nombre, ruta) in enumerate(RUTAS, start=1):
        destino = f"{URL}/{ruta}"

        print(f"\n[{indice}/{len(RUTAS)}] Abriendo: {nombre}")
        print(f"URL: {destino}")

        entrada = {
            "nombre": nombre,
            "ruta": ruta,
            "url_solicitada": destino,
            "estado": "pendiente",
            "url_final": "",
            "captura": "",
            "componentes": {},
            "error": None,
        }

        try:
            # Se utiliza la MISMA página y contexto del inicio de sesión.
            pagina.goto(
                destino,
                wait_until="domcontentloaded",
                timeout=20000,
            )
            esperar_pantalla(pagina)

            entrada["url_final"] = pagina.url

            if parece_login(pagina):
                entrada["estado"] = "sesion_no_reconocida"
                entrada["error"] = (
                    "La aplicación redirigió al inicio de sesión. "
                    "Revisa cómo conserva la autenticación."
                )
            else:
                entrada["estado"] = "visitada"

            entrada["componentes"] = probar_componentes(pagina)

            archivo_captura = CARPETA_CAPTURAS / (
                f"{indice:02d}_{ruta.replace('/', '_')}.png"
            )

            pagina.screenshot(
                path=str(archivo_captura),
                full_page=False,
                animations="disabled",
            )

            entrada["captura"] = str(archivo_captura)

            # Da tiempo para que el recorrido sea visible en el video.
            pagina.wait_for_timeout(1800)

        except Exception as error:
            entrada["estado"] = "error"
            entrada["error"] = str(error)
            entrada["url_final"] = pagina.url

            print(f"ERROR en {nombre}: {error}")

        reporte["pantallas"].append(entrada)

        guardar_json(ARCHIVO_REPORTE, reporte)

        print(f"Resultado: {entrada['estado']}")

    reporte["resumen"] = {
        "total": len(reporte["pantallas"]),
        "visitadas": sum(
            1 for p in reporte["pantallas"]
            if p["estado"] == "visitada"
        ),
        "sesion_no_reconocida": sum(
            1 for p in reporte["pantallas"]
            if p["estado"] == "sesion_no_reconocida"
        ),
        "errores": sum(
            1 for p in reporte["pantallas"]
            if p["estado"] == "error"
        ),
    }

    guardar_json(ARCHIVO_REPORTE, reporte)

    print("\nRESUMEN DE PRUEBAS")
    print(json.dumps(reporte["resumen"], ensure_ascii=False, indent=2))
    print(f"Reporte: {ARCHIVO_REPORTE}")

    return reporte


# ============================================================
# VOZ EN ESPAÑOL
# ============================================================

async def generar_voz():
    try:
        import edge_tts

        comunicacion = edge_tts.Communicate(
            TEXTO_NARRACION,
            VOZ_TTS,
            rate="-5%",
            volume="+0%",
        )
        await comunicacion.save(str(ARCHIVO_VOZ))
        print(f"Voz generada: {ARCHIVO_VOZ}")
        return True

    except Exception as error:
        print(f"No se pudo generar la voz: {error}")
        return False


# ============================================================
# MONTAJE DEL REEL
# ============================================================

def crear_reel(ffmpeg):
    if not ffmpeg:
        print("No se encontró FFmpeg. No se puede montar el Reel.")
        return

    if not ARCHIVO_VIDEO_TEMPORAL.exists():
        print("No se encontró la grabación del recorrido.")
        return

    # Busca un archivo de música compatible dentro de la carpeta del proyecto.
    extensiones_musica = {".mp3", ".wav", ".m4a", ".aac", ".ogg"}
    archivos_musica = [
        archivo for archivo in BASE.iterdir()
        if archivo.is_file()
        and archivo.suffix.lower() in extensiones_musica
        and archivo.name.lower() != ARCHIVO_VOZ.name.lower()
    ]

    musica = archivos_musica[0] if archivos_musica else None

    # Convierte la grabación horizontal a composición vertical 9:16.
    filtro_video = (
        "scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,"
        "setsar=1,fps=30"
    )

    comando = [
        ffmpeg,
        "-y",
        "-i", str(ARCHIVO_VIDEO_TEMPORAL),
    ]

    if ARCHIVO_VOZ.exists():
        comando += ["-i", str(ARCHIVO_VOZ)]

    if musica:
        comando += ["-stream_loop", "-1", "-i", str(musica)]

    comando += [
        "-vf", filtro_video,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "21",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-movflags", "+faststart",
    ]

    entradas_audio = []
    indice_entrada = 1

    if ARCHIVO_VOZ.exists():
        entradas_audio.append(
            f"[{indice_entrada}:a]volume=1.0[voz]"
        )
        indice_entrada += 1

    if musica:
        entradas_audio.append(
            f"[{indice_entrada}:a]volume=0.15[musica]"
        )

    if ARCHIVO_VOZ.exists() and musica:
        filtro_audio = (
            ";".join(entradas_audio)
            + ";[voz][musica]amix=inputs=2:duration=first:dropout_transition=2[audio]"
        )
        comando += ["-filter_complex", filtro_audio, "-map", "0:v:0", "-map", "[audio]"]
    elif ARCHIVO_VOZ.exists():
        comando += ["-map", "0:v:0", "-map", "1:a:0", "-shortest"]
    elif musica:
        comando += ["-map", "0:v:0", "-map", "1:a:0", "-shortest"]
    else:
        comando += ["-map", "0:v:0", "-an"]

    comando += [str(ARCHIVO_VIDEO)]

    print("\nCreando Reel vertical 1080 x 1920...")
    resultado = subprocess.run(comando, capture_output=True, text=True)

    if resultado.returncode == 0 and ARCHIVO_VIDEO.exists():
        print(f"\nREEL CREADO: {ARCHIVO_VIDEO}")
    else:
        print("Error al montar el video:")
        print(resultado.stderr[-5000:])


# ============================================================
# EJECUCIÓN PRINCIPAL
# ============================================================

def main():
    crear_carpetas()

    print("=" * 60)
    print("DENTAMIA - GRABACIÓN Y PRUEBAS AUTOMÁTICAS")
    print("=" * 60)

    try:
        import playwright  # noqa: F401
    except ImportError:
        print("Falta Playwright. Ejecuta:")
        print("python -m pip install playwright")
        sys.exit(1)

    if not ARCHIVO_REPORTE.exists():
        guardar_json(ARCHIVO_REPORTE, {"pantallas": []})

    with sync_playwright() as playwright:
        navegador = playwright.chromium.launch(headless=False)

        # La grabación comienza desde el primer contexto.
        # La sesión no se pierde al cambiar de pantalla.
        contexto = navegador.new_context(
            viewport={
                "width": ANCHO_CAPTURA,
                "height": ALTO_CAPTURA,
            },
            record_video_dir=str(CARPETA_TEMPORAL),
            record_video_size={
                "width": ANCHO_CAPTURA,
                "height": ALTO_CAPTURA,
            },
        )

        pagina = contexto.new_page()
        errores_consola = []
        errores_pagina = []

        pagina.on(
            "console",
            lambda mensaje: errores_consola.append(mensaje.text)
            if mensaje.type == "error"
            else None,
        )
        pagina.on(
            "pageerror",
            lambda error: errores_pagina.append(str(error)),
        )

        print(f"\nAbriendo directamente el dashboard de Dentamia")
        if parece_login(pagina):
            print("\nInicia sesión en Dentamia.")
            print("Cuando termines, vuelve a PowerShell.")
            input("Pulsa ENTER para continuar... ")

        pagina.goto(f"{URL}/dashboard", wait_until="domcontentloaded", timeout=30000)
        esperar_pantalla(pagina)

        print("\nComenzando el recorrido de los componentes...")

        if parece_login(pagina):
            print(
                "\nAviso: la pantalla todavía parece ser el login. "
                "El recorrido puede redirigirse al login si no has iniciado sesión."
            )

        reporte = recorrer_rutas(pagina)

        # Cierra en la última pantalla del recorrido, sin repetir Dashboard ni módulos.
        for ruta in ():
            try:
                pagina.goto(
                    f"{URL}/{ruta}",
                    wait_until="domcontentloaded",
                    timeout=20000,
                )
                esperar_pantalla(pagina)
                pagina.wait_for_timeout(2500)
            except Exception as error:
                print(f"No se pudo volver a {ruta}: {error}")

        reporte["errores_consola"] = errores_consola
        reporte["errores_pagina"] = errores_pagina
        guardar_json(ARCHIVO_REPORTE, reporte)

        print("\nGrabación terminada. Cerrando navegador...")
        pagina.close()
        contexto.close()
        navegador.close()

    # Obtiene la grabación generada por Playwright.
    videos = sorted(
        CARPETA_TEMPORAL.glob("*.webm"),
        key=lambda archivo: archivo.stat().st_mtime,
        reverse=True,
    )

    if videos:
        shutil.copy2(videos[0], ARCHIVO_VIDEO_TEMPORAL)
        print(f"Grabación guardada: {ARCHIVO_VIDEO_TEMPORAL}")
    else:
        print("No se encontró el archivo de video WebM.")

    asyncio.run(generar_voz())

    ffmpeg = buscar_ffmpeg()
    if ffmpeg:
        crear_reel(ffmpeg)
    else:
        print(
            "\nFFmpeg no está disponible. Instala imageio-ffmpeg con:"
            "\npython -m pip install imageio-ffmpeg"
        )

    print("\nPROCESO TERMINADO")
    print(f"Capturas: {CARPETA_CAPTURAS}")
    print(f"Reporte: {ARCHIVO_REPORTE}")
    print(f"Video: {ARCHIVO_VIDEO}")


if __name__ == "__main__":
    main()
