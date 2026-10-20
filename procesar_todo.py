"""Ordena todo lo descargado por extraer_todo.py en una base de datos SQLite: datos_uar/los50.db

Uso:  python procesar_todo.py
Aplica las mismas correcciones confirmadas por el club que extraer_los50.py (patadas mal cargadas, registros duplicados, etc.).
La base está pensada para crecer: después se le pueden sumar tablas de mediciones físicas, gimnasio o nutrición
que se unen a 'jugadores' por player_id.
"""
import gzip
import json
import re
import sqlite3
import sys
from pathlib import Path

import pandas as pd
from bs4 import BeautifulSoup

sys.argv = sys.argv[:1] + ["todos"]  # extraer_los50 lee el año de los argumentos
import extraer_los50 as E  # noqa: E402  (parse_partido, correcciones, categorías)

HERE = Path(__file__).parent
DATOS = HERE / "datos_uar"
RAW, LIST = DATOS / "raw", DATOS / "listados"
DB = DATOS / "los50.db"
txt = lambda el: " ".join(el.get_text(" ").split()) if el else ""


def raw(tipo, clave):
    with gzip.open(RAW / tipo / f"{clave}.html.gz", "rt", encoding="utf-8") as f:
        return f.read()


def listado(nombre):
    f = LIST / f"{nombre}.jsonl"
    return [json.loads(l) for l in f.open(encoding="utf-8")] if f.exists() else []


def num(s):
    m = re.search(r"-?\d+", str(s or ""))
    return int(m.group()) if m else None


# ---------- categoría de cada torneo / partido ----------
def categoria(nombre, division):
    """Primera, Intermedia, Pre-Intermedia, M23, M19..M13, Infantiles, Seven, Femenino, Otra."""
    n, d = (nombre or "").lower(), (division or "").lower()
    if "femenin" in n + " " + d:
        return "Femenino"
    if "seven" in n or re.search(r"\b7s\b", n):
        return "Seven"
    m = re.search(r"(?:menores?(?: de)?|\bm)\s?-?(1[3-9]|2[0-3])\b", n) or re.search(r"(?:menores?(?: de)?|\bm)\s?-?(1[3-9]|2[0-3])\b", d)
    if m and m.group(1) != "23":
        return f"M{m.group(1)}"
    if re.search(r"infantil|\bm(?:[6-9]|1[0-2])\b|pre ?juvenil", n + " " + d):
        return "Infantiles"
    c = E.categoria_ps({"torneo_id": "", "torneo": nombre or "", "division": division or ""})
    return c if c and c != E.DUDOSO else ("Plantel superior (sin especificar)" if c == E.DUDOSO else "Otra")


def anio_de(*textos):
    for t in textos:
        m = re.search(r"\b(20[0-3]\d)\b", t or "")
        if m:
            return int(m.group(1))
    return None


# ---------- torneos y posiciones ----------
def torneos():
    filas, posic, rondas = [], [], []
    for f in listado("torneos_competencia") + listado("torneos_infantiles"):
        tid = next((re.search(r"/championships/view/(\d+)", l, re.I).group(1) for l in f["links"] if re.search(r"/championships/view/\d+", l, re.I)), None)
        if not tid or not (RAW / "torneo" / f"{tid}.html.gz").exists() or any(x["tid"] == tid for x in filas):
            continue
        h = raw("torneo", tid)
        cuerpo = txt(BeautifulSoup(h, "lxml").select_one(".content-wrapper"))
        g = lambda etq: (re.search(etq + r":\s*(.+?)\s+(?:Organizador|División|Categoría|Sexo|Estado|Listas|Control|Tipo|Minutos|Titulares|Suplentes|Requiere|Participantes)\b", cuerpo) or [None, None])[1]
        nombre, division = f["celdas"][0], f["celdas"][2] if len(f["celdas"]) > 2 else ""
        cat = E.CATEGORIA_MANUAL.get(tid) or categoria(nombre, division)
        filas.append({"tid": tid, "nombre": nombre, "organizador": f["celdas"][1], "division": division, "categoria": cat,
                      "anio": anio_de(nombre, division), "sexo": g("Sexo"), "estado": g("Estado"), "tipo_juego": g("Tipo de juego"),
                      "minutos_por_tiempo": num(g("Minutos por tiempo")), "titulares": num(g("Titulares")), "suplentes": num(g("Suplentes")),
                      "infantil": int(f in listado("torneos_infantiles"))})
        for fx in sorted(set(re.findall(r"/Fixtures/view/(\d+)", h, re.I))):
            if not (RAW / "ronda" / f"{fx}.html.gz").exists():
                continue
            hr = BeautifulSoup(raw("ronda", fx), "lxml")
            ronda = (re.search(r"Ronda:\s*(.+?)\s+Acciones", txt(hr.select_one(".content-wrapper"))) or [None, ""])[1]
            rondas.append({"fixture_id": fx, "tid": tid, "ronda": ronda})
            for t in hr.select(".content-wrapper table"):
                hdr = [txt(th) for th in t.find_all("th")]
                if "Equipo" in hdr and "Ptos" in hdr:
                    for i, tr in enumerate(t.select("tbody tr"), 1):
                        c = [txt(td) for td in tr.find_all("td")]
                        posic.append({"fixture_id": fx, "tid": tid, "posicion": i, **{h_: c[j] for j, h_ in enumerate(hdr) if j < len(c) and h_}})
    return pd.DataFrame(filas), pd.DataFrame(rondas), pd.DataFrame(posic)


# ---------- partidos ----------
def partidos(df_t):
    pt = json.loads((DATOS / "partidos_por_torneo.json").read_text(encoding="utf-8"))
    tor = {r.tid: r for r in df_t.itertuples()}
    amist = {}
    for f in listado("partidos_amistosos"):
        for l in f["links"]:
            m = re.search(r"/Matches/view/(\d+)", l, re.I)
            if m:
                amist[m.group(1)] = f["celdas"]
    mids = {m: t for t, ms in pt.items() for m in ms}
    for m in amist:
        mids.setdefault(m, None)
    P, I, J, A = [], [], [], []
    for mid, tid in mids.items():
        if not (RAW / "partido" / f"{mid}.html.gz").exists():
            continue
        html = raw("partido", mid)
        try:
            p, incid, plantel, asis = E.parse_partido(html, mid)
        except Exception as e:  # noqa: BLE001
            print("  no pude leer partido", mid, e)
            continue
        E.aplicar_correcciones(mid, incid, plantel)
        lado = "L" if E.es_los50(p["equipo_L"]) else "V" if E.es_los50(p["equipo_V"]) else None
        if lado is None:
            continue
        riv = "V" if lado == "L" else "L"
        soup = BeautifulSoup(html, "lxml")
        torneo_txt = txt(soup.select_one(".content-wrapper h3 a"))
        t = tor.get(tid)
        es_amistoso = tid is None or "amistoso" in torneo_txt.lower()
        if es_amistoso:
            torneo_txt = "Partido amistoso"
        division = amist[mid][2] if mid in amist else (t.division if t else "")
        cat = t.categoria if t else categoria(torneo_txt, division)
        anio = int(p["fecha"][-4:]) if p["fecha"] else (t.anio if t else None)
        pf, pc = p[f"score_{lado}"], p[f"score_{riv}"]
        jugado = p["estado"] in ("Cerrado", "Iniciado") and pf is not None and pc is not None
        P.append({"mid": mid, "tid": tid, "torneo": t.nombre if t else torneo_txt, "categoria": cat, "anio": anio, "fecha": p["fecha"],
                  "hora": p["hora"], "ronda": p["ronda"], "instancia": p["instancia"], "amistoso": int(es_amistoso),
                  "condicion": "Local" if lado == "L" else "Visitante", "rival": p[f"equipo_{riv}"], "estado": p["estado"],
                  "referee": p["referee"], "tantos_los50": pf, "tantos_rival": pc,
                  "resultado": ("G" if pf > pc else "E" if pf == pc else "P") if jugado else None,
                  "pts_tabla_los50": p[f"pts_tabla_{lado}"], "pts_tabla_rival": p[f"pts_tabla_{riv}"]})
        for l in ("L", "V"):
            for i in incid[l]:
                I.append({"mid": mid, "equipo": "Los 50" if l == lado else "Rival", **{k: i.get(k) for k in
                          ("tiempo", "minuto", "incidencia", "puntos", "dorsal", "jugador", "player_id", "detalle", "sancion")}})
            for j in plantel[l]:
                J.append({"mid": mid, "equipo": "Los 50" if l == lado else "Rival", **{k: j.get(k) for k in ("orden", "dorsal", "jugador", "player_id", "pos")}})
            for pid, estado in asis[l].items():
                A.append({"mid": mid, "equipo": "Los 50" if l == lado else "Rival", "player_id": pid, "asistencia": estado})
    return pd.DataFrame(P), pd.DataFrame(I), pd.DataFrame(J), pd.DataFrame(A)


# ---------- jugadores ----------
def medida(soup, etiqueta, escala, minimo, maximo):
    """'1.84' / '1,84' / '184' -> 184 (altura, escala 100); '85' -> 85 (peso). Fuera de rango = None."""
    p = soup.find("p", string=re.compile(r"^\s*" + etiqueta + r":"))
    p = p or next((x for x in soup.find_all("p") if x.get_text(strip=True).startswith(etiqueta + ":")), None)
    m = re.search(r"\d+(?:[.,]\d+)?", txt(p.find("strong")) if p and p.find("strong") else "")
    if not m:
        return None
    v = float(m.group().replace(",", "."))
    v = v * escala if v < 3 else v  # altura en metros
    return round(v, 1) if minimo <= v <= maximo else None


def jugadores():
    filas, fich = [], []
    for f in listado("jugadores"):
        pid = next((re.search(r"/players/view/(\d+)", l, re.I).group(1) for l in f["links"] if re.search(r"/players/view/\d+", l, re.I)), None)
        if not pid:
            continue
        c = f["celdas"]
        fila = {"player_id": pid, "player_id_unificado": E.UNIFICAR_IDS.get(pid, pid), "jugador": E.NOMBRES.get(c[3], c[3]),
                "nacimiento": c[4], "categoria_uar": c[5], "posicion": c[6], "ultimo_fichaje": num(c[7])}
        if (RAW / "jugador" / f"{pid}.html.gz").exists():
            soup = BeautifulSoup(raw("jugador", pid), "lxml")
            cuerpo = txt(soup.select_one(".content-wrapper"))
            for etq, k in (("Pos. alternativa", "pos_alt"), ("Pos. alternativa 2", "pos_alt2"), ("Nacionalidad", "nacionalidad")):
                m = re.search(re.escape(etq) + r":\s*(.+?)\s+(?:Pos\.|Edad|Categoría|Unión|×|Modificar|$)", cuerpo)
                fila[k] = m.group(1) if m else None
            # peso y altura de la ficha (un solo valor, sin fecha). Los demás datos médicos no se guardan.
            fila["altura_cm"], fila["peso_kg"] = medida(soup, "Altura", 100, 120, 215), medida(soup, "Peso", 1, 30, 170)
            for t in soup.select(".content-wrapper table"):
                hdr = [txt(th) for th in t.find_all("th")]
                if "Año" in hdr and "Club" in hdr:
                    for tr in t.select("tbody tr"):
                        r = [txt(td) for td in tr.find_all("td")]
                        if len(r) > hdr.index("Club"):
                            fich.append({"player_id": pid, "fecha": r[0], "anio": num(r[hdr.index("Año")]), "club": r[hdr.index("Club")],
                                         "competitivo": r[hdr.index("Competitivo")] if "Competitivo" in hdr else None})
        filas.append(fila)
    return pd.DataFrame(filas), pd.DataFrame(fich).drop_duplicates()


def listado_df(nombre, sin=("Acciones", "")):
    filas = listado(nombre)
    if not filas:
        return pd.DataFrame()
    hdr = filas[0]["encabezados"]
    out = []
    for f in filas:
        d = {h: (f["celdas"][i] if i < len(f["celdas"]) else None) for i, h in enumerate(hdr) if h not in sin}
        d.pop("Documento", None)
        d.pop("N° Documento", None)
        out.append(d)
    return pd.DataFrame(out)


def main():
    df_t, df_r, df_pos = torneos()
    print(f"torneos {len(df_t)} | rondas {len(df_r)} | filas de posiciones {len(df_pos)}")
    df_p, df_i, df_j, df_a = partidos(df_t)
    print(f"partidos {len(df_p)} | incidencias {len(df_i)} | planteles {len(df_j)} | asistencia {len(df_a)}")
    df_jug, df_fich = jugadores()
    print(f"jugadores {len(df_jug)} | fichajes {len(df_fich)}")
    extra = {k: listado_df(k) for k in ("tarjetas", "ranking_amonestados", "sanciones", "conmociones", "pases_internacionales", "entrenadores")}
    if DB.exists():
        DB.unlink()
    with sqlite3.connect(DB) as con:
        for nombre, df in [("torneos", df_t), ("rondas", df_r), ("posiciones", df_pos), ("partidos", df_p), ("incidencias", df_i),
                           ("planteles", df_j), ("asistencia", df_a), ("jugadores", df_jug), ("fichajes", df_fich), *extra.items()]:
            if not df.empty:
                df.to_sql(nombre, con, index=False)
    print(f"Listo: {DB}")
    print(df_p[df_p.resultado.notna()].pivot_table(index="anio", columns="categoria", values="mid", aggfunc="count", fill_value=0).to_string())


if __name__ == "__main__":
    main()
