/* Asistencia a los entrenamientos (sección Entrenadores): guarda en Cloudflare D1 (binding ASISTENCIA, gratis)
   los días de entrenamiento de cada categoría, los entrenamientos cancelados, movidos o agregados, las listas
   y los chicos que los entrenadores suman o sacan. La lista inicial de chicos (los fichados en la UAR) va cifrada en la página.
   De cada chico se guarda solo el número de jugador de la UAR; el nombre, solo de los que se suman a mano. Nada de documentos ni teléfonos.
   GET  /api/asistencia?cat=M16  -> { horarios, entrenamientos, listas, chicos } de esa categoría
   GET  /api/asistencia          -> { resumen: { M16: { listas, presentes, ultima } }, chicos: { M16: { alta, baja } } } para la lista de categorías
   GET  /api/asistencia?respaldo=1  -> todas las tablas (la copia de seguridad de respaldo_asistencia.py)
   GET  /api/asistencia?docs=1  -> los documentos y cursos de todos los chicos: [{ id, doc, anio, fecha }]
   GET  /api/asistencia?tests=1&cat=M16  -> los tests físicos de la categoría: [{ fecha, test, id, valor }]
   GET  /api/asistencia?equipos=1  -> los equipos armados para los partidos (de 60 días para atrás en adelante)
   GET  /api/asistencia?notas=1  -> las notas de feedback (más nuevas primero); "mia" dice si la escribió quien pregunta (encabezado x-dueno)
   POST /api/asistencia  { cat, accion, ..., por? } -> guarda (accion: horarios | entrenamiento | lista | borrar_lista | chico | nota | borrar_nota | equipo | test | docs)
     docs: { cat, doc (medica | autoriza | dni | conmocion | antidoping | primera), fecha, sumar: [ids], sacar: [ids] } — solo lo que cambió
     test: { cat, fecha, test (m10 | m30 | m40 | salto | bronco | cmj), valores: { id: número } } — reemplaza lo de ese test ese día
     equipo: { equipo (Primera, M16…), fecha, rival, jugadores: { "1": id, … "23": id }, cambios: { "16": { por, min } } } — sin jugadores, se borra
     nota: { cat (una categoría o "General"), texto, por, dueno } · borrar_nota: { id, dueno } — solo borra quien la escribió (dueno = un código que guarda su celular)
     lista: { fecha, presentes, base? } — con "base" (lo que estaba guardado cuando empezó) se juntan las listas de dos entrenadores
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
  // notas de feedback entre entrenadores: "dueno" es un código del celular de quien la escribió (nunca se devuelve), para que solo ella o él pueda borrarla
  // el equipo de un partido: jugadores = { número de camiseta: número de jugador }; cambios = { suplente: { por: titular, min: minuto } }
  "CREATE TABLE IF NOT EXISTS equipos (cat TEXT NOT NULL, fecha TEXT NOT NULL, rival TEXT, jugadores TEXT NOT NULL, cambios TEXT, por TEXT, ts TEXT NOT NULL, PRIMARY KEY (cat, fecha))",
  // documentos y cursos de cada chico: la ficha médica y la autorización son del año (anio = "2026"); el DNI y los cursos, "siempre"
  "CREATE TABLE IF NOT EXISTS docs (id TEXT NOT NULL, doc TEXT NOT NULL, anio TEXT NOT NULL, cat TEXT, fecha TEXT NOT NULL, por TEXT, ts TEXT NOT NULL, PRIMARY KEY (id, doc, anio))",
  // tests de campo: un valor por chico, test y día (segundos, metros o centímetros; el Bronco en segundos)
  "CREATE TABLE IF NOT EXISTS tests (cat TEXT NOT NULL, fecha TEXT NOT NULL, test TEXT NOT NULL, id TEXT NOT NULL, valor REAL NOT NULL, por TEXT, ts TEXT NOT NULL, PRIMARY KEY (cat, fecha, test, id))",
  "CREATE TABLE IF NOT EXISTS notas (id INTEGER PRIMARY KEY AUTOINCREMENT, cat TEXT NOT NULL, fecha TEXT NOT NULL, texto TEXT NOT NULL, por TEXT, dueno TEXT, ts TEXT NOT NULL)",
];
const NOTA_CATS = ["General", ...CATS], DUENO = /^[\w-]{8,64}$/, EQUIPO = /^[\p{L}\d][\p{L}\d .-]{0,29}$/u, EQ_MAX = 30;
const TESTS = ["m10", "m30", "m40", "salto", "bronco", "cmj"];
const DOCS = ["medica", "autoriza", "dni", "conmocion", "antidoping", "primera"], DOCS_ANUAL = ["medica", "autoriza"];
const objeto = (o) => !!o && typeof o === "object" && !Array.isArray(o);
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
    const q = new URL(request.url).searchParams, cat = q.get("cat");
    // la copia de seguridad (respaldo_asistencia.py, en la actualización automática): todas las tablas
    if (q.get("respaldo")) {
      const tablas = ["horarios", "entrenamientos", "listas", "chicos", "cambios", "notas", "equipos", "tests", "docs"];
      const filas = await Promise.all(tablas.map((x) => todo(`SELECT * FROM ${x}`)));
      return json({ fecha: new Date().toISOString(), ...Object.fromEntries(tablas.map((x, i) => [x, filas[i]])) });
    }
    if (q.get("docs")) return json({ docs: await todo("SELECT id, doc, anio, fecha FROM docs") });
    if (q.get("tests")) {
      if (!CATS.includes(cat)) return json({ error: "datos" }, 400);
      return json({ tests: await todo("SELECT fecha, test, id, valor FROM tests WHERE cat = ? ORDER BY fecha", cat) });
    }
    if (q.get("equipos")) {
      const filas = await todo("SELECT cat, fecha, rival, jugadores, cambios, por, ts FROM equipos WHERE fecha >= date('now', '-60 days') ORDER BY fecha, cat");
      return json({ equipos: filas.map((e) => ({ ...e, jugadores: JSON.parse(e.jugadores), cambios: JSON.parse(e.cambios || "{}") })) });
    }
    if (q.get("notas")) {
      const dueno = request.headers.get("x-dueno") || "";
      const filas = await todo("SELECT id, cat, fecha, texto, por, dueno FROM notas ORDER BY fecha DESC, ts DESC, id DESC LIMIT 300");
      return json({ notas: filas.map(({ dueno: d, ...n }) => ({ ...n, mia: !!dueno && !!d && igual(d, dueno) })) });
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
  const mal = () => json({ error: "datos" }, 400);
  if (b && b.accion === "borrar_nota") {
    // solo borra quien la escribió: el código de su celular tiene que ser el de la nota
    const id = Number(b.id);
    if (!Number.isInteger(id) || id < 1) return mal();
    const n = await db.prepare("SELECT dueno FROM notas WHERE id = ?").bind(id).first();
    if (!n) return json({ ok: true });
    if (!n.dueno || typeof b.dueno !== "string" || !igual(n.dueno, b.dueno)) return json({ error: "dueno" }, 403);
    await db.batch([db.prepare("DELETE FROM notas WHERE id = ?").bind(id),
      db.prepare("INSERT INTO cambios (ts, cat, accion, detalle, por) VALUES (?, ?, 'borrar_nota', ?, ?)").bind(ts, "General", JSON.stringify({ id }), por)]);
    return json({ ok: true });
  }
  if (b && b.accion === "equipo") {
    const eq = texto(b.equipo, 30), { fecha } = b, j = b.jugadores, cb = b.cambios || {};
    if (!EQUIPO.test(eq) || !FECHA.test(fecha || "") || !objeto(j) || !objeto(cb)) return mal();
    const jug = {}, camb = {}, ids = new Set();
    for (const [n, id] of Object.entries(j)) {
      if (!/^\d{1,2}$/.test(n) || +n < 1 || +n > EQ_MAX || !ID.test(String(id)) || ids.has(String(id))) return mal();
      ids.add(String(id));
      jug[+n] = String(id);
    }
    // el cambio de un suplente: por qué titular entra y en qué minuto (cualquiera de los dos puede quedar sin decidir)
    for (const [n, c] of Object.entries(cb)) {
      const num = (v, max) => (v == null || v === "" ? null : Number.isInteger(+v) && +v >= 1 && +v <= max ? +v : NaN);
      const por = num(c && c.por, 15), min = num(c && c.min, 90);
      if (Number.isNaN(por) || Number.isNaN(min)) return mal();
      if (jug[n] && +n > 15 && (por != null || min != null)) camb[+n] = { por, min };
    }
    const cuantos = Object.keys(jug).length;
    await db.batch([cuantos
      ? db.prepare("INSERT OR REPLACE INTO equipos (cat, fecha, rival, jugadores, cambios, por, ts) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(eq, fecha, texto(b.rival, 80) || null, JSON.stringify(jug), JSON.stringify(camb), por, ts)
      : db.prepare("DELETE FROM equipos WHERE cat = ? AND fecha = ?").bind(eq, fecha),
    db.prepare("INSERT INTO cambios (ts, cat, accion, detalle, por) VALUES (?, ?, 'equipo', ?, ?)").bind(ts, eq, JSON.stringify({ fecha, jugadores: cuantos }), por)]);
    return json({ ok: true, ts });
  }
  if (b && b.accion === "nota") {
    const t = String(b.texto == null ? "" : b.texto).split(/\r?\n/).map((x) => x.replace(/\s+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 600);
    if (!NOTA_CATS.includes(cat) || t.length < 3 || !por || !DUENO.test(b.dueno || "")) return mal();
    const fecha = FECHA.test(b.fecha || "") ? b.fecha : ts.slice(0, 10);
    await db.batch([db.prepare("INSERT INTO notas (cat, fecha, texto, por, dueno, ts) VALUES (?, ?, ?, ?, ?, ?)").bind(cat, fecha, t, por, b.dueno, ts),
      db.prepare("INSERT INTO cambios (ts, cat, accion, detalle, por) VALUES (?, ?, 'nota', ?, ?)").bind(ts, cat, JSON.stringify({ largo: t.length }), por)]);
    return json({ ok: true });
  }
  if (!CATS.includes(cat)) return json({ error: "datos" }, 400);
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
  } else if (b.accion === "docs") {
    // los que se marcaron y los que se desmarcaron (así dos que marcan a la vez no se pisan)
    const { doc, fecha } = b, lista = (v) => (Array.isArray(v) ? [...new Set(v.map(String))] : null), sumar = lista(b.sumar), sacar = lista(b.sacar);
    if (!DOCS.includes(doc) || !FECHA.test(fecha || "") || !sumar || !sacar || sumar.length + sacar.length > 400 || [...sumar, ...sacar].some((id) => !ID.test(id))) return mal();
    const anio = DOCS_ANUAL.includes(doc) ? fecha.slice(0, 4) : "siempre";
    ops = [...sacar.map((id) => db.prepare("DELETE FROM docs WHERE id = ? AND doc = ? AND anio = ?").bind(id, doc, anio)),
      ...sumar.map((id) => db.prepare("INSERT OR IGNORE INTO docs (id, doc, anio, cat, fecha, por, ts) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, doc, anio, cat, fecha, por, ts)),
      anotar({ doc, anio, sumar: sumar.length, sacar: sacar.length })];
  } else if (b.accion === "test") {
    // un test de un día: reemplaza lo que había (sin valores, se borra esa toma)
    const { fecha, test } = b, v = b.valores;
    if (!FECHA.test(fecha || "") || !TESTS.includes(test) || !objeto(v) || Object.keys(v).length > 300) return mal();
    const filas = Object.entries(v).map(([id, x]) => [id, Number(x)]);
    if (filas.some(([id, x]) => !ID.test(id) || !Number.isFinite(x) || x <= 0 || x > 1000)) return mal();
    ops = [db.prepare("DELETE FROM tests WHERE cat = ? AND fecha = ? AND test = ?").bind(cat, fecha, test),
      ...filas.map(([id, x]) => db.prepare("INSERT INTO tests (cat, fecha, test, id, valor, por, ts) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(cat, fecha, test, id, x, por, ts)),
      anotar({ fecha, test, chicos: filas.length })];
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
