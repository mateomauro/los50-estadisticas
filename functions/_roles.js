/* Quién es quién en la sección Entrenadores (lo usan functions/videos y functions/api/asistencia).
   Cada rol tiene su clave, guardada como secreto de Cloudflare: CLAVE_COORDINADOR, CLAVE_ENTRENADOR, CLAVE_PF y CLAVE_COMISION.
   La página manda la "ficha" de la clave que se escribió (SHA-256 de la clave + ":los50-videos") y acá se busca de qué rol es.
   Los dirigentes (comision) ven partidos y estadísticas del equipo: no usan ni la asistencia ni los videos. */
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const ficha = async (clave) => hex(await crypto.subtle.digest("SHA-256", enc.encode(`${clave}:los50-videos`)));
export const VARIABLES = { coordinador: "CLAVE_COORDINADOR", entrenador: "CLAVE_ENTRENADOR", pf: "CLAVE_PF", comision: "CLAVE_COMISION" };

// compara sin dar pistas por el tiempo que tarda
function igual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** el rol de esa ficha ("coordinador", "entrenador", "pf" o "comision"), o null si no es de ninguno (o falta configurar) */
export async function rolDe(f, env) {
  if (!/^[0-9a-f]{64}$/.test(f || "")) return null;
  let rol = null;
  for (const [r, v] of Object.entries(VARIABLES)) {
    if (env[v] && igual(f, await ficha(env[v]))) rol = r; // se recorren todas: tarda lo mismo sea cual sea
  }
  return rol;
}
/** ¿hay al menos una clave configurada? */
export const configurado = (env) => Object.values(VARIABLES).some((v) => env[v]);
