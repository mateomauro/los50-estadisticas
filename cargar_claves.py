"""Sube las claves de los roles de Entrenadores (las de .env) a GitHub y a Cloudflare, como secretos.

Uso:  python cargar_claves.py --probar      muestra qué haría, sin cambiar nada
      python cargar_claves.py               las carga (GitHub: secretos del repositorio; Cloudflare: secretos del proyecto los50-entrenadores)
      python cargar_claves.py --borrar-vieja   después de publicar: saca la clave vieja (CLAVE_ENTRENADORES) de los dos lados

Las claves no se muestran ni se escriben en ningún archivo: se pasan por la entrada del programa, no por la línea de comandos.
Necesita tener la sesión de GitHub de la cuenta personal (gh auth login) y CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID en .env.
Después de cargarlas hay que volver a publicar la web de Entrenadores (los secretos nuevos se toman en la próxima publicación).
"""
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
REPO = "mateomauro/los50-estadisticas"
PROYECTO = "los50-entrenadores"
NOMBRES = ["CLAVE_COORDINADOR", "CLAVE_ENTRENADOR", "CLAVE_PF", "CLAVE_COMISION"]
WRANGLER = "wrangler@4.151.3"


def leer_env():
    env = {}
    for linea in (HERE / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in linea and not linea.lstrip().startswith("#"):
            k, v = linea.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    return env


def correr(cmd, entrada=None, extra=None):
    r = subprocess.run(cmd, input=entrada, capture_output=True, text=True, encoding="utf-8", shell=(os.name == "nt"),
                       env={**os.environ, "WRANGLER_SEND_METRICS": "false", **(extra or {})})
    return r.returncode == 0, (r.stdout + r.stderr).strip().splitlines()[-1:] or [""]


def main():
    probar, borrar = "--probar" in sys.argv, "--borrar-vieja" in sys.argv
    env = leer_env()
    gh = {"GH_TOKEN": subprocess.run(["gh", "auth", "token", "--user", "mateomauro"], capture_output=True, text=True, shell=(os.name == "nt")).stdout.strip()}
    cf = {"CLOUDFLARE_API_TOKEN": env.get("CLOUDFLARE_API_TOKEN", ""), "CLOUDFLARE_ACCOUNT_ID": env.get("CLOUDFLARE_ACCOUNT_ID", "")}
    if not gh["GH_TOKEN"] or not all(cf.values()):
        sys.exit("Falta la sesión de GitHub (gh auth login) o CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID en .env")
    if borrar:
        ok1, m1 = correr(["gh", "secret", "delete", "CLAVE_ENTRENADORES", "--repo", REPO], extra=gh)
        ok2, m2 = correr(["npx", "--yes", WRANGLER, "pages", "secret", "delete", "CLAVE_ENTRENADORES", "--project-name", PROYECTO], entrada="y\n", extra=cf)
        print(f"GitHub: {'borrada' if ok1 else m1[0]} · Cloudflare: {'borrada' if ok2 else m2[0]}")
        return
    faltan = [n for n in NOMBRES if not env.get(n)]
    if faltan:
        sys.exit(f"Faltan en .env: {', '.join(faltan)}")
    if len({env[n] for n in NOMBRES}) < len(NOMBRES):
        sys.exit("Dos roles tienen la misma clave")
    for n in NOMBRES:
        if probar:
            print(f"{n}: se cargaría en GitHub ({REPO}) y en Cloudflare ({PROYECTO}) · largo {len(env[n])}")
            continue
        ok1, m1 = correr(["gh", "secret", "set", n, "--repo", REPO], entrada=env[n], extra=gh)
        ok2, m2 = correr(["npx", "--yes", WRANGLER, "pages", "secret", "put", n, "--project-name", PROYECTO], entrada=env[n] + "\n", extra=cf)
        print(f"{n}: GitHub {'ok' if ok1 else m1[0]} · Cloudflare {'ok' if ok2 else m2[0]}")
    if not probar:
        print("Listo. Ahora hay que volver a publicar la web de Entrenadores.")


if __name__ == "__main__":
    main()
