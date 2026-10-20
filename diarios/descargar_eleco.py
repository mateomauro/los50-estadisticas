"""Descarga el texto de las notas de diarios/eleco_notas.csv y se queda con las que hablan de Los 50.

Uso:  python diarios/descargar_eleco.py [lista.csv ...]   (por defecto eleco_notas.csv)
Guarda diarios/eleco_textos.jsonl (url, fecha, titulo, texto, tipo, menciona_los50). Retoma si se corta.
Baja 3 notas a la vez, con pausa, para no cargar el sitio del diario.
"""
import csv
import html
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from bs4 import BeautifulSoup

HERE = Path(__file__).parent
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36"}
SALIDA = HERE / "eleco_textos.jsonl"
MENCION = re.compile(r"\bLos\s+50\b", re.I)


def leer_nota(url):
    r = requests.get(url, headers=UA, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    for sc in soup.find_all("script", type="application/ld+json"):
        try:
            d = json.loads(sc.string or "")
        except json.JSONDecodeError:
            continue
        if isinstance(d, dict) and "articleBody" in d:
            cuerpo = BeautifulSoup(html.unescape(d["articleBody"]), "lxml").get_text("\n")
            cuerpo = re.sub(r"[ \t\xa0]+", " ", cuerpo)
            cuerpo = re.sub(r"\n\s*\n+", "\n", cuerpo).strip()
            return {"fecha": (d.get("datePublished") or "")[:10], "titulo": html.unescape(d.get("headline") or ""), "texto": cuerpo}
    return None


def main():
    hechas = set()
    if SALIDA.exists():
        hechas = {json.loads(l)["url"] for l in SALIDA.open(encoding="utf-8")}
    filas = []
    for lista in sys.argv[1:] or ["eleco_notas.csv"]:
        filas += list(csv.DictReader((HERE / lista).open(encoding="utf-8")))
    pendientes = [f for f in filas if f["url"] not in hechas]
    print(f"{len(filas)} notas, {len(hechas)} ya bajadas, {len(pendientes)} pendientes", flush=True)
    lock, hechos = threading.Lock(), [0]
    with SALIDA.open("a", encoding="utf-8") as out:
        def bajar(f):
            try:
                nota = leer_nota(f["url"])
            except requests.RequestException as e:
                print("error", f["url"], e, flush=True)
                time.sleep(5)
                return
            with lock:
                if nota:
                    nota.update(url=f["url"], tipo=f["tipo"],
                                menciona_los50=bool(MENCION.search(nota["titulo"] + " " + nota["texto"])))
                    out.write(json.dumps(nota, ensure_ascii=False) + "\n")
                    out.flush()
                hechos[0] += 1
                if hechos[0] % 50 == 0:
                    print(f"  {hechos[0]}/{len(pendientes)}", flush=True)
            time.sleep(1)
        with ThreadPoolExecutor(max_workers=3) as ex:
            list(ex.map(bajar, pendientes))
    print("listo", flush=True)


if __name__ == "__main__":
    main()
