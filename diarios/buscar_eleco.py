"""Busca en el índice (sitemap) de El Eco de Tandil las notas que mencionan a Los 50 en el título/URL.

Uso:  python diarios/buscar_eleco.py 2008 2016
Guarda diarios/eleco_notas.csv (url, anio, mes). Solo lee el sitemap público (robots.txt lo permite).
"""
import csv
import re
import sys
import time
from pathlib import Path

import requests

HERE = Path(__file__).parent
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36"}
DESDE, HASTA = (int(a) for a in (sys.argv[1:3] or ("2008", "2016")))
# "los-50" como palabra en la URL, sin "los-50-mil", "los-500", etc.
LOS50 = re.compile(r"(^|[-/])los-50($|[-/])(?!mil|millones|anos|años|por-ciento|kilometros|metros|dias|minutos|pesos|dolares)")

# notas de rugby que pueden traer el resultado de Los 50 dentro (Los Cardos, Uncas, resúmenes)
RUGBY = re.compile(r"rugby|cardos|pampeano|urmdp|union-de-rugby|uncas|tries|scrum|seven|intermedia|imagenes-mdq|copa-imagenes")


def main():
    filas = []
    for anio in range(DESDE, HASTA + 1):
        for mes in range(1, 13):
            url = f"https://www.eleco.com.ar/sitemap.xml/notes/{anio}/{mes}"
            try:
                r = requests.get(url, headers=UA, timeout=30)
            except requests.RequestException as e:
                print(anio, mes, "error", e)
                continue
            locs = re.findall(r"<loc>([^<]+)</loc>", r.text)
            hits = [u for u in locs if LOS50.search(u.rsplit("/", 1)[-1])]
            rug = [u for u in locs if u not in hits and RUGBY.search(u.rsplit("/", 1)[-1])]
            filas += [{"url": u, "anio": anio, "mes": mes, "tipo": "los50"} for u in hits]
            filas += [{"url": u, "anio": anio, "mes": mes, "tipo": "rugby"} for u in rug]
            print(f"{anio}/{mes:02d}: {len(locs):4} notas, {len(hits):2} de Los 50, {len(rug):2} de rugby", flush=True)
            time.sleep(1)
    out = HERE / (sys.argv[3] if len(sys.argv) > 3 else "eleco_notas.csv")
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["url", "anio", "mes", "tipo"])
        w.writeheader()
        w.writerows(filas)
    print(f"\n{len(filas)} notas -> {out}")

if __name__ == "__main__":
    main()
