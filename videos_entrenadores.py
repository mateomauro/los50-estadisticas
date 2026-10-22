"""Videos de la sección Entrenadores: los convierte para verlos bien en el celular y los sube a Cloudflare R2.

Cada video se corta en pedacitos de 4 segundos (HLS) en dos calidades: el celular elige sola la que puede según la señal.
Los pedacitos se guardan en R2 (bucket los50-videos) y la web los sirve solo a quien entró con la clave
(functions/videos/[[path]].js controla la cookie que pone la página al abrir la sección).

Uso:
    python videos_entrenadores.py convertir "<carpeta con los videos>"   # deja todo en videos_hls/ (no se sube a GitHub)
    python videos_entrenadores.py subir                                   # sube a R2 lo que todavía no se subió
Necesita ffmpeg (convertir) y estar logueado en Cloudflare con wrangler (subir).
"""
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent
SALIDA = HERE / "videos_hls"                  # los pedacitos, en la compu (pesan mucho para GitHub)
DATOS = HERE / "guia" / "videos.json"         # título, duración y dónde va cada video (va cifrado con la guía)
FOTOS = HERE / "guia" / "fotos"               # la imagen de tapa de cada video (va cifrada con las fotos)
BUCKET = "los50-videos"
WRANGLER = ["npx", "--yes", "wrangler@4.151.3"]

# id | archivo (carpeta LINE+MAUL/videos del Drive de Coordinación) | título | ejercicios de la guía donde se muestra | categorías
VIDEOS = [
    ("lanzar-sentado", "210322 Sentado.mov", "Lanzar sentado y acostado", ["line-lanzador-2", "line-lanzador-3"], []),
    ("lanzar-acostado", "H_Tirada Varios.mp4", "Lanzar acostado, sobre pelota de pilates", ["line-lanzador-2"], []),
    ("movilidad-hooker", "H_LO Movilidad Hoockers.mp4", "Movilidad del hooker", ["line-lanzador-7"], []),
    ("movilidad-dorsal", "H_Movilidad dorsal.mp4", "Movilidad dorsal", ["line-lanzador-7"], []),
    ("lanzar-distancia", "210322 Tirada NB.mov", "Lanzar a distancia", ["line-lanzador-8"], []),
    ("lanzar-pelotas", "H_Tirada Dif pelotas.mp4", "Lanzar con distintas pelotas", ["line-lanzador-8"], []),
    ("line-trios", "Line.mov", "Line: levantada y salto", ["line-trios-1", "line-trios-4"], []),
    ("impacto-mas1", "A. Impacto line salt.mp4", "Impacto del +1", ["maul-of-1"], []),
    ("impacto-salta", "B. Impacto Salta.mp4", "Impacto del +1 (Salta)", ["maul-of-1"], []),
    ("impacto-jujuy", "C. Impacto line´1.mp4", "Impacto del +1 (Jujuy)", ["maul-of-1"], []),
    ("impacto-cordoba", "D. Impacto Cordoba.mp4", "Impacto del +1 (Córdoba)", ["maul-of-1"], []),
    ("cunas-mas1", "03 FORWARDS (Cuñas+1) (1).mov", "Cuñas y +1", ["maul-of-2"], []),
    ("maul-escudos", "Maul.mov", "Maul contra escudos", ["maul-of-2"], []),
    ("line-maul", "04 FORWARDS (Line-Maul) (1).mov", "Line y maul", ["maul-of-3"], []),
    ("secuencia-maul", "Secuencia de Maul.mov", "Secuencia de maul", ["maul-of-3"], []),
    ("def-maul", "Def Maul Giro y Derrumbe.mov", "Defensa de maul: giro y derrumbe", ["maul-def-3"], []),
    ("partido-2026-03-07", "7 de marzo 2026 M16 y 17-002.mp4", "Partido contra Sociedad Sportiva, 7 de marzo de 2026", [], ["M16", "M17"]),
]


def medir(f):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height:format=duration",
                          "-of", "json", str(f)], capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    return float(j["format"]["duration"]), int(j["streams"][0]["height"])


def arreglar_master(out):
    """En Windows ffmpeg escribe "0\\index.m3u8": el iPhone necesita la barra "/"."""
    m = out / "master.m3u8"
    if m.exists() and "\\" in (t := m.read_text(encoding="utf-8")):
        m.write_text(t.replace("\\", "/"), encoding="utf-8", newline="\n")


def convertir(carpeta):
    carpeta = Path(carpeta)
    FOTOS.mkdir(parents=True, exist_ok=True)
    datos = json.loads(DATOS.read_text(encoding="utf-8")) if DATOS.exists() else {}
    for vid, archivo, titulo, ejercicios, cats in VIDEOS:
        f = next((x for x in (carpeta / archivo, Path.home() / "Downloads" / archivo) if x.exists()), None)
        if not f:
            print(f"Falta {archivo}: se saltea")
            continue
        dur, alto = medir(f)
        datos[vid] = {"titulo": titulo, "duracion": round(dur), "ejercicios": ejercicios, "cats": cats}
        out = SALIDA / vid
        if (out / "master.m3u8").exists():
            arreglar_master(out)
            print(f"Ya estaba: {vid}")
            continue
        # dos calidades: 360p para poca señal y la mejor que tenga el video (hasta 720p)
        alta = min(alto, 720)
        kbps = {360: 700, 480: 1100, 720: 2000}[alta] if alta in (360, 480, 720) else 2000
        (out / "0").mkdir(parents=True, exist_ok=True)
        (out / "1").mkdir(parents=True, exist_ok=True)
        print(f"Convirtiendo {vid} ({round(dur)} s)…", flush=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f),
                        "-filter_complex", f"[0:v]split=2[a][b];[a]scale=-2:360[v0];[b]scale=-2:{alta}[v1]",
                        "-map", "[v0]", "-map", "[v1]", "-map", "0:a:0", "-map", "0:a:0",
                        "-c:v", "libx264", "-preset", "medium", "-profile:v", "main", "-pix_fmt", "yuv420p",
                        "-b:v:0", "700k", "-maxrate:v:0", "770k", "-bufsize:v:0", "1400k",
                        "-b:v:1", f"{kbps}k", "-maxrate:v:1", f"{int(kbps * 1.1)}k", "-bufsize:v:1", f"{kbps * 2}k",
                        "-force_key_frames", "expr:gte(t,n_forced*4)",
                        "-c:a", "aac", "-ac", "2", "-b:a:0", "64k", "-b:a:1", "96k",
                        "-f", "hls", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
                        "-hls_segment_filename", str(out / "%v" / "s%04d.ts"), "-master_pl_name", "master.m3u8",
                        "-var_stream_map", "v:0,a:0 v:1,a:1", str(out / "%v" / "index.m3u8")], check=True)
        arreglar_master(out)
        # la tapa: un cuadro a un cuarto del video
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(round(dur / 4, 1)), "-i", str(f), "-frames:v", "1",
                        "-vf", "scale=560:-2", "-quality", "62", str(FOTOS / f"video-{vid}.webp")], check=True)
    DATOS.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Listo: {DATOS} ({len(datos)} videos)")


def subir():
    hecho = SALIDA / ".subidos"
    ya = set(hecho.read_text(encoding="utf-8").split("\n")) if hecho.exists() else set()
    archivos = sorted(p for p in SALIDA.rglob("*") if p.is_file() and p.name != ".subidos")
    falta = [p for p in archivos if p.relative_to(SALIDA).as_posix() not in ya]
    tipo = lambda p: "application/vnd.apple.mpegurl" if p.suffix == ".m3u8" else "video/mp2t"

    def una(p):
        clave = p.relative_to(SALIDA).as_posix()
        r = subprocess.run(WRANGLER + ["r2", "object", "put", f"{BUCKET}/{clave}", "--file", str(p), "--content-type", tipo(p), "--remote"],
                           capture_output=True, encoding="utf-8", errors="replace", shell=sys.platform == "win32")
        return clave, r.returncode == 0, (r.stderr or r.stdout or "")[-300:]

    print(f"Subiendo {len(falta)} archivos (ya estaban {len(ya)})…", flush=True)
    with ThreadPoolExecutor(8) as ex, hecho.open("a", encoding="utf-8") as reg:
        for i, (clave, ok, err) in enumerate(ex.map(una, falta), 1):
            if ok:
                reg.write(clave + "\n"); reg.flush()
            else:
                print(f"Error con {clave}: {err}")
            if i % 50 == 0:
                print(f"  {i}/{len(falta)}", flush=True)
    print("Listo")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "convertir" and len(sys.argv) == 3:
        convertir(sys.argv[2])
    elif len(sys.argv) == 2 and sys.argv[1] == "subir":
        subir()
    else:
        sys.exit(__doc__)
