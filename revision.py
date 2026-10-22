"""Revisión de datos: lo que es seguro se arregla solo y lo dudoso se le pregunta al club en la página "Revisar datos".

Uso:
  python revision.py respuestas   trae lo que contestó el club en la página y lo guarda en revision/respuestas.json
  python revision.py repetidos    fichas repetidas en la BD UAR: las seguras se juntan solas (necesita datos_uar/los50.db)
  python revision.py preguntas    arma las preguntas de la página (repetidos dudosos + casos raros de las planillas)

Archivos de la carpeta revision/ (se guardan en el repositorio):
  respuestas.json  lo que contestó el club, con todo lo necesario para aplicarlo (lo usa extraer_los50.py)
  unificar.json    ficha repetida -> ficha que se usa: las seguras y las que el club confirmó (lo usa extraer_los50.py)
  repetidos.json   repetidos dudosos, para preguntar
  planillas.json   casos raros de las planillas, para preguntar (lo arma revisar_planillas.py)
  preguntas.json   lo que muestra la página, sin lo ya contestado (va adentro de functions/api/revision.js al publicar)

Seguro (se junta solo): mismo nombre (sin importar tildes, orden o un segundo nombre de más), misma fecha de
nacimiento y nunca jugaron el mismo partido. Mellizos (mismo apellido y fecha, otro nombre) no se juntan nunca.
Dudoso (se pregunta): nombre escrito parecido con la misma fecha, o mismo nombre con la fecha casi igual (mal tipeada).
Solo se pregunta si las dos fichas tienen partidos con el club: si una no jugó nunca, juntarlas no cambia ningún número.
"""
import itertools
import json
import os
import re
import sqlite3
import sys
import unicodedata
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

import requests
from dotenv import load_dotenv

HERE = Path(__file__).parent
CARPETA = HERE / "revision"
DB = HERE / "datos_uar" / "los50.db"
SITIO = os.environ.get("SITIO", "https://los50-jugadores.pages.dev")
CATS = ["Primera", "Intermedia", "Pre-Intermedia", "M23", "M19", "M17", "M16", "M15", "M14", "M13"]
OPCIONES_REPETIDO = [["si", "Sí, es la misma persona"], ["no", "No, son distintos"], ["nose", "No sé"]]


def leer(nombre, vacio):
    f = CARPETA / nombre
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else vacio


def escribir(nombre, datos):
    CARPETA.mkdir(exist_ok=True)
    (CARPETA / nombre).write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# ---------- respuestas del club ----------
def respuestas():
    load_dotenv(HERE / ".env")
    clave = os.environ.get("CLAVE_REVISION")
    if not clave:
        print("Sin CLAVE_REVISION: no se bajan respuestas")
        return
    try:
        r = requests.get(f"{SITIO}/api/revision", headers={"x-clave": clave}, timeout=30)
        r.raise_for_status()
        datos = r.json()
    except (requests.RequestException, ValueError) as e:
        print(f"No se pudieron bajar las respuestas ({e}): quedan para la próxima")  # no frena la actualización
        return
    preguntas = {p["id"]: p for p in datos["preguntas"]}
    guardadas = leer("respuestas.json", {})
    nuevas = 0
    for pid, resp in datos["respuestas"].items():
        p = preguntas.get(pid)
        if not p or not resp:
            continue
        fila = {"tipo": p["tipo"], "respuesta": resp["respuesta"], "fecha": resp.get("fecha"), "pregunta": p["titulo"]}
        if p["tipo"] == "repetido":
            fila["ids"] = p["ids"]
            fila["nombres"] = [f["nombre"] for f in p["fichas"]]
        else:
            fila["claves"] = p["claves"]
            if resp["respuesta"] == "otro":
                quien = next((j for j in p["jugadores"] if j[0] == resp.get("quien")), None)
                if not quien:
                    continue
                fila.update(player_id=quien[0], dorsal=quien[1], jugador=quien[2])
        nuevas += guardadas.get(pid) != fila
        guardadas[pid] = fila
    escribir("respuestas.json", dict(sorted(guardadas.items())))
    print(f"Respuestas del club: {len(datos['respuestas'])} en la página, {nuevas} nuevas o cambiadas")


# ---------- jugadores cargados dos veces ----------
def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z, ]+", " ", s)


def partes(nombre):
    """'Pérez Diez, Germán' -> (['perez', 'diez'], ['german']). Sin coma no se sabe cuál es el apellido."""
    a, coma, b = norm(nombre).partition(",")
    return (a.split(), b.split()) if coma else (a.split(), [])


def parecido(a, b):
    return SequenceMatcher(None, a, b).ratio()


def fecha_typo(f1, f2):
    """Dos fechas que parecen la misma mal tipeada: día y mes al revés, o un solo número distinto (y cerca)."""
    try:
        d1, d2 = datetime.strptime(f1, "%d/%m/%Y"), datetime.strptime(f2, "%d/%m/%Y")
    except (TypeError, ValueError):
        return False
    if (d1.day, d1.month, d1.year) == (d2.month, d2.day, d2.year):
        return True
    distintos = (d1.day != d2.day) + (d1.month != d2.month) + (d1.year != d2.year)
    return distintos == 1 and abs((d1 - d2).days) <= 400


def comparar(n1, f1, n2, f2):
    """'seguro', 'dudoso: <motivo>' o None."""
    ap1, no1 = partes(n1)
    ap2, no2 = partes(n2)
    t1, t2 = set(ap1 + no1), set(ap2 + no2)
    if not t1 & t2:
        return None
    misma_fecha = bool(f1) and f1 == f2
    # mellizos: mismo apellido y fecha, nombres de pila que no tienen nada que ver
    if misma_fecha and no1 and no2 and not set(no1) & set(no2) and parecido(" ".join(no1), " ".join(no2)) < .8:
        return None
    contenido = (t1 <= t2 or t2 <= t1) and min(len(t1), len(t2)) >= 2
    if misma_fecha and contenido:
        return "seguro"
    todo = parecido(" ".join(sorted(t1)), " ".join(sorted(t2)))
    apellido = parecido(" ".join(ap1), " ".join(ap2)) if no1 and no2 else todo
    if misma_fecha and apellido >= .75:
        return "dudoso: Nacieron el mismo día y el nombre está escrito parecido."
    if (t1 == t2 or (contenido and todo >= .75)) and fecha_typo(f1, f2):
        return "dudoso: Se llaman igual y la fecha de nacimiento es casi la misma (puede estar mal tipeada)."
    return None


def repetidos():
    sys.argv = sys.argv[:1] + ["todos"]  # extraer_los50 lee el año de los argumentos
    import extraer_los50 as E

    con = sqlite3.connect(DB)
    jug = sorted(set(con.execute("select player_id, jugador, nacimiento from jugadores")))
    nombre = {p: n for p, n, _ in jug}
    nacio = {p: f for p, _, f in jug}
    partidos, cats_anios = {}, {}
    for mid, pid, cat, anio in con.execute("select p.mid, p.player_id, t.categoria, t.anio from planteles p "
                                           "join partidos t using(mid) where p.equipo = 'Los 50' and p.player_id is not null"):
        partidos.setdefault(pid, set()).add(mid)
        cats_anios.setdefault(pid, set()).add((cat, anio))

    def actual(pid):  # id con el que quedó en la base (ya con las fichas juntadas hasta ahora)
        while pid in E.UNIFICAR_IDS and E.UNIFICAR_IDS[pid] != pid:
            pid = E.UNIFICAR_IDS[pid]
        return pid

    contestadas = leer("respuestas.json", {})
    confirmados = [r["ids"] for r in contestadas.values() if r["tipo"] == "repetido" and r["respuesta"] == "si"]
    descartados = {tuple(sorted(r["ids"])) for r in contestadas.values() if r["tipo"] == "repetido" and r["respuesta"] != "si"}

    # grupos de fichas de la misma persona: las juntadas a mano, las confirmadas por el club y las seguras
    padre = {}

    def raiz(x):
        padre.setdefault(x, x)
        while padre[x] != x:
            padre[x] = padre[padre[x]]
            x = padre[x]
        return x

    def unir(a, b):
        padre[raiz(a)] = raiz(b)

    for a, b in list(E.UNIFICAR_MANUAL.items()) + confirmados:
        unir(a, b)
    dudosos = []
    for (p1, n1, f1), (p2, n2, f2) in itertools.combinations(jug, 2):
        if p1 == p2:
            continue
        r = comparar(n1, f1, n2, f2)
        if not r:
            continue
        a1, a2 = actual(p1), actual(p2)
        if a1 != a2 and partidos.get(a1, set()) & partidos.get(a2, set()):
            continue  # jugaron el mismo partido: son dos personas
        if r == "seguro":
            unir(p1, p2)
        else:
            dudosos.append((p1, p2, r.split(": ", 1)[1]))

    # en cada grupo se usa la ficha que eligió el club a mano o, si no, la que tiene más partidos
    manual = set(E.UNIFICAR_MANUAL.values())
    grupos = {}
    for x in list(padre):
        grupos.setdefault(raiz(x), []).append(x)
    unificar = {}
    for miembros in grupos.values():
        base = max(miembros, key=lambda m: (m in manual, len(partidos.get(m, ())), -int(m) if m.isdigit() else 0))
        unificar.update({m: base for m in miembros if m != base})
    unificar = dict(sorted(unificar.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0))

    def ficha(pid):
        ca = cats_anios.get(pid, set())
        anios = sorted({a for _, a in ca})
        cats = [c for c in CATS if c in {c for c, _ in ca}]
        return {"id": pid, "nombre": E.NOMBRES.get(nombre.get(pid, ""), nombre.get(pid, "")), "nacio": nacio.get(pid) or "",
                "partidos": len(partidos.get(pid, ())), "anios": f"{anios[0]}–{anios[-1]}" if len(anios) > 1 else str(anios[0]),
                "categorias": ", ".join(cats)}

    preguntas, vistos = [], set()
    for p1, p2, motivo in dudosos:
        a, b = unificar.get(p1, p1), unificar.get(p2, p2)
        par = tuple(sorted((a, b)))
        if a == b or par in vistos or par in descartados or not partidos.get(a) or not partidos.get(b):
            continue  # ya son la misma ficha, ya se preguntó, o una nunca jugó (juntarlas no cambia nada)
        vistos.add(par)
        fichas = sorted([ficha(a), ficha(b)], key=lambda f: -f["partidos"])
        preguntas.append({"id": f"dup-{par[0]}-{par[1]}", "tipo": "repetido", "titulo": "¿Es la misma persona?",
                          "motivo": motivo + " Nunca jugaron el mismo partido.", "ids": list(par), "fichas": fichas,
                          "opciones": OPCIONES_REPETIDO})

    antes = leer("unificar.json", {})
    escribir("unificar.json", unificar)
    escribir("repetidos.json", preguntas)
    nuevas = len(set(unificar.items()) - set(antes.items()))
    print(f"Fichas repetidas: {len(unificar)} juntadas ({nuevas} nuevas) · {len(preguntas)} para preguntar al club")


# ---------- preguntas para la página ----------
def preguntas():
    contestadas = leer("respuestas.json", {})
    todas = leer("planillas.json", []) + leer("repetidos.json", [])
    lista = [p for p in todas if p["id"] not in contestadas]
    escribir("preguntas.json", lista)
    print(f"Preguntas para el club: {len(lista)}")


if __name__ == "__main__":
    acciones = {"respuestas": respuestas, "repetidos": repetidos, "preguntas": preguntas}
    if len(sys.argv) < 2 or sys.argv[1] not in acciones:
        sys.exit(__doc__)
    acciones[sys.argv[1]]()
