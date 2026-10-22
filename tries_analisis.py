"""Cómo hace los tries cada categoría de Los 50 y cómo se los hacen (para la sección Entrenadores).

Uso:  from tries_analisis import tries_por_categoria      (lee datos_uar/los50.db, la arma procesar_todo.py)
      python tries_analisis.py                             (muestra un resumen, para revisar)

La planilla de la UAR no dice de qué jugada vino cada try (line, scrum, contraataque…): el campo "detalle" viene vacío.
Sí dice la camiseta del que lo hizo y el minuto. Con eso:
  - puesto: la camiseta si era titular (1 a 15); si entró del banco, la camiseta con la que más veces fue titular.
  - desde el banco: por el orden en la planilla (del 16 en adelante), no por la camiseta (en M13 y M14 los suplentes
    también usan camisetas del 1 al 15).
  - momento: 1er tiempo, 2do tiempo y últimos 10 minutos (algunas planillas cuentan el 2do tiempo desde 0 y otras desde 40).

Ojo: en M17 y más chicos las camisetas no siguen el puesto (solo ~60% de los titulares usa del 1 al 15, revisado en octubre 2026).
Ahí el puesto no sirve: forwards, backs y lineas vienen en None y solo vale el momento del partido.

Devuelve {categoría: {año: {"a_favor": {...}, "en_contra": {...}}}}, cada uno con:
  tries, forwards, backs, lineas (primera, segunda, tercera, medios, centros, wings_fullback)  -> None si el puesto no es confiable
  t1, t2, ultimos10, banco, try_penal
"""
import sqlite3
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
DB = HERE / "datos_uar" / "los50.db"
LINEAS = {"primera": (1, 2, 3), "segunda": (4, 5), "tercera": (6, 7, 8), "medios": (9, 10), "centros": (12, 13),
          "wings_fullback": (11, 14, 15)}


CONFIABLE = 0.9  # parte de los titulares que tiene que usar camisetas del 1 al 15 para que la camiseta diga el puesto


def _resumen(t, con_puesto):
    puesto = t.puesto
    minuto = t.minuto.where(~((t.tiempo == "2T") & (t.minuto <= 40)), t.minuto + 40)
    return {
        "tries": int(len(t)),
        "forwards": int((puesto <= 8).sum()) if con_puesto else None, "backs": int((puesto >= 9).sum()) if con_puesto else None,
        "lineas": {k: int(puesto.isin(v).sum()) for k, v in LINEAS.items()} if con_puesto else None,
        "t1": int((t.tiempo == "1T").sum()), "t2": int((t.tiempo == "2T").sum()),
        "ultimos10": int(((t.tiempo == "2T") & (minuto >= 70)).sum()),
        "banco": int(t.banco.sum()), "try_penal": int((t.incidencia == "Try penal").sum()),
    }


def tries_por_categoria():
    con = sqlite3.connect(DB)
    t = pd.read_sql("select i.mid, i.equipo, i.tiempo, i.minuto, i.incidencia, i.dorsal, i.player_id, p.categoria, p.anio "
                    "from incidencias i join partidos p using(mid) where i.incidencia in ('Try', 'Try penal') "
                    "and p.estado in ('Cerrado', 'Iniciado') and p.amistoso = 0", con)
    pl = pd.read_sql("select mid, equipo, player_id, dorsal, orden from planteles", con)
    con.close()
    # camiseta habitual de cada jugador (de los dos equipos): la que más usó de titular
    pl["d"] = pd.to_numeric(pl.dorsal, errors="coerce")
    tit = pl[pl.d.between(1, 15) & (pl.orden <= 15)]
    habitual = tit.groupby("player_id").d.agg(lambda x: int(x.mode().iloc[0]))
    t["dorsal_n"] = pd.to_numeric(t.dorsal, errors="coerce")
    orden = pl.drop_duplicates(["mid", "equipo", "player_id"]).set_index(["mid", "equipo", "player_id"]).orden
    t["banco"] = [(orden.get((m, e, p)) or 0) > 15 for m, e, p in zip(t.mid, t.equipo, t.player_id)]
    t["puesto"] = t.dorsal_n.where(t.dorsal_n.between(1, 15) & ~t.banco, t.player_id.map(habitual))
    t["minuto"] = pd.to_numeric(t.minuto, errors="coerce")
    # ¿en esta categoría y año la camiseta dice el puesto? (cada equipo por separado)
    todos_tit = pl[pl.orden <= 15].merge(t[["mid", "categoria", "anio"]].drop_duplicates(), on="mid")
    confiable = (todos_tit.assign(ok=todos_tit.d.between(1, 15)).groupby(["categoria", "anio", "equipo"]).ok.mean() >= CONFIABLE).to_dict()
    out = {}
    for (cat, anio), g in t.groupby(["categoria", "anio"]):
        ok = lambda eq: confiable.get((cat, anio, eq), False)
        out.setdefault(cat, {})[int(anio)] = {"a_favor": _resumen(g[g.equipo == "Los 50"], ok("Los 50")),
                                              "en_contra": _resumen(g[g.equipo == "Rival"], ok("Rival"))}
    return out


if __name__ == "__main__":
    d = tries_por_categoria()
    for cat in ("Primera", "Intermedia", "M19", "M17", "M15"):
        if cat not in d:
            continue
        a = d[cat][max(d[cat])]
        print(cat, max(d[cat]), "a favor:", a["a_favor"]["tries"], a["a_favor"]["lineas"], "últimos 10':", a["a_favor"]["ultimos10"],
              "| en contra:", a["en_contra"]["tries"], a["en_contra"]["lineas"], "últimos 10':", a["en_contra"]["ultimos10"])
