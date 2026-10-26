# Los 50 · De dónde salen los datos y qué estadísticas armamos

Contexto del proyecto de estadísticas del **Club Los 50 de Tandil** (Unión de Mar del Plata). Está al 24/10/2026.
Para el detalle de cada programa y de las claves, ver el [README](../README.md).

## 1. En una frase

Bajamos todo lo que la **base de datos oficial de la UAR** (bd.uar.com.ar) tiene del club, lo ordenamos en una base propia y con eso armamos
dos webs: **Jugadores** (pública, plantel superior) y **Entrenadores** (con clave, todas las categorías juveniles y herramientas de trabajo).
Todo se actualiza solo tres veces por semana.

## 2. De dónde salen los datos

**Fuente única de estadísticas: las planillas oficiales de la BD UAR.** Las estadísticas de partidos no vienen de ningún otro lado.

- Se entra con el usuario del club (`UAR_USER` y `UAR_PASS`, guardados como secretos de GitHub y en `.env` en la compu; nunca en el código).
- **Solo se lee.** Los programas usan páginas "view" y filtros de búsqueda; nunca editan, borran ni reabren nada. Va despacio: 2 pedidos a la vez con pausa de 1 segundo.
- Club `182` (LOS 50), unión `2` (Mar del Plata).
- `extraer_todo.py` baja por etapas: listados (jugadores, entrenadores, sanciones, pases, conmociones…), torneos, **partidos** y **jugadores**.
  En modo `semanal` baja solo lo nuevo: torneos del año, partidos sin cerrar y jugadores nuevos.
- Cada página se guarda **en bruto y comprimida** en `datos_uar/raw/` (unos 48 MB). Sirve de respaldo y permite re-analizar sin volver a bajar.
- **Privacidad:** antes de guardar, `privacidad.py` saca DNI, dirección, teléfonos, mail, obra social y datos médicos. Las estadísticas no los usan.
  Se dejan peso y altura (los usa la parte de físico de Entrenadores). De los rivales no se guardan nombres de jugadores.

## 3. Cómo se ordena: la base propia

`procesar_todo.py` arma `datos_uar/los50.db` (SQLite, unos 7 MB). Tablas principales:

| Tabla | Qué tiene | Filas aprox. |
|---|---|---|
| `partidos` | cada partido: torneo, categoría, año, fecha, rival, local/visitante, estado, tantos de cada equipo, resultado, puntos de tabla | 1.597 |
| `planteles` | quién jugó cada partido: dorsal, jugador, posición (titulares del 1 al 15, suplentes del 16 en adelante) | 66.197 |
| `incidencias` | cada hecho del partido: try, conversión, penal, drop, amarilla, roja, ingresó, se retiró, lesionado, con minuto y tiempo | 36.649 |
| `jugadores` | ficha: nacimiento, posición, último fichaje, altura y peso | 1.487 |
| `torneos`, `rondas`, `posiciones` | cada torneo y su tabla de posiciones oficial | 235 · 410 · 3.036 |
| `fichajes` | en qué club y año estuvo fichado cada jugador | 5.013 |
| `asistencia` (UAR) | asistencia que la UAR carga a cada partido | 3.495 |
| `tarjetas`, `sanciones`, `conmociones`, `entrenadores`… | disciplina y datos del club | pocas |

- **Cobertura:** partidos de 2017 a 2026 (1.300 cerrados, 68 cerrados por walkover, 195 suspendidos, 24 iniciados, 10 pendientes).
  Por categoría: M15 (253), Primera (208), Intermedia (208), M16 (199), M17 (191), M19 (181), M14 (137, desde 2021), Pre-Intermedia (111, desde 2018), M13 (58, desde 2024).
- **Los infantiles (M12 para abajo) casi no tienen partidos en la UAR** (solo 3). Para ellos no hay estadísticas de partidos; la app muestra qué tiene que aprender cada categoría.
- La base está pensada para crecer: a futuro se le suman mediciones físicas, gimnasio o nutrición, unidas a `jugadores` por `player_id`.

### Cómo se cuentan los puntos
Try 5 · Try penal 7 · Conversión 2 · Penal 3 · Drop 3. Solo cuentan **partidos oficiales** con resultado cargado (sin amistosos ni sevens).
La UAR cuenta los 2 puntos del try penal como una conversión, y eso se respeta.

### Cómo se mantienen los datos limpios
- Las planillas de la UAR tienen errores de carga. Lo que es **seguro** se arregla solo. Ejemplo: el mismo jugador cargado dos veces (mismo nombre y fecha de nacimiento, nunca en el mismo partido) se junta en una ficha. Mellizos no se juntan nunca.
- Lo **dudoso** se le pregunta al club en la página **Revisar datos** (con clave): "¿son la misma persona?", jugadas raras. Se contesta sí / no / no sé, y la actualización siguiente lo aplica (`revision.py`, carpeta `revision/`).
- Lo corregido con el club se muestra marcado, con lo que decía la planilla original.
- **Controles hechos el 21/10/2026:** las 456 planillas de la web de Jugadores suman el resultado oficial, y los totales del equipo coinciden con las 66 tablas de posiciones oficiales.
- Cada dato se puede comprobar: el botón **Planilla** de la web abre una copia de lo que dice la planilla oficial (`web/planillas/`).
- Las notas de diarios de 2008 a 2016 (no oficiales) se sacaron de la web el 21/10/2026: solo datos oficiales. El Excel de diarios sigue existiendo.

## 4. Qué estadísticas armamos

### Web de Jugadores (pública): https://los50-jugadores.pages.dev
Plantel superior (Primera, Intermedia y Pre-Intermedia), todos los años. Es la parte pensada para mostrar al club y, más adelante, para vender a otros clubes.
- **Ficha de cada jugador:** partidos jugados, de titular, entrando del banco o sin entrar, minutos, tries, conversiones, penales, drops, puntos, amarillas, rojas, temporadas, y cada partido con su planilla.
- **Rankings** de jugadores por categoría y temporada, y resultados del equipo, torneos y tablas de posiciones oficiales.
- Los minutos de cada partido salen de la duración real del torneo (`minutos_por_tiempo`).
- Sin documentos ni datos personales.

### Web de Entrenadores (con clave): https://los50-entrenadores.pages.dev
Los datos van **cifrados** (clave del club, AES-GCM) dentro de la web. Incluye las juveniles (M19 a M13). Por categoría y por año responde:
1. **¿Cómo le fue?** Ganados, empatados, perdidos, % de victorias, puntos a favor y en contra por partido, y cómo terminó en cada torneo.
2. **¿Cómo se compara con todos sus años?** Cada métrica contra su promedio histórico: "mejor / como lo normal / peor que lo normal".
3. **Partidos y rivales:** historial contra cada rival, local y visitante, amarillas por partido, % de puntos en contra en el 2.º tiempo.
4. **Jugadores:** quiénes jugaron, cuántos partidos, titulares o suplentes, cuántos chicos distintos se convocaron (si se rota o siempre juegan los mismos).
5. **¿Los chicos siguen?** Retención: de los que jugaron un año, cuántos siguieron en el club la temporada siguiente. Y en M19, cuántos pasaron a plantel superior en 2 temporadas.
6. **Los tries: quién y cuándo** (`tries_analisis.py`): por línea del equipo (primera, segunda, tercera, medios, centros, wings y fullback), por momento (1.er tiempo, 2.º, últimos 10 minutos) y desde el banco.
   - La planilla **no dice de qué jugada vino** el try (line, scrum, contraataque): ese campo viene vacío.
   - El puesto se saca de la camiseta del titular. **En M17 para abajo la camiseta no sigue el puesto** (solo ~60% usa del 1 al 15), así que ahí solo se muestra el momento del partido.
7. **Todo el club:** camino a Primera (debuts, edad y experiencia del XV titular, cuántos salieron de las juveniles), edad relativa (en qué trimestre nacieron: si sobran los de enero-marzo), físico (peso y altura de la ficha UAR por categoría y línea) y carga de partidos.
8. **Consejos:** qué recomiendan los expertos (World Rugby, UAR, estudios) para cada métrica, un diagnóstico de Los 50 y **qué empezar a medir** que la UAR no entrega (`recomendaciones_expertos.py`).
- Hay un Excel privado con lo mismo: `Los50_Analisis_Entrenadores.xlsx`.

### Lo que la UAR no da (y por eso no hay estadísticas)
- De qué jugada vino cada try o penal; patadas erradas (solo se ven las que entraron); tackles, rucks, line, scrum ni posesión.
- Mediciones físicas, gimnasio, nutrición. Es el objetivo a futuro (la base ya está preparada).

## 5. Otras cosas que se suman a Entrenadores (no son de la UAR)

| Qué | De dónde sale |
|---|---|
| Qué aprende cada categoría, qué se espera de cada puesto, cantos y zonas, scrum, ejercicios de line, maul y juegos | Drive de Coordinación de Rugby (Magali Fazzi), pasado una vez por `guia_entrenadores.py` |
| Prácticas día por día (295, de febrero a octubre de 2026) | Planillas de cada entrenador en el mismo Drive (`practicas_entrenadores.py`). **No se actualizan solas todavía** |
| Videos de ejercicios | Subidos a Cloudflare R2 (`videos_entrenadores.py`) |
| Próximos partidos | Los "Pendiente" que ya cargó la UAR (`proximos_partidos.py`); se ocultan las finales que dependen de semis sin jugar |
| Lista de chicos para la asistencia | Los fichados en Los 50 del año, por categoría (`asistencia_entrenadores.py`) |
| **Asistencia** (días de entrenamiento, listas, suspendidos, chicos que se suman o sacan) | La cargan los entrenadores en la app; se guarda en la base **D1** de Cloudflare (`functions/api/asistencia.js`). Tiene copia de seguridad cifrada en cada actualización (`respaldo_asistencia.py`) |
| Dibujos de los ejercicios | `diagramas_entrenadores.py`, con el formato de las fichas de World Rugby; todos "para revisar" |

## 6. Cómo se actualiza solo

GitHub Actions corre **lunes, martes y miércoles a las 9:00 (hora de Argentina)** (`.github/workflows/actualizar.yml`), con `actualizar_semana.py`:
1. Trae lo que contestó el club en "Revisar datos".
2. Baja lo nuevo de la UAR.
3. Regenera la web de Jugadores, la base `los50.db`, el Excel y los datos cifrados de Entrenadores.
4. Junta las fichas repetidas seguras y arma las preguntas dudosas.
5. Escribe `informe.md` con los partidos de la última semana (si están cerrados y con planilla completa) y abre un aviso por mail si hay algo para revisar.
6. Hace la copia de seguridad de la asistencia, guarda los cambios en GitHub y **publica las dos webs** en Cloudflare Pages.

## 7. Cosas para tener en cuenta

- **Datos dudosos conocidos:** algunos partidos de M13 y M14 figuran 0 a 0 (seguramente sin resultado cargado); los rivales a veces están escritos de varias formas (por ejemplo, Pueyrredón).
- Los números de un año en curso cambian de una semana a otra, porque dependen de que la UAR cierre las planillas.
- **Privacidad de menores:** los nombres de juveniles van solo dentro de los datos cifrados o detrás de la clave; nunca en la web pública. En la asistencia no se guardan DNI, teléfonos, mails, direcciones ni datos médicos, y solo se guarda el nombre de los chicos sumados a mano.
- La clave de Entrenadores hoy es de prueba y hay que cambiarla antes de dársela a los entrenadores (se cambia en GitHub, en Cloudflare y en los datos).
- Idea de negocio (octubre de 2026): vender solo la parte de **Jugadores** a otros clubes cuyos partidos estén en la BD UAR con el mismo detalle. La sección Entrenadores no se vende por ahora.
