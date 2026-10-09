#!/usr/bin/env python3
"""
Convierte el díptico semanal (.docx) en datos para la app.

Uso:
    python3 herramientas/diptico_a_app.py ruta/al/diptico.docx

1. Lee el .docx (estructura del díptico de evangelización de la parroquia).
2. Guarda una copia en datos/dipticos/AAAA-MM-DD.docx y sus datos en
   datos/dipticos/AAAA-MM-DD.json (la fecha es la del domingo del díptico).
3. Regenera dipticos.js con todos los JSON de datos/dipticos/.

Solo usa la biblioteca estándar de Python.
"""

import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CARPETA = RAIZ / "datos" / "dipticos"
SALIDA_JS = RAIZ / "dipticos.js"

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

# Títulos de sección tal como aparecen en el díptico
VIVE = "vive esta palabra esta semana"
TE_ESPERAMOS = "te esperamos"
PROCLAMACION = "proclamación del evangelio"
REFLEXION = "reflexión pastoral"
CONVERSAR = "para conversar en familia"
ENCABEZADO_PORTADA = {"parroquia", "san benito de palermo", "maracaibo", "evangelización"}


def parrafos(docx):
    xml = zipfile.ZipFile(docx).read("word/document.xml").decode("utf-8")
    salida = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        texto = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))
        texto = (texto.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                 .replace("&quot;", '"').replace("&apos;", "'"))
        texto = texto.replace("''", '"')  # comillas de cierre escritas como dos apóstrofos
        texto = re.sub(r"\s+", " ", texto).strip()
        if texto:
            es_lista = 'w:val="Prrafodelista"' in p or "<w:numPr>" in p
            salida.append((texto, es_lista))
    return salida


def fecha_iso(texto):
    m = re.search(r"(\d{1,2}) de (\w+) de (\d{4})", texto.lower())
    if not m or m.group(2) not in MESES:
        raise SystemExit(f"No se pudo leer la fecha en: {texto!r}")
    return f"{m.group(3)}-{MESES[m.group(2)]:02d}-{int(m.group(1)):02d}"


def item_con_titulo(texto):
    """'En tu casa: ofrece…' -> {'titulo': 'En tu casa', 'texto': 'ofrece…'}"""
    if ":" in texto:
        titulo, resto = texto.split(":", 1)
        if len(titulo) <= 40:
            return {"titulo": titulo.strip(), "texto": resto.strip()}
    return {"titulo": "", "texto": texto}


def convertir(docx):
    ps = parrafos(docx)
    textos = [t for t, _ in ps]
    bajo = [t.lower().rstrip(":") for t in textos]

    def indice(titulo):
        try:
            return bajo.index(titulo)
        except ValueError:
            raise SystemExit(f"No encontré la sección «{titulo}» en el díptico.")

    i_vive, i_esperamos = indice(VIVE), indice(TE_ESPERAMOS)
    i_proc, i_refl, i_conv = indice(PROCLAMACION), indice(REFLEXION), indice(CONVERSAR)

    # Vive esta Palabra: introducción + puntos (lista)
    bloque = ps[i_vive + 1:i_esperamos]
    vive_intro = " ".join(t for t, lista in bloque if not lista)
    vive_items = [item_con_titulo(t) for t, lista in bloque if lista]

    # Te esperamos: horarios de misa e invitación, hasta la portada
    resto = textos[i_esperamos + 1:]
    fin = next((k for k, t in enumerate(resto) if t.lower() in ENCABEZADO_PORTADA), len(resto))
    esperamos = resto[:fin]
    misas_titulo = esperamos[0] if esperamos and esperamos[0].endswith(":") else ""
    cuerpo = esperamos[1:] if misas_titulo else esperamos
    k_inv = next((k for k, t in enumerate(cuerpo) if len(t) > 40 or t.startswith("¡")), len(cuerpo))
    misas = cuerpo[:k_inv]
    invitacion = cuerpo[k_inv:]

    # Portada: título, cita, tiempo litúrgico y fecha
    portada = [t for t in resto[fin:] if t.lower() not in ENCABEZADO_PORTADA]
    portada = portada[: portada.index(textos[i_proc])] if textos[i_proc] in portada else portada
    if len(portada) < 4:
        raise SystemExit(f"La portada no tiene título, cita, tiempo y fecha: {portada}")
    titulo, cita, tiempo, fecha_texto = portada[:4]

    # Evangelio
    evangelio = textos[i_proc + 1:i_refl]
    encabezado = evangelio[0]
    cierre_idx = next((k for k, t in enumerate(evangelio) if t.lower().startswith("palabra del señor")), len(evangelio))
    # Se descartan párrafos sueltos de solo puntuación (un "." de sobra en el .docx)
    evangelio_parrafos = [t for t in evangelio[1:cierre_idx] if re.search(r"\w", t)]
    cierre = evangelio[cierre_idx] if cierre_idx < len(evangelio) else ""

    reflexion = textos[i_refl + 1:i_conv]

    final = textos[i_conv + 1:]
    k_or = next((k for k, t in enumerate(final) if t.lower().startswith("oración")), len(final))
    preguntas = final[:k_or]
    # La oración puede venir en el mismo párrafo que "Oración:" o en los siguientes
    oracion = " ".join(
        t for t in [re.sub(r"^oración\s*:\s*", "", final[k_or], flags=re.I), *final[k_or + 1:]] if t
    ) if k_or < len(final) else ""

    fecha = fecha_iso(fecha_texto)
    return {
        "id": fecha,
        "fecha": fecha,
        "fechaTexto": fecha_texto,
        "titulo": titulo,
        "cita": cita,
        "tiempo": tiempo,
        "evangelio": {"encabezado": encabezado, "parrafos": evangelio_parrafos, "cierre": cierre},
        "reflexion": reflexion,
        "preguntas": preguntas,
        "oracion": oracion,
        "vive": {"intro": vive_intro, "items": vive_items},
        "misas": {"titulo": misas_titulo, "horarios": misas},
        "invitacion": invitacion,
    }


def regenerar_js():
    dipticos = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(CARPETA.glob("*.json"))]
    dipticos.sort(key=lambda d: d["fecha"], reverse=True)
    SALIDA_JS.write_text(
        "/* ==========================================================================\n"
        "   Dípticos de evangelización · Parroquia \"San Benito de Palermo\"\n"
        "   GENERADO por herramientas/diptico_a_app.py desde datos/dipticos/*.json\n"
        "   (no editar a mano: corregir el JSON o el .docx y volver a generar).\n"
        "   Ordenados del más reciente al más antiguo.\n"
        "   ========================================================================== */\n\n"
        f"const DIPTICOS = {json.dumps(dipticos, ensure_ascii=False, indent=2)};\n",
        encoding="utf-8",
    )
    return dipticos


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    docx = Path(sys.argv[1])
    datos = convertir(docx)
    CARPETA.mkdir(parents=True, exist_ok=True)
    destino = CARPETA / f"{datos['id']}.docx"
    if docx.resolve() != destino.resolve():
        shutil.copyfile(docx, destino)
    (CARPETA / f"{datos['id']}.json").write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    todos = regenerar_js()
    print(f"Díptico {datos['id']} · {datos['titulo']} ({datos['cita']})")
    print(f"  {len(datos['evangelio']['parrafos'])} párrafos de Evangelio, {len(datos['reflexion'])} de reflexión, "
          f"{len(datos['preguntas'])} preguntas, {len(datos['vive']['items'])} puntos de 'Vive esta Palabra', "
          f"{len(datos['misas']['horarios'])} horarios de misa")
    print(f"dipticos.js regenerado con {len(todos)} díptico(s).")


if __name__ == "__main__":
    main()
