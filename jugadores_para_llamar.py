"""Lista de jugadores de LOS 50 nacidos entre 1999 y 2007 para volver a llamar (los que no subieron o dejaron el plantel superior).

Uso:  python jugadores_para_llamar.py
Fuente: sección Jugadores de bd.uar.com.ar (fichados del club) + ficha de cada jugador (fichajes y partidos).
Los partidos de plantel superior se toman del histórico oficial ya procesado (Los50_PlantelSuperior_historico.xlsx).
Escribe Los50_Jugadores_para_llamar.xlsx (privado: no va a la web). No guarda DNI.
"""
import json
import re
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import pandas as pd
from bs4 import BeautifulSoup
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

from uar_session import BASE, get, login

HERE = Path(__file__).parent
CACHE = HERE / "cache" / "jugadores"
CACHE.mkdir(parents=True, exist_ok=True)
DESTINO = HERE / "Los50_Jugadores_para_llamar.xlsx"
ANIO_ACTUAL = date.today().year
NAC_DESDE, NAC_HASTA = "1999-01-01", "2007-12-31"
AJAX = {"X-Requested-With": "XMLHttpRequest"}
UNIFICAR_IDS = {"295403": "26909", "235265": "299643", "334776": "87754", "313772": "7751",  # igual que extraer_los50.py
                "174558": "299634", "184028": "295596", "256027": "271963", "278388": "296782", "301418": "337617",
                "370791": "334772", "7639": "83965", "296777": "206230", "481416": "477876792", "228460": "351960",
                "481518": "371249", "296781": "142089"}

txt = lambda el: " ".join(el.get_text(" ").split()) if el else ""


# ---------- 1. lista de fichados del club ----------
def listar(s):
    get(s, "/players")
    d = {"_method": "POST", "data[Player][union_id]": "2", "data[Player][club_id]": "182", "data[Player][club2_id]": "182",
         "data[Player][division_id]": "", "data[Player][region_id]": "", "data[Player][apl]": "", "data[Player][antidoping]": "",
         "data[Player][concussions_course]": "", "data[Player][certified]": "", "data[Player][enabled]": "",
         "data[Player][competitive]": "", "data[Player][category_id]": "", "data[Player][birthdateFrom]": NAC_DESDE,
         "data[Player][birthdateTo]": NAC_HASTA, "data[Player][signdateFrom]": "", "data[Player][signdateTo]": "",
         "data[Player][sex]": "M", "data[Player][status]": "", "data[Player][position_id]": "", "data[Player][searchByName]": "",
         "data[Player][context]": "JUGADORES"}
    r = s.post(BASE + "/Players/filter", data=d, headers=AJAX, timeout=60)
    htmls = [r.text]
    ult = max([int(x) for x in re.findall(r"/page:(\d+)", r.text)] or [1])
    for n in range(2, ult + 1):
        htmls.append(get(s, f"/Players/filter/page:{n}", headers=AJAX).text)
    jugadores = {}
    for h in htmls:
        for tr in BeautifulSoup(h, "lxml").select("tbody tr"):
            td = tr.find_all("td")
            a = tr.find("a", href=re.compile(r"/players/view/\d+", re.I))
            if not a or len(td) < 8:
                continue
            pid = re.search(r"/view/(\d+)", a["href"], re.I).group(1)
            jugadores[pid] = {"player_id": pid, "jugador": txt(td[3]), "nacimiento": txt(td[4]), "categoria_uar": txt(td[5]),
                              "posicion": txt(td[6]), "ultimo_fichaje": txt(td[7])}
    return list(jugadores.values())


# ---------- 2. ficha de cada jugador ----------
def ficha(s, pid):
    f = CACHE / f"{pid}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    soup = BeautifulSoup(get(s, f"/Players/view/{pid}").text, "lxml")
    out = {"fichajes": [], "partidos": []}
    for t in soup.select(".content-wrapper table"):
        hdr = [txt(th) for th in t.find_all("th")]
        filas = [[txt(c) for c in tr.find_all("td")] for tr in t.select("tbody tr")]
        if "Año" in hdr and "Club" in hdr:
            i_a, i_c = hdr.index("Año"), hdr.index("Club")
            out["fichajes"] = [(r[i_a], r[i_c]) for r in filas if len(r) > max(i_a, i_c) and r[i_a].isdigit()]
        elif "División" in hdr and "Fecha" in hdr:
            i_t, i_d, i_f = hdr.index("Torneo / Instancia"), hdr.index("División"), hdr.index("Fecha")
            i_c = hdr.index("Condición") if "Condición" in hdr else None
            out["partidos"] = [{"torneo": r[i_t], "division": re.sub(r"\s*\(INACTIVA\)", "", r[i_d]), "fecha": r[i_f],
                                "condicion": r[i_c] if i_c is not None and i_c < len(r) else ""}
                               for r in filas if len(r) > max(i_t, i_d, i_f)]
    f.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def tipo_division(div, torneo):
    d = (div + " " + torneo).lower()
    if re.search(r"menores?\b|juvenil|\bm\s?-?1[3-9]\b|pre ?juvenil", d):   # "Menore 16" también existe en el sistema
        cat = r"(?:menores?(?: de)?|\bm)\s?-?(1[3-9])\b"
        m = re.search(cat, torneo.lower()) or re.search(cat, div.lower())   # el nombre del torneo es más confiable que la división
        return "Juveniles", (f"M{m.group(1)}" if m else "Juveniles")
    if re.search(r"primera|\b1ra\b|intermedia|plantel superior|m2[23]|mayores|pampeano|imagenes|preparaci", d):
        return "Plantel superior", None
    return "Otro", None


def unir_duplicados(lista):
    """La misma persona puede tener 2 registros en la UAR (uno de chico, otro de mayor, a veces con el nombre al revés).
    Se unen si coinciden las palabras del nombre (sin orden ni acentos) y el año de nacimiento."""
    import unicodedata
    clave = lambda j: (frozenset(re.findall(r"[a-z]+", unicodedata.normalize("NFKD", j["jugador"]).encode("ascii", "ignore").decode().lower())),
                       j["nacimiento"][-4:])
    grupos = {}
    for j in lista:
        grupos.setdefault(clave(j), []).append(j)
    out = []
    for g in grupos.values():
        g.sort(key=lambda j: int(j["ultimo_fichaje"]) if j["ultimo_fichaje"].isdigit() else 0, reverse=True)
        base = dict(g[0])  # el registro más reciente manda (nombre, posición, nacimiento)
        base["jugador"] = {"Jerónimo, Arrondo": "Arrondo, Jerónimo"}.get(base["jugador"], base["jugador"])  # cargado al revés en la UAR
        base["ids"] = [j["player_id"] for j in g]
        vistos, partidos = set(), []
        for j in g:
            for p in j.get("partidos", []):
                k = (p["fecha"], p["torneo"])
                if k not in vistos:
                    vistos.add(k)
                    partidos.append(p)
        base["partidos"] = partidos
        base["fichajes"] = sorted({tuple(f) for j in g for f in j.get("fichajes", [])}, reverse=True)
        base["ultimo_fichaje"] = str(max((int(j["ultimo_fichaje"]) for j in g if j["ultimo_fichaje"].isdigit()), default="")) or ""
        out.append(base)
    return out


# ---------- 3. clasificar ----------
def main():
    s = login()
    lista = listar(s)
    print(f"{len(lista)} jugadores nacidos entre 1999 y 2007 en el club", flush=True)
    lock, hechos = threading.Lock(), [0]

    def bajar(j):
        try:
            j.update(ficha(s, j["player_id"]))
        except Exception as e:  # noqa: BLE001
            j.update(fichajes=[], partidos=[], error=str(e))
        with lock:
            hechos[0] += 1
            if hechos[0] % 50 == 0:
                print(f"  {hechos[0]}/{len(lista)}", flush=True)

    with ThreadPoolExecutor(max_workers=2) as ex:
        list(ex.map(bajar, lista))
    lista = unir_duplicados(lista)
    print(f"{len(lista)} personas después de unir registros duplicados", flush=True)

    # plantel superior: datos oficiales ya procesados (partidos jugados de verdad, no convocatorias)
    ps = pd.read_excel(HERE / "Los50_PlantelSuperior_historico.xlsx", sheet_name="Planteles por partido")
    ps = ps[ps.jugo == "Si"].copy()
    ps["player_id"] = ps.player_id.astype("Int64").astype(str)
    ps_res = ps.groupby("player_id").agg(pj_ps=("partido_id", "nunique"), ultimo_ps=("anio", "max"),
                                         cats_ps=("categoria", lambda c: ", ".join(sorted(set(c)))))

    filas = []
    for j in lista:
        pids = {UNIFICAR_IDS.get(x, x) for x in j.get("ids", [j["player_id"]])}
        nac = pd.to_datetime(j["nacimiento"], format="%d/%m/%Y", errors="coerce")
        juv = [(p, tipo_division(p["division"], p["torneo"])) for p in j.get("partidos", [])]
        juv_p = [(p, sub) for p, (t, sub) in juv if t == "Juveniles"]
        anios_juv = [int(p["fecha"][-4:]) for p, _ in juv_p if p["fecha"][-4:].isdigit()]
        todos_anios = [int(p["fecha"][-4:]) for p in j.get("partidos", []) if p["fecha"][-4:].isdigit()]
        ultimo_juv = max(juv_p, key=lambda x: (x[0]["fecha"][-4:], x[0]["fecha"][3:5], x[0]["fecha"][:2]))[1] if juv_p else ""
        r = ps[ps.player_id.isin(pids)]
        pj_ps = int(r.partido_id.nunique())
        ultimo_ps = int(r.anio.max()) if pj_ps else None
        cats_ps = ", ".join(sorted(set(r.categoria))) if pj_ps else ""
        fich = sorted({int(a) for a, c in j.get("fichajes", []) if "LOS 50" in c.upper()})
        otros = sorted({c for a, c in j.get("fichajes", []) if "LOS 50" not in c.upper()})
        ult_fich = int(j["ultimo_fichaje"]) if j["ultimo_fichaje"].isdigit() else (max(fich) if fich else None)
        ultimo_jugado = max([ultimo_ps or 0] + todos_anios) or None
        camada = nac.year if pd.notna(nac) else None

        if ultimo_ps == ANIO_ACTUAL:
            estado = "Activo"
        elif pj_ps > 0:
            estado = "Dejó plantel superior"
        elif camada and camada >= ANIO_ACTUAL - 19 and (max(anios_juv) if anios_juv else 0) >= ANIO_ACTUAL - 1:
            estado = "Sube el año que viene"
        elif juv_p:
            estado = "No subió"
        else:
            estado = "Fichado, sin partidos cargados"

        filas.append({
            "Camada": camada, "Jugador": j["jugador"], "Edad": (ANIO_ACTUAL - camada) if camada else None,
            "Posición": re.sub(r"^\d+\s*-\s*", "", j["posicion"]) if j["posicion"] and "no esp" not in j["posicion"] else "",
            "Estado": estado, "Último fichaje": ult_fich, "Fichado en Los 50": ", ".join(map(str, fich)) if fich else "",
            "Último año jugado": ultimo_jugado, "Años sin jugar": (ANIO_ACTUAL - ultimo_jugado) if ultimo_jugado else None,
            "PJ juveniles (2017+)": len(juv_p), "Última categoría juvenil": ultimo_juv,
            "Años en juveniles": ", ".join(map(str, sorted(set(anios_juv)))),
            "PJ plantel superior": pj_ps, "Último año plantel superior": ultimo_ps,
            "Categorías plantel superior": cats_ps,
            "Otros clubes": ", ".join(otros),
            "Registros en la UAR": len(j.get("ids", [1])),
            "¿Lo llamaron?": "", "¿Quién llamó?": "", "Respuesta": "", "¿Vuelve?": "", "Notas": "",
        })
    df = pd.DataFrame(filas)
    orden_estado = {"No subió": 0, "Dejó plantel superior": 1, "Fichado, sin partidos cargados": 2, "Sube el año que viene": 3, "Activo": 4}
    df = df.sort_values(["Camada", "Estado", "Jugador"], key=lambda c: c.map(orden_estado) if c.name == "Estado" else c)
    escribir(df)
    print(f"Listo: {DESTINO}")
    print(df.pivot_table(index="Camada", columns="Estado", values="Jugador", aggfunc="count", fill_value=0).to_string())


COLORES = {"No subió": "F8D7DA", "Dejó plantel superior": "FFE5CC", "Fichado, sin partidos cargados": "ECECEC",
           "Sube el año que viene": "D6E4FF", "Activo": "D4EDDA"}


def escribir(df):
    para_llamar = df[df.Estado != "Activo"]
    resumen = df.pivot_table(index="Camada", columns="Estado", values="Jugador", aggfunc="count", fill_value=0)
    resumen = resumen[[c for c in COLORES if c in resumen.columns]]
    resumen["Total"] = resumen.sum(axis=1)
    leeme = pd.DataFrame({"Cómo leer esta planilla": [
        "Jugadores fichados en Los 50 nacidos entre 1999 y 2007 (fuente: base de datos de la UAR). PRIVADO: no compartir fuera del club.",
        "No subió: jugó juveniles pero nunca jugó en plantel superior (Primera, Intermedia o Pre-Intermedia).",
        f"Dejó plantel superior: jugó en plantel superior, pero no en {ANIO_ACTUAL}.",
        "Sube el año que viene: todavía en edad de juveniles (camada 2007) y jugó juveniles este año o el anterior.",
        "Fichado, sin partidos cargados: estuvo fichado en el club pero no tiene partidos cargados en el sistema (puede haber entrenado sin jugar, o jugado antes de 2017).",
        f"Activo: jugó en plantel superior en {ANIO_ACTUAL} (está en la hoja 'Todos', no en 'Para llamar').",
        "Los partidos de juveniles están cargados en el sistema desde 2017: para las camadas 1999-2000 puede faltar historia.",
        "Las columnas grises de la derecha (¿Lo llamaron?, Respuesta, etc.) son para completar a mano.",
        "No incluye a quienes hoy están fichados en otro club (el sistema los muestra con su club actual).",
    ]})
    with pd.ExcelWriter(DESTINO, engine="openpyxl") as xw:
        para_llamar.to_excel(xw, sheet_name="Para llamar", index=False)
        resumen.reset_index().to_excel(xw, sheet_name="Resumen por camada", index=False)
        df.to_excel(xw, sheet_name="Todos", index=False)
        leeme.to_excel(xw, sheet_name="Cómo leer", index=False)
        borde = Border(bottom=Side(style="thin", color="E2E6EE"))
        for ws in xw.book.worksheets:
            ws.freeze_panes = "C2" if ws.title in ("Para llamar", "Todos") else "A2"
            ws.auto_filter.ref = ws.dimensions
            ws.sheet_view.showGridLines = False
            hdr = [c.value for c in ws[1]]
            for c in ws[1]:
                manual = c.value in ("¿Lo llamaron?", "¿Quién llamó?", "Respuesta", "¿Vuelve?", "Notas")
                c.font = Font(bold=True, color="0B0D12" if manual else "FFFFFF")
                c.fill = PatternFill("solid", fgColor="D9D9D9" if manual else "1F3864")
                c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            ws.row_dimensions[1].height = 34
            for col in ws.columns:
                w = max(len(str(c.value or "")) for c in col)
                ws.column_dimensions[col[0].column_letter].width = min(max(10, w + 2), 40 if ws.title != "Cómo leer" else 130)
            if "Estado" in hdr:
                ie = hdr.index("Estado") + 1
                for fila in ws.iter_rows(min_row=2):
                    for c in fila:
                        c.border = borde
                    e = fila[ie - 1].value
                    if e in COLORES:
                        fila[ie - 1].fill = PatternFill("solid", fgColor=COLORES[e])
                        fila[ie - 1].font = Font(bold=True)
                # listas desplegables en las columnas manuales
                for nombre, opciones in (("¿Lo llamaron?", '"Sí,No"'), ("¿Vuelve?", '"Sí,No,Tal vez"')):
                    if nombre in hdr:
                        col = ws.cell(1, hdr.index(nombre) + 1).column_letter
                        dv = DataValidation(type="list", formula1=opciones, allow_blank=True)
                        ws.add_data_validation(dv)
                        dv.add(f"{col}2:{col}{ws.max_row}")
            ws.sheet_properties.tabColor = {"Para llamar": "B42318", "Resumen por camada": "1F3864", "Todos": "1E7A3C"}.get(ws.title, "6B7280")


if __name__ == "__main__":
    main()
