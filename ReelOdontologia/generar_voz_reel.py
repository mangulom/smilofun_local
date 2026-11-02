import asyncio
from pathlib import Path
import edge_tts

BASE = Path(__file__).resolve().parent
texto = '''¡Atención, centros odontológicos! No esperes más: llegó Dentamia, la solución inteligente para gestionar tu clínica, con inteligencia artificial integrada. Administra pacientes y agenda tus citas en un solo lugar. Consulta historiales, tratamientos y facturación de forma sencilla. Controla tu inventario y recibe información para tomar mejores decisiones. Con inteligencia artificial, organiza tu clínica y dedica más tiempo a tus pacientes. Dentamia: gestión odontológica, tecnología e innovación en una sola plataforma. ¡Solicita más información! Llámanos al nueve tres ocho, nueve siete siete, dos cinco nueve; o al nueve seis dos, tres tres nueve, cuatro cuatro dos. Dentamia: tu clínica, más inteligente.'''
async def main():
    out = BASE / 'voz_dentamia_reel.mp3'
    tts = edge_tts.Communicate(texto, 'es-PE-CamilaNeural', rate='+12%', volume='+0%', pitch='+3Hz')
    await tts.save(str(out))
    print(out, out.stat().st_size)
asyncio.run(main())
