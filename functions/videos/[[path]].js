/* Videos de la sección Entrenadores (ejercicios y partidos). Están en Cloudflare R2 (bucket los50-videos, binding VIDEOS),
   cortados en pedacitos de 4 segundos en dos calidades por videos_entrenadores.py.
   Solo se entregan a quien abrió la sección con la clave: la página guarda la cookie "los50v" (SHA-256 de la clave + ":los50-videos")
   y acá se compara con el secreto CLAVE_ENTRENADORES de Cloudflare (la misma clave que usa GitHub para cifrar los datos).
   GET /videos/<id>/master.m3u8 · /videos/<id>/<calidad>/index.m3u8 · /videos/<id>/<calidad>/s0000.ts */
const TIPOS = { m3u8: "application/vnd.apple.mpegurl", ts: "video/mp2t" };
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const ficha = async (clave) => hex(await crypto.subtle.digest("SHA-256", enc.encode(`${clave}:los50-videos`)));
const no = (texto, status) => new Response(texto, { status, headers: { "cache-control": "no-store" } });

// compara sin dar pistas por el tiempo que tarda
function igual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function onRequestGet({ request, env, params }) {
  if (!env.VIDEOS || !env.CLAVE_ENTRENADORES) return no("Los videos todavía no están configurados", 503);
  const cookie = (request.headers.get("cookie") || "").match(/(?:^|;\s*)los50v=([0-9a-f]{64})/);
  if (!cookie || !igual(cookie[1], await ficha(env.CLAVE_ENTRENADORES))) return no("Sin permiso: entrá a la sección con la clave", 403);

  const clave = (params.path || []).join("/");
  if (!/^[a-z0-9-]+\/(?:[01]\/)?[a-z0-9]+\.(?:m3u8|ts)$/.test(clave)) return no("No existe", 404);
  const obj = await env.VIDEOS.get(clave, { range: request.headers });
  if (!obj) return no("No existe", 404);

  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("content-type", TIPOS[clave.split(".").pop()]);
  h.set("etag", obj.httpEtag);
  // los pedacitos no cambian nunca: el celular los guarda una semana. Las listas, un rato.
  h.set("cache-control", clave.endsWith(".ts") ? "private, max-age=604800, immutable" : "private, max-age=300");
  h.set("accept-ranges", "bytes");
  if (request.headers.has("range") && obj.range) {
    const { offset = 0, length = obj.size - offset } = obj.range;
    h.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    return new Response(obj.body, { status: 206, headers: h });
  }
  return new Response(obj.body, { headers: h });
}
