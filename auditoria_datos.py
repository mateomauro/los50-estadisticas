"""Busca inconsistencias dentro de los datos de cada partido (Los50_PlantelSuperior_historico.xlsx).
Escribe auditoria_datos.xlsx con una hoja por tipo de problema.
"""
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
x = pd.read_excel(HERE / "Los50_PlantelSuperior_historico.xlsx", sheet_name=None)
P, J, I = x["Partidos"], x["Planteles por partido"], x["Incidencias"]
CATS = ["Primera", "Intermedia", "Pre-Intermedia"]
P = P[P.categoria.isin(CATS)]
J = J[J.partido_id.isin(P.partido_id)].copy()
I = I[I.partido_id.isin(P.partido_id)].copy()
JUGADOS = P[P.estado.isin(["Cerrado", "Iniciado"])].partido_id
PUNTOS = ["Try", "Try penal", "Conversión", "Penal", "Drop"]
TARJ = ["Amarilla", "Roja", "Tarjeta azul"]

I["t"] = (I.tiempo.map({"1T": 0, "2T": 100}).fillna(0) + I.minuto.fillna(0)).astype(int)
J["titular"] = J.rol == "Titular"
info = P.set_index("partido_id")[["anio", "categoria", "fecha", "rival", "torneo"]]


def ctx(mid):
    r = info.loc[mid]
    return {"anio": r.anio, "categoria": r.categoria, "fecha": r.fecha, "rival": r.rival, "torneo": r.torneo, "partido_id": mid}


# --- intervalos en cancha por jugador y partido (solo partidos con plantel "de 15", sin grilla de asistencia)
cambios = I[I.incidencia.isin(["Ingresó", "Se retiró"]) & I.player_id.notna()]
cam = {k: g.sort_values("t") for k, g in cambios.groupby(["partido_id", "player_id"])}


def en_cancha(mid, pid, titular, t):
    """True / False / None (sin dato de cambios en ese partido)."""
    est = titular
    for _, e in cam.get((mid, pid), pd.DataFrame()).iterrows():
        if e.t < t:
            est = e.incidencia == "Ingresó"
        elif e.t == t:  # mismo minuto: le damos el beneficio de la duda
            return True
    return est


plantel = J.set_index(["partido_id", "player_id"])
hay_cambios = set(cambios.partido_id)
problemas = {}


def add(tipo, fila):
    problemas.setdefault(tipo, []).append(fila)


# 1-3. puntos y tarjetas: jugador fuera del plantel / fuera de cancha
for _, e in I[I.incidencia.isin(PUNTOS + TARJ) & I.partido_id.isin(JUGADOS)].iterrows():
    if pd.isna(e.player_id):
        continue
    key = (e.partido_id, e.player_id)
    base = {**ctx(e.partido_id), "momento": f"{e.tiempo} {int(e.minuto) if pd.notna(e.minuto) else ''}'",
            "incidencia": e.incidencia, "jugador": e.jugador, "dorsal": e.dorsal}
    if key not in plantel.index:
        add("No figura en el plantel", base)
        continue
    pj = plantel.loc[key]
    if isinstance(pj, pd.DataFrame):
        pj = pj.iloc[0]
    if e.partido_id not in hay_cambios and not pj.titular:
        add("Suplente con puntos/tarjeta sin cambios cargados", {**base, "rol": pj.rol})
        continue
    if e.partido_id in hay_cambios and en_cancha(e.partido_id, e.player_id, pj.titular, e.t) is False:
        sal = cam.get(key)
        mov = "" if sal is None else ", ".join(f"{a} {b}" for a, b in zip(sal.incidencia, sal.tiempo + " " + sal.minuto.astype("Int64").astype(str) + "'"))
        add("Fuera de cancha en ese minuto", {**base, "rol": pj.rol, "sus cambios": mov or "nunca ingresó"})

# 4. duplicados exactos
d = I[I.incidencia.isin(PUNTOS + TARJ)]
dup = d[d.duplicated(["partido_id", "tiempo", "minuto", "incidencia", "player_id"], keep=False)]
for _, e in dup.drop_duplicates(["partido_id", "tiempo", "minuto", "incidencia", "player_id"]).iterrows():
    add("Incidencia duplicada", {**ctx(e.partido_id), "momento": f"{e.tiempo} {e.minuto}'", "incidencia": e.incidencia, "jugador": e.jugador})

# 5. conversiones vs tries
for mid, g in I[I.partido_id.isin(JUGADOS)].groupby("partido_id"):
    tries = g[g.incidencia == "Try"]
    conv = g[g.incidencia == "Conversión"]
    if len(conv) > len(tries):
        add("Más conversiones que tries", {**ctx(mid), "tries": len(tries), "conversiones": len(conv)})
    for _, c in conv.iterrows():
        if not ((tries.t - c.t).abs() <= 3).any():
            add("Conversión sin try cerca", {**ctx(mid), "momento": f"{c.tiempo} {c.minuto}'", "jugador": c.jugador,
                                            "tries del partido": ", ".join(f"{a} {b}'" for a, b in zip(tries.tiempo, tries.minuto))})

# 6. dos amarillas sin roja
for (mid, pid), g in I[I.incidencia.isin(TARJ) & I.player_id.notna()].groupby(["partido_id", "player_id"]):
    if (g.incidencia == "Amarilla").sum() >= 2 and not (g.incidencia == "Roja").any():
        add("Dos amarillas sin roja", {**ctx(mid), "jugador": g.jugador.iloc[0], "momentos": ", ".join(g.tiempo + " " + g.minuto.astype("Int64").astype(str) + "'")})

# 7. cambios raros
for (mid, pid), g in cambios.groupby(["partido_id", "player_id"]):
    if (mid, pid) not in plantel.index:
        add("Cambio de un jugador que no está en el plantel", {**ctx(mid), "jugador": g.jugador.iloc[0]})
        continue
    pj = plantel.loc[(mid, pid)]
    pj = pj.iloc[0] if isinstance(pj, pd.DataFrame) else pj
    seq = list(g.incidencia)
    if pj.titular and seq[0] == "Ingresó":
        add("Titular que 'ingresa' (sin haber salido)", {**ctx(mid), "jugador": pj.jugador, "dorsal": pj.dorsal, "cambios": ", ".join(seq)})
    if not pj.titular and seq[0] == "Se retiró":
        add("Suplente que 'sale' sin haber entrado", {**ctx(mid), "jugador": pj.jugador, "dorsal": pj.dorsal, "cambios": ", ".join(seq)})

# 8. planteles: jugador repetido / dorsal repetido
for mid, g in J.groupby("partido_id"):
    for pid, n in g.player_id.value_counts().items():
        if n > 1:
            add("Jugador repetido en el plantel", {**ctx(mid), "jugador": g[g.player_id == pid].jugador.iloc[0], "veces": n})
    dd = g.dorsal.dropna()
    for dor, n in dd.value_counts().items():
        if n > 1:
            add("Dorsal repetido en el plantel", {**ctx(mid), "dorsal": int(dor), "jugadores": ", ".join(g[g.dorsal == dor].jugador)})

# 9. mismo jugador jugando dos partidos el mismo día
jug = J[(J.jugo == "Si") & J.partido_id.isin(JUGADOS)]
for (pid, fecha), g in jug.groupby(["player_id", "fecha"]):
    if g.partido_id.nunique() > 1:
        add("Jugó dos partidos el mismo día", {"fecha": fecha, "jugador": g.jugador.iloc[0],
                                              "partidos": " / ".join(f"{c} vs {r} ({rol})" for c, r, rol in zip(g.categoria, g.rival, g.rol))})

# 10. partido cargado dos veces (mismo día, rival y categoría)
for (fecha, rival, cat), g in P.groupby(["fecha", "rival", "categoria"]):
    if len(g) > 1:
        add("Partido cargado dos veces", {"fecha": fecha, "rival": rival, "categoria": cat,
                                         "partidos": ", ".join(f"{m} [{e}] {t}" for m, e, t in zip(g.partido_id, g.estado, g.torneo))})

with pd.ExcelWriter(HERE / "auditoria_datos.xlsx", engine="openpyxl") as xw:
    resumen = pd.DataFrame([{"problema": k, "casos": len(v)} for k, v in problemas.items()]).sort_values("casos", ascending=False)
    resumen.to_excel(xw, sheet_name="Resumen", index=False)
    for k, v in problemas.items():
        pd.DataFrame(v).to_excel(xw, sheet_name=k.replace("/", "-").replace("'", "")[:31], index=False)
print(resumen.to_string(index=False))
