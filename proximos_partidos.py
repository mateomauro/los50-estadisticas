"""Los próximos partidos de Los 50 (el fixture que ya cargó la UAR), para "Próximos partidos" en la sección Entrenadores.

Uso:  from proximos_partidos import proximos      (lee datos_uar/los50.db, la arma procesar_todo.py)
      python proximos_partidos.py                 (los muestra, para revisar)

Son los partidos en estado "Pendiente". La página muestra solo los de hoy en adelante: si la actualización se atrasa
unos días, no quedan partidos viejos a la vista. La UAR no dice en qué cancha se juega.
"""
import re
import sqlite3
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
DB = HERE / "datos_uar" / "los50.db"
COPAS = ("oro", "plata", "bronce", "estimulo")


def instancia(ronda):
    """La ronda como se dice: "SF PLATA" -> "Semifinal de plata", "2 - FINAL PLATA" -> "Final de plata". "Unica" no dice nada."""
    t = re.sub(r"^\d+\s*-\s*", "", str(ronda or "")).strip()
    n = t.lower().replace("í", "i")
    copa = next((c for c in COPAS if c in n), "")
    de = f" de {copa.replace('estimulo', 'estímulo')}" if copa else ""
    if re.search(r"\bsf\b|semi", n):
        return f"Semifinal{de}"
    if re.search(r"cuartos|\bqf\b", n):
        return f"Cuartos de final{de}"
    if re.search(r"\bfinal\b", n):
        return f"Final{de}"
    if n in ("", "unica", "clasificatoria", "none"):
        return ""
    return t[:1].upper() + t[1:].lower()


def nivel(inst):
    """En qué ronda de eliminación está (0 si no es de eliminación): cuartos 1, semifinal 2, final 3."""
    return next((n for k, n in (("Cuartos", 1), ("Semifinal", 2), ("Final", 3)) if inst.startswith(k)), 0)


def proximos():
    con = sqlite3.connect(DB)
    p = pd.read_sql("select tid, categoria, fecha, hora, condicion, rival, ronda, amistoso from partidos where estado = 'Pendiente'", con)
    con.close()
    p["f"] = pd.to_datetime(p.fecha, dayfirst=True, errors="coerce")
    p["hora"] = p.hora.fillna("").astype(str).str.strip().str[:5]
    p = p[p.f.notna()].sort_values(["f", "hora", "categoria"])
    lista = [{"tid": r.tid, "fecha": r.f.strftime("%Y-%m-%d"), "hora": r.hora, "cat": r.categoria, "cond": str(r.condicion or " ")[0],
              "rival": r.rival, "inst": "Amistoso" if r.amistoso else instancia(r.ronda)} for r in p.itertuples()]
    # La UAR arma la final antes de jugar la semifinal, con equipos provisorios (en 2026 puso la final de plata de M19 contra el
    # mismo rival de la semifinal). Si antes hay una ronda de eliminación sin jugar del mismo torneo, el rival todavía no se sabe.
    for x in lista:
        antes = [y for y in lista if y["tid"] == x["tid"] and y["fecha"] < x["fecha"] and 0 < nivel(y["inst"]) < nivel(x["inst"])]
        if antes:
            x["rival"], x["depende"] = "", {"fecha": antes[-1]["fecha"], "inst": antes[-1]["inst"]}
    for x in lista:
        del x["tid"]
    return lista


if __name__ == "__main__":
    for x in proximos():
        print(x["fecha"], x["hora"], f'{x["cat"]:<6}', "Local    " if x["cond"] == "L" else "Visitante", x["rival"] or "(a definir)", "·", x["inst"],
              f'· depende de {x["depende"]["inst"]} del {x["depende"]["fecha"]}' if x.get("depende") else "")
