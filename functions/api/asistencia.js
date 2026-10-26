/* Asistencia a los entrenamientos (sección Entrenadores): guarda en Cloudflare D1 (binding ASISTENCIA, gratis)
   los días de entrenamiento de cada categoría, los entrenamientos cancelados, movidos o agregados, las listas
   y los chicos que los entrenadores suman o sacan. La lista inicial de chicos (los fichados en la UAR) va cifrada en la página.
   De cada chico se guarda solo el número de jugador de la UAR; el nombre, solo de los que se suman a mano. Nada de documentos ni teléfonos.
   GET  /api/asistencia?cat=M16  -> { horarios, entrenamientos, listas, chicos } de esa categoría
   GET  /api/asistencia          -> { resumen: { M16: { listas, presentes, ultima } }, chicos: { M16: { alta, baja } } } para la lista de categorías
   GET  /api/asistencia?respaldo=1  -> todas las tablas (la copia de seguridad de respaldo_asistencia.py)
   POST /api/asistencia  { cat, accion, ..., por? } -> guarda (accion: horarios | entrenamiento | lista | borrar_lista | chico)
     lista: { fecha, presentes, base? } — con "base" (lo que estaba guardado cuando empezó) se juntan las listas de dos entrenadores
   Todo pide la ficha de la clave de Entrenadores en el encabezado "x-ficha" (la misma de los videos: SHA-256 de la clave + ":los50-videos",
   y buscada entre las claves de cada rol en functions/_roles.js; los dirigentes no entran acá y la copia de seguridad es solo del coordinador). Cada cambio queda anotado en la tabla "cambios" con la fecha y quién lo hizo. */
const CATS = ["Plantel superior", "M19", "M17", "M16", "M15", "M14", "M13", "M12", "M11", "M10", "M9", "M8", "M7", "M6"];
const ESQUEMA = [
  "CREATE TABLE IF NOT EXISTS horarios (cat TEXT NOT NULL, dia INTEGER NOT NULL, hora TEXT NOT NULL, PRIMARY KEY (cat, dia))",
  // solo los que no son como siempre: cancelado (con el motivo), movido (otra hora ese mismo día) o extra (agregado)
  "CREATE TABLE IF NOT EXISTS entrenamientos (cat TEXT NOT NULL, fecha TEXT NOT NULL, hora TEXT, estado TEXT NOT NULL, motivo TEXT, PRIMARY KEY (cat, fecha))",
  "CREATE TABLE IF NOT EXISTS listas (cat TEXT NOT NULL, fecha TEXT NOT NULL, presentes TEXT NOT NULL, por TEXT, ts TEXT NOT NULL, PRIMARY KEY (cat, fecha))",
  // alta: un chico que se sumó a mano (con nombre); baja: un fichado que ya no viene
  "CREATE TABLE IF NOT EXISTS chicos (cat TEXT NOT NULL, id TEXT NOT NULL, nombre TEXT, estado TEXT NOT NULL, ts TEXT NOT NULL, PRIMARY KEY (cat, id))",
  "CREATE TABLE IF NOT EXISTS cambios (ts TEXT NOT NULL, cat TEXT NOT NULL, accion TEXT NOT NULL, detalle TEXT, por TEXT)",
];
const FECHA = /^\d{4}-\d{2}-\d{2}$/, HORA = /^([01]\d|2[0-3]):[0-5]\d$/, ID = /^[\w-]{1,40}$/;

const json = (datos, status = 200) => new Response(JSON.stringify(datos), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
import { rolDe, configurado } from "../_roles.js";
const texto = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

// las tablas se crean solas la primera vez
let listo = null;
const iniciar = (db) => (listo ??= db.batch(ESQUEMA.map((s) => db.prepare(s))).catch((e) => { listo = null; throw e; }));

export async function onRequest({ request, env }) {
  if (!env.ASISTENCIA || !configurado(env)) return json({ error: "sin configurar" }, 503);
  const rol = await rolDe(request.headers.get("x-ficha"), env);
  if (!rol) return json({ error: "clave" }, 401);
  if (rol === "comision") return json({ error: "permiso" }, 403); // los dirigentes no usan la asistencia
  const db = env.ASISTENCIA;
  await iniciar(db);
  const todo = (sql, ...v) => db.prepare(sql).bind(...v).all().then((r) => r.results);

  if (request.method === "GET") {
    const q = new URL(request.url).searchParams, cat = q.get("cat");
    // la copia de seguridad (respaldo_asistencia.py, en la actualización automática): todas las tablas
    if (q.get("respaldo")) {
      if (rol !== "coordinador") return json({ error: "permiso" }, 403); // la copia de seguridad es solo de Coordinación
      const tablas = ["horarios", "entrenamientos", "listas", "chicos", "cambios"];
      const filas = await Promise.all(tablas.map((x) => todo(`SELECT * FROM ${x}`)));
      return json({ fecha: new Date().toISOString(), ...Object.fromEntries(tablas.map((x, i) => [x, filas[i]])) });
    }
    if (!cat) {
      const resumen = {}, chicos = {};
      for (const r of await todo("SELECT cat, COUNT(*) AS listas, SUM(json_array_length(presentes)) AS presentes, MAX(fecha) AS ultima FROM listas GROUP BY cat")) {
        resumen[r.cat] = { listas: r.listas, presentes: r.presentes || 0, ultima: r.ultima };
      }
      for (const r of await todo("SELECT cat, estado, COUNT(*) AS n FROM chicos GROUP BY cat, estado")) (chicos[r.cat] ??= { alta: 0, baja: 0 })[r.estado] = r.n;
      return json({ resumen, chicos });
    }
    if (!CATS.includes(cat)) return json({ error: "datos" }, 400);
    const [horarios, entrenamientos, listas, chicos] = await Promise.all([
      todo("SELECT dia, hora FROM horarios WHERE cat = ? ORDER BY dia", cat),
      todo("SELECT fecha, hora, estado, motivo FROM entrenamientos WHERE cat = ? ORDER BY fecha", cat),
      todo("SELECT fecha, presentes, por, ts FROM listas WHERE cat = ? ORDER BY fecha", cat),
      todo("SELECT id, nombre, estado, ts FROM chicos WHERE cat = ? ORDER BY ts", cat),
    ]);
    return json({ horarios, entrenamientos, listas: listas.map((l) => ({ ...l, presentes: JSON.parse(l.presentes) })), chicos });
  }

  if (request.method !== "POST") return json({ error: "método" }, 405);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "datos" }, 400); }
  const cat = b && b.cat, ts = new Date().toISOString(), por = texto(b && b.por, 60) || null;
  if (!CATS.includes(cat)) return json({ error: "datos" }, 400);
  const mal = () => json({ error: "datos" }, 400);
  const anotar = (detalle) => db.prepare("INSERT INTO cambios (ts, cat, accion, detalle, por) VALUES (?, ?, ?, ?, ?)").bind(ts, cat, b.accion, JSON.stringify(detalle), por);
  let ops, resp = { ok: true };

  if (b.accion === "horarios") {
    // los días de la semana (0 = domingo) con su hora; reemplaza los que había
    const hs = Array.isArray(b.horarios) ? b.horarios : null;
    if (!hs || hs.length > 7 || hs.some((h) => !Number.isInteger(h.dia) || h.dia < 0 || h.dia > 6 || !HORA.test(h.hora))) return mal();
    ops = [db.prepare("DELETE FROM horarios WHERE cat = ?").bind(cat),
      ...hs.map((h) => db.prepare("INSERT OR REPLACE INTO horarios (cat, dia, hora) VALUES (?, ?, ?)").bind(cat, h.dia, h.hora)), anotar(hs)];
  } else if (b.accion === "entrenamiento") {
    // cancelado, movido (otra hora) o extra; "normal" vuelve a dejarlo como siempre
    const { fecha, estado } = b, hora = b.hora || null, motivo = texto(b.motivo, 120) || null;
    if (!FECHA.test(fecha || "") || !["cancelado", "movido", "extra", "normal"].includes(estado) || (hora && !HORA.test(hora))) return mal();
    if ((estado === "movido" || estado === "extra") && !hora) return mal();
    ops = [estado === "normal" ? db.prepare("DELETE FROM entrenamientos WHERE cat = ? AND fecha = ?").bind(cat, fecha)
      : db.prepare("INSERT OR REPLACE INTO entrenamientos (cat, fecha, hora, estado, motivo) VALUES (?, ?, ?, ?, ?)").bind(cat, fecha, hora, estado, motivo),
    anotar({ fecha, estado, hora, motivo })];
  } else if (b.accion === "lista") {
    // si dos entrenadores toman la lista del mismo día, se juntan: "base" es lo que estaba guardado cuando empezó a marcar,
    // y sobre lo que hay ahora se aplica solo lo que él cambió (los que marcó y los que desmarcó)
    const { fecha } = b, lista = (v) => (Array.isArray(v) ? [...new Set(v.map(String))] : null);
    const presentes = lista(b.presentes), base = lista(b.base);
    if (!FECHA.test(fecha || "") || !presentes || presentes.length > 300 || [...presentes, ...(base || [])].some((id) => !ID.test(id))) return mal();
    const antes = await db.prepare("SELECT presentes, por FROM listas WHERE cat = ? AND fecha = ?").bind(cat, fecha).first();
    let final = presentes, quien = por;
    if (antes && base) {
      const hay = new Set(JSON.parse(antes.presentes));
      presentes.filter((id) => !base.includes(id)).forEach((id) => hay.add(id));
      base.filter((id) => !presentes.includes(id)).forEach((id) => hay.delete(id));
      final = [...hay];
    }
    if (antes && antes.por && por && !antes.por.split(" y ").includes(por)) quien = texto(`${antes.por} y ${por}`, 60);
    else if (antes && !por) quien = antes.por;
    ops = [db.prepare("INSERT OR REPLACE INTO listas (cat, fecha, presentes, por, ts) VALUES (?, ?, ?, ?, ?)").bind(cat, fecha, JSON.stringify(final), quien, ts),
      anotar({ fecha, presentes: final.length })];
    resp = { ok: true, presentes: final.length };
  } else if (b.accion === "borrar_lista") {
    if (!FECHA.test(b.fecha || "")) return mal();
    ops = [db.prepare("DELETE FROM listas WHERE cat = ? AND fecha = ?").bind(cat, b.fecha), anotar({ fecha: b.fecha })];
  } else if (b.accion === "chico") {
    // alta: un chico nuevo (se le da un id "m…"); baja: un fichado o un sumado que ya no viene; activo: deshace la baja;
    // sigue: no vino nunca pero el entrenador dice que sigue en el equipo (vuelve a contar en el porcentaje)
    const { estado } = b;
    if (estado === "alta") {
      const nombre = texto(b.nombre, 80);
      if (nombre.length < 2) return mal();
      const id = `m${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
      ops = [db.prepare("INSERT INTO chicos (cat, id, nombre, estado, ts) VALUES (?, ?, ?, 'alta', ?)").bind(cat, id, nombre, ts), anotar({ id, nombre })];
      resp = { ok: true, id };
    } else if (estado === "baja" || estado === "activo" || estado === "sigue") {
      const id = String(b.id || "");
      if (!ID.test(id)) return mal();
      ops = id.startsWith("m")
        ? [db.prepare("UPDATE chicos SET estado = ? WHERE cat = ? AND id = ?").bind(estado === "activo" ? "alta" : estado, cat, id)]
        : [estado !== "activo" ? db.prepare("INSERT OR REPLACE INTO chicos (cat, id, nombre, estado, ts) VALUES (?, ?, NULL, ?, ?)").bind(cat, id, estado, ts)
          : db.prepare("DELETE FROM chicos WHERE cat = ? AND id = ?").bind(cat, id)];
      ops.push(anotar({ id, estado }));
    } else return mal();
  } else return mal();

  await db.batch(ops);
  return json(resp);
}
