"""Arma lotes de notas (las que mencionan a Los 50) para leerlas y extraer los partidos.

Uso:  python diarios/preparar_lotes.py 2017 2018 25      (años desde-hasta, notas por lote)
Escribe diarios/lotes/<desde>-<hasta>_NN.json
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
desde, hasta, tam = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 25

notas = [json.loads(l) for l in (HERE / "eleco_textos.jsonl").open(encoding="utf-8")]
vistas, sel = set(), []
for n in sorted(notas, key=lambda n: n["fecha"]):
    if n["url"] in vistas or not n["menciona_los50"] or not (desde <= int(n["fecha"][:4] or 0) <= hasta):
        continue
    vistas.add(n["url"])
    sel.append({"url": n["url"], "fecha_nota": n["fecha"], "titulo": n["titulo"], "texto": n["texto"]})

dest = HERE / "lotes"
dest.mkdir(exist_ok=True)
for i in range(0, len(sel), tam):
    f = dest / f"{desde}-{hasta}_{i // tam + 1:02d}.json"
    f.write_text(json.dumps(sel[i:i + tam], ensure_ascii=False, indent=1), encoding="utf-8")
    print(f, len(sel[i:i + tam]), "notas", sum(len(n["texto"]) for n in sel[i:i + tam]) // 1000, "mil caracteres")
print(len(sel), "notas en total")
