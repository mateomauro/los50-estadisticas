"""Sesion autenticada contra bd.uar.com.ar (lee credenciales de .env)."""
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

BASE = "https://bd.uar.com.ar"
HERE = Path(__file__).parent
load_dotenv(HERE / ".env")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept-Language": "es-AR,es;q=0.9",
}

DELAY = 1.0  # segundos entre pedidos, para no cargar el sitio


def login() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    s.get(f"{BASE}/users/login", timeout=30)
    user, pwd = os.environ["UAR_USER"], os.environ["UAR_PASS"]
    r = s.post(
        f"{BASE}/users/login",
        data={
            "_method": "POST",
            "authentik_login_mode": "legacy",
            "data[User][username]": user,
            "data[User][password]": pwd,
        },
        timeout=30,
    )
    r.raise_for_status()
    if "/users/login" in r.url and "login-password" in r.text:
        raise RuntimeError("Login fallido: revisar usuario/contraseña o modo Authentik")
    return s


def get(s: requests.Session, path: str, **kw) -> requests.Response:
    """Si la UAR se cae un rato (503, sin respuesta), espera y prueba de nuevo: hasta 4 veces."""
    url = path if path.startswith("http") else f"{BASE}{path}"
    for intento in range(4):
        time.sleep(DELAY if intento == 0 else 20 * intento)
        try:
            r = s.get(url, timeout=60, **kw)
        except (requests.ConnectionError, requests.Timeout):
            if intento == 3:
                raise
            continue
        if r.status_code < 500:
            break
    r.raise_for_status()
    return r
