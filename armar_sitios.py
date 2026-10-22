"""Arma las webs que se publican en Cloudflare Pages, cada una solo con lo suyo:
  sitios/jugadores     -> https://los50-jugadores.pages.dev     Jugadores (portada) y Revisar datos. Pública.
  sitios/entrenadores  -> https://los50-entrenadores.pages.dev  Entrenadores (portada) y sus videos. Con clave.
  sitios/viejo         -> https://clublos50.pages.dev           La dirección de antes: manda cada link a la web nueva que le toca.

Se sigue trabajando en web/ y functions/ como siempre (en la compu se ven las dos juntas, con la portada index.html).
Esto copia a cada web solo los archivos que usa y le cambia los links que apuntaban a la otra.
Si un link no está donde se espera (porque cambió la página), corta con un error en vez de publicar algo roto.

Uso:  python armar_sitios.py
Después se publica cada una desde su carpeta (lo hace la actualización automática):
      cd sitios/jugadores && npx wrangler pages deploy
"""
import shutil
from pathlib import Path

HERE = Path(__file__).parent
WEB = HERE / "web"
FUNCTIONS = HERE / "functions"
SITIOS = HERE / "sitios"

JUGADORES = "https://los50-jugadores.pages.dev"
ENTRENADORES = "https://los50-entrenadores.pages.dev"
FECHA = "2026-10-20"  # compatibility_date de Cloudflare
KV_REVISION = "05ed25b09f7a43588efaa5302425f758"  # donde se guardan las respuestas de Revisar datos (no es secreto)
# la asistencia de Entrenadores (base D1 los50-asistencia, creada el 22/10/2026 con npx wrangler d1 create los50-asistencia)
D1_ASISTENCIA = "42bf4f5c-49b1-402d-9c97-b0b6076a1fae"

SITIOS_WEB = {
    "jugadores": {
        "proyecto": "los50-jugadores",
        # publicado como -> archivo de web/
        "paginas": {"index.html": "jugadores.html", "revisar.html": "revisar.html"},
        "archivos": ["app.js", "data.js", "intro.js", "styles.css", "revisar.js", "revisar.css"],
        "carpetas": ["fonts", "img", "planillas", "datos"],
        "functions": ["api/revision.js"],
        "otros": ["revision/preguntas.json"],  # lo lee functions/api/revision.js
        # (archivo publicado, texto de antes, texto nuevo): la portada ahora es Jugadores
        "links": [
            ("index.html", '<a class="top__home" href="index.html" aria-label="Volver al inicio">',
             '<a class="top__home" href="./" aria-label="Inicio">'),
            ("index.html", '''      <a class="top__inicio" href="index.html">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>Inicio</a>
''', ""),
            ("revisar.html", '<a class="top__home" href="index.html" aria-label="Volver al inicio">',
             '<a class="top__home" href="./" aria-label="Ir a Jugadores">'),
            ("revisar.html", 'href="jugadores.html"', 'href="./"'),
            ("revisar.js", 'location.href = "jugadores.html"', 'location.href = "./"'),
        ],
        "toml": f'''[[kv_namespaces]]
binding = "REVISION"
id = "{KV_REVISION}"
''',
    },
    "entrenadores": {
        "proyecto": "los50-entrenadores",
        "paginas": {"index.html": "entrenadores.html"},
        "archivos": ["entrenadores.js", "entrenadores.css", "entrenadores.data.js", "entrenadores.fotos.json", "styles.css"],
        "carpetas": ["fonts", "img", "vendor"],
        "functions": ["videos/[[path]].js", "api/asistencia.js"],
        "otros": [],
        # no tiene links a la web de Jugadores: las dos están separadas del todo
        "links": [],
        "headers": "/*\n  X-Robots-Tag: noindex, nofollow\n",
        "toml": '''[[r2_buckets]]
binding = "VIDEOS"
bucket_name = "los50-videos"
''' + (f'''
[[d1_databases]]
binding = "ASISTENCIA"
database_name = "los50-asistencia"
database_id = "{D1_ASISTENCIA}"
''' if D1_ASISTENCIA else ""),
    },
}

# clublos50.pages.dev: una función atiende todos los pedidos y los manda a la web nueva, con lo que traían (?j=…, ?p=…)
VIEJO_FUNCION = f'''// clublos50.pages.dev es la dirección de antes: cada link va a la web nueva que le toca, con todo lo que traía (?j=…).
// Lo arma armar_sitios.py.
const JUGADORES = "{JUGADORES}";
const ENTRENADORES = "{ENTRENADORES}";

export function onRequest({{ request }}) {{
  const u = new URL(request.url);
  const p = u.pathname.replace(/\\.html$/, "");
  let destino;
  if (p === "/entrenadores") destino = ENTRENADORES + "/";
  else if (p.startsWith("/videos/")) destino = ENTRENADORES + u.pathname;
  else if (p === "/" || p === "/index" || p === "/jugadores") destino = JUGADORES + "/";
  else destino = JUGADORES + u.pathname;  // /revisar, /planillas/…
  return Response.redirect(destino + u.search, 301);
}}
'''
VIEJO_INDEX = f'''<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Los 50 · Estadísticas</title>
  <meta http-equiv="refresh" content="0; url={JUGADORES}/">
  <script>location.replace("{JUGADORES}/" + location.search);</script>
</head>
<body><p>La web del club ahora está en <a href="{JUGADORES}/">{JUGADORES.removeprefix("https://")}</a>.</p></body>
</html>
'''


def _toml(proyecto, extra=""):
    return (f'# Lo arma armar_sitios.py: no se edita a mano.\nname = "{proyecto}"\npages_build_output_dir = "publico"\n'
            f'compatibility_date = "{FECHA}"\n' + (f"\n{extra}" if extra else ""))


def _limpiar(dest):
    if dest.exists():
        shutil.rmtree(dest)
    (dest / "publico").mkdir(parents=True)


def armar(nombre, c):
    dest = SITIOS / nombre
    _limpiar(dest)
    pub = dest / "publico"
    for publicado, origen in c["paginas"].items():
        shutil.copy2(WEB / origen, pub / publicado)
    for a in c["archivos"]:
        shutil.copy2(WEB / a, pub / a)
    for d in c["carpetas"]:
        shutil.copytree(WEB / d, pub / d)
    for f in c["functions"]:
        (dest / "functions" / f).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(FUNCTIONS / f, dest / "functions" / f)
    for f in c["otros"]:
        (dest / f).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(HERE / f, dest / f)
    for archivo, antes, nuevo in c["links"]:
        f = pub / archivo
        s = f.read_text(encoding="utf-8")
        if antes not in s:
            raise SystemExit(f"armar_sitios: en {nombre}/{archivo} no está {antes[:60]!r} (¿cambió la página?)")
        f.write_text(s.replace(antes, nuevo), encoding="utf-8")
    if c.get("headers"):
        (pub / "_headers").write_text(c["headers"], encoding="utf-8")
    (dest / "wrangler.toml").write_text(_toml(c["proyecto"], c["toml"]), encoding="utf-8")
    # nada de la otra web: ni sus páginas ni su dirección
    otra = "entrenadores" if nombre == "jugadores" else "jugadores"
    url_otra = ENTRENADORES if nombre == "jugadores" else JUGADORES
    for f in pub.rglob("*"):
        if f.is_file() and f.suffix in (".html", ".js") and f.name not in ("data.js", "entrenadores.data.js"):
            s = f.read_text(encoding="utf-8", errors="ignore")
            if f"{otra}.html" in s or url_otra in s:
                raise SystemExit(f"armar_sitios: {nombre}/{f.relative_to(pub)} todavía apunta a la web de {otra}")
    if nombre == "entrenadores" and not D1_ASISTENCIA:
        print("  ojo: falta D1_ASISTENCIA; publicada así, la asistencia no anda")
    peso = sum(f.stat().st_size for f in dest.rglob("*") if f.is_file())
    print(f"{nombre}: {sum(1 for f in pub.rglob('*') if f.is_file())} archivos, {peso / 1e6:.1f} MB")


def armar_viejo():
    dest = SITIOS / "viejo"
    _limpiar(dest)
    (dest / "publico" / "index.html").write_text(VIEJO_INDEX, encoding="utf-8")
    (dest / "functions").mkdir()
    (dest / "functions" / "[[path]].js").write_text(VIEJO_FUNCION, encoding="utf-8")
    (dest / "wrangler.toml").write_text(_toml("clublos50"), encoding="utf-8")
    print("viejo: clublos50 -> las dos webs nuevas")


if __name__ == "__main__":
    for nombre, c in SITIOS_WEB.items():
        armar(nombre, c)
    armar_viejo()
