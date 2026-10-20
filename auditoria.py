"""Audita Los50_PlantelSuperior_historico.xlsx contra los datos oficiales de cada torneo en bd.uar.com.ar:
  - tabla "Goleadores" (top 10 del torneo): tries y tantos de jugadores de LOS 50
  - export "Titulares y suplentes": distribucion de jugadores por cantidad de partidos como titular / suplente
Ademas marca partidos con datos incompletos. Escribe auditoria.xlsx.
"""
import re
import unicodedata
from collections import Counter
from pathlib import Path

import pandas as pd
import xlrd
from bs4 import BeautifulSoup

from uar_session import get, login

HERE = Path(__file__).parent
x = pd.read_excel(HERE / "Los50_PlantelSuperior_historico.xlsx", sheet_name=None)
P, J, I = x["Partidos"], x["Planteles por partido"], x["Incidencias"]
P = P[P.categoria.isin(["Primera", "Intermedia", "Pre-Intermedia"])]
J = J[J.partido_id.isin(P.partido_id)]
I = I[I.partido_id.isin(P.partido_id)]


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return frozenset(re.findall(r"[a-z]+", s))


s = login()
filas = []
for tid, tp in P.groupby("torneo_id"):
    cerr = tp[tp.estado == "Cerrado"].partido_id
    jt = J[J.partido_id.isin(cerr)]
    it = I[I.partido_id.isin(cerr)]
    f = {"anio": tp.anio.mode()[0], "categoria": tp.categoria.iloc[0], "torneo_id": tid, "torneo": tp.torneo.iloc[0],
         "partidos": len(tp), "cerrados": len(cerr)}

    # --- goleadores oficiales
    html = get(s, f"/championships/view/{tid}").text
    soup = BeautifulSoup(html, "lxml")
    tab = soup.find(id="championship-tab-topscorers")
    mios = it.groupby("player_id").agg(tries=("incidencia", lambda c: c.str.lower().str.startswith("try").sum()),
                                      puntos=("puntos", "sum"), jugador=("jugador", "first"))
    mios["k"] = mios.jugador.map(norm)
    ok = mal = 0
    detalle = []
    for tr in (tab.select("tbody tr") if tab else []):
        td = [t.get_text(" ", strip=True) for t in tr.find_all("td")]
        if len(td) < 4 or "LOS 50" not in td[0].upper():
            continue
        m = mios[mios.k == norm(td[1])]
        if len(m) == 1 and int(m.tries.iloc[0]) == int(td[3]) and int(m.puntos.iloc[0]) == int(td[2]):
            ok += 1
        else:
            mal += 1
            detalle.append(f"{td[1]}: oficial {td[3]} tries/{td[2]} pts, mio "
                           + (f"{int(m.tries.iloc[0])}/{int(m.puntos.iloc[0])}" if len(m) == 1 else "no encontrado"))
    f["goleadores_ok"], f["goleadores_dif"], f["goleadores_detalle"] = ok, mal, "; ".join(detalle)

    # --- export titulares y suplentes
    try:
        r = get(s, f"/Championships/exportByCondition/{tid}")
        wb = xlrd.open_workbook(file_contents=r.content, ignore_workbook_corruption=True, logfile=open("nul", "w"))
        sh = wb.sheet_by_index(0)
        head = sh.row_values(0)
        fila = next((sh.row_values(i) for i in range(1, sh.nrows) if "LOS 50" in str(sh.row_values(i)[0]).upper()), None)
        if fila is None:
            f["titulares"] = "sin fila LOS 50 en export"
        else:
            of = {h: int(float(v)) for h, v in zip(head[1:], fila[1:]) if v not in ("", None)}
            ofT = {int(h.split("-")[1]): v for h, v in of.items() if h.startswith("Titular")}
            ofS = {int(h.split("-")[1]): v for h, v in of.items() if h.startswith("Suplente")}
            miT = Counter(jt[jt.rol == "Titular"].groupby("player_id").size())
            sup = jt[jt.rol == "Suplente"]
            miS_lista = Counter(sup.groupby("player_id").size())
            miS_jugo = Counter(sup[sup.jugo == "Si"].groupby("player_id").size())
            f["titulares"] = "OK" if dict(miT) == ofT else f"oficial {ofT} / mio {dict(miT)}"
            f["suplentes"] = ("OK (convocados)" if dict(miS_lista) == ofS else
                              "OK (los que entraron)" if dict(miS_jugo) == ofS else
                              f"oficial {ofS} / convocados {dict(miS_lista)} / entraron {dict(miS_jugo)}")
    except Exception as e:  # noqa: BLE001
        f["titulares"] = f"error export: {e}"

    # --- calidad de partidos
    cj = jt.groupby("partido_id")
    f["sin_plantel"] = int((~cerr.isin(jt.partido_id)).sum())
    tit = jt[jt.rol == "Titular"].groupby("partido_id").size().reindex(jt.partido_id.unique(), fill_value=0)
    f["con_menos_de_15_titulares"] = int((tit < 15).sum())
    ingresos = it[it.incidencia.str.startswith("Ingres", na=False)].groupby("partido_id").size()
    con_banco = jt[jt.rol == "Suplente"].partido_id.unique()
    f["sin_cambios_cargados"] = int(sum(1 for pid in con_banco if ingresos.get(pid, 0) == 0))
    f["no_cerrados"] = ", ".join(f"{e}:{n}" for e, n in tp[tp.estado != "Cerrado"].estado.value_counts().items())
    filas.append(f)
    print(f["anio"], f["categoria"], f["torneo"][:45], "| gol", ok, mal, "| tit", str(f.get("titulares"))[:40],
          "| sup", str(f.get("suplentes"))[:40], "| sin plantel", f["sin_plantel"], "| sin cambios", f["sin_cambios_cargados"])

out = pd.DataFrame(filas).sort_values(["anio", "categoria"])
out.to_excel(HERE / "auditoria.xlsx", index=False)
print("\nGuardado auditoria.xlsx")
