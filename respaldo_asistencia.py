"""Copia de seguridad de la asistencia de Entrenadores (la base D1 de Cloudflare), cifrada con la clave del coordinador.

La actualización automática la corre cada vez (lunes, martes y miércoles): baja todo por la API de la web publicada y lo
guarda cifrado en respaldos/asistencia.cifrada (tiene nombres de chicos: nunca se guarda sin cifrar en GitHub). Como el
archivo queda en GitHub, su historial guarda la copia de cada semana. Si nada cambió desde la última, no lo reescribe.

Uso:  python respaldo_asistencia.py            -> baja la asistencia y guarda la copia
      python respaldo_asistencia.py --abrir    -> abre la copia y la deja sin cifrar en respaldos/asistencia.json (no se sube)
      python respaldo_asistencia.py --sql      -> arma respaldos/restaurar.sql, para volver la base a esta copia con
                                                  npx wrangler d1 execute los50-asistencia --remote --file respaldos/restaurar.sql
      --url http://127.0.0.1:8795              -> otra web (por ejemplo, la de prueba en la compu)
Cifrado: el mismo de exportar_entrenadores.py (PBKDF2-SHA256 de 310.000 vueltas + AES-GCM 256, comprimido).
"""
import base64
import gzip
import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from armar_sitios import ENTRENADORES

HERE = Path(__file__).parent
CARPETA = HERE / "respaldos"
COPIA = CARPETA / "asistencia.cifrada"
TABLAS = ["horarios", "entrenamientos", "listas", "chicos", "cambios"]
VUELTAS = 310_000


def clave():
    """De la variable de entorno (GitHub Actions la toma de los 'secrets') o, en la compu, del archivo .env (igual que exportar_entrenadores.py)"""
    if os.environ.get("CLAVE_COORDINADOR"):
        return os.environ["CLAVE_COORDINADOR"].strip()
    env = HERE / ".env"
    if env.exists():
        for linea in env.read_text(encoding="utf-8").splitlines():
            if linea.startswith("CLAVE_COORDINADOR="):
                return linea.split("=", 1)[1].strip()
    sys.exit("Falta CLAVE_COORDINADOR (variable de entorno o .env)")


def llave(sal):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sal, iterations=VUELTAS).derive(clave().encode("utf-8"))


def bajar(url):
    """Todas las tablas, por la misma API que usa la web (con la ficha que sale de la clave)"""
    ficha = hashlib.sha256(f"{clave()}:los50-videos".encode("utf-8")).hexdigest()
    pedido = urllib.request.Request(f"{url}/api/asistencia?respaldo=1", headers={"x-ficha": ficha, "user-agent": "los50-respaldo"})
    with urllib.request.urlopen(pedido, timeout=60) as r:
        datos = json.loads(r.read())
    if not all(isinstance(datos.get(t), list) for t in TABLAS):
        sys.exit("respaldo_asistencia: la web no devolvió las tablas (¿está publicada la versión nueva?)")
    return datos


def guardar(datos):
    tablas = {t: datos[t] for t in TABLAS}
    crudo = json.dumps(tablas, ensure_ascii=False, sort_keys=True).encode("utf-8")
    # la huella dice si cambió algo desde la copia anterior (sin la clave no sirve para nada)
    huella = hashlib.sha256(clave().encode("utf-8") + b":" + crudo).hexdigest()
    if COPIA.exists() and json.loads(COPIA.read_text(encoding="utf-8")).get("huella") == huella:
        print("respaldo_asistencia: sin cambios desde la última copia")
        return
    sal, iv = os.urandom(16), os.urandom(12)
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    sobre = {"v": 1, "vueltas": VUELTAS, "fecha": datos.get("fecha"), "huella": huella, "sal": b64(sal), "iv": b64(iv),
             "datos": b64(AESGCM(llave(sal)).encrypt(iv, gzip.compress(crudo, 9), None))}
    CARPETA.mkdir(exist_ok=True)
    COPIA.write_text(json.dumps(sobre, indent=1) + "\n", encoding="utf-8")
    print(f"respaldo_asistencia: copia guardada ({', '.join(f'{t}: {len(tablas[t])}' for t in TABLAS)})")


def abrir():
    sobre = json.loads(COPIA.read_text(encoding="utf-8"))
    d = lambda k: base64.b64decode(sobre[k])
    return json.loads(gzip.decompress(AESGCM(llave(d("sal"))).decrypt(d("iv"), d("datos"), None)))


def sql(tablas):
    """Borra cada tabla y la vuelve a llenar con la copia"""
    v = lambda x: "NULL" if x is None else str(x) if isinstance(x, (int, float)) else "'" + str(x).replace("'", "''") + "'"
    lineas = []
    for t in TABLAS:
        lineas.append(f"DELETE FROM {t};")
        for fila in tablas[t]:
            lineas.append(f"INSERT INTO {t} ({', '.join(fila)}) VALUES ({', '.join(v(x) for x in fila.values())});")
    return "\n".join(lineas) + "\n"


if __name__ == "__main__":
    args = sys.argv[1:]
    url = args[args.index("--url") + 1].rstrip("/") if "--url" in args else ENTRENADORES
    if "--abrir" in args or "--sql" in args:
        tablas = abrir()
        if "--abrir" in args:
            (CARPETA / "asistencia.json").write_text(json.dumps(tablas, ensure_ascii=False, indent=1), encoding="utf-8")
            print("respaldo_asistencia: abierta en respaldos/asistencia.json (no se sube a GitHub)")
        if "--sql" in args:
            (CARPETA / "restaurar.sql").write_text(sql(tablas), encoding="utf-8")
            print("respaldo_asistencia: respaldos/restaurar.sql listo (no se sube a GitHub)")
    else:
        guardar(bajar(url))
