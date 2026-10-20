"""Arma el Excel de datos de DIARIOS (El Eco de Tandil, 2008-2016), separado de los datos oficiales de la UAR.

Uso:  python diarios/armar_excel_diarios.py
Lee diarios/extraido/2008-2016_*.json y escribe Los50_Diarios_2008-2016.xlsx
"""
import difflib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import timedelta
from pathlib import Path

import pandas as pd
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

HERE = Path(__file__).parent
BASE = HERE.parent
DESTINO = BASE / "Los50_Diarios_2008-2016.xlsx"
VALOR = {"try": 5, "try penal": 7, "conversion": 2, "penal": 3, "drop": 3}
CATS = ["Primera", "Intermedia", "Pre-Intermedia", "Juveniles", "Seven", "Desconocida"]
PLANTEL_SUPERIOR = {"Primera", "Intermedia", "Pre-Intermedia"}
STOP = {"de", "del", "la", "los", "rc", "club", "rugby", "mdp", "bb", "mar", "plata", "el", "y"}


def sin_acentos(s):
    return unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()


def toks(s):
    return [t for t in re.sub(r"[^a-z ]", " ", sin_acentos(s).lower()).split() if len(t) > 1 and t not in STOP]


# Errores de escritura del diario confirmados (mismo jugador, apellido mal escrito)
ALIAS_NOMBRES = {
    "Nicolás Difonso": "Di Fonzo, Nicolás",
    "Di Fonzo": "Di Fonzo, Nicolás",
    "Juan Di Fonzo": "Di Fonzo, Nicolás",  # confirmado por el club: es Nicolás
    "Laureano Salagoyti": "Salagoity, Laureano",
    "Matías Arnatou": "Santiago Arnautou",  # confirmado por el club: son todos Santiago
    "Arnatdux": "Santiago Arnautou",
    "Joaquín Fagonte": "Fagonde, Joaquin",
    "Juan Zugby": "Zugbi, Juan Pedro",
    "José Giménez": "Jiménez, Jose",
    "Marcos Phillips": "Philip, Marcos",
    "I. González": "González, Nicolás",  # el try figura como "I. González"; en la formación está Nicolás González
}


def limpiar_nombre(n):
    n = re.sub(r"\(.*?\)", "", str(n or "")).strip(" .,-")
    n = re.sub(r"\s+", " ", n)
    n = " ".join(w if not w.islower() and not w.isupper() else w.capitalize() for w in n.split())
    return ALIAS_NOMBRES.get(n, n)


# ---------- 1. leer y unificar partidos ----------
def leer():
    menciones = []
    for f in sorted((HERE / "extraido").glob("2008-2016_*.json")):
        for nota in json.loads(f.read_text(encoding="utf-8")):
            for p in nota.get("partidos") or []:
                fn = pd.to_datetime(nota["fecha_nota"], errors="coerce")
                fp = pd.to_datetime(p.get("fecha_partido"), errors="coerce")
                if pd.isna(fp) and pd.notna(fn):
                    fp = fn - timedelta(days=1)
                cat = p.get("categoria") if p.get("categoria") in CATS else "Desconocida"
                menciones.append({**p, "categoria": cat, "f": fp, "url": nota["url"], "fecha_nota": nota["fecha_nota"],
                                  "con_fecha": bool(p.get("fecha_partido"))})
    return menciones


def rival_key(s):
    t = [x for x in re.sub(r"[^a-z ]", " ", sin_acentos(s).lower()).split() if x not in {"de", "del", "la", "club", "rc", "rugby", "el", "y", "a", "b"}]
    propio = [x for x in t if x not in {"mar", "plata", "mdp", "bb", "bahia", "blanca"}]
    return set(propio or t)


def resultado_compatible(m, g):
    """Mismo partido: resultado igual, al revés (error de la nota) o sin resultado en alguna."""
    a = (m.get("tantos_los50"), m.get("tantos_rival"))
    for x in g:
        b = (x.get("tantos_los50"), x.get("tantos_rival"))
        if None in a or None in b or a == b or a == b[::-1]:
            return True
    return False


def mismo_resultado(m, g):
    a = (m.get("tantos_los50"), m.get("tantos_rival"))
    return None not in a and any(a in ((x.get("tantos_los50"), x.get("tantos_rival")), (x.get("tantos_rival"), x.get("tantos_los50"))) for x in g)


def unificar(menciones):
    grupos = []
    # 1) menciones con fecha del partido (dicha o deducida por la nota)
    for m in sorted((m for m in menciones if m["con_fecha"]), key=lambda m: m["f"]):
        destino = None
        for g in grupos:
            r = g[0]
            if not (rival_key(m.get("rival")) & rival_key(r.get("rival"))):
                continue
            dias = abs((m["f"] - r["f"]).days)
            misma_cat = m["categoria"] == r["categoria"] and not m.get("categoria_inferida") and not r.get("categoria_inferida")
            # mismo día, misma categoría y rival = mismo partido aunque las notas den resultados distintos
            if dias > 3 or not (resultado_compatible(m, g) or (dias <= 1 and misma_cat)):
                continue
            if m["categoria"] == r["categoria"] or "Desconocida" in (m["categoria"], r["categoria"]):
                destino = g
                break
            # categoría supuesta: solo se une si el resultado coincide (no mezclar Primera con Intermedia del mismo día)
            if (m.get("categoria_inferida") or r.get("categoria_inferida")) and mismo_resultado(m, g):
                destino = g
                break
        (destino.append(m) if destino else grupos.append([m]))
    # 2) resultados recordados en otras notas sin fecha: se suman al partido original si coincide rival y resultado
    for m in (m for m in menciones if not m["con_fecha"]):
        fn = pd.to_datetime(m["fecha_nota"])
        cand = [g for g in grupos if rival_key(m.get("rival")) & rival_key(g[0].get("rival")) and mismo_resultado(m, g)
                and pd.Timedelta(0) <= fn - g[0]["f"] <= pd.Timedelta(days=730)]
        if cand:
            max(cand, key=lambda g: g[0]["f"]).append(m)
        elif m.get("tantos_los50") is not None:
            grupos.append([{**m, "fecha_desconocida": True}])
    partidos = []
    for g in grupos:
        fechas = Counter(x["f"] for x in g if x.get("fecha_partido"))
        f = fechas.most_common(1)[0][0] if fechas else g[0]["f"]
        cats = [x["categoria"] for x in g if not x.get("categoria_inferida") and x["categoria"] != "Desconocida"]
        cat = Counter(cats).most_common(1)[0][0] if cats else Counter(x["categoria"] for x in g).most_common(1)[0][0]
        res = Counter((x.get("tantos_los50"), x.get("tantos_rival")) for x in g if x.get("tantos_los50") is not None and x.get("tantos_rival") is not None)
        tl, tr = res.most_common(1)[0][0] if res else (None, None)
        con_puntos = [x for x in g if x.get("puntos")]
        mejor = max(con_puntos, key=lambda x: (bool(x.get("puntos_completos")), sum(int(q.get("cantidad") or 1) for q in x["puntos"]))) if con_puntos else None
        con_form = [x for x in g if x.get("formacion")]
        form = max(con_form, key=lambda x: len(x["formacion"])) if con_form else None
        moda = lambda k: (Counter(x.get(k) for x in g if x.get(k)).most_common(1) or [(None, 0)])[0][0]
        partidos.append({
            "fecha": f, "fecha_desconocida": all(x.get("fecha_desconocida") for x in g), "categoria": cat, "categoria_inferida": not cats, "torneo": moda("torneo"), "instancia": moda("instancia"),
            "rival": Counter(x.get("rival") for x in g if x.get("rival")).most_common(1)[0][0] if any(x.get("rival") for x in g) else None,
            "condicion": moda("condicion"), "tl": tl, "tr": tr, "resultados_distintos": len(res) > 1,
            "puntos": (mejor or {}).get("puntos") or [], "puntos_completos": bool(mejor and mejor.get("puntos_completos")),
            "tarjetas": (mejor or g[0]).get("tarjetas") or [],
            "formacion": (form or {}).get("formacion") or [], "ingresaron": (form or {}).get("ingresaron") or [],
            "fuentes": list(dict.fromkeys(x["url"] for x in g)),
            "fuente_puntos": (mejor or {}).get("url"), "notas": "; ".join(dict.fromkeys(x["nota"] for x in g if x.get("nota"))),
        })
    return [p for p in partidos if pd.notna(p["fecha"]) and 2008 <= p["fecha"].year <= 2016 and p["categoria"] in PLANTEL_SUPERIOR]


# ---------- 2. nombres de jugadores ----------
PARTICULAS = {"di", "de", "del", "da", "la", "van", "von", "dos", "mac"}


def nk(s):
    return re.sub(r"[^a-z]", "", sin_acentos(s).lower())


def _primero(tokens):
    """Primer nombre de pila escrito completo (no una inicial)."""
    for x in tokens:
        x = x.strip(".")
        if len(nk(x)) > 2 and not (x.isupper() and len(x) <= 3):
            return nk(x)
    return None


def partir(n, apellidos_uar):
    """'Nombre Apellido' / 'Apellido, Nombre' / 'J. M. Apellido' -> (iniciales de nombres, apellido)."""
    n = limpiar_nombre(n)
    if "," in n:
        ap, _, no = n.partition(",")
        nombres = [x for x in re.split(r"[\s.]+", no) if nk(x)]
        return [nk(x)[:1] for x in nombres], ap.strip(), next((nk(x) for x in nombres if len(nk(x)) > 2), None)
    t = [x for x in re.split(r"\s+", n.replace(".", ". ")) if x.strip(". ")]
    if len(t) == 1:
        return [], t[0], None
    # apellido compuesto conocido en la UAR (ej. "Pérez Diez", "Di Fonzo")
    for k in (3, 2):
        if len(t) > k and any(difflib.SequenceMatcher(None, nk(" ".join(t[-k:])), a).ratio() >= .86 for a in apellidos_uar if len(a) > 5):
            return [nk(x)[:1] for x in t[:-k]], " ".join(t[-k:]), _primero(t[:-k])
    i = len(t) - 1
    while i > 1 and nk(t[i - 1]) in PARTICULAS:
        i -= 1
    ini = []
    for x in t[:i]:
        x = x.strip(".")
        ini += [c.lower() for c in x] if (x.isupper() and len(x) <= 3) or (len(x) == 2 and x[1].islower() and x.lower() in ("jm", "jp", "jc")) else [nk(x)[:1]]
    return [c for c in ini if c], " ".join(t[i:]), _primero(t[:i])


def roster_uar():
    try:
        j = pd.read_excel(BASE / "Los50_PlantelSuperior_historico.xlsx", sheet_name="Planteles por partido", usecols=["jugador"])
        return sorted(set(j.jugador.dropna()))
    except Exception:
        return []


def armar_nombres(todos):
    """Devuelve dict nombre_crudo -> nombre_canonico ("Apellido, Nombre" si está en la UAR).
    Regla: apellido parecido y, si el diario da el nombre completo, nombre parecido; si da solo inicial, misma inicial."""
    uar = roster_uar()
    uar_p = {u: (partir(u, [])[0], partir(u, [])[1], [nk(x) for x in u.partition(",")[2].split()]) for u in uar}  # (iniciales, apellido, nombres)
    apellidos_uar = {nk(a) for _, a, _ in uar_p.values()}
    crudos = Counter(limpiar_nombre(n) for n in todos if n and limpiar_nombre(n))
    info = {n: partir(n, apellidos_uar) for n in crudos}
    parecido = lambda a, b: bool(a) and bool(b) and (a == b or (len(a) > 3 and difflib.SequenceMatcher(None, a, b).ratio() >= .86))

    def compatible(ini, ap, pn, ini2, ap2, nombres2, pn2=None):
        ap_ok = parecido(nk(ap), nk(ap2)) or nk(ap) == nk(ap2.split()[0]) or nk(ap2) == nk(ap.split()[0])
        if not ap_ok or not ini or not ini2:
            return False
        if pn and (nombres2 or pn2):
            return any(parecido(pn, x) for x in (nombres2 or [pn2]))
        return ini[0] == ini2[0]  # solo inicial: tiene que ser la del primer nombre

    canon = {}
    # a) contra la UAR
    for n, (ini, ap, pn) in info.items():
        c = [u for u, (ui, ua, un) in uar_p.items() if compatible(ini, ap, pn, ui, ua, un)]
        if len(c) > 1:
            exacto = [u for u in c if nk(uar_p[u][1]) == nk(ap)]
            c = exacto if len(exacto) == 1 else c
        if len(set(c)) == 1:
            canon[n] = c[0]
    # b) el resto: agrupar con nombres ya resueltos o entre sí (primero los nombres completos)
    grupos = [{"ini": info[n][0], "ap": info[n][1], "pn": info[n][2], "nombre": c} for n, c in canon.items()]
    for n in sorted((n for n in crudos if n not in canon and info[n][0]), key=lambda n: (info[n][2] is None, -len(n))):
        ini, ap, pn = info[n]
        g = [g for g in grupos if compatible(ini, ap, pn, g["ini"], g["ap"], [], g["pn"])]
        if len({x["nombre"] for x in g}) == 1:
            canon[n] = g[0]["nombre"]
        else:
            grupos.append({"ini": ini, "ap": ap, "pn": pn, "nombre": n})
            canon[n] = n
    # c) solo apellido -> si hay un único jugador con ese apellido
    for n, (ini, ap, pn) in info.items():
        if ini:
            continue
        ops = {c for m, c in canon.items() if info.get(m, ([], "", None))[0] and parecido(nk(info[m][1]), nk(ap))}
        canon[n] = ops.pop() if len(ops) == 1 else n
    return canon, set(uar)


# ---------- 3. Excel ----------
def estilo(ws, color="1F3864"):
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=color)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 32
    for col in ws.columns:
        w = max(len(str(c.value or "")) for c in list(col)[:400])
        ws.column_dimensions[col[0].column_letter].width = min(max(9, w + 2), 48)
    ws.sheet_view.showGridLines = False
    borde = Border(bottom=Side(style="thin", color="E2E6EE"))
    for fila in ws.iter_rows(min_row=2):
        for c in fila:
            c.border = borde


def fecha_txt(p):
    return "sin fecha (nota del " + (p["fecha"] + timedelta(days=1)).strftime("%d/%m/%Y") + ")" if p["fecha_desconocida"] else p["fecha"].strftime("%d/%m/%Y")


def main():
    menciones = leer()
    partidos = unificar(menciones)
    todos = [q.get("jugador") for p in partidos for q in p["puntos"]] + [n for p in partidos for n in p["formacion"] + p["ingresaron"]] \
        + [q.get("jugador") for p in partidos for q in p["tarjetas"]]
    canon, uar = armar_nombres(todos)
    nom = lambda n: canon.get(limpiar_nombre(n), limpiar_nombre(n))

    # hoja Partidos
    filas_p, filas_d, filas_f = [], [], []
    for p in sorted(partidos, key=lambda p: p["fecha"]):
        res = "" if p["tl"] is None else ("G" if p["tl"] > p["tr"] else "E" if p["tl"] == p["tr"] else "P")
        det = "Completo" if p["puntos_completos"] else ("Parcial" if p["puntos"] else "Sin detalle")
        filas_p.append({
            "Año": p["fecha"].year, "Fecha": fecha_txt(p), "Categoría": p["categoria"] + (" (supuesta)" if p["categoria_inferida"] else ""),
            "Torneo": p["torneo"], "Instancia": p["instancia"], "Rival": p["rival"], "Local/Visitante": p["condicion"],
            "Los 50": p["tl"], "Rival tantos": p["tr"], "Resultado": res, "Quién anotó": det,
            "Formación": "Sí" if p["formacion"] else "No",
            "Observaciones": "; ".join(x for x in ["las notas dan resultados distintos" if p["resultados_distintos"] else "", p["notas"]] if x),
            "Fuente": p["fuentes"][0], "Otras fuentes": " ".join(p["fuentes"][1:]),
        })
        for q in p["puntos"]:
            tipo = str(q.get("tipo", "")).lower()
            if tipo not in VALOR or not q.get("jugador"):
                continue
            filas_d.append({"Año": p["fecha"].year, "Fecha": fecha_txt(p), "Categoría": p["categoria"], "Rival": p["rival"], "Torneo": p["torneo"],
                            "Jugador": nom(q["jugador"]), "Tipo": tipo, "Cantidad": int(q.get("cantidad") or 1), "Fuente": p["fuente_puntos"]})
        for i, n in enumerate(p["formacion"]):
            filas_f.append({"Año": p["fecha"].year, "Fecha": fecha_txt(p), "Categoría": p["categoria"], "Rival": p["rival"], "Torneo": p["torneo"],
                            "Jugador": nom(n), "Rol": "Titular", "Fuente": p["fuentes"][0]})
        for n in p["ingresaron"]:
            filas_f.append({"Año": p["fecha"].year, "Fecha": fecha_txt(p), "Categoría": p["categoria"], "Rival": p["rival"], "Torneo": p["torneo"],
                            "Jugador": nom(n), "Rol": "Ingresó", "Fuente": p["fuentes"][0]})
    dp, dd, df = pd.DataFrame(filas_p), pd.DataFrame(filas_d), pd.DataFrame(filas_f)

    # tryman y pateadores
    def tabla_puntos(keys):
        if dd.empty:
            return pd.DataFrame()
        t = dd.assign(pts=dd.Tipo.map(VALOR) * dd.Cantidad)
        piv = t.pivot_table(index=keys, columns="Tipo", values="Cantidad", aggfunc="sum", fill_value=0)
        piv["Tries"] = piv.get("try", 0) + piv.get("try penal", 0)
        out = pd.DataFrame({"Tries": piv["Tries"], "Conversiones": piv.get("conversion", 0), "Penales": piv.get("penal", 0),
                            "Drops": piv.get("drop", 0)}, index=piv.index)
        out["Puntos"] = t.groupby(keys).pts.sum()
        out["Partidos en que anotó"] = t.groupby(keys).apply(lambda g: g[["Fecha", "Rival"]].drop_duplicates().shape[0])
        return out.reset_index()

    tot = tabla_puntos(["Categoría", "Jugador"])
    if not tot.empty:
        anios = dd.groupby("Jugador").Año.agg(lambda a: ", ".join(map(str, sorted(set(a)))))
        tot.insert(2, "Años", tot.Jugador.map(anios))
        tot["Después en la UAR (2017+)"] = tot.Jugador.map(lambda j: "Sí" if j in uar else "")
        tot = tot.sort_values(["Categoría", "Tries", "Puntos"], ascending=[True, False, False])
    por_anio = tabla_puntos(["Año", "Categoría", "Jugador"])
    if not por_anio.empty:
        por_anio = por_anio.sort_values(["Año", "Categoría", "Tries", "Puntos"], ascending=[False, True, False, False])
    form = df.groupby(["Categoría", "Jugador"]).agg(Titular=("Rol", lambda r: (r == "Titular").sum()), Ingresó=("Rol", lambda r: (r == "Ingresó").sum()),
                                                    Años=("Año", lambda a: ", ".join(map(str, sorted(set(a)))))).reset_index() if not df.empty else pd.DataFrame()
    if not form.empty:
        form["Apariciones en formaciones publicadas"] = form.Titular + form.Ingresó
        form = form.sort_values(["Categoría", "Apariciones en formaciones publicadas"], ascending=[True, False])

    cob = dp.assign(det=dp["Quién anotó"] != "Sin detalle", con_form=dp["Formación"] == "Sí",
                    cat=dp["Categoría"].str.replace(" (supuesta)", "", regex=False))
    cobertura = cob.pivot_table(index="Año", columns="cat", values="Fecha", aggfunc="count", fill_value=0)
    cobertura["Total partidos encontrados"] = cobertura.sum(axis=1)
    cobertura["Con quién anotó"] = cob.groupby("Año").det.sum()
    cobertura["Con formación"] = cob.groupby("Año").con_form.sum()
    cobertura = cobertura.reset_index()

    leeme = pd.DataFrame({"Información": [
        "DATOS DE DIARIOS — NO OFICIALES. No se mezclan con los datos de la base de la UAR.",
        "Fuente: notas de El Eco de Tandil (eleco.com.ar) entre 2008 y 2016, leídas una por una.",
        "No están todos los partidos: solo los que el diario publicó. En Primera aparecen la mayoría; Intermedia y Pre-Intermedia casi no.",
        "'Quién anotó' solo existe en algunos partidos. Los totales por jugador son PARCIALES (solo partidos con detalle).",
        "Las formaciones aparecen en pocos partidos: 'apariciones en formaciones publicadas' NO son partidos jugados.",
        "Prueba de confiabilidad (2017-2018, comparando con la UAR): resultados correctos 91%; de los tries/patadas que dice el diario, 86% correctos; formaciones 94%.",
        "Cada dato tiene el link a la nota original (columna Fuente) para poder verificarlo.",
        "'Categoría (supuesta)': la nota no decía la categoría y se asumió Primera.",
        "Nombres: el diario escribe al mismo jugador de varias formas (con inicial, sin acento, con errores). Se unificaron; "
        "si coincide con un jugador de la base UAR (2017+) se usa ese nombre ('Apellido, Nombre'). Puede haber homónimos (ej. padre e hijo).",
        "Solo plantel superior (Primera, Intermedia, Pre-Intermedia). No incluye juveniles ni sevens.",
    ]})

    with pd.ExcelWriter(DESTINO, engine="openpyxl") as xw:
        hojas = [("Léeme", leeme), ("Cobertura por año", cobertura), ("Tryman y pateadores", tot), ("Por año", por_anio),
                 ("Partidos", dp), ("Formaciones", form), ("Detalle de puntos", dd), ("Formaciones por partido", df)]
        for nombre, d in hojas:
            if not d.empty:
                d.to_excel(xw, sheet_name=nombre, index=False)
        for ws in xw.book.worksheets:
            estilo(ws, "7A4B00" if ws.title == "Léeme" else "1F3864")
            ws.sheet_properties.tabColor = "C98A00"  # pestañas doradas: datos de diario, no oficiales
            if ws.title == "Léeme":
                ws.column_dimensions["A"].width = 120
            for fila in ws.iter_rows(min_row=2):
                for c in fila:
                    if isinstance(c.value, str) and c.value.startswith("https://"):
                        c.hyperlink = c.value.split()[0]
                        c.font = Font(color="1B5FD1", underline="single")
    print(f"Listo: {DESTINO}")
    print(f"  menciones {len(menciones)} -> partidos {len(partidos)} | puntos {len(dd)} | formaciones {len(df)} | jugadores {dd.Jugador.nunique() if not dd.empty else 0}")
    print(cobertura.to_string(index=False))


if __name__ == "__main__":
    main()
