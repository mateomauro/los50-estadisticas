"""Compara lo extraído de los diarios (2017-2018) contra los datos oficiales de la UAR para medir su confiabilidad.

Uso:  python diarios/comparar_validacion.py
"""
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
BASE = HERE.parent


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", " ", s)


def tokens(s):
    return [t for t in norm(s).split() if len(t) > 1 and t not in {"de", "del", "la", "los", "rc", "club", "rugby", "mdp", "bb", "mar", "plata"}]


def mismo_rival(a, b):
    ta, tb = set(tokens(a)), set(tokens(b))
    return bool(ta & tb)


def mismo_jugador(nombre_diario, nombre_uar):
    """Diario: 'Nombre Apellido' o 'Apellido'. UAR: 'Apellido, Nombre'."""
    ap, _, no = nombre_uar.partition(",")
    ap_t, no_t, d = tokens(ap), tokens(no), tokens(nombre_diario)
    if not ap_t or not d:
        return False
    if not set(ap_t) & set(d):
        return False
    resto = [t for t in d if t not in ap_t]
    return not resto or not no_t or any(r[0] == n[0] for r in resto for n in no_t)


TIPO = {"try": "Try", "try penal": "Try", "conversion": "Conversión", "penal": "Penal", "drop": "Drop"}


def main():
    extraido = []
    for f in sorted((HERE / "extraido").glob("2017-2018_*.json")):
        for nota in json.loads(f.read_text(encoding="utf-8")):
            for p in nota.get("partidos") or []:
                extraido.append({**p, "url": nota["url"], "fecha_nota": nota["fecha_nota"]})
    print(f"partidos extraídos de las notas: {len(extraido)}")

    x = pd.read_excel(BASE / "Los50_PlantelSuperior_historico.xlsx", sheet_name=None)
    P, I, J = x["Partidos"], x["Incidencias"], x["Planteles por partido"]
    P = P[P.anio.isin([2017, 2018]) & P.estado.str.startswith("Cerrado")].copy()
    P["f"] = pd.to_datetime(P.fecha, format="%d/%m/%Y")

    # unir cada partido del diario con el de la UAR (misma categoría, rival, fecha ±4 días)
    por_uar = defaultdict(list)
    sin_par = []
    for p in extraido:
        cat = p.get("categoria") or "Desconocida"
        f = pd.to_datetime(p.get("fecha_partido") or p["fecha_nota"], errors="coerce")
        cand = P[P.rival.map(lambda r: mismo_rival(r, p.get("rival")))]
        if cat in ("Primera", "Intermedia", "Pre-Intermedia"):
            cand = cand[cand.categoria == cat]
        if pd.notna(f):
            cand = cand[(cand.f - f).abs() <= pd.Timedelta(days=4)]
        if len(cand) == 1:
            por_uar[cand.partido_id.iloc[0]].append(p)
        else:
            sin_par.append((p.get("fecha_partido"), cat, p.get("rival"), len(cand)))
    print(f"partidos del diario que encontré en la UAR: {sum(len(v) for v in por_uar.values())} menciones de {len(por_uar)} partidos distintos")
    print(f"sin encontrar (otra categoría/juveniles/fecha dudosa): {len(sin_par)}")

    res = Counter()
    puntos = Counter()
    form = Counter()
    ejemplos_mal = []
    for mid, menciones in por_uar.items():
        uar = P[P.partido_id == mid].iloc[0]
        # la mención con más detalle
        p = max(menciones, key=lambda m: (len(m.get("puntos") or []), len(m.get("formacion") or [])))
        if p.get("tantos_los50") is not None:
            ok = p["tantos_los50"] == uar.tantos_los50 and p.get("tantos_rival") == uar.tantos_rival
            res["resultado ok" if ok else "resultado distinto"] += 1
        # puntos por jugador
        inc = I[(I.partido_id == mid) & I.incidencia.isin(["Try", "Try penal", "Conversión", "Penal", "Drop"])]
        oficial = Counter((r.jugador, "Try" if r.incidencia.startswith("Try") else r.incidencia) for r in inc.itertuples())
        diario = Counter()
        for q in p.get("puntos") or []:
            t = TIPO.get(str(q.get("tipo", "")).lower())
            if not t:
                continue
            quien = next((j for (j, tt) in oficial if tt == t and mismo_jugador(q.get("jugador"), j)), None)
            diario[(quien or f"?{q.get('jugador')}", t)] += int(q.get("cantidad") or 1)
        if p.get("puntos"):
            for k in set(oficial) | set(diario):
                a, b = oficial.get(k, 0), diario.get(k, 0)
                puntos["acertados"] += min(a, b)
                puntos["faltan en el diario"] += max(0, a - b)
                puntos["de más en el diario"] += max(0, b - a)
                if b > a and len(ejemplos_mal) < 12:
                    ejemplos_mal.append((uar.fecha, uar.rival, k, f"diario {b} / UAR {a}", p["url"][-60:]))
            puntos["partidos con detalle"] += 1
            if p.get("puntos_completos"):
                puntos["partidos con detalle completo"] += 1
        # formación
        if p.get("formacion"):
            tit = J[(J.partido_id == mid) & (J.rol == "Titular")].jugador.tolist()
            hits = sum(any(mismo_jugador(n, t) for t in tit) for n in p["formacion"])
            form["jugadores en formación del diario"] += len(p["formacion"])
            form["coinciden con titulares UAR"] += hits
            form["partidos con formación"] += 1

    print("\nRESULTADOS:", dict(res))
    print("PUNTOS POR JUGADOR:", dict(puntos))
    if puntos["acertados"]:
        tot_of = puntos["acertados"] + puntos["faltan en el diario"]
        tot_di = puntos["acertados"] + puntos["de más en el diario"]
        print(f"  -> de lo oficial, el diario trae el {puntos['acertados'] / tot_of:.0%}; de lo que dice el diario, es correcto el {puntos['acertados'] / tot_di:.0%}")
    print("FORMACIONES:", dict(form))
    print("\nejemplos de puntos que el diario pone de más:")
    for e in ejemplos_mal:
        print("  ", e)
    print("\npartidos del diario sin par en la UAR (muestra):", sin_par[:15])


if __name__ == "__main__":
    main()
