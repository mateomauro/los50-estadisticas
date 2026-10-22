"""Saca los datos personales de las páginas de la BD UAR antes de guardarlas: DNI, dirección, teléfonos, mail,
obra social y datos médicos. Las estadísticas no los usan. Peso y altura se dejan (los usa la sección Entrenadores).

Uso:  python privacidad.py      limpia todo lo que ya está guardado en datos_uar/ (se corre una sola vez)
Los programas que bajan datos (extraer_todo.py, extraer_los50.py) lo aplican solos a cada página nueva.
"""
import gzip
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
CAMPOS = ["N° Doc", "Dirección", "Ciudad (CP)", "Teléfono fijo", "Teléfono celular", "Teléfono", "Celular", "Email", "E-mail",
          "Grupo sanguíneo", "Cobertura médica", "Plan", "Nro. de afiliado", "Tel de emergencias", "Enfermedades crónicas, alergias, etc.",
          "Datos del médico que completó la ficha", "Índice de Torg", "Sordo"]
_CAMPO = re.compile(r"(<p>\s*(?:" + "|".join(re.escape(c) for c in CAMPOS) + r")\s*:\s*<strong>)(.*?)(</strong>)", re.S)
_DNI_TEXTO = re.compile(r">(\s*)(?:\d{7,8}|\d{1,2}\.\d{3}\.\d{3})(\s*)<")         # DNI suelto en una celda o etiqueta
_DNI_LINK = re.compile(r"(/Trainings/checkPlayerCertification/\d+)/\d+", re.I)   # el link de certificar lleva el DNI
_MAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_DNI_CELDA = re.compile(r"\d{7,8}|\d{1,2}\.\d{3}\.\d{3}")
# DNI pegado a un nombre: "Entrenador LOCAL: Juan Pérez 28200425", "Juan Pérez 11991906 (No oficial)", "Juan Pérez(25665521)".
# En el texto de las planillas no hay otros números de 7 u 8 cifras (revisado en las 3.000 páginas, octubre 2026).
_DNI_EN_TEXTO = re.compile(r"(?<![\d.])(?:\d{7,8}|\d{1,2}\.\d{3}\.\d{3})(?![\d.])")
_NODO = re.compile(r">([^<]+)<")
_CODIGO = re.compile(r"(<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->)", re.S | re.I)


def _sin_dni_en_texto(html):
    partes = _CODIGO.split(html)  # el código de la página (scripts, estilos, comentarios) no se toca
    for i in range(0, len(partes), 2):
        partes[i] = _NODO.sub(lambda m: ">" + _DNI_EN_TEXTO.sub("[DNI]", m.group(1)) + "<", partes[i])
    return "".join(partes)


def limpiar(html):
    if not html:
        return html
    html = _CAMPO.sub(r"\1\3", html)
    html = _DNI_TEXTO.sub(r">\1[DNI]\2<", html)
    html = _sin_dni_en_texto(html)
    html = _DNI_LINK.sub(r"\1/0", html)
    return _MAIL.sub("[mail]", html)


def limpiar_celda(texto):
    if not isinstance(texto, str):
        return texto
    texto = _MAIL.sub("[mail]", texto)
    texto = _DNI_LINK.sub(r"\1/0", texto)
    return "[DNI]" if _DNI_CELDA.fullmatch(texto.strip()) else texto


def limpiar_todo():
    raw = HERE / "datos_uar" / "raw"
    n = 0
    for f in raw.rglob("*.html.gz"):
        with gzip.open(f, "rt", encoding="utf-8") as g:
            h = g.read()
        h2 = limpiar(h)
        if h2 != h:
            with gzip.open(f, "wt", encoding="utf-8") as g:
                g.write(h2)
            n += 1
    print(f"páginas limpiadas: {n}")
    m = 0
    for f in (HERE / "datos_uar" / "listados").rglob("*.json*"):
        txt = f.read_text(encoding="utf-8")
        if f.suffix == ".jsonl":
            filas = [json.loads(l) for l in txt.splitlines() if l.strip()]
            for fila in filas:
                fila["celdas"] = [limpiar_celda(c) for c in fila.get("celdas", [])]
                fila["links"] = [limpiar_celda(c) for c in fila.get("links", [])]
            nuevo = "".join(json.dumps(x, ensure_ascii=False) + "\n" for x in filas)
        else:
            nuevo = _DNI_LINK.sub(r"\1/0", _MAIL.sub("[mail]", txt))
            nuevo = re.sub(r'"(\d{7,8})"', '"[DNI]"', nuevo)
        if nuevo != txt:
            f.write_text(nuevo, encoding="utf-8")
            m += 1
    print(f"listados limpiados: {m}")


if __name__ == "__main__":
    limpiar_todo()
