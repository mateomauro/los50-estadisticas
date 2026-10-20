"""Reporte simple por jugador, segmentado por categoria (Primera / Intermedia / Pre-Intermedia).

Lee Los50_PlantelSuperior_historico.xlsx (generado por: python extraer_los50.py todos)
y escribe Los50_Jugadores_por_categoria.xlsx.
"""
from pathlib import Path

import pandas as pd
from openpyxl.formatting.rule import CellIsRule, DataBarRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

HERE = Path(__file__).parent
ORIGEN = HERE / "Los50_PlantelSuperior_historico.xlsx"
DESTINO = HERE / "Los50_Jugadores_por_categoria.xlsx"
CATEGORIAS = ["Primera", "Intermedia", "Pre-Intermedia"]


def armar(j: pd.DataFrame) -> pd.DataFrame:
    j = j[j.categoria.isin(CATEGORIAS)].copy()
    j["player_id"] = j.player_id.fillna(j.jugador).astype(str)
    j["_f"] = pd.to_datetime(j.fecha, format="%d/%m/%Y", errors="coerce")
    nombre = j.sort_values("_f").groupby("player_id").jugador.last()

    jugo = j.jugo == "Si"
    se_jugo = j.estado.isin(["Cerrado", "Iniciado"])
    j["pj"] = jugo.astype(int)
    j["banco"] = (jugo & (j.rol == "Suplente")).astype(int)
    j["sin_entrar"] = (~jugo & se_jugo).astype(int)
    j["anio_jugado"] = j.anio.astype(str).where(jugo)

    g = j.groupby(["categoria", "player_id"]).agg(
        pj=("pj", "sum"), banco=("banco", "sum"), sin_entrar=("sin_entrar", "sum"),
        temporadas=("anio_jugado", "nunique"),
        anios=("anio_jugado", lambda x: ", ".join(sorted(set(x.dropna())))),
        tries=("tries", "sum"), conversiones=("conversiones", "sum"), penales=("penales", "sum"),
        drops=("drops", "sum"), puntos=("puntos", "sum"),
        amarillas=("amarillas", "sum"), rojas=("rojas", "sum"),
    ).reset_index()
    g = g[g.pj > 0]  # solo jugadores que jugaron al menos un partido en esa categoria
    g.insert(1, "jugador", g.player_id.map(nombre))
    g = g.drop(columns="player_id")
    g["categoria"] = pd.Categorical(g.categoria, CATEGORIAS, ordered=True)
    g = g.sort_values(["categoria", "pj", "tries"], ascending=[True, False, False])
    return g.rename(columns={
        "jugador": "Jugador", "categoria": "Categoría", "pj": "Partidos jugados",
        "banco": "Entró desde el banco", "sin_entrar": "Convocado sin entrar",
        "temporadas": "Temporadas", "anios": "Años", "tries": "Tries",
        "conversiones": "Conversiones", "penales": "Penales", "drops": "Drops",
        "puntos": "Puntos totales", "amarillas": "Amarillas", "rojas": "Rojas",
    })[["Jugador", "Categoría", "Partidos jugados", "Entró desde el banco", "Convocado sin entrar",
        "Temporadas", "Años", "Tries", "Conversiones", "Penales", "Drops", "Puntos totales",
        "Amarillas", "Rojas"]]


# color principal / color de fila alternada / color de barras, por categoria
ESTILO = {
    "Primera":        ("1F3864", "E9EEF7", "5B7DB8"),
    "Intermedia":     ("1E5E3A", "E8F3EC", "4E9A6B"),
    "Pre-Intermedia": ("7A2E2E", "F6EBEB", "B5615F"),
}
BARRAS = ["Partidos jugados", "Tries", "Puntos totales"]
TEXTO = ["Jugador", "Categoría", "Años"]


def formatear(ws, cat, n, rango):
    principal, alterna, barra = ESTILO[cat]
    ncols = ws.max_column
    ult = get_column_letter(ncols)
    fin = n + 2  # fila 1 titulo, fila 2 encabezados

    ws.insert_rows(1)
    ws["A1"] = f"LOS 50 · {cat.upper()} · Estadísticas por jugador ({rango})"
    ws.merge_cells(f"A1:{ult}1")
    ws["A1"].font = Font(bold=True, size=14, color="FFFFFF")
    ws["A1"].fill = PatternFill("solid", fgColor=principal)
    ws["A1"].alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 30
    ws.row_dimensions[2].height = 36

    borde = Border(bottom=Side(style="thin", color="D9D9D9"))
    for c in ws[2]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=principal)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for r in range(3, fin + 1):
        fill = PatternFill("solid", fgColor=alterna) if r % 2 == 0 else None
        for c in ws[r]:
            if fill:
                c.fill = fill
            c.border = borde
            nombre_col = ws.cell(2, c.column).value
            c.alignment = Alignment(horizontal="left" if nombre_col in TEXTO else "center", vertical="center")
        ws.cell(r, 1).font = Font(bold=True)

    for i in range(1, ncols + 1):
        nombre_col = ws.cell(2, i).value
        letra = get_column_letter(i)
        if nombre_col in BARRAS:
            ws.conditional_formatting.add(f"{letra}3:{letra}{fin}",
                                          DataBarRule(start_type="num", start_value=0, end_type="max",
                                                      color=barra, showValue=True))
        if nombre_col in ("Amarillas", "Rojas"):
            color = "C9A400" if nombre_col == "Amarillas" else "C00000"
            ws.conditional_formatting.add(f"{letra}3:{letra}{fin}",
                                          CellIsRule(operator="greaterThan", formula=["0"],
                                                     font=Font(bold=True, color=color)))
        ancho = {"Jugador": 30, "Años": 34, "Categoría": 15}.get(nombre_col, 12)
        ws.column_dimensions[letra].width = ancho

    ws.freeze_panes = "B3"
    ws.auto_filter.ref = f"A2:{ult}{fin}"
    ws.sheet_properties.tabColor = principal
    ws.sheet_view.showGridLines = False


def main():
    j = pd.read_excel(ORIGEN, sheet_name="Planteles por partido")
    df = armar(j)
    anios = sorted(j.anio.dropna().astype(int).unique())
    rango = f"{anios[0]}–{anios[-1]}" if anios else ""
    with pd.ExcelWriter(DESTINO, engine="openpyxl") as xw:
        for cat in CATEGORIAS:
            d = df[df["Categoría"] == cat]
            d.to_excel(xw, sheet_name=cat, index=False)
            formatear(xw.sheets[cat], cat, len(d), rango)
    print(f"Listo: {DESTINO}")
    print(df.groupby("Categoría", observed=True).size().to_dict())


if __name__ == "__main__":
    main()
