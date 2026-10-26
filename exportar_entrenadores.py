"""Datos de la sección Entrenadores de la web (web/entrenadores.data.js), cifrados con clave.

Uso:  python exportar_entrenadores.py
Cada rol tiene su clave (CLAVE_COORDINADOR, CLAVE_ENTRENADOR, CLAVE_PF y CLAVE_COMISION, en .env o en los secretos de GitHub) y su propia
copia cifrada de los datos, con lo que ese rol puede ver: cada uno abre solo la suya. Tiene datos de juveniles (menores), por eso va cifrado:
sin la clave no se puede leer ni mirando el código de la página.
Cifrado: PBKDF2-SHA256 (310.000 vueltas) + AES-GCM 256, compatible con WebCrypto del navegador.
"""
import base64
import gzip
import hashlib
import hmac
import json
import math
import os
import re
import sys
from datetime import date
from pathlib import Path

import pandas as pd
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

sys.argv = sys.argv[:1]
import analisis_metricas as A  # noqa: E402
import guia_entrenadores as G  # noqa: E402
import recomendaciones_expertos as R  # noqa: E402
import tries_analisis as T  # noqa: E402
import proximos_partidos as PP  # noqa: E402
import asistencia_entrenadores as AS  # noqa: E402
import pase_y_alertas as PA  # noqa: E402

HERE = Path(__file__).parent
DESTINO = HERE / "web" / "entrenadores.data.js"
HUELLA = HERE / "datos_uar" / "entrenadores.huella"  # para no volver a cifrar si nada cambió
VUELTAS = 310_000


# rol -> variable con su clave. "coordinador" ve todo; "entrenador" y "pf" (preparador físico o manager) casi todo; "comision" (dirigentes) solo
# partidos y estadísticas del equipo, sin nombres de chicos.
ROLES = {"coordinador": "CLAVE_COORDINADOR", "entrenador": "CLAVE_ENTRENADOR", "pf": "CLAVE_PF", "comision": "CLAVE_COMISION"}


def claves():
    """{rol: clave}, de las variables de entorno (GitHub Actions las toma de los 'secrets') o, en la compu, del archivo .env."""
    env, out = {}, {}
    arch = HERE / ".env"
    if arch.exists():
        for linea in arch.read_text(encoding="utf-8").splitlines():
            if "=" in linea and not linea.lstrip().startswith("#"):
                k, v = linea.split("=", 1)
                env[k.strip()] = v.strip()
    for rol, var in ROLES.items():
        v = (os.environ.get(var) or env.get(var) or "").strip().strip('"')
        if not v:
            sys.exit(f"Falta {var} (variable de entorno o .env)")
        out[rol] = v
    if len(set(out.values())) < len(out):
        sys.exit("Dos roles tienen la misma clave: cada rol necesita la suya")
    return out


def clave():
    """La del coordinador (la que usa la copia de seguridad)."""
    return claves()["coordinador"]


def sal_anterior():
    """Se reusa la 'sal' del archivo anterior: así la llave que guardó cada entrenador ("Recordar en este dispositivo")
    sigue sirviendo después de cada actualización. Si cambia la clave, la llave vieja deja de servir y se pide de nuevo."""
    if DESTINO.exists():
        m = re.search(r'"sal": "([^"]+)"', DESTINO.read_text(encoding="utf-8"))
        if m:
            return base64.b64decode(m.group(1))
    return os.urandom(16)


def limpio(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if hasattr(v, "item"):  # numpy
        v = v.item()
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return round(v, 2) if isinstance(v, float) else v


def tabla(df, renombrar=None):
    """DataFrame -> {"c": columnas, "f": filas} (más liviano que una lista de objetos)."""
    df = df.rename(columns=renombrar or {})
    return {"c": list(df.columns), "f": [[limpio(v) for v in fila] for fila in df.itertuples(index=False)]}


def partidos(p, i):
    t1 = i[(i.tiempo == "1T") & (i.pts > 0)].groupby(["mid", "equipo"]).pts.sum().unstack(fill_value=0)
    ht_l = p.mid.map(t1.get("Los 50", pd.Series(dtype=float))).fillna(0)
    ht_r = p.mid.map(t1.get("Rival", pd.Series(dtype=float))).fillna(0)
    completo = p.detalle_los50 & p.detalle_rival
    df = pd.DataFrame({
        "mid": p.mid, "cat": p.categoria, "anio": p.anio, "fecha": p.f.dt.strftime("%Y-%m-%d"), "rival": p.rival, "torneo": p.torneo,
        "cond": p.condicion.str[0], "pf": p.tantos_los50, "pc": p.tantos_rival, "res": p.resultado,
        "et_pf": ht_l.where(completo), "et_pc": ht_r.where(completo),
        "primero": p.marco_primero.map({"Los 50": "N", "Rival": "R"}), "nivel": p.rival_arriba})
    return tabla(df.sort_values("fecha", ascending=False))


def jugadores(p, i, d):
    """Por categoría y año: partidos jugados, de titular, tries, puntos y tarjetas de cada jugador."""
    J = A.jugaron(p, i, d)
    J = J.assign(tit=pd.to_numeric(J.orden, errors="coerce") <= 15)
    ev = i[i.equipo == "Los 50"].merge(p[["mid", "categoria", "anio"]], on="mid")
    cuenta = lambda tipos: ev[ev.incidencia.isin(tipos)].groupby(["player_id", "categoria", "anio"]).size()
    base = J.groupby(["player_id", "categoria", "anio"]).agg(nombre=("jugador", "last"), pj=("mid", "nunique"), tit=("tit", "sum"))
    for k, tipos in {"tries": ["Try", "Try penal"], "conv": ["Conversión"], "pen": ["Penal"], "drops": ["Drop"],
                     "am": ["Amarilla"], "ro": ["Roja"]}.items():
        base[k] = cuenta(tipos).reindex(base.index).fillna(0).astype(int)
    pts = ev[ev.pts > 0].groupby(["player_id", "categoria", "anio"]).pts.sum()
    base["pts"] = pts.reindex(base.index).fillna(0).astype(int)
    base = base.reset_index().rename(columns={"player_id": "pid", "categoria": "cat"})
    return tabla(base[["pid", "nombre", "cat", "anio", "pj", "tit", "tries", "conv", "pen", "drops", "pts", "am", "ro"]])


def no_siguieron(p, i, d):
    """Por categoría y año: los chicos que estuvieron en planillas y no volvieron a aparecer la temporada siguiente
    (misma cuenta que analisis_metricas.retencion)."""
    pl = d["planteles"]
    pl = pl[(pl.equipo == "Los 50") & pl.player_id.notna()].merge(p[["mid", "categoria", "anio", "f"]], on="mid")
    temporadas = sorted(int(a) for a in p.anio.dropna().unique())
    anios = pl.groupby("player_id").anio.apply(set)
    J = A.jugaron(p, i, d)
    jugados = J.groupby(["player_id", "categoria", "anio"]).mid.nunique()
    filas = []
    for (cat, anio), g in pl.groupby(["categoria", "anio"]):
        sig = [t for t in temporadas if t > anio]
        if not sig:
            continue
        for pid, gg in g.groupby("player_id"):
            if sig[0] in anios[pid]:
                continue
            filas.append({"cat": cat, "anio": int(anio), "nombre": gg.jugador.iloc[-1], "planillas": gg.mid.nunique(),
                          "jugo": int(jugados.get((pid, cat, anio), 0)), "ultimo": gg.f.max().strftime("%Y-%m-%d")})
    return tabla(pd.DataFrame(filas).sort_values(["cat", "anio", "jugo", "planillas"], ascending=[True, True, False, False]))


def fotos():
    """Las fotos de los ejercicios (guia/fotos) como data URL. Van cifradas en un archivo aparte (entrenadores.fotos.json),
    que la página baja solo cuando se abre un ejercicio con fotos: así no pesa en cada entrada."""
    return {f.stem: "data:image/webp;base64," + base64.b64encode(f.read_bytes()).decode("ascii") for f in sorted(G.FOTOS.glob("*.webp"))}


VISTAS_VERSION = "2"  # se cambia cuando cambia qué ve cada rol (así se vuelve a cifrar)


def vacia(tab):
    return {"c": tab["c"], "f": []}


def vista(datos, rol, cek_b64):
    """Lo que ve cada rol (no es solo esconder: lo que no ve, ni siquiera viaja en su copia cifrada).
    coordinador: todo. entrenador: todo menos los nombres de quiénes pasan de M19 a plantel superior.
    pf (preparador físico o manager): además, sin la lista de chicos que no siguieron.
    comision (dirigentes): solo partidos y estadísticas del equipo: sin nombres de chicos, sin asistencia ni guía."""
    d = dict(datos, rol=rol)
    if rol != "coordinador":
        d["pase"] = {k: v for k, v in datos["pase"].items() if k != "nombres"}
    if rol in ("pf", "comision"):
        d["no_siguieron"] = vacia(datos["no_siguieron"])
    if rol == "comision":
        d["jugadores"] = vacia(datos["jugadores"])
        d["fichados"] = None
        d["guia"] = None
        d["alertas"] = None
    else:
        d["cek"] = cek_b64
    return d


def main():
    d = A.cargar()
    p, i = A.preparar(d)
    res = A.resumen(p, i, d)
    # tries totales de cada temporada (de todos los partidos)
    tr = i[i.incidencia.isin(["Try", "Try penal"])].merge(p[["mid", "categoria", "anio"]], on="mid")
    tr = tr.groupby(["categoria", "anio", "equipo"]).size().unstack(fill_value=0)
    clave_ = list(zip(res["Categoría"], res["Año"]))
    res["Tries a favor"] = [int(tr["Los 50"].get(k, 0)) if "Los 50" in tr else 0 for k in clave_]
    res["Tries en contra"] = [int(tr["Rival"].get(k, 0)) if "Rival" in tr else 0 for k in clave_]
    fis_res, _ = A.fisico(p, d)
    datos = {
        "actualizado": date.today().strftime("%d/%m/%Y"),
        "categorias": [c for c in A.ORDEN if c in set(res["Categoría"])],
        "resumen": tabla(res),
        "torneos": tabla(A.torneos_final(p, d)),
        "rivales": tabla(A.rivales(p)),
        "retencion": tabla(A.retencion(p, d)),
        "camino": tabla(A.camino_primera(p, i, d)),
        "edad_relativa": tabla(A.edad_relativa(p, i, d)),
        "fisico": tabla(fis_res),
        "partidos": partidos(p, i),
        "jugadores": jugadores(p, i, d),
        "no_siguieron": no_siguieron(p, i, d),
        "diagnostico": R.DIAGNOSTICO, "diag_web": R.DIAG_WEB, "expertos": R.EXPERTOS, "a_medir": R.A_MEDIR, "fuentes": R.FUENTES,
        "glosario": A.GLOSARIO, "notas": A.NOTAS,
        "proximos": PP.proximos(),  # el fixture que ya cargó la UAR (la página muestra solo los de hoy en adelante)
        "fichados": AS.fichados(),  # la lista inicial de chicos de cada categoría para tomar asistencia (lo demás va en Cloudflare D1)
        "guia": G.guia(),  # material de Coordinación: qué aprende cada categoría, cantos, zonas y scrum
        # quién hace los tries y cuándo, por categoría y año (tries_analisis.py; en juveniles solo cuándo)
        "tries": {c: v for c, v in T.tries_por_categoria().items() if c in A.ORDEN},
        # de M19 a plantel superior (cuántos suben cada año, de dónde vienen y quiénes) y lo que hay que mirar (sanciones, conmociones, tarjetas)
        "pase": PA.pase_plantel_superior(p, i, d),
        "alertas": PA.alertas(p, i, d),
    }
    fotos_ = json.dumps(fotos(), separators=(",", ":")).encode("utf-8")
    destino_fotos = DESTINO.with_name("entrenadores.fotos.json")
    sin_fecha = dict(datos, actualizado="")
    huella = hashlib.sha256(json.dumps(sin_fecha, ensure_ascii=False, sort_keys=True).encode("utf-8") + fotos_ + json.dumps(claves(), sort_keys=True).encode("utf-8") + VISTAS_VERSION.encode("utf-8")).hexdigest()
    if DESTINO.exists() and destino_fotos.exists() and HUELLA.exists() and HUELLA.read_text().strip() == huella:
        print(f"Sin cambios en los datos de entrenadores: {DESTINO.name} queda igual")
        return

    sal = sal_anterior()
    cl = claves()
    # la clave de las fotos (una sola, cifrada adentro de la copia de cada rol que ve ejercicios): así las fotos no se repiten 4 veces
    cek = hmac.new(sal, ("fotos:" + cl["coordinador"]).encode("utf-8"), hashlib.sha256).digest()
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    roles_ = []
    for rol, c in cl.items():
        k = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sal, iterations=VUELTAS).derive(c.encode("utf-8"))
        v = vista(datos, rol, b64(cek))
        iv = os.urandom(12)
        roles_.append({"iv": b64(iv), "datos": b64(AESGCM(k).encrypt(iv, gzip.compress(json.dumps(v, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9), None))})
    # (el orden no dice nada: la página prueba la clave contra cada copia)
    sobre = {"v": 2, "vueltas": VUELTAS, "sal": b64(sal), "roles": roles_}
    DESTINO.write_text("/* Sección Entrenadores: datos cifrados (se abren con la clave de cada rol). Generado por exportar_entrenadores.py */\n"
                       f"window.ENTRENADORES={json.dumps(sobre)};\n", encoding="utf-8")
    # las fotos, con la clave de las fotos y otro iv
    iv_f = os.urandom(12)
    destino_fotos.write_text(json.dumps({"v": 2, "iv": b64(iv_f), "datos": b64(AESGCM(cek).encrypt(iv_f, gzip.compress(fotos_, 9), None))}), encoding="utf-8")
    crudo = json.dumps(datos, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    HUELLA.write_text(huella)
    print(f"Listo: {DESTINO} ({DESTINO.stat().st_size // 1024} KB; sin cifrar {len(crudo) // 1024} KB) y {destino_fotos.name} ({destino_fotos.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
