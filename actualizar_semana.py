"""Actualización automática de Los 50 (GitHub Actions lo corre lunes, martes y miércoles a la mañana).

Uso:  python actualizar_semana.py

1. Baja de la BD UAR solo lo nuevo (extraer_todo.py semanal).
2. Regenera la web de jugadores, la base, el Excel y la sección de entrenadores.
3. Escribe informe.md con los partidos de la última semana: si ya están cerrados y con la planilla completa.
4. Si hay algo para revisar, escribe aviso.md (el workflow lo convierte en un aviso de GitHub, que llega por mail).
"""
import os
import sqlite3
import subprocess
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
PASOS = [
    ["extraer_todo.py", "semanal"],      # lo nuevo de la BD UAR (todas las categorías)
    ["extraer_los50.py", "todos"],       # plantel superior: Excel y web/data.js (página de jugadores)
    ["procesar_todo.py"],                # base datos_uar/los50.db
    ["analisis_metricas.py"],            # Excel de entrenadores
    ["exportar_entrenadores.py"],        # web/entrenadores.data.js (cifrado)
    ["auditoria_datos.py"],              # errores de carga en las planillas
    ["revisar_planillas.py"],            # casos que hay que preguntar al club
]
CATEGORIAS = ["Primera", "Intermedia", "Pre-Intermedia", "M23", "M19", "M17", "M16", "M15", "M14", "M13"]
PUNTOS = {"Try": 5, "Try penal": 7, "Conversión": 2, "Penal": 3, "Drop": 3}


def correr(paso):
    t0 = time.time()
    print(f"\n>>> {' '.join(paso)}", flush=True)
    r = subprocess.run([sys.executable, "-u", *paso], cwd=HERE, env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    if r.returncode != 0:
        sys.exit(f"Falló {' '.join(paso)} (código {r.returncode})")
    print(f"<<< {paso[0]} ok ({(time.time() - t0) / 60:.1f} min)", flush=True)


def informe(hoy):
    con = sqlite3.connect(HERE / "datos_uar" / "los50.db")
    p = pd.read_sql("select * from partidos where amistoso = 0", con)
    i = pd.read_sql("select mid, equipo, incidencia from incidencias", con)
    p = p[p.categoria.isin(CATEGORIAS)].copy()
    p["f"] = pd.to_datetime(p.fecha, dayfirst=True, errors="coerce").dt.date
    pts = i[i.incidencia.isin(PUNTOS)].assign(p=lambda x: x.incidencia.map(PUNTOS)).groupby(["mid", "equipo"]).p.sum().unstack(fill_value=0)

    def planilla(r):
        if r.estado != "Cerrado":
            return "falta cerrar la planilla" if r.estado in ("Pendiente", "Iniciado") else r.estado.lower()
        ok = all(pts.get(eq, pd.Series(dtype=float)).get(r.mid, 0) == v for eq, v in (("Los 50", r.tantos_los50), ("Rival", r.tantos_rival)))
        return "completa" if ok else "cerrada, pero los tantos no suman el resultado"

    ultimos = p[(p.f >= hoy - timedelta(days=7)) & (p.f <= hoy)].sort_values(["f", "categoria"])
    proximos = p[(p.f > hoy) & (p.f <= hoy + timedelta(days=7))].sort_values(["f", "categoria"])
    lineas = [f"# Actualización del {hoy:%d/%m/%Y}", "", "## Partidos de la última semana", ""]
    faltan = []
    if ultimos.empty:
        lineas.append("No hubo partidos oficiales de Los 50.")
    for r in ultimos.itertuples():
        estado = planilla(r)
        res = f"{int(r.tantos_los50)}-{int(r.tantos_rival)}" if pd.notna(r.tantos_los50) and pd.notna(r.tantos_rival) else "-"
        lineas.append(f"- **{r.categoria}** {r.f:%d/%m} vs {r.rival} ({r.condicion}): {res} · planilla {estado}")
        if estado != "completa":
            faltan.append(f"{r.categoria} {r.f:%d/%m} vs {r.rival}: {estado}")
    lineas += ["", "## Próximos partidos", ""]
    lineas += [f"- **{r.categoria}** {r.f:%d/%m} {r.hora or ''} vs {r.rival} ({r.condicion})" for r in proximos.itertuples()] or ["Ninguno cargado todavía."]

    revisar = 0
    xl = HERE / "Los50_Revisar_planillas.xlsx"
    if xl.exists():
        revisar = len(pd.read_excel(xl, sheet_name="Casos para revisar"))
    lineas += ["", f"## Para revisar con el club: {revisar} caso(s)", ""]
    texto = "\n".join(lineas) + "\n"
    (HERE / "informe.md").write_text(texto, encoding="utf-8")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(texto)
    print(texto)

    # aviso: el miércoles, si a algún partido todavía le falta la planilla; cualquier día, si hay casos nuevos para revisar
    aviso = HERE / "aviso.md"
    aviso.unlink(missing_ok=True)
    motivos = []
    if faltan and hoy.weekday() >= 2:
        motivos.append("Partidos que todavía no tienen la planilla completa en la BD UAR:\n" + "\n".join(f"- {x}" for x in faltan))
    if revisar:
        motivos.append(f"Hay {revisar} caso(s) de planillas para revisar con el club (ver el Excel Los50_Revisar_planillas.xlsx "
                       "en los archivos de esta actualización).")
    if motivos:
        aviso.write_text("\n\n".join(motivos) + "\n", encoding="utf-8")


def main():
    t0 = time.time()
    for paso in PASOS:
        correr(paso)
    informe(date.today())
    print(f"Listo en {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
