"""Dos cosas para la sección Entrenadores, con los datos de la UAR que ya tenemos:

  pase_plantel_superior(p, i, d)  ->  cuántos chicos de M19 pasan al plantel superior cada año, de dónde vienen los del plantel superior
                                      y quiénes son (los nombres van adentro de los datos cifrados, igual que las fichas de jugadores).
  alertas(p, i, d)                ->  lo que hay que mirar: sanciones, conmociones, rojas y amarillas. Se manda en bruto (con fechas):
                                      la página decide qué está vigente según el día en que se abre, no el día en que se armó el archivo.

Uso:  python pase_y_alertas.py      (muestra un resumen, para revisar)

Cuenta solo partidos oficiales con resultado (los mismos de analisis_metricas.preparar). Los datos empiezan en 2017; en 2020 no hubo partidos
(de 2019 se pasa a 2021). "Pasó al plantel superior" = jugó al menos un partido de Primera, Intermedia o Pre-Intermedia la temporada siguiente.
"""
import re
import sqlite3
import unicodedata
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

import analisis_metricas as A

HERE = Path(__file__).parent
DB = HERE / "datos_uar" / "los50.db"
PS = {"Primera", "Intermedia", "Pre-Intermedia", "M23"}
JUV = {"M13", "M14", "M15", "M16", "M17", "M19"}
DESDE = 2019  # los datos de partidos empiezan en 2017: antes de 2019 casi todos parecen recién llegados


def _norm(s):
    s = unicodedata.normalize("NFD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _planteles(p, d):
    pl = d["planteles"]
    pl = pl[(pl.equipo == "Los 50") & pl.player_id.notna()].merge(p[["mid", "categoria", "anio", "f"]], on="mid")
    return pl.assign(pid=pl.player_id.astype(str))


def pase_plantel_superior(p, i, d):
    pl = _planteles(p, d)
    nombre = pl.sort_values("f").groupby("pid").jugador.last().to_dict()
    temporadas = sorted(int(a) for a in p.anio.dropna().unique())
    hoy = date.today().year
    en = lambda cats, anio: set(pl[pl.categoria.isin(cats) & (pl.anio == anio)].pid)
    ult = temporadas[-1]

    # ---- los de M19 de cada año: ¿qué hicieron la temporada siguiente?
    cohortes, detalle = [], {}
    for y in temporadas:
        ids = en({"M19"}, y)
        if not ids:
            continue
        mismo = ids & en(PS, y)
        fila = {"anio": y, "m19": len(ids), "mismo": len(mismo)}
        sig = next((t for t in temporadas if t > y), None)
        if sig:
            sube, juv = ids & en(PS, sig), ids & en(JUV, sig)
            juv -= sube
            fila.update({"sig": sig, "subieron": len(sube), "juveniles": len(juv), "no": len(ids - sube - juv), "en_curso": sig == hoy and sig == ult})
            detalle[y] = {"subieron": sube, "juveniles": juv, "no": ids - sube - juv}
        else:
            detalle[y] = {"mismo": mismo, "todavia": ids - mismo}
        cohortes.append(fila)

    # ---- de dónde vienen los que juegan en plantel superior cada año
    fj = pd.read_sql("select player_id, anio, club from fichajes", sqlite3.connect(DB))
    fj = fj.assign(pid=fj.player_id.astype(str), anio=pd.to_numeric(fj.anio, errors="coerce"))
    primero = fj[fj.club.str.upper().str.strip() == "LOS 50"].groupby("pid").anio.min()
    origen = []
    for y in [t for t in temporadas if t >= DESDE]:
        ids = en(PS, y)
        de_juv = {x for x in ids if len(pl[(pl.pid == x) & pl.categoria.isin(JUV) & (pl.anio <= y)])}
        resto = ids - de_juv
        llegaron = {x for x in resto if primero.get(x, 0) >= y - 1}
        origen.append({"anio": y, "total": len(ids), "juveniles": len(de_juv), "llegaron": len(llegaron), "ya": len(resto - llegaron)})

    # ---- los nombres: la camada de este año y la del año pasado
    nom = lambda ids: sorted(nombre[x] for x in ids)
    actual, anterior = temporadas[-1], temporadas[-2] if len(temporadas) > 1 else None
    nombres = {"actual": {"anio": actual, "ya": nom(detalle.get(actual, {}).get("mismo", [])), "todavia": nom(detalle.get(actual, {}).get("todavia", []))}}
    if anterior in detalle and "subieron" in detalle[anterior]:
        nombres["anterior"] = {"anio": anterior, **{k: nom(v) for k, v in detalle[anterior].items()}}
    return {"cohortes": cohortes, "origen": origen, "nombres": nombres}


def alertas(p, i, d):
    """Amarillas y rojas de los últimos 150 días, sanciones del último año y conmociones del último año (en bruto)."""
    hoy = date.today()
    pl = _planteles(p, d).sort_values("f")
    cat_de = {_norm(n): c for n, c in zip(pl.jugador, pl.categoria)}  # la última categoría en la que jugó
    cat_pid = pl.groupby("pid").categoria.last().to_dict()
    desde = pd.Timestamp(hoy - timedelta(days=150))
    t = i[(i.equipo == "Los 50") & i.incidencia.isin(["Amarilla", "Roja"])].merge(p[["mid", "categoria", "f"]], on="mid")
    t = t[t.f >= desde]
    tarjetas = [{"j": r.jugador, "c": r.categoria, "f": r.f.strftime("%Y-%m-%d"), "t": "A" if r.incidencia == "Amarilla" else "R"}
                for r in t.sort_values("f", ascending=False).itertuples()]

    con = sqlite3.connect(DB)
    fecha = lambda s: pd.to_datetime(s, dayfirst=True, errors="coerce")
    s = pd.read_sql("select * from sanciones", con).assign(d=lambda x: fecha(x["Fecha de sanción"]), h=lambda x: fecha(x["Hasta"]))
    s = s[s.h >= pd.Timestamp(hoy - timedelta(days=365))]
    sanciones = [{"j": r.Jugador, "c": cat_de.get(_norm(r.Jugador), ""), "desde": r.d.strftime("%Y-%m-%d") if pd.notna(r.d) else "",
                  "hasta": r.h.strftime("%Y-%m-%d"), "art": str(r.Artículo or "")} for r in s.itertuples()]
    c = pd.read_sql("select * from conmociones", con).assign(f=lambda x: fecha(x["Fecha de conmoción"]), a=lambda x: fecha(x["Fecha de alta"]))
    c = c[c.f >= pd.Timestamp(hoy - timedelta(days=365))]
    conmociones = [{"j": r.Jugador, "c": cat_de.get(_norm(r.Jugador), ""), "f": r.f.strftime("%Y-%m-%d"),
                    "alta": r.a.strftime("%Y-%m-%d") if pd.notna(r.a) else ""} for r in c.itertuples()]
    return {"tarjetas": tarjetas, "sanciones": sanciones, "conmociones": conmociones}


if __name__ == "__main__":
    d = A.cargar()
    p, i = A.preparar(d)
    r = pase_plantel_superior(p, i, d)
    print("Los de M19 y qué hicieron la temporada siguiente:")
    for c in r["cohortes"]:
        if "sig" in c:
            print(f'  {c["anio"]} -> {c["sig"]}{" (en curso)" if c["en_curso"] else ""}: {c["m19"]} en M19 | jugaron en PS {c["subieron"]} ({round(100 * c["subieron"] / c["m19"])}%) | siguen en juveniles {c["juveniles"]} | no volvieron {c["no"]} | (ya en PS ese año: {c["mismo"]})')
        else:
            print(f'  {c["anio"]}: {c["m19"]} en M19 (ya jugaron en PS este año: {c["mismo"]})')
    print("De dónde vienen los del plantel superior:")
    for o in r["origen"]:
        print(f'  {o["anio"]}: {o["total"]} | de las juveniles {o["juveniles"]} | llegaron {o["llegaron"]} | ya estaban {o["ya"]}')
    n = r["nombres"]
    print("Nombres:", {k: (v if not isinstance(v, list) else len(v)) for k, v in n["actual"].items()}, {k: (v if not isinstance(v, list) else len(v)) for k, v in n.get("anterior", {}).items()})
    a = alertas(p, i, d)
    print("Alertas en bruto:", {k: len(v) for k, v in a.items()})
    print("  sanciones del último año:", a["sanciones"][-3:])
    print("  conmociones del último año:", a["conmociones"])
    print("  tarjetas (últimas 5):", a["tarjetas"][:5])
