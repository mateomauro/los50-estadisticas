/* Asistencia a los entrenamientos (sección Entrenadores): guarda en Cloudflare D1 (binding ASISTENCIA, gratis)
   los días de entrenamiento de cada categoría, los entrenamientos cancelados, movidos o agregados, las listas
   y los chicos que los entrenadores suman o sacan. La lista inicial de chicos (los fichados en la UAR) va cifrada en la página.
   De cada chico se guarda solo el número de jugador de la UAR; el nombre, solo de los que se suman a mano. Nada de documentos ni teléfonos.
   GET  /api/asistencia?cat=M16  -> { horarios, entrenamientos, listas, chicos } de esa categoría
   GET  /api/asistencia          -> { resumen: { M16: { listas, presentes, ultima } }, chicos: { M16: { alta, baja } } } para la lista de categorías
   POST /api/asistencia  { cat, accion, ..., por? } -> guarda (accion: horarios | entrenamiento | lista | borrar_lista | chico)
   Todo pide la ficha de la clave de Entrenadores en el encabezado "x-ficha" (la misma de los videos: SHA-256 de la clave + ":los50-videos",
   comparada con el secreto CLAVE_ENTRENADORES de Cloudflare). Cada cambio queda anotado en la tabla "cambios" con la fecha y quién lo hizo. */
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
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const ficha = async (clave) => hex(await crypto.subtle.digest("SHA-256", enc.encode(`${clave}:los50-videos`)));
const texto = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

// compara sin dar pistas por el tiempo que tarda
function igual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// las tablas se crean solas la primera vez
let listo = null;
const iniciar = (db) => (listo ??= db.batch(ESQUEMA.map((s) => db.prepare(s))).catch((e) => { listo = null; throw e; }));

export async function onRequest({ request, env }) {
  if (!env.ASISTENCIA || !env.CLAVE_ENTRENADORES) return json({ error: "sin configurar" }, 503);
  const f = request.headers.get("x-ficha") || "";
  if (!/^[0-9a-f]{64}$/.test(f) || !igual(f, await ficha(env.CLAVE_ENTRENADORES))) return json({ error: "clave" }, 401);
  const db = env.ASISTENCIA;
  await iniciar(db);
  const todo = (sql, ...v) => db.prepare(sql).bind(...v).all().then((r) => r.results);

  if (request.method === "GET") {
    const cat = new URL(request.url).searchParams.get("cat");
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
    const { fecha } = b, presentes = Array.isArray(b.presentes) ? [...new Set(b.presentes.map(String))] : null;
    if (!FECHA.test(fecha || "") || !presentes || presentes.length > 300 || presentes.some((id) => !ID.test(id))) return mal();
    ops = [db.prepare("INSERT OR REPLACE INTO listas (cat, fecha, presentes, por, ts) VALUES (?, ?, ?, ?, ?)").bind(cat, fecha, JSON.stringify(presentes), por, ts),
      anotar({ fecha, presentes: presentes.length })];
  } else if (b.accion === "borrar_lista") {
    if (!FECHA.test(b.fecha || "")) return mal();
    ops = [db.prepare("DELETE FROM listas WHERE cat = ? AND fecha = ?").bind(cat, b.fecha), anotar({ fecha: b.fecha })];
  } else if (b.accion === "chico") {
    // alta: un chico nuevo (se le da un id "m…"); baja: un fichado o un sumado que ya no viene; activo: deshace la baja
    const { estado } = b;
    if (estado === "alta") {
      const nombre = texto(b.nombre, 80);
      if (nombre.length < 2) return mal();
      const id = `m${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
      ops = [db.prepare("INSERT INTO chicos (cat, id, nombre, estado, ts) VALUES (?, ?, ?, 'alta', ?)").bind(cat, id, nombre, ts), anotar({ id, nombre })];
      resp = { ok: true, id };
    } else if (estado === "baja" || estado === "activo") {
      const id = String(b.id || "");
      if (!ID.test(id)) return mal();
      ops = id.startsWith("m")
        ? [db.prepare("UPDATE chicos SET estado = ?, ts = ? WHERE cat = ? AND id = ?").bind(estado === "baja" ? "baja" : "alta", ts, cat, id)]
        : [estado === "baja" ? db.prepare("INSERT OR REPLACE INTO chicos (cat, id, nombre, estado, ts) VALUES (?, ?, NULL, 'baja', ?)").bind(cat, id, ts)
          : db.prepare("DELETE FROM chicos WHERE cat = ? AND id = ?").bind(cat, id)];
      ops.push(anotar({ id, estado }));
    } else return mal();
  } else return mal();

  await db.batch(ops);
  return json(resp);
}
