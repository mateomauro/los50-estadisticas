/* "Revisar datos": le muestra al club las preguntas sobre datos dudosos y guarda sus respuestas (Cloudflare KV, gratis).
   Las preguntas las arma revision.py en cada actualización y quedan adentro de esta función al publicar (no son un archivo público).
   Las respuestas las baja "python revision.py respuestas" y se aplican en la actualización siguiente.
   GET    /api/revision          -> { preguntas, respuestas }
   POST   /api/revision          { id, respuesta, quien? } -> guarda
   DELETE /api/revision?id=...   -> borra la respuesta (para cambiarla)
   Todo pide la clave en el encabezado "x-clave" (secreto CLAVE_REVISION de Cloudflare). */
import preguntas from "../../revision/preguntas.json";

const POR_ID = new Map(preguntas.map((p) => [p.id, p]));
const PREFIJO = "resp:";

const json = (datos, status = 200) => new Response(JSON.stringify(datos), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

// compara la clave sin dar pistas por el tiempo que tarda
async function igual(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

async function respuestas(kv) {
  const out = {};
  let cursor;
  do {
    const r = await kv.list({ prefix: PREFIJO, cursor });
    for (const k of r.keys) {
      const id = k.name.slice(PREFIJO.length);
      if (POR_ID.has(id) && k.metadata) out[id] = k.metadata;
    }
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}

export async function onRequest({ request, env }) {
  const clave = request.headers.get("x-clave") || "";
  if (!env.CLAVE_REVISION || !clave || !(await igual(clave, env.CLAVE_REVISION))) return json({ error: "clave" }, 401);

  if (request.method === "GET") return json({ preguntas, respuestas: await respuestas(env.REVISION) });

  if (request.method === "POST") {
    let b;
    try { b = await request.json(); } catch (e) { return json({ error: "datos" }, 400); }
    const p = POR_ID.get(b && b.id);
    if (!p || !p.opciones.some((o) => o[0] === b.respuesta)) return json({ error: "datos" }, 400);
    let quien = null;
    if (b.respuesta === "otro") {
      quien = String(b.quien || "");
      if (!(p.jugadores || []).some((j) => j[0] === quien)) return json({ error: "datos" }, 400);
    }
    const meta = { respuesta: b.respuesta, quien, fecha: new Date().toISOString() };
    await env.REVISION.put(PREFIJO + p.id, "1", { metadata: meta });
    return json({ ok: true, respuesta: meta });
  }

  if (request.method === "DELETE") {
    const id = new URL(request.url).searchParams.get("id");
    if (!POR_ID.has(id)) return json({ error: "datos" }, 400);
    await env.REVISION.delete(PREFIJO + id);
    return json({ ok: true });
  }

  return json({ error: "método" }, 405);
}
