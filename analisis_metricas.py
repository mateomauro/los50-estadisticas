"""Métricas para entrenadores: ¿cada categoría mejora o empeora año a año? Lee datos_uar/los50.db.

Uso:  python analisis_metricas.py
Escribe Los50_Analisis_Entrenadores.xlsx (privado: incluye juveniles).
Solo partidos oficiales (sin amistosos ni sevens) con resultado cargado.
"""
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd
from openpyxl.formatting.rule import ColorScaleRule
from openpyxl.styles import Alignment, Font, PatternFill

import recomendaciones_expertos as R

HERE = Path(__file__).parent
DB = HERE / "datos_uar" / "los50.db"
DESTINO = HERE / "Los50_Analisis_Entrenadores.xlsx"
ORDEN = ["Primera", "Intermedia", "Pre-Intermedia", "M23", "M19", "M17", "M16", "M15", "M14", "M13"]
PS = {"Primera", "Intermedia", "Pre-Intermedia", "M23"}
PUNTOS = {"Try": 5, "Try penal": 7, "Conversión": 2, "Penal": 3, "Drop": 3}
# cuánto tiene que cambiar cada métrica para decir que mejoró o empeoró (menos que eso = "igual")
UMBRAL = {"% victorias": 10, "Diferencia por partido": 4, "PF por partido": 3, "PC por partido": 3, "Tries a favor por partido": 0.4,
          "Tries en contra por partido": 0.4, "% PC en 2º tiempo": 5, "Amarillas por partido": 0.15,
          "% victorias vs rivales de arriba": 10, "% marcamos primero": 10, "% conversiones": 8}
MENOS_ES_MEJOR = {"PC por partido", "Tries en contra por partido", "% PC en 2º tiempo", "Amarillas por partido"}


def cargar():
    con = sqlite3.connect(DB)
    q = lambda t: pd.read_sql(f"select * from {t}", con)
    d = {t: q(t) for t in ("partidos", "incidencias", "planteles", "torneos", "posiciones", "rondas", "jugadores")}
    try:
        d["asistencia"] = q("asistencia")
    except Exception:  # noqa: BLE001
        d["asistencia"] = pd.DataFrame(columns=["mid", "equipo", "player_id", "asistencia"])
    return d


def preparar(d):
    p = d["partidos"].copy()
    p = p[(p.amistoso == 0) & p.resultado.notna() & p.categoria.isin(ORDEN)].copy()
    p["dif"] = p.tantos_los50 - p.tantos_rival

    i = d["incidencias"]
    i = i[i.mid.isin(p.mid)].copy()
    i["pts"] = i.incidencia.map(PUNTOS).fillna(0)

    # ¿la planilla detalla todos los tantos? (si no, las métricas por jugador/tiempo de ese partido no se usan)
    suma = i[i.pts > 0].groupby(["mid", "equipo"]).pts.sum().unstack(fill_value=0)
    p["detalle_los50"] = p.mid.map(suma.get("Los 50", pd.Series(dtype=float))).fillna(0) == p.tantos_los50
    p["detalle_rival"] = p.mid.map(suma.get("Rival", pd.Series(dtype=float))).fillna(0) == p.tantos_rival
    p["f"] = pd.to_datetime(p.fecha, dayfirst=True, errors="coerce")

    # ¿quién marcó primero? (primer tanto del 1º tiempo; si los dos marcan en el mismo minuto, no se sabe)
    sc = i[(i.pts > 0) & (i.tiempo == "1T")].assign(m=lambda x: pd.to_numeric(x.minuto, errors="coerce")).sort_values(["mid", "m"])
    dos = sc.groupby("mid").head(2).groupby("mid")
    empate = dos.m.nunique().eq(1) & dos.equipo.nunique().eq(2)
    primero = sc.groupby("mid").equipo.first()
    p["marco_primero"] = p.mid.map(primero[~empate.reindex(primero.index, fill_value=False)])

    # nivel del rival: puesto en la tabla de la primera etapa de ese torneo (mitad de arriba / de abajo)
    pos = d["posiciones"].assign(pj=lambda x: pd.to_numeric(x["P.J."], errors="coerce"), fx=lambda x: x.fixture_id.astype(int))
    pos = pos[pos.pj > 0]
    rk = {}
    for tid, g in pos.groupby("tid"):
        g = g[g.fx == g.fx.min()].reset_index(drop=True)
        rk.update({(tid, e.upper().strip()): (k + 1) / len(g) for k, e in enumerate(g.Equipo)})
    r = pd.Series([rk.get((t, str(x).upper().strip())) for t, x in zip(p.tid, p.rival)], index=p.index)
    p["rival_arriba"] = np.where(r.isna(), None, np.where(r <= 0.5, "arriba", "abajo"))
    return p, i


def titulares(p, d):
    """Titulares de Los 50 (orden 1 a 15 en la planilla)."""
    pl = d["planteles"]
    pl = pl[(pl.equipo == "Los 50") & (pd.to_numeric(pl.orden, errors="coerce") <= 15)]
    return pl.merge(p[["mid", "categoria", "anio", "f"]], on="mid")


def jugaron(p, i, d):
    """Los que jugaron cada partido: titulares + suplentes con alguna incidencia (ingreso, try, tarjeta)."""
    pl = d["planteles"]
    pl = pl[pl.equipo == "Los 50"].merge(p[["mid", "categoria", "anio", "f"]], on="mid")
    ev = set(zip(i[i.equipo == "Los 50"].mid, i[i.equipo == "Los 50"].player_id))
    jugo = (pd.to_numeric(pl.orden, errors="coerce") <= 15).to_numpy() | np.array([(m, x) in ev for m, x in zip(pl.mid, pl.player_id)])
    return pl[jugo]


def nacimientos(d):
    j = d["jugadores"]
    return j.assign(nac=pd.to_datetime(j.nacimiento, dayfirst=True, errors="coerce")).groupby("player_id_unificado").nac.first()


def resumen(p, i, d):
    filas = []
    # titulares que repiten del partido anterior de la misma categoría
    rep_ = {}
    for _, g in titulares(p, d).sort_values("f").groupby(["categoria", "anio"]):
        prev = None
        for mid, gg in g.groupby("mid", sort=False):
            s_ = set(gg.player_id)
            if prev is not None:
                rep_[mid] = len(s_ & prev)
            prev = s_
    tar = d["incidencias"]
    # resultado al entretiempo (solo partidos con planilla completa)
    t1 = i[(i.tiempo == "1T") & (i.pts > 0)].groupby(["mid", "equipo"]).pts.sum().unstack(fill_value=0)
    p = p.assign(ht=p.mid.map(t1.get("Los 50", pd.Series(dtype=float)).sub(t1.get("Rival", pd.Series(dtype=float)), fill_value=0)).fillna(0))
    for (cat, anio), g in p.groupby(["categoria", "anio"]):
        n = len(g)
        det = g[g.detalle_los50 & g.detalle_rival]
        ii = i[i.mid.isin(det.mid)]
        tri = lambda eq: ii[(ii.equipo == eq) & ii.incidencia.isin(["Try", "Try penal"])].shape[0]
        tri_c = lambda eq: ii[(ii.equipo == eq) & (ii.incidencia == "Try")].shape[0]  # el try penal no se patea
        conv = lambda eq: ii[(ii.equipo == eq) & (ii.incidencia == "Conversión")].shape[0]
        pts = lambda eq, cond: ii[(ii.equipo == eq) & cond(ii)].pts.sum()
        pf2, pc2 = pts("Los 50", lambda x: x.tiempo == "2T"), pts("Rival", lambda x: x.tiempo == "2T")
        pfd, pcd = det.tantos_los50.sum(), det.tantos_rival.sum()
        t = tar[tar.mid.isin(g.mid) & (tar.equipo == "Los 50")]
        pl = d["planteles"]; pl = pl[pl.mid.isin(g.mid) & (pl.equipo == "Los 50")]
        bonus = (g.pts_tabla_los50.fillna(0) - g.resultado.map({"G": 4, "E": 2, "P": 0})).clip(lower=0)
        filas.append({
            "Categoría": cat, "Año": int(anio), "PJ": n, "G": (g.resultado == "G").sum(), "E": (g.resultado == "E").sum(),
            "P": (g.resultado == "P").sum(), "% victorias": round(100 * (g.resultado == "G").mean(), 1),
            "Puntos a favor": int(g.tantos_los50.sum()), "Puntos en contra": int(g.tantos_rival.sum()),
            "PF por partido": round(g.tantos_los50.mean(), 1), "PC por partido": round(g.tantos_rival.mean(), 1),
            "Diferencia por partido": round(g.dif.mean(), 1),
            "Ganados por 7 o menos": int(((g.dif > 0) & (g.dif <= 7)).sum()), "Perdidos por 7 o menos": int(((g.dif < 0) & (g.dif >= -7)).sum()),
            "Perdidos por más de 20": int((g.dif < -20).sum()),
            "Bonus (pts)": int(bonus.sum()),
            "Ganando al entretiempo": int((det.ht > 0).sum()),
            "Perdiendo al entretiempo": int((det.ht < 0).sum()),
            "Remontadas (perdíamos al ET y ganamos)": int(((det.ht < 0) & (det.resultado == "G")).sum()),
            "Nos lo dieron vuelta (ganábamos al ET y perdimos)": int(((det.ht > 0) & (det.resultado == "P")).sum()),
            "Tries a favor por partido": round(tri("Los 50") / len(det), 2) if len(det) else None,
            "Tries en contra por partido": round(tri("Rival") / len(det), 2) if len(det) else None,
            "% conversiones": pct(conv("Los 50"), tri_c("Los 50")) if conv("Los 50") else None,  # M13 a veces juega sin patear
            "% conversiones del rival": pct(conv("Rival"), tri_c("Rival")) if conv("Rival") else None,
            "% marcamos primero": pct((g.marco_primero == "Los 50").sum(), g.marco_primero.notna().sum()),
            "% victorias cuando marcamos primero": pct(((g.marco_primero == "Los 50") & (g.resultado == "G")).sum(), (g.marco_primero == "Los 50").sum()),
            "% victorias de local": pct(((g.condicion == "Local") & (g.resultado == "G")).sum(), (g.condicion == "Local").sum()),
            "% victorias de visitante": pct(((g.condicion == "Visitante") & (g.resultado == "G")).sum(), (g.condicion == "Visitante").sum()),
            "PJ vs rivales de arriba": int((g.rival_arriba == "arriba").sum()),
            "% victorias vs rivales de arriba": pct(((g.rival_arriba == "arriba") & (g.resultado == "G")).sum(), (g.rival_arriba == "arriba").sum()),
            "% victorias vs rivales de abajo": pct(((g.rival_arriba == "abajo") & (g.resultado == "G")).sum(), (g.rival_arriba == "abajo").sum()),
            "Titulares que repiten del partido anterior": round(pd.Series([rep_.get(m) for m in g.mid], dtype=float).mean(), 1),
            "% PF en 2º tiempo": round(100 * pf2 / pfd, 0) if pfd else None,
            "% PC en 2º tiempo": round(100 * pc2 / pcd, 0) if pcd else None,
            "Amarillas por partido": round((t.incidencia.str.contains("Amarilla", na=False)).sum() / n, 2),
            "Rojas": int((t.incidencia.str.contains("Roja", na=False)).sum()),
            "Jugadores convocados distintos": pl.player_id.nunique(),
            "% partidos con planilla completa": round(100 * len(det) / n, 0),
        })
    df = pd.DataFrame(filas)
    df["_o"] = df["Categoría"].map({c: k for k, c in enumerate(ORDEN)})
    return df.sort_values(["_o", "Año"]).drop(columns="_o")


def pct(a, b):
    return round(100 * a / b, 0) if b else None


def tendencias(res):
    """Última temporada contra el promedio de las 3 anteriores, métrica por métrica."""
    out = []
    for cat, g in res.groupby("Categoría", sort=False):
        g = g[g.PJ >= 5].sort_values("Año").set_index("Año")
        if len(g) < 2:
            continue
        ult, antes = g.index[-1], g.index[-4:-1]
        for k, umbral in UMBRAL.items():
            v, base = g.loc[ult, k], g.loc[antes, k].mean()
            if pd.isna(v) or pd.isna(base):
                continue
            cambio = (base - v) if k in MENOS_ES_MEJOR else (v - base)
            out.append({"Categoría": cat, "Métrica": k, f"Promedio {antes[0]}-{antes[-1]}" if len(antes) > 1 else f"{antes[0]}": round(base, 1),
                        "Última temporada": int(ult), "Valor última temporada": v,
                        "¿Cómo va?": "▲ Mejoró" if cambio >= umbral else "▼ Empeoró" if cambio <= -umbral else "= Igual"})
    df = pd.DataFrame(out)
    # las columnas de "promedio" tienen distinto nombre según la categoría: las junto en una sola
    prom = [c for c in df.columns if c.startswith("Promedio") or c.isdigit()]
    df.insert(2, "Promedio 3 temporadas anteriores", df[prom].bfill(axis=1).iloc[:, 0])
    return df.drop(columns=prom)


def semaforo(ten):
    """Una línea por categoría, en castellano simple."""
    filas = []
    for cat, g in ten.groupby("Categoría", sort=False):
        mej = g[g["¿Cómo va?"].str.startswith("▲")].Métrica.tolist()
        emp = g[g["¿Cómo va?"].str.startswith("▼")].Métrica.tolist()
        estado = "🟢 Mejorando" if len(mej) >= len(emp) + 2 else "🔴 Empeorando" if len(emp) >= len(mej) + 2 else "🟡 Parecido"
        filas.append({"Categoría": cat, "Cómo viene": estado, "Temporada": int(g["Última temporada"].iloc[0]),
                      "Qué mejoró": ", ".join(mej) or "-", "Qué empeoró": ", ".join(emp) or "-"})
    return pd.DataFrame(filas)


def torneos_final(p, d):
    pos = d["posiciones"]
    out = []
    for tid, g in p.groupby("tid"):
        t = d["torneos"][d["torneos"].tid == tid]
        pp = pos[pos.tid == tid]
        fila = {"Año": int(g.anio.mode()[0]), "Categoría": g.categoria.iloc[0], "Torneo": g.torneo.iloc[0], "PJ": len(g),
                "G": (g.resultado == "G").sum(), "E": (g.resultado == "E").sum(), "P": (g.resultado == "P").sum(),
                "PF": int(g.tantos_los50.sum()), "PC": int(g.tantos_rival.sum())}
        # una tabla por ronda (primera etapa, zona campeonato, etc.); solo cuentan los equipos que jugaron esa ronda
        etapas = []
        rondas = d["rondas"].set_index("fixture_id").ronda
        for fx, t in sorted(pp.groupby("fixture_id"), key=lambda x: int(x[0])):
            t = t[pd.to_numeric(t["P.J."], errors="coerce").fillna(0) > 0].reset_index(drop=True)
            r = t.index[t.Equipo.str.upper().str.contains("LOS 50", na=False)]
            if len(r):
                etapas.append(f"{rondas.get(fx, '') or 'Tabla'}: {r[0] + 1}º de {len(t)}")
        fila["Posición en la tabla"] = " | ".join(etapas) or None
        out.append(fila)
    df = pd.DataFrame(out)
    df["_o"] = df["Categoría"].map({c: k for k, c in enumerate(ORDEN)})
    return df.sort_values(["Año", "_o"], ascending=[False, True]).drop(columns="_o")


def rivales(p):
    g = p.groupby(["Categoría" if "Categoría" in p else "categoria", "rival"])
    df = g.agg(PJ=("mid", "count"), G=("resultado", lambda r: (r == "G").sum()), E=("resultado", lambda r: (r == "E").sum()),
               P=("resultado", lambda r: (r == "P").sum()), PF=("tantos_los50", "sum"), PC=("tantos_rival", "sum")).reset_index()
    df["% victorias"] = (100 * df.G / df.PJ).round(0)
    df.columns = ["Categoría", "Rival", "PJ", "G", "E", "P", "PF", "PC", "% victorias"]
    df["_o"] = df["Categoría"].map({c: k for k, c in enumerate(ORDEN)})
    return df[df.PJ >= 3].sort_values(["_o", "PJ"], ascending=[True, False]).drop(columns="_o")


def retencion(p, d):
    """De los chicos que jugaron en cada categoría y año, ¿cuántos siguieron jugando en el club el año siguiente?"""
    pl = d["planteles"]
    pl = pl[(pl.equipo == "Los 50") & pl.player_id.notna()].merge(p[["mid", "categoria", "anio"]], on="mid")
    jugo = pl.groupby("player_id").anio.apply(set)
    ps_anios = pl[pl.categoria.isin(PS)].groupby("player_id").anio.apply(set)
    filas = []
    temporadas = sorted(int(a) for a in p.anio.dropna().unique())  # 2020 no hubo partidos (pandemia): de 2019 se pasa a 2021
    proximas = lambda a: [t for t in temporadas if t > a][:2]
    for (cat, anio), g in pl.groupby(["categoria", "anio"]):
        if anio >= temporadas[-1]:
            continue
        ids = set(g.player_id)
        sig = sum(1 for x in ids if proximas(anio)[0] in jugo.get(x, set()))
        fila = {"Categoría": cat, "Año": int(anio), "Jugadores": len(ids), "Siguen la temporada siguiente": sig,
                "% retención": round(100 * sig / len(ids), 0) if ids else None}
        if cat == "M19":
            sub = sum(1 for x in ids if ps_anios.get(x, set()) & set(proximas(anio)))
            fila["Pasaron a plantel superior (en 2 temporadas)"] = sub
            fila["% pasaje a plantel superior"] = round(100 * sub / len(ids), 0) if ids else None
        filas.append(fila)
    df = pd.DataFrame(filas)
    df["_o"] = df["Categoría"].map({c: k for k, c in enumerate(ORDEN)})
    return df.sort_values(["_o", "Año"]).drop(columns="_o")


def fisico(p, d):
    """Peso y altura de la ficha UAR de los que jugaron la última temporada (un solo dato por jugador, sin fecha)."""
    j = d["jugadores"]
    if "peso_kg" not in j:
        return pd.DataFrame(), pd.DataFrame()
    med = j.groupby("player_id_unificado")[["peso_kg", "altura_cm"]].first()
    ult = int(p.anio.max())
    pl = d["planteles"]
    pl = pl[pl.equipo == "Los 50"].merge(p[p.anio == ult][["mid", "categoria"]], on="mid")
    pl["n"] = pd.to_numeric(pl.dorsal, errors="coerce").where(pd.to_numeric(pl.orden, errors="coerce") <= 15)
    puesto = pl[pl.n <= 15].groupby("player_id").n.agg(lambda s: int(s.mode().iloc[0]))
    # la categoría de cada uno es donde más partidos jugó ese año
    cat = (pl.groupby(["player_id", "categoria"]).mid.nunique().reset_index().sort_values("mid")
           .drop_duplicates("player_id", keep="last").set_index("player_id").categoria)
    df = pd.DataFrame({"Jugador": pl.groupby("player_id").jugador.last(), "Categoría": cat,
                       "Partidos": pl.groupby("player_id").mid.nunique(), "Puesto habitual": puesto})
    df["Línea"] = df["Puesto habitual"].map(lambda x: None if pd.isna(x) else "Forward" if x <= 8 else "Back")
    df = df.join(med).rename(columns={"peso_kg": "Peso (kg)", "altura_cm": "Altura (cm)"})
    df["IMC"] = (df["Peso (kg)"] / (df["Altura (cm)"] / 100) ** 2).round(1)
    df["_o"] = df["Categoría"].map({c: k for k, c in enumerate(ORDEN)})
    df = df.sort_values(["_o", "Línea", "Jugador"]).drop(columns="_o")
    res = (df.groupby(["Categoría", "Línea"], sort=False)
           .agg(Jugadores=("Jugador", "count"), **{"Con peso cargado": ("Peso (kg)", "count"), "Peso promedio (kg)": ("Peso (kg)", "mean"),
                                                  "Altura promedio (cm)": ("Altura (cm)", "mean")}).round(1).reset_index())
    res.insert(0, "Temporada", ult)
    return res, df


def carga(p, i, d):
    """Cuántos partidos juega cada uno y cuántas veces jugó dos partidos con 2 días o menos de diferencia."""
    J = jugaron(p, i, d).sort_values("f").copy()
    J["edad"] = (J.f - J.player_id.map(nacimientos(d))).dt.days / 365.25
    J["dias"] = J.groupby("player_id").f.diff().dt.days
    J["cat_ant"] = J.groupby("player_id").categoria.shift()
    # en M13/M14 se juegan "encuentros" con varios partidos cortos el mismo día: eso no cuenta como doble
    dob = J[(J.dias <= 2) & ~((J.categoria == J.cat_ant) & J.categoria.isin(["M13", "M14"]))]
    por_anio = J.groupby(["player_id", "anio"]).agg(pj=("mid", "nunique"), edad=("edad", "min")).reset_index()
    res = []
    for a, g in J.groupby("anio"):
        dd, pa = dob[dob.anio == a], por_anio[por_anio.anio == a]
        res.append({"Año": int(a),
                    "Veces que alguien jugó 2 partidos el mismo día": int((dd.dias == 0).sum()),
                    "Menores de 19 que jugaron 2 partidos en 2 días o menos": dd[dd.edad < 19].player_id.nunique(),
                    "Veces (menores de 19)": int((dd.edad < 19).sum()),
                    "Partidos por jugador (promedio)": round(pa.pj.mean(), 1),
                    "Máximo de partidos de un jugador": int(pa.pj.max()),
                    "Menores de 19 con más de 25 partidos": int(((pa.edad < 19) & (pa.pj > 25)).sum())})
    nombres = J.groupby("player_id").jugador.last()
    lista = (dob[dob.edad < 19].assign(par=lambda x: x.cat_ant + " + " + x.categoria)
             .groupby(["anio", "player_id"]).agg(veces=("mid", "count"), combinaciones=("par", lambda s: ", ".join(sorted(set(s)))),
                                                 edad=("edad", "min")).reset_index())
    lista = lista.merge(por_anio[["player_id", "anio", "pj"]], on=["player_id", "anio"])
    lista.insert(1, "Jugador", lista.player_id.map(nombres))
    lista["edad"] = lista.edad.round(1)
    lista = lista.drop(columns="player_id").rename(columns={"anio": "Año", "veces": "Veces con 2 partidos en ≤2 días", "combinaciones": "Categorías",
                                                         "edad": "Edad", "pj": "Partidos en el año"})
    return pd.DataFrame(res).sort_values("Año", ascending=False), lista.sort_values(["Año", "Veces con 2 partidos en ≤2 días"], ascending=[False, False])


def edad_relativa(p, i, d):
    """¿Hay más chicos nacidos a principio de año? (efecto de la edad relativa)."""
    J = jugaron(p, i, d)
    J = J[J.categoria.isin(["M13", "M14", "M15", "M16", "M17", "M19", "Primera"])].drop_duplicates(["player_id", "categoria"])
    J["trim"] = J.player_id.map(nacimientos(d)).dt.quarter
    t = (100 * J.dropna(subset=["trim"]).groupby("categoria").trim.value_counts(normalize=True).unstack().fillna(0)).round(0)
    t.columns = ["Nacidos ene-mar %", "abr-jun %", "jul-sep %", "oct-dic %"][: len(t.columns)]
    t.insert(0, "Jugadores", J.dropna(subset=["trim"]).groupby("categoria").player_id.nunique())
    t = t.reset_index().rename(columns={"categoria": "Categoría"})
    t["_o"] = t["Categoría"].map({c: k for k, c in enumerate(ORDEN)})
    return t.sort_values("_o").drop(columns="_o")


def camino_primera(p, i, d):
    """Debuts en Primera, edad y experiencia del XV titular, y cuántos salieron de las juveniles del club."""
    nac = nacimientos(d)
    J = jugaron(p, i, d)
    juv = set(J[J.categoria.isin(["M15", "M16", "M17", "M19"])].player_id)
    prim = J[J.categoria == "Primera"]
    deb = prim.groupby("player_id").f.min()
    T = titulares(p, d)
    ps = T[T.categoria.isin(PS)].sort_values("f")
    ps = ps.assign(exp=ps.groupby("player_id").cumcount())
    xv = ps[ps.categoria == "Primera"].assign(edad=lambda x: (x.f - x.player_id.map(nac)).dt.days / 365.25)
    filas = []
    for a, g in prim.groupby("anio"):
        # los datos empiezan en 2017: en 2017-2018 todos parecen "debutantes", por eso desde 2019
        nuevos = [x for x, f in deb.items() if f.year == a] if a >= 2019 else []
        edades = [(deb[x] - nac.get(x)).days / 365.25 for x in nuevos if pd.notna(nac.get(x))]
        x = xv[xv.anio == a]
        filas.append({"Año": int(a), "Jugadores que jugaron en Primera": g.player_id.nunique(), "Debutaron en Primera": len(nuevos) if a >= 2019 else None,
                      "Edad promedio al debutar": round(float(np.mean(edades)), 1) if edades else None,
                      "Debutantes que jugaron juveniles en Los 50 (desde 2017)": sum(x_ in juv for x_ in nuevos) if a >= 2019 else None,
                      "Edad promedio del XV titular": round(x.edad.mean(), 1),
                      "Partidos previos en plantel superior del XV (promedio)": round(x.exp.mean(), 0)})
    return pd.DataFrame(filas).sort_values("Año", ascending=False)


def estilo(ws):
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = ws.dimensions
    ws.sheet_view.showGridLines = False
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F3864")
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 44
    for col in ws.columns:
        w = max(len(str(c.value or "")) for c in list(col)[1:]) if ws.max_row > 1 else 8
        ws.column_dimensions[col[0].column_letter].width = min(max(9, w + 2), 42)
    hdr = [c.value for c in ws[1]]
    verde_bueno = ["% victorias", "Diferencia por partido", "PF por partido", "% retención", "% pasaje a plantel superior", "Tries a favor por partido"]
    rojo_malo = ["PC por partido", "Tries en contra por partido", "% PC en 2º tiempo", "Amarillas por partido", "Perdidos por más de 20"]
    for k in verde_bueno + rojo_malo:
        if k in hdr:
            L = ws.cell(1, hdr.index(k) + 1).column_letter
            bajo, alto = ("F8696B", "63BE7B") if k in verde_bueno else ("63BE7B", "F8696B")
            ws.conditional_formatting.add(f"{L}2:{L}{ws.max_row}", ColorScaleRule(start_type="min", start_color=bajo, mid_type="percentile",
                                                                                 mid_value=50, mid_color="FFEB84", end_type="max", end_color=alto))


GLOSARIO = [
    ("% victorias", "De cada 100 partidos, cuántos ganamos.", "La foto general. Sola no alcanza: depende mucho del rival."),
    ("PF / PC por partido", "Puntos que hacemos / que nos hacen, en promedio.", "PF = ataque. PC = defensa. Muestra dónde está el problema."),
    ("Diferencia por partido", "PF menos PC. Positivo = le sacamos ventaja a los rivales.", "La mejor métrica para ver si la categoría mejora, aunque se pierda."),
    ("Tries a favor / en contra", "Tries por partido.", "Más estable que los puntos (no depende de patear bien)."),
    ("Ganados / perdidos por 7 o menos", "Partidos que se definieron por un try convertido o menos.", "Muchos perdidos por poco = equipo competitivo al que le falta cerrar partidos."),
    ("Perdidos por más de 20", "Palizas.", "Si baja, la categoría está más pareja con el resto."),
    ("% PC en 2º tiempo", "De los puntos que nos hacen, qué parte es en el segundo tiempo.", "Si es alto (más de 60%), puede ser falta de físico. Ideal para cruzar con los test físicos."),
    ("% PF en 2º tiempo", "De los puntos que hacemos, qué parte es en el segundo tiempo.", "Si es alto, el equipo termina bien los partidos."),
    ("Remontadas / Nos lo dieron vuelta", "Partidos que se dieron vuelta en el 2º tiempo (ET = entretiempo).", "Si nos dan vuelta muchos partidos: físico, cambios o cabeza. Muy útil para cruzar con test físicos."),
    ("% conversiones", "De cada 100 tries (sin contar try penal), cuántos convertimos.", "Mide al pateador. 2 puntos perdidos por try sin convertir deciden muchos partidos cerrados."),
    ("% marcamos primero", "En cuántos partidos el primer tanto fue nuestro.", "Arrancar bien pesa mucho: cuando marcamos primero ganamos 6-8 de cada 10; cuando marca el rival, 1-3 de cada 10."),
    ("% victorias de local / visitante", "Cuánto ganamos en casa y afuera.", "Muestra cuánto pesa viajar (Tandil viaja mucho a Mar del Plata)."),
    ("% victorias vs rivales de arriba / de abajo", "Rival 'de arriba' = terminó en la mitad de arriba de la tabla de la primera etapa.", "La vara real: ganarle a los de abajo es lo esperado; ganarle a los de arriba es crecer."),
    ("Titulares que repiten del partido anterior", "De los 15 titulares, cuántos repiten respecto al partido anterior.", "Continuidad del equipo. Muchos cambios = falta de jugadores o de un XV base."),
    ("Carga de partidos", "Cuántos partidos juega cada uno y cuántas veces juega 2 partidos con 2 días o menos.", "Cuidar a los juveniles: jugar doble aumenta el riesgo de lesión. Revisar el reglamento de la Unión."),
    ("Edad relativa", "En qué parte del año nacieron los jugadores.", "En muchos clubes sobran nacidos en ene-mar y se pierden los de oct-dic (más chicos físicamente). Si está parejo, el club no deja chicos afuera por madurar tarde."),
    ("Camino a Primera", "Debuts en Primera, edad al debutar, edad y experiencia del XV.", "Si la experiencia sube año a año y casi no hay debuts, el plantel envejece sin recambio."),
    ("Amarillas por partido", "Tarjetas amarillas en promedio.", "Disciplina. Cada amarilla son 10 minutos con uno menos."),
    ("Bonus (pts)", "Puntos bonus sumados en la tabla.", "Premia ataque (4 tries) y perder por poco."),
    ("Jugadores convocados distintos", "Cuántos chicos distintos estuvieron en planilla en el año.", "Muestra si se rota o siempre juegan los mismos."),
    ("% retención", "De los que jugaron un año, cuántos siguieron jugando en el club la temporada siguiente.", "Clave en juveniles: si baja, se están yendo chicos."),
    ("% pasaje a plantel superior", "De los M19 de un año, cuántos jugaron en plantel superior en las 2 temporadas siguientes.", "Mide si juveniles alimenta al plantel superior."),
    ("% partidos con planilla completa", "Partidos donde la planilla tiene cargados todos los tantos.", "Control de calidad del dato. Casi todo está en 100%."),
]
NOTAS = [
    "Solo partidos oficiales con resultado (sin amistosos ni sevens). 2020 no hubo partidos (pandemia).",
    "La última temporada puede estar incompleta si todavía no terminó.",
    "Categorías confirmadas por el club (2017-2018): Super 12 2018 = Primera; Copa Imágenes Plata 2017 y Torneo Imágenes Plata 2018 = Intermedia; Preparación 2018 = M19.",
    "Torneos de preparación 2017-2018 de plantel superior no se cuentan (no se sabe si eran Primera o Intermedia).",
    "Peso y altura: es lo que tiene cargado la ficha UAR (un solo dato, sin fecha; falta en muchos). Sirve de punto de partida para la nutricionista.",
    "Las lesiones casi no se anotan en las planillas (menos de 1 cada 5 partidos): para medirlas hay que registrarlas en el club.",
    "Hoja 'Tendencias': compara la última temporada con el promedio de las 3 anteriores. Solo cuenta como cambio si es grande.",
]


def main():
    d = cargar()
    p, i = preparar(d)
    res = resumen(p, i, d)
    ten = tendencias(res)
    sem = semaforo(ten)
    tor = torneos_final(p, d)
    riv = rivales(p)
    ret = retencion(p, d)
    fis_res, fis_jug = fisico(p, d)
    car, car_jug = carga(p, i, d)
    era = edad_relativa(p, i, d)
    cam = camino_primera(p, i, d)
    glo = pd.DataFrame(GLOSARIO, columns=["Métrica", "Qué es", "Para qué sirve"])
    with pd.ExcelWriter(DESTINO, engine="openpyxl") as xw:
        sem.to_excel(xw, sheet_name="Resumen", index=False)
        pd.DataFrame(R.DIAGNOSTICO, columns=["Hallazgo", "Qué muestran los datos de Los 50", "Consejo"]).to_excel(xw, sheet_name="Diagnóstico y consejos", index=False)
        res.to_excel(xw, sheet_name="Por categoría y año", index=False)
        ten.to_excel(xw, sheet_name="Tendencias", index=False)
        tor.to_excel(xw, sheet_name="Torneos", index=False)
        ret.to_excel(xw, sheet_name="Retención", index=False)
        riv.to_excel(xw, sheet_name="Rivales", index=False)
        car.to_excel(xw, sheet_name="Carga de partidos", index=False)
        car_jug.to_excel(xw, sheet_name="Carga - juveniles", index=False)
        cam.to_excel(xw, sheet_name="Camino a Primera", index=False)
        era.to_excel(xw, sheet_name="Edad relativa", index=False)
        if not fis_res.empty:
            fis_res.to_excel(xw, sheet_name="Físico por categoría", index=False)
            fis_jug.to_excel(xw, sheet_name="Peso y altura (ficha UAR)", index=False)
        glo.to_excel(xw, sheet_name="Qué mide cada cosa", index=False)
        pd.DataFrame(R.EXPERTOS, columns=["Métrica", "Qué dice la evidencia", "¿Sale de las planillas UAR?", "Si no sale, qué hacer", "Prioridad", "Fuentes (n°)"]
                     ).to_excel(xw, sheet_name="Qué recomiendan los expertos", index=False)
        pd.DataFrame(R.A_MEDIR, columns=["Qué medir", "Quién", "Cada cuánto", "Cómo", "Categorías"]).to_excel(xw, sheet_name="Qué empezar a medir", index=False)
        pd.DataFrame(R.FUENTES, columns=["N°", "Fuente", "Link"]).to_excel(xw, sheet_name="Fuentes", index=False)
        for ws in xw.book.worksheets:
            estilo(ws)
        anchos = {"Resumen": {"B": 16, "C": 12, "D": 60, "E": 60}, "Qué mide cada cosa": {"A": 34, "B": 60, "C": 60},
                  "Diagnóstico y consejos": {"A": 34, "B": 80, "C": 60},
                  "Qué recomiendan los expertos": {"A": 32, "B": 70, "C": 30, "D": 40, "E": 10, "F": 12},
                  "Qué empezar a medir": {"A": 60, "B": 26, "C": 32, "D": 32, "E": 22}, "Fuentes": {"A": 6, "B": 50, "C": 90}}
        for nombre, cols in anchos.items():
            ws = xw.book[nombre]
            ws.freeze_panes = "A2" if nombre != "Diagnóstico y consejos" else "B2"
            for col, w in cols.items():
                ws.column_dimensions[col].width = w
            for fila in ws.iter_rows(min_row=2):
                for c in fila:
                    c.alignment = Alignment(wrap_text=True, vertical="top")
        ws = xw.book["Resumen"]
        for k, n in enumerate(NOTAS, ws.max_row + 2):
            ws.cell(k, 1, "• " + n).font = Font(italic=True, color="595959")
        verde, rojo = PatternFill("solid", fgColor="C6EFCE"), PatternFill("solid", fgColor="FFC7CE")
        ws = xw.book["Tendencias"]
        for fila in ws.iter_rows(min_row=2):
            v = str(fila[-1].value or "")
            if v[:1] in "▲▼":
                fila[-1].fill = verde if v.startswith("▲") else rojo
    print(f"Listo: {DESTINO}")
    pd.set_option("display.width", 250)
    pd.set_option("display.max_colwidth", 120)
    print(sem.to_string(index=False))
    print(tor.head(40).to_string(index=False))


if __name__ == "__main__":
    main()
