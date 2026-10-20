"""Genera web/data.js para la pagina de estadisticas, a partir de Los50_PlantelSuperior_historico.xlsx.

Uso:  python exportar_web.py      (tambien lo corre "python extraer_los50.py todos" al final)
Usa la misma logica de conteo que reporte_jugadores.py. No incluye DNI.
"""
import json
import unicodedata
from datetime import date
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
ORIGEN = HERE / "Los50_PlantelSuperior_historico.xlsx"
DESTINO = HERE / "web" / "data.js"
CATEGORIAS = ["Primera", "Intermedia", "Pre-Intermedia"]
TIPOS = ["Try", "Try penal", "Conversión", "Penal", "Drop"]
DIARIOS = HERE / "Los50_Diarios_2008-2016.xlsx"
TIPO_D = {"try": "Try", "try penal": "Try penal", "conversion": "Conversión", "penal": "Penal", "drop": "Drop"}
VALOR_D = {"try": 5, "try penal": 7, "conversion": 2, "penal": 3, "drop": 3}
ALIAS_DIARIOS = {"BIGUE": "Biguá", "MAR DEL PLATA CLUB": "Mar del Plata Club", "UNIVERSITARIO DE BAHIA BLANCA": "Universitario (BB)",
                 "UNIVERSITARIO DE MAR DEL PLATA": "Universitario (MDP)", "EL NACIONAL": "El Nacional (BB)",
                 "ESTUDIANTES": "Estudiantes (Olavarría)", "ESTUDIANTES DE OLAVARRIA": "Estudiantes (Olavarría)",
                 "SOCIEDAD SPORTIVA": "Sociedad Sportiva (BB)", "ARGENTINO": "Argentino (BB)", "PUEYRREDON": "Pueyrredón",
                 "SPORTIVA": "Sociedad Sportiva (BB)", "EL NACIONAL BB": "El Nacional (BB)", "UNIVERSITARIO BB": "Universitario (BB)",
                 "ESTUDIANTES OLAVARRIA": "Estudiantes (Olavarría)", "SPORTING": "IPR Sporting"}

# Mismo club escrito de distintas formas en las planillas
RIVALES = {
    "ARGENTINO": "Argentino (BB)", "ARGENTINO B B": "Argentino (BB)", "ARGENTINO b b": "Argentino (BB)",
    "ARGENTINO DE BAHIA BLANCA": "Argentino (BB)",
    "BIGUA": "Biguá", "CAMPO DE PATO": "Campo de Pato", "CORONEL SUAREZ": "Coronel Suárez", "DFSARROLLO NORTE": "Desarrollo Norte",
    "EL NACIONAL": "El Nacional (BB)", "EL NACIONAL B B": "El Nacional (BB)",
    "ESTUDIANTES OLAV": "Estudiantes (Olavarría)",
    "GIM Y ESG PRG": "Gimnasia y Esgrima (Pergamino)", "GIM. Y ESG. PRG": "Gimnasia y Esgrima (Pergamino)",
    "GRAL PICO": "Gral. Pico", "IPR SPORTING": "IPR Sporting", "SPORTING": "IPR Sporting",
    "KAMIKAZES": "Kamikazes", "KAMIKAZES COL": "Kamikazes",
    "MAR DEL PLATA": "Mar del Plata Club", "NAUTICO": "Náutico",
    "NECOCHEA": "Necochea RC", "NECOCHEA R C": "Necochea RC",
    "PUEYRREDON": "Pueyrredón", "PUEYRREDON - MAR DEL PLATA": "Pueyrredón", "PUEYRREDON - MDP": "Pueyrredón",
    "PUEYRREDON MDP": "Pueyrredón", "RACING CHV": "Racing (Chivilcoy)", "SOC SPORTIVA": "Sociedad Sportiva (BB)",
    "UNION DEL SUR": "Unión del Sur",
    "UNIVERSITARIO": "Universitario (MDP)", "UNIVERSITARIO - MAR DEL PLATA - MDP": "Universitario (MDP)",
    "UNIVERSITARIO - MDP": "Universitario (MDP)",
    "UNIVERSITARIO B B": "Universitario (BB)", "UNIVERSITARIO BB": "Universitario (BB)",
}


def rival(nombre):
    n = str(nombre).strip()
    return RIVALES.get(n, n.title())


def nombre_lindo(n):
    n = " ".join(str(n).split())
    return n.title() if n.islower() or n.isupper() else n


def exportar_diarios(nombres_oficiales, rivales, torneos):
    """Datos de diarios (El Eco de Tandil 2008-2016), aparte de los oficiales. Si el jugador está en la UAR usa su mismo id."""
    if not DIARIOS.exists():
        return None
    x = pd.read_excel(DIARIOS, sheet_name=["Detalle de puntos", "Formaciones por partido", "Partidos"])
    dp, fp = x["Detalle de puntos"], x["Formaciones por partido"]
    cat_partido = x["Partidos"]["Categoría"].str.replace(" (supuesta)", "", regex=False)
    resultados = [int((cat_partido == c).sum()) for c in CATEGORIAS]
    dp, fp = dp[dp["Categoría"].isin(CATEGORIAS)], fp[fp["Categoría"].isin(CATEGORIAS)]

    por_nombre = {}
    for pid, n in nombres_oficiales.items():
        por_nombre.setdefault(n, []).append(pid)
    ids, jugadores = {}, {}

    def did(nombre):
        n = nombre_lindo(nombre)
        if n not in ids:
            pid = por_nombre[n][0] if len(por_nombre.get(n, [])) == 1 else f"d{len(ids) + 1}"
            ids[n] = pid
            jugadores[pid] = n
        return ids[n]

    def rival_d(s):
        k = sin_acentos(str(s)).upper().strip().replace("(BAHIA BLANCA)", "BB").replace("(", "").replace(")", "")
        return RIVALES.get(k) or ALIAS_DIARIOS.get(k) or str(s).strip()

    def fecha_iso(s):
        f = pd.to_datetime(s, format="%d/%m/%Y", errors="coerce")
        return f.strftime("%Y-%m-%d") if pd.notna(f) else ""

    def idx(lista, v):
        if v not in lista:
            lista.append(v)
        return lista.index(v)

    urls = []
    acum, jugados = {}, {}
    for r in dp.itertuples():
        k = (did(r.Jugador), int(r.Año), CATEGORIAS.index(r.Categoría))
        a = acum.setdefault(k, [0] * 7)  # titular, ingresó, tries, conv, pen, drops, puntos
        c = int(r.Cantidad)
        a[{"try": 2, "try penal": 2, "conversion": 3, "penal": 4, "drop": 5}[r.Tipo]] += c
        a[6] += c * VALOR_D[r.Tipo]
        jugados.setdefault(k, set()).add((r.Fecha, r.Rival))   # si anotó, jugó
    for r in fp.itertuples():
        k = (did(r.Jugador), int(r.Año), CATEGORIAS.index(r.Categoría))
        acum.setdefault(k, [0] * 7)[0 if r.Rol == "Titular" else 1] += 1
        jugados.setdefault(k, set()).add((r.Fecha, r.Rival))   # está en la formación publicada
    # pj = partidos confirmados por el diario (formación publicada o anotó puntos): jugó por lo menos esos
    stats = [[*k, len(jugados.get(k, ())), *v] for k, v in sorted(acum.items())]
    puntos = [[did(r.Jugador), int(r.Año), CATEGORIAS.index(r.Categoría), fecha_iso(r.Fecha), idx(rivales, rival_d(r.Rival)),
               idx(torneos, str(r.Torneo)) if pd.notna(r.Torneo) else -1, TIPOS.index(TIPO_D[r.Tipo]), int(r.Cantidad), idx(urls, r.Fuente)]
              for r in dp.sort_values("Año", ascending=False).itertuples()]
    puntos.sort(key=lambda p: (p[1], p[3]), reverse=True)

    # resultados del equipo según los diarios
    partidos = []
    for r in x["Partidos"].itertuples():
        cat = str(r.Categoría).replace(" (supuesta)", "")
        if cat not in CATEGORIAS or pd.isna(r[x["Partidos"].columns.get_loc("Los 50") + 1]):
            continue
        tl, tr = r[x["Partidos"].columns.get_loc("Los 50") + 1], r[x["Partidos"].columns.get_loc("Rival tantos") + 1]
        cond = str(r[x["Partidos"].columns.get_loc("Local/Visitante") + 1] or "")
        partidos.append([int(r.Año), CATEGORIAS.index(cat), fecha_iso(r.Fecha), idx(rivales, rival_d(r.Rival)),
                         idx(torneos, str(r.Torneo)) if pd.notna(r.Torneo) else -1, cond[:1] if cond in ("Local", "Visitante") else "",
                         int(tl), int(tr), "d", idx(urls, r.Fuente), int("(supuesta)" in str(r.Categoría))])
    print(f"  diarios: {len(jugadores)} jugadores ({sum(1 for p in jugadores if not str(p).startswith('d'))} también en la UAR) | "
          f"filas {len(stats)} | puntos {len(puntos)} | resultados {len(partidos)}")
    return {"columnas": ["pj", "form_tit", "form_ing", "tries", "conversiones", "penales", "drops", "puntos"],
            "jugadores": jugadores, "stats": stats, "puntos": puntos, "urls": urls,
            "resultados_por_categoria": resultados, "partidos": partidos}


def sin_acentos(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def main():
    x = pd.read_excel(ORIGEN, sheet_name=None)
    j, inc = x["Planteles por partido"], x["Incidencias"]
    j = j[j.categoria.isin(CATEGORIAS)].copy()
    j["player_id"] = j.player_id.fillna(j.jugador).astype(str).str.replace(r"\.0$", "", regex=True)
    j["_f"] = pd.to_datetime(j.fecha, format="%d/%m/%Y", errors="coerce")
    nombres = j.sort_values("_f").groupby("player_id").jugador.last().map(nombre_lindo)

    jugo = j.jugo == "Si"
    j["pj"] = jugo.astype(int)
    j["banco"] = (jugo & (j.rol == "Suplente")).astype(int)
    j["sin"] = (~jugo & j.estado.isin(["Cerrado", "Iniciado"])).astype(int)
    cols = ["pj", "banco", "sin", "tries", "conversiones", "penales", "drops", "puntos", "amarillas", "rojas"]
    g = j.groupby(["player_id", "anio", "categoria"])[cols].sum().reset_index()
    g = g[(g.pj > 0) | (g.sin > 0)]
    stats = [[r.player_id, int(r.anio), CATEGORIAS.index(r.categoria)] + [int(getattr(r, c)) for c in cols]
             for r in g.itertuples()]

    # detalle de cada punto, solo de jugadores que figuran en el plantel de ese partido (igual que los totales)
    inc = inc[inc.categoria.isin(CATEGORIAS) & inc.incidencia.isin(TIPOS) & inc.player_id.notna()].copy()
    inc["player_id"] = inc.player_id.astype(str).str.replace(r"\.0$", "", regex=True)
    en_plantel = set(zip(j.partido_id, j.player_id))
    inc = inc[[(a, b) in en_plantel for a, b in zip(inc.partido_id, inc.player_id)]]
    inc["fecha_dt"] = pd.to_datetime(inc.fecha, format="%d/%m/%Y", errors="coerce")
    inc["rival_n"] = inc.rival.map(rival)
    rivales = sorted(inc.rival_n.unique())
    torneos = sorted(inc.torneo.unique())
    puntos = [[r.player_id, int(r.anio), CATEGORIAS.index(r.categoria), r.fecha_dt.strftime("%Y-%m-%d"),
               rivales.index(r.rival_n), torneos.index(r.torneo), str(r.tiempo), int(r.minuto) if pd.notna(r.minuto) else None,
               TIPOS.index(r.incidencia)]
              for r in inc.sort_values("fecha_dt", ascending=False).itertuples()]

    usados = {s[0] for s in stats}
    diarios = exportar_diarios(nombres, rivales, torneos)

    # resultados oficiales del equipo (partidos jugados con resultado)
    po = x["Partidos"]
    po = po[po.categoria.isin(CATEGORIAS) & po.resultado.isin(["G", "E", "P"])].copy()
    po["fecha_dt"] = pd.to_datetime(po.fecha, format="%d/%m/%Y", errors="coerce")
    partidos = []
    for r in po.itertuples():
        rv = rival(r.rival)
        if rv not in rivales:
            rivales.append(rv)
        if r.torneo not in torneos:
            torneos.append(r.torneo)
        partidos.append([int(r.anio), CATEGORIAS.index(r.categoria), r.fecha_dt.strftime("%Y-%m-%d"), rivales.index(rv),
                         torneos.index(r.torneo), "L" if r.condicion == "Local" else "V", int(r.tantos_los50), int(r.tantos_rival), "o", -1, 0])
    if diarios:
        partidos += diarios.pop("partidos")
    partidos.sort(key=lambda p: (p[0], p[2]), reverse=True)
    data = {
        "actualizado": date.today().strftime("%d/%m/%Y"),
        "categorias": CATEGORIAS,
        "columnas": cols,
        "tipos": TIPOS,
        "jugadores": {pid: nombres[pid] for pid in sorted(usados)},
        "rivales": rivales,
        "torneos": torneos,
        "stats": stats,
        "puntos": puntos,
        "partidos": partidos,
        "diarios": diarios,
    }
    DESTINO.parent.mkdir(exist_ok=True)
    # como script (no .json) para que index.html funcione tambien abriendolo con doble clic
    DESTINO.write_text("window.DATA=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
                       encoding="utf-8")
    print(f"Listo: {DESTINO} ({DESTINO.stat().st_size // 1024} KB) | jugadores {len(usados)} | "
          f"filas {len(stats)} | puntos {len(puntos)}")


if __name__ == "__main__":
    main()
