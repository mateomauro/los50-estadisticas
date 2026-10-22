"""Arma Los50_Revisar_planillas.xlsx: los casos de las planillas que solo puede aclarar alguien que estuvo en el partido.
Lee auditoria_datos.xlsx (python auditoria_datos.py) y Los50_PlantelSuperior_historico.xlsx.
También deja los casos en revision/planillas.json para la página "Revisar datos" (revision.py arma las preguntas).
"""
import hashlib
import json
import re
from pathlib import Path

import pandas as pd
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

from exportar_web import rival as rival_lindo

HERE = Path(__file__).parent
DESTINO = HERE / "Los50_Revisar_planillas.xlsx"
PATADAS = ["Conversión", "Penal", "Drop"]
NUEVOS = [616, 286, 2376]  # torneos 2017-2018 sumados en octubre 2026
PLURAL = {"Try": "tries", "Conversión": "conversiones", "Penal": "penales", "Drop": "drops"}
# Casos ya revisados con el club (15/10/2026): están bien como dice la planilla (solo el minuto o el cambio mal cargado).
# Se sacan de la lista para no volver a preguntarlos.
REVISADOS = {
    308774, 271134, 238374, 151589, 102418, 102417, 95950,                    # Primera
    310722, 279683, 279678, 177118, 151612, 131398, 131375, 131358, 119632,   # Intermedia
    119628, 52673, 43052, 39354, 39349, 39302, 28960, 28945, 28934, 5458, 5384,
    323335, 279699,                                                           # Pre-Intermedia
}

aud = pd.read_excel(HERE / "auditoria_datos.xlsx", sheet_name=None)
hist = pd.read_excel(HERE / "Los50_PlantelSuperior_historico.xlsx", sheet_name=["Partidos", "Incidencias", "Planteles por partido"])
P, I, J = hist["Partidos"], hist["Incidencias"], hist["Planteles por partido"]
url = P.set_index("partido_id").url
pateos = I[I.incidencia.isin(PATADAS)]


def minuto(txt):
    """'2T 16.0'' -> ('2T', 16.0)"""
    m = re.match(r"\s*(\w+)\s+([\d.]+)", str(txt))
    return (m.group(1), float(m.group(2))) if m else (None, None)


def limpio(txt):
    return re.sub(r"(\d+)\.0'", lambda m: m.group(1) + "'", str(txt))


def cant(n, inc):
    return f"1 {inc.lower()}" if n == 1 else f"{n} {PLURAL.get(inc, inc.lower())}"


def pid(x):
    return str(int(x)) if pd.notna(x) else ""


def clave(mid, momento, inc, jugador):
    """Lo que identifica la jugada en extraer_los50.ARREGLOS: (partido, tiempo, minuto, incidencia, jugador)."""
    t, m = minuto(momento)
    fila = I[(I.partido_id == mid) & (I.jugador == jugador)]
    return [str(mid), t, int(m), inc, pid(fila.player_id.iloc[0]) if len(fila) else ""]


def otros_pateadores(mid, jugador):
    """Quién más pateó en ese partido (ayuda a recordar quién era el pateador)."""
    o = pateos[(pateos.partido_id == mid) & (pateos.jugador != jugador)].jugador.value_counts()
    return ", ".join(f"{j} ({n})" for j, n in o.items()) or "nadie más"


filas = []
# 1) jugadas de alguien que según la planilla ya había salido de la cancha
f = aud["Fuera de cancha en ese minuto"]
for (mid, jug, inc), g in f.groupby(["partido_id", "jugador", "incidencia"], sort=False):
    r = g.iloc[0]
    salida = minuto(re.search(r"Se retiró (\w+ [\d.]+)", r["sus cambios"]).group(1)) if "Se retiró" in r["sus cambios"] else (None, None)
    jugadas = [minuto(m) for m in g.momento]
    # minuto del partido (algunas planillas cuentan el 2º tiempo desde 0 y otras desde 40)
    absoluto = lambda t, m: m if t != "2T" or m > 40 else 40 + m
    if salida[0] in ("1T", "2T") and all(absoluto(t, m) - absoluto(*salida) <= 3 for t, m in jugadas):
        continue  # la jugada fue antes del cambio o enseguida (redondeo del minuto): está bien
    momentos = ", ".join(limpio(m) for m in g.momento)
    filas.append({
        "fecha": r.fecha, "categoria": r.categoria, "rival": r.rival, "torneo": r.torneo, "jugador": jug, "partido_id": mid,
        "tipo": "Ya había salido", "momentos": momentos,
        "dice": f"Le anota {cant(len(g), inc)} ({momentos}), pero también dice que salió de la cancha ({limpio(r['sus cambios'])}).",
        "pregunta": f"¿{'Los' if len(g) > 1 else 'Lo'} hizo {jug}? Si es así, solo está mal el minuto del cambio.",
        "otros": otros_pateadores(mid, jug) if inc in PATADAS else "",
        "claves": [clave(mid, m, inc, jug) for m in g.momento], "opciones": "quien"})

# 2) conversiones lejos de cualquier try (y el partido con más conversiones que tries)
c = aud["Conversión sin try cerca"]
mas = set(aud["Más conversiones que tries"].partido_id)
for _, r in c.iterrows():
    t, m = minuto(r.momento)
    tries = [minuto(x) for x in str(r["tries del partido"]).split(",")]
    if r.partido_id not in mas and any(tt == t and 0 <= m - mm <= 10 for tt, mm in tries):
        continue
    extra = " Además, en ese partido hay más conversiones que tries." if r.partido_id in mas else ""
    filas.append({
        "fecha": r.fecha, "categoria": r.categoria, "rival": r.rival, "torneo": r.torneo, "jugador": r.jugador, "partido_id": r.partido_id,
        "tipo": "Conversión sin try", "momentos": limpio(r.momento),
        "dice": f"Conversión de {r.jugador} en el {limpio(r.momento)}, pero los tries de Los 50 fueron en: {limpio(r['tries del partido'])}.{extra}",
        "pregunta": "¿Esa conversión existió? Puede ser solo el minuto mal, o que en realidad fue un penal.",
        "otros": otros_pateadores(r.partido_id, r.jugador),
        "claves": [clave(r.partido_id, r.momento, "Conversión", r.jugador)], "opciones": "existio"})

# 3) la misma patada cargada dos veces en el mismo minuto
d = aud["Incidencia duplicada"]
for _, r in d.iterrows():
    filas.append({
        "fecha": r.fecha, "categoria": r.categoria, "rival": r.rival, "torneo": r.torneo, "jugador": r.jugador, "partido_id": r.partido_id,
        "tipo": "Cargada dos veces", "momentos": limpio(r.momento),
        "dice": f"Dos {PLURAL.get(r.incidencia, r.incidencia).lower()} de {r.jugador} en el mismo minuto ({limpio(r.momento)}).",
        "pregunta": "¿Fueron dos o es una sola cargada dos veces?", "otros": otros_pateadores(r.partido_id, r.jugador),
        "claves": [clave(r.partido_id, r.momento, r.incidencia, r.jugador)], "opciones": "dos"})

# 4) en los torneos nuevos, patadas de jugadores que casi nunca patearon
total = pateos.groupby("jugador").size()
raros = pateos[pateos.torneo_id.isin(NUEVOS)]
for (jug, tor), g in raros.groupby(["jugador", "torneo"]):
    if total[jug] > len(g) + 3:  # patea seguido en otros torneos: no es raro
        continue
    for mid, gg in g.groupby("partido_id"):
        r = gg.iloc[0]
        tipos = ", ".join(cant(n, t) for t, n in gg.incidencia.value_counts().items())
        filas.append({
            "fecha": r.fecha, "categoria": r.categoria, "rival": r.rival, "torneo": tor, "jugador": jug, "partido_id": mid,
            "tipo": "Pateador poco común", "momentos": ", ".join(f"{t} {m:g}'" for t, m in zip(gg.tiempo, gg.minuto)),
            "dice": f"Le anota {tipos}. " + ("Es la única patada que tiene en toda la historia." if total[jug] == 1 else
                    f"En toda la historia tiene {total[jug]} patadas{', todas en este torneo' if total[jug] == len(g) else ''}."),
            "pregunta": f"¿Pateó {jug} en ese partido?", "otros": otros_pateadores(mid, jug),
            "claves": [[str(mid), t, int(m), inc, pid(p)] for t, m, inc, p in zip(gg.tiempo, gg.minuto, gg.incidencia, gg.player_id)],
            "opciones": "quien"})

df = pd.DataFrame(filas, columns=["fecha", "categoria", "rival", "torneo", "jugador", "partido_id", "tipo", "momentos", "dice",
                                  "pregunta", "otros", "claves", "opciones"])
df = df[~df.partido_id.isin(REVISADOS)]
df["_f"] = pd.to_datetime(df.fecha, dayfirst=True)
df = df.sort_values("_f", ascending=False).drop(columns="_f").reset_index(drop=True)
df.insert(0, "N°", range(1, len(df) + 1))
df["planilla"] = df.partido_id.map(url)
# ---------- para la página "Revisar datos" ----------
OPCIONES = {
    "quien": [["si", "Sí, fue él"], ["otro", "No, fue otro"], ["nose", "No sé"]],
    "existio": [["si", "Sí, existió"], ["no", "No existió"], ["nose", "No sé"]],
    "dos": [["si", "Fueron dos"], ["una", "Era una sola"], ["nose", "No sé"]],
}
web = []
for r in df.itertuples():
    plantel = J[J.partido_id == r.partido_id].sort_values("dorsal")
    ident = hashlib.sha1(f"{r.partido_id}|{r.tipo}|{r.jugador}|{r.momentos}".encode()).hexdigest()[:12]
    web.append({"id": f"pla-{ident}", "tipo": "planilla", "caso": r.tipo,
                "titulo": f"{r.categoria} vs {rival_lindo(r.rival)} · {r.fecha}", "torneo": r.torneo, "dice": r.dice, "pregunta": r.pregunta,
                "otros": r.otros, "opciones": OPCIONES[r.opciones], "claves": r.claves,
                "jugadores": [[pid(p), str(int(d)) if pd.notna(d) else "", j] for p, d, j in zip(plantel.player_id, plantel.dorsal, plantel.jugador)
                              if pd.notna(p)] if r.opciones == "quien" else []})
(HERE / "revision").mkdir(exist_ok=True)
(HERE / "revision" / "planillas.json").write_text(json.dumps(web, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

out = df.drop(columns=["claves", "opciones"]).rename(columns={"fecha": "Fecha", "categoria": "Categoría", "rival": "Rival", "torneo": "Torneo", "jugador": "Jugador",
                         "tipo": "Tipo de caso", "dice": "Qué dice la planilla", "pregunta": "Pregunta",
                         "otros": "Otros que patearon ese partido", "planilla": "Ver planilla (UAR)"})
out["Respuesta"] = ""
out["Si fue otro, ¿quién?"] = ""
out["Comentario"] = ""
cols = ["N°", "Fecha", "Categoría", "Rival", "Jugador", "Tipo de caso", "Qué dice la planilla", "Pregunta", "Otros que patearon ese partido",
        "Respuesta", "Si fue otro, ¿quién?", "Comentario", "Torneo", "Ver planilla (UAR)", "partido_id", "momentos"]
out = out[cols]

INSTR = [
    "Para qué es: las planillas las carga a mano alguien del club y a veces hay errores. Estos son los casos que no se pueden arreglar sin preguntarle a alguien que estuvo.",
    "Qué hacer: en cada renglón, elegí una respuesta en la columna 'Respuesta' (tiene una lista para elegir).",
    "   • 'Está bien así' = la jugada es de ese jugador (solo estaba mal el minuto o el cambio).",
    "   • 'Fue otro jugador' = escribí quién en la columna de al lado.",
    "   • 'No existió' = esa jugada no pasó (cargada de más).",
    "   • 'No sé' o dejarlo vacío = queda como dice la planilla oficial.",
    "No es obligatorio contestar todo. Lo que no se conteste queda igual que ahora (como dice la planilla de la UAR).",
    "Los casos están ordenados del más nuevo al más viejo: los de arriba son más fáciles de recordar.",
    f"Total: {len(out)} casos.",
]

with pd.ExcelWriter(DESTINO, engine="openpyxl") as xw:
    pd.DataFrame({"Cómo usar esta planilla": INSTR}).to_excel(xw, sheet_name="Cómo usarla", index=False)
    out.to_excel(xw, sheet_name="Casos para revisar", index=False)
    ws = xw.book["Cómo usarla"]
    ws.column_dimensions["A"].width = 140
    ws["A1"].font = Font(bold=True, color="FFFFFF", size=12)
    ws["A1"].fill = PatternFill("solid", fgColor="1F3864")
    for row in ws.iter_rows(min_row=2):
        row[0].alignment = Alignment(wrap_text=True, vertical="top")

    ws = xw.book["Casos para revisar"]
    anchos = {"A": 5, "B": 11, "C": 13, "D": 18, "E": 24, "F": 17, "G": 52, "H": 40, "I": 30, "J": 18, "K": 22, "L": 24,
              "M": 34, "N": 14, "O": 10, "P": 18}
    for col, w in anchos.items():
        ws.column_dimensions[col].width = w
    azul, amarillo = PatternFill("solid", fgColor="1F3864"), PatternFill("solid", fgColor="FFF2CC")
    fino = Side(style="thin", color="D9D9D9")
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = azul
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[1].height = 34
    for fila in ws.iter_rows(min_row=2):
        for c in fila:
            c.alignment = Alignment(wrap_text=True, vertical="top")
            c.border = Border(bottom=fino)
        for c in fila[9:12]:  # columnas para completar
            c.fill = amarillo
        link = fila[13]
        if link.value:
            link.hyperlink, link.value, link.font = link.value, "Abrir ↗", Font(color="0563C1", underline="single")
    for c in ("O", "P"):  # datos técnicos para pasar las respuestas después
        ws.column_dimensions[c].hidden = True
    dv = DataValidation(type="list", formula1='"Está bien así,Fue otro jugador,No existió,No sé"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"J2:J{max(ws.max_row, 2)}")  # sin casos pendientes la hoja queda solo con el encabezado
    ws.freeze_panes = "F2"
    ws.auto_filter.ref = f"A1:N{ws.max_row}"

print(f"Listo: {DESTINO} ({len(out)} casos)")
print(out["Tipo de caso"].value_counts().to_string())
