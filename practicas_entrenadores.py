"""Las prácticas que armaron los entrenadores (carpeta PLANIFICACIONES del Drive de Coordinación) para la sección Entrenadores.

Uso:  python practicas_entrenadores.py "<carpeta de Drive descomprimida>"   ->  guia/practicas.json y guia/scrum_sesiones.json
      (guia_entrenadores.py lo suma a la guía y exportar_entrenadores.py lo cifra con el resto)

Cada entrenador usa la misma planilla del club, con algunas diferencias: Guille y Mati ponen la fecha como texto
("martes 19 de mayo", o solo "martes 19" con el mes en el nombre de la hoja), Juanchi como "SABADO - 14/3/2026"
y Mele en otra forma de tabla (OBJETIVO | TIEMPO | GRUPO | ACTIVIDAD). Por eso las columnas se buscan por su título.
Todas son de la temporada 2026 (algunas dicen 2025 por error). Las prácticas sin actividades (plantillas vacías) no se suman.
"""
import datetime as dt
import json
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl

HERE = Path(__file__).parent
SALIDA = HERE / "guia" / "practicas.json"
SALIDA_SCRUM = HERE / "guia" / "scrum_sesiones.json"
# el plan de scrum de Coordinación (SCRUM/Planificación SCRUM.xlsx): una hoja por grupo, con las mismas columnas que las prácticas
HOJAS_SCRUM = {"M13-14": "M13 y M14", "M15-16": "M15 y M16", "M17-19": "M17 a M19"}
ANIO = 2026

# archivo -> (quién la armó, grupo que se muestra, categorías)
ARCHIVOS = {
    "Planificación Diaria Plantel Superior.xlsx": ("Guille", "Plantel superior", ["Primera", "Intermedia", "Pre-Intermedia"]),
    "Planificacion M11-12.xlsx": ("Juanchi", "M11 y M12", ["M11", "M12"]),
    "Planificacion M9-10.xlsx": ("Juanchi", "M9 y M10", ["M9", "M10"]),
    "Planificación M13-14 (1).xlsx": ("Mati", "M13 y M14", ["M13", "M14"]),
    "Planificación M15-M16 (1).xlsx": ("Mati", "M15 y M16", ["M15", "M16"]),
    "Planificación M17-M19.xlsx": ("Mati", "M17 a M19", ["M17", "M18", "M19"]),
    "HALCONCITOS - CLAUDIA.xlsx": ("Mele", "M6", ["M6"]),
    "M 7 - MEGAN.xlsx": ("Mele", "M7", ["M7"]),
    "M 8 - FACU.xlsx": ("Mele", "M8", ["M8"]),
}
MESES = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
         "septiembre": 9, "setiembre": 9, "sept": 9, "octubre": 10, "octurbre": 10, "noviembre": 11, "diciembre": 12}
DIAS = r"(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)"
NO_FOCO = re.compile(r"sc|e2m|cph|cf|fc|trote|real|[\d.]+")  # títulos y números de las columnas de intensidad
# siglas que quedan en mayúscula al pasar un texto de MAYÚSCULAS a minúsculas
SIGLAS = {"ROM", "MAC", "MPMH", "FW", "BK", "PF", "DXP", "PD", "E.C.", "TV", "1VS1", "2VS2", "3VS3", "4VS4", "5VS5", "M.G.C"}
# títulos de bloque como se muestran
BLOQUES = {"fisico": "Físico", "e.c.": "Entrada en calor", "ec": "Entrada en calor", "dxp": "Destrezas por puesto",
           "destreza": "Destrezas", "destrezas": "Destrezas", "juego integrado": "Juego integrado", "plan de juego": "Plan de juego",
           "inicio": "Inicio", "desarrollo": "Desarrollo", "vuelta a la calma": "Vuelta a la calma",
           "entrada en calor / tecnicas de carrera": "Entrada en calor y técnica de carrera",
           "fisico / tecnicas de carrera": "Físico y técnica de carrera", "entrada en calor": "Entrada en calor"}
GRUPOS = {"t": "Todos", "todos": "Todos", "fw": "Forwards", "f": "Forwards", "bk": "Backs", "b": "Backs"}
# errores de tipeo que se repiten en las planillas
ARREGLOS = {"situcaiones": "situaciones", "rapindo": "rápido", "genrar": "generar", "tacar fuerte": "atacar fuerte", "habiidades": "habilidades",
            "destresas": "destrezas", "evasíon": "evasión", "preogresivamente": "progresivamente", "cordinacion": "coordinación",
            "estciones": "estaciones", "recesiones": "recepciones", "optmizar": "optimizar", "organizcion": "organización",
            "ocupar elancho": "ocupar el ancho", "mejorarla velocidad": "mejorar la velocidad", "fisca": "física", "silvato": "silbato",
            "atancantes": "atacantes", "pocision": "posición", "cuadripedia": "cuadrupedia", "suspendidp": "suspendido",
            "feddback": "feedback", "patido": "partido", "ciculacion": "circulación", "amenzas": "amenazas", "produndida": "profundidad",
            "esatciones": "estaciones", "mejoar": "mejorar", "organozar": "organizar", "pliometira": "pliometría", "juejo": "juego",
            "cuadrad0": "cuadrado", "cambieo": "cambio", "jquutarle": "quitarle",
            # abreviaturas del plan de scrum
            "hom,esp y cad": "hombros, espalda y cadera", "rod 90°": "rodillas a 90°", "avnzan": "avanzan", "mov.art": "movilidad articular",
            "aumentar el rom": "aumentar el rango de movimiento (ROM)", "grabedad": "gravedad",
            " <cant tap": ""}  # un resto de la planilla de scrum que no se entiende


def norm(s):
    return unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode().lower().strip()


def texto(v):
    """El texto de una celda, limpio: sin espacios de más, con las mayúsculas bajadas y los errores de tipeo arreglados."""
    if v is None:
        return ""
    if isinstance(v, (dt.datetime, dt.date)):
        return ""
    if isinstance(v, float):
        v = int(v) if v.is_integer() else v
    t = re.sub(r"\s+", " ", str(v).replace("\n", " / "))
    t = re.sub(r"\s*/\s*:\s*", ". ", t).strip(" -/")  # restos de renglones vacíos ("... / : mantener", "rotando /")
    letras = [c for c in t if c.isalpha()]
    if letras and sum(c.isupper() for c in letras) / len(letras) > .6:
        palabras = []
        for w in t.split(" "):
            palabras.append(w if w.upper().strip(".,;:()") in SIGLAS else w.lower())
        t = " ".join(palabras)
        t = t[:1].upper() + t[1:]
    for a, b in ARREGLOS.items():
        t = re.sub((r"\b" if a[0].isalnum() else "") + re.escape(a) + (r"\b" if a[-1].isalnum() else ""), b, t, flags=re.I)
    return t[:1].upper() + t[1:] if t else t


def minutos(v):
    if isinstance(v, (int, float)):
        return round(v) if 0 < v < 200 else None
    m = re.match(r"^\s*(\d{1,3})", str(v or ""))
    return int(m.group(1)) if m else None


def fecha_de(fila, mes_hoja, ultima=None):
    """Busca una fecha en una fila: 7/3/2026, '14 de mayo', 'martes 19' o una fecha de Excel.
    Si solo dice el día, el mes sale del nombre de la hoja o de la práctica anterior (si ese día ya pasó, es el mes siguiente)."""
    for v in fila.values():
        if isinstance(v, (dt.datetime, dt.date)):
            return dt.date(ANIO, v.month, v.day)
    t = re.sub(r"([a-z])(\d)", r"\1 \2", norm(" ".join(str(v) for v in fila.values() if v is not None)))  # "lunes30 de marzo"
    m = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", t)
    if m and 1 <= int(m.group(2)) <= 12:
        return dt.date(ANIO, int(m.group(2)), int(m.group(1)))
    m = re.search(r"\b(\d{1,2}) de (" + "|".join(MESES) + r")\b", t)
    if m:
        return dt.date(ANIO, MESES[m.group(2)], int(m.group(1)))
    m = re.search(DIAS + r"\s+(\d{1,2})\b", t)
    mes = mes_hoja or (ultima.month if ultima else None)
    if m and mes:
        for k in (0, 1):
            try:
                d = dt.date(ANIO, mes + k, int(m.group(1)))
            except ValueError:
                continue
            if mes_hoja or not ultima or d >= ultima - dt.timedelta(days=3):
                return d
    return None


def es_encabezado(fila):
    vals = {norm(v) for v in fila.values() if isinstance(v, str)}
    return "actividad" in vals and "tiempo" in vals


def leer_hoja(ws, quien, grupo, cats, archivo, ultima=None):
    filas = [{c.column_letter: c.value for c in r if c.value not in (None, "") and str(c.value).strip()} for r in ws.iter_rows()]
    mes_hoja = MESES.get(norm(ws.title))
    practicas, inicio = [], 0
    for i, fila in enumerate(filas):
        if not es_encabezado(fila):
            continue
        cols = {}
        for k, v in fila.items():  # si hay dos tablas una al lado de la otra, vale la de la izquierda
            if isinstance(v, str):
                cols.setdefault(norm(v), k)
        col = lambda *nombres: next((cols[n] for n in cols if any(n.startswith(x) for x in nombres)), None)
        c_bloque, c_tiempo, c_grupo = col("bloque"), col("tiempo"), col("grupo")
        c_obj, c_act, c_det = col("objetivo"), col("actividad"), col("detalles")
        if not c_obj and not c_bloque:  # tabla de Mele sin título en la primera columna: ahí va el objetivo
            c_obj = chr(ord(c_tiempo) - 1)
        # lo de arriba de la tabla: fecha, foco, objetivos y si es solo de una categoría ("m17 martes 31")
        info = filas[inicio:i]
        f = next((d for d in (fecha_de(x, mes_hoja, ultima) for x in reversed(info)) if d), None)
        ultima = f or ultima
        # sin fecha, Mele pone solo la semana de la temporada ("SEMANA 20"): se muestra eso
        sem = re.search(r"semana\s*(\d{1,2})\b", norm(" ".join(str(v) for x in info + [fila] for v in x.values())))
        semana = int(sem.group(1)) if sem and not f else None
        foco, objetivos, col_foco = "", [], None
        for x in info:
            for k, v in x.items():
                if isinstance(v, str) and norm(v) == "foco":
                    sig = sorted(c for c in x if c > k and not NO_FOCO.fullmatch(norm(x[c])))
                    if sig:
                        col_foco = sig[0]
                        foco = texto(x[col_foco])
            if col_foco and x.get(col_foco) and texto(x[col_foco]) != foco and not any(norm(v) == "foco" for v in x.values() if isinstance(v, str)):
                objetivos.append(texto(x[col_foco]))
            elif any(norm(v) == "objetivos" for v in x.values() if isinstance(v, str)):
                k = next(k for k, v in x.items() if isinstance(v, str) and norm(v) == "objetivos")
                sig = sorted(c for c in x if c > k and not NO_FOCO.fullmatch(norm(x[c])))
                if sig:
                    col_foco = col_foco or sig[0]
                    objetivos.append(texto(x[sig[0]]))
        objetivos = [re.sub(r"^\d+\s*-\s*|^-\s*", "", o).strip() for o in objetivos if o and not NO_FOCO.fullmatch(norm(o))]
        objetivos = [o[:1].upper() + o[1:] for o in objetivos if o]
        sus = sorted({f"M{n}" for n in re.findall(r"\bm\s?(\d{1,2})\b", norm(" ".join(str(v) for x in info for v in x.values())))} & set(cats),
                     key=lambda c: int(c[1:]))
        # las actividades, hasta FIN / TOTAL / la próxima práctica
        bloques, bloque, cierre, j = [], "", False, i + 1
        for j in range(i + 1, len(filas)):
            x = filas[j]
            primera = norm(next(iter(x.values()))) if x else ""
            if es_encabezado(x) or primera in ("fin", "total") or primera.startswith(("planificacion", "semana", "foco", "objetivos")) \
                    or (x and fecha_de(x, mes_hoja) and not x.get(c_act) and not x.get(c_tiempo)):
                break
            if not x:
                continue
            if len(x) == 1 and primera in ("feedback final", "elongacion", "objetivo"):
                cierre = cierre or primera != "objetivo"
                continue
            if c_bloque and x.get(c_bloque):
                bloque = texto(x[c_bloque])
            item = {"min": minutos(x.get(c_tiempo)), "grupo": texto(x.get(c_grupo)) if c_grupo else "",
                    "obj": texto(x.get(c_obj)) if c_obj else "", "act": texto(x.get(c_act)), "det": texto(x.get(c_det)) if c_det else ""}
            agua = re.search(r"hidrat|agua|traslado", norm(" ".join([bloque, item["grupo"], item["act"], item["obj"]])))
            if agua and not item["det"]:
                bloques.append({"agua": True, "min": item["min"]})
                bloque = ""
                continue
            if c_obj and not c_bloque and item["obj"] and norm(item["obj"]) in BLOQUES:  # Mele: "INICIO", "Desarrollo"…
                bloque, item["obj"] = item["obj"], ""
            if not (item["act"] or item["det"] or item["obj"] or item["min"]):
                continue
            item["grupo"] = GRUPOS.get(norm(item["grupo"]), item["grupo"])
            nom = BLOQUES.get(norm(bloque), bloque)
            if not bloques or bloques[-1].get("agua") or bloques[-1]["b"] != nom:
                bloques.append({"b": nom, "items": []})
            bloques[-1]["items"].append({k: v for k, v in item.items() if v})
        items = [it for b in bloques if not b.get("agua") for it in b["items"]]
        con_texto = [it for it in items if it.get("act") or it.get("det")]
        inicio = j
        if len(con_texto) < 2:  # plantilla sin completar
            continue
        if not foco:  # Mele no pone foco: el título son los objetivos de la práctica
            temas = list(dict.fromkeys(it["obj"] for it in items if it.get("obj") and norm(it["obj"]) not in BLOQUES))
            foco = ", ".join(temas[:3]) or con_texto[0].get("act", "")[:60]
        practicas.append({"quien": quien, "grupo": grupo, "cats": sus or cats, "fecha": f.isoformat() if f else "", "semana": semana,
                          "foco": foco, "objetivos": objetivos, "bloques": bloques, "cierre": cierre,
                          "min": sum((b.get("min") or 0) if b.get("agua") else sum(it.get("min") or 0 for it in b["items"]) for b in bloques),
                          "origen": f"{archivo} · hoja {ws.title}"})
    return practicas, ultima


def leer(carpeta):
    todas = []
    for f in sorted(Path(carpeta).rglob("*.xlsx")):
        if f.name not in ARCHIVOS:
            continue
        quien, grupo, cats = ARCHIVOS[f.name]
        wb = openpyxl.load_workbook(f, data_only=True)
        ultima = None
        for ws in wb.worksheets:
            ps, ultima = leer_hoja(ws, quien, grupo, cats, f.name, ultima)
            todas += ps
    # la misma práctica copiada en dos hojas (las semanas y los meses de Mati): queda la más completa
    unicas = {}
    for p in todas:
        # sin fecha: es la misma si tiene la misma semana y las mismas actividades (Mele copió alguna dos veces en la planilla)
        k = (p["grupo"], p["fecha"], norm(p["foco"])) if p["fecha"] else (p["grupo"], p["semana"], norm(p["foco"]), json.dumps(p["bloques"], sort_keys=True))
        n = sum(len(b.get("items", [])) for b in p["bloques"])
        if k not in unicas or n > sum(len(b.get("items", [])) for b in unicas[k]["bloques"]):
            unicas[k] = p
    # en orden de fecha; las que solo tienen la semana van más o menos donde caen (la semana del club es la del año menos una)
    cuando = lambda p: p["fecha"] or (dt.date.fromisocalendar(ANIO, p["semana"] + 1, 1).isoformat() if p["semana"] else "9")
    salida = sorted(unicas.values(), key=lambda p: (p["grupo"], cuando(p)))
    vistos = {}
    for p in salida:  # el id queda igual aunque se sumen prácticas nuevas (sirve para los links)
        base = f"{re.sub(r'[^a-z0-9]+', '-', norm(p['grupo'])).strip('-')}-{p['fecha'] or (f'semana-{p['semana']}' if p['semana'] else 'sin-fecha')}"
        vistos[base] = vistos.get(base, 0) + 1
        p["id"] = base if vistos[base] == 1 else f"{base}-{vistos[base]}"
        p["orden"] = cuando(p)
    return salida


def leer_scrum(carpeta):
    """Las sesiones de scrum que planificó Coordinación, en orden de fecha (las tablas vacías no se suman)."""
    f = next(Path(carpeta).rglob("Planificaci*SCRUM.xlsx"), None)
    if not f:
        return []
    salida = []
    for ws in openpyxl.load_workbook(f, data_only=True).worksheets:
        if ws.title in HOJAS_SCRUM:
            ps, _ = leer_hoja(ws, "Coordinación", HOJAS_SCRUM[ws.title], [], f.name)
            salida += [{k: p[k] for k in ("grupo", "fecha", "min", "bloques")} for p in sorted(ps, key=lambda p: p["fecha"])]
    return salida


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    ps = leer(sys.argv[1])
    SALIDA.write_text(json.dumps(ps, ensure_ascii=False, indent=1), encoding="utf-8")
    # el día en que se leyeron las planillas: la página avisa si las prácticas no están al día
    (HERE / "guia" / "practicas_al.txt").write_text(dt.date.today().isoformat(), encoding="utf-8")
    sc = leer_scrum(sys.argv[1])
    SALIDA_SCRUM.write_text(json.dumps(sc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Listo: {SALIDA_SCRUM} ({len(sc)} sesiones de scrum)")
    from collections import Counter
    print(f"Listo: {SALIDA} ({len(ps)} prácticas)")
    for g, n in Counter(p["grupo"] for p in ps).items():
        sin = sum(1 for p in ps if p["grupo"] == g and not p["fecha"])
        print(f"  {g}: {n}" + (f" ({sin} sin fecha)" if sin else ""))
