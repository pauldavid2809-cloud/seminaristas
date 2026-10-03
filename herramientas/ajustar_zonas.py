#!/usr/bin/env python3
"""
Ajusta los límites de las zonas pastorales a las calles reales.

Uso:
    pip install shapely pyproj
    python3 herramientas/ajustar_zonas.py [--descargar-calles]

Entradas:
  - datos/zonas-san-benito.kml   límites dibujados a mano en Google Earth
  - datos/calles-osm.json        calles de OpenStreetMap (con --descargar-calles
                                 se vuelven a bajar de Overpass)
Salidas:
  - zonas.js                     polígonos ajustados que usa la app
  - datos/zonas-ajustadas.kml    los mismos límites, para abrir en Google Earth

Reglas (acordadas con la parroquia):
  1. Las zonas se arman con manzanas: los límites siempre van por calles.
     Cada manzana va a la zona que más la cubre en el dibujo original.
  2. Cuando una calle separa dos zonas, la calle completa (las dos aceras)
     es de una sola zona: la que la tenía en el dibujo original. El límite
     se corre al fondo de las casas de la acera de enfrente (FONDO_M).
  3. Calle 86: las dos aceras son de la parroquia; las zonas llegan hasta
     la 86 y se quedan también con su acera sur.
"""

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, mapping
from shapely.ops import polygonize, substring, transform, unary_union

RAIZ = Path(__file__).resolve().parent.parent
KML = RAIZ / "datos" / "zonas-san-benito.kml"
CALLES = RAIZ / "datos" / "calles-osm.json"
ZONAS_JS = RAIZ / "zonas.js"
KML_SALIDA = RAIZ / "datos" / "zonas-ajustadas.kml"

FONDO_M = 30           # profundidad de las casas de una acera (m)
CUBRE_MIN = 0.40       # una manzana entra a la parroquia si el dibujo cubre al menos esto
# Donde OpenStreetMap no tiene calles se forman "manzanas" enormes. Si una
# manzana es grande y el dibujo la reparte entre varias zonas, dentro de ella
# se respeta el trazo original (no hay calle que seguir).
MANZANA_GRANDE_M2 = 15000
ESPINA_M = 2.5         # se eliminan entrantes y salientes más finos que el doble de esto
CALLE_LIMITE_SUR = "Calle 86"
NORTE_86_M = 40        # una zona "llega a la 86" si su borde está a menos de esto
CAJA = (10.6480, -71.6085, 10.6650, -71.5930)  # sur, oeste, norte, este

VIAS_MANZANA = {"residential", "secondary", "tertiary", "primary", "secondary_link", "tertiary_link",
                "unclassified", "living_street", "pedestrian", "steps", "footway"}

A_METROS = Transformer.from_crs("EPSG:4326", "EPSG:32619", always_xy=True).transform  # UTM 19N
A_GRADOS = Transformer.from_crs("EPSG:32619", "EPSG:4326", always_xy=True).transform


def descargar_calles():
    s, o, n, e = CAJA
    consulta = f'[out:json][timeout:60];way["highway"]({s},{o},{n},{e});out geom;'
    for url in ("https://overpass-api.de/api/interpreter",
                "https://maps.mail.ru/osm/tools/overpass/api/interpreter"):
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": consulta}).encode(),
                                         headers={"User-Agent": "censo-san-benito/1.0"})
            datos = urllib.request.urlopen(req, timeout=90).read()
            json.loads(datos)
            CALLES.write_bytes(datos)
            print(f"Calles descargadas de {url}")
            return
        except Exception as e:  # noqa: BLE001
            print(f"  {url}: {e}")
    raise SystemExit("No se pudieron descargar las calles.")


def leer_kml():
    import xml.etree.ElementTree as ET
    ns = {"k": "http://www.opengis.net/kml/2.2"}
    doc = ET.parse(KML).getroot().find("k:Document", ns)
    colores, zonas, etiquetas, parroquia = {}, {}, {}, None
    for st in doc.findall("k:Style", ns):
        c = st.find("k:LineStyle/k:color", ns)
        if c is not None:
            c = c.text.strip()
            colores[st.get("id")] = "#" + c[6:8] + c[4:6] + c[2:4]

    def coords(t):
        return [(float(lo), float(la)) for lo, la, *_ in (p.split(",") for p in t.split())]

    for pm in doc.findall("k:Placemark", ns):
        nombre = pm.find("k:name", ns).text.strip()
        pol = pm.find(".//k:Polygon//k:coordinates", ns)
        pt = pm.find("k:Point/k:coordinates", ns)
        if pol is not None:
            desc = pm.find("k:description", ns)
            zonas[nombre] = {
                "color": colores[pm.find("k:styleUrl", ns).text.strip("#")],
                "poligono": transform(A_METROS, Polygon(coords(pol.text))).buffer(0),
                "nota": (desc.text or "").strip() if desc is not None else "",
            }
        elif pt is not None:
            lo, la = coords(pt.text)[0]
            if nombre.isdigit():
                etiquetas["Zona " + nombre] = (la, lo)
            else:
                parroquia = {"nombre": nombre, "lat": la, "lng": lo}
    return zonas, etiquetas, parroquia


def leer_calles():
    calles = []
    for w in json.loads(CALLES.read_text())["elements"]:
        if w.get("type") != "way" or "geometry" not in w:
            continue
        t = w.get("tags", {})
        if t.get("highway") not in VIAS_MANZANA or t.get("footway") in ("sidewalk", "crossing"):
            continue
        linea = LineString([(g["lon"], g["lat"]) for g in w["geometry"]])
        calles.append((t.get("name", ""), transform(A_METROS, linea)))
    return calles


def poligonos(geom):
    """Deja solo las áreas (las intersecciones a veces traen líneas o puntos)."""
    if geom is None or geom.is_empty:
        return Polygon()
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    partes = [g for g in getattr(geom, "geoms", []) if g.geom_type in ("Polygon", "MultiPolygon")]
    return unary_union(partes) if partes else Polygon()


def mayor(geom):
    """Se queda con la parte más grande (evita islas sueltas)."""
    if geom.geom_type == "MultiPolygon":
        return max(geom.geoms, key=lambda g: g.area)
    return geom


def ajustar():
    zonas, etiquetas, parroquia = leer_kml()
    calles = leer_calles()
    nombres = sorted(zonas, key=lambda n: int(n.split()[-1]))
    dibujo = {n: zonas[n]["poligono"] for n in nombres}
    union_dibujo = unary_union(list(dibujo.values()))

    # 1) Manzanas a partir de la red de calles
    red = unary_union([c for _, c in calles])
    manzanas = [m for m in polygonize(red) if m.area > 20]
    calle86 = unary_union([c for n, c in calles if n == CALLE_LIMITE_SUR])

    asignadas = {n: [] for n in nombres}
    for m in manzanas:
        cubre = {n: m.intersection(p).area for n, p in dibujo.items()}
        zona, area = max(cubre.items(), key=lambda x: x[1])
        total = sum(cubre.values())
        if total < 1:
            continue
        grande = m.area > MANZANA_GRANDE_M2
        if not grande and total / m.area < CUBRE_MIN:
            continue
        if grande:
            for n, p in dibujo.items():
                parte = m.intersection(p)
                if parte.area > 1:
                    asignadas[n].append(parte)
        else:
            asignadas[zona].append(m)
    zona_geom = {n: poligonos(unary_union([poligonos(x) for x in ms])) if ms else Polygon() for n, ms in asignadas.items()}

    # 3) Calle 86 como límite sur: manzanas entre la zona y la 86 entran
    #    (las que tocan la 86, están al norte de ella y lindan con una zona)
    ya = unary_union(list(zona_geom.values()))
    for m in manzanas:
        if m.intersection(ya).area > 0.5 * m.area:
            continue
        if m.distance(calle86) > 1 or m.area > 60000:
            continue
        c = m.representative_point()
        mas_cerca = calle86.interpolate(calle86.project(c))
        if c.y <= mas_cerca.y:  # al sur de la 86: no
            continue
        vecinas = {n: g.boundary.intersection(m.boundary).length for n, g in zona_geom.items()}
        zona, borde = max(vecinas.items(), key=lambda x: x[1])
        if borde > 10:
            asignadas[zona].append(m)
            zona_geom[zona] = poligonos(unary_union([zona_geom[zona], m]))

    # 2) La calle límite completa para una zona: la zona dueña se queda con
    #    la acera de enfrente (FONDO_M). Las franjas de un mismo par de zonas
    #    se juntan y se cierran para no dejar dientes en las esquinas.
    traspasos = {}
    for i, a in enumerate(nombres):
        for b in nombres[i + 1:]:
            if zona_geom[a].is_empty or zona_geom[b].is_empty:
                continue
            limite = zona_geom[a].boundary.intersection(zona_geom[b].boundary)
            if limite.is_empty or limite.length < 5:
                continue
            for tramo in getattr(limite, "geoms", [limite]):
                if tramo.length < 5 or tramo.geom_type not in ("LineString", "MultiLineString"):
                    continue
                franja = tramo.buffer(15, cap_style=2)
                duena, otra = (a, b) if franja.intersection(dibujo[a]).area >= franja.intersection(dibujo[b]).area else (b, a)
                traspasos.setdefault((duena, otra), []).append(tramo.buffer(FONDO_M, cap_style=2))
    for (duena, otra), franjas in traspasos.items():
        junta = unary_union(franjas).buffer(4, join_style=2).buffer(-4, join_style=2)
        acera = poligonos(junta.intersection(zona_geom[otra]))
        if acera.area > 1:
            zona_geom[duena] = poligonos(unary_union([zona_geom[duena], acera]))
            zona_geom[otra] = poligonos(zona_geom[otra].difference(acera))

    # 3b) Las dos aceras de la 86: se recorre la calle en tramos de 10 m y,
    #     donde hay una zona al norte (a menos de NORTE_86_M), el espacio libre
    #     hasta FONDO_M al sur de la calle pasa a esa zona.
    lineas86 = getattr(calle86, "geoms", [calle86])
    for linea in lineas86:
        for inicio in range(0, int(linea.length), 10):
            trozo = substring(linea, inicio, min(inicio + 10, linea.length))
            if trozo.length < 1:
                continue
            medio = trozo.interpolate(0.5, normalized=True)
            # la zona tiene que estar justo al norte de este tramo de la calle
            sonda = LineString([(medio.x, medio.y), (medio.x, medio.y + NORTE_86_M)])
            al_norte = [n for n, g in zona_geom.items() if not g.is_empty and sonda.intersects(g)]
            if not al_norte:
                continue
            zona = min(al_norte, key=lambda n: zona_geom[n].distance(medio))
            libre = poligonos(trozo.buffer(max(FONDO_M, NORTE_86_M), cap_style=2)
                              .difference(unary_union(list(zona_geom.values()))))
            if libre.area > 1:
                zona_geom[zona] = poligonos(unary_union([zona_geom[zona], libre]))

    # limpieza: solapes, rendijas e islas
    for i, a in enumerate(nombres):
        for b in nombres[i + 1:]:
            solape = zona_geom[a].intersection(zona_geom[b])
            if solape.area > 0.01:
                duena = a if solape.intersection(dibujo[a]).area >= solape.intersection(dibujo[b]).area else b
                otra = b if duena == a else a
                zona_geom[otra] = poligonos(zona_geom[otra].difference(solape))
    for n in nombres:
        if not zona_geom[n].is_empty:
            zona_geom[n] = poligonos(zona_geom[n].buffer(-ESPINA_M, join_style=2).buffer(ESPINA_M, join_style=2))
    union = unary_union(list(zona_geom.values()))
    cerrada = union.buffer(6, join_style=2).buffer(-6, join_style=2)
    rendijas = cerrada.difference(union)
    for r in getattr(rendijas, "geoms", [rendijas]):
        if r.is_empty or r.area < 0.01:
            continue
        vecina = max(nombres, key=lambda n: zona_geom[n].buffer(0.5).intersection(r).area)
        zona_geom[vecina] = poligonos(unary_union([zona_geom[vecina], r]))
    resultado = {}
    for n in nombres:
        g = poligonos(zona_geom[n].buffer(0.2, join_style=2).buffer(-0.2, join_style=2))
        resultado[n] = mayor(g)
    # tras redondear, que ninguna zona invada a otra
    for i, a in enumerate(nombres):
        for b in nombres[i + 1:]:
            if resultado[a].intersection(resultado[b]).area > 0.01:
                resultado[b] = mayor(poligonos(resultado[b].difference(resultado[a])))
    return zonas, etiquetas, parroquia, resultado, dibujo


def a_latlng(poligono):
    exterior = transform(A_GRADOS, poligono).exterior.coords
    return [[round(la, 7), round(lo, 7)] for lo, la in exterior]


def escribir(zonas, etiquetas, parroquia, resultado):
    santos = {}
    previo = ZONAS_JS.read_text(encoding="utf-8") if ZONAS_JS.exists() else ""
    for m in re.finditer(r'"nombre": "(Zona \d+)",\s*"santo": "([^"]+)"', previo):
        santos[m.group(1)] = m.group(2)
    lista = []
    for n, pol in resultado.items():
        lista.append({
            "nombre": n,
            "santo": santos.get(n, ""),
            "color": zonas[n]["color"],
            "poligono": a_latlng(pol.simplify(0.4, preserve_topology=True)),
            "nota": "",
            "etiqueta": [round(etiquetas[n][0], 7), round(etiquetas[n][1], 7)] if n in etiquetas else None,
        })
    js = ('/* ==========================================================================\n'
          '   Zonas pastorales · Parroquia "San Benito de Palermo"\n'
          '   GENERADO por herramientas/ajustar_zonas.py: los límites del dibujo de\n'
          '   Google Earth (datos/zonas-san-benito.kml) ajustados a las calles de\n'
          '   OpenStreetMap (datos/calles-osm.json). El santo o advocación de cada\n'
          '   zona viene del documento "Zonas pastorales y grupos de apostolado".\n'
          '   Coordenadas en [latitud, longitud]. Los nombres deben coincidir con\n'
          '   los de la tabla "sectores" de Supabase (Zona 1 … Zona 8).\n'
          '   ========================================================================== */\n\n'
          f'const ZONAS_GEO = {json.dumps(lista, ensure_ascii=False, indent=2)};\n\n'
          f'const PARROQUIA_GEO = {json.dumps(parroquia, ensure_ascii=False)};\n')
    ZONAS_JS.write_text(js, encoding="utf-8")

    pm = []
    for z in lista:
        c = z["color"].lstrip("#")
        kml_color = c[4:6] + c[2:4] + c[0:2]
        coords = " ".join(f"{lo},{la},0" for la, lo in z["poligono"])
        pm.append(f'<Placemark><name>{z["nombre"]} · {z["santo"]}</name><Style><LineStyle><color>ff{kml_color}</color>'
                  f'<width>3</width></LineStyle><PolyStyle><color>59{kml_color}</color></PolyStyle></Style>'
                  f'<Polygon><outerBoundaryIs><LinearRing><coordinates>{coords}</coordinates></LinearRing>'
                  f'</outerBoundaryIs></Polygon></Placemark>')
    KML_SALIDA.write_text('<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
                          '<name>Zonas pastorales ajustadas a las calles - Parroquia San Benito de Palermo</name>'
                          + "".join(pm) + "</Document></kml>\n", encoding="utf-8")


def informe(resultado, dibujo):
    nombres = list(resultado)
    print("Zona     área antes → después")
    for n in nombres:
        print(f"  {n}: {dibujo[n].area/1e4:5.1f} ha → {resultado[n].area/1e4:5.1f} ha · {len(resultado[n].exterior.coords)} vértices")
    solapes = sum(resultado[a].intersection(resultado[b]).area for i, a in enumerate(nombres) for b in nombres[i + 1:])
    print(f"Solapes entre zonas: {solapes:.1f} m²")
    for i, a in enumerate(nombres):
        for b in nombres[i + 1:]:
            d = resultado[a].distance(resultado[b])
            if 0 < d < 3:
                print(f"  rendija {a}/{b}: {d:.2f} m")


if __name__ == "__main__":
    if "--descargar-calles" in sys.argv:
        descargar_calles()
    zonas, etiquetas, parroquia, resultado, dibujo = ajustar()
    informe(resultado, dibujo)
    if "--probar" not in sys.argv:
        escribir(zonas, etiquetas, parroquia, resultado)
        print(f"Escrito {ZONAS_JS.name} y {KML_SALIDA.relative_to(RAIZ)}")
