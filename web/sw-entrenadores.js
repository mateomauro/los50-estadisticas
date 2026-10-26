/* Entrenadores sin señal: guarda una copia de la página (html, js, css, los datos cifrados, las letras y las imágenes) para que
   se abra aunque en la cancha no haya señal. Siempre prueba primero la red, así llega lo nuevo; si no hay red, o tarda más de
   4 segundos y ya hay copia, usa la copia. La asistencia (/api) y los videos no pasan por acá: la asistencia la guarda la página
   en el celular (localStorage) y la manda cuando vuelve la señal. */
const CACHE = "los50-entrenadores-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/") || u.pathname.startsWith("/videos/")) return;
  const navegar = r.mode === "navigate";
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // la página se guarda sin lo que va después del "?" (la pantalla), así cualquier pantalla abre con la misma copia
    const clave = navegar ? `${u.origin}${u.pathname}` : r;
    const copia = cache.match(clave);
    const red = fetch(r).then((resp) => { if (resp.ok && resp.type === "basic") cache.put(clave, resp.clone()); return resp; });
    const espera = new Promise((ok) => setTimeout(ok, 4000));
    try {
      return await Promise.race([red, espera.then(() => copia.then((c) => c || red))]);
    } catch (err) {
      const c = await copia;
      if (c) return c;
      throw err;
    }
  })());
});
