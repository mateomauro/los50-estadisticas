# Los 50 · Estadísticas

Estadísticas del Club Los 50 de Tandil sacadas de las planillas oficiales de la base de datos de la UAR (bd.uar.com.ar).

- **web/**: las páginas. Se publican gratis en Cloudflare Pages como dos webs separadas, cada una solo con lo suyo:
  - **https://los50-jugadores.pages.dev**: Jugadores (pública) y Revisar datos.
  - **https://los50-entrenadores.pages.dev**: Entrenadores, con clave.

  La actualización automática las vuelve a publicar cada vez que cambian los datos. La dirección de antes,
  clublos50.pages.dev, va a mandar cada link a la web nueva que le toca (los links compartidos siguen andando).
  **Por ahora (22/10/2026) solo está publicada Jugadores.** Entrenadores sigue como estaba en clublos50.pages.dev hasta
  que el club dé el OK; entonces: crear la base de la asistencia (`npx wrangler d1 create los50-asistencia`) y poner su
  id en `D1_ASISTENCIA` de `armar_sitios.py`, sumar `entrenadores` a la lista del paso "Publicar" del workflow, publicarla
  y publicar `sitios/viejo` (el reenvío).
- **Actualización automática**: GitHub la corre los lunes, martes y miércoles a las 9:00 (`.github/workflows/actualizar.yml`).
  Baja solo lo nuevo, regenera todo y deja un informe con los partidos de la semana. Si falta alguna planilla o hay algo
  para revisar con el club, abre un aviso en la pestaña *Issues* (llega por mail).
- Para correrla a mano: pestaña **Actions** → *Actualizar datos de Los 50* → **Run workflow**.

## Cómo se comprueba cada dato

- En la ficha de cada jugador, cada partido ("Sus partidos": titular / entró / en el banco) y cada try o patada tiene el
  botón **Planilla**: abre ahí mismo lo que dice la planilla oficial de la BD UAR, con las mismas columnas, y el control de
  que los puntos suman el resultado. Sin documentos ni datos personales; del rival, sin nombres.
  Las copias las arma `extraer_los50.py` en `web/planillas/<partido>.json`. Link a un partido: `https://los50-jugadores.pages.dev/?j=<jugador>&p=<partido>`.
- Lo que se corrigió con el club se ve marcado, con lo que figuraba en la planilla original.
- Control hecho el 21/10/2026: las 456 planillas suman el resultado oficial, y los totales del equipo coinciden con las
  66 tablas de posiciones oficiales (la UAR cuenta los 2 puntos del try penal como una conversión).

## Revisión de datos

- Lo que es **seguro** se arregla solo: por ejemplo, el mismo jugador cargado dos veces en la UAR (mismo nombre y misma
  fecha de nacimiento, nunca en el mismo partido) se junta en una sola ficha.
- Lo **dudoso** se le pregunta al club en la página **Revisar datos** (`/revisar`, con clave): jugadores que pueden ser la
  misma persona y jugadas raras de las planillas. Se contesta con botones (sí / no / no sé).
- Las respuestas se guardan en Cloudflare (KV) y la actualización siguiente las aplica (`revision.py`). Quedan registradas
  en `revision/respuestas.json`. Cuando aparecen preguntas nuevas, llega un aviso por mail con el link.

## Claves

Nunca están en el código. En GitHub van en *Settings → Secrets and variables → Actions*:

| Secreto | Qué es |
|---|---|
| `UAR_USER` | usuario de la BD UAR |
| `UAR_PASS` | contraseña de la BD UAR |
| `CLAVE_ENTRENADORES` | clave de la sección Entrenadores de la web (también va como secreto del proyecto `los50-entrenadores` en Cloudflare Pages: sin eso no se ven los videos. Si se cambia la clave, cambiarla en los dos lados) |
| `CLAVE_REVISION` | clave de la página Revisar datos (también va como secreto del proyecto `los50-jugadores` en Cloudflare Pages) |
| `CLOUDFLARE_API_TOKEN` | token de Cloudflare para publicar la web |
| `CLOUDFLARE_ACCOUNT_ID` | cuenta de Cloudflare |

En la compu van en un archivo `.env` (que no se sube). Para probar la página con la parte de Cloudflare:
`npx wrangler pages dev` (las dos juntas, con la portada `index.html`; usa las claves de `.dev.vars`, que tampoco se sube).
Para ver cada web tal cual se publica: `python armar_sitios.py` y `npx wrangler pages dev` adentro de `sitios/jugadores`
o `sitios/entrenadores`.

## Programas

| Archivo | Qué hace |
|---|---|
| `actualizar_semana.py` | hace todo en orden (lo usa la actualización automática) |
| `extraer_todo.py` | baja de la BD UAR todo lo del club (`semanal` = solo lo nuevo) |
| `extraer_los50.py` | estadísticas del plantel superior, Excel y datos de la web de jugadores |
| `procesar_todo.py` | arma la base `datos_uar/los50.db` |
| `analisis_metricas.py` | Excel para entrenadores |
| `exportar_entrenadores.py` | datos cifrados de la sección Entrenadores |
| `guia_entrenadores.py` | guía del club para Entrenadores (qué aprende cada categoría, qué se espera de cada puesto, cantos, zonas, scrum y ejercicios de line, maul y juegos), del material de Coordinación. Los puestos (`PUESTOS`) están pasados a mano del PDF del perfil del jugador, que es solo imágenes. Si cambian los Excel (progresiones, line habitos o maul): `python guia_entrenadores.py "<carpeta de Drive>"`. Las fotos de los ejercicios quedan en `guia/fotos` y se publican cifradas en `web/entrenadores.fotos.json` |
| `proximos_partidos.py` | los próximos partidos (los "Pendiente" que ya cargó la UAR) para Entrenadores: en el inicio y arriba de cada categoría. La página muestra solo los de hoy en adelante |
| `asistencia_entrenadores.py` | la lista inicial de chicos para la asistencia de Entrenadores: los fichados en Los 50 del año en curso, por categoría (el plantel superior junto y M18 con M19). Va cifrada con el resto de los datos |
| `practicas_entrenadores.py` | las prácticas que armaron los entrenadores (carpeta PLANIFICACIONES del Drive de Coordinación), día por día, para Entrenadores → Prácticas. Si suben planillas nuevas: `python practicas_entrenadores.py "<carpeta de Drive>"` (arma `guia/practicas.json`). Las columnas se buscan por su título, así que sirve para las tres formas de planilla que usan |
| `videos_entrenadores.py` | videos de Entrenadores (ejercicios y partidos): `convertir "<carpeta>"` los corta en pedacitos de 4 segundos en dos calidades (`videos_hls/`, no se sube a GitHub) y arma `guia/videos.json` y las tapas; `subir` los manda al bucket `los50-videos` de Cloudflare R2. Los videos nuevos se agregan en la lista `VIDEOS` del archivo |
| `functions/videos/[[path]].js` | la parte de Cloudflare que entrega los videos, solo a quien entró con la clave de Entrenadores (necesita en el proyecto de Pages el bucket R2 como `VIDEOS` y el secreto `CLAVE_ENTRENADORES`) |
| `web/vendor/` | librerías servidas desde la propia web (sin depender de otro sitio): Chart.js 4.5.0 para los gráficos de Entrenadores (licencia MIT, adentro del archivo), hls.js 1.6.2 para los videos en los celulares que no los abren solos (licencia Apache 2.0, `hls-LICENSE.txt`) y la licencia de los íconos Lucide, que están copiados en `web/entrenadores.js` |
| `auditoria_datos.py`, `revisar_planillas.py` | errores de carga en las planillas para revisar con el club |
| `revision.py` | jugadores repetidos, preguntas de la página Revisar datos y sus respuestas |
| `functions/api/revision.js` | la parte de Cloudflare que muestra las preguntas y guarda las respuestas |
| `functions/api/asistencia.js` | la parte de Cloudflare que guarda la asistencia de Entrenadores (días de entrenamiento, listas, cancelados y chicos que se suman o sacan) en Cloudflare D1, solo para quien entró con la clave de Entrenadores. Necesita en el proyecto de Pages la base D1 como `ASISTENCIA` y el secreto `CLAVE_ENTRENADORES`; las tablas se crean solas. Guarda el número de jugador de la UAR, y el nombre solo de los chicos sumados a mano |
| `armar_sitios.py` | separa la web en las dos que se publican (`sitios/jugadores` y `sitios/entrenadores`, no se suben a GitHub): copia a cada una solo sus archivos y cambia los links a la otra. También arma `sitios/viejo`, la dirección de antes que reenvía los links; esa se publica a mano, una sola vez (`cd sitios/viejo && npx wrangler pages deploy`) |

Solo lee la BD UAR: nunca edita ni borra nada.
