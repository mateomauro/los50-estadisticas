"""Perfil corporal y perfil físico de cada puesto, de los Pumas / Plan de Alto Rendimiento de la UAR, para Entrenadores → Los puestos.

Fuentes (material de Magali Fazzi, octubre 2026; están en material_externo/magali/perfiles_pumas, no se suben a GitHub):
  PERFIL CORPORAL PUMAS.pdf  (área de nutrición de la UAR): peso, altura, forma del cuerpo, masa ósea, masa muscular e índice músculo-óseo.
  PERFILES FÍSICOS.pdf       (área de preparación física de la UAR): tests por puesto y por edad (M18, M20, Senior).
Los valores se pasaron a mano de los PDF (son imágenes). Son de jugadores de academia de 18 años en adelante: para M13 a M16 sirven de dirección, no de meta.

Uso:  from perfiles_pumas import por_puesto      ->  por_puesto(n) = {"cuerpo": {...}, "fisico": {...}}
      python perfiles_pumas.py                    ->  muestra un resumen, para revisar
Cada test: [mínimo, objetivo bajo, objetivo alto] por edad. En fuerza, los objetivos son un múltiplo del peso corporal ("1,0" = 1,0 × peso).
En Bronco los tres valores son segundos (objetivo bajo, objetivo alto y máximo); con menos tiempo es mejor.
"""

EDADES = ["M18", "M20", "Senior"]

# ---------------------------------------------------------------- perfil corporal (nutrición)
# peso, altura, masa ósea (kg), masa muscular (kg), IMO promedio, forma del cuerpo
CUERPO = {
    1: {"peso": "mín. 115 kg", "altura": "185 cm", "mo": "mín. 12,5 · ideal >13", "mm": ">60 · ideal 63-65", "imo": "5",
        "forma": ["Cuello corto y ancho", "Caderas muy anchas", "Relación tronco/piernas alta", "Piernas cortas", "Caja grande", "Circunferencias grandes"]},
    2: {"peso": "mín. 107 kg · promedio 110", "altura": "183 cm", "mo": "mín. 12 · ideal >12,5", "mm": "60-62", "imo": "5",
        "forma": ["Cuello corto y ancho", "Caderas anchas", "Relación tronco/piernas muy alta", "Piernas muy cortas", "Caja grande", "Circunferencias grandes"]},
    3: {"peso": "mín. 120 kg", "altura": "185 cm", "mo": "mín. 13 · ideal >14", "mm": ">67", "imo": "4,8 a 5",
        "forma": ["Cuello corto y ancho", "Caderas muy anchas", "Relación tronco/piernas alta", "Piernas cortas", "Caja grande", "Circunferencias grandes"]},
    4: {"peso": "110 a 112 kg", "altura": "mín. 194 cm · ideal 200", "mo": "promedio 12", "mm": "61-65", "imo": "5,2",
        "forma": ["Nivel adiposo bajo", "Largo y más fino (ectomorfo)", "Brazos y manos largos", "Relación tronco/piernas normal a baja", "Piernas largas"]},
    5: {"peso": "ideal 120 kg", "altura": "198 a 200 cm", "mo": "mín. 13", "mm": ">65", "imo": "4,9",
        "forma": ["Estructura grande (más mesomorfo)", "Caderas anchas", "Brazos y manos largos", "Relación tronco/piernas normal a alta", "Circunferencias grandes"]},
    6: {"peso": "mín. 110 kg · promedio 115", "altura": "190 a 192 cm", "mo": "mín. 12 a 12,5", "mm": "62-65", "imo": "5",
        "forma": ["Caderas anchas", "Circunferencias grandes", "Relación tronco/piernas normal a alta"]},
    7: {"peso": "promedio 105 kg", "altura": "186 a 190 cm (rango amplio)", "mo": "promedio 11 a 11,5", "mm": "58-62", "imo": "5,1",
        "forma": ["Nivel adiposo bajo", "Relación tronco/piernas normal a baja", "Más circunferencia en el tren superior", "Menos circunferencia en el tren inferior"]},
    8: {"peso": "105 a 110 kg", "altura": "188 a 193 cm", "mo": "promedio 12 a 12,5", "mm": "61-63", "imo": "5",
        "forma": ["Brazos y manos largos", "Relación tronco/piernas normal a baja (si salta en el line) o normal a alta (si lleva la pelota)",
                  "Piernas largas (el que salta)", "Circunferencias grandes (el que lleva la pelota)"]},
    9: {"peso": "79 a 83 kg (varía)", "altura": "promedio 176 cm (varía)", "mo": "promedio 9,3", "mm": None, "imo": "5",
        "forma": ["Nivel adiposo bajo", "Brazos y manos largos", "Piernas cortas"]},
    10: {"peso": "promedio 84 kg (varía)", "altura": "promedio 178 cm (varía)", "mo": "promedio 9,2", "mm": None, "imo": "5,2",
         "forma": ["Brazos y manos largos"]},
    11: {"peso": "84 a 86 kg (varía)", "altura": "170 a 192 cm (varía)", "mo": "promedio 9,6 a 10", "mm": "44-50", "imo": "5",
         "forma": ["Masa adiposa baja", "Brazos y manos largos", "Wing de aire (el alto): caderas finas, relación tronco/piernas baja, piernas largas",
                   "Wing de piso (el bajo): relación tronco/piernas alta, piernas cortas"]},
    12: {"peso": "ideal 96 kg", "altura": "185 a 186 cm", "mo": "promedio 10,5 a 11", "mm": "53-54", "imo": "5,1",
         "forma": ["Masa adiposa: flexibilidad", "Circunferencias grandes", "Envergadura grande"]},
    13: {"peso": "promedio 94 kg", "altura": "185 a 186 cm", "mo": "promedio 10,5 · ideal 11 a 11,5", "mm": "51-52", "imo": "5,1",
         "forma": ["Masa adiposa baja", "Envergadura grande"]},
    15: {"peso": "promedio 92 kg (varía)", "altura": "promedio 186 cm (varía)", "mo": "promedio 10", "mm": "52-54", "imo": "5,1",
         "forma": ["Masa adiposa baja", "Brazos y manos largos", "Relación tronco/piernas baja", "Piernas largas"]},
}
CUERPO[14] = CUERPO[11]

# ---------------------------------------------------------------- perfil físico (preparación física), por grupo de puestos
t3 = lambda *x: [list(a) for a in x]   # una fila por edad: M18, M20, Senior

# fuerza: [mínimo en kg, objetivo bajo (× peso), objetivo alto (× peso)]
_COMUN = {  # apertura, centros: lo mismo
    "banco": t3((95, "1,3", "1,4"), (105, "1,3", "1,5"), (115, "1,4", "1,6")),
    "dominadas": t3((105, "1,3", "1,4"), (115, "1,4", "1,5"), (125, "1,5", "1,6")),
    "sentadilla": t3((125, "1,5", "1,7"), (135, "1,7", "1,9"), (145, "1,8", "2,0")),
    "salto_h": t3(("2,35", "2,40", "2,60"), ("2,45", "2,50", "2,65"), ("2,50", "2,55", "2,70")),
    "salto_v": t3(("47,5", "50,0", "55,0"), ("50,0", "52,5", "57,5"), ("52,5", "55,0", "60,0")),
    "bronco": t3((285, 300, 305), (280, 295, 300), (280, 295, 295)),
}

FISICO = {
    "pilares": {
        "nombre": "Pilares (1 y 3)",
        "banco": t3((110, "1,0", "1,1"), (120, "1,1", "1,3"), (130, "1,2", "1,4")),
        "dominadas": t3((125, "1,1", "1,2"), (130, "1,1", "1,3"), (135, "1,2", "1,4")),
        "sentadilla": t3((155, "1,4", "1,6"), (165, "1,4", "1,8"), (175, "1,5", "1,9")),
        "salto_h": t3(("2,10", "2,15", "2,35"), ("2,20", "2,25", "2,40"), ("2,30", "2,35", "2,50")),
        "salto_v": t3(("35,0", "37,5", "42,5"), ("37,5", "40,0", "45,0"), ("40,0", "42,5", "47,5")),
        "bronco": t3((320, 340, 345), (315, 335, 340), (310, 330, 335)),
        "velocidad": None},
    "hooker": {
        "nombre": "Hooker (2)",
        "banco": t3((105, "1,1", "1,3"), (115, "1,2", "1,4"), (125, "1,2", "1,5")),
        "dominadas": t3((120, "1,2", "1,3"), (125, "1,3", "1,4"), (130, "1,3", "1,5")),
        "sentadilla": t3((145, "1,6", "1,9"), (155, "1,6", "2,0"), (165, "1,7", "2,1")),
        "salto_h": t3(("2,15", "2,20", "2,40"), ("2,25", "2,30", "2,45"), ("2,30", "2,35", "2,55")),
        "salto_v": t3(("35,0", "37,5", "42,5"), ("37,5", "40,0", "45,0"), ("40,0", "42,5", "47,5")),
        "bronco": t3((315, 335, 340), (310, 330, 335), (305, 325, 330)),
        "velocidad": None},
    "segunda": {
        "nombre": "Segunda línea (4 y 5)",
        "banco": t3((100, "1,0", "1,2"), (110, "1,1", "1,2"), (120, "1,1", "1,3")),
        "dominadas": t3((120, "1,1", "1,2"), (130, "1,2", "1,4"), (140, "1,3", "1,4")),
        "sentadilla": t3((130, "1,3", "1,6"), (140, "1,4", "1,8"), (150, "1,5", "1,9")),
        "salto_h": t3(("2,25", "2,30", "2,50"), ("2,30", "2,35", "2,55"), ("2,40", "2,45", "2,60")),
        "salto_v": t3(("40,0", "42,5", "47,5"), ("42,5", "45,0", "50,0"), ("45,0", "47,5", "52,5")),
        "bronco": t3((305, 325, 330), (300, 320, 325), (295, 310, 315)),
        "velocidad": {"m10": ["1,70", "1,70", "1,75"], "m30": ["4,15", "4,25", "4,25"], "vmax": ["21", "23", "24"]}},
    "tercera": {
        "nombre": "Terceras líneas (6, 7 y 8)",
        "banco": t3((105, "1,1", "1,3"), (115, "1,2", "1,4"), (125, "1,3", "1,4")),
        "dominadas": t3((120, "1,2", "1,3"), (130, "1,3", "1,4"), (140, "1,4", "1,5")),
        "sentadilla": t3((135, "1,6", "1,9"), (145, "1,7", "2,0"), (155, "1,8", "2,1")),
        "salto_h": t3(("2,40", "2,45", "2,65"), ("2,45", "2,50", "2,70"), ("2,50", "2,55", "2,75")),
        "salto_v": t3(("45,0", "47,5", "52,5"), ("47,5", "50,0", "55,0"), ("50,0", "52,5", "57,5")),
        "bronco": t3((295, 315, 320), (290, 305, 310), (290, 300, 305)),
        "velocidad": {"m10": ["1,60", "1,65", "1,65"], "m30": ["4,05", "4,10", "4,05"], "vmax": ["28", "28", "29"]}},
    "medio": {
        "nombre": "Medio scrum (9)",
        "banco": t3((90, "1,3", "1,4"), (100, "1,4", "1,5"), (110, "1,4", "1,6")),
        "dominadas": t3((100, "1,3", "1,4"), (110, "1,4", "1,5"), (120, "1,5", "1,6")),
        "sentadilla": t3((120, "1,5", "1,7"), (130, "1,7", "1,9"), (140, "1,8", "2,0")),
        "salto_h": t3(("2,30", "2,35", "2,50"), ("2,40", "2,45", "2,65"), ("2,45", "2,50", "2,70")),
        "salto_v": t3(("47,5", "50,0", "55,0"), ("50,0", "52,5", "57,5"), ("52,5", "55,0", "60,0")),
        "bronco": t3((280, 300, 305), (280, 290, 295), (275, 285, 290)),
        "velocidad": {"m10": ["1,55", "1,60", "1,70"], "m30": ["3,90", "3,95", "4,05"], "vmax": ["29", "30", "30"]}},
    "apertura": dict(_COMUN, nombre="Apertura (10)", velocidad={"m10": ["1,60", "1,55", "1,60"], "m30": ["4,00", "3,95", "3,90"], "vmax": ["29", "30", "30"]}),
    "centros": dict(_COMUN, nombre="Centros (12 y 13)", velocidad={"m10": ["1,60", "1,55", "1,60"], "m30": ["4,00", "3,95", "3,90"], "vmax": ["30", "31", "32"]}),
    "wing": {
        "nombre": "Wings y full back (11, 14 y 15)",
        "banco": t3((95, "1,3", "1,4"), (105, "1,3", "1,5"), (115, "1,4", "1,6")),
        "dominadas": t3((105, "1,3", "1,4"), (115, "1,4", "1,5"), (125, "1,5", "1,6")),
        "sentadilla": t3((120, "1,5", "1,7"), (130, "1,7", "1,9"), (140, "1,8", "2,0")),
        "salto_h": t3(("2,40", "2,45", "2,65"), ("2,50", "2,55", "2,70"), ("2,55", "2,60", "2,75")),
        "salto_v": t3(("50,0", "52,5", "57,5"), ("52,5", "55,0", "60,0"), ("55,0", "57,5", "62,5")),
        "bronco": t3((285, 300, 305), (280, 290, 295), (275, 285, 290)),
        "velocidad": {"m10": ["1,60", "1,55", "1,55"], "m30": ["3,90", "3,85", "3,85"], "vmax": ["31", "33", "34"]}},
}
GRUPO = {1: "pilares", 3: "pilares", 2: "hooker", 4: "segunda", 5: "segunda", 6: "tercera", 7: "tercera", 8: "tercera",
         9: "medio", 10: "apertura", 12: "centros", 13: "centros", 11: "wing", 14: "wing", 15: "wing"}


def por_puesto(n):
    """El perfil corporal y el físico del puesto n (el número de la camiseta)."""
    return {"cuerpo": CUERPO[n], "fisico": dict(FISICO[GRUPO[n]], edades=EDADES)}


if __name__ == "__main__":
    pasos = ("banco", "dominadas", "sentadilla", "salto_h", "salto_v", "bronco")
    for g, f in FISICO.items():
        assert all(len(f[k]) == 3 and all(len(r) == 3 for r in f[k]) for k in pasos), g
        assert f["velocidad"] is None or all(len(v) == 3 for v in f["velocidad"].values()), g
    for n in range(1, 16):
        assert n in CUERPO and n in GRUPO, n
        assert por_puesto(n)["fisico"]["nombre"]
    print(f"Listo: {len(CUERPO)} perfiles corporales y {len(FISICO)} grupos de perfil físico, todo completo.")
    for n in (1, 9, 15):
        p = por_puesto(n)
        print(f'  {n}: {p["cuerpo"]["peso"]} · {p["cuerpo"]["altura"]} · salto horizontal M18 {p["fisico"]["salto_h"][0]} · bronco M18 {p["fisico"]["bronco"][0]}')
