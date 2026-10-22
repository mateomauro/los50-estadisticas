"""Asistencia a los entrenamientos (sección Entrenadores): la lista inicial de chicos de cada categoría.

Uso:  from asistencia_entrenadores import fichados   (lee datos_uar/los50.db, la arma procesar_todo.py)
      python asistencia_entrenadores.py              (muestra cuántos hay por categoría)

La lista sale de los fichados en Los 50 del año en curso (tabla fichajes de la UAR), con la categoría que les da la UAR.
Va cifrada con el resto de los datos de Entrenadores. Lo que cargan los entrenadores (los días de entrenamiento, las listas,
los cancelados y los chicos que suman o sacan) se guarda en Cloudflare D1, con functions/api/asistencia.js.
"""
import sqlite3
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
DB = HERE / "datos_uar" / "los50.db"
# las categorías de la asistencia, como entrena el club: el plantel superior junto y M18 con M19
ORDEN = ["Plantel superior", "M19", "M17", "M16", "M15", "M14", "M13", "M12", "M11", "M10", "M9", "M8", "M7", "M6"]
JUNTOS = {"Mayores": "Plantel superior", "M20": "Plantel superior", "M21": "Plantel superior", "M22": "Plantel superior",
          "M23": "Plantel superior", "M18": "M19", "M5": "M6", "Infantil": "M6"}


def fichados():
    """{categoría: [[id, "Apellido, Nombre"], ...]} en orden alfabético."""
    con = sqlite3.connect(DB)
    j = pd.read_sql("select player_id, player_id_unificado, jugador, categoria_uar from jugadores", con)
    f = pd.read_sql("select player_id, anio from fichajes where club = 'LOS 50'", con)
    con.close()
    anio = f.anio.max()  # el año en curso (en enero, hasta que fichen de nuevo, sigue el anterior)
    unif = dict(zip(j.player_id, j.player_id_unificado))  # el mismo chico cargado dos veces en la UAR cuenta una sola
    ids = {unif.get(p, p) for p in f[f.anio == anio].player_id}
    j = j[(j.player_id == j.player_id_unificado) & j.player_id.isin(ids)].copy()
    j["cat"] = j.categoria_uar.map(lambda c: JUNTOS.get(c, c))
    j = j[j.cat.isin(ORDEN)].sort_values("jugador")
    return {c: [[str(p), n] for p, n in zip(g.player_id, g.jugador)] for c, g in j.groupby("cat")}


if __name__ == "__main__":
    d = fichados()
    for c in ORDEN:
        print(f"{c:<17} {len(d.get(c, [])):>3} chicos")
    print("total", sum(len(v) for v in d.values()))
