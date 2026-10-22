"""Extrae partidos, planteles e incidencias de LOS 50 (Union de Mar del Plata) desde bd.uar.com.ar.

Uso:  python extraer_los50.py [anio|todos]      (por defecto 2026)
Solo plantel superior: Primera por un lado; Intermedia, Pre-Intermedia y M23 por otro.

Solo hace lecturas: GET de paginas "view" y POST a los filtros de busqueda.
"""
import gzip
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd
from bs4 import BeautifulSoup

from privacidad import limpiar
from uar_session import BASE, get, login

ARG = sys.argv[1] if len(sys.argv) > 1 else "2026"
ANIO = "" if ARG == "todos" else ARG   # "" = sin filtro de anio
CLUB_ID = "182"          # LOS 50
UNION_ID = "2"           # Mar del Plata
CLUB_NAME = "LOS 50"
HERE = Path(__file__).parent
# los partidos ya bajados se guardan comprimidos en datos_uar/raw/partido (el mismo lugar que usa extraer_todo.py)
RAW_PARTIDOS = HERE / "datos_uar" / "raw" / "partido"
RAW_PARTIDOS.mkdir(parents=True, exist_ok=True)
AJAX = {"X-Requested-With": "XMLHttpRequest"}


def txt(el) -> str:
    return " ".join(el.get_text(" ").split()) if el else ""


def num(s):
    m = re.search(r"-?\d+", s or "")
    return int(m.group()) if m else None


def link_id(a, pattern):
    m = re.search(pattern, a.get("href", ""), re.I) if a else None
    return m.group(1) if m else None


# ---------------------------------------------------------------- torneos
def parse_championship_rows(html):
    soup = BeautifulSoup(html, "lxml")
    out = []
    for tr in soup.select("tbody tr"):
        tds = tr.find_all("td")
        a = tr.find("a", href=re.compile(r"/championships/view/\d+", re.I))
        if not a or len(tds) < 3:
            continue
        out.append({
            "torneo_id": link_id(a, r"/view/(\d+)"),
            "torneo": txt(tds[0]),
            "organizador": txt(tds[1]),
            "division": txt(tds[2]),
        })
    pages = {int(p) for p in re.findall(r"/page:(\d+)", html)}
    return out, max(pages) if pages else 1


def listar_torneos(s):
    data = {
        "_method": "POST",
        "data[Championship][union_id]": UNION_ID,
        "data[Championship][club_id]": CLUB_ID,
        "data[Championship][division_id]": "",
        "data[Championship][sex]": "",
        "data[Championship][host_union_id]": "",
        "data[Championship][estado]": "any",
        "data[Championship][createdFrom]": "",
        "data[Championship][createdTo]": "",
        "data[Championship][searchByName]": "",
        "data[Championship][friendly]": "0",
    }
    r = s.post(f"{BASE}/Championships/filter", data=data, headers=AJAX, timeout=60)
    rows, last = parse_championship_rows(r.text)
    todos = list(rows)
    for p in range(2, last + 1):
        r = get(s, f"/Championships/filter/context:contexto/page:{p}", headers=AJAX)
        rows, _ = parse_championship_rows(r.text)
        todos += rows
    vistos, out = set(), []
    for t in todos:
        if t["torneo_id"] in vistos:
            continue
        vistos.add(t["torneo_id"])
        if ANIO in t["torneo"] or ANIO in t["division"]:
            out.append(t)
    return out


def detalle_torneo(s, t):
    r = get(s, f"/championships/view/{t['torneo_id']}")
    soup = BeautifulSoup(r.text, "lxml")
    hidden = {i.get("id"): i.get("value", "") for i in soup.select("#MatchFilterForm input[type=hidden]")}
    body = txt(soup.select_one(".content-wrapper"))
    t["titulares"] = num((re.search(r"Titulares:\s*(\d+)", body) or [None, "15"])[1]) or 15
    t["categoria_uar"] = (re.search(r"Categor\S*:\s*(.+?)\s+Sexo:", body) or [None, ""])[1]
    t["_filter"] = {
        "_method": "POST",
        "data[Match][status]": "", "data[Match][union_id]": "", "data[Match][club_id]": CLUB_ID,
        "data[Match][round_id]": "", "data[Match][referee_id]": "", "data[Match][searchByName]": "",
        "data[Match][championship_id]": t["torneo_id"],
        "data[Match][context]": hidden.get("MatchContext", "TORNEOS"),
        "data[Match][division_id]": hidden.get("MatchDivisionId", ""),
        "data[Match][friendly]": hidden.get("MatchFriendly", "0"),
        "data[Match][inactive]": hidden.get("MatchInactive", "active"),
        "data[Match][sex]": hidden.get("MatchSex", ""),
    }
    return t


def listar_partidos(s, t):
    r = s.post(f"{BASE}/Matches/filter", data=t["_filter"], headers=AJAX, timeout=60)
    htmls = [r.text]
    pages = {int(p) for p in re.findall(r"/page:(\d+)", r.text)}
    for p in range(2, (max(pages) if pages else 1) + 1):
        htmls.append(get(s, f"/Matches/filter/page:{p}", headers=AJAX).text)
    ids = []
    for h in htmls:
        for mid in re.findall(r"/Matches/view/(\d+)", h, re.I):
            if mid not in ids:
                ids.append(mid)
    return ids


# ---------------------------------------------------------------- partido
def cerrado(html):
    return "Cerrado" in html[:200000] and "label-info" in html


def bajar_partido(s, mid):
    """Un partido cerrado no cambia más: si ya está guardado se usa ese. Si no estaba o seguía abierto, se baja de nuevo."""
    f = RAW_PARTIDOS / f"{mid}.html.gz"
    if f.exists():
        with gzip.open(f, "rt", encoding="utf-8") as g:
            html = g.read()
        if cerrado(html):
            return html
    html = limpiar(get(s, f"/Matches/view/{mid}").text)  # sin DNI ni datos personales
    with gzip.open(f, "wt", encoding="utf-8") as g:
        g.write(html)
    return html


def parse_partido(html, mid):
    soup = BeautifulSoup(html, "lxml")
    main = soup.select_one(".content-wrapper")
    for m in main.select(".modalWindow, script, style"):
        m.decompose()
    head = main.select_one(".panel-body")
    htext = txt(head)

    def campo(label):
        m = re.search(label + r"\s*:\s*(.+?)(?:\s+(?:Ronda|Fecha|Partido|Referee|Cerrado|Iniciado|Pendiente|Suspendido|Imprimir)\b|$)", htext)
        return m.group(1).strip() if m else ""

    fecha_juego = (re.search(r"Fecha de juego\s*:\s*(\d{2}/\d{2}/\d{4})\s*(\d{2}:\d{2})?", htext) or [None, "", ""])
    estado = txt(head.select_one("span.label")) if head.select_one("span.label") else ""
    p = {
        "partido_id": mid,
        "ronda": campo("Ronda"),
        "instancia": txt(head.find("a", href=re.compile(r"/rounds/view/", re.I))),
        "fecha": fecha_juego[1],
        "hora": fecha_juego[2] or "",
        "referee": campo("Referee"),
        "estado": estado,
    }
    for lado in ("L", "V"):
        cont = main.select_one(f".lov_cont_{lado}")
        p[f"equipo_{lado}"] = txt(cont.find("h3")) if cont else ""
        p[f"score_{lado}"] = num(txt(main.select_one(f"#{lado}_Score_{mid}")))
        tsp = cont.select_one(".team_score_and_points") if cont else None
        bon = tsp.find_all("span")[1] if tsp and len(tsp.find_all("span")) > 1 else None
        p[f"pts_tabla_{lado}"] = num(txt(bon))

    incid = {"L": [], "V": []}
    plantel = {"L": [], "V": []}
    asistencia = {"L": {}, "V": {}}
    for t in main.find_all("table"):
        h = t.find_previous(["h3", "h4", "h5", "h6", "legend"])
        h = txt(h)
        lado = "L" if h.endswith("LOCAL") else "V" if h.endswith("VISITANTE") else None
        if not lado:
            continue
        ths = [txt(th) for th in t.find_all("th")]
        if "Ausente" in ths:
            # M13/M14: grilla de asistencia (tilde en 1T / 2T = participo)
            for tr in t.select("tbody tr"):
                td = tr.find_all("td")
                if len(td) < 4:
                    continue
                t1, t2 = bool(td[1].find("img")), bool(td[2].find("img"))
                asistencia[lado][tr.get("data-id")] = (
                    "1T y 2T" if t1 and t2 else "Solo 1T" if t1 else "Solo 2T" if t2
                    else "Ausente" if td[3].find("img") else "No participo")
        elif h.startswith("Incidencias"):
            for tr in t.select("tbody tr"):
                td = tr.find_all("td")
                if len(td) < 6:
                    continue
                jug = txt(td[5])
                m = re.match(r"(\d+)\s*-\s*(.+)", jug)
                incid[lado].append({
                    "tiempo": txt(td[0]), "minuto": num(txt(td[1])),
                    "incidencia": txt(td[3]), "puntos": num(txt(td[4])) or 0,
                    "dorsal": m.group(1) if m else "", "jugador": m.group(2) if m else jug,
                    "player_id": link_id(td[5].find("a"), r"/players/view/(\d+)"),
                    "detalle": txt(td[6]) if len(td) > 6 else "",
                    "sancion": txt(td[7]) if len(td) > 7 else "",
                })
        elif h.startswith("Miembros"):
            for tr in t.select("tbody tr"):
                td = tr.find_all("td")
                if len(td) < 4:
                    continue
                plantel[lado].append({
                    "orden": num(txt(td[0])), "dorsal": txt(td[1]), "documento": txt(td[2]),
                    "jugador": txt(td[3]),
                    "player_id": link_id(td[3].find("a") or td[2].find("a"), r"/players/view/(\d+)"),
                    "pos": txt(td[9]) if len(td) > 9 else "",
                })
    return p, incid, plantel, asistencia


def es_los50(nombre):
    return CLUB_NAME in (nombre or "").upper()


def tipo(inc):
    i = inc.lower()
    if i.startswith("try"):
        return "tries"
    if i.startswith("convers"):
        return "conversiones"
    if i.startswith("penal"):
        return "penales"
    if i.startswith("drop"):
        return "drops"
    if "amarilla" in i:
        return "amarillas"
    if "roja" in i:
        return "rojas"
    if "azul" in i or "conmoci" in i:
        return "conmociones"
    if i.startswith("ingres"):
        return "ingreso"
    return None


DUDOSO = "?"

# Torneos sin categoria en el sitio, clasificados por el club segun los jugadores que jugaron (confirmado 2026-10-06)
CATEGORIA_MANUAL = {
    "200": "Primera",      # IX Torneo Regional Pampeano B (2017)
    "2270": "Primera",     # X Torneo Regional Pampeano B Clasificatorio (2018)
    "2718": "Primera",     # Torneo Regional Pampeano B Campeonato (2018)
    "154": "Intermedia",   # Imagenes MDQ 2017 G2 (el sitio lo tiene como "Primera", pero es Intermedia)
    # confirmado por el club 2026-10-15, mirando quienes jugaron
    "616": "Primera",      # Super 12 2018
    "286": "Intermedia",   # Copa Imágenes Plata 2017
    "2376": "Intermedia",  # Torneo Imagenes MDQ Plata 2018
    "609": "M19",          # Preparacion 2018 (juveniles: no entra en plantel superior)
}

# Patada que no se puede atribuir a nadie: los puntos quedan para el equipo, no para un jugador
SIN_JUGADOR = {"player_id": None, "dorsal": "", "jugador": "(sin jugador)"}

# Nombres cargados al reves, sin coma o con otra ortografia en el sistema
NOMBRES = {
    "Jerónimo, Arrondo": "Arrondo, Jerónimo",
    "Arrondo, Jeronimo": "Arrondo, Jerónimo",
    "Guillermo, Gaspar": "Gaspar, Guillermo",
    "Federico, Romera": "Romera, Federico",
    "Fisini, Felipe": "Fissini, Felipe",
    "Martinez, Mariano": "Martínez Amadeo, Mariano Ariel",
    "Juno, Lenny Leonard": "Juno, Leonard Maramatanga",
    "Lescano Gonzalo": "Lescano, Gonzalo",
    "Neirotti Agustin": "Neirotti, Agustin",
    "Scola Singla Juan Bautista": "Scola Singla, Juan Bautista",
}

# Mismo jugador cargado dos veces en la UAR (id duplicado -> id que se usa)
UNIFICAR_IDS = {
    "295403": "26909",   # Vitullo, Felipe (mismo DNI)
    "235265": "299643",  # Schroh, Federico (mismo DNI)
    "334776": "87754",   # Pioli, Ignacio (DNI casi igual, nunca jugaron juntos)
    "313772": "7751",    # Padilla, Diego (DNI casi igual, nunca jugaron juntos)
    # mismo nombre y misma fecha de nacimiento, nunca en el mismo partido
    "174558": "299634",  # Fissini, Felipe
    "184028": "295596",  # Urraco, Martin
    "256027": "271963",  # Romera, Federico
    "278388": "296782",  # Chiappetta, Bruno
    "301418": "337617",  # Yavorsey, Bernardo
    "370791": "334772",  # Dego, Marcos
    "7639": "83965",     # Arrondo, Jerónimo
    "296777": "206230",  # Martínez Amadeo, Mariano Ariel
    "481416": "477876792",  # Juno, Leonard Maramatanga
    "228460": "351960",  # Gaspar, Guillermo (al reves en el sistema)
    "481518": "371249",  # Zampatti, Valentino (figura dos veces en la misma planilla)
    "296781": "142089",  # Mauro, Mateo (nacio el 25/03/2002; la otra ficha dice 28/03, confirmado por el club)
}

# Errores de carga en planillas, confirmados por el club: (partido, tiempo, minuto, incidencia) -> jugador correcto
CORRECCIONES = {
    # 27/07/2024 Bigua-Los 50: el penal figura a Mauro, Mateo (#11) pero lo pateo Jimenez, Santiago (#15)
    ("220431", "2T", 40, "Penal"): {"player_id": "332639", "dorsal": "15", "jugador": "Jimenez, Santiago"},
    # dorsal mal tipeado (falta un digito / numero de forward); pateo el pateador del partido
    ("238374", "2T", 12, "Conversión"): {"player_id": "7709", "dorsal": "14", "jugador": "Homps, Martin"},      # figuraba Vezzosi #1
    ("238354", "2T", 40, "Conversión"): {"player_id": "332639", "dorsal": "15", "jugador": "Jimenez, Santiago"},  # figuraba Ferrari, Benjamin #5
    ("4475", "2T", 24, "Conversión"): {"player_id": "7638", "dorsal": "10", "jugador": "Arrondo, Jacinto"},     # figuraba Mauro, Luciano #6
    # Clasificatorio 1ra 2021 Grupo 2: las patadas eran de Nicolas Gonzalez
    ("102417", "1T", 18, "Conversión"): {"player_id": "26721", "dorsal": "10", "jugador": "González, Nicolás"},  # figuraba Chayer
    ("102417", "2T", 8, "Penal"): {"player_id": "26721", "dorsal": "10", "jugador": "González, Nicolás"},
    ("102417", "2T", 17, "Conversión"): {"player_id": "26721", "dorsal": "10", "jugador": "González, Nicolás"},
    ("102417", "2T", 40, "Penal"): {"player_id": "26721", "dorsal": "10", "jugador": "González, Nicolás"},
    ("102418", "1T", 9, "Penal"): {"player_id": "26721", "dorsal": "9", "jugador": "González, Nicolás"},        # figuraba Mackinze
    ("102418", "1T", 22, "Penal"): {"player_id": "26721", "dorsal": "9", "jugador": "González, Nicolás"},
    ("102420", "1T", 2, "Penal"): {"player_id": "26721", "dorsal": "9", "jugador": "González, Nicolás"},        # figuraba Albornoz
    ("102420", "1T", 21, "Penal"): {"player_id": "26721", "dorsal": "9", "jugador": "González, Nicolás"},
    ("102420", "1T", 25, "Penal"): {"player_id": "26721", "dorsal": "9", "jugador": "González, Nicolás"},
    # Intermedia / Pre-Intermedia (confirmado por el club)
    ("191867", "1T", 20, "Conversión"): {"player_id": "88107", "dorsal": "15", "jugador": "Haffner, Segundo"},           # figuraba Cabral #5
    ("215814", "2T", 30, "Conversión"): {"player_id": "171866", "dorsal": "10", "jugador": "Bazterrica Baro, Lautaro"},  # figuraba Cabral #7
    ("118688", "2T", 65, "Penal"): {"player_id": "171866", "dorsal": "15", "jugador": "Bazterrica Baro, Lautaro"},       # figuraba Albornoz #12
    ("2620", "2T", 33, "Conversión"): {"player_id": "26721", "dorsal": "10", "jugador": "González, Nicolás"},            # figuraba Lorenzo Gutierrez #12
    ("126382", "2T", 68, "Conversión"): {"player_id": "7772", "dorsal": "15", "jugador": "Radetich, Matías"},            # figuraba Lavin #2
    ("191263", "1T", 25, "Conversión"): {"player_id": "7714", "dorsal": "11", "jugador": "Jimenez, Bautista"},           # figuraba Fagonde #6
    ("191263", "2T", 8, "Penal"): {"player_id": "7714", "dorsal": "11", "jugador": "Jimenez, Bautista"},
    # jugadores que nunca patearon (confirmado por el club): la patada pasa al pateador en cancha
    ("22875", "1T", 2, "Conversión"): {"player_id": "7809", "dorsal": "10", "jugador": "Vila, Gustavo Camilo"},  # 21/04/2018 Intermedia: figuraba Mendiberri
    ("22875", "1T", 30, "Conversión"): {"player_id": "7809", "dorsal": "10", "jugador": "Vila, Gustavo Camilo"},
    ("22875", "2T", 13, "Penal"): {"player_id": "7809", "dorsal": "10", "jugador": "Vila, Gustavo Camilo"},
    ("28922", "2T", 15, "Conversión"): {"player_id": "7809", "dorsal": "9", "jugador": "Vila, Gustavo Camilo"},  # 02/06/2018 Intermedia: figuraba Salagoity
    ("102452", "2T", 35, "Conversión"): {"player_id": "7759", "dorsal": "12", "jugador": "Perez Diez, German"},  # 21/08/2021 Intermedia: figuraba Cagigas Lemma
    ("131375", "2T", 46, "Conversión"): {"player_id": "7772", "dorsal": "15", "jugador": "Radetich, Matías"},  # 14/05/2022 Intermedia: figuraba Zurzolo Garcia
    ("131375", "2T", 58, "Conversión"): {"player_id": "7772", "dorsal": "15", "jugador": "Radetich, Matías"},
    ("119616", "2T", 65, "Drop"): {"player_id": "26721", "dorsal": "10", "jugador": "González, Nicolás"},  # 02/10/2021 Intermedia: figuraba Salituri (drop)
    ("322917", "2T", 31, "Conversión"): {"player_id": "326920", "dorsal": "10", "jugador": "Benedetto, Alejandro"},  # 19/09/2026 Intermedia: figuraba Alvarez, Juan Ignacio
    ("22904", "2T", 3, "Conversión"): {"player_id": "7772", "dorsal": "25", "jugador": "Radetich, Matías"},  # 21/04/2018 Pre-Intermedia: figuraba Melo
    ("22905", "1T", 26, "Conversión"): {"player_id": "334776", "dorsal": "10", "jugador": "Pioli, Ignacio"},  # 28/04/2018 Pre-Intermedia: figuraba Mendiberri
    ("130919", "1T", 10, "Conversión"): {"player_id": "7759", "dorsal": "10", "jugador": "Perez Diez, German"},  # 21/05/2022 Pre-Intermedia: figuraba Perazzone
    ("164504", "2T", 6, "Conversión"): {"player_id": "7714", "dorsal": "14", "jugador": "Jimenez, Bautista"},  # 15/04/2023 Pre-Intermedia: figuraba Perazzone
    ("238436", "1T", 40, "Penal"): {"player_id": "7714", "dorsal": "10", "jugador": "Jimenez, Bautista"},  # 31/05/2025 Pre-Intermedia: figuraba Centurion
    ("238436", "2T", 22, "Conversión"): {"player_id": "7714", "dorsal": "10", "jugador": "Jimenez, Bautista"},
    ("238436", "2T", 36, "Penal"): {"player_id": "7714", "dorsal": "10", "jugador": "Jimenez, Bautista"},
    ("257380", "2T", 3, "Conversión"): {"player_id": "7714", "dorsal": "15", "jugador": "Jimenez, Bautista"},  # 06/09/2025 Pre-Intermedia: figuraba Ramirez Pizarro
    ("191867", "2T", 14, "Drop"): {"player_id": "88107", "dorsal": "15", "jugador": "Haffner, Segundo"},  # 21/10/2023 Intermedia: figuraba Vitullo (drop)
    ("126103", "1T", 37, "Conversión"): {"player_id": "171866", "dorsal": "9", "jugador": "Bazterrica Baro, Lautaro"},  # 13/11/2021 Intermedia: figuraba Centurion
    ("126103", "2T", 45, "Conversión"): {"player_id": "171866", "dorsal": "9", "jugador": "Bazterrica Baro, Lautaro"},
    ("126103", "2T", 54, "Conversión"): {"player_id": "171866", "dorsal": "9", "jugador": "Bazterrica Baro, Lautaro"},
    ("126103", "2T", 76, "Penal"): {"player_id": "171866", "dorsal": "9", "jugador": "Bazterrica Baro, Lautaro"},
    ("131384", "1T", 23, "Penal"): {"player_id": "171866", "dorsal": "10", "jugador": "Bazterrica Baro, Lautaro"},  # 21/05/2022 Intermedia: figuraba Centurion
    ("131384", "2T", 73, "Penal"): {"player_id": "171866", "dorsal": "10", "jugador": "Bazterrica Baro, Lautaro"},
    ("131373", "1T", 7, "Penal"): {"player_id": "7709", "dorsal": "10", "jugador": "Homps, Martin"},  # 07/05/2022 Intermedia: figuraba Centurion
    ("131373", "1T", 36, "Conversión"): {"player_id": "7709", "dorsal": "10", "jugador": "Homps, Martin"},
    ("131366", "1T", 5, "Conversión"): {"player_id": "171866", "dorsal": "10", "jugador": "Bazterrica Baro, Lautaro"},  # 01/05/2022 Intermedia: figuraba Centurion
    ("131366", "1T", 23, "Conversión"): {"player_id": "171866", "dorsal": "10", "jugador": "Bazterrica Baro, Lautaro"},
    ("131366", "2T", 48, "Conversión"): {"player_id": "171866", "dorsal": "10", "jugador": "Bazterrica Baro, Lautaro"},
    ("227685", "2T", 40, "Conversión"): SIN_JUGADOR,  # 12/10/2024 Pre-Intermedia: figuraba Vitullo, ese dia no jugo ningun pateador
    # 08/11/2025 Intermedia vs Comercial: Jimenez, Bautista salio en el 2T 6' y entro Benedetto, que siguio pateando (confirmado 2026-10-15)
    ("271126", "2T", 27, "Conversión"): {"player_id": "326920", "dorsal": "20", "jugador": "Benedetto, Alejandro"},
    ("271126", "2T", 37, "Penal"): {"player_id": "326920", "dorsal": "20", "jugador": "Benedetto, Alejandro"},
}

# Revisión de datos (revision.py): fichas repetidas seguras y lo que contestó el club en la página "Revisar datos"
UNIFICAR_MANUAL = dict(UNIFICAR_IDS)


def _revision(nombre, vacio):
    f = HERE / "revision" / nombre
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else vacio


UNIFICAR_IDS.update(_revision("unificar.json", {}))
# (partido, tiempo, minuto, incidencia, jugador que figuraba) -> jugador correcto, "quitar" (no existió) o "quitar_una" (cargada dos veces)
ARREGLOS = {}
for _r in _revision("respuestas.json", {}).values():
    if _r["tipo"] == "planilla" and _r["respuesta"] in ("otro", "no", "una"):
        for _c in _r["claves"]:
            ARREGLOS[tuple(_c)] = ({"player_id": _r["player_id"], "dorsal": _r["dorsal"], "jugador": _r["jugador"]}
                                   if _r["respuesta"] == "otro" else "quitar" if _r["respuesta"] == "no" else "quitar_una")


# jugadas que el club confirmó que no existieron (se sacan de las estadísticas, pero la planilla de la web las muestra tachadas)
QUITADAS = {}


def aplicar_correcciones(mid, incid, plantel):
    QUITADAS.pop(mid, None)
    for lado in incid.values():
        for i in lado:
            fix = CORRECCIONES.get((mid, i["tiempo"], i["minuto"], i["incidencia"]))
            if fix:
                i["figuraba"] = NOMBRES.get(i["jugador"], i["jugador"])  # lo que dice la planilla (se muestra en la web)
                i["figuraba_dorsal"] = i["dorsal"]
                i.update(fix, detalle=(i["detalle"] + " [corregido: figuraba a otro jugador]").strip())
            i["jugador"] = NOMBRES.get(i["jugador"], i["jugador"])
            if i.get("player_id"):
                i["player_id"] = UNIFICAR_IDS.get(str(i["player_id"]), i["player_id"])
    if ARREGLOS:
        for k, lado in incid.items():
            limpio, sacadas = [], set()
            for i in lado:
                clave = (mid, i["tiempo"], i["minuto"], i["incidencia"], str(i.get("player_id") or ""))
                fix = ARREGLOS.get(clave)
                if fix == "quitar" or (fix == "quitar_una" and clave not in sacadas):
                    sacadas.add(clave)
                    QUITADAS.setdefault(mid, []).append(dict(i))
                    continue
                if isinstance(fix, dict):
                    i["figuraba"], i["figuraba_dorsal"] = i["jugador"], i["dorsal"]
                    i.update(fix, detalle=(i["detalle"] + " [corregido por el club]").strip())
                limpio.append(i)
            incid[k] = limpio
    for k, lado in plantel.items():
        vistos, limpio = set(), []
        for j in lado:
            j["jugador"] = NOMBRES.get(j["jugador"], j["jugador"])
            if j.get("player_id"):
                j["player_id"] = UNIFICAR_IDS.get(str(j["player_id"]), j["player_id"])
                # el mismo jugador cargado dos veces en la planilla (con sus dos ids) cuenta una sola vez
                if j["player_id"] in vistos:
                    continue
                vistos.add(j["player_id"])
            limpio.append(j)
        plantel[k] = limpio
    # la misma tarjeta cargada dos veces (mismo jugador, mismo minuto) se cuenta una sola vez
    for k, lado in incid.items():
        vistas, limpio = set(), []
        for i in lado:
            clave = (i["tiempo"], i["minuto"], i["incidencia"], i["player_id"])
            if tipo(i["incidencia"]) in ("amarillas", "rojas") and clave in vistas:
                continue
            vistas.add(clave)
            limpio.append(i)
        incid[k] = limpio


def _cat(texto):
    t = texto.lower()
    if re.search(r"\bm\s?23\b", t):
        return "M23"
    if re.search(r"pre[\s\-]*interm", t):
        return "Pre-Intermedia"
    if re.search(r"interm|\bint\b\.?", t):
        return "Intermedia"
    if re.search(r"primera|\b1ra\b", t):
        return "Primera"
    return None


def categoria_ps(t):
    """Categoria de plantel superior del torneo; DUDOSO si es de mayores pero no dice cual; None si no es plantel superior.
    Primero el nombre (la division "Plantel Superior" de la union mezcla Primera, M23 y Pre-Intermedia),
    despues la division si es especifica."""
    if t["torneo_id"] in CATEGORIA_MANUAL:
        c = CATEGORIA_MANUAL[t["torneo_id"]]
        return c if c in ("Primera", "Intermedia", "Pre-Intermedia", "M23") else None
    nombre, div = t["torneo"], t["division"]
    n = nombre.lower()
    if re.search(r"prueba|femenin|menores|juvenil|\bm[\s\-]?1\d\b", n) or re.search(r"femenin|menores|\bm1\d\b", div.lower()):
        return None
    if "seven" in n:
        return DUDOSO
    cat = _cat(nombre) or _cat(div)
    if cat:
        return cat
    if "plantel superior" in div.lower() or re.search(r"pampeano|\btrp\b|mayores", n):
        return DUDOSO
    return None


# ---------------------------------------------------------------- planillas para la web
CATEGORIAS_WEB = ("Primera", "Intermedia", "Pre-Intermedia")
PLANILLAS_WEB = HERE / "web" / "planillas"
DE_PUNTOS = ("Try", "Try penal", "Conversión", "Penal", "Drop")
TARJETAS = ("Amarilla", "Roja", "Tarjeta azul")


def planilla_web(p, incid, lado, t, formacion):
    """La planilla de un partido como se ve en la web: lo de Los 50 con nombres; del rival, solo puntos y tarjetas (sin nombres)."""
    from exportar_web import nombre_lindo, rival as rival_lindo
    riv = "V" if lado == "L" else "L"
    jugadas = []
    for i in incid[lado]:
        if i["incidencia"] in DE_PUNTOS + TARJETAS + ("Ingresó", "Se retiró"):
            jugadas.append([lado, i["tiempo"], i["minuto"], i["incidencia"], i["puntos"], i["dorsal"],
                            nombre_lindo(i["jugador"]), i.get("player_id") or "", nombre_lindo(i["figuraba"]) if i.get("figuraba") else "",
                            i.get("figuraba_dorsal", "")])
    for i in incid[riv]:
        if i["incidencia"] in DE_PUNTOS + TARJETAS:
            jugadas.append([riv, i["tiempo"], i["minuto"], i["incidencia"], i["puntos"], i["dorsal"], "", "", ""])
    quitadas = [[lado, i["tiempo"], i["minuto"], i["incidencia"], i["puntos"], i["dorsal"], nombre_lindo(i["jugador"]),
                 i.get("player_id") or ""] for i in QUITADAS.get(p["partido_id"], [])]
    orden = lambda j: ({"1T": 0, "2T": 1}.get(j[1], 2), j[2] if j[2] is not None else 999)
    return {
        "mid": p["partido_id"], "categoria": t["categoria"], "torneo": t["torneo"], "ronda": p["ronda"], "instancia": p["instancia"],
        "fecha": p["fecha"], "hora": p["hora"], "estado": p["estado"],
        "arbitro": re.sub(r"\s*\[DNI\]", "", p["referee"]).strip(),
        "lado": lado, "equipos": [rival_lindo(p["equipo_L"]) if lado == "V" else CLUB_NAME.title(),
                    rival_lindo(p["equipo_V"]) if lado == "L" else CLUB_NAME.title()],
        "tantos": [p["score_L"], p["score_V"]], "url": f"{BASE}/Matches/view/{p['partido_id']}",
        "jugadas": sorted(jugadas, key=orden), "quitadas": quitadas,
        "formacion": [[o, d, nombre_lindo(n), pid, r] for o, d, n, pid, r in formacion],
    }


def guardar_planillas(planillas):
    """web/planillas/<partido>.json (solo se reescribe si cambió, para no ensuciar el historial)."""
    PLANILLAS_WEB.mkdir(parents=True, exist_ok=True)
    nuevas = 0
    for pl in planillas:
        f = PLANILLAS_WEB / f"{pl['mid']}.json"
        txt = json.dumps(pl, ensure_ascii=False, separators=(",", ":"))
        if not f.exists() or f.read_text(encoding="utf-8") != txt:
            f.write_text(txt, encoding="utf-8")
            nuevas += 1
    print(f"  planillas para la web: {len(planillas)} ({nuevas} nuevas o cambiadas)")


# ---------------------------------------------------------------- main
def main():
    s = login()
    print(f"Login OK. Buscando torneos {ARG} de {CLUB_NAME}...")
    torneos = listar_torneos(s)
    for t in torneos:
        t["categoria"] = categoria_ps(t)
        t["grupo"] = "Primera" if t["categoria"] == "Primera" else "Resto plantel superior"
    dudosos = [t for t in torneos if t["categoria"] == DUDOSO]
    torneos = [t for t in torneos if t["categoria"] and t["categoria"] != DUDOSO]
    print(f"  {len(torneos)} torneos de plantel superior {ARG} ({len(dudosos)} sin categoria clara, quedan aparte)")

    partidos, jug_partido, incid_rows, planillas = [], [], [], []
    for t in torneos:
        detalle_torneo(s, t)
        mids = listar_partidos(s, t)
        t["partidos_los50"] = len(mids)
        print(f"  [{t['torneo_id']}] {t['grupo']} / {t['categoria']} - {t['torneo']}: {len(mids)} partidos")
        for mid in mids:
            p, incid, plantel, asistencia = parse_partido(bajar_partido(s, mid), mid)
            aplicar_correcciones(mid, incid, plantel)
            lado = "L" if es_los50(p["equipo_L"]) else "V" if es_los50(p["equipo_V"]) else None
            if not lado:
                print(f"     ! partido {mid}: no encuentro a {CLUB_NAME} ({p['equipo_L']} vs {p['equipo_V']})")
                continue
            rival = "V" if lado == "L" else "L"
            anio = p["fecha"][-4:] if p["fecha"] else (re.search(r"20\d\d", t["torneo"] + t["division"]) or [""])[0]
            base = {"anio": anio, "grupo": t["grupo"], "categoria": t["categoria"],
                    "torneo_id": t["torneo_id"], "torneo": t["torneo"],
                    **{k: p[k] for k in ("partido_id", "ronda", "instancia", "fecha")}}
            pf, pc = p[f"score_{lado}"], p[f"score_{rival}"]
            jugado = pf is not None and pc is not None and p["estado"] in ("Cerrado", "Iniciado")
            res = "" if not jugado else ("G" if pf > pc else "E" if pf == pc else "P")
            tries = lambda l: sum(1 for i in incid[l] if tipo(i["incidencia"]) == "tries")
            partidos.append({
                **base, "hora": p["hora"], "condicion": "Local" if lado == "L" else "Visitante",
                "rival": p[f"equipo_{rival}"], "local": p["equipo_L"], "visitante": p["equipo_V"],
                "tantos_los50": pf, "tantos_rival": pc, "resultado": res,
                "tries_los50": tries(lado), "tries_rival": tries(rival),
                "pts_tabla_los50": p[f"pts_tabla_{lado}"], "estado": p["estado"], "referee": p["referee"],
                "url": f"{BASE}/Matches/view/{mid}",
            })
            stats = defaultdict(lambda: defaultdict(int))
            for i in incid[lado]:
                incid_rows.append({**base, "rival": p[f"equipo_{rival}"], **i})
                k = tipo(i["incidencia"])
                key = i["player_id"] or i["jugador"]
                if k:
                    stats[key][k] += 1
                stats[key]["puntos"] += i["puntos"]
                stats[key]["eventos"] += 1
            # dos amarillas en el mismo partido = roja (a veces la planilla no carga la roja)
            for st in stats.values():
                if st["amarillas"] >= 2 and st["rojas"] == 0:
                    st["rojas"] = 1
            # pendientes, suspendidos y walkovers no cuentan como partido jugado
            se_jugo = p["estado"] in ("Cerrado", "Iniciado")
            asis = asistencia[lado]
            formacion = []
            for j in plantel[lado]:
                key = j["player_id"] or j["jugador"]
                st = stats.get(key, {})
                if asis:
                    rol = asis.get(j["player_id"], "Sin dato")
                    jugo = rol in ("1T y 2T", "Solo 1T", "Solo 2T")
                else:
                    titular = (j["orden"] or 99) <= t["titulares"]
                    rol = "Titular" if titular else "Suplente"
                    # un suplente jugo si tiene cualquier registro en el partido (ingreso, salida, puntos, tarjeta):
                    # en ~50 planillas los cambios estan cargados al reves y el que entra figura como "Se retiro"
                    jugo = titular or st.get("eventos", 0) > 0
                jugo = jugo and se_jugo
                formacion.append([j["orden"], j["dorsal"], j["jugador"], j["player_id"] or "",
                                  "T" if jugo and rol == "Titular" else "E" if jugo else "B"])
                jug_partido.append({
                    **base, "rival": p[f"equipo_{rival}"], "estado": p["estado"], "player_id": j["player_id"],
                    "documento": j["documento"], "jugador": j["jugador"], "dorsal": j["dorsal"],
                    "rol": rol, "jugo": "Si" if jugo else "No",
                    **{k: st.get(k, 0) for k in ("tries", "conversiones", "penales", "drops", "puntos",
                                                 "amarillas", "rojas")},
                })

            if res and t["categoria"] in CATEGORIAS_WEB:
                planillas.append(planilla_web(p, incid, lado, t, formacion))

    df_t = pd.DataFrame([{k: v for k, v in t.items() if not k.startswith("_")} for t in torneos])
    df_p = pd.DataFrame(partidos)
    df_j = pd.DataFrame(jug_partido)
    df_i = pd.DataFrame(incid_rows)
    if not df_p.empty:
        df_p["_f"] = pd.to_datetime(df_p.fecha, format="%d/%m/%Y", errors="coerce")
        df_p = df_p.sort_values(["anio", "grupo", "categoria", "_f"]).drop(columns="_f")

    num_cols = ["tries", "conversiones", "penales", "drops", "puntos", "amarillas", "rojas"]

    # un jugador = un player_id; nombre/documento del registro mas reciente
    if not df_j.empty:
        df_j["player_id"] = df_j.player_id.fillna(df_j.jugador)
        df_j["_f"] = pd.to_datetime(df_j.fecha, format="%d/%m/%Y", errors="coerce")
        ident = df_j.sort_values("_f").groupby("player_id")[["documento", "jugador"]].last()
        df_j = df_j.drop(columns="_f")

    def resumen(df, keys=()):
        keys = list(keys) + ["player_id"]
        g = df.assign(
            pj=(df.jugo == "Si").astype(int),
            titular=((df.rol == "Titular") & (df.jugo == "Si")).astype(int),
            entro_suplente=((df.rol == "Suplente") & (df.jugo == "Si")).astype(int),
            convocado_sin_entrar=((df.jugo == "No") & df.estado.isin(["Cerrado", "Iniciado"])).astype(int),
        ).groupby(keys, dropna=False)[["pj", "titular", "entro_suplente", "convocado_sin_entrar"] + num_cols].sum()
        g = g.reset_index()
        i = keys.index("player_id") + 1
        g.insert(i, "documento", g.player_id.map(ident.documento))
        g.insert(i + 1, "jugador", g.player_id.map(ident.jugador))
        return g[(g.pj > 0) | (g.convocado_sin_entrar > 0)].sort_values(["pj", "tries"], ascending=False)

    def temporadas(df):
        d = df[df.jugo == "Si"].groupby("player_id")["anio"]
        return d.agg(lambda x: ", ".join(sorted(set(map(str, x))))), d.nunique()

    def resumen_equipo(df):
        d = df[df.resultado.isin(["G", "E", "P"])]
        return d.groupby(["anio", "grupo", "categoria"]).agg(
            PJ=("partido_id", "count"), G=("resultado", lambda s: (s == "G").sum()),
            E=("resultado", lambda s: (s == "E").sum()), P=("resultado", lambda s: (s == "P").sum()),
            PF=("tantos_los50", "sum"), PC=("tantos_rival", "sum"),
            tries_favor=("tries_los50", "sum"), tries_contra=("tries_rival", "sum"),
        ).reset_index()

    sufijo = "historico" if ARG == "todos" else ARG
    out = HERE / f"Los50_PlantelSuperior_{sufijo}.xlsx"
    with pd.ExcelWriter(out, engine="openpyxl") as xw:
        if not df_j.empty:
            prim = df_j[df_j.grupo == "Primera"]
            resto = df_j[df_j.grupo != "Primera"]

            # total: Primera y resto lado a lado
            cols = ["pj", "tries", "puntos", "amarillas", "rojas"]
            a = resumen(prim).set_index("player_id")[cols].add_suffix("_primera")
            b = resumen(resto).set_index("player_id")[cols].add_suffix("_resto")
            tot = a.join(b, how="outer").fillna(0).astype(int)
            for c in cols:
                tot[f"{c}_total"] = tot[f"{c}_primera"] + tot[f"{c}_resto"]
            tot = tot[[f"{c}_{g}" for c in cols for g in ("primera", "resto", "total")]].reset_index()
            temps, n_temps = temporadas(df_j)
            tot.insert(1, "documento", tot.player_id.map(ident.documento))
            tot.insert(2, "jugador", tot.player_id.map(ident.jugador))
            tot.insert(3, "temporadas", tot.player_id.map(n_temps).fillna(0).astype(int))
            tot.insert(4, "anios", tot.player_id.map(temps).fillna(""))
            tot.sort_values(["pj_total", "tries_total"], ascending=False) \
                .to_excel(xw, sheet_name="Total plantel superior", index=False)

            r = resumen(prim)
            r.insert(3, "anios", r.player_id.map(temporadas(prim)[0]).fillna(""))
            r.to_excel(xw, sheet_name="Primera", index=False)
            r = resumen(resto)
            cats = resto[resto.jugo == "Si"].groupby("player_id")["categoria"].agg(lambda x: ", ".join(sorted(set(x))))
            r.insert(3, "categorias", r.player_id.map(cats).fillna(""))
            r.insert(4, "anios", r.player_id.map(temporadas(resto)[0]).fillna(""))
            r.to_excel(xw, sheet_name="Resto plantel superior", index=False)

            resumen(df_j, ["anio", "grupo", "categoria"]) \
                .sort_values(["anio", "grupo", "categoria", "pj", "tries"], ascending=[False, True, True, False, False]) \
                .to_excel(xw, sheet_name="Por temporada", index=False)
            resumen_equipo(df_p).sort_values(["anio", "grupo", "categoria"], ascending=[False, True, True]) \
                .to_excel(xw, sheet_name="Resultados equipo", index=False)
        df_p.to_excel(xw, sheet_name="Partidos", index=False)
        df_j.to_excel(xw, sheet_name="Planteles por partido", index=False)
        df_i.to_excel(xw, sheet_name="Incidencias", index=False)
        df_t.to_excel(xw, sheet_name="Torneos", index=False)
        pd.DataFrame([{k: t[k] for k in ("torneo_id", "torneo", "division", "organizador")} for t in dudosos],
                     columns=["torneo_id", "torneo", "division", "organizador"]) \
            .to_excel(xw, sheet_name="Pendientes sin categoria", index=False)
        for ws in xw.book.worksheets:
            ws.freeze_panes = "A2"
            ws.auto_filter.ref = ws.dimensions
            for col in ws.columns:
                w = max(len(str(c.value or "")) for c in list(col)[:300])
                ws.column_dimensions[col[0].column_letter].width = min(max(8, w + 2), 45)

    print(f"\nListo: {out}")
    print(f"  Partidos: {len(df_p)} | filas plantel: {len(df_j)} | incidencias: {len(df_i)}")
    if not df_i.empty:
        print("  Tipos de incidencia:", df_i.incidencia.value_counts().to_dict())
    if ARG == "todos":
        import exportar_web
        import reporte_jugadores
        reporte_jugadores.main()
        exportar_web.main()
        guardar_planillas(planillas)


if __name__ == "__main__":
    main()
