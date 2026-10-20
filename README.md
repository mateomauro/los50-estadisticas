# Los 50 · Estadísticas

Estadísticas del Club Los 50 de Tandil sacadas de las planillas oficiales de la base de datos de la UAR (bd.uar.com.ar).

- **web/**: la página (portada, Jugadores y Entrenadores con clave), publicada gratis en Cloudflare Pages:
  **https://clublos50.pages.dev**. La actualización automática la vuelve a publicar cada vez que cambian los datos.
- **Actualización automática**: GitHub la corre los lunes, martes y miércoles a las 9:00 (`.github/workflows/actualizar.yml`).
  Baja solo lo nuevo, regenera todo y deja un informe con los partidos de la semana. Si falta alguna planilla o hay algo
  para revisar con el club, abre un aviso en la pestaña *Issues* (llega por mail).
- Para correrla a mano: pestaña **Actions** → *Actualizar datos de Los 50* → **Run workflow**.

## Claves

Nunca están en el código. En GitHub van en *Settings → Secrets and variables → Actions*:

| Secreto | Qué es |
|---|---|
| `UAR_USER` | usuario de la BD UAR |
| `UAR_PASS` | contraseña de la BD UAR |
| `CLAVE_ENTRENADORES` | clave de la sección Entrenadores de la web |
| `CLOUDFLARE_API_TOKEN` | token de Cloudflare para publicar la web |
| `CLOUDFLARE_ACCOUNT_ID` | cuenta de Cloudflare |

En la compu van en un archivo `.env` (que no se sube).

## Programas

| Archivo | Qué hace |
|---|---|
| `actualizar_semana.py` | hace todo en orden (lo usa la actualización automática) |
| `extraer_todo.py` | baja de la BD UAR todo lo del club (`semanal` = solo lo nuevo) |
| `extraer_los50.py` | estadísticas del plantel superior, Excel y datos de la web de jugadores |
| `procesar_todo.py` | arma la base `datos_uar/los50.db` |
| `analisis_metricas.py` | Excel para entrenadores |
| `exportar_entrenadores.py` | datos cifrados de la sección Entrenadores |
| `auditoria_datos.py`, `revisar_planillas.py` | errores de carga en las planillas para revisar con el club |

Solo lee la BD UAR: nunca edita ni borra nada.
