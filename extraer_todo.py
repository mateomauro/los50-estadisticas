"""Descarga TODO lo que la base de datos de la UAR tiene sobre LOS 50 (todas las categorías, todos los años).

Uso:  python extraer_todo.py [etapa ...]      etapas: listados torneos partidos jugadores (por defecto todas)
      python extraer_todo.py semanal          solo lo nuevo: torneos de este año, partidos sin cerrar y jugadores nuevos

- Guarda cada página en bruto (comprimida) en datos_uar/raw/: sirve de respaldo y permite re-analizar sin volver a bajar.
- Guarda las tablas de cada listado en datos_uar/listados/<seccion>.jsonl (una fila por registro).
- Solo LEE: páginas "view" y filtros de búsqueda. Nunca usa editar/borrar/reabrir.
- Va despacio (2 pedidos a la vez con pausa) y retoma donde quedó.
"""
import gzip
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup

from privacidad import limpiar
from uar_session import BASE, login

HERE = Path(__file__).parent
DATOS = HERE / "datos_uar"
RAW = DATOS / "raw"
LIST = DATOS / "listados"
for d in (RAW, LIST):
    d.mkdir(parents=True, exist_ok=True)
CLUB = "182"
AJAX = {"X-Requested-With": "XMLHttpRequest"}
PAUSA = float(os.environ.get("UAR_PAUSA", "0.8"))      # segundos entre pedidos de cada hilo
HILOS = int(os.environ.get("UAR_HILOS", "2"))          # pedidos a la vez
_lock = threading.RLock()  # reentrante: log() se llama también desde adentro de bloques con el lock
PROHIBIDO = re.compile(r"/(delete|edit|reopen|close|toggle|add|notify|unconfirm|noPresenta|ajax_|reprogram|assign)", re.I)


def log(*a):
    with _lock:
        print(*a, flush=True)


# ---------- acceso ----------
class Sesion:
    def __init__(self):
        self.s = login()
        self.n = 0

    def _pedir(self, metodo, url, **kw):
        if PROHIBIDO.search(url):
            raise ValueError(f"URL no permitida (solo lectura): {url}")
        url = url if url.startswith("http") else BASE + url
        for intento in range(4):
            try:
                time.sleep(PAUSA)
                r = self.s.request(metodo, url, timeout=90, **kw)
                if r.status_code >= 500:
                    raise IOError(f"HTTP {r.status_code}")
                if "/users/login" in r.url and "login-password" in r.text:  # sesión vencida
                    self.s = login()
                    continue
                self.n += 1
                return r
            except Exception as e:  # noqa: BLE001
                log(f"   reintento {intento + 1} {url[-60:]}: {e}")
                time.sleep(5 * (intento + 1))
        raise IOError(f"no se pudo bajar {url}")

    def get(self, url, **kw):
        return self._pedir("GET", url, **kw)

    def post(self, url, **kw):
        return self._pedir("POST", url, **kw)


def guardar_raw(tipo, clave, html):
    d = RAW / tipo
    d.mkdir(exist_ok=True)
    with gzip.open(d / f"{clave}.html.gz", "wt", encoding="utf-8") as f:
        f.write(limpiar(html))  # sin DNI, teléfonos, mail ni datos médicos


def leer_raw(tipo, clave):
    f = RAW / tipo / f"{clave}.html.gz"
    if f.exists():
        with gzip.open(f, "rt", encoding="utf-8") as g:
            return g.read()
    return None


def pagina(S, tipo, clave, url, refrescar=False):
    """Devuelve el HTML de una página 'view', usando el respaldo si ya está bajada."""
    if not refrescar:
        h = leer_raw(tipo, clave)
        if h is not None:
            return h
    h = limpiar(S.get(url).text)
    guardar_raw(tipo, clave, h)
    return h


# ---------- tablas genéricas ----------
def tablas(html):
    """Todas las tablas de la página: encabezados + filas (texto y links de cada celda)."""
    out = []
    soup = BeautifulSoup(html, "lxml")
    for t in soup.select(".content-wrapper table") or soup.find_all("table"):
        hdr = [" ".join(th.get_text(" ").split()) for th in t.find_all("th")]
        filas = []
        for tr in t.select("tbody tr") or t.find_all("tr")[1:]:
            celdas = tr.find_all("td")
            if not celdas:
                continue
            filas.append({"celdas": [" ".join(c.get_text(" ").split()) for c in celdas],
                          "links": [a["href"] for a in tr.find_all("a", href=True) if not a["href"].startswith(("#", "javascript"))],
                          "data_id": tr.get("data-id")})
        out.append({"encabezados": hdr, "filas": filas})
    return out


# ---------- formularios de filtro ----------
def campos_form(html, accion):
    """Campos de un formulario de filtro (con sus valores por defecto), como lista de pares."""
    soup = BeautifulSoup(html, "lxml")
    form = next((f for f in soup.find_all("form") if accion.lower() in (f.get("action") or "").lower()), None)
    if form is None:
        raise ValueError(f"no encontré el formulario {accion}")
    pares = []
    for el in form.find_all(["input", "select"]):
        n = el.get("name")
        if not n or el.get("type") == "submit":
            continue
        if el.name == "select":
            sel = el.find("option", selected=True) or el.find("option")
            v = sel.get("value", "") if sel else ""
        elif el.get("type") in ("checkbox", "radio"):
            if not el.has_attr("checked"):
                continue
            v = el.get("value", "on")
        else:
            v = el.get("value", "") or ""
        pares.append((n, v))
    return form.get("action"), pares


def filtrar(S, seccion, pagina_form, accion, cambios, url_ajax):
    """Envía un filtro y recorre todas las páginas del resultado. Guarda crudo + filas."""
    salida = LIST / f"{seccion}.jsonl"
    if salida.exists():
        log(f"  {seccion}: ya estaba ({sum(1 for _ in salida.open(encoding='utf-8'))} filas)")
        return [json.loads(l) for l in salida.open(encoding="utf-8")]
    html = S.get(pagina_form).text
    _, pares = campos_form(html, accion)
    pares = [(n, cambios.get(n, v)) for n, v in pares]
    for n, v in cambios.items():
        if n not in {p[0] for p in pares}:
            pares.append((n, v))
    r = S.post(url_ajax, data=pares, headers=AJAX)
    paginas = [limpiar(r.text)]
    nums = [int(x) for x in re.findall(r"/page:(\d+)", r.text)]
    if nums:
        modelo = re.search(r'href="([^"]*?/page:)\d+([^"]*)"', r.text)
        for n in range(2, max(nums) + 1):
            paginas.append(limpiar(S.get(modelo.group(1) + str(n) + modelo.group(2), headers=AJAX).text))
    filas = []
    for i, h in enumerate(paginas, 1):
        guardar_raw(f"listado_{seccion}", f"pagina_{i:03d}", h)
        for t in tablas(h):
            for f in t["filas"]:
                filas.append({"encabezados": t["encabezados"], **f})
    with salida.open("w", encoding="utf-8") as out:
        for f in filas:
            out.write(json.dumps(f, ensure_ascii=False) + "\n")
    log(f"  {seccion}: {len(filas)} filas en {len(paginas)} páginas")
    return filas


C = lambda modelo, campo: f"data[{modelo}][{campo}]"


def etapa_listados(S):
    log("== LISTADOS")
    filtrar(S, "torneos_competencia", "/championships", "/championships/filter",
            {C("Championship", "club_id"): CLUB, C("Championship", "estado"): "any", C("Championship", "friendly"): "0"}, "/Championships/filter")
    filtrar(S, "torneos_amistosos", "/championships", "/championships/filter",
            {C("Championship", "club_id"): CLUB, C("Championship", "estado"): "any", C("Championship", "friendly"): "1"}, "/Championships/filter")
    filtrar(S, "torneos_infantiles", "/adminreferato/2", "/championships/filter",
            {C("Championship", "club_id"): CLUB, C("Championship", "estado"): "any"}, "/Championships/filter")
    filtrar(S, "partidos_amistosos", "/matches/index/friendly", "/matches/filter",
            {C("Match", "friendly"): "friendly", C("Match", "union_id"): "2", C("Match", "inactive"): ""}, "/Matches/filter")
    filtrar(S, "jugadores", "/players", "/players/filter", {C("Player", "club_id"): CLUB}, "/Players/filter")
    filtrar(S, "tarjetas", "/championships/discipline", "/match_incidents/filter", {}, "/MatchIncidents/filter")
    filtrar(S, "ranking_amonestados", "/championships/discipline", "/MatchIncidents/filterRanking", {}, "/MatchIncidents/filterRanking")
    filtrar(S, "sanciones", "/championships/discipline", "/sanctions/filter", {}, "/Sanctions/filter")
    filtrar(S, "conmociones", "/Concussions", "/concussions/filter", {}, "/Concussions/filter")
    filtrar(S, "pases", "/swaps", "/swaps/filter", {}, "/Swaps/filter")
    filtrar(S, "pases_internacionales", "/Clearances", "/clearances/filter", {}, "/Clearances/filter")
    filtrar(S, "entrenadores", "/trainers", "/trainers/filter", {C("Trainer", "club_id"): CLUB}, "/Trainers/filter")
    # páginas sueltas
    for clave, url in [("club", "/clubs/view/182"), ("dashboard", "/clubdashboard"), ("denuncias_lesion", "/complaints")]:
        h = pagina(S, "club", clave, url, refrescar=True)
        with (LIST / f"{clave}.json").open("w", encoding="utf-8") as f:
            json.dump(tablas(h), f, ensure_ascii=False)
    log(f"  páginas sueltas del club: ok ({S.n} pedidos hasta ahora)")


# ---------- torneos ----------
def ids(filas, patron):
    out = []
    for f in filas:
        for l in f["links"]:
            m = re.search(patron, l, re.I)
            if m and m.group(1) not in out:
                out.append(m.group(1))
    return out


def etapa_torneos(S):
    log("== TORNEOS (ficha, rondas con posiciones, partidos de Los 50)")
    tids = []
    for sec in ("torneos_competencia", "torneos_infantiles"):  # los "torneos amistosos" son contenedores sin tabla: los amistosos van por su listado
        f = LIST / f"{sec}.jsonl"
        if f.exists():
            tids += [t for t in ids([json.loads(l) for l in f.open(encoding="utf-8")], r"/championships/view/(\d+)") if t not in tids]
    log(f"  {len(tids)} torneos")
    partidos = {}

    def un_torneo(tid):
        h = pagina(S, "torneo", tid, f"/championships/view/{tid}")
        soup = BeautifulSoup(h, "lxml")
        for fx in sorted({m for m in re.findall(r"/Fixtures/view/(\d+)", h, re.I)}):
            pagina(S, "ronda", fx, f"/Fixtures/view/{fx}")
        # partidos del club en el torneo (mismo filtro que usa la página del torneo)
        f = LIST / "partidos_por_torneo" / f"{tid}.json"
        if f.exists():
            return tid, json.loads(f.read_text(encoding="utf-8"))
        form = soup.find("form", id="MatchFilterForm")
        mids = []
        if form is not None:
            pares = []
            for el in form.find_all(["input", "select"]):
                n = el.get("name")
                if not n or el.get("type") == "submit":
                    continue
                v = el.get("value", "") if el.name == "input" else ""
                pares.append((n, CLUB if n.endswith("[club_id]") else v))
            r = S.post("/Matches/filter", data=pares, headers=AJAX)
            htmls = [r.text]
            nums = [int(x) for x in re.findall(r"/page:(\d+)", r.text)]
            for n in range(2, (max(nums) if nums else 1) + 1):
                htmls.append(S.get(f"/Matches/filter/page:{n}", headers=AJAX).text)
            for hh in htmls:
                for m in re.findall(r"/Matches/view/(\d+)", hh, re.I):
                    if m not in mids:
                        mids.append(m)
        f.parent.mkdir(exist_ok=True)
        f.write_text(json.dumps(mids), encoding="utf-8")
        return tid, mids

    hechos = [0]

    def tarea(tid):
        try:
            t, m = un_torneo(tid)
            partidos[t] = m
        except Exception as e:  # noqa: BLE001
            log(f"   ERROR torneo {tid}: {e}")
        with _lock:
            hechos[0] += 1
            if hechos[0] % 25 == 0:
                log(f"  torneos {hechos[0]}/{len(tids)} ({S.n} pedidos)")

    with ThreadPoolExecutor(max_workers=HILOS) as ex:
        list(ex.map(tarea, tids))
    (DATOS / "partidos_por_torneo.json").write_text(json.dumps(partidos), encoding="utf-8")
    log(f"  partidos de Los 50 encontrados: {sum(len(v) for v in partidos.values())}")


# ---------- partidos ----------
def etapa_partidos(S):
    log("== PARTIDOS (todos los de Los 50, todas las categorías)")
    pt = json.loads((DATOS / "partidos_por_torneo.json").read_text(encoding="utf-8"))
    mids = sorted({m for v in pt.values() for m in v}, key=int)
    am = LIST / "partidos_amistosos.jsonl"
    if am.exists():
        filas = [json.loads(l) for l in am.open(encoding="utf-8")]
        amistosos = [m for f in filas if "LOS 50" in " ".join(f["celdas"]).upper() for m in ids([f], r"/Matches/view/(\d+)")]
        mids += [m for m in amistosos if m not in mids]
        log(f"  + {len(amistosos)} amistosos de Los 50")
    viejo = HERE / "cache"
    hechos = [0]

    def tarea(mid):
        if leer_raw("partido", mid) is None:
            f = viejo / f"match_{mid}.html"
            if f.exists():  # ya bajado antes (partido cerrado)
                guardar_raw("partido", mid, f.read_text(encoding="utf-8"))
            else:
                try:
                    h = S.get(f"/Matches/view/{mid}").text
                    guardar_raw("partido", mid, h)
                except Exception as e:  # noqa: BLE001
                    log(f"   ERROR partido {mid}: {e}")
        with _lock:
            hechos[0] += 1
            if hechos[0] % 100 == 0:
                log(f"  partidos {hechos[0]}/{len(mids)} ({S.n} pedidos)")

    with ThreadPoolExecutor(max_workers=HILOS) as ex:
        list(ex.map(tarea, mids))
    log(f"  {len(mids)} partidos guardados")


# ---------- actualización semanal ----------
def partido_cerrado(html):
    return html is not None and "Cerrado" in html[:200000] and "label-info" in html


def partidos_del_club(S, tid, html_torneo):
    """Partidos de Los 50 en un torneo (mismo filtro que usa la página del torneo)."""
    form = BeautifulSoup(html_torneo, "lxml").find("form", id="MatchFilterForm")
    if form is None:
        return []
    pares = []
    for el in form.find_all(["input", "select"]):
        n = el.get("name")
        if not n or el.get("type") == "submit":
            continue
        pares.append((n, CLUB if n.endswith("[club_id]") else (el.get("value", "") if el.name == "input" else "")))
    r = S.post("/Matches/filter", data=pares, headers=AJAX)
    htmls = [r.text]
    nums = [int(x) for x in re.findall(r"/page:(\d+)", r.text)]
    for n in range(2, (max(nums) if nums else 1) + 1):
        htmls.append(S.get(f"/Matches/filter/page:{n}", headers=AJAX).text)
    mids = []
    for hh in htmls:
        for m in re.findall(r"/Matches/view/(\d+)", hh, re.I):
            if m not in mids:
                mids.append(m)
    return mids


def etapa_semanal(S):
    """Lo que cambia de una semana a otra: los torneos de este año (posiciones y partidos), los partidos que todavía
    no estaban cerrados y las fichas de jugadores nuevos. Lo que ya estaba cerrado no se vuelve a bajar."""
    anio = str(date.today().year)
    log(f"== SEMANAL ({anio})")
    # 1) listados de torneos y de jugadores del club, de nuevo (puede haber torneos o fichajes nuevos)
    for sec in ("torneos_competencia", "jugadores"):
        (LIST / f"{sec}.jsonl").unlink(missing_ok=True)
    filtrar(S, "torneos_competencia", "/championships", "/championships/filter",
            {C("Championship", "club_id"): CLUB, C("Championship", "estado"): "any", C("Championship", "friendly"): "0"}, "/Championships/filter")
    filtrar(S, "jugadores", "/players", "/players/filter", {C("Player", "club_id"): CLUB}, "/Players/filter")

    # 2) torneos de este año: ficha, rondas (posiciones) y partidos del club
    filas = [json.loads(l) for l in (LIST / "torneos_competencia.jsonl").open(encoding="utf-8")]
    tids = [t for f in filas if anio in " ".join(f["celdas"]) for t in ids([f], r"/championships/view/(\d+)")]
    tids = list(dict.fromkeys(tids))
    pt_f = DATOS / "partidos_por_torneo.json"
    pt = json.loads(pt_f.read_text(encoding="utf-8")) if pt_f.exists() else {}
    log(f"  {len(tids)} torneos de {anio}")
    for tid in tids:
        h = pagina(S, "torneo", tid, f"/championships/view/{tid}", refrescar=True)
        for fx in sorted(set(re.findall(r"/Fixtures/view/(\d+)", h, re.I))):
            pagina(S, "ronda", fx, f"/Fixtures/view/{fx}", refrescar=True)
        pt[tid] = partidos_del_club(S, tid, h)
        (LIST / "partidos_por_torneo").mkdir(exist_ok=True)
        (LIST / "partidos_por_torneo" / f"{tid}.json").write_text(json.dumps(pt[tid]), encoding="utf-8")
    pt_f.write_text(json.dumps(pt), encoding="utf-8")

    # 3) partidos de esos torneos que no estaban o seguían abiertos (pendientes, iniciados)
    mids = list(dict.fromkeys(m for t in tids for m in pt.get(t, [])))
    nuevos = [m for m in mids if not partido_cerrado(leer_raw("partido", m))]
    log(f"  {len(mids)} partidos de {anio}; se bajan {len(nuevos)} (nuevos o sin cerrar)")
    for m in nuevos:
        guardar_raw("partido", m, S.get(f"/Matches/view/{m}").text)

    # 4) fichas de jugadores que todavía no estaban
    filas = [json.loads(l) for l in (LIST / "jugadores.jsonl").open(encoding="utf-8")]
    faltan = [p for p in ids(filas, r"/players/view/(\d+)") if leer_raw("jugador", p) is None]
    log(f"  {len(faltan)} jugadores nuevos")
    for p in faltan:
        pagina(S, "jugador", p, f"/Players/view/{p}")


# ---------- jugadores ----------
def etapa_jugadores(S):
    log("== JUGADORES (ficha de cada fichado del club)")
    filas = [json.loads(l) for l in (LIST / "jugadores.jsonl").open(encoding="utf-8")]
    pids = ids(filas, r"/players/view/(\d+)")
    # también los que aparecen en partidos de Los 50 aunque hoy estén en otro club
    log(f"  {len(pids)} jugadores")
    hechos = [0]

    def tarea(pid):
        try:
            pagina(S, "jugador", pid, f"/Players/view/{pid}")
        except Exception as e:  # noqa: BLE001
            log(f"   ERROR jugador {pid}: {e}")
        with _lock:
            hechos[0] += 1
            if hechos[0] % 100 == 0:
                log(f"  jugadores {hechos[0]}/{len(pids)} ({S.n} pedidos)")

    with ThreadPoolExecutor(max_workers=HILOS) as ex:
        list(ex.map(tarea, pids))


def main():
    etapas = sys.argv[1:] or ["listados", "torneos", "partidos", "jugadores"]
    S = Sesion()
    t0 = time.time()
    for e in etapas:
        {"listados": etapa_listados, "torneos": etapa_torneos, "partidos": etapa_partidos, "jugadores": etapa_jugadores,
         "semanal": etapa_semanal}[e](S)
        log(f"  ({(time.time() - t0) / 60:.1f} min, {S.n} pedidos)")
    log("LISTO")


if __name__ == "__main__":
    main()
