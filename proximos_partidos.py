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


def proximos():
    con = sqlite3.connect(DB)
    p = pd.read_sql("select categoria, fecha, hora, condicion, rival, ronda, amistoso from partidos where estado = 'Pendiente'", con)
    con.close()
    p["f"] = pd.to_datetime(p.fecha, dayfirst=True, errors="coerce")
    p["hora"] = p.hora.fillna("").astype(str).str.strip().str[:5]
    p = p[p.f.notna()].sort_values(["f", "hora", "categoria"])
    return [{"fecha": r.f.strftime("%Y-%m-%d"), "hora": r.hora, "cat": r.categoria, "cond": str(r.condicion or " ")[0],
             "rival": r.rival, "inst": "Amistoso" if r.amistoso else instancia(r.ronda)} for r in p.itertuples()]


if __name__ == "__main__":
    for x in proximos():
        print(x["fecha"], x["hora"], f'{x["cat"]:<6}', "Local    " if x["cond"] == "L" else "Visitante", x["rival"], "·", x["inst"])
