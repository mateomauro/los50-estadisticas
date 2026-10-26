/* Los 50 · Entrenadores — los datos vienen cifrados en window.ENTRENADORES (exportar_entrenadores.py).
   Se abren con la clave (PBKDF2 + AES-GCM, WebCrypto). Pantallas: elegir categoría, la categoría (5 preguntas), Todo el club, Consejos
   y la guía del club (qué aprende cada categoría, cantos y zonas, scrum), que sale del material de Coordinación. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const aB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const SOBRE = window.ENTRENADORES;
  let LLAVE_ACTUAL = null; // la llave abierta, para las fotos (que van cifradas aparte)
  const LLAVE = "los50-ent-llave";
  const FICHA = "los50-ent-ficha"; // para los videos: Cloudflare la pide para entregar cada pedacito (functions/videos)

  // ---------- abrir con la clave ----------
  async function derivar(clave) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: deB64(SOBRE.sal), iterations: SOBRE.vueltas, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
  }
  async function descifrar(llave) {
    const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(SOBRE.iv) }, llave, deB64(SOBRE.datos));
    const txt = await new Response(new Blob([plano]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    return JSON.parse(txt);
  }
  const guardada = () => { try { return localStorage.getItem(LLAVE) || sessionStorage.getItem(LLAVE); } catch (e) { return null; } };
  const hexDe = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const fichaDe = async (clave) => hexDe(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${clave}:los50-videos`)));
  /** la ficha va en una cookie que solo se manda a /videos (así la pide el reproductor del teléfono también) */
  function ponerFicha(ficha, siempre) {
    if (ficha) document.cookie = `los50v=${ficha}; Path=/videos; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}${siempre ? "; Max-Age=31536000" : ""}`;
  }
  function guardar(raw, siempre, ficha) {
    try { const s = siempre ? localStorage : sessionStorage; s.setItem(LLAVE, raw); s.setItem(FICHA, ficha); } catch (e) { /* sin almacenamiento: pide la clave cada vez */ }
    ponerFicha(ficha, siempre);
  }
  function olvidar() {
    try { [localStorage, sessionStorage].forEach((s) => { s.removeItem(LLAVE); s.removeItem(FICHA); }); } catch (e) { /* nada */ }
    document.cookie = "los50v=; Path=/videos; Max-Age=0";
  }

  async function intentarGuardada() {
    const raw = guardada();
    if (!raw || !SOBRE) return false;
    try {
      const llave = await crypto.subtle.importKey("raw", deB64(raw), "AES-GCM", true, ["decrypt"]);
      const datos = await descifrar(llave);
      LLAVE_ACTUAL = llave;
      try { ponerFicha(localStorage.getItem(FICHA) || sessionStorage.getItem(FICHA), !!localStorage.getItem(LLAVE)); } catch (e) { /* nada */ }
      iniciar(datos);
      return true;
    } catch (e) { olvidar(); return false; } // los datos se actualizaron con otra clave: se pide de nuevo
  }

  $("#ver-clave").addEventListener("click", (e) => {
    const b = e.currentTarget, ver = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", ver); $("#clave").type = ver ? "text" : "password";
    b.setAttribute("aria-label", ver ? "Ocultar la clave" : "Mostrar la clave");
  });
  $("#form-clave").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#error-clave"), btn = $("#entrar");
    err.hidden = true; btn.disabled = true; btn.textContent = "Abriendo…";
    try {
      if (!SOBRE) throw new Error("sin datos");
      const llave = await derivar($("#clave").value.trim());
      const datos = await descifrar(llave);
      LLAVE_ACTUAL = llave;
      guardar(aB64(await crypto.subtle.exportKey("raw", llave)), $("#recordar").checked, await fichaDe($("#clave").value.trim()));
      iniciar(datos);
    } catch (e2) {
      err.textContent = SOBRE ? "La clave no es correcta. Probá de nuevo." : "No se encontraron los datos de esta sección.";
      err.hidden = false; $("#clave").select();
    } finally { btn.disabled = false; btn.textContent = "Entrar"; }
  });
  $("#salir").addEventListener("click", () => { olvidar(); location.replace(location.pathname); }); // vuelve a la clave de esta misma web


  // ---------- la sección ----------
  let D, S;
  const obj = (t) => t.f.map((f) => Object.fromEntries(t.c.map((c, i) => [c, f[i]])));
  const fmt = (v, tipo) => {
    if (v == null) return "–";
    if (tipo === "%") return `${Math.round(v)}%`;
    if (tipo === "d") return (+v).toFixed(Number.isInteger(+v) ? 0 : 1).replace(".", ",");
    return String(v);
  };
  const fecha = (iso) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a.slice(2)}`; };
  const slug = (c) => c.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const PS = ["Primera", "Intermedia", "Pre-Intermedia", "M23"];
  const prom = (vals) => { const v = vals.filter((x) => typeof x === "number"); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  // íconos de Lucide (lucide.dev, licencia ISC: web/vendor/lucide-LICENSE.txt), todos con el mismo trazo
  const IC = {
    atras: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    adelante: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
    bien: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
    medir: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/></svg>',
    gente: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    idea: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/></svg>',
    libro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>',
    canto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
    escudo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
    cono: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.3 6.2a4.55 4.55 0 0 0 5.4 0M7.9 10.7c.9.8 2.4 1.3 4.1 1.3s3.2-.5 4.1-1.3M13.9 3.5a1.93 1.93 0 0 0-3.8-.1l-3 10c-.1.2-.1.4-.1.6 0 1.7 2.2 3 5 3s5-1.3 5-3c0-.2 0-.4-.1-.5ZM7.5 12.2l-4.7 2.7c-.5.3-.8.7-.8 1.1s.3.8.8 1.1l7.6 4.5c.9.5 2.1.5 3 0l7.6-4.5c.7-.3 1-.7 1-1.1s-.3-.8-.8-1.1l-4.7-2.8"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3l14 9-14 9z"/></svg>',
    lista: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></svg>',
    cruz: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    mas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    tilde: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    calendario: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>',
    gota: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>',
    compartir: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>',
    camiseta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>',
    buscar: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    barras: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v16a2 2 0 0 0 2 2h16M18 17V9M13 17V5M8 17v-3"/></svg>',
    sube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 7-7 7 7M12 19V5"/></svg>',
    baja: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
    nota: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M7 8h10M7 12h6"/></svg>',
    trofeo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  };

  function iniciar(datos) {
    const t = (k) => obj(datos[k]);
    D = {
      cats: datos.categorias, act: datos.actualizado,
      res: t("resumen"), torneos: t("torneos"), rivales: t("rivales"), ret: t("retencion"),
      camino: t("camino"), era: t("edad_relativa"), fis: t("fisico"), partidos: t("partidos"), jug: t("jugadores"), noSig: t("no_siguieron"),
      diag: datos.diag_web, expertos: datos.expertos, medir: datos.a_medir, fuentes: datos.fuentes, glosario: datos.glosario,
      guia: datos.guia || null, cam: datos.camisetas || {}, pase: datos.pase || null, alertas: datos.alertas || null, tries: datos.tries || null, prox: datos.proximos || [], fichados: datos.fichados || null,
    };
    const anios = D.res.map((r) => r["Año"]);
    D.desde = Math.min(...anios); D.hasta = Math.max(...anios);
    $("#sub").textContent = `Planillas oficiales UAR · ${D.desde}–${D.hasta}`;
    $("#actualizado").textContent = D.act;
    $("#candado").hidden = true;
    $("#app").hidden = false;
    S = { ver: "inicio", cat: null, temp: null, gcat: null, tab: null, q: "", ordenJ: "pj", verJ: false, verP: false, verN: false, verR: false, rol: null, para: null, ej: null, puesto: null, practica: null, pgrupo: null, qp: "", qe: "", abiertos: new Set(),
      acat: null, afecha: null, aform: null, marcas: null, base: null, aviso: null, estadoLista: null, recien: new Set(), area: null, pcat: null, mcat: null, alcat: null, pedad: null, ncat: null, eqcat: null, eqfecha: null, eqn: null, eqmas: 0, eqfoco: null, tcat: null, ttest: null, tfecha: null, tver: null, tdia: null };
    // al abrir la sección (un link, la dirección escrita o que el navegador completó) arranca en el inicio;
    // al recargar o al volver con "atrás" sigue donde estaba (por ejemplo, en medio de una lista)
    const nav = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
    if (nav && nav.type === "navigate" && location.search) history.replaceState(null, "", location.pathname);
    leerURL();
    render();
    addEventListener("popstate", () => {
      if (ayudaAbierta()) { cerrarAyuda(false); return; } // el "atrás" del celular cierra la ayuda y deja la pantalla como estaba
      if (saltarPop) { saltarPop = false; return; }        // la ayuda se cerró con "Entendido": no hay que redibujar
      leerURL(); render();
    });
  }

  // ---------- URL: ?cat=m17&temp=2026 · ?ver=club · ?ver=consejos · ?ver=guia · ?guia=m10 · ?ver=cantos&tab=zonas · ?ver=scrum · ?ver=puestos · ?puesto=10 ----------
  function leerURL() {
    const p = new URLSearchParams(location.search);
    const c = D.cats.find((x) => slug(x) === p.get("cat"));
    const g = D.guia ? gCats().find((x) => slug(x) === p.get("guia")) : null;
    const hayPuestos = !!(D.guia && D.guia.puestos), hayPr = !!(D.guia && D.guia.practicas && D.guia.practicas.length);
    const vistas = ["club", "consejos", "guiaclub", "alertas"].concat(D.pase ? ["pase"] : [], D.guia ? ["guia", "cantos", "scrum"] : [], D.guia && D.guia.ejercicios ? ["ejercicios"] : [], hayPuestos ? ["puestos"] : [], hayPr ? ["practicas"] : []);
    const ej = D.guia && D.guia.ejercicios ? D.guia.ejercicios.find((x) => x.id === p.get("ejercicio")) : null;
    const pu = hayPuestos && puestoDe(+p.get("puesto")) ? +p.get("puesto") : null;
    const pr = hayPr ? D.guia.practicas.find((x) => x.id === p.get("practica")) : null;
    S.cat = c || null;
    S.gcat = g || null;
    S.ej = ej ? ej.id : null;
    S.puesto = pu;
    S.practica = pr ? pr.id : null;
    S.pgrupo = hayPr ? P_GRUPOS.find((x) => slug(x) === p.get("grupo")) || null : null;
    const ac = D.fichados ? ASIS_CATS.find((x) => slug(x) === p.get("asistencia")) : null;
    S.acat = ac || null;
    S.afecha = ac && fechaOk(p.get("fecha") || "") ? p.get("fecha") : null;
    S.aform = null; S.marcas = null;
    if (D.fichados) vistas.push("asistencia", "notas");
    // las áreas: ?ver=area&area=asistencia · ?plan=m15 (Planificación de M15) · ?partidos=m15 (o todas)
    S.area = AREAS[p.get("area")] ? p.get("area") : null;
    S.pcat = D.guia ? ASIS_CATS.find((x) => slug(x) === p.get("plan")) || null : null;
    S.mcat = ["Todas", "Plantel superior", ...D.cats.filter((x) => !PS.includes(x))].find((x) => slug(x) === p.get("partidos")) || null;
    if (S.area) vistas.push("area");
    // los tests físicos: ?tests=m16 (y &test=m10&fecha=2026-10-26 mientras se carga uno)
    S.tcat = D.fichados ? testCats().find((x) => slug(x) === p.get("tests")) || null : null;
    S.ttest = S.tcat && testDe(p.get("test")) ? p.get("test") : null;
    S.tfecha = S.ttest && fechaOk(p.get("fecha") || "") && p.get("fecha") <= hoyISO() ? p.get("fecha") : null;
    // el equipo de un partido: ?equipo=m16&fecha=2026-11-01 (y &n=9 mientras se elige quién juega de 9)
    const eqc = D.fichados && p.get("equipo") ? [...new Set([...D.prox.map((x) => x.cat), ...D.cats])].find((x) => slug(x) === p.get("equipo") && eqAsis(x)) : null;
    S.eqcat = eqc || null;
    S.eqfecha = eqc && fechaOk(p.get("fecha") || "") ? p.get("fecha") : null;
    S.eqn = S.eqfecha && +p.get("n") >= 1 && +p.get("n") <= EQ_MAX ? +p.get("n") : null;
    S.ver = c ? "cat" : g ? "guia" : ej ? "ejercicio" : pu ? "puesto" : pr ? "practica" : ac ? (S.afecha ? "lista" : p.get("chicos") ? "chicos" : "asis")
      : S.tcat ? (S.tfecha ? "toma" : "tests") : S.eqfecha ? "equipo" : S.pcat ? "plan" : S.mcat ? "partidos" : vistas.includes(p.get("ver")) ? p.get("ver") : "inicio";
    S.temp = /^\d{4}$/.test(p.get("temp") || "") ? +p.get("temp") : null;
    S.tab = p.get("tab");
    S.rol = p.get("rol");
    S.para = p.get("para");
  }
  function url() {
    const p = new URLSearchParams();
    if (S.ver === "cat") { p.set("cat", slug(S.cat)); if (S.temp) p.set("temp", S.temp); }
    else if (S.ver === "guia" && S.gcat) p.set("guia", slug(S.gcat));
    else if (S.ver === "ejercicio") p.set("ejercicio", S.ej);
    else if (S.ver === "puesto") p.set("puesto", S.puesto);
    else if (S.ver === "practica") p.set("practica", S.practica);
    else if (S.ver === "practicas") { p.set("ver", S.ver); if (S.pgrupo) p.set("grupo", slug(S.pgrupo)); }
    else if (S.ver === "area") { p.set("ver", "area"); p.set("area", S.area); }
    else if (S.ver === "plan") p.set("plan", slug(S.pcat));
    else if (S.ver === "partidos") p.set("partidos", slug(S.mcat));
    else if (S.ver === "tests" || S.ver === "toma") { p.set("tests", slug(S.tcat)); if (S.ver === "toma") { p.set("test", S.ttest); p.set("fecha", S.tfecha); } }
    else if (S.ver === "equipo") { p.set("equipo", slug(S.eqcat)); p.set("fecha", S.eqfecha); if (S.eqn) p.set("n", S.eqn); }
    else if (["asis", "lista", "chicos"].includes(S.ver)) { p.set("asistencia", slug(S.acat)); if (S.ver === "lista") p.set("fecha", S.afecha); if (S.ver === "chicos") p.set("chicos", "1"); }
    else if (S.ver === "ejercicios") { p.set("ver", S.ver); if (S.tab) p.set("tab", S.tab); if (S.rol) p.set("rol", S.rol); if (S.para) p.set("para", S.para); }
    else if (S.ver !== "inicio") { p.set("ver", S.ver); if (S.tab) p.set("tab", S.tab); }
    const qs = p.toString();
    return location.pathname + (qs ? "?" + qs : "");
  }
  function irA(cambios, empujar = true) {
    // cada paso guarda cuántos pasos hay adentro de la sección y de qué pantalla se vino: así "Volver" sabe adónde va y lo dice
    const desde = empujar ? tituloDe() : null;
    Object.assign(S, cambios);
    history[empujar ? "pushState" : "replaceState"](empujar ? { n: ((history.state && history.state.n) || 0) + 1, desde } : history.state, "", url());
    render();
    if (empujar) { scrollTo({ top: 0 }); $("#vista").focus({ preventScroll: true }); }
  }
  /** cambia de pantalla sin sumar un paso: para Anterior / Siguiente (así "Volver" no las recorre una por una) */
  function irSinPaso(cambios) {
    irA(cambios, false);
    scrollTo({ top: 0 }); $("#vista").focus({ preventScroll: true });
  }
  /** el nombre corto de la pantalla en la que se está: es lo que dice el botón "Volver" de la pantalla siguiente */
  function tituloDe() {
    const ej = S.ver === "ejercicio" && D.guia.ejercicios.find((x) => x.id === S.ej), pu = S.ver === "puesto" && puestoDe(S.puesto);
    return ({ inicio: "Inicio", cat: S.cat, club: "Todo el club", consejos: "Consejos", guia: S.gcat || "Qué aprende cada categoría",
      cantos: "Cantos y zonas", scrum: "Scrum seguro", ejercicios: "Ejercicios", ejercicio: ej && ej.nombre, puestos: "Los puestos", puesto: pu && pu.nombre,
      practicas: "Prácticas", practica: "Práctica", pase: "De M19 a plantel superior", alertas: "Para mirar", area: AREAS[S.area], plan: `Planificación ${S.pcat}`, partidos: S.mcat === "Todas" ? "Partidos" : `Partidos de ${S.mcat}`, guiaclub: "Guía del club", notas: "Notas", equipo: S.eqn ? `El ${S.eqn}` : `Equipo de ${S.eqcat}`, tests: `Tests de ${S.tcat}`, toma: S.ttest && testDe(S.ttest).nom,
      asistencia: "Todas las categorías", asis: S.acat, lista: `Lista de ${S.acat}`, chicos: `Los chicos de ${S.acat}` })[S.ver] || "Volver";
  }

  // ---------- datos de una categoría ----------
  const filasCat = (cat) => D.res.filter((r) => r["Categoría"] === cat).sort((a, b) => a["Año"] - b["Año"]);
  const ultimaTemp = (cat) => filasCat(cat).at(-1)["Año"];
  const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  // ---------- gráficos (Chart.js, servido desde web/vendor) ----------
  // Cada gráfico se arma como un <canvas> dentro del texto de la pantalla y se dibuja después de pintarla (dibujarGraficos).
  // Al tocar una barra se ve el número exacto. Mismos colores que el resto de la sección (styles.css / entrenadores.css).
  const COL = { azul: "#1b5fd1", claro: "#c3d0ea", rojo: "#d9483b", texto: "#0b0d12", suave: "#545d6e", linea: "#c9d1de", banda: "#e9edf4", sup: "#ffffff" };
  const LETRA = '"Barlow", system-ui, sans-serif', LETRA_C = '"Barlow Condensed", "Arial Narrow", sans-serif';
  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GRAF = { pend: [], vivos: [] };

  // los números arriba de cada barra, con un borde del color del fondo para que se lean aunque les pase la línea de lo normal
  const pValores = { id: "valores", afterDatasetsDraw(ch, _a, o) {
    const { ctx } = ch;
    ch.data.datasets.forEach((ds, k) => ch.getDatasetMeta(k).data.forEach((barra, i) => {
      const v = ds.data[i];
      if (v == null) return;
      const sel = ch.data.labels[i] === o.sel, txt = o.texto(v, barra.width);
      ctx.save();
      ctx.font = `${sel ? 700 : 600} ${o.chico ? (sel ? 12 : 11) : (sel ? 13 : 12)}px ${LETRA}`;
      ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.lineJoin = "round";
      ctx.lineWidth = 4; ctx.strokeStyle = sel && o.banda ? COL.banda : COL.sup;
      ctx.strokeText(txt, barra.x, barra.y - 5);
      ctx.fillStyle = sel ? COL.texto : COL.suave;
      ctx.fillText(txt, barra.x, barra.y - 5);
      ctx.restore();
    }));
  } };
  // la línea punteada de lo normal (el promedio de todos los años), con su número escrito en la punta
  const pNormal = { id: "normal",
    beforeDatasetsDraw(ch, _a, o) {
      const { ctx, chartArea: a, scales: { y } } = ch;
      (o.lineas || []).forEach(({ v, color }) => {
        const yy = y.getPixelForValue(v);
        ctx.save(); ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = color; ctx.globalAlpha = .6;
        ctx.beginPath(); ctx.moveTo(a.left, yy); ctx.lineTo(a.right + (o.etiqueta ? 6 : 0), yy); ctx.stroke(); ctx.restore();
      });
    },
    afterDraw(ch, _a, o) {
      if (!o.etiqueta || !(o.lineas || []).length) return;
      const { ctx, chartArea: a, scales: { y } } = ch, yy = y.getPixelForValue(o.lineas[0].v);
      ctx.save(); ctx.textAlign = "left";
      ctx.font = `600 11px ${LETRA}`; ctx.fillStyle = COL.suave; ctx.fillText("Lo normal", a.right + 12, yy - 4);
      ctx.font = `700 15px ${LETRA_C}`; ctx.fillStyle = COL.texto; ctx.fillText(o.etiqueta, a.right + 12, yy + 13);
      ctx.restore();
    } };
  // en el de puntos, el año elegido va con un fondo gris detrás (se pinta antes que todo, así no tapa el año de abajo)
  const pBanda = { id: "banda", beforeDraw(ch, _a, o) {
    const i = ch.data.labels.indexOf(o.sel);
    if (i < 0) return;
    const { ctx, chartArea: a, scales: { x } } = ch, w = x.width / ch.data.labels.length, cx = x.getPixelForValue(i);
    ctx.save(); ctx.fillStyle = COL.banda; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - w / 2 + 2, a.top - 16, w - 4, a.bottom - a.top + 38, 8);
    else ctx.rect(cx - w / 2 + 2, a.top - 16, w - 4, a.bottom - a.top + 38);
    ctx.fill(); ctx.restore();
  } };

  /** opciones comunes: sin ejes ni grilla (los números van arriba de las barras), los años abajo y el elegido en negrita */
  function opciones({ sel, derecha = 0, tooltip }) {
    const elegido = (c) => c.tick && c.tick.label === sel;
    return {
      responsive: true, maintainAspectRatio: false,
      animation: quieto ? false : { duration: 500, easing: "easeOutQuart" },
      layout: { padding: { top: 24, right: derecha } },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { grid: { display: false }, border: { color: COL.linea },
          // los años siempre derechos (en el celular, un poco más chicos para que entren)
          ticks: { maxRotation: 0, autoSkip: false, color: (c) => (elegido(c) ? COL.texto : COL.suave),
            font: (c) => ({ family: LETRA, size: c.chart.width < 420 ? 11 : 12, weight: elegido(c) ? 700 : 500 }) } },
        y: { display: false, beginAtZero: true, grace: "6%" },
      },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: COL.texto, padding: 10, cornerRadius: 8, boxPadding: 5, usePointStyle: true,
          titleFont: { family: LETRA, size: 13, weight: "700" }, bodyFont: { family: LETRA, size: 13 }, footerFont: { family: LETRA, size: 12, weight: "500" },
          footerColor: "#c3cad6", ...tooltip },
      },
    };
  }
  const lienzo = (id, txt, doble) => `<div class="graf-caja${doble ? " graf-caja--doble" : ""}"><canvas id="${id}" role="img" aria-label="${esc(txt)}">${esc(txt)}</canvas></div>`;

  /** barras por año; la del año elegido en azul y una línea punteada con lo normal (el promedio de todos los años) */
  function barras(datos, { sel, tipo = "d", promedio = null } = {}) {
    const id = `graf-${GRAF.pend.length}`, s = String(sel), labels = datos.map((d) => String(d.x));
    const o = opciones({ sel: s, derecha: promedio != null ? 70 : 0, tooltip: { displayColors: false, callbacks: {
      label: (c) => fmt(c.raw, tipo), footer: () => (promedio != null ? `Lo normal: ${fmt(promedio, tipo)}` : "") } } });
    o.plugins.valores = { sel: s, texto: (v) => fmt(v, tipo) };
    o.plugins.normal = { lineas: promedio != null ? [{ v: promedio, color: COL.texto }] : [], etiqueta: promedio != null ? fmt(promedio, tipo) : "" };
    GRAF.pend.push({ id, config: {
      type: "bar",
      data: { labels, datasets: [{ data: datos.map((d) => d.y), backgroundColor: labels.map((l) => (l === s ? COL.azul : COL.claro)),
        hoverBackgroundColor: labels.map((l) => (l === s ? "#164fb0" : "#a9bce2")), borderRadius: 4, maxBarThickness: 30, categoryPercentage: .72, barPercentage: .82 }] },
      options: o,
      plugins: [pNormal, pValores],
    } });
    return lienzo(id, datos.map((d) => `${d.x}: ${fmt(d.y, tipo)}`).join(", ") + (promedio != null ? `. Lo normal: ${fmt(promedio, tipo)}` : ""));
  }

  /** puntos por partido: dos barras por año (azul = los que hace, roja = los que le hacen), siempre los mismos dos colores.
      El año elegido va con un fondo gris detrás; las líneas punteadas son lo normal de cada una. */
  function barrasDobles(datos, { sel } = {}) {
    const id = `graf-${GRAF.pend.length}`, s = String(sel), labels = datos.map((d) => String(d.x));
    const pa = prom(datos.map((d) => d.a)), pb = prom(datos.map((d) => d.b));
    const barra = (k, color, nombre, tocada) => ({ label: nombre, data: datos.map((d) => d[k]), backgroundColor: color, hoverBackgroundColor: tocada, borderRadius: 3, maxBarThickness: 20,
      categoryPercentage: .72, barPercentage: .9, pointStyle: "rectRounded" });
    const o = opciones({ sel: s, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.raw, "d")}`,
      footer: () => `Lo normal: hace ${fmt(pa, "d")} y le hacen ${fmt(pb, "d")}` } } });
    // con barras finitas (celular) los números van redondeados, para que entren
    o.plugins.valores = { sel: s, chico: true, banda: true, texto: (v, w) => (w >= 16 ? fmt(v, "d") : String(Math.round(v))) };
    o.plugins.normal = { lineas: [{ v: pa, color: COL.azul }, { v: pb, color: COL.rojo }] };
    o.plugins.banda = { sel: s };
    GRAF.pend.push({ id, config: {
      type: "bar",
      data: { labels, datasets: [barra("a", COL.azul, "Hizo", "#164fb0"), barra("b", COL.rojo, "Le hicieron", "#c23a2e")] },
      options: o,
      plugins: [pBanda, pNormal, pValores],
    } });
    return lienzo(id, datos.map((d) => `${d.x}: hace ${fmt(d.a, "d")}, le hacen ${fmt(d.b, "d")}`).join("; ") + `. Lo normal: hace ${fmt(pa, "d")}, le hacen ${fmt(pb, "d")}`, true);
  }

  /** después de pintar la pantalla: se borran los gráficos de antes y se dibujan los nuevos */
  function dibujarGraficos() {
    GRAF.vivos.forEach((g) => g.destroy());
    GRAF.vivos = !window.Chart ? [] : GRAF.pend.filter((g) => document.getElementById(g.id)).map((g) => new Chart(document.getElementById(g.id), g.config));
    GRAF.pend = [];
  }

  // ---------- pantallas ----------
  let listaAbierta = null; // la lista que estaba en pantalla: si se deja con cambios sin guardar, se avisa
  function render() {
    if (listaAbierta && S.ver !== "lista") {
      const { cat, fecha } = listaAbierta, d = ASIS.cats[cat], s = (d && sesiones(d, fecha, fecha)[0]) || { fecha, lista: null };
      if (sinGuardar(cat, s)) avisar("ojo", `La lista del ${diaMes(fecha)} quedó sin guardar`);
    }
    listaAbierta = S.ver === "lista" ? { cat: S.acat, fecha: S.afecha } : null;
    // todo el ancho en la compu (y el pie se alinea con eso); la tabla de estadísticas no, que queda muy estirada
    $("#app").classList.toggle("app--ancha", S.ver === "inicio" || S.ver === "partidos" || S.ver === "plan" || S.ver === "pase" || (S.ver === "equipo" && !S.eqn) || S.ver === "tests" || (S.ver === "area" && S.area !== "estadisticas"));
    GRAF.pend = [];
    soltarVideos();
    $("#vista").dataset.pantalla = S.ver; // ojo: no "data-ver", que es el de los botones "Ver todos"
    ({ inicio: vInicio, cat: vCategoria, club: vClub, consejos: vConsejos, guia: vGuia, cantos: vCantos, scrum: vScrum, ejercicios: vEjercicios, ejercicio: vEjercicio, puestos: vPuestos, puesto: vPuesto, practicas: vPracticas, practica: vPractica,
      asistencia: vAsistencia, asis: vAsis, lista: vLista, chicos: vChicos, area: vArea, plan: vPlan, partidos: vPartidos, guiaclub: vGuiaClub, pase: vPase, alertas: vAlertas, notas: vNotas, equipo: vEquipo, tests: vTests, toma: vToma })[S.ver]();
    dibujarGraficos();
    ponerFotos();
  }
  /** sección desplegable: arranca cerrada y recuerda si la abriste (al ordenar o "ver todos" no se cierra).
      Con "dato" se muestra a la derecha del título el número principal de adentro ("18 partidos", "78% volvió"). */
  const desple = (id, titulo, contenido, dato = "") =>
    `<details class="mas mas--grande" data-sec="${id}"${S.abiertos.has(id) ? " open" : ""}><summary><span class="mas__tit">${titulo}</span>${dato ? `<span class="mas__dato num">${dato}</span>` : ""}</summary><div class="mas__in">${contenido}</div></details>`;
  /** al lado de la respuesta: si fue mejor o peor que lo normal (el promedio de todos los años), con lo normal entre paréntesis */
  const tendencia = (dif, umbral, normal) => dif > umbral ? `<p class="tend tend--mejor">${IC.sube}Mejor que lo normal (${normal})</p>`
    : dif < -umbral ? `<p class="tend tend--peor">${IC.baja}Peor que lo normal (${normal})</p>` : `<p class="tend">Como lo normal (${normal})</p>`;
  /** ir a una de las pantallas principales: sin categoría, filtros ni formularios abiertos */
  const LIMPIO = { ncat: null, alcat: null, cat: null, temp: null, gcat: null, tab: null, rol: null, para: null, qe: "", pgrupo: null, qp: "", aform: null, aviso: null };
  /** "Volver": lleva a la pantalla de la que se vino y dice cuál es ("‹ M13"), igual que el botón atrás del celular.
      Si no hay de dónde (se recargó sin historial), va a la de arriba ("txt"; "a" es la pantalla o los cambios) sin sumar un paso */
  const hayAtras = () => !!(history.state && history.state.n > 0);
  let SUBIR = null;
  const volver = (txt = "Inicio", a = "inicio") => {
    if (hayAtras()) return `<button type="button" class="volver" data-atras>${IC.atras}<span class="volver__txt">${esc(history.state.desde || "Volver")}</span></button>`;
    SUBIR = typeof a === "string" ? { ver: a, ...LIMPIO } : a;
    return `<button type="button" class="volver" data-subir>${IC.atras}<span class="volver__txt">${txt}</span></button>`;
  };
  /** después de guardar o borrar, vuelve a la pantalla de antes (si no hay, a "alt") */
  const volverAtras = (alt) => (hayAtras() ? history.back() : irSinPaso(alt));

  // ---------- ayuda: el "?" al lado de un título abre la explicación (en el celular sale desde abajo) ----------
  // así la pantalla queda limpia: el número y la frase que lo dice en palabras quedan a la vista, el "cómo se lee" va acá
  const AYUDA = {
    categorias: () => ["Las categorías", ["Tocá una categoría para ver cómo le fue, sus jugadores y sus tries.",
      `Los números son de ${D.hasta}: los partidos oficiales que están cargados en la página de la UAR.`]],
    equipo: () => ["El equipo del partido", ["Tocá cada número para elegir quién juega. Del 1 al 15 son los titulares; del 16 en adelante, los suplentes. Para cada suplente podés poner por quién entra y en qué minuto.",
      "Para cada puesto aparecen primero los que jugaron de ese número esta temporada (Primera, Intermedia y M19, de las planillas de la UAR) o lo tienen en su ficha de la UAR. Al lado, cuánto vienen a entrenar.",
      "Si un chico está sancionado o tiene tarjetas, se avisa en amarillo o en rojo.",
      "Lo que elegís queda en este celular hasta que tocás “Guardar”. Ahí lo ven los otros entrenadores. Con “Mandar por WhatsApp” se lo pasás al grupo."]],
    tests: () => ["Tests físicos", ["Se toman dos veces al año, en marzo y en septiembre, como en las academias de la UAR: 10 metros, 30 metros (forwards), 40 metros (backs), salto horizontal y Bronco. El salto vertical, si hay una app para medirlo.",
      "Para cargar, tocá un test y anotá el resultado de cada chico. Lo que cargás queda en el celular hasta que tocás “Guardar”: no se pierde si en la cancha no hay señal."]],
    testsColor: () => ["Los colores", ["Cada chico se compara con los de su categoría ese mismo día: el tercio mejor en verde, el del medio en amarillo y el de abajo en rojo. Con menos de 6 chicos no hay color.",
      "Las referencias de la UAR son de M18 en adelante (están en Guía del club → Los puestos → Tests físicos). Para los más chicos sirve más compararlos entre ellos y con ellos mismos.",
      "Si un chico ya tenía una toma anterior de ese test, abajo de su nombre dice si mejoró o empeoró."]],
    toma: () => ["Cómo cargar", ["10, 30 y 40 metros: en segundos, por ejemplo 1,85. Salto horizontal: en metros (2,10) o en centímetros (210). Salto vertical: en centímetros.",
      "Bronco: en minutos y segundos, por ejemplo 5,20 o 5:20 (5 minutos y 20 segundos).",
      "Al que no hizo el test, dejalo vacío. Si un número no tiene sentido para ese test, se marca en rojo y no se guarda hasta corregirlo."]],
    notas: () => ["Notas", ["Para dejarles un mensaje corto a los otros entrenadores: lo que salió bien, lo que habría que cambiar, algo que viste en un entrenamiento o en un partido.",
      "Las notas las puede leer cualquiera que entre con la clave. Quedan guardadas para siempre.", "Podés borrar solo las que escribiste vos, desde este mismo celular."]],
    asistencia: () => ["Asistencia", ["Para tomar lista en cada entrenamiento y ver cuánto viene cada chico.",
      "El porcentaje es sobre los entrenamientos de este año en los que se tomó lista. Los suspendidos no cuentan.",
      "La lista de chicos arranca con los fichados en la UAR para este año. Cada entrenador puede sumar o sacar chicos."]],
    asisCat: () => ["Cómo se lee", ["Al lado de cada chico: a cuántos entrenamientos vino, de los que se tomó lista.",
      "Verde: viene el 80% o más. Amarillo: entre 60% y 80%. Rojo: menos del 60%. Los que menos vienen están arriba.",
      "Los entrenamientos suspendidos no cuentan, y un día que no se tomó lista tampoco. Un chico sumado a mano cuenta desde el día que se sumó.",
      "El porcentaje de cada chico aparece desde la tercera lista: con menos, los números engañan.",
      "Cuenta solo este año: cada temporada arranca de cero (las listas de antes quedan guardadas).",
      "Lo que se carga acá (listas, días, suspendidos) lo ven todos los entrenadores."]],
    nunca: () => ["Nunca vinieron", ["Son chicos de la lista que no vinieron a ninguno de los entrenamientos con lista. Muchas veces son fichados de la UAR que ya no juegan.",
      "Si ya no vienen, tocá “Ya no viene”. Si siguen en el equipo, tocá “Sigue”.",
      "Hasta que se conteste, no cuentan en el porcentaje de la categoría."]],
    perfilCuerpo: () => ["Cómo es el cuerpo", ["Es el perfil corporal de los Pumas para cada puesto, del área de nutrición de la UAR.",
      "Masa ósea y masa muscular, en kilos. El índice músculo-óseo es la masa muscular dividida por la ósea.",
      "Son medidas de jugadores adultos: en juveniles sirven para ver hacia dónde va el cuerpo de cada puesto, no como meta."]],
    perfilFisico: () => ["Tests físicos", ["Son los valores del Plan de Alto Rendimiento de la UAR para cada puesto y edad (M18, M20 y Senior).",
      "Mínimo: el piso. Objetivo bajo y objetivo alto: los dos niveles que se buscan. En fuerza, el objetivo es un múltiplo del peso del jugador (1,1 × peso = 1,1 veces lo que pesa).",
      "Salen de los tests de más de 2.000 jugadores entre 2013 y 2020: el rojo es por debajo del 27% de ese grupo y el verde, por encima del 73%.",
      "En el Bronco, menos tiempo es mejor. Son valores de 18 años en adelante: para M13 a M16 no hay."]],
    pase: () => ["De M19 a plantel superior", ["Cuenta los chicos que jugaron al menos un partido oficial en M19 en cada año y mira qué hicieron la temporada siguiente.",
      "“Jugaron en plantel superior”: jugaron en Primera, Intermedia o Pre-Intermedia. “No volvieron a jugar”: no aparecen en ninguna planilla del club ese año (pueden seguir entrenando o haberse ido).",
      "“Llegaron al club”: su primer fichaje en Los 50 fue ese año o el anterior. En 2020 no hubo partidos: de 2019 se pasa a 2021. La temporada en curso no terminó, así que el número todavía puede subir.",
      "Los datos empiezan en 2017 y salen de las planillas oficiales de la UAR."]],
    alertas: () => ["Para mirar", ["Sale de los listados y las planillas de la UAR, que se actualizan lunes, martes y miércoles.",
      "Importante: sanción vigente, conmoción sin alta y roja de los últimos 21 días. Para tener en cuenta: 2 o más amarillas en los últimos 60 días.",
      "Lo que ya se habilitó o ya pasó, no aparece."]],
    dibujo: () => ["El dibujo", ["Se dibuja como en las fichas de World Rugby: la cancha vista desde arriba. El ataque va hacia arriba; en line y maul, el lateral es el borde de la izquierda.",
      "Azul: ataque. Rojo: defensa. Flecha llena: carrera. Flecha punteada: pase (y si es curva, patada).",
      "Si son varios cuadros, es el ejercicio paso a paso: 1, 2, 3.",
      "“Para revisar”: es un primer dibujo hecho a partir de lo que está escrito; falta que Coordinación lo confirme."]],
    proximos: () => ["Próximos partidos", ["Los partidos que la UAR ya cargó para las próximas fechas, con el día y la hora.",
      "Se actualiza solo los lunes, martes y miércoles. Si un partido no aparece, es porque la UAR todavía no lo cargó.",
      "La UAR no dice en qué cancha se juega."]],
    ultimos: () => ["Últimos partidos cargados", [`Datos al ${D.act}.`,
      "Si un partido del fin de semana no aparece, es porque todavía no cargaron su planilla en la página de la UAR."]],
    comparar: () => ["Cómo se leen estos gráficos", ["Cada barra es un año. La que está resaltada es el año que estás mirando: se cambia con las flechas de arriba.",
      "La línea punteada es lo normal: el promedio de todos los años. Si la barra pasa la línea, ese año estuvo por encima de lo normal.",
      "En el de puntos, la barra azul son los que hizo y la roja los que le hicieron, cada una con su línea de lo normal.",
      "Arriba de cada gráfico dice si fue mejor o peor que lo normal."]],
    siguenCat: () => ["¿Los chicos siguen?", ["De los chicos que estuvieron en la planilla de la categoría cada año (jugando o en el banco), qué parte volvió a aparecer en una planilla del club al año siguiente, en cualquier categoría.",
      "El año que está en curso todavía no se puede saber: hay que esperar a que arranque la temporada que viene.",
      "Un chico que sigue entrenando pero no entró en ninguna planilla, o que se fue a otro club, cuenta como que no siguió."]],
    tries: () => ["Los tries: quién y cuándo", ["Sale de las planillas de la UAR: la camiseta del que hizo cada try y el minuto.",
      "La planilla no dice de qué jugada vino el try (line, scrum, contraataque), así que eso no se puede saber.",
      "Si el que lo hizo entró del banco, cuenta en el puesto donde más veces fue titular. El try penal no tiene jugador.",
      "En juveniles la camiseta no siempre es el puesto: ahí solo se ve cuándo fueron los tries."]],
    pase: () => ["¿Llegan a Primera?", ["De los M19 de cada año, qué parte apareció en planillas de Primera, Intermedia o Pre-Intermedia en los 2 años siguientes."]],
    siguen: () => {
      const u = Math.max(...D.ret.map((r) => r["Año"]));
      return ["¿Los chicos siguen jugando?", ["De los chicos que estuvieron en la planilla de cada categoría ese año (jugando o en el banco), qué parte volvió a aparecer en una planilla del club al año siguiente.",
        "Verde es lo mejor, amarillo es regular y rojo quiere decir que se están yendo muchos chicos.", "Una raya (–) quiere decir que no hay datos de esa categoría ese año.",
        ...(u < D.hasta ? [`${D.hasta} todavía no aparece: recién se va a saber quién volvió cuando arranque la temporada que viene.`] : [])]];
    },
    camino: () => ["Camino a Primera", ["Cuántos jugadores debutaron en Primera cada año, la edad promedio de los titulares y cuántos partidos tenían antes, en promedio.",
      "Si debutan pocos y los titulares tienen cada vez más partidos, el equipo envejece y no se renueva."]],
    nacieron: () => ["¿En qué parte del año nacieron?", ["En muchos clubes juegan más los nacidos en enero, febrero y marzo, porque a esa edad son más grandes, y se pierden los de fin de año.",
      "Si las 4 partes son parecidas, el club no está dejando afuera a los más chicos."]],
    peso: () => ["Peso promedio", ["Lo que dice la ficha de la UAR de los que jugaron este año.", "Es un solo dato por jugador y sin fecha: sirve para arrancar a trabajar con la nutricionista."]],
    consejos: () => ["Consejos", ["Lo que muestran los datos del club y qué hacer con eso.",
      "Para trabajar: lo que conviene mejorar. Está bien: lo que hay que mantener. Falta medir: lo que todavía no se puede saber con las planillas de la UAR."]],
    guiaCats: () => ["Qué aprende cada categoría", ["Lo que el club busca enseñar en cada categoría, de M6 a M19: la frase guía, qué priorizar en ataque y en defensa, y qué evitar.",
      "Lo definió la Coordinación de Rugby del club (Magali Fazzi) en 2026."]],
    guiaCat: () => ["De dónde sale esto", ["Es lo que la Coordinación de Rugby del club (Magali Fazzi) definió para esta categoría en 2026.",
      S.gcat && !esInf(S.gcat) ? "Arriba, en pocas palabras, lo que tiene que lograr la categoría y sus palabras clave; abajo, el detalle de cada parte del juego."
        : "Las frases de arriba son las frases guía: lo que el chico tiene que poder decir y hacer en esta categoría."]],
    cantos: () => ["Cantos y zonas", ["Los cantos del club con lo que quiere decir cada uno, las zonas y los canales de la cancha, y el modelo de juego.",
      "Sale del material de la Coordinación de Rugby del club (Magali Fazzi), 2026."]],
    scrum: () => ["Scrum seguro", ["Qué se puede hacer en cada edad, cómo se enseña, el set up del club, la entrada y el empuje.",
      "En Sesiones: las sesiones de scrum que planificó la Coordinación para M13 a M19, en el orden en que se hicieron. Muestran cómo se va sumando de a poco, hasta llegar al set up.",
      "Sale del protocolo y del plan de scrum de la Coordinación de Rugby del club (Magali Fazzi), 2026."]],
    ejercicios: () => ["Ejercicios", ["Los ejercicios de line y maul de la Coordinación de Rugby (Magali Fazzi) y los juegos que más usan los entrenadores de infantiles en sus planificaciones.",
      "Los de line están en orden, de lo más fácil a lo más difícil para cada rol.", "Tocá uno para ver cómo se hace, en qué fijarse y qué material hace falta."]],
    plan: () => ["Planificación", ["Esta semana: los días que entrena la categoría (los que se cargaron en Asistencia; si no hay, los que suele entrenar según sus prácticas), con la práctica de cada día. El de hoy, en azul.",
      "“Sin cargar”: ese día todavía no tiene práctica en la planilla.",
      "La temporada: todas las prácticas del año, mes por mes. Salen de las planillas de cada entrenador en el Drive de Coordinación."]],
    practicas: () => ["Prácticas", ["Las prácticas que armaron los entrenadores del club en 2026, día por día, de las planillas de Coordinación.",
      "Sirven para repetir una que salió bien o para ver cómo se arma una práctica en el club: entrada en calor, destrezas, juego integrado y cierre.",
      "Están como las escribieron los entrenadores. Adentro de cada una, con el botón de abajo se manda por WhatsApp."]],
    puestos: () => ["Los puestos", ["Lo que el club espera de cada puesto, del 1 al 15: qué tiene que saber hacer, lo mental y lo ideal en un partido.",
      "Sale del perfil del jugador de la Coordinación de Rugby del club (Magali Fazzi)."]],
    partidoPuesto: () => ["En un partido", ["Lo ideal para este puesto en un partido entero: por ejemplo, cuántos tackles tiene que hacer.",
      "Sirve para mirar los videos de los partidos y ver si el jugador llega.",
      "Rucks en ataque: las veces que entra a un ruck cuando el equipo tiene la pelota. Contactos: las veces que lleva la pelota al choque. Quiebres: las veces que pasa la línea de defensa. Recuperadas: las pelotas que le gana al rival."]],
    medir: () => ["Qué empezar a medir", ["Son datos que las planillas de la UAR no tienen y que sirven para saber si los chicos mejoran.",
      "Tocá cada uno para ver qué medir, cada cuánto, quién y cómo."]],
  };
  const ayudaBtn = (k) => `<button type="button" class="ayuda-btn" data-ayuda="${k}" aria-haspopup="dialog" aria-label="Qué quiere decir: ${esc(AYUDA[k]()[0])}">?</button>`;
  /** el "?" va pegado a la última palabra del título (si no, en el celular puede quedar solo en un renglón) */
  const conAyuda = (texto, k) => (k ? texto.replace(/(\S+)$/, (w) => `<span class="junto">${w}${ayudaBtn(k)}</span>`) : texto);
  const cabTit = (texto, k) => `<h2 class="cab__cat">${conAyuda(texto, k)}</h2>`;
  const tit = (texto, k) => `<div class="tit"><h2 class="h2">${conAyuda(texto, k)}</h2></div>`;
  let ayudaDesde = null, saltarPop = false;
  const ayudaAbierta = () => { const c = $("#ayuda"); return !!c && !c.hidden; };
  function abrirAyuda(k, boton) {
    const [t, parrafos] = AYUDA[k]();
    let caja = $("#ayuda");
    if (!caja) {
      document.body.insertAdjacentHTML("beforeend", `<div class="ayuda" id="ayuda" hidden><div class="ayuda__fondo" data-cerrar-ayuda></div>
        <div class="ayuda__caja" role="dialog" aria-modal="true" aria-labelledby="ayuda-t"><h2 class="ayuda__t" id="ayuda-t"></h2><div class="ayuda__txt"></div>
        <button type="button" class="ayuda__ok" data-cerrar-ayuda>Entendido</button></div></div>`);
      caja = $("#ayuda");
    }
    $("#ayuda-t").textContent = t;
    $(".ayuda__txt", caja).innerHTML = parrafos.map((p) => `<p>${esc(p)}</p>`).join("");
    caja.hidden = false;
    ayudaDesde = boton;
    history.pushState({ ayuda: true }, "", location.href); // así el "atrás" del celular la cierra
    $(".ayuda__ok", caja).focus();
  }
  function cerrarAyuda(desdeBoton = true) {
    if (!ayudaAbierta()) return;
    $("#ayuda").hidden = true;
    if (ayudaDesde && ayudaDesde.isConnected) ayudaDesde.focus();
    if (desdeBoton && history.state && history.state.ayuda) { saltarPop = true; history.back(); }
  }
  /** una opción de menú: ícono, nombre, una línea que dice qué hay y la flecha (mismo estilo que las filas de categoría).
      opcionDe lleva el atributo entero (para ir a una práctica, a la guía de una categoría…); opcion va a una pantalla */
  const opcionDe = (attr, ic, nom, que) => `<li><button type="button" class="menu__it" ${attr}><span class="menu__ic">${ic}</span>
    <span class="menu__txt"><b>${nom}</b><small>${que}</small></span>${IC.adelante}</button></li>`;
  const opcion = (ir, ic, nom, que) => opcionDe(`data-ir="${ir}"`, ic, nom, que);

  // las categorías como una tabla de posiciones: una fila por categoría, con ganados, empatados y perdidos
  // en los mismos colores que adentro de la categoría. Toda la fila se toca.
  function filaCatHTML(cat, conUltimo) {
    const r = filasCat(cat).at(-1), u = conUltimo && D.partidos.find((x) => x.cat === cat);
    const n = (k, v) => `<span class="fila-cat__n fila-cat__n--${k}${v ? "" : " fila-cat__n--cero"} num">${v}</span>`;
    return `<li><button type="button" class="fila-cat" data-ir-cat="${esc(cat)}"
      aria-label="${esc(cat)}, ${r["Año"]}: ${pl(r.PJ, "partido", "partidos")}. Ganó ${r.G}, empató ${r.E}, perdió ${r.P}">
      <span class="fila-cat__nom">${esc(cat)}<small>${u ? `Último: ${({ G: "ganó", E: "empató", P: "perdió" })[u.res]} ${u.pf}–${u.pc}`
        : `${r["Año"] !== D.hasta ? `${r["Año"]} · ` : ""}${pl(r.PJ, "partido", "partidos")}`}</small></span>
      ${n("g", r.G)}${n("e", r.E)}${n("p", r.P)}${IC.adelante}</button></li>`;
  }
  const tablaCats = (titulo, cats, conUltimo) => `<div class="grupo-cat">
      <div class="grupo-cat__cab"><h3 class="grupo-cat__tit">${titulo}</h3><span aria-hidden="true">Ganó</span><span aria-hidden="true">Empató</span><span aria-hidden="true">Perdió</span></div>
      <ul class="filas-cat">${cats.map((c) => filaCatHTML(c, conUltimo)).join("")}</ul></div>`;

  // ---------- el inicio: primero qué querés hacer, después la categoría ----------
  // Seis áreas, una por cosa que hace un entrenador. Asistencia, Planificación y Partidos piden la categoría
  // (con botones grandes; queda marcada la última que elegiste); Estadísticas muestra la tabla de categorías;
  // Ejercicios y la Guía del club son iguales para todos.
  const AREAS = { asistencia: "Asistencia", planificacion: "Planificación", partidos: "Partidos", estadisticas: "Estadísticas", tests: "Tests físicos" };
  const AREA_IR = (a) => ({ ver: "area", area: a, ...LIMPIO });
  /** la última categoría que se eligió en cada área (queda en el celular) */
  const claveArea = (a) => `los50-ent-cat:${a}`;
  /** las categorías de la UAR (partidos y números) de una categoría: el plantel superior son varias; los infantiles, ninguna */
  const catsUAR = (c) => (c === "Plantel superior" ? PS : [c]).filter((x) => D.cats.includes(x));
  /** una tarjeta grande: ícono, nombre y una línea */
  const botonArea = (attr, ic, nom, que, cls = "") => `<button type="button" class="area${cls}" ${attr}><span class="area__ic">${ic}</span>
    <span class="area__txt"><b>${nom}</b><small>${que}</small></span></button>`;
  const tarjeta = (...a) => `<li>${botonArea(...a)}</li>`;

  function vInicio() {
    // si la última categoría en la que tomaste lista entrena hoy, la tarjeta de Asistencia lo dice
    const ult = D.fichados && enCel.get(ULTIMA), d = ult && ASIS_CATS.includes(ult) ? ASIS.cats[ult] : null;
    if (ult && ASIS_CATS.includes(ult) && !d && !ASIS.error[ult]) cargarAsis(ult);
    const s = d && sesiones(d, hoyISO(), hoyISO())[0], hoy = s && s.estado !== "cancelado";
    const g = D.guia;
    $("#vista").innerHTML = `
      <div class="cab">${cabTit("¿Qué querés hacer?")}</div>${avisoHTML()}
      ${alertasInicio()}
      <section class="sec sec--pegada"><ul class="areas areas--6">
        ${!D.fichados ? "" : !hoy ? tarjeta('data-area="asistencia"', IC.lista, "Asistencia", "Tomar lista")
          : `<li class="area-li">${botonArea(`data-ir-hoy="${esc(ult)}|${hoyISO()}"`, IC.lista, "Asistencia", `Hoy entrena ${esc(ult)}${s.hora ? ` · ${esc(s.hora)}` : ""}`, " area--hoy")}
            <button type="button" class="link area__otra" data-area="asistencia">Otra categoría</button></li>`}
        ${g ? tarjeta('data-area="planificacion"', IC.calendario, "Planificación", "Prácticas y objetivos") : ""}
        ${g && g.ejercicios ? tarjeta('data-ir="ejercicios"', IC.cono, "Ejercicios", "Line, maul y juegos") : ""}
        ${tarjeta('data-area="partidos"', IC.trofeo, "Partidos", "Próximos y resultados")}
        ${tarjeta('data-area="estadisticas"', IC.barras, "Estadísticas", "Números y jugadores")}
        ${g ? tarjeta('data-ir="guiaclub"', IC.libro, "Guía del club", "Puestos, scrum y cantos") : ""}
        ${D.fichados ? tarjeta('data-area="tests"', IC.reloj, "Tests físicos", "10 m, salto y Bronco") : ""}
        ${D.fichados ? tarjeta('data-ir="notas"', IC.nota, "Notas", "Lo que viste en los entrenamientos") : ""}
      </ul></section>`;
  }

  // ---------- tests de campo (functions/api/asistencia.js, tabla "tests" de D1) ----------
  // Dos veces al año (marzo y septiembre), como en las academias de la UAR: 10 m, 30 m (forwards), 40 m (backs), salto horizontal,
  // Bronco y, si hay con qué, salto vertical. Se carga por estación: un test y todos los chicos (la lista de Asistencia).
  // El color compara con los chicos de la misma categoría ese día (las referencias de la UAR son desde M18): el tercio mejor en verde,
  // el del medio en amarillo y el de abajo en rojo. Lo cargado queda en el celular hasta guardarlo (en la cancha suele no haber señal).
  const TESTS = [
    { k: "m10", nom: "10 metros", u: "s", menos: true, min: 1, max: 4, ej: "1,85" },
    { k: "m30", nom: "30 metros", u: "s", menos: true, min: 3, max: 8, ej: "4,60", quien: "Forwards" },
    { k: "m40", nom: "40 metros", u: "s", menos: true, min: 4, max: 10, ej: "5,90", quien: "Backs" },
    { k: "salto", nom: "Salto horizontal", u: "m", menos: false, min: 0.8, max: 3.5, ej: "2,10" },
    { k: "bronco", nom: "Bronco", u: "min", menos: true, min: 180, max: 720, ej: "5,20" },
    { k: "cmj", nom: "Salto vertical", u: "cm", menos: false, min: 10, max: 90, ej: "38", quien: "Con una app" },
  ];
  const testCats = () => ASIS_CATS.slice(0, 7); // del plantel superior a M13
  const testDe = (k) => TESTS.find((t) => t.k === k);
  const TST = { cats: {}, error: {}, cargando: new Set(), guardando: false };
  const UNIDAD = { s: "segundos", m: "metros", cm: "centímetros", min: "minutos y segundos" };
  /** lo que se escribe: "1,85" o "1.85"; el Bronco "5,20" o "5:20" (minutos y segundos) o "320" (segundos); el salto en metros o en centímetros.
      Si no es un número que tenga sentido para ese test, da NaN */
  function leerValor(t, txt) {
    const s = String(txt).trim().replace(",", ".");
    if (!s) return null;
    let v = +s;
    if (t.k === "bronco") {
      const [m, sg = "0"] = s.split(/[.:]/);
      if (+m < 15) v = /^\d+$/.test(m) && /^\d{1,2}$/.test(sg) && +sg < 60 ? +m * 60 + +sg : NaN;
    }
    if (t.k === "salto" && v > 50) v /= 100; // lo escribió en centímetros
    return Number.isFinite(v) && v >= t.min && v <= t.max ? Math.round(v * 100) / 100 : NaN;
  }
  const verValor = (t, v) => (t.k === "bronco" ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`
    : t.k === "cmj" ? String(Math.round(v * 10) / 10).replace(".", ",") : v.toFixed(2).replace(".", ","));
  function cargarTests(cat) {
    if (TST.cargando.has(cat)) return;
    TST.cargando.add(cat); delete TST.error[cat];
    apiD1(null, `tests=1&cat=${encodeURIComponent(cat)}`).then((d) => { TST.cats[cat] = d.tests; })
      .catch((e) => { TST.error[cat] = errNotas(e, "No se pudieron cargar los tests", "ver los tests"); })
      .finally(() => { TST.cargando.delete(cat); if (["tests", "toma"].includes(S.ver) && S.tcat === cat) render(); });
  }
  /** las tomas de un test: [fecha, Map(id → valor)], de la más nueva a la más vieja */
  function tomasDe(cat, k) {
    const out = new Map();
    (TST.cats[cat] || []).filter((r) => r.test === k).forEach((r) => { if (!out.has(r.fecha)) out.set(r.fecha, new Map()); out.get(r.fecha).set(r.id, r.valor); });
    return [...out].sort((a, b) => b[0].localeCompare(a[0]));
  }
  const testPlantel = (cat) => { const d = ASIS.cats[cat]; return d ? chicosDe(cat, d).activos : (D.fichados[cat] || []).map(([id, nombre]) => ({ id, nombre })).sort(porNombre); };
  const testQuien = (id, pl) => pl.find((c) => c.id === id) || eqTodos().get(id) || { id, nombre: "Ya no está en la lista" };
  const tomaClave = (cat, f, k) => `los50-test:${cat}|${f}|${k}`;
  const tomaBorr = (cat, f, k) => { try { return JSON.parse(enCel.get(tomaClave(cat, f, k)) || "null"); } catch (e) { return null; } };
  /** mientras se cargan los tests o la lista de chicos: "Cargando…" o el error */
  const esperaTests = (cat) => {
    if (!TST.cats[cat] && !TST.error[cat]) cargarTests(cat);
    if (!ASIS.cats[cat] && !ASIS.error[cat]) cargarAsis(cat);
    if (TST.error[cat]) return `<div class="hoy hoy--error"><p class="hoy__canc">${TST.error[cat]}</p><button type="button" class="btn-sec" data-reintentar-tests>Probar de nuevo</button></div>`;
    return !TST.cats[cat] || (!ASIS.cats[cat] && !ASIS.error[cat]) ? `<p class="cargando">Cargando…</p>` : "";
  };

  // una categoría: un botón por test para cargarlo y los resultados (de mejor a peor, con el color y si mejoró)
  function vTests() {
    const cat = S.tcat, espera = esperaTests(cat);
    const cab = `<div class="cab">${volver(AREAS.tests, AREA_IR("tests"))}${cabTit(`Tests físicos de ${esc(cat)}`, "tests")}</div>`;
    if (espera) { $("#vista").innerHTML = `${cab}<section class="sec sec--pegada">${espera}</section>`; return; }
    const pl = testPlantel(cat), hechos = TESTS.filter((t) => tomasDe(cat, t.k).length);
    if (!hechos.some((t) => t.k === S.tver)) S.tver = hechos[0] ? hechos[0].k : null;
    const boton = (t) => { const u = tomasDe(cat, t.k)[0];
      return `<li><button type="button" class="test-t" data-tomar="${t.k}"><b>${t.nom}</b><small>${[t.quien, u ? `Último: ${corta(u[0])}` : "Sin tomar"].filter(Boolean).join(" · ")}</small></button></li>`; };
    let res = `<p class="vacio-g">Todavía no hay tests cargados</p>`;
    const t = testDe(S.tver);
    if (t) {
      const tomas = tomasDe(cat, t.k);
      if (!tomas.some(([f]) => f === S.tdia)) S.tdia = tomas[0][0];
      const i = tomas.findIndex(([f]) => f === S.tdia), [fecha, vals] = tomas[i], antes = tomas[i + 1];
      const orden = [...vals].sort((a, b) => (t.menos ? a[1] - b[1] : b[1] - a[1])), n = orden.length;
      const color = (r) => (n < 6 ? "gris" : r < n / 3 ? "verde" : r < (2 * n) / 3 ? "ambar" : "rojo");
      const fila = ([id, v], r) => {
        const prev = antes && antes[1].get(id), dif = prev != null ? Math.round((v - prev) * 100) / 100 : 0, mejor = t.menos ? dif < 0 : dif > 0;
        return `<li class="test-f"><span class="test-f__pos num">${r + 1}</span><span class="test-f__nom"><span>${nombreHTML(testQuien(id, pl).nombre)}</span>${dif
          ? `<small class="${mejor ? "test-f__mejor" : "test-f__peor"}">${mejor ? "Mejoró" : "Empeoró"} ${verValor(t, Math.abs(dif))} ${t.u} desde el ${corta(antes[0])}</small>` : ""}</span>
          <span class="porc porc--${color(r)} num">${verValor(t, v)}</span></li>`;
      };
      res = `<div class="chips-g" role="group" aria-label="Test">${hechos.map((x) => `<button type="button" data-tver="${x.k}" aria-pressed="${x.k === t.k}">${x.nom}</button>`).join("")}</div>
        ${tomas.length > 1 ? `<div class="chips-g chips-g--asis" role="group" aria-label="Día">${tomas.map(([f]) => `<button type="button" data-tdia="${f}" aria-pressed="${f === fecha}">${corta(f)}</button>`).join("")}</div>` : ""}
        <p class="titular test-tit">${t.nom} del ${esc(cuandoP({ fecha }))}: <b>${n}</b> ${n === 1 ? "chico" : "chicos"}, en ${UNIDAD[t.u]}</p>
        <ul class="test-r">${orden.map(fila).join("")}</ul>
        <button type="button" class="link" data-tomar="${t.k}|${fecha}">Corregir esta toma</button>`;
    }
    $("#vista").innerHTML = `${cab}
      <div class="dos">
        <section class="sec sec--pegada">${tit("Cargar un test")}<ul class="tests-t">${TESTS.map(boton).join("")}</ul></section>
        <section class="sec sec--pegada">${tit("Resultados", "testsColor")}${res}</section>
      </div>${avisoHTML()}`;
  }
  // cargar un test: un renglón por chico con su resultado
  function vToma() {
    const cat = S.tcat, t = testDe(S.ttest), f = S.tfecha, espera = esperaTests(cat);
    const cab = `<div class="cab">${volver(`Tests de ${esc(cat)}`, { ver: "tests", ttest: null, tfecha: null })}${cabTit(`${t.nom} · ${esc(cat)}`, "toma")}</div>`;
    if (espera) { $("#vista").innerHTML = `${cab}<section class="sec sec--pegada">${espera}</section>`; return; }
    const pl = testPlantel(cat), b = tomaBorr(cat, f, t.k), g = (tomasDe(cat, t.k).find(([x]) => x === f) || [])[1];
    // los de la lista y los que tienen algo guardado ese día aunque ya no estén
    const lista = [...pl, ...(g ? [...g.keys()].filter((id) => !pl.some((c) => c.id === id)).map((id) => testQuien(id, pl)) : [])];
    const val = (id) => (b ? b[id] || "" : g && g.has(id) ? verValor(t, g.get(id)) : "");
    const n = lista.filter((c) => val(c.id)).length;
    $("#vista").innerHTML = `${cab}
      <section class="sec sec--pegada">
        <div class="asis-form__fila toma-cab"><label class="asis-form__campo">Día<input id="toma-fecha" class="asis-input" type="date" value="${f}" max="${hoyISO()}"></label>
          <p class="asis-nota">En ${UNIDAD[t.u]}, por ejemplo ${t.ej}. Al que no lo hizo, dejalo vacío.</p></div>
        <ul class="toma-l">${lista.map((c) => { const v = val(c.id), mal = v && Number.isNaN(leerValor(t, v));
          return `<li class="toma-f"><label for="tv-${esc(c.id)}">${nombreHTML(c.nombre)}</label><input id="tv-${esc(c.id)}" class="asis-input toma-in${mal ? " toma-in--mal" : ""}" data-tv="${esc(c.id)}" inputmode="decimal" autocomplete="off" enterkeyhint="next" placeholder="${t.ej}" value="${esc(v)}"></li>`; }).join("")}</ul>
      </section>
      <div class="lista-pie" role="status"><span><b class="num" id="toma-n">${n}</b> de ${lista.length} cargados<small class="lista-pie__ojo" id="toma-sin"${b ? "" : " hidden"}>Sin guardar</small></span>
        <button type="button" class="btn btn--ok btn--grande" data-toma-guardar>${IC.tilde}Guardar</button></div>
      ${avisoHTML()}`;
  }
  async function guardarToma() {
    if (TST.guardando) return;
    const cat = S.tcat, t = testDe(S.ttest), f = S.tfecha, valores = {}, malos = [];
    document.querySelectorAll("[data-tv]").forEach((i) => { const txt = i.value.trim(), v = leerValor(t, txt); if (!txt) return; if (Number.isNaN(v)) malos.push(i); else valores[i.dataset.tv] = v; });
    if (malos.length) {
      avisoSuelto(`${malos.length === 1 ? "Hay un resultado" : `Hay ${malos.length} resultados`} que no ${malos.length === 1 ? "parece" : "parecen"} de ${t.nom.toLowerCase()} (en rojo). Escribilo en ${UNIDAD[t.u]}, por ejemplo ${t.ej}.`);
      malos[0].focus();
      return;
    }
    if (!Object.keys(valores).length && !tomasDe(cat, t.k).some(([x]) => x === f)) { avisoSuelto("Anotá el resultado de al menos un chico."); return; }
    TST.guardando = true;
    avisoSuelto("Guardando…", "espera");
    try {
      await apiD1({ accion: "test", cat, fecha: f, test: t.k, valores, por: enCel.get(claveNombreNota) || "" });
      enCel.set(tomaClave(cat, f, t.k), null);
      TST.cats[cat] = (await apiD1(null, `tests=1&cat=${encodeURIComponent(cat)}`)).tests;
      const n = Object.keys(valores).length;
      avisar("ok", n ? `${t.nom}: ${n} ${n === 1 ? "chico guardado" : "chicos guardados"}` : `Se borró ${t.nom.toLowerCase()} de ese día`);
      S.tver = t.k; S.tdia = f;
      volverAtras({ ver: "tests", ttest: null, tfecha: null });
    } catch (e) { avisoSuelto(`${errNotas(e, "No se pudo guardar", "guardar los tests")} Lo cargado queda en el celular.`); }
    finally { TST.guardando = false; }
  }

  // ---------- el equipo de un partido: titulares, suplentes y cambios (functions/api/asistencia.js, tabla "equipos" de D1) ----------
  // Se arma desde Partidos, en cada próximo partido (o en uno que no está en el fixture, como un amistoso).
  // Los chicos salen de la lista de Asistencia de la categoría (el plantel superior es uno solo para Primera, Intermedia…).
  // Para cada número sugiere a los que jugaron ahí esta temporada o lo tienen en la ficha de la UAR (D.cam) y avisa si alguno
  // está sancionado o con tarjetas (lo de "Para mirar"). Lo elegido queda en el celular hasta tocar "Guardar"; guardado lo ven todos.
  const EQ = { lista: null, error: null, cargando: false, guardando: false };
  const EQ_MAX = 30; // del 16 al 23 son los 8 suplentes; en juveniles se pueden sumar más, hasta el 30
  const eqAsis = (cat) => (PS.includes(cat) ? "Plantel superior" : ASIS_CATS.includes(cat) ? cat : null);
  const eqClave = (cat, f) => `${cat}|${f}`;
  const eqBorr = {
    get: (k) => { try { return JSON.parse(enCel.get(`los50-equipo:${k}`) || "null"); } catch (e) { return null; } },
    set: (k, v) => enCel.set(`los50-equipo:${k}`, v ? JSON.stringify(v) : null),
  };
  /** los equipos que quedaron en el celular sin guardar (para que un amistoso nuevo aparezca en Partidos) */
  const eqBorradores = () => {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("los50-equipo:")) { const [cat, fecha] = k.slice(13).split("|"), b = eqBorr.get(`${cat}|${fecha}`); if (b) out.push([cat, fecha, b]); }
      }
    } catch (e) { /* sin almacenamiento */ }
    return out;
  };
  const eqGuardado = (cat, f) => (EQ.lista || []).find((e) => e.cat === cat && e.fecha === f) || null;
  const eqPartido = (cat, f) => D.prox.find((x) => x.cat === cat && x.fecha === f) || null;
  /** lo que se está armando: lo del celular (sin guardar) o, si no hay, lo guardado */
  function eqActual(cat, f) {
    const b = eqBorr.get(eqClave(cat, f)), g = eqGuardado(cat, f);
    return b ? { jugadores: {}, cambios: {}, ...b } : { jugadores: { ...(g ? g.jugadores : {}) }, cambios: { ...(g ? g.cambios : {}) }, rival: g ? g.rival : "" };
  }
  const mismoEq = (a, g) => JSON.stringify([a.jugadores, a.cambios]) === JSON.stringify([g ? g.jugadores : {}, g ? g.cambios : {}]);
  const eqSinGuardar = (cat, f) => { const b = eqBorr.get(eqClave(cat, f)); return !!b && !mismoEq(b, eqGuardado(cat, f)); };
  /** anota un cambio en el celular; si quedó igual a lo guardado, ya no hay nada sin guardar */
  function eqAnotar(e) {
    const g = eqGuardado(S.eqcat, S.eqfecha);
    Object.keys(e.cambios).forEach((n) => { if (!e.jugadores[n] || +n <= 15) delete e.cambios[n]; });
    eqBorr.set(eqClave(S.eqcat, S.eqfecha), g && mismoEq(e, g) ? null : e);
  }
  let TODOS_ID = null;
  /** todos los fichados del club por número de jugador: para el nombre y para buscar a uno de otra categoría */
  const eqTodos = () => (TODOS_ID ??= new Map(Object.entries(D.fichados).flatMap(([c, l]) => l.map(([id, nombre]) => [id, { id, nombre, cat: c }]))));
  /** los chicos de la categoría, con cuánto vienen a entrenar (mientras carga la asistencia, los fichados) */
  function eqPlantel(cat) {
    const ac = eqAsis(cat), d = ASIS.cats[ac];
    if (!d && !ASIS.error[ac]) cargarAsis(ac);
    return d ? porcentajes(d, chicosDe(ac, d).activos) : (D.fichados[ac] || []).map(([id, nombre]) => ({ id, nombre, desde: "" })).sort(porNombre);
  }
  const eqQuien = (id, pl) => pl.find((c) => c.id === id) || eqTodos().get(id) || { id, nombre: "Ya no está en la lista" };
  const eqAlertas = () => { const m = new Map(); alertasHoy().forEach((a) => { const k = claveNombre(a.j); if (!m.has(k)) m.set(k, a); }); return m; };
  const eqPuesto = (n) => (n > 15 ? "Suplente" : ((D.guia && D.guia.puestos && puestoDe(n)) || {}).nombre || "");
  const eqJuega = (id) => D.cam[id] || {};
  const eqJuegaTxt = (id) => { const c = eqJuega(id), j = c.j || []; return [j.length ? `Jugó de ${j.join(" y ")}` : "", c.f && !j.includes(c.f) ? `En la ficha: ${c.f}` : ""].filter(Boolean).join(" · "); };
  const eqHasta = (e) => Math.min(EQ_MAX, Math.max(23 + S.eqmas, ...Object.keys(e.jugadores).map(Number)));
  const errEq = (e, que) => errNotas(e, que, "guardar el equipo");

  function cargarEquipos() {
    if (EQ.cargando) return;
    EQ.cargando = true; EQ.error = null;
    apiD1(null, "equipos=1").then((d) => { EQ.lista = d.equipos; })
      .catch((e) => { EQ.error = errNotas(e, "No se pudieron cargar los equipos", "ver los equipos"); })
      .finally(() => { EQ.cargando = false; if (S.ver === "equipo" || (S.ver === "partidos" && S.aform !== "amistoso")) render(); });
  }
  /** en cada próximo partido: armar el equipo (o cuántos hay elegidos) */
  function eqBtn(x) {
    const b = eqBorr.get(eqClave(x.cat, x.fecha)), g = eqGuardado(x.cat, x.fecha), n = Object.keys((b || g || { jugadores: {} }).jugadores).length;
    return `<button type="button" class="res__eq" data-ir-equipo="${esc(x.cat)}|${x.fecha}">${IC.camiseta}<span>${n ? `Equipo: ${n} elegidos` : "Armar el equipo"}${eqSinGuardar(x.cat, x.fecha) ? `<small class="res__eq-ojo">Sin guardar</small>` : ""}</span>${IC.adelante}</button>`;
  }
  /** los equipos de partidos que no están en el fixture de la UAR (amistosos): los guardados y los que quedaron en el celular */
  function amistosos(cs) {
    const hoy = hoyISO(), vistos = new Set(), out = [];
    const sumar = (cat, fecha, rival) => {
      const k = eqClave(cat, fecha);
      if (vistos.has(k) || !cs.includes(cat) || fecha < hoy || eqPartido(cat, fecha)) return;
      vistos.add(k);
      out.push({ cat, fecha, hora: "", cond: "L", rival: rival || "Rival a definir", inst: "Amistoso", amistoso: true });
    };
    (EQ.lista || []).forEach((e) => sumar(e.cat, e.fecha, e.rival));
    eqBorradores().forEach(([cat, fecha, b]) => sumar(cat, fecha, b.rival));
    return out;
  }
  const formAmistoso = (cs) => { const ok = cs.filter(eqAsis); return `<div class="asis-form">
      ${ok.length > 1 ? `<label class="asis-form__campo">¿Qué equipo?<select id="am-cat" class="asis-input">${ok.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select></label>`
        : `<input type="hidden" id="am-cat" value="${esc(ok[0])}">`}
      <div class="asis-form__fila"><label class="asis-form__campo">Día<input id="am-fecha" class="asis-input" type="date" value="${masDias(hoyISO(), 1)}" min="${hoyISO()}" max="${masDias(hoyISO(), DIAS_ADELANTE)}"></label>
        <label class="asis-form__campo">Rival<input id="am-rival" class="asis-input" maxlength="80" autocomplete="off" placeholder="Contra quién"></label></div>
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-amistoso-ok>${IC.camiseta}Armar el equipo</button>${cerrarBtn}</div></div>`; };

  /** el suplente: por quién entra y en qué minuto */
  const eqCambioHTML = (num, e, pl) => {
    const cb = e.cambios[num] || {}, ap = (id) => esc(eqQuien(id, pl).nombre.split(",")[0]);
    return `<div class="eq-cambio">
      <label>Entra por<select class="asis-input" data-eq-por="${num}"><option value="">Sin decidir</option>${Array.from({ length: 15 }, (_, i) => i + 1).map((t) =>
        `<option value="${t}"${cb.por === t ? " selected" : ""}>${t}${e.jugadores[t] ? ` · ${ap(e.jugadores[t])}` : ""}</option>`).join("")}</select></label>
      <label>Minuto<select class="asis-input" data-eq-min="${num}"><option value="">Sin decidir</option>${Array.from({ length: 16 }, (_, i) => (i + 1) * 5).map((m) =>
        `<option value="${m}"${cb.min === m ? " selected" : ""}>${m}'</option>`).join("")}</select></label></div>`;
  };
  function vEquipo() {
    const cat = S.eqcat, f = S.eqfecha;
    if (!EQ.lista && !EQ.error) cargarEquipos();
    if (S.eqn) return vElegir();
    const e = eqActual(cat, f), g = eqGuardado(cat, f), px = eqPartido(cat, f), pl = eqPlantel(cat), al = eqAlertas();
    const rival = px ? px.rival : e.rival || (g && g.rival) || "", hasta = eqHasta(e), n = Object.keys(e.jugadores).length, sin = eqSinGuardar(cat, f);
    const fila = (num) => {
      const id = e.jugadores[num], c = id && eqQuien(id, pl), a = c && al.get(claveNombre(c.nombre));
      const sub = [esc(eqPuesto(num)), a ? `<span class="eq-al eq-al--${a.n}">${esc(a.t)}</span>` : ""].filter(Boolean).join(" · ");
      return `<li class="eq-f${id ? "" : " eq-f--vacio"}"><button type="button" class="eq-it" data-eq-n="${num}">
        <span class="eq-it__n num">${num}</span><span class="eq-it__txt">${c ? `<span class="eq-it__nom">${nombreHTML(c.nombre)}</span>` : `<span class="eq-it__vacio">Elegir</span>`}${sub ? `<small>${sub}</small>` : ""}</span>${IC.adelante}</button>
        ${num > 15 && id ? eqCambioHTML(num, e, pl) : ""}</li>`;
    };
    const cab = `<div class="cab">${volver(AREAS.partidos, AREA_IR("partidos"))}${cabTit(`Equipo de ${esc(cat)}`, "equipo")}</div>
      <p class="titular eq-partido">${rival ? `vs <b>${esc(rival)}</b> · ` : ""}${esc(mayus(cuandoP({ fecha: f })))}${px && px.hora ? ` · ${esc(px.hora)}` : ""} · ${px ? condTxt(px.cond) : "Amistoso"}</p>`;
    if (EQ.error || !EQ.lista) {
      $("#vista").innerHTML = `${cab}<section class="sec sec--pegada">${EQ.error ? `<div class="hoy hoy--error"><p class="hoy__canc">${EQ.error}</p>
        <button type="button" class="btn-sec" data-reintentar-eq>Probar de nuevo</button></div>` : `<p class="cargando">Cargando…</p>`}</section>`;
      return;
    }
    const borrar = S.aform === "borrar-eq" ? `<div class="asis-form"><span class="asis-form__l">¿Borrar el equipo de este partido?</span>
        <div class="asis-form__btns"><button type="button" class="btn btn--peligro btn--alto" data-eq-borrar>Borrarlo</button>${cerrarBtn}</div></div>`
      : `<button type="button" class="link" data-form="borrar-eq">Borrar este equipo</button>`;
    $("#vista").innerHTML = `${cab}
      ${g && !sin ? `<p class="asis-nota eq-guardado">${IC.tilde}Guardado${g.por ? ` por ${esc(g.por)}` : ""} el ${esc(diaMes(isoDe(new Date(g.ts))))} a las ${horaDe(g.ts)}</p>` : ""}
      <div class="dos">
        <section class="sec sec--pegada">${tit("Titulares")}<ul class="eq-l">${Array.from({ length: 15 }, (_, i) => fila(i + 1)).join("")}</ul></section>
        <section class="sec sec--pegada">${tit("Suplentes")}<ul class="eq-l">${Array.from({ length: hasta - 15 }, (_, i) => fila(i + 16)).join("")}</ul>
          ${hasta < EQ_MAX ? `<button type="button" class="btn-sec btn-sec--ancho asis-mas" data-eq-mas>${IC.mas}Sumar un suplente</button>` : ""}
          <div class="eq-acc">
            ${n ? `<button type="button" class="btn-sec btn-sec--ancho" data-eq-compartir>${IC.compartir}Mandar por WhatsApp</button>` : ""}
            ${sin && g ? `<button type="button" class="link" data-eq-descartar>Volver a lo que estaba guardado</button>` : ""}
            ${g || n ? borrar : ""}
          </div>
        </section>
      </div>
      <div class="lista-pie" role="status"><span><b class="num">${n}</b> de ${hasta} elegidos<small class="lista-pie__ojo" id="eq-sin"${sin ? "" : " hidden"}>Sin guardar</small></span>
        <button type="button" class="btn btn--ok btn--grande" data-eq-guardar${EQ.guardando ? " disabled" : ""}>${EQ.guardando ? `<span class="girando" aria-hidden="true"></span>Guardando…` : `${IC.tilde}Guardar`}</button></div>
      ${avisoHTML()}`;
    // al volver de elegir, queda a la vista el número que se tocó
    if (S.eqfoco) {
      const b = $(`[data-eq-n="${S.eqfoco}"]`);
      S.eqfoco = null;
      if (b) requestAnimationFrame(() => { b.scrollIntoView({ block: "center" }); b.focus({ preventScroll: true }); });
    }
  }
  /** lo que se necesita para dibujar cada chico en la lista para elegir */
  function eqCtx() {
    const e = eqActual(S.eqcat, S.eqfecha);
    return { num: S.eqn, pl: eqPlantel(S.eqcat), al: eqAlertas(), en: new Map(Object.entries(e.jugadores).map(([n, id]) => [id, +n])) };
  }
  function eqFila(c, otra, x) {
    const a = x.al.get(claveNombre(c.nombre)), ya = x.en.get(c.id);
    const det = [ya ? (ya === x.num ? "Está en este número" : `Ya está de ${ya}`) : "", eqJuegaTxt(c.id)].filter(Boolean).map(esc);
    if (a) det.push(`<span class="eq-al eq-al--${a.n}">${esc(a.t)}</span>`);
    return `<li data-q="${esc(norm(c.nombre))}"><button type="button" class="eq-it eq-it--elegir${ya === x.num ? " eq-it--este" : ""}" data-eq-id="${esc(c.id)}">
      <span class="eq-it__txt"><span class="eq-it__nom">${nombreHTML(c.nombre)}${otra ? ` <span class="chip chip--cat">${esc(otra)}</span>` : ""}</span>${det.length ? `<small>${det.join(" · ")}</small>` : ""}</span>
      ${c.pct !== undefined ? porcHTML(c.pct, c.de >= 3) : ""}</button></li>`;
  }
  // elegir quién juega en un número: primero los que juegan ahí, después el resto de la categoría; buscando, también los de otras
  function vElegir() {
    const x = eqCtx(), num = x.num, ac = eqAsis(S.eqcat), e = eqActual(S.eqcat, S.eqfecha), j = (c) => eqJuega(c.id);
    const orden = (c) => ((j(c).j || [])[0] === num ? 0 : (j(c).j || []).includes(num) ? 1 : 2);
    const sug = num > 15 ? [] : x.pl.filter((c) => orden(c) < 2 || j(c).f === num).sort((a, b) => orden(a) - orden(b) || porNombre(a, b));
    const resto = x.pl.filter((c) => !sug.includes(c)), actual = e.jugadores[num] && eqQuien(e.jugadores[num], x.pl);
    $("#vista").innerHTML = `
      <div class="cab">${volver(`Equipo de ${esc(S.eqcat)}`, { ver: "equipo", eqn: null })}${cabTit(`¿Quién juega de ${num}?`)}</div>
      <p class="titular eq-partido">${esc(eqPuesto(num))}${actual ? ` · ahora: <b>${esc(actual.nombre)}</b>` : ""}</p>
      <section class="sec sec--pegada">
        ${actual ? `<button type="button" class="btn-sec btn-sec--ancho eq-vaciar" data-eq-vaciar>Dejar vacío el ${num}</button>` : ""}
        <label class="buscar-g eq-buscar"><span class="sr">Buscar un chico</span>${IC.buscar}<input type="search" id="buscar-eq" placeholder="Buscar por apellido" autocomplete="off" enterkeyhint="search"></label>
        ${sug.length ? `<h3 class="grupo">Juegan de ${num}</h3><ul class="eq-l" data-filtro-eq>${sug.map((c) => eqFila(c, "", x)).join("")}</ul>` : ""}
        <h3 class="grupo">${sug.length ? "Los demás" : "Todos"} de ${esc(ac)}</h3><ul class="eq-l" data-filtro-eq>${resto.map((c) => eqFila(c, "", x)).join("")}</ul>
        <p class="vacio-g" id="eq-nadie" hidden>Nadie con ese apellido en ${esc(ac)}</p>
        <div id="eq-otros"></div>
      </section>`;
  }
  async function guardarEquipo(borrar) {
    if (EQ.guardando) return;
    const cat = S.eqcat, fecha = S.eqfecha, k = eqClave(cat, fecha), g = eqGuardado(cat, fecha), px = eqPartido(cat, fecha);
    const e = borrar ? { jugadores: {}, cambios: {}, rival: "" } : eqActual(cat, fecha);
    if (borrar && !g) { eqBorr.set(k, null); S.aform = null; avisar("ok", "Equipo borrado"); render(); return; }
    EQ.guardando = true;
    render();
    try {
      const rival = px ? px.rival : e.rival || (g && g.rival) || "", por = enCel.get(claveNombreNota) || "";
      const r = await apiD1({ accion: "equipo", equipo: cat, fecha, rival, jugadores: e.jugadores, cambios: e.cambios, por });
      // queda como guardado aunque después no se pueda volver a traer la lista
      EQ.lista = (EQ.lista || []).filter((x) => !(x.cat === cat && x.fecha === fecha));
      if (!borrar && Object.keys(e.jugadores).length) EQ.lista.push({ cat, fecha, rival, jugadores: e.jugadores, cambios: e.cambios, por, ts: r.ts || new Date().toISOString() });
      eqBorr.set(k, null);
      S.aform = null;
      avisar("ok", borrar ? "Equipo borrado" : "Equipo guardado. Ya lo ven los otros entrenadores");
      apiD1(null, "equipos=1").then((d) => { EQ.lista = d.equipos; }).catch(() => {});
    } catch (err) { avisar("error", errEq(err, borrar ? "No se pudo borrar" : "No se pudo guardar")); }
    finally { EQ.guardando = false; render(); }
  }
  /** el equipo en texto, para WhatsApp */
  function textoEquipo() {
    const cat = S.eqcat, f = S.eqfecha, e = eqActual(cat, f), px = eqPartido(cat, f), pl = eqPlantel(cat), g = eqGuardado(cat, f);
    const rival = px ? px.rival : e.rival || (g && g.rival) || "", nom = (id) => eqQuien(id, pl).nombre;
    const ns = Object.keys(e.jugadores).map(Number).sort((a, b) => a - b), sup = ns.filter((n) => n > 15);
    const l = [`*Los 50 · ${cat}*`, [rival ? `vs ${rival}` : "", mayus(cuandoP({ fecha: f })), px && px.hora].filter(Boolean).join(" · "), ""];
    ns.filter((n) => n <= 15).forEach((n) => l.push(`${n}. ${nom(e.jugadores[n])}`));
    if (sup.length) l.push("", "*Suplentes*");
    sup.forEach((n) => {
      const c = e.cambios[n], cuando = c ? [c.por ? `entra por el ${c.por}` : "", c.min ? `${c.min}'` : ""].filter(Boolean).join(", ") : "";
      l.push(`${n}. ${nom(e.jugadores[n])}${cuando ? ` (${cuando})` : ""}`);
    });
    return l.join("\n");
  }

  // ---------- notas entre entrenadores (functions/api/asistencia.js, tabla "notas" de D1) ----------
  // Cualquiera con la clave las lee. Cada nota guarda el nombre de quien la escribió (queda en el celular para no repetirlo)
  // y un código del celular: con ese código, y solo con ese, se puede borrar la propia.
  const NOTAS = { lista: null, error: null, cargando: false };
  const claveNombreNota = "los50-ent-nombre", claveDueno = "los50-ent-dueno";
  const duenoDeNotas = () => {
    let d = enCel.get(claveDueno);
    if (!d) { d = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join(""); enCel.set(claveDueno, d); }
    return d;
  };
  async function apiD1(cuerpo, q = "notas=1") {
    const r = await fetch(cuerpo ? "api/asistencia" : `api/asistencia?${q}`, {
      method: cuerpo ? "POST" : "GET", cache: "no-store",
      headers: { "x-ficha": fichaGuardada(), "x-dueno": duenoDeNotas(), ...(cuerpo ? { "content-type": "application/json" } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (r.status === 401) throw new Error("clave");
    if (!r.ok) throw new Error("servidor");
    return r.json();
  }
  const errNotas = (e, que, para = "usar las notas") => (e.message === "clave" ? `Para ${para} hay que volver a poner la clave. <button type="button" class="link" data-reclave>Poner la clave</button>`
    : `${que}${e.message === "servidor" ? "." : ": no hay señal."} Probá de nuevo en un rato.`);
  function cargarNotas() {
    if (NOTAS.cargando) return;
    NOTAS.cargando = true; NOTAS.error = null;
    apiD1().then((d) => { NOTAS.lista = d.notas; })
      .catch((e) => { NOTAS.error = errNotas(e, "No se pudieron cargar las notas"); })
      .finally(() => { NOTAS.cargando = false; if (S.ver === "notas") render(); });
  }
  /** guarda o borra una nota; si falla no se vuelve a dibujar, así lo escrito no se pierde */
  async function guardarNota(cuerpo, ok) {
    if (NOTAS.guardando) return;
    NOTAS.guardando = true;
    avisoSuelto("Guardando…", "espera");
    try {
      await apiD1({ dueno: duenoDeNotas(), ...cuerpo });
      NOTAS.lista = (await apiD1()).notas;
      avisar("ok", ok);
      if (cuerpo.accion === "nota") $("#nota-texto").value = "";
      S.aform = null;
      render();
    } catch (e) { avisoSuelto(errNotas(e, "No se pudo guardar")); }
    finally { NOTAS.guardando = false; }
  }
  const formNota = (b) => `<div class="asis-form">
      <label class="asis-form__campo">¿De qué categoría?<select id="nota-cat" class="asis-input">${["General", ...ASIS_CATS].map((c) => `<option value="${esc(c)}"${(b.cat || S.ncat || enCel.get(ULTIMA) || "General") === c ? " selected" : ""}>${c === "General" ? "General (todo el club)" : esc(c)}</option>`).join("")}</select></label>
      <label class="asis-form__campo">Tu nota<textarea id="nota-texto" class="asis-input asis-input--nota" maxlength="600" rows="4" placeholder="Por ejemplo: el ejercicio del cono quedó largo">${esc(b.texto || "")}</textarea></label>
      <label class="asis-form__campo">Tu nombre<input id="nota-por" class="asis-input" maxlength="60" autocomplete="given-name" value="${esc(b.por || enCel.get(claveNombreNota) || "")}"></label>
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-nota-ok>${IC.tilde}Guardar la nota</button>${cerrarBtn}</div></div>`;
  function vNotas() {
    const t0 = $("#nota-texto");
    if (t0) NOTAS.borrador = { texto: t0.value, por: $("#nota-por").value, cat: $("#nota-cat").value };
    if (!NOTAS.lista && !NOTAS.error) cargarNotas();
    const todas = NOTAS.lista || [], cats = ["General", ...ASIS_CATS].filter((c) => todas.some((n) => n.cat === c));
    if (S.ncat && !cats.includes(S.ncat)) S.ncat = null;
    const ver = todas.filter((n) => !S.ncat || n.cat === S.ncat);
    const fila = (n) => `<li class="nota"><div class="nota__cab"><b>${n.cat === "General" ? "Todo el club" : esc(n.cat)}</b><span>${esc(n.por || "")} · ${esc(cuandoP({ fecha: n.fecha }))}${n.fecha.slice(0, 4) === hoyISO().slice(0, 4) ? "" : ` de ${n.fecha.slice(0, 4)}`}</span></div>
      <p class="nota__txt">${esc(n.texto)}</p>
      ${!n.mia ? "" : S.aform === `borrar-nota:${n.id}` ? `<div class="asis-form"><span class="asis-form__l">¿Borrar esta nota?</span>
        <div class="asis-form__btns"><button type="button" class="btn btn--peligro btn--alto" data-borrar-nota-ok="${n.id}">Borrarla</button>${cerrarBtn}</div></div>`
        : `<button type="button" class="link nota__borrar" data-form="borrar-nota:${n.id}">Borrar mi nota</button>`}</li>`;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Notas", "notas")}</div>
      <section class="sec sec--pegada">
        ${S.aform === "nota" ? formNota(NOTAS.borrador || {}) : `<button type="button" class="btn-sec btn-sec--ancho asis-mas" data-form="nota">${IC.mas}Escribir una nota</button>`}
        ${cats.length > 1 ? `<div class="chips-g" role="group" aria-label="Categoría">${[["", "Todas"], ...cats.map((c) => [c, c === "General" ? "Todo el club" : c])].map(([v, l]) =>
          `<button type="button" data-ncat="${esc(v)}" aria-pressed="${(S.ncat || "") === v}">${esc(l)}</button>`).join("")}</div>` : ""}
        ${NOTAS.error ? `<div class="hoy hoy--error"><p class="hoy__canc">${NOTAS.error}</p><button type="button" class="btn-sec" data-reintentar-notas>Probar de nuevo</button></div>`
          : !NOTAS.lista ? `<p class="cargando">Cargando…</p>`
          : ver.length ? `<ul class="notas">${ver.map(fila).join("")}</ul>` : `<p class="vacio-g">Todavía no hay notas</p>`}
      </section>${avisoHTML()}`;
  }

  // ---------- de M19 a plantel superior (pase_y_alertas.py) ----------
  // Cuántos chicos que jugaron en M19 jugaron en plantel superior la temporada siguiente, de dónde vienen los del plantel superior y quiénes son.
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  /** una barra con partes (el número adentro, si entra) */
  const barraPase = (partes, aria) => `<div class="pase-barra" role="img" aria-label="${esc(aria)}">${partes.map(([n, cls]) => (n ? `<i class="${cls}" style="flex-grow:${n}">${n}</i>` : "")).join("")}</div>`;
  const leyPase = (items) => `<ul class="pase-ley">${items.map(([cls, t]) => `<li><i class="${cls}"></i>${t}</li>`).join("")}</ul>`;
  function vPase() {
    const P = D.pase, cerradas = P.cohortes.filter((c) => c.sig && !c.en_curso), ult = cerradas.at(-1), curso = P.cohortes.find((c) => c.en_curso);
    const por = (c) => pct(c.subieron, c.m19), n3 = cerradas.slice(-3).map(por);
    const tend = n3.length === 3 && n3[2] <= n3[0] - 10 ? `Viene bajando: ${n3.join("% → ")}%` : n3.length === 3 && n3[2] >= n3[0] + 10 ? `Viene subiendo: ${n3.join("% → ")}%` : "";
    const filaC = (c) => `<li class="pase-f"><div class="pase-f__cab"><b>${c.anio} → ${c.sig}</b><span>${c.m19} en M19${c.en_curso ? " · sigue la temporada" : ""}</span><strong class="num">${por(c)}%</strong></div>
      ${barraPase([[c.subieron, "s1"], [c.juveniles, "s2"], [c.no, "s3"]], `${c.subieron} jugaron en plantel superior, ${c.juveniles} siguen en juveniles, ${c.no} no volvieron a jugar`)}</li>`;
    const o = P.origen.at(-1), filaO = (x) => `<li class="pase-f"><div class="pase-f__cab"><b>${x.anio}</b><span>${x.total} jugadores</span><strong class="num">${pct(x.juveniles, x.total)}%</strong></div>
      ${barraPase([[x.juveniles, "s1"], [x.llegaron, "s4"], [x.ya, "s2"]], `${x.juveniles} salieron de las juveniles, ${x.llegaron} llegaron al club, ${x.ya} ya estaban`)}</li>`;
    const nm = P.nombres, lista = (xs) => (xs.length ? `<ul class="nombres-p">${xs.map((n) => `<li>${nombreHTML(n)}</li>`).join("")}</ul>` : `<p class="vacio-g">Nadie</p>`);
    $("#vista").innerHTML = `
      <div class="cab">${volver(AREAS.estadisticas, AREA_IR("estadisticas"))}${cabTit("De M19 a plantel superior", "pase")}</div>
      <div class="dos">
        <section class="sec sec--pegada">${tit("Los de M19: ¿qué hicieron después?")}
          ${ult ? `<p class="titular">De los <b>${ult.m19}</b> que jugaron en M19 en ${ult.anio}, <b>${ult.subieron}</b> (<b>${por(ult)}%</b>) jugaron en plantel superior en ${ult.sig}${tend ? `. <span class="junto">${tend}</span>` : ""}</p>` : ""}
          ${curso ? `<p class="titular">Este año, hasta ahora: <b>${curso.subieron}</b> de los <b>${curso.m19}</b> de M19 de ${curso.anio} jugaron en plantel superior en ${curso.sig} (<b>${por(curso)}%</b>)</p>` : ""}
          ${leyPase([["s1", "Jugaron en plantel superior"], ["s2", "Siguen en juveniles"], ["s3", "No volvieron a jugar"]])}
          <ul class="pase-g">${P.cohortes.filter((c) => c.sig).slice().reverse().map(filaC).join("")}</ul>
        </section>
        <section class="sec sec--pegada">${tit("¿De dónde vienen los del plantel superior?")}
          ${o ? `<p class="titular">En ${o.anio}, <b>${o.juveniles}</b> de los <b>${o.total}</b> jugadores (<b>${pct(o.juveniles, o.total)}%</b>) pasaron por las juveniles del club${o.llegaron ? `; <b>${o.llegaron}</b> llegaron de afuera` : ""}</p>` : ""}
          ${leyPase([["s1", "Salieron de las juveniles"], ["s4", "Llegaron al club"], ["s2", "Ya estaban"]])}
          <ul class="pase-g">${P.origen.slice().reverse().map(filaO).join("")}</ul>
        </section>
      </div>
      <section class="sec">${tit("Quiénes son")}
        ${desple("pase-act", `M19 de ${nm.actual.anio}`, `<h3 class="grupo">Ya jugaron en plantel superior (${nm.actual.ya.length})</h3>${lista(nm.actual.ya)}
          <h3 class="grupo">Todavía no (${nm.actual.todavia.length})</h3>${lista(nm.actual.todavia)}`, `${nm.actual.ya.length} de ${nm.actual.ya.length + nm.actual.todavia.length}`)}
        ${nm.anterior ? desple("pase-ant", `M19 de ${nm.anterior.anio}`, `<h3 class="grupo">Jugaron en plantel superior (${nm.anterior.subieron.length})</h3>${lista(nm.anterior.subieron)}
          <h3 class="grupo">Siguen en juveniles (${nm.anterior.juveniles.length})</h3>${lista(nm.anterior.juveniles)}
          <h3 class="grupo">No volvieron a jugar este año (${nm.anterior.no.length})</h3>${lista(nm.anterior.no)}`, `${nm.anterior.subieron.length} de ${nm.anterior.subieron.length + nm.anterior.juveniles.length + nm.anterior.no.length}`) : ""}
      </section>`;
  }

  // ---------- para mirar: sanciones, conmociones, rojas y amarillas (se calcula con el día de hoy, no con el día en que se armó el archivo) ----------
  const NIVEL = { 3: "Importante", 2: "Para tener en cuenta" };
  function alertasHoy() {
    const A_ = D.alertas;
    if (!A_) return [];
    const hoy = hoyISO(), out = [], sancionados = new Set();
    A_.sanciones.filter((s) => s.hasta >= hoy && (!s.desde || s.desde <= hoy)).forEach((s) => {
      sancionados.add(s.j);
      out.push({ n: 3, j: s.j, c: s.c, t: `Sancionado hasta el ${corta(s.hasta)}${s.art ? ` (${s.art})` : ""}` });
    });
    A_.conmociones.filter((x) => x.alta && x.alta >= hoy && x.f <= hoy).forEach((x) =>
      out.push({ n: 3, j: x.j, c: x.c, t: `En protocolo de conmoción. Alta prevista: ${corta(x.alta)}` }));
    A_.tarjetas.filter((x) => x.t === "R" && x.f >= masDias(hoy, -21) && !sancionados.has(x.j)).forEach((x) =>
      out.push({ n: 2, j: x.j, c: x.c, t: `Roja el ${corta(x.f)}: fijate si quedó suspendido` }));
    const am = {};
    A_.tarjetas.filter((x) => x.t === "A" && x.f >= masDias(hoy, -60)).forEach((x) => (am[x.j] ??= []).push(x));
    Object.entries(am).filter(([, v]) => v.length >= 2).forEach(([j, v]) =>
      out.push({ n: 2, j, c: v[0].c, t: `${v.length} amarillas en los últimos 60 días (la última, el ${corta(v[0].f)})` }));
    return out.sort((a, b) => b.n - a.n || (a.c || "").localeCompare(b.c || "") || a.j.localeCompare(b.j, "es"));
  }
  const alertaFila = (a) => `<li class="alerta alerta--${a.n}"><span class="alerta__ic">${IC.alerta}</span><span class="alerta__txt">
    <span class="alerta__j">${nombreHTML(a.j)}${a.c ? `<span class="chip chip--cat">${esc(a.c)}</span>` : ""}</span><small>${esc(a.t)}</small></span></li>`;
  /** la tarjeta del inicio: las 3 más importantes; se toca y abre todas */
  function alertasInicio() {
    const al = alertasHoy();
    if (!al.length) return "";
    return `<section class="sec sec--pegada"><button type="button" class="alertas-c" data-ir="alertas" aria-label="Para mirar: ${al.length}. Ver todas">
      <span class="alertas-c__cab"><b>Para mirar</b><span class="alertas-c__n num">${al.length}</span>${IC.adelante}</span>
      <ul class="alertas-c__l">${al.slice(0, 3).map(alertaFila).join("")}</ul></button></section>`;
  }
  function vAlertas() {
    const todas = alertasHoy(), cats = [...new Set(todas.map((a) => a.c).filter(Boolean))].sort((a, b) => ((D.cats.indexOf(a) + 1) || 99) - ((D.cats.indexOf(b) + 1) || 99));
    if (S.alcat && !cats.includes(S.alcat)) S.alcat = null;
    const al = todas.filter((a) => !S.alcat || a.c === S.alcat), grupo = (n) => (al.some((a) => a.n === n)
      ? `<h3 class="grupo">${NIVEL[n]}</h3><ul class="alertas-g">${al.filter((a) => a.n === n).map(alertaFila).join("")}</ul>` : "");
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Para mirar", "alertas")}</div>
      ${cats.length > 1 ? `<div class="chips-g" role="group" aria-label="Categoría">${[["", "Todas"], ...cats.map((c) => [c, c])].map(([v, l]) =>
        `<button type="button" data-alcat="${esc(v)}" aria-pressed="${(S.alcat || "") === v}">${esc(l)}</button>`).join("")}</div>` : ""}
      <section class="sec sec--pegada">${al.length ? grupo(3) + grupo(2) : `<p class="vacio-g">Nada para mirar por ahora</p>`}</section>`;
  }

  // la categoría, adentro de un área: botones grandes, de a tres por fila (de a cuatro en infantiles); la última que elegiste, marcada
  function vArea() {
    // en Asistencia, la última categoría es la última en la que se entró (la misma que usa el inicio)
    const a = S.area, ult = a === "asistencia" ? enCel.get(ULTIMA) : enCel.get(claveArea(a));
    const cab = (t, k) => `<div class="cab">${volver()}${cabTit(t, k)}</div>`;
    if (a === "estadisticas") {
      // en estadísticas, la tabla de categorías con ganados, empatados y perdidos (ya es un dato) y lo del club
      $("#vista").innerHTML = `${cab(AREAS.estadisticas, "categorias")}
        <section class="sec sec--pegada">
          ${tablaCats("Plantel superior", D.cats.filter((c) => PS.includes(c)))}
          ${tablaCats("Juveniles", D.cats.filter((c) => !PS.includes(c)))}
          <h3 class="grupo">Todo el club</h3>
          <ul class="menu">${D.pase ? opcion("pase", IC.sube, "De M19 a plantel superior", "Cuántos suben cada año y de dónde vienen") : ""}${opcion("club", IC.gente, "¿Los chicos siguen?", "Cuántos siguen y llegan a Primera")}${opcion("consejos", IC.idea, "Consejos", "Qué trabajar y qué empezar a medir")}</ul>
        </section>`;
      return;
    }
    const boton = ([v, txt = v]) => `<button type="button" class="elegir__cat" data-area-cat="${esc(v)}" aria-pressed="${ult === v}">${esc(txt)}</button>`;
    const grupo = (t, items, cls = "") => (items.length ? `<h3 class="grupo">${t}</h3><div class="elegir${cls}">${items.map(boton).join("")}</div>` : "");
    const juv = a === "partidos" ? D.cats.filter((c) => !PS.includes(c)) : ASIS_CATS.slice(1, 7);
    $("#vista").innerHTML = `${cab(`${AREAS[a]}: ¿qué categoría?`)}
      <section class="sec sec--pegada">
        ${a === "partidos" ? grupo("Todo el club", [["Todas", "Todas las categorías"]]) : ""}
        ${grupo("Plantel superior", [["Plantel superior"]])}
        ${grupo("Juveniles", juv.map((c) => [c]))}
        ${a === "partidos" || a === "tests" ? "" : grupo("Infantiles", ASIS_CATS.slice(7).map((c) => [c]), " elegir--4")}
        ${a === "asistencia" ? `<button type="button" class="btn-sec btn-sec--ancho area-todas" data-ir="asistencia">Ver todas, con su porcentaje</button>` : ""}
      </section>`;
  }

  /** arriba de las prácticas de una categoría (Planificación): qué tiene que aprender, el scrum de su edad y sus juegos */
  function atajosPlan(cat) {
    const g = D.guia, gc = gDe(cat), sc = scrumDe(cat === "Plantel superior" ? "M19" : cat);
    const jg = g.ejercicios ? g.ejercicios.filter((e) => e.cats.includes(cat)).length : 0;
    const lema = !gc ? "" : esInf(cat) ? (gc.semillas.ataque[0] ? `“${esc(gc.semillas.ataque[0])}”` : "") : esc(g.lemas_juv[cat] || "");
    return `<ul class="menu">
      ${gc ? opcionDe(`data-ir-guia="${esc(cat)}"`, IC.libro, `Qué tiene que aprender ${esc(cat)}`, lema || "Frase guía, prioridades y qué evitar") : ""}
      ${opcion("scrum", IC.escudo, "Scrum seguro", sc ? `En ${esc(cat)}: ${esc(sc[1])}` : "Qué se hace en cada edad y el set up")}
      ${jg ? opcionDe(`data-ir-ej-para="${esc(cat)}"`, IC.cono, `Juegos para ${esc(cat)}`, `${pl(jg, "juego", "juegos")} que usan en ${esc(cat)}`) : ""}
    </ul>`;
  }
  /** los días que el grupo suele entrenar, según sus prácticas (los que tienen al menos una de cada siete) */
  function diasHabituales(lista) {
    const c = Array(7).fill(0), f = lista.filter((p) => p.fecha);
    f.forEach((p) => c[dia(p.fecha).getDay()]++);
    return new Set(c.flatMap((n, i) => (n >= Math.max(2, f.length / 7) ? [i] : [])));
  }
  // Planificación de una categoría: la semana (los días que entrena, con la práctica de cada uno; el de hoy, pintado),
  // lo que tiene que aprender y la temporada (las prácticas de su grupo: M11 y M12…). En la compu, la semana queda fija a la izquierda.
  function vPlan() {
    const cat = S.pcat, hoy = hoyISO();
    S.pgrupo = grupoDeCat(cat === "Plantel superior" ? "Primera" : cat);
    const todas = S.pgrupo ? prLista() : [], conFecha = todas.filter((p) => p.fecha);
    // los días que entrena: los que cargó el entrenador en Asistencia (con su hora, suspendidos y agregados);
    // si todavía no los cargó, los que suele entrenar según sus prácticas
    const d = D.fichados && ASIS_CATS.includes(cat) ? ASIS.cats[cat] : null;
    if (D.fichados && ASIS_CATS.includes(cat) && !d && !ASIS.error[cat]) cargarAsis(cat);
    const lunes = masDias(hoy, -((dia(hoy).getDay() + 6) % 7)), domingo = masDias(lunes, 6);
    const ses = d && d.horarios.length ? new Map(sesiones(d, lunes, domingo).map((s) => [s.fecha, s])) : null, habit = diasHabituales(todas);
    const semana = Array.from({ length: 7 }, (_, i) => masDias(lunes, i)).flatMap((f) => {
      const ps = conFecha.filter((p) => p.fecha === f), s = ses && ses.get(f), dd = dia(f), esHoy = f === hoy;
      if (!ps.length && !(ses ? s : habit.has(dd.getDay()))) return [];
      const cls = esHoy ? " ej--hoy" : "", canc = s && s.estado === "cancelado";
      const badge = `<span class="prac__dia"><b class="num">${dd.getDate()}</b><small>${esHoy ? "hoy" : DIA_S[dd.getDay()].slice(0, 3)}</small></span>`;
      const extra = [s && s.hora, canc ? `Suspendido${s.motivo ? `: ${s.motivo}` : ""}` : ""].filter(Boolean).map(esc).join(" · ");
      if (ps.length) return ps.map((p) => `<li data-pr="${esc(p.id)}"><button type="button" class="ej prac${cls}" data-ir-practica="${esc(p.id)}">${badge}
        <span class="ej__txt"><b>${esc(p.foco || "Práctica")}</b><small>${[extra, esc(p.quien), minDe(p) ? `${minDe(p)} min` : ""].filter(Boolean).join(" · ")}</small></span>${IC.adelante}</button></li>`);
      return [`<li><div class="ej prac ej--vacio${cls}">${badge}<span class="ej__txt"><b>${canc ? "Suspendido" : "Sin cargar"}</b>${extra && !canc ? `<small>${extra}</small>` : canc && s.motivo ? `<small>${esc(s.motivo)}</small>` : ""}</span><span></span></div></li>`];
    });
    $("#vista").innerHTML = `
      <div class="cab">${volver(AREAS.planificacion, AREA_IR("planificacion"))}${cabTit(`Planificación de ${esc(cat)}`, "plan")}</div>
      <div class="plan">
        <div class="plan__lado">
          <section class="sec sec--pegada">${tit("Esta semana")}${semana.length ? `<ul class="filas-cat">${semana.join("")}</ul>` : `<p class="vacio-g">Sin entrenamientos esta semana</p>`}</section>
          <section class="sec">${tit("Para armar la práctica")}${atajosPlan(cat)}</section>
        </div>
        <section class="sec sec--pegada">${tit(S.pgrupo ? `La temporada de ${esc(S.pgrupo)}` : "La temporada")}
          ${todas.length ? `${buscadorPr()}${mesesPr(todas, true)}${sinPr}` : `<p class="vacio-g">Todavía no hay prácticas cargadas</p>`}</section>
      </div>`;
    filtrarPr();
  }

  // los partidos de una categoría (o de todas): los próximos que cargó la UAR y los últimos resultados; en la compu, uno al lado del otro
  function vPartidos() {
    const m = S.mcat, cs = m === "Todas" ? D.cats : catsUAR(m), varias = cs.length > 1;
    const conEq = !!D.fichados && cs.some(eqAsis);
    if (conEq && !EQ.lista && !EQ.error) cargarEquipos();
    const prox = [...proxTodos().filter((x) => cs.includes(x.cat)), ...(conEq ? amistosos(cs) : [])].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora || "").localeCompare(b.hora || ""));
    const ult = D.partidos.filter((x) => cs.includes(x.cat)).slice(0, 10);
    $("#vista").innerHTML = `
      <div class="cab">${volver(AREAS.partidos, AREA_IR("partidos"))}${cabTit(m === "Todas" ? "Partidos de todo el club" : `Partidos de ${esc(m)}`)}</div>
      <div class="dos">
        <section class="sec">${tit("Próximos", "proximos")}${prox.length ? proxHTML(prox, varias, conEq) : `<p class="vacio-g">Todavía sin fecha</p>`}
          ${!conEq ? "" : S.aform === "amistoso" ? formAmistoso(cs) : `<button type="button" class="btn-sec btn-sec--ancho eq-otro" data-form="amistoso">${IC.mas}Armar el equipo de otro partido</button>`}</section>
        <section class="sec">${tit("Últimos resultados", "ultimos")}${ult.length ? `<ol class="resultados">${ult.map((x) => partidoHTML(x, varias)).join("")}</ol>` : `<p class="vacio-g">Todavía sin partidos</p>`}</section>
      </div>`;
  }

  // la guía del club: lo que es igual para todas las categorías
  function vGuiaClub() {
    const g = D.guia;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Guía del club")}</div>
      <section class="sec sec--pegada"><ul class="areas">
        ${tarjeta('data-ir="guia"', IC.libro, "Qué aprende cada categoría", "Frase guía y prioridades")}
        ${g.puestos ? tarjeta('data-ir="puestos"', IC.camiseta, "Los puestos", "Qué se espera del 1 al 15") : ""}
        ${tarjeta('data-ir="scrum"', IC.escudo, "Scrum seguro", "Cada edad y el set up")}
        ${tarjeta('data-ir="cantos"', IC.canto, "Cantos y zonas", `Los ${g.cantos.length} cantos y las zonas`)}
      </ul></section>`;
  }

  // categoría: las 5 preguntas
  function vCategoria() {
    const cat = S.cat, filas = filasCat(cat), anios = filas.map((r) => r["Año"]);
    if (!S.temp || !anios.includes(S.temp)) S.temp = ultimaTemp(cat);
    const a = S.temp, r = filas.find((x) => x["Año"] === a), i = anios.indexOf(a), px = proxDe(cat)[0];

    // 1. cómo le fue
    const duelo = (lbl, hizo, recibio) => {
      const tot = hizo + recibio || 1;
      return `<div class="duelo"><span class="duelo__lbl">${lbl}</span>
        <span class="duelo__n duelo__n--a num"><strong>${hizo}</strong><small>hizo</small></span>
        <span class="duelo__barra" aria-hidden="true"><i style="flex-grow:${hizo || 0.001}"></i><i style="flex-grow:${recibio || 0.001}"></i></span>
        <span class="duelo__n duelo__n--b num"><strong>${recibio}</strong><small>le hicieron</small></span></div>`;
    };
    const pos = (t) => { const m = (t["Posición en la tabla"] || "").split(" | ").at(-1).match(/(\d+)º de (\d+)/); return m ? `Terminó ${m[1]}º de ${m[2]}` : ""; };
    const tor = D.torneos.filter((x) => x["Categoría"] === cat && x["Año"] === a);

    // 2. comparado con todos los años: arriba de cada gráfico, la respuesta en palabras y si fue mejor o peor que lo normal
    const promGan = prom(filas.map((x) => x["% victorias"]));
    const pf = r["PF por partido"], pc = r["PC por partido"];
    const promPF = prom(filas.map((x) => x["PF por partido"])), promPC = prom(filas.map((x) => x["PC por partido"]));
    const titGan = r["% victorias"] == null ? "" : `<p class="titular">Ganó el <b>${fmt(r["% victorias"], "%")}</b> de los partidos</p>
      ${tendencia(r["% victorias"] - promGan, 3, fmt(promGan, "%"))}`;
    const titPts = pf == null || pc == null ? "" : `<p class="titular">Hizo <span class="junto"><i class="punto punto--a"></i><b>${fmt(pf, "d")}</b></span> y le hicieron <span class="junto"><i class="punto punto--b"></i><b>${fmt(pc, "d")}</b></span> puntos por partido</p>
      ${tendencia((pf - pc) - (promPF - promPC), 2, `${fmt(promPF, "d")} y ${fmt(promPC, "d")}`)}`;
    // 3. partidos y rivales
    const parts = D.partidos.filter((x) => x.cat === cat && x.anio === a), verP = S.verP ? parts : parts.slice(0, 6);
    const riv = D.rivales.filter((x) => x["Categoría"] === cat);
    // 4. jugadores
    const jug = D.jug.filter((x) => x.cat === cat && x.anio === a).sort((x, y) => y[S.ordenJ] - x[S.ordenJ] || y.pj - x.pj || x.nombre.localeCompare(y.nombre, "es"));
    const verJ = S.verJ ? jug : jug.slice(0, 12);
    // 5. siguen jugando
    const ret = D.ret.filter((x) => x["Categoría"] === cat).sort((x, y) => x["Año"] - y["Año"]);
    const retSel = ret.filter((x) => x["Año"] <= a).at(-1);
    const sigTemp = (an) => anios.find((x) => x > an) || an + 1;
    const pase = ret.filter((x) => x["% pasaje a plantel superior"] != null);
    const paseSel = pase.filter((x) => x["Año"] <= a).at(-1);

    // local, visitante y más
    // un renglón por dato: la barra azul es el año elegido y la rayita, lo normal (el promedio de todos los años).
    // Abajo del título va una línea solo si agrega algo para leer el número (no si repite el título).
    const masFila = (lbl, k, nota = "") => {
      const v = r[k], p = prom(filas.map((x) => x[k]));
      if (v == null) return "";
      const pos = (x) => `${Math.max(0, Math.min(100, x))}%`;
      return `<li class="dato-e"><b class="dato-e__tit">${lbl}</b>
        <span class="dato-e__val num"><strong>${fmt(v, "%")}</strong><small>lo normal: ${fmt(p, "%")}</small></span>
        ${nota ? `<span class="dato-e__exp">${nota}</span>` : ""}
        <span class="dato-e__barra" aria-hidden="true"><i style="width:${pos(v)}"></i>${p != null ? `<b style="left:${pos(p)}"></b>` : ""}</span></li>`;
    };
    const verR = S.verR ? riv : riv.slice(0, 8);

    // los tries: quién los hace y cuándo (en juveniles, solo cuándo: la camiseta no siempre es el puesto)
    const tr = D.tries && D.tries[cat] && D.tries[cat][a];
    let triesHTML = "";
    if (tr) {
      // la tabla siempre suma el total: lo que no tiene puesto en la planilla (sin camiseta) va en su propio renglón
      const sinPuesto = (x) => ({ ...x, sinpuesto: x.lineas ? x.tries - x.forwards - x.backs - x.try_penal : 0 });
      const af = sinPuesto(tr.a_favor), ec = sinPuesto(tr.en_contra);
      // un renglón por dato con lo que hizo (azul) y lo que le hicieron (rojo); arriba, una sola vez, qué es cada número
      const fila = (lbl, x, y) => `<div class="duelo duelo--c"><span class="duelo__lbl">${lbl}</span>
        <strong class="duelo__n duelo__n--a num">${x}</strong>
        <span class="duelo__barra" aria-hidden="true"><i style="flex-grow:${x || 0.001}"></i><i style="flex-grow:${y || 0.001}"></i></span>
        <strong class="duelo__n duelo__n--b num">${y}</strong></div>`;
      const tabla = (filas) => `<div class="duelos duelos--c"><div class="duelo duelo--c duelo--cab" aria-hidden="true"><span></span><span class="duelo__n--a">Hizo</span><span></span><span class="duelo__n--b">Le hicieron</span></div>
        ${filas.filter(Boolean).map(([l, k, sub]) => fila(l, sub ? af.lineas[k] : af[k], sub ? ec.lineas[k] : ec[k])).join("")}</div>`;
      const mas = (x) => (x.forwards > x.backs ? "forwards" : x.backs > x.forwards ? "backs" : "");
      const quien = af.lineas && ec.lineas ? `<h3 class="grupo">¿Quién los hace?</h3>
        <p class="titular">${!af.tries ? "No hizo tries" : mas(af) ? `Hace más tries con los <b>${mas(af)}</b>` : "Hace tries parejo con forwards y backs"}
          y ${!ec.tries ? "no le hicieron tries" : mas(ec) ? `se los hacen más los <b>${mas(ec)}</b>` : "se los hacen parejo forwards y backs"}</p>
        ${tabla([["Forwards", "forwards"], ["Backs", "backs"],
          ["Primera línea<small>1 al 3</small>", "primera", 1], ["Segunda línea<small>4 y 5</small>", "segunda", 1], ["Tercera línea<small>6 al 8</small>", "tercera", 1],
          ["Medios<small>9 y 10</small>", "medios", 1], ["Centros<small>12 y 13</small>", "centros", 1], ["Wings y fullback<small>11, 14 y 15</small>", "wings_fullback", 1],
          af.try_penal || ec.try_penal ? ["Try penal", "try_penal"] : null,
          af.sinpuesto || ec.sinpuesto ? ["Sin dato del puesto", "sinpuesto"] : null])}` : "";
      triesHTML = desple("tries", "Los tries: quién y cuándo", `
        ${quien}
        <h3 class="grupo">¿Cuándo?</h3>
        <p class="titular">En los últimos 10 minutos hizo <b>${af.ultimos10}</b> y le hicieron <b>${ec.ultimos10}</b>${ayudaBtn("tries")}</p>
        ${tabla([["1er tiempo", "t1"], ["2º tiempo", "t2"], ["Últimos 10 minutos", "ultimos10"], ["Entrando del banco", "banco"]])}`);
    }

    $("#vista").innerHTML = `
      <div class="cab">
        ${volver(AREAS.estadisticas, AREA_IR("estadisticas"))}
        <div class="cab__fila">
          <h2 class="cab__cat">${esc(cat)}</h2>
          <div class="anio" role="group" aria-label="Año">
            <button type="button" data-anio="${i > 0 ? anios[i - 1] : ""}" aria-label="Año anterior"${i > 0 ? "" : " disabled"}>${IC.atras}</button>
            <span class="anio__n num" aria-live="polite"><small>Año</small>${a}</span>
            <button type="button" data-anio="${i < anios.length - 1 ? anios[i + 1] : ""}" aria-label="Año siguiente"${i < anios.length - 1 ? "" : " disabled"}>${IC.adelante}</button>
          </div>
        </div>
        ${px ? `<div class="prox">${IC.calendario}<span class="prox__txt"><span class="prox__lbl">Próximo partido</span>
          <b>${esc(mayus(cuandoP(px)))}${px.hora ? ` · ${esc(px.hora)}` : ""}</b>
          <span class="prox__vs">${vsHTML(px)}</span>
          <span>${subProx(px)}</span></span></div>` : ""}
        ${D.guia && gDe(cat) ? `<button type="button" class="atajo" data-ir-guia="${esc(cat)}">${IC.libro}<span>Qué tiene que aprender ${esc(cat)}</span>${IC.adelante}</button>` : ""}
        ${D.guia ? atajoPr(cat) : ""}
        ${atajoAsis(cat)}
      </div>

      <section class="sec">
        <div class="tit"><h2 class="h2">Cómo le fue en ${a}</h2><span class="tit__meta num">${pl(r.PJ, "partido", "partidos")}</span></div>
        ${r.PJ < 5 ? `<p class="tend tend--ojo">Son pocos partidos: los números pueden engañar</p>` : ""}
        <div class="gep">
          <div class="gep__c gep--g"><strong class="num">${r.G}</strong><span>${r.G === 1 ? "ganado" : "ganados"}</span></div>
          <div class="gep__c gep--e"><strong class="num">${r.E}</strong><span>${r.E === 1 ? "empatado" : "empatados"}</span></div>
          <div class="gep__c gep--p"><strong class="num">${r.P}</strong><span>${r.P === 1 ? "perdido" : "perdidos"}</span></div>
        </div>
        <div class="duelos">
          ${duelo("Puntos", r["Puntos a favor"], r["Puntos en contra"])}
          ${duelo("Tries", r["Tries a favor"], r["Tries en contra"])}
        </div>
        ${tor.length ? `<h3 class="grupo">Torneos</h3><ul class="lista">${tor.map((t) => `<li><span class="lista__txt">${esc(t.Torneo.replace(/^\d+\/\d{4}\s*/, ""))}<small class="num">${pl(t.G, "ganado", "ganados")}${t.E ? ` · ${pl(t.E, "empatado", "empatados")}` : ""} · ${pl(t.P, "perdido", "perdidos")}</small></span>${pos(t) ? `<span class="chip">${pos(t)}</span>` : ""}</li>`).join("")}</ul>` : ""}
      </section>

      <section class="sec">
        ${tit("¿Mejor o peor que otros años?", "comparar")}
        <div class="bloque-graf">${titGan}
          <div class="graf-wrap">${barras(filas.map((x) => ({ x: x["Año"], y: x["% victorias"] })), { sel: a, tipo: "%", promedio: promGan })}</div></div>
        <div class="bloque-graf">${titPts}
          <div class="graf-wrap">${barrasDobles(filas.map((x) => ({ x: x["Año"], a: x["PF por partido"], b: x["PC por partido"] })), { sel: a })}</div></div>
      </section>

      <section class="sec desplegables">
        ${videosDe("cats", cat).length ? desple("videos", "Videos de partidos", `<div class="videos-ej">${videosDe("cats", cat).map(tarjetaVideo).join("")}</div>`,
          pl(videosDe("cats", cat).length, "video", "videos")) : ""}
        ${desple("partidos", "Contra quién jugó", `
          <ol class="resultados">${verP.map((p) => partidoHTML(p)).join("")}</ol>
          ${parts.length > 6 ? `<button type="button" class="btn btn--ancho" data-ver="P">${S.verP ? "Ver menos" : `Ver los ${parts.length} partidos`}</button>` : ""}
          ${riv.length ? `<div class="grupo-fila"><h3 class="grupo">Contra cada rival, todos los años</h3>
            <p class="ley"><span><i class="ley--g"></i>ganamos</span><span><i class="ley--e"></i>empatamos</span><span><i class="ley--p"></i>perdimos</span></p></div>
            <ul class="rivales-e">${verR.map((x) => `<li><div class="rivales-e__fila"><b>${esc(x.Rival)}</b><span class="num">${x.PJ} partidos</span></div>
              <div class="rivales-e__barra num" role="img" aria-label="Ganamos ${x.G}, empatamos ${x.E}, perdimos ${x.P}">${[["g", x.G], ["e", x.E], ["p", x.P]].filter(([, n]) => n).map(([k, n]) => `<i class="${k}" style="flex-grow:${n}">${n}</i>`).join("")}</div></li>`).join("")}</ul>
            ${riv.length > 8 ? `<button type="button" class="btn btn--ancho" data-ver="R">${S.verR ? "Ver menos" : `Ver los ${riv.length} rivales`}</button>` : ""}` : ""}`,
          pl(parts.length, "partido", "partidos"))}

        ${desple("jugadores", "Quiénes jugaron", `
          <div class="tabla-e-wrap"><table class="tabla-e">
            <thead><tr><th scope="col" class="izq">Jugador</th>${[["pj", "Partidos"], ["tries", "Tries"], ["pts", "Puntos"]].map(([k, l]) =>
              `<th scope="col"${k === S.ordenJ ? ' aria-sort="descending"' : ""}><button type="button" data-ordj="${k}">${l}</button></th>`).join("")}</tr></thead>
            <tbody>${verJ.map((j) => `<tr><td class="izq">${nombreHTML(j.nombre)}</td><td>${j.pj}</td><td>${j.tries}</td><td>${j.pts}</td></tr>`).join("")}</tbody>
          </table></div>
          ${jug.length > 12 ? `<button type="button" class="btn btn--ancho" data-ver="J">${S.verJ ? "Ver menos" : `Ver los ${jug.length} jugadores`}</button>` : ""}`,
          pl(jug.length, "jugador", "jugadores"))}

        ${triesHTML}

        ${ret.length ? desple("siguen", "¿Los chicos siguen?", `
          ${retSel ? `<p class="titular">De los <b>${retSel.Jugadores}</b> de ${retSel["Año"]}, volvieron <b>${retSel["Siguen la temporada siguiente"]}</b> en ${sigTemp(retSel["Año"])}${ayudaBtn("siguenCat")}</p>` : ""}
          <div class="graf-wrap">${barras(ret.map((x) => ({ x: x["Año"], y: x["% retención"] })), { sel: retSel ? retSel["Año"] : null, tipo: "%", promedio: prom(ret.map((x) => x["% retención"])) })}</div>
          ${retSel ? listaNoSiguieron(cat, retSel["Año"], sigTemp(retSel["Año"])) : ""}
          ${pase.length ? `<h3 class="grupo grupo--sep">¿Llegan a Primera?</h3>
            ${paseSel ? `<p class="titular">De los <b>${paseSel.Jugadores}</b> M19 de ${paseSel["Año"]}, <b>${paseSel["Pasaron a plantel superior (en 2 temporadas)"]}</b> ya jugaron en el plantel superior${ayudaBtn("pase")}</p>` : ""}
            <div class="graf-wrap">${barras(pase.map((x) => ({ x: x["Año"], y: x["% pasaje a plantel superior"] })), { sel: paseSel ? paseSel["Año"] : null, tipo: "%", promedio: prom(pase.map((x) => x["% pasaje a plantel superior"])) })}</div>` : ""}`,
          retSel ? `${fmt(retSel["% retención"], "%")} volvió` : "") : ""}

        ${desple("mas", "Local, visitante y más", `
          <ul class="datos-e">
            ${masFila("Hizo el primer tanto del partido", "% marcamos primero",
              r["% victorias cuando marcamos primero"] != null ? `Cuando lo hizo, ganó el ${fmt(r["% victorias cuando marcamos primero"], "%")}.` : "")}
            ${masFila("Ganó jugando en casa", "% victorias de local")}
            ${masFila("Ganó jugando afuera", "% victorias de visitante")}
            ${masFila("Conversiones que entraron", "% conversiones", "El try penal no cuenta, porque no se patea.")}
            ${masFila("Puntos en contra en el 2º tiempo", "% PC en 2º tiempo", "Más de 60% puede ser cansancio.")}
          </ul>`)}
      </section>`;
  }
  /** los que estuvieron en planillas ese año y no volvieron a aparecer el año siguiente */
  function listaNoSiguieron(cat, anio, sig) {
    const l = D.noSig.filter((x) => x.cat === cat && x.anio === anio);
    if (!l.length) return `<p class="frase">Todos volvieron a aparecer en ${sig}.</p>`;
    const ver = S.verN ? l : l.slice(0, 8);
    const detalle = (x) => x.jugo ? `${x.jugo === 1 ? "jugó 1 partido" : `jugó ${x.jugo} partidos`}` : `solo en el banco (${x.planillas === 1 ? "1 partido" : `${x.planillas} partidos`})`;
    return `<h3 class="grupo">Los que no volvieron a aparecer en ${sig} (${l.length})</h3>
      <ul class="lista">${ver.map((x) => `<li><span class="lista__txt"><span>${nombreHTML(x.nombre)}</span><small>${detalle(x)}</small></span>
        <span class="chip chip--gris">último partido: ${fecha(x.ultimo)}</span></li>`).join("")}</ul>
      ${l.length > 8 ? `<button type="button" class="btn btn--ancho" data-ver="N">${S.verN ? "Ver menos" : `Ver los ${l.length}`}</button>` : ""}`;
  }
  function nombreHTML(n) {
    const i = n.indexOf(",");
    return i < 0 ? `<b>${esc(n)}</b>` : `<b>${esc(n.slice(0, i))}</b>, ${esc(n.slice(i + 1).trim())}`;
  }
  // ---------- próximos partidos (el fixture que ya cargó la UAR; proximos_partidos.py) ----------
  // Solo de hoy en adelante: si la actualización se atrasa, no quedan partidos viejos a la vista.
  const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const proxTodos = () => D.prox.filter((x) => x.fecha >= hoyISO());
  const proxDe = (cat) => proxTodos().filter((x) => x.cat === cat);
  const condTxt = (c) => (c === "L" ? "Local" : "Visitante");
  // siempre dice Los 50, con el local primero, así se ve que es un partido nuestro
  const vsHTML = (x) => (x.cond === "L" ? `<span class="nos">LOS 50</span> vs ${esc(x.rival)}` : `${esc(x.rival)} vs <span class="nos">LOS 50</span>`);
  /** abajo del partido: de local o de visitante y la instancia */
  const subProx = (x) => (x.amistoso ? "Amistoso" : `De ${condTxt(x.cond).toLowerCase()}${x.inst ? ` · ${esc(x.inst)}` : ""}`);
  /** agrupados por día: la hora, la categoría, el rival y si es de local o de visitante */
  function proxHTML(lista, conCat = true, conEq = false) {
    const dias = [...new Set(lista.map((x) => x.fecha))];
    return dias.map((f) => `<h3 class="grupo">${esc(mayus(cuandoP({ fecha: f })))}</h3>
      <ol class="resultados">${lista.filter((x) => x.fecha === f).map((x) => `<li class="res">
        <span class="res__fecha num">${esc(x.hora || "–")}</span>
        <span class="res__cuerpo">${conCat ? `<span class="chip chip--cat">${esc(x.cat)}</span>` : ""}<span class="res__rival">${vsHTML(x)}</span><span class="res__sub">${subProx(x)}</span></span>${conEq && eqAsis(x.cat) ? eqBtn(x) : ""}</li>`).join("")}</ol>`).join("");
  }

  const partidoHTML = (p, conCat) => `<li class="res">
      <span class="res__fecha">${fecha(p.fecha)}<small>${p.cond === "L" ? "Local" : "Visitante"}</small></span>
      <span class="res__cuerpo">${conCat ? `<span class="chip chip--cat">${esc(p.cat)}</span>` : ""}<span class="res__rival">${esc(p.rival)}</span></span>
      <span class="res__marcador res--${p.res}"><b class="num">${p.pf}–${p.pc}</b><i>${({ G: "Ganó", E: "Empató", P: "Perdió" })[p.res]}</i></span></li>`;

  // todo el club: siguen jugando, camino a Primera, nacimiento y peso
  function vClub() {
    const ultimos = [...new Set(D.ret.map((r) => r["Año"]))].sort((a, b) => a - b).slice(-4);
    const celda = (v) => v == null ? "<td>–</td>" : `<td><span class="pct ${v >= 80 ? "pct--a" : v >= 65 ? "pct--b" : "pct--c"}">${Math.round(v)}%</span></td>`;
    const fisCats = [...new Set(D.fis.map((f) => f["Categoría"]))];
    const kg = (c, l) => fmt((D.fis.find((x) => x["Categoría"] === c && x["Línea"] === l) || {})["Peso promedio (kg)"], "d");
    // las respuestas en palabras, arriba de cada tabla
    const u = ultimos.at(-1), delAnio = D.ret.filter((x) => x["Año"] === u && x["% retención"] != null);
    const peor = delAnio.sort((x, y) => x["% retención"] - y["% retención"])[0];
    const titRet = peor ? `<p class="titular">En ${u}, la que más chicos perdió fue <b>${esc(peor["Categoría"])}</b>: volvió el <b>${fmt(peor["% retención"], "%")}</b></p>` : "";
    // "despareja" = muchos más nacidos a principio de año (ene-mar) que a fin de año (oct-dic)
    const desp = D.era.filter((x) => x["Nacidos ene-mar %"] - x["oct-dic %"] >= 15).map((x) => x["Categoría"]);
    const titEra = `<p class="titular">${desp.length ? `En <b>${esc(desp.join(", ").replace(/, ([^,]*)$/, " y $1"))}</b> hay muchos más nacidos a principio de año`
      : "En todas las categorías las 4 partes son parecidas: <b>está bien</b>"}</p>`;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}<h2 class="cab__cat">Todo el club</h2></div>

      <section class="sec">
        ${tit("¿Los chicos siguen jugando?", "siguen")}
        ${titRet}
        <p class="ley"><span class="pct pct--a">80% o más</span><span class="pct pct--b">65 a 79%</span><span class="pct pct--c">menos de 65%</span></p>
        <div class="tabla-e-wrap"><table class="tabla-e"><thead><tr><th scope="col" class="izq">Categoría</th>${ultimos.map((a) => `<th scope="col">${a}</th>`).join("")}</tr></thead>
          <tbody>${D.cats.map((c) => `<tr><th scope="row" class="izq">${esc(c)}</th>${ultimos.map((a) => celda((D.ret.find((r) => r["Categoría"] === c && r["Año"] === a) || {})["% retención"])).join("")}</tr>`).join("")}</tbody></table></div>
      </section>

      <section class="sec">
        ${tit("Camino a Primera", "camino")}
        ${fraseCamino()}
        <div class="tabla-e-wrap"><table class="tabla-e"><thead><tr><th scope="col" class="izq">Año</th><th scope="col">Debutaron</th><th scope="col">Edad titulares</th><th scope="col">Partidos previos</th></tr></thead>
          <tbody>${D.camino.filter((r) => r["Año"] >= 2019).map((r) => `<tr><th scope="row" class="izq">${r["Año"]}</th><td>${r["Debutaron en Primera"] ?? "–"}</td><td>${fmt(r["Edad promedio del XV titular"], "d")}</td><td>${r["Partidos previos en plantel superior del XV (promedio)"] ?? "–"}</td></tr>`).join("")}</tbody></table></div>
      </section>

      <section class="sec">
        ${tit("¿En qué parte del año nacieron?", "nacieron")}
        ${titEra}
        <p class="ley"><i class="q1"></i>ene-mar <i class="q2"></i>abr-jun <i class="q3"></i>jul-sep <i class="q4"></i>oct-dic</p>
        <ul class="era">${D.era.map((r) => {
          const q = [r["Nacidos ene-mar %"], r["abr-jun %"], r["jul-sep %"], r["oct-dic %"]];
          return `<li><span class="era__cat">${esc(r["Categoría"] === "Pre-Intermedia" ? "Pre-Inter." : r["Categoría"])}</span><span class="era__bar" role="img" aria-label="${q.map((v) => Math.round(v) + "%").join(", ")}">${q.map((v, i) => `<i class="q${i + 1}" style="width:${v}%">${v >= 14 ? Math.round(v) + "%" : ""}</i>`).join("")}</span></li>`;
        }).join("")}</ul>
      </section>

      ${D.fis.length ? `<section class="sec">
        ${tit(`Peso promedio ${D.fis[0].Temporada}`, "peso")}
        <div class="tabla-e-wrap"><table class="tabla-e"><thead><tr><th scope="col" class="izq">Categoría</th><th scope="col">Forwards</th><th scope="col">Backs</th></tr></thead>
          <tbody>${fisCats.map((c) => `<tr><th scope="row" class="izq">${esc(c)}</th><td>${kg(c, "Forward")} kg</td><td>${kg(c, "Back")} kg</td></tr>`).join("")}</tbody></table></div>
      </section>` : ""}`;
  }

  /** el último año del camino a Primera dicho en palabras, comparado con 4 años antes */
  function fraseCamino() {
    const k = "Partidos previos en plantel superior del XV (promedio)";
    const filas = D.camino.filter((r) => r["Año"] >= 2019 && r[k] != null).sort((x, y) => x["Año"] - y["Año"]), u = filas.at(-1);
    if (!u) return "";
    const antes = filas.find((r) => r["Año"] === u["Año"] - 4);
    return `<p class="titular">En ${u["Año"]} debutaron <b>${u["Debutaron en Primera"] ?? 0}</b> en Primera, y los titulares ya tenían <b>${u[k]}</b> partidos cada uno${antes ? ` (en ${antes["Año"]}, ${antes[k]})` : ""}</p>`;
  }

  // consejos
  function vConsejos() {
    const grupo = (tipo, h) => { const it = D.diag.filter((d) => d[0] === tipo); return it.length ? `<h3 class="grupo">${h}</h3><ul class="diag">${it.map(diagItem).join("")}</ul>` : ""; };
    const pri = { Alta: "alta", Media: "media", Baja: "baja" };
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Consejos", "consejos")}</div>
      <section class="sec">
        ${grupo("alerta", "Para trabajar")}${grupo("bien", "Está bien")}${grupo("medir", "Falta medir")}
      </section>
      <section class="sec">
        ${tit("Qué empezar a medir", "medir")}
        <div class="acordeon">${D.medir.map(([q, quien, cada, como, cats]) => `<details><summary><span>${esc(q.split(" (")[0].split(":")[0])}</span></summary>
          <dl class="mini-dl"><div><dt>Qué</dt><dd>${esc(q)}</dd></div><div><dt>Cada cuánto</dt><dd>${esc(cada)}</dd></div><div><dt>Quién</dt><dd>${esc(quien)}</dd></div><div><dt>Cómo</dt><dd>${esc(como)}</dd></div><div><dt>Categorías</dt><dd>${esc(cats)}</dd></div></dl></details>`).join("")}</div>
      </section>
      <section class="sec">
        <h2 class="h2">Para leer más</h2>
        <div class="acordeon">
          <details><summary><span>Qué recomiendan los expertos</span></summary><ul class="expertos">${D.expertos.map(([m, ev, , hacer, prio, fu]) => `<li><b>${esc(m)}</b> <span class="prio prio--${pri[prio] || "media"}">${esc(prio)}</span><p>${esc(ev)} <small>[${esc(fu)}]</small></p>${hacer && hacer !== "-" ? `<p class="expertos__hacer">${esc(hacer)}</p>` : ""}</li>`).join("")}</ul></details>
          <details><summary><span>Fuentes</span></summary><ol class="fuentes-e">${D.fuentes.map(([n, f, u]) => `<li value="${esc(n)}"><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(f)}</a></li>`).join("")}</ol></details>
        </div>
      </section>`;
  }
  const diagItem = ([tipo, t, dato, hacer]) => `<li class="diag__it diag--${tipo}">
    <span class="diag__ic">${IC[tipo]}</span>
    <span class="diag__txt"><b>${esc(t)}</b><span>${esc(dato)}</span><strong>${esc(hacer)}</strong></span></li>`;

  // ---------- videos (Cloudflare R2, los entrega functions/videos solo con la ficha de la clave) ----------
  // Cada video muestra su tapa con un botón grande de play; el video recién se baja al tocarlo, así no gasta datos.
  // En el iPhone lo reproduce el propio teléfono; en el resto, hls.js (web/vendor), que se baja la primera vez que hace falta.
  const durTxt = (s) => s >= 3600 ? `${Math.floor(Math.round(s / 60) / 60)} h ${Math.round(s / 60) % 60} min` // un partido entero
    : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const videosDe = (campo, valor) => Object.entries((D.guia && D.guia.videos) || {}).filter(([, v]) => v[campo].includes(valor)).map(([id, v]) => ({ id, ...v }));
  const tarjetaVideo = (v) => `<figure class="video-ej" data-video="${esc(v.id)}">
      <button type="button" class="video-ej__tapa" data-play="${esc(v.id)}" aria-label="Ver el video: ${esc(v.titulo)} (${durTxt(v.duracion)})">
        <img src="${VACIA}" data-foto="video-${esc(v.id)}" alt="" width="560" height="315"><span class="video-ej__play">${IC.play}</span></button>
      <figcaption><b>${esc(v.titulo)}</b><span class="num">${durTxt(v.duracion)}</span></figcaption></figure>`;
  let hlsProm = null;
  const cargarHls = () => (hlsProm ??= new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = "vendor/hls.light.min.js";
    s.onload = () => ok(window.Hls);
    s.onerror = () => { hlsProm = null; mal(new Error("sin hls.js")); };
    document.head.append(s);
  }));
  const REPRODUCTORES = new Map(); // se sueltan al cambiar de pantalla
  function soltarVideos() { REPRODUCTORES.forEach((h) => h.destroy()); REPRODUCTORES.clear(); }
  async function reproducir(id) {
    const fig = document.querySelector(`.video-ej[data-video="${CSS.escape(id)}"]`);
    const tapa = fig && fig.querySelector(".video-ej__tapa");
    if (!tapa) return;
    const url = `videos/${id}/master.m3u8`, img = tapa.querySelector("img");
    const video = document.createElement("video");
    video.controls = true; video.playsInline = true; video.setAttribute("playsinline", ""); video.preload = "auto";
    if (img && img.src.startsWith("data:image/webp")) video.poster = img.src;
    const aviso = (txt) => { fig.querySelector(".video-ej__error")?.remove(); fig.insertAdjacentHTML("beforeend", `<p class="video-ej__error" role="alert">${txt}</p>`); };
    // quien guardó la clave antes de que hubiera videos no tiene la ficha: con un toque la vuelve a poner
    const sinPermiso = () => aviso(`Para ver los videos hay que volver a poner la clave. <button type="button" class="link" data-reclave>Poner la clave</button>`);
    const NO_ABRE = "No se pudo abrir el video. Revisá la señal y probá de nuevo.";
    tapa.replaceWith(video);
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      // el reproductor del iPhone no dice por qué falló: se le pregunta a la web
      video.addEventListener("error", () => fetch(url, { cache: "no-store" }).then((r) => (r.status === 403 ? sinPermiso() : aviso(NO_ABRE)), () => aviso(NO_ABRE)), { once: true });
    } else {
      try {
        const Hls = await cargarHls();
        if (!Hls.isSupported()) return aviso("Este navegador no puede mostrar el video. Probá con Chrome o Safari.");
        const h = new Hls({ capLevelToPlayerSize: true });
        h.on(Hls.Events.ERROR, (_e, d) => {
          if (!d.fatal) return;
          if (d.response && d.response.code === 403) sinPermiso(); else aviso(NO_ABRE);
          h.destroy(); REPRODUCTORES.delete(id);
        });
        h.loadSource(url); h.attachMedia(video); REPRODUCTORES.set(id, h);
      } catch (e) { return aviso("No se pudo cargar el reproductor. Revisá la señal y probá de nuevo."); }
    }
    video.play().catch(() => { /* si el teléfono no deja arrancar solo, queda el botón de play del video */ });
  }

  // ---------- ejercicios: line, maul y los juegos de las planificaciones ----------
  // Pensado para usar en la cancha con el celular: filtros grandes arriba, una fila por ejercicio y, al tocarlo,
  // el ejercicio en pantalla completa con "Anterior / Siguiente" para recorrerlos con una mano.
  const TIPOS_EJ = [["todos", "Todos"], ["line", "Line"], ["maul", "Maul"], ["juegos", "Juegos"]];
  const ROLES_LINE = ["Lanzador", "Saltador", "Levantador", "Tríos"];
  const tabEj = () => (["line", "maul", "juegos"].includes(S.tab) ? S.tab : "todos");
  /** los ejercicios que se ven con los filtros de arriba (sin contar lo que se escribe en el buscador), en el orden de la lista */
  /** el texto en el que busca el buscador de ejercicios */
  const textoEj = (e) => norm([e.nombre, e.grupo, e.tipo, e.material, ...e.foco, ...e.como, videosDe("ejercicios", e.id).length ? "video" : ""].join(" "));
  const ejLista = () => D.guia.ejercicios.filter((e) => {
    const tab = tabEj();
    if (tab !== "todos" && norm(e.tipo) !== tab) return false;
    if (tab === "line" && S.rol && e.grupo !== S.rol) return false;
    return !S.para || e.cats.includes(S.para);
  });

  function vEjercicios() {
    const tab = tabEj(), grupos = [];
    ejLista().forEach((e) => {
      const k = `${e.tipo} · ${e.grupo}`;
      let gr = grupos.find((x) => x.k === k);
      if (!gr) grupos.push((gr = { k, items: [] }));
      gr.items.push(e);
    });
    const fila = (e) => `<li data-q="${esc(textoEj(e))}">
      <button type="button" class="ej${e.paso ? "" : " ej--sin-paso"}" data-ir-ej="${esc(e.id)}">
        ${e.paso ? `<span class="ej__paso num">${e.paso}</span>` : ""}
        <span class="ej__txt"><b>${esc(e.nombre)}</b>${e.foco[0] ? `<small>${conCantos(e.foco[0])}</small>` : ""}${e.material ? `<span class="ej__mat">${IC.cono}${esc(e.material)}</span>` : ""}${e.dibujo ? `<span class="ej__video">${IC.cono}Con dibujo</span>` : ""}${videosDe("ejercicios", e.id).length ? `<span class="ej__video">${IC.play}Con video</span>` : ""}</span>
        ${IC.adelante}</button></li>`;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Ejercicios", "ejercicios")}</div>
      ${pestanas(TIPOS_EJ, tab)}
      ${tab === "line" ? `<div class="chips-g" role="group" aria-label="Rol en el line">${[["", "Todos"], ...ROLES_LINE.map((r) => [r, r])].map(([v, l]) =>
        `<button type="button" data-rol="${v}" aria-pressed="${(S.rol || "") === v}">${l}</button>`).join("")}</div>` : ""}
      ${S.para ? `<p class="filtro-g"><span>Solo los juegos que usan en <b>${esc(S.para)}</b></span><button type="button" class="link" data-quitar-para>Ver todos</button></p>` : ""}
      <section class="sec sec--pegada">
        <label class="buscar-g"><span class="sr">Buscar un ejercicio</span>${IC.buscar}<input type="search" id="buscar-ej" value="${esc(S.qe)}" placeholder="Buscar: salto, tackle, conos…" autocomplete="off" enterkeyhint="search"></label>
        ${grupos.map((gr) => `<div class="grupo-ej"><div class="grupo-ej__cab"><h3 class="grupo-cat__tit">${esc(gr.k)}</h3>${cuenta(gr.items.length, gr.items[0].tipo === "Juegos" ? ["juego", "juegos"] : ["ejercicio", "ejercicios"])}</div>
          <ul class="filas-cat">${gr.items.map(fila).join("")}</ul></div>`).join("")}
        <p class="vacio-g" id="sin-ej" hidden>No hay ningún ejercicio con esa palabra.</p>
      </section>`;
    filtrarEj();
  }
  function filtrarEj() {
    const q = norm((S.qe || "").trim());
    let n = 0;
    document.querySelectorAll(".grupo-ej").forEach((gr) => {
      let vis = 0;
      gr.querySelectorAll("li[data-q]").forEach((li) => { const ok = !q || li.dataset.q.includes(q); li.hidden = !ok; vis += ok; });
      gr.hidden = !vis; n += vis;
      contar(gr, q, vis);
    });
    const v = $("#sin-ej");
    if (v) v.hidden = n > 0;
  }

  // un ejercicio en pantalla completa
  // ---------- el dibujo de un ejercicio, como las fichas de World Rugby (T1 Rugby) y de la RFL ----------
  // La cancha vista desde arriba (con sus medidas, si el ejercicio las dice), el ataque en azul y la defensa en rojo,
  // carrera = flecha llena, pase = flecha punteada, patada = punteada y curva; el ejercicio en cuadros, paso a paso,
  // y abajo la leyenda (solo con lo que se usa). Los dibujos salen de diagramas_entrenadores.py.
  const DIB = { pasto: "#3d8b4f", raya: "#ffffff", ataque: "#1b5fd1", defensa: "#d9483b", entrenador: "#f5c518", cono: "#ff8a1f", escudo: "#23262d", tinta: "#0b0d12", suave: "#545d6e" };
  let dibN = 0; // para que cada cuadro tenga sus propias puntas de flecha
  /** un cuadro del ejercicio, en SVG. "medidas": los metros a los costados (solo en el primero) */
  function cuadroSVG(dib, c, medidas) {
    const [w, h] = dib.cancha, K = 10, W0 = w * K, H0 = h * K;
    // el tamaño de jugadores y conos no depende del tamaño de la cancha: se ve parecido en una de 8 m y en una de 36 m
    const u = 1 / Math.min(330 / (W0 + 40), 440 / (H0 + 40)), M = 20 * u, W = W0 + 2 * M, H = H0 + 2 * M;
    const X = (x) => +(M + x * K).toFixed(1), Y = (y) => +(M + y * K).toFixed(1), n = ++dibN;
    const linea = (pts, cls) => {
      const p = pts.map(([x, y]) => [X(x), Y(y)]);
      // carrera: llena y oscura; pase y patada: punteadas y blancas (como en las fichas de World Rugby y de la RFL)
      const at = `stroke="${cls === "corre" ? DIB.tinta : DIB.raya}"${cls === "corre" ? "" : ` stroke-dasharray="${(5 * u).toFixed(1)} ${(4 * u).toFixed(1)}"`} marker-end="url(#d${n}-${cls})"`;
      if (cls === "patea" && p.length === 2) { // la patada va en curva
        const [[x1, y1], [x2, y2]] = p, mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
        return `<path d="M${x1} ${y1} Q${(mx - dy * 0.3).toFixed(1)} ${(my + dx * 0.3).toFixed(1)} ${x2} ${y2}" ${at}/>`;
      }
      const d = p.length === 3 ? `M${p[0]} Q${p[1]} ${p[2]}` : `M${p.map((q) => q.join(" ")).join(" L")}`;
      return `<path d="${d}" ${at}/>`;
    };
    const jug = ([x, y, t], col) => `<g class="d-jug"><circle cx="${X(x)}" cy="${Y(y)}" r="${8 * u}" fill="${col}" stroke="#fff" stroke-width="${1.6 * u}"/>${t ? `<text x="${X(x)}" y="${Y(y)}" font-size="${(t.length > 1 ? 7.5 : 9) * u}">${esc(t)}</text>` : ""}</g>`;
    const punta = (cls, col) => `<marker id="d${n}-${cls}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${col}"/></marker>`;
    const s = (k) => c[k] || [];
    return `<svg viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" role="img" aria-label="${esc(c.txt || "Dibujo del ejercicio")}">
      <defs>${punta("corre", DIB.tinta)}${punta("pasa", DIB.raya)}${punta("patea", DIB.raya)}
        <pattern id="d${n}-ray" width="${6 * u}" height="${6 * u}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${6 * u}" height="${6 * u}" fill="none"/><line x1="0" y1="0" x2="0" y2="${6 * u}" stroke="#fff" stroke-opacity=".35" stroke-width="${2 * u}"/></pattern></defs>
      <rect x="${M}" y="${M}" width="${W0}" height="${H0}" rx="${3 * u}" fill="${DIB.pasto}"/>
      <rect x="${M}" y="${M}" width="${W0}" height="${H0}" rx="${3 * u}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="${1.2 * u}"/>
      ${medidas && dib.medidas ? `<g class="d-med" font-size="${9 * u}"><line x1="${M}" y1="${H - 8 * u}" x2="${M + W0}" y2="${H - 8 * u}"/><text x="${M + W0 / 2}" y="${H - 11 * u}">${w} m</text>
        <line x1="${8 * u}" y1="${M}" x2="${8 * u}" y2="${M + H0}"/><text x="${11 * u}" y="${M + H0 / 2}" transform="rotate(-90 ${11 * u} ${M + H0 / 2})">${h} m</text></g>` : ""}
      ${s("area").map(([x, y, aw, ah, t]) => `<rect class="d-area" x="${X(x)}" y="${Y(y)}" width="${aw * K}" height="${ah * K}" fill="url(#d${n}-ray)" stroke-width="${1.2 * u}"/>${t ? `<text class="d-txt" x="${X(x) + 4 * u}" y="${Y(y) + 10 * u}" font-size="${8 * u}" text-anchor="start">${esc(t)}</text>` : ""}`).join("")}
      ${s("lin").map(([x1, y1, x2, y2, t]) => `<line class="d-lin" x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}" stroke-width="${1.6 * u}"/>${t ? `<text class="d-txt" x="${X(x1) + 4 * u}" y="${Y(y1) + (y1 === y2 ? -4 : 12) * u}" font-size="${9 * u}" text-anchor="start">${esc(t)}</text>` : ""}`).join("")}
      ${s("escalera").map(([x, y, l]) => `<g class="d-esc"><rect x="${X(x) - 0.48 * K}" y="${Y(y)}" width="${0.96 * K}" height="${l * K}" fill="none" stroke-width="${1.4 * u}"/>${Array.from({ length: Math.floor(l / 0.6) }, (_, i) => `<line x1="${X(x) - 0.48 * K}" x2="${X(x) + 0.48 * K}" y1="${Y(y + 0.6 * (i + 1))}" y2="${Y(y + 0.6 * (i + 1))}" stroke-width="${1.2 * u}"/>`).join("")}</g>`).join("")}
      ${s("conos").map(([x, y]) => `<path class="d-cono" d="M${X(x)} ${Y(y) - 5 * u}L${X(x) + 4.5 * u} ${Y(y) + 3.5 * u}L${X(x) - 4.5 * u} ${Y(y) + 3.5 * u}z" stroke-width="${0.8 * u}"/>`).join("")}
      ${s("esc").map(([x, y]) => `<rect class="d-escudo" x="${X(x) - 8 * u}" y="${Y(y) - 3.5 * u}" width="${16 * u}" height="${7 * u}" rx="${2 * u}" stroke-width="${0.8 * u}"/>`).join("")}
      <g stroke-width="${2 * u}" fill="none" stroke-linecap="round" stroke-linejoin="round">${s("corre").map((p) => linea(p, "corre")).join("")}${s("pasa").map((p) => linea(p, "pasa")).join("")}${s("patea").map((p) => linea(p, "patea")).join("")}</g>
      ${s("a").map((j) => jug(j, DIB.ataque)).join("")}${s("d").map((j) => jug(j, DIB.defensa)).join("")}
      ${s("e").map(([x, y]) => `<g class="d-jug"><rect x="${X(x) - 7 * u}" y="${Y(y) - 7 * u}" width="${14 * u}" height="${14 * u}" rx="${2 * u}" fill="${DIB.entrenador}" stroke="${DIB.tinta}" stroke-width="${1 * u}"/><text x="${X(x)}" y="${Y(y)}" font-size="${8.5 * u}" fill="${DIB.tinta}">E</text></g>`).join("")}
      ${s("p").map(([x, y]) => `<ellipse class="d-pelota" cx="${X(x)}" cy="${Y(y)}" rx="${4.6 * u}" ry="${3.1 * u}" transform="rotate(-30 ${X(x)} ${Y(y)})" stroke-width="${1 * u}"/>`).join("")}
      ${s("rot").map(([x, y, t]) => `<text class="d-txt" x="${X(x)}" y="${Y(y)}" font-size="${10 * u}">${esc(t)}</text>`).join("")}
    </svg>`;
  }
  /** un ícono chico para la leyenda */
  const iconoLey = (k) => `<svg viewBox="0 0 28 16" aria-hidden="true">${({
    a: `<circle cx="14" cy="8" r="6" fill="${DIB.ataque}"/>`, d: `<circle cx="14" cy="8" r="6" fill="${DIB.defensa}"/>`,
    e: `<rect x="8" y="2" width="12" height="12" rx="2" fill="${DIB.entrenador}" stroke="${DIB.tinta}"/>`,
    p: `<ellipse cx="14" cy="8" rx="6" ry="4" transform="rotate(-30 14 8)" fill="#fff" stroke="${DIB.tinta}"/>`,
    conos: `<path d="M14 2L20 13H8z" fill="${DIB.cono}" stroke="${DIB.tinta}" stroke-width=".8"/>`,
    esc: `<rect x="5" y="4.5" width="18" height="7" rx="2" fill="${DIB.escudo}"/>`,
    escalera: `<rect x="9" y="1" width="10" height="14" fill="none" stroke="${DIB.tinta}"/><path d="M9 5.5h10M9 10h10" stroke="${DIB.tinta}"/>`,
    area: `<rect x="3" y="3" width="22" height="10" fill="#e8eef9" stroke="${DIB.suave}" stroke-dasharray="3 2"/>`,
    corre: `<path d="M2 8h20" stroke="${DIB.tinta}" stroke-width="2"/><path d="M20 4l6 4-6 4z" fill="${DIB.tinta}"/>`,
    pasa: `<path d="M2 8h18" stroke="${DIB.tinta}" stroke-width="2" stroke-dasharray="3 3"/><path d="M20 4l6 4-6 4z" fill="${DIB.tinta}"/>`,
    patea: `<path d="M2 13Q12 0 21 9" fill="none" stroke="${DIB.tinta}" stroke-width="2" stroke-dasharray="3 3"/><path d="M19 5l6 6-7 1z" fill="${DIB.tinta}"/>`,
  })[k]}</svg>`;
  const LEY = [["a", "Ataque"], ["d", "Defensa"], ["e", "Entrenador"], ["p", "Pelota"], ["conos", "Cono"], ["esc", "Escudo o bolsa"],
    ["escalera", "Escalera"], ["area", "Área"], ["corre", "Carrera"], ["pasa", "Pase"], ["patea", "Patada"]];
  /** el dibujo entero: los cuadros paso a paso (numerados si son varios) y la leyenda */
  function dibujoHTML(dib) {
    const cs = dib.cuadros, usa = (k) => cs.some((c) => c[k] && c[k].length);
    const letras = Object.entries(dib.letras || {}).filter(([l]) => cs.some((c) => [...(c.a || []), ...(c.d || [])].some((j) => j[2] === l)));
    return `<div class="dib">
      <div class="dib__cuadros dib__cuadros--${cs.length}">${cs.map((c, i) => `<figure>${cuadroSVG(dib, c, i === 0)}
        ${c.txt ? `<figcaption>${cs.length > 1 ? `<b class="num">${i + 1}</b>` : ""}<span>${esc(c.txt)}</span></figcaption>` : ""}</figure>`).join("")}</div>
      <ul class="dib__ley">${LEY.filter(([k]) => usa(k)).map(([k, t]) => `<li>${iconoLey(k)}${t}</li>`).join("")}
        ${letras.map(([l, t]) => `<li><b class="dib__letra">${esc(l)}</b>${esc(t)}</li>`).join("")}</ul>
    </div>`;
  }

  function vEjercicio() {
    const todos = D.guia.ejercicios, e = todos.find((x) => x.id === S.ej);
    // se recorre la misma lista que se estaba mirando (si se entró con un link directo, todos)
    const q = norm((S.qe || "").trim()), vistos = ejLista().filter((x) => !q || textoEj(x).includes(q));
    const orden = vistos.some((x) => x.id === e.id) ? vistos : todos, j = orden.findIndex((x) => x.id === e.id);
    const total = todos.filter((x) => x.tipo === e.tipo && x.grupo === e.grupo).length;
    const salto = (k, der) => {
      const ok = k >= 0 && k < orden.length;
      return `<button type="button"${ok ? ` data-lado data-ir-ej="${esc(orden[k].id)}" aria-label="${der ? "Siguiente" : "Anterior"}: ${esc(orden[k].nombre)}"` : " disabled"}>${der ? "" : IC.atras}<span>${der ? "Siguiente" : "Anterior"}</span>${der ? IC.adelante : ""}</button>`;
    };
    const bloque = (t, h) => `<h3 class="grupo">${t}</h3>${h}`, vids = videosDe("ejercicios", e.id);
    // la ficha, en el orden de las de World Rugby: qué se aprende y cómo se organiza, el dibujo paso a paso,
    // cómo se juega y los puntos clave. Sin dibujo (técnica del cuerpo), el video va primero
    const juego = e.tipo === "Juegos", dib = e.dibujo;
    const org = [juego && e.foco[0] ? ["Qué se aprende", e.foco[0]] : null, dib && dib.jugadores ? ["Jugadores", dib.jugadores] : null,
      e.material ? ["Material", e.material] : null].filter(Boolean);
    const vidHTML = vids.length ? bloque(vids.length === 1 ? "Video" : "Videos", `<div class="videos-ej">${vids.map(tarjetaVideo).join("")}</div>`) : "";
    $("#vista").innerHTML = `
      <div class="cab">
        <div class="cab__fila">${volver("Ejercicios", { ver: "ejercicios", ej: null })}
          <div class="saltos saltos--ej" role="group" aria-label="Otros ejercicios">${salto(j - 1)}${salto(j + 1, true)}</div></div>
        <p class="ej-tag">${esc(e.tipo)} · ${esc(e.grupo)}${e.paso ? ` · paso ${e.paso} de ${total}` : ""}</p>
        <h2 class="ej-tit">${esc(e.nombre)}</h2>
      </div>
      <section class="sec sec--pegada ej-det">
        ${org.length ? `<dl class="ficha-org">${org.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
        ${dib ? `<div class="dib-cab"><span class="dib-cab__t"><h3 class="grupo">El dibujo</h3>${ayudaBtn("dibujo")}</span>${dib.revisar ? `<span class="chip chip--revisar">Para revisar</span>` : ""}</div>${dibujoHTML(dib)}` : vidHTML}
        ${e.como.length ? bloque(juego ? "Cómo se juega" : "Cómo se hace", `<div class="txt-g">${e.como.map((x) => `<p>${conCantos(x)}</p>`).join("")}</div>`) : ""}
        ${!juego && e.foco.length ? bloque("Puntos clave", lista(e.foco, "check-g")) : ""}
        ${dib ? vidHTML : ""}
        ${e.fotos.length ? bloque("Fotos", `<div class="fotos-ej">${e.fotos.map((f, n) =>
          `<figure><img src="${VACIA}" data-foto="${esc(f)}" alt="Foto ${n + 1} de la actividad «${esc(e.nombre)}»" width="560" height="340" decoding="async"></figure>`).join("")}</div>`) : ""}
        ${e.cats.length ? bloque("Lo usan en", `<p class="claves-g">${e.cats.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</p>`) : ""}
      </section>`;
  }

  // mientras se abren las fotos, cada lugar muestra una imagen transparente sobre el fondo gris (nunca un cuadro roto)
  const VACIA = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  // las fotos van cifradas en un archivo aparte: se bajan y se abren (con la misma llave) la primera vez que hacen falta
  let fotosProm = null;
  const fotos = () => (fotosProm ??= fetch("entrenadores.fotos.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then(async (f) => {
      const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(f.iv) }, LLAVE_ACTUAL, deB64(f.datos));
      return JSON.parse(await new Response(new Blob([plano]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
    })
    .catch(() => { fotosProm = null; return {}; }));
  function ponerFotos() {
    const imgs = document.querySelectorAll("img[data-foto]");
    if (!imgs.length) return;
    // una foto que falta se saca; un video sin tapa queda igual (fondo oscuro con el play)
    fotos().then((f) => imgs.forEach((img) => { if (f[img.dataset.foto]) img.src = f[img.dataset.foto]; else if (!img.closest(".video-ej")) img.closest("figure").remove(); }));
  }

  // ---------- guía del club (material de Coordinación de Rugby) ----------
  const gCats = () => [...D.guia.infantiles, ...D.guia.juveniles].map((c) => c.cat);
  const gDe = (cat) => D.guia.infantiles.find((c) => c.cat === cat) || D.guia.juveniles.find((c) => c.cat === cat);
  const esInf = (cat) => D.guia.infantiles.some((c) => c.cat === cat);
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  /** los cantos del club que aparecen en un texto se resaltan (MALÓN, CONTROL…) */
  let reCantos;
  const conCantos = (txt) => {
    reCantos ??= new RegExp(`(^|[^\\p{L}])(${D.guia.cantos.map((c) => c[2]).sort((a, b) => b.length - a.length).join("|")})(?![\\p{L}])`, "gu");
    return esc(txt).replace(reCantos, '$1<b class="canto-i">$2</b>');
  };
  /** texto de las planillas: viñetas, párrafos y subtítulos */
  function textoHTML(bl) {
    let h = "", ul = false;
    for (const [t, x] of bl) {
      if (t === "li") { h += `${ul ? "" : '<ul class="txt-g__ul">'}<li>${conCantos(x)}</li>`; ul = true; continue; }
      if (ul) { h += "</ul>"; ul = false; }
      h += t === "h" ? `<h4 class="txt-g__h">${esc(x)}</h4>` : `<p>${conCantos(x)}</p>`;
    }
    return `<div class="txt-g">${h}${ul ? "</ul>" : ""}</div>`;
  }
  const lista = (items, cls = "txt-g__ul") => `<ul class="${cls}">${items.map((x) => `<li>${conCantos(x)}</li>`).join("")}</ul>`;
  const scrumDe = (cat) => {
    const e = D.guia.scrum.edades;
    return e.find((x) => x[0] === cat) || (+cat.slice(1) >= 15 ? e.find((x) => x[0].startsWith("M15")) : null);
  };
  const pestanas = (tabs, sel) => `<div class="seg seg--g${tabs.length === 4 ? " seg--4" : ""}" role="group" aria-label="Qué ver">${tabs.map(([k, l]) =>
    `<button type="button" data-tab="${k}" aria-pressed="${k === sel}">${l}</button>`).join("")}</div>`;

  function vGuia() { return S.gcat ? vGuiaCat() : vGuiaLista(); }

  // la lista de categorías, con su frase guía
  function vGuiaLista() {
    const g = D.guia;
    // una fila por categoría, igual que en el inicio: el nombre y su frase guía
    const fila = (c, txt) => `<li><button type="button" class="fila-cat fila-cat--inf" data-ir-guia="${esc(c.cat)}">
        <span class="fila-cat__nom">${esc(c.cat)}${c.apodo ? `<small>${esc(c.apodo)}</small>` : ""}</span>
        <span class="fila-cat__etapa">${txt}</span>${IC.adelante}</button></li>`;
    const grupo = (titulo, filas) => `<div class="grupo-cat"><div class="grupo-cat__cab"><h3 class="grupo-cat__tit">${titulo}</h3></div><ul class="filas-cat">${filas}</ul></div>`;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Qué aprende cada categoría", "guiaCats")}</div>
      <section class="sec sec--pegada">
        ${grupo("Infantiles", g.infantiles.map((c) => fila(c, `“${esc(c.semillas.ataque[0] || "")}”`)).join(""))}
        ${grupo("Juveniles", g.juveniles.map((c) => fila(c, esc(g.lemas_juv[c.cat] || ""))).join(""))}
      </section>
      <section class="sec">
        <h2 class="h2">En infantiles, siempre</h2>
        ${lista(g.valores, "check-g")}
      </section>
      <section class="sec">
        <h2 class="h2">Lo que tiene que saber al llegar a M13</h2>
        ${lista(g.llegar_m13, "check-g")}
      </section>`;
  }

  // una categoría: frases guía, cómo son, ataque, defensa, qué cambia y qué evitar
  /** en la guía de una categoría: los juegos que usan en esa categoría, o (juveniles) los ejercicios de line y maul */
  function atajoEj(cat) {
    if (!D.guia.ejercicios) return "";
    const jg = D.guia.ejercicios.filter((e) => e.cats.includes(cat)).length;
    return jg ? `<button type="button" class="atajo" data-ir-ej-para="${esc(cat)}">${IC.cono}<span>Juegos que usan en ${esc(cat)} (${jg})</span>${IC.adelante}</button>`
      : esInf(cat) ? "" : `<button type="button" class="atajo" data-ir-ej-tab="todos">${IC.cono}<span>Ejercicios de line y maul</span>${IC.adelante}</button>`;
  }
  function vGuiaCat() {
    const g = D.guia, cat = S.gcat, c = gDe(cat), cats = gCats(), i = cats.indexOf(cat), inf = esInf(cat), sc = scrumDe(cat);
    const salto = (j, lbl) => {
      const ok = j >= 0 && j < cats.length;
      return `<button type="button" data-lado data-ir-guia="${ok ? esc(cats[j]) : ""}"${ok ? ` aria-label="${lbl}: ${esc(cats[j])}"` : " disabled"}>${j < i ? IC.atras : ""}<span>${ok ? esc(cats[j]) : ""}</span>${j > i ? IC.adelante : ""}</button>`;
    };
    // las frases guía de infantiles van entre comillas (son textuales); el resumen de juveniles no
    const semilla = (lbl, frases, comillas = true) => frases.length ? `<div class="semilla"><span class="semilla__lbl">${lbl}</span>${frases.map((f) =>
      `<b class="semilla__txt">${comillas ? `“${esc(f)}”` : esc(f)}</b>`).join("")}</div>` : "";
    const secciones = inf
      ? [["como", "Cómo son a esta edad", c.como_son], ["objetivo", "Qué buscamos", c.objetivo], ["ataque", "En ataque", c.ataque],
        ["defensa", "En defensa", c.defensa], ["progresion", `Qué cambia desde ${i > 0 ? cats[i - 1] : ""}`, c.progresion]]
      : [["ataque", "En ataque", c.ataque.concat(c.ataque_ojo.length ? [["h", "Atención"], ...c.ataque_ojo] : [])],
        ["defensa", "En defensa", c.defensa.concat(c.defensa_ojo.length ? [["h", "Atención"], ...c.defensa_ojo] : [])]];
    $("#vista").innerHTML = `
      <div class="cab">
        ${volver("Todas las categorías", "guia")}
        <div class="cab__fila">
          <h2 class="cab__cat">${esc(cat)}${c.apodo ? `<small>${esc(c.apodo)}</small>` : ""}${ayudaBtn("guiaCat")}</h2>
          <div class="saltos" role="group" aria-label="Otras categorías">${salto(i - 1, "Categoría anterior")}${salto(i + 1, "Categoría siguiente")}</div>
        </div>
        ${c.etapa ? `<p class="etapa">${esc(c.etapa)}</p>` : ""}
      </div>

      <section class="sec sec--pegada">
        ${inf
          ? `<div class="semillas">${semilla("En ataque", c.semillas.ataque)}${semilla("En defensa", c.semillas.defensa)}</div>`
          : `<div class="semillas semillas--una">${semilla("En pocas palabras", [g.lemas_juv[cat]].filter(Boolean), false)}</div>
             <h3 class="grupo">Palabras clave de juveniles</h3>
             <p class="claves-g"><span class="claves-g__lbl">Ataque</span>${g.claves.ataque.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</p>
             <p class="claves-g"><span class="claves-g__lbl">Defensa</span>${g.claves.defensa.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</p>`}
        ${sc ? `<button type="button" class="atajo" data-ir="scrum">${IC.escudo}<span><b>Scrum en ${esc(cat)}:</b> ${esc(sc[1])}${sc[2] ? ` ${esc(sc[2])}` : ""}</span>${IC.adelante}</button>` : ""}
        ${atajoEj(cat)}
        ${atajoPr(cat)}
        ${atajoAsis(cat)}
        ${D.cats.includes(cat) ? `<button type="button" class="atajo" data-ir-cat="${esc(cat)}">${IC.barras}<span>Cómo le fue a ${esc(cat)} en los partidos</span>${IC.adelante}</button>` : ""}
      </section>

      <section class="sec desplegables">
        ${secciones.filter(([, , bl]) => bl.length).map(([id, t, bl]) => desple(`g-${id}`, t, textoHTML(bl))).join("")}
      </section>

      ${inf && c.evitar.length ? `<section class="sec">
        <h2 class="h2">Lo que hay que evitar</h2>
        <ul class="evitar-g">${c.evitar.map(([, x]) => `<li>${IC.alerta}<span>${conCantos(x)}</span></li>`).join("")}</ul>
      </section>` : ""}`;
  }

  /** la cancha vista desde arriba, atacando hacia arriba: las 4 zonas (a lo largo) o los 4 canales (a lo ancho) */
  function cancha(modo) {
    const W = 240, H = 400, x0 = 12, x1 = W - 12, u = (H - 8) / 120, y = (m) => 4 + m * u, cx = W / 2;
    // metros desde la línea de pelota muerta rival: ingoal rival 0-10, 22 rival 32, 10 rival 50, mitad 60, nuestros 10 70, nuestras 22 88, ingoal 110-120
    // zona: [desde, hasta, dónde va el nombre] (el de la amarilla va arriba de los 10 rivales para no quedar sobre la línea)
    const zonas = { verde: [10, 32, 21], amarilla: [32, 70, 41], azul: [70, 88, 79], roja: [88, 110, 99] };
    let h = `<svg class="cancha" viewBox="0 0 ${W} ${H}" role="img" aria-label="${modo === "zonas"
      ? "Cancha atacando hacia arriba. Desde nuestro ingoal: zona roja hasta nuestras 22, zona azul hasta nuestros 10, zona amarilla hasta las 22 rivales y zona verde hasta el ingoal rival."
      : "Cancha vista desde arriba con los 4 canales a lo ancho, numerados del 1 al 4."}">`;
    h += `<rect class="cancha__piso" x="${x0}" y="${y(0)}" width="${x1 - x0}" height="${y(120) - y(0)}" rx="6"/>`;
    if (modo === "zonas") {
      for (const [k, [a, b, t]] of Object.entries(zonas)) {
        h += `<rect class="cancha__z cancha__z--${k}" x="${x0}" y="${y(a)}" width="${x1 - x0}" height="${y(b) - y(a)}"/>`;
        h += `<text class="cancha__t${k === "amarilla" ? " cancha__t--osc" : ""}" x="${cx}" y="${y(t) + 6}">${k.toUpperCase()}</text>`;
      }
    } else {
      const an = (x1 - x0) / 4;
      for (let k = 0; k < 4; k++) {
        h += `<rect class="cancha__c cancha__c--${k + 1}" x="${x0 + an * k}" y="${y(10)}" width="${an}" height="${y(110) - y(10)}"/>`;
        h += `<circle class="cancha__nc" cx="${x0 + an * (k + 0.5)}" cy="${y(41)}" r="15"/><text class="cancha__n" x="${x0 + an * (k + 0.5)}" y="${y(41) + 6}">${k + 1}</text>`;
      }
    }
    [[10, ""], [32, "22"], [50, "10"], [60, "50"], [70, "10"], [88, "22"], [110, ""]].forEach(([m, n]) => {
      h += `<line class="cancha__l${n === "10" ? " cancha__l--p" : ""}" x1="${x0}" x2="${x1}" y1="${y(m)}" y2="${y(m)}"/>`;
      // el número va arriba de la línea: de los 10 rivales a nuestros 10 cae sobre la zona amarilla, donde el blanco no se lee
      if (n) h += `<text class="cancha__m${modo === "zonas" && m >= 50 && m <= 70 ? " cancha__m--osc" : ""}" x="${x0 + 5}" y="${y(m) - 4}">${n}</text>`;
    });
    [10, 110].forEach((m) => { h += `<path class="cancha__palos" d="M${cx - 8} ${y(m) - 7}V${y(m) + 7}M${cx + 8} ${y(m) - 7}V${y(m) + 7}M${cx - 8} ${y(m)}H${cx + 8}"/>`; });
    h += `<text class="cancha__ig" x="${cx}" y="${y(5) + 4}">Ingoal rival</text><text class="cancha__ig" x="${cx}" y="${y(115) + 4}">Nuestro ingoal</text>`;
    return h + "</svg>";
  }

  // cantos, zonas de la cancha y cómo decidimos
  function vCantos() {
    const g = D.guia, tab = ["cantos", "zonas", "decisiones"].includes(S.tab) ? S.tab : "cantos";
    let cuerpo;
    if (tab === "cantos") {
      cuerpo = `<section class="sec sec--pegada">
        <label class="buscar-g"><span class="sr">Buscar un canto</span>${IC.buscar}<input type="search" id="buscar-canto" value="${esc(S.q)}" placeholder="Buscar: tren, pick and go, lado…" autocomplete="off" enterkeyhint="search"></label>
        ${["Ataque", "Lados", "Defensa"].map((gr) => `<div class="cantos-g"><h3 class="grupo">${gr}</h3><ul class="cantos">${g.cantos.filter((x) => x[0] === gr).map(([, sit, cod, sig]) =>
          `<li data-q="${esc(norm(`${cod} ${sit} ${sig} ${gr}`))}"><span class="canto__cod">${esc(cod)}</span>${sit !== gr ? `<span class="chip chip--gris">${esc(sit)}</span>` : ""}<p>${esc(sig)}</p></li>`).join("")}</ul></div>`).join("")}
        <p class="vacio-g" id="sin-cantos" hidden>No hay ningún canto con esa palabra.</p>
      </section>`;
    } else if (tab === "zonas") {
      const items = (t, l) => l.length ? `<h4 class="txt-g__h">${t}</h4>${lista(l)}` : "";
      cuerpo = `<section class="sec sec--pegada">
        <h2 class="h2">Las 4 zonas</h2>
        <div class="cancha-g">${cancha("zonas")}
          <ul class="zonas-g">${g.zonas.slice().reverse().map(([k, rango, nombre, con, sin]) => `<li class="zona-g zona-g--${k}">
            <b class="zona-g__nom">Zona ${k}</b><span class="zona-g__sub">${esc(nombre)} · ${esc(rango)}</span>
            ${items("Con pelota", con)}${items("Sin pelota", sin)}</li>`).join("")}</ul>
        </div>
      </section>
      <section class="sec">
        <h2 class="h2">Los 4 canales</h2>
        <div class="cancha-g">${cancha("canales")}
          <ol class="canales-g">${g.canales.map((x, i) => `<li><span class="canales-g__n">${i + 1}</span>${esc(x)}</li>`).join("")}</ol>
        </div>
      </section>`;
    } else {
      cuerpo = `<section class="sec sec--pegada">
        <div class="semillas">${[["ataque", "Con pelota"], ["defensa", "Sin pelota"]].map(([k, lbl]) => `<div class="semilla"><span class="semilla__lbl">${lbl}</span>
          <b class="semilla__txt">${esc(g.filosofia[k][0])}</b><p>${esc(g.filosofia[k][1])}</p></div>`).join("")}</div>
      </section>
      <section class="sec">
        <h2 class="h2">¿Cuándo hay oportunidad?</h2>
        ${lista(g.oportunidad, "check-g")}
      </section>
      <section class="sec">
        <h2 class="h2">Qué decidimos</h2>
        <h3 class="grupo">En ataque</h3><div class="txt-g">${lista(g.decisiones.ataque)}</div>
        <h3 class="grupo">En defensa</h3><div class="txt-g">${lista(g.decisiones.defensa)}</div>
      </section>
      <section class="sec">
        <h2 class="h2">Los 5 pilares del club</h2>
        <ul class="pilares-g">${g.pilares.map(([p, t]) => `<li><b>${esc(p)}</b><span>${esc(t)}</span></li>`).join("")}</ul>
      </section>`;
    }
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Cantos y zonas", "cantos")}</div>
      ${pestanas([["cantos", "Cantos"], ["zonas", "Zonas"], ["decisiones", "Modelo"]], tab)}
      ${cuerpo}`;
    if (tab === "cantos") filtrarCantos();
  }
  function filtrarCantos() {
    const q = norm(S.q.trim());
    let n = 0;
    document.querySelectorAll(".cantos-g").forEach((gr) => {
      let vis = 0;
      gr.querySelectorAll("li[data-q]").forEach((li) => { const ok = !q || li.dataset.q.includes(q); li.hidden = !ok; vis += ok; });
      gr.hidden = !vis; n += vis;
      contar(gr, q, vis);
    });
    const v = $("#sin-cantos");
    if (v) v.hidden = n > 0;
  }

  // scrum: regla de oro, qué se hace en cada edad, el set up y la entrada
  function vScrum() {
    const s = D.guia.scrum, haySes = !!(s.sesiones && s.sesiones.length);
    const tab = ["edad", "setup", "entrada"].concat(haySes ? ["sesiones"] : []).includes(S.tab) ? S.tab : "edad";
    const pasos = (items) => `<ol class="pasos">${items.map(([t, d], i) => `<li><span class="pasos__n">${i + 1}</span><span class="pasos__t">${esc(t)}</span>${d ? `<div class="pasos__d">${d}</div>` : ""}</li>`).join("")}</ol>`;
    let cuerpo;
    if (tab === "edad") {
      cuerpo = `<section class="sec sec--pegada">
        <h2 class="h2">Qué se hace en cada edad</h2>
        <ul class="edades-g">${s.edades.map(([c, q, nota]) => `<li><b class="edades-g__cat">${esc(c)}</b><span>${esc(q)}${nota ? `<small>${esc(nota)}</small>` : ""}</span></li>`).join("")}</ul>
      </section>
      <section class="sec">
        <h2 class="h2">Cómo se enseña</h2>
        ${pasos(s.metodo.map(([t, d]) => [t, esc(d)]))}
      </section>`;
    } else if (tab === "setup") {
      cuerpo = `<section class="sec sec--pegada">
        <h2 class="h2">Antes de empezar</h2>
        ${lista(s.principios, "check-g")}
      </section>
      <section class="sec">
        <h2 class="h2">El set up, paso a paso</h2>
        <ol class="setup-g">${s.setup.map(([p, canto, items], i) => `<li><details data-sec="su${i}"${S.abiertos.has(`su${i}`) ? " open" : ""}><summary>
          <span class="pasos__n">${i + 1}</span><span class="setup-g__p">${esc(p)}</span>${canto ? `<span class="chip">Canto: ${esc(canto)}</span>` : ""}</summary>
          <div class="setup-g__in">${lista(items)}</div></details></li>`).join("")}</ol>
      </section>`;
    } else if (tab === "sesiones") {
      // las sesiones de scrum que planificó Coordinación, por grupo y en el orden en que se hicieron: cada una se abre y se ve entera
      const grupos = [...new Set(s.sesiones.map((x) => x.grupo))];
      cuerpo = `<section class="sec sec--pegada desplegables">
        ${grupos.map((g) => `<h3 class="grupo">${esc(g)}</h3>
          ${s.sesiones.filter((x) => x.grupo === g).map((x, n) => desple(`ss-${slug(g)}-${n}`, `Sesión ${n + 1}<small>${esc(mayus(cuandoP(x)))}</small>`,
            `<ul class="prac-g">${x.bloques.filter((b) => !b.agua).flatMap((b) => b.items).map(itemPr).join("")}</ul>`, minDe(x) ? `${minDe(x)} min` : "")).join("")}`).join("")}
      </section>`;
    } else {
      cuerpo = `<section class="sec sec--pegada">
        <h2 class="h2">La entrada</h2>
        <p class="titular titular--abre">El impacto es una acción coordinada de todo el pack</p>
        ${pasos(s.entrada.map(([c, items]) => [c, lista(items)]))}
      </section>
      <section class="sec">
        <h2 class="h2">El empuje</h2>
        <div class="empuje-g">${s.empuje.map(([c, t]) => `<div><b>${esc(c)}</b><span>${esc(t)}</span></div>`).join("")}</div>
        <div class="txt-g">${lista(s.empuje_notas)}</div>
      </section>`;
    }
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Scrum seguro", "scrum")}</div>
      <section class="sec sec--pegada">
        <h2 class="h2">Regla de oro</h2>
        ${pasos(s.regla.map((x, i) => [x, s.regla_txt[i] ? esc(s.regla_txt[i]) : ""]))}
      </section>
      ${pestanas([["edad", "Por edad"], ["setup", "Set up"], ["entrada", "Entrada"]].concat(haySes ? [["sesiones", "Sesiones"]] : []), tab)}
      ${cuerpo}`;
  }

  // ---------- los puestos (perfil del jugador de Coordinación) ----------
  // El equipo dibujado como se para en la cancha: cada número se toca y lleva a lo que se espera de ese puesto.
  const puestoDe = (n) => D.guia.puestos.find((p) => p.n.includes(n));
  const FORMACION = [[1, 2, 3], [4, 5], [6, 8, 7], [9], [10], [11, 12, 13, 14], [15]];
  // lo ideal en un partido, en este orden (NORTE VERDE no se muestra hasta saber qué es)
  const PARTIDO = [["tackles", "Tackles"], ["rucks", "Rucks en ataque"], ["contactos", "Contactos"], ["pases", "Pases"], ["quiebres", "Quiebres"], ["recuperadas", "Recuperadas"]];
  // a qué ejercicios de line lleva cada puesto (el rol que cumple en el line)
  const LINE_DE = { 2: "Lanzador", 4: "Saltador", 5: "Saltador", 7: "Saltador", 8: "Levantador" };

  function vPuestos() {
    const boton = (n) => {
      const p = puestoDe(n);
      return `<button type="button" class="puesto" data-ir-puesto="${n}" aria-label="${n}, ${esc(p.nombre)}"><b class="num">${n}</b><small>${esc(p.corto)}</small></button>`;
    };
    const fila = (ns) => `<div class="formacion__fila${ns.length === 4 ? " formacion__fila--linea" : ""}">${ns.map(boton).join("")}</div>`;
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Los puestos", "puestos")}</div>
      <section class="sec sec--pegada">
        <div class="formacion">
          <h3 class="formacion__tit">Forwards</h3>${FORMACION.slice(0, 3).map(fila).join("")}
          <h3 class="formacion__tit">Backs</h3>${FORMACION.slice(3).map(fila).join("")}
        </div>
      </section>`;
  }

  // un puesto: qué tiene que saber hacer, lo ideal en un partido, lo mental y con qué entrenarlo
  // ---------- los puestos: cómo es el cuerpo y los tests físicos (perfiles de los Pumas / UAR, perfiles_pumas.py) ----------
  const FIS_EDADES = ["M18", "M20", "Senior"];
  const FIS_FUERZA = [["banco", "Press de banco"], ["dominadas", "Dominadas"], ["sentadilla", "Sentadilla"]];
  const FIS_POTENCIA = [["salto_h", "Salto horizontal", "m"], ["salto_v", "Salto vertical", "cm"]];
  /** "Cómo es el cuerpo": peso, altura, masa ósea y muscular, IMO y la forma */
  function cuerpoHTML(c) {
    const caja = ([k, v]) => (v ? `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>` : "");
    return `<div class="dib-cab"><span class="chip chip--gris">Pumas · jugadores adultos</span>${ayudaBtn("perfilCuerpo")}</div>
      <dl class="ficha-org">${[["Peso", c.peso], ["Altura", c.altura], ["Masa ósea (kg)", c.mo], ["Masa muscular (kg)", c.mm], ["Índice músculo-óseo", c.imo]].map(caja).join("")}</dl>
      <h3 class="grupo">Forma del cuerpo</h3>${lista(c.forma, "check-g")}`;
  }
  /** "Tests físicos": una tabla por edad (M18, M20, Senior); fuerza, potencia, velocidad y resistencia */
  function fisicoHTML(f) {
    const i = Math.max(0, FIS_EDADES.indexOf(S.pedad || "M18")), kg = (r) => `${r[0]} kg`, x = (r) => `${r} × peso`;
    const fila = (nom, a, b, c) => `<tr><th scope="row" class="izq">${nom}</th><td>${a}</td><td>${b}</td><td>${c}</td></tr>`;
    const un = (k, nom, u) => fila(nom, `${f[k][i][0]} ${u}`, `${f[k][i][1]} ${u}`, `${f[k][i][2]} ${u}`);
    const v = f.velocidad;
    return `<div class="dib-cab"><span class="chip chip--gris">Referencia de la UAR · desde M18</span>${ayudaBtn("perfilFisico")}</div>
      <div class="chips-g" role="group" aria-label="Edad">${FIS_EDADES.map((e) => `<button type="button" data-edad="${e}" aria-pressed="${e === FIS_EDADES[i]}">${e === "Senior" ? "Senior" : e}</button>`).join("")}</div>
      <div class="tabla-e-wrap"><table class="tabla-e fis"><thead><tr><th class="izq">Test</th><th scope="col">Mínimo</th><th scope="col">Objetivo bajo</th><th scope="col">Objetivo alto</th></tr></thead><tbody>
        <tr class="fis-g"><th colspan="4">Fuerza</th></tr>
        ${FIS_FUERZA.map(([k, nom]) => fila(nom, kg(f[k][i]), x(f[k][i][1]), x(f[k][i][2]))).join("")}
        <tr class="fis-g"><th colspan="4">Potencia</th></tr>
        ${FIS_POTENCIA.map(([k, nom, u]) => un(k, nom, u)).join("")}
        ${v ? `<tr class="fis-g"><th colspan="4">Velocidad</th></tr>
          <tr><th scope="row" class="izq">10 metros</th><td colspan="3">${v.m10[i]} s</td></tr>
          <tr><th scope="row" class="izq">30 metros</th><td colspan="3">${v.m30[i]} s</td></tr>
          <tr><th scope="row" class="izq">Velocidad máxima</th><td colspan="3">${v.vmax[i]} km/h</td></tr>` : ""}
      </tbody></table></div>
      <div class="tabla-e-wrap"><table class="tabla-e fis"><thead><tr><th class="izq">Resistencia</th><th scope="col">Objetivo bajo</th><th scope="col">Objetivo alto</th><th scope="col">Máximo</th></tr></thead><tbody>
        ${fila("Bronco", `${f.bronco[i][0]} s`, `${f.bronco[i][1]} s`, `${f.bronco[i][2]} s`)}</tbody></table></div>`;
  }

  function vPuesto() {
    const todos = D.guia.puestos, p = puestoDe(S.puesto), j = todos.indexOf(p), n = p.n[0];
    const salto = (k, der) => {
      const q = todos[k];
      return `<button type="button"${q ? ` data-lado data-ir-puesto="${q.n[0]}" aria-label="${der ? "Siguiente" : "Anterior"}: ${esc(q.nombre)}"` : " disabled"}>${der ? "" : IC.atras}<span>${der ? "Siguiente" : "Anterior"}</span>${der ? IC.adelante : ""}</button>`;
    };
    const atajos = (n <= 8 ? `<button type="button" class="atajo" data-ir="scrum">${IC.escudo}<span><b>Scrum seguro:</b> qué se hace en cada edad y el set up</span>${IC.adelante}</button>` : "")
      + (LINE_DE[n] ? `<button type="button" class="atajo" data-ir-line="${LINE_DE[n]}">${IC.cono}<span><b>Ejercicios de line</b> del ${LINE_DE[n].toLowerCase()}</span>${IC.adelante}</button>` : "");
    $("#vista").innerHTML = `
      <div class="cab">
        <div class="cab__fila">${volver("Puestos", "puestos")}
          <div class="saltos saltos--ej" role="group" aria-label="Otros puestos">${salto(j - 1)}${salto(j + 1, true)}</div></div>
        <p class="ej-tag">${n <= 8 ? "Forward" : "Back"}</p>
        <h2 class="ej-tit puesto-tit"><span class="puesto-tit__n num">${p.n.join(" y ")}</span>${esc(p.nombre)}</h2>
      </div>
      <section class="sec sec--pegada">
        <h3 class="grupo">Qué tiene que saber hacer</h3>
        <ul class="pilares-g">${p.destrezas.map(([d, t]) => `<li><b>${esc(d)}</b><span>${esc(t)}</span></li>`).join("")}</ul>
        <h3 class="grupo grupo--ayuda">En un partido${ayudaBtn("partidoPuesto")}</h3>
        <ul class="partido-g">${PARTIDO.map(([k, l]) => `<li><b class="num">${p.partido[k]}</b><span>${l}</span></li>`).join("")}</ul>
        <h3 class="grupo">Lo mental</h3>
        <p class="claves-g">${p.mental.map((m) => `<span class="chip">${esc(m)}</span>`).join("")}</p>
        ${atajos ? `<h3 class="grupo">Para entrenarlo</h3>${atajos}` : ""}
      </section>
      ${p.cuerpo ? `<section class="sec desplegables">${desple("p-cuerpo", "Cómo es el cuerpo", cuerpoHTML(p.cuerpo))}${desple("p-fisico", "Tests físicos", fisicoHTML(p.fisico), p.fisico.nombre)}</section>` : ""}`;
  }

  // ---------- prácticas de los entrenadores (planillas de PLANIFICACIONES, practicas_entrenadores.py) ----------
  // Una lista por mes, de la más nueva a la más vieja, con filtro por categoría y buscador; al tocar una se ve entera,
  // con "Anterior / Siguiente" por fecha y el botón para mandarla por WhatsApp.
  const P_GRUPOS = ["Plantel superior", "M17 a M19", "M15 y M16", "M13 y M14", "M11 y M12", "M9 y M10", "M8", "M7", "M6"];
  const DIA_S = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MES_S = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const dia = (iso) => new Date(`${iso}T12:00:00`);
  const cuandoP = (p) => p.fecha ? `${DIA_S[dia(p.fecha).getDay()]} ${dia(p.fecha).getDate()} de ${MES_S[dia(p.fecha).getMonth()]}`
    : p.semana ? `semana ${p.semana} de la temporada` : "sin fecha";
  const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const grupoDeCat = (cat) => { const p = (D.guia && D.guia.practicas || []).find((x) => x.cats.includes(cat)); return p ? p.grupo : null; };
  const nPr = (g) => D.guia.practicas.filter((p) => p.grupo === g).length;
  const atajoPr = (cat) => { const g = grupoDeCat(cat); return g ? `<button type="button" class="atajo" data-ir-practicas="${esc(g)}">${IC.calendario}<span>Prácticas de ${esc(g)} (${nPr(g)})</span>${IC.adelante}</button>` : ""; };
  // las sin fecha van al final
  const ordenPr = (a, b) => (b.orden === "9" ? "0" : b.orden).localeCompare(a.orden === "9" ? "0" : a.orden);
  const prLista = () => D.guia.practicas.filter((p) => !S.pgrupo || p.grupo === S.pgrupo).sort(ordenPr);
  /** una actividad de una práctica (o de una sesión de scrum): los minutos a la izquierda; el objetivo, qué se hace y cómo */
  const itemPr = (it) => `<li class="prac-it"><span class="prac-it__min num">${it.min ? `${it.min}'` : ""}</span><div class="prac-it__txt">
      ${it.obj ? `<span class="prac-it__obj">${conCantos(it.obj)}</span>` : ""}
      ${it.act ? `<p class="prac-it__act">${conCantos(it.act)}</p>` : ""}
      ${it.det ? `<p class="prac-it__det">${conCantos(it.det)}</p>` : ""}
      ${it.grupo ? `<span class="chip chip--gris">${esc(it.grupo)}</span>` : ""}</div></li>`;
  /** el número de cada grupo; mientras se busca dice cuántos se ven ("6 de 15") */
  const cuenta = (n, [uno, varios]) => `<span class="num" data-n="${n}" data-txt="${pl(n, uno, varios)}">${pl(n, uno, varios)}</span>`;
  function contar(gr, q, vis) {
    const c = gr.querySelector(".grupo-ej__cab .num, summary .num");
    if (c && c.dataset.n) c.textContent = q ? `${vis} de ${c.dataset.n}` : c.dataset.txt;
  }
  /** los minutos de una práctica o sesión: solo si todas las actividades tienen sus minutos */
  const minDe = (p) => (p.min && !p.bloques.some((b) => !b.agua && b.items.some((it) => !it.min)) ? p.min : null);
  let Q_PR = null; // lo que se busca de cada práctica (se arma la primera vez que se usa el buscador)
  const textoBusca = (p) => norm([p.foco, p.grupo, p.quien, ...p.objetivos, ...p.bloques.flatMap((b) => (b.items || []).map((it) => `${it.obj || ""} ${it.act || ""} ${it.det || ""}`))].join(" "));

  /** una práctica en la lista: el día (número y día de la semana), el foco y quién la armó */
  const filaPr = (p, cls = "") => {
    const d = p.fecha ? dia(p.fecha) : null;
    return `<li data-pr="${esc(p.id)}"><button type="button" class="ej prac${cls}" data-ir-practica="${esc(p.id)}">
      <span class="prac__dia">${d ? `<b class="num">${d.getDate()}</b><small>${DIA_S[d.getDay()].slice(0, 3)}</small>` : `<small>${p.semana ? `Sem. ${p.semana}` : "Sin fecha"}</small>`}</span>
      <span class="ej__txt"><b>${esc(p.foco || "Práctica")}</b><small>${S.pgrupo ? "" : `${esc(p.grupo)} · `}${esc(p.quien)}${minDe(p) ? ` · ${minDe(p)} min` : ""}</small></span>
      ${IC.adelante}</button></li>`;
  };
  /** las prácticas por mes, la más nueva arriba; en Planificación cada mes se abre y se cierra (el último, abierto) */
  function mesesPr(lista, plegar) {
    const meses = [];
    lista.forEach((p) => {
      const k = p.orden === "9" ? "sin" : p.orden.slice(0, 7);
      let m = meses.find((x) => x.k === k);
      if (!m) meses.push((m = { k, items: [] }));
      m.items.push(p);
    });
    const nom = (k) => (k === "sin" ? "Sin fecha" : mayus(MES_S[+k.slice(5, 7) - 1]));
    const filas = (m) => `<ul class="filas-cat">${m.items.map((x) => filaPr(x)).join("")}</ul>`;
    return meses.map((m, i) => (plegar
      ? `<details class="grupo-ej mas mes"${i ? "" : " open"}><summary><span class="mas__tit">${nom(m.k)}</span><span class="mas__dato">${cuenta(m.items.length, ["práctica", "prácticas"])}</span></summary>${filas(m)}</details>`
      : `<div class="grupo-ej"><div class="grupo-ej__cab"><h3 class="grupo-cat__tit">${nom(m.k)}</h3>${cuenta(m.items.length, ["práctica", "prácticas"])}</div>${filas(m)}</div>`)).join("");
  }
  const buscadorPr = () => `<label class="buscar-g"><span class="sr">Buscar una práctica</span>${IC.buscar}<input type="search" id="buscar-pr" value="${esc(S.qp)}" placeholder="Buscar: tackle, ruck, pase…" autocomplete="off" enterkeyhint="search"></label>`;
  const sinPr = `<p class="vacio-g" id="sin-pr" hidden>No hay ninguna práctica con esa palabra.</p>`;

  function vPracticas() {
    const grupos = P_GRUPOS.filter((g) => nPr(g));
    $("#vista").innerHTML = `
      <div class="cab">${volver()}${cabTit("Prácticas", "practicas")}</div>
      <div class="chips-g" role="group" aria-label="Categoría">${[["", "Todas"], ...grupos.map((g) => [g, g])].map(([v, l]) =>
        `<button type="button" data-pgrupo="${esc(v)}" aria-pressed="${(S.pgrupo || "") === v}">${esc(l)}</button>`).join("")}</div>
      <section class="sec sec--pegada">${buscadorPr()}${mesesPr(prLista())}${sinPr}</section>`;
    filtrarPr();
  }
  function filtrarPr() {
    const q = norm((S.qp || "").trim());
    if (q && !Q_PR) Q_PR = new Map(D.guia.practicas.map((p) => [p.id, textoBusca(p)]));
    let n = 0;
    document.querySelectorAll(".grupo-ej").forEach((gr) => {
      let vis = 0;
      gr.querySelectorAll("li[data-pr]").forEach((li) => { const ok = !q || Q_PR.get(li.dataset.pr).includes(q); li.hidden = !ok; vis += ok; });
      gr.hidden = !vis; n += vis;
      if (q && vis && gr.tagName === "DETAILS") gr.open = true; // al buscar, se abren los meses que tienen algo
      contar(gr, q, vis);
    });
    const v = $("#sin-pr");
    if (v) v.hidden = n > 0;
  }

  // una práctica entera, como la escribió el entrenador
  function vPractica() {
    const todos = D.guia.practicas, p = todos.find((x) => x.id === S.practica);
    // "Anterior / Siguiente" por fecha, dentro de la misma lista que se estaba mirando
    const q = norm((S.qp || "").trim()), vistos = prLista().filter((x) => !q || textoBusca(x).includes(q));
    const cron = vistos.some((x) => x.id === p.id) ? vistos : D.guia.practicas.slice().sort(ordenPr), j = cron.indexOf(p);
    const salto = (k, der) => {
      const q = cron[k];
      return `<button type="button"${q ? ` data-lado data-ir-practica="${esc(q.id)}" aria-label="${der ? "Siguiente" : "Anterior"}: ${esc(q.foco)}"` : " disabled"}>${der ? "" : IC.atras}<span>${der ? "Siguiente" : "Anterior"}</span>${der ? IC.adelante : ""}</button>`;
    };
    const minB = (b) => b.items.reduce((s, it) => s + (it.min || 0), 0);
    const cuerpo = p.bloques.map((b) => b.agua ? `<p class="prac-agua">${IC.gota}<span>Agua${b.min ? ` · ${b.min} min` : ""}</span></p>`
      : `${b.b ? `<h3 class="grupo grupo--fila"><span>${esc(b.b)}</span>${minB(b) ? `<span class="num">${minB(b)} min</span>` : ""}</h3>` : ""}
        <ul class="prac-g">${b.items.map(itemPr).join("")}</ul>`).join("");
    $("#vista").innerHTML = `
      <div class="cab">
        <div class="cab__fila">${volver("Prácticas", { ver: "practicas", practica: null })}
          <div class="saltos saltos--ej" role="group" aria-label="Otras prácticas">${salto(j - 1)}${salto(j + 1, true)}</div></div>
        <p class="ej-tag">${esc(p.grupo)} · ${esc(p.quien)}</p>
        <h2 class="ej-tit">${esc(p.foco || "Práctica")}</h2>
        <p class="prac-cuando">${IC.calendario}<span>${mayus(cuandoP(p))}${minDe(p) ? ` · ${minDe(p)} minutos` : ""}</span></p>
      </div>
      <section class="sec sec--pegada ej-det">
        ${p.objetivos.length ? `<h3 class="grupo">Objetivos</h3>${lista(p.objetivos, "check-g")}` : ""}
        ${cuerpo}
        ${p.cierre ? `<p class="prac-agua prac-agua--fin">${IC.bien}<span>Charla final y elongación</span></p>` : ""}
        <button type="button" class="btn btn--ancho btn--wa" data-compartir-pr>${IC.compartir}Mandar por WhatsApp</button>
      </section>`;
  }
  // ---------- asistencia a los entrenamientos (functions/api/asistencia.js, guarda en Cloudflare D1) ----------
  // Pensada para la cancha: con una mano, al sol y con poca señal. Lo marcado queda guardado en el celular hasta que se envía,
  // cómo va el guardado se ve en la barra de abajo y, si dos entrenadores toman la lista del mismo día, se juntan.
  // La lista arranca con los fichados en la UAR (vienen cifrados con los datos). Los días, los suspendidos, las listas y los chicos
  // que se suman o ya no vienen se guardan en Cloudflare, así los ven todos los entrenadores.
  // El porcentaje es sobre los entrenamientos con lista (los suspendidos y los días sin lista no cuentan), y los colores y el orden
  // por porcentaje aparecen desde la tercera lista: antes, cualquier número asusta.
  const ASIS_CATS = ["Plantel superior", "M19", "M17", "M16", "M15", "M14", "M13", "M12", "M11", "M10", "M9", "M8", "M7", "M6"];
  const ULTIMA = "los50-ent-asis"; // la última categoría en la que se tomó lista (queda en el celular)
  const LISTAS_MIN = 3;
  const asisDe = (cat) => (PS.includes(cat) ? "Plantel superior" : ASIS_CATS.includes(cat) ? cat : null);
  const asisTxt = (a) => (a === "Plantel superior" ? "del plantel superior" : `de ${a}`);
  const atajoAsis = (cat) => { const a = D.fichados && asisDe(cat); return a ? `<button type="button" class="atajo" data-ir-asis="${esc(a)}">${IC.lista}<span>Asistencia ${esc(asisTxt(a))}</span>${IC.adelante}</button>` : ""; };
  const ASIS = { resumen: null, cats: {}, error: {}, cargando: new Set() };
  const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const masDias = (iso, n) => { const d = dia(iso); d.setDate(d.getDate() + n); return isoDe(d); };
  /** los días que se pueden usar en la asistencia: que existan (no un 30 de febrero), del último año y hasta 4 meses para adelante */
  const DIAS_ATRAS = 366, DIAS_ADELANTE = 120;
  const fechaOk = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && isoDe(dia(f)) === f && f >= masDias(hoyISO(), -DIAS_ATRAS) && f <= masDias(hoyISO(), DIAS_ADELANTE);
  const ahoraHora = () => new Date().toTimeString().slice(0, 5);
  /** para ver si un chico ya está: sin tildes, mayúsculas ni comas, y en cualquier orden ("Pérez, Tomás" = "tomas perez") */
  const claveNombre = (n) => norm(n).replace(/[^a-z0-9]+/g, " ").trim().split(" ").sort().join(" ");
  const corta = (iso) => `${DIA_S[dia(iso).getDay()].slice(0, 3)} ${dia(iso).getDate()}/${dia(iso).getMonth() + 1}`;
  const diaMes = (iso) => cuandoP({ fecha: iso }).replace(/ de \S+$/, ""); // "jueves 22"
  const horaDe = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const enCel = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
  };
  const fichaGuardada = () => { try { return localStorage.getItem(FICHA) || sessionStorage.getItem(FICHA) || ""; } catch (e) { return ""; } };
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");
  const colorPct = (p) => (p == null ? "gris" : p >= 80 ? "verde" : p >= 60 ? "ambar" : "rojo");
  /** el porcentaje en un recuadro: con color desde la tercera lista; antes, gris */
  const porcHTML = (p, conColor) => `<span class="porc porc--${conColor ? colorPct(p) : "gris"} num">${p == null ? "–" : `${p}%`}</span>`;
  // lo marcado y todavía no guardado: queda en el celular aunque se cierre la página, se bloquee el teléfono o no haya señal
  const claveBorrador = (cat, f) => `los50-lista:${cat}:${f}`;
  const borrador = (cat, f) => { try { return JSON.parse(enCel.get(claveBorrador(cat, f)) || "null"); } catch (e) { return null; } };
  const guardarBorrador = (cat, f, b) => enCel.set(claveBorrador(cat, f), b ? JSON.stringify(b) : null);

  async function api(cuerpo, cat) {
    const r = await fetch(`api/asistencia${cat ? `?cat=${encodeURIComponent(cat)}` : ""}`, {
      method: cuerpo ? "POST" : "GET", cache: "no-store",
      headers: { "x-ficha": fichaGuardada(), ...(cuerpo ? { "content-type": "application/json" } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (r.status === 401) throw new Error("clave");
    if (!r.ok) throw new Error("servidor");
    return r.json();
  }
  const avisoError = (e) => (e.message === "clave"
    ? `Para usar la asistencia hay que volver a poner la clave. <button type="button" class="link" data-reclave>Poner la clave</button>`
    : e.message === "servidor" ? "No se pudo guardar. Probá de nuevo en un rato." : "No se pudo guardar: no hay señal. Probá de nuevo en un rato.");
  /** trae los datos de una categoría (o el resumen de todas) y vuelve a dibujar si se sigue en esa pantalla */
  function cargarAsis(cat) {
    const k = cat || "*";
    if (ASIS.cargando.has(k)) return;
    ASIS.cargando.add(k);
    api(null, cat).then((d) => { if (cat) ASIS.cats[cat] = d; else ASIS.resumen = d; })
      .catch((e) => { ASIS.error[k] = e.message === "clave" ? avisoError(e) : e.message === "servidor" ? "No se pudo cargar. Probá de nuevo en un rato." : "No se pudo cargar: no hay señal."; })
      .finally(() => {
        ASIS.cargando.delete(k);
        const aca = cat ? (S.acat === cat && ["asis", "lista", "chicos"].includes(S.ver)) || (S.ver === "inicio" && enCel.get(ULTIMA) === cat) || (S.ver === "plan" && S.pcat === cat) || (S.ver === "equipo" && eqAsis(S.eqcat) === cat) || (["tests", "toma"].includes(S.ver) && S.tcat === cat) || S.ver === "asistencia" : S.ver === "asistencia";
        if (aca) render();
      });
  }
  /** avisa abajo de la pantalla (se ve aunque estés más abajo); el de "listo" se va solo */
  function avisar(tipo, txt) {
    const a = (S.aviso = { tipo, txt });
    if (tipo === "ok" || tipo === "ojo") setTimeout(() => { if (S.aviso === a) { S.aviso = null; const el = $(".aviso"); if (el) el.remove(); } }, tipo === "ok" ? 4000 : 6000);
  }
  /** guarda un cambio (días, suspendido, chicos…), vuelve a traer la categoría y avisa cómo salió.
      Mientras guarda y si falla, la pantalla no se vuelve a dibujar: lo elegido o escrito en el formulario no se pierde */
  async function guardarAsis(cuerpo, ok, despues) {
    if (ASIS.guardando) return; // un toque de más mientras guarda no manda lo mismo dos veces
    const cat = S.acat;
    ASIS.guardando = true;
    avisoSuelto("Guardando…", "espera");
    try {
      await api({ cat, ...cuerpo });
      ASIS.cats[cat] = await api(null, cat);
      ASIS.resumen = null;
      avisar("ok", ok);
      S.aform = null; S.amotivo = null;
      if (despues) despues(); else render();
    } catch (e) { avisoSuelto(avisoError(e)); }
    finally { ASIS.guardando = false; }
  }
  /** un aviso que se muestra sin volver a dibujar, así no se pierde lo que ya se eligió */
  function avisoSuelto(txt, tipo = "error") {
    avisar(tipo, txt);
    const viejo = $(".aviso");
    if (viejo) viejo.remove();
    $("#vista").insertAdjacentHTML("beforeend", avisoHTML());
  }
  const avisoHTML = () => (S.aviso ? `<p class="aviso aviso--${S.aviso.tipo}" role="status">${S.aviso.tipo === "ok" ? IC.tilde : ""}<span>${S.aviso.txt}</span></p>` : "");
  const cargandoHTML = (k) => (ASIS.error[k] ? `<div class="hoy hoy--error"><p class="hoy__canc">${ASIS.error[k]}</p>
      <button type="button" class="btn-sec" data-reintentar="${esc(k)}">Probar de nuevo</button></div>` : `<p class="cargando">Cargando…</p>`);

  /** los chicos de la categoría: los fichados menos los que ya no vienen, más los sumados a mano (cuentan desde ese día) */
  function chicosDe(cat, d) {
    const bajas = new Set(d.chicos.filter((c) => c.estado === "baja").map((c) => c.id));
    const todos = [...(D.fichados[cat] || []).map(([id, nombre]) => ({ id, nombre, desde: "" })),
      ...d.chicos.filter((c) => c.id.startsWith("m")).map((c) => ({ id: c.id, nombre: c.nombre, desde: c.ts.slice(0, 10), mano: true }))];
    return { activos: todos.filter((c) => !bajas.has(c.id)).sort(porNombre), fuera: todos.filter((c) => bajas.has(c.id)).sort(porNombre) };
  }
  /** los entrenamientos entre dos fechas: los de siempre (por los días cargados) con sus cambios, los agregados y los días con lista */
  function sesiones(d, desde, hasta) {
    const out = new Map();
    for (let f = desde; f <= hasta; f = masDias(f, 1)) {
      const h = d.horarios.find((x) => x.dia === dia(f).getDay());
      if (h) out.set(f, { fecha: f, hora: h.hora, estado: "normal" });
    }
    d.entrenamientos.filter((e) => e.fecha >= desde && e.fecha <= hasta).forEach((e) => {
      const s = out.get(e.fecha);
      if (e.estado === "extra") out.set(e.fecha, { fecha: e.fecha, hora: e.hora, estado: "extra" });
      else if (s) Object.assign(s, { estado: e.estado, motivo: e.motivo, antes: s.hora, hora: e.estado === "movido" ? e.hora : s.hora });
    });
    const listas = new Map(d.listas.map((l) => [l.fecha, l]));
    listas.forEach((l, f) => { if (f >= desde && f <= hasta && !out.has(f)) out.set(f, { fecha: f, hora: "", estado: "extra" }); });
    return [...out.values()].map((s) => ({ ...s, lista: listas.get(s.fecha) || null })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }
  // los porcentajes son de la temporada (el año): el año que viene los chicos cambian de categoría y se arranca de cero.
  // Las listas de antes quedan guardadas (y en la copia de seguridad), solo que no cuentan
  const listasValidas = (d) => {
    const canc = new Set(d.entrenamientos.filter((e) => e.estado === "cancelado").map((e) => e.fecha)), anio = hoyISO().slice(0, 4);
    return d.listas.filter((l) => !canc.has(l.fecha) && l.fecha.startsWith(anio));
  };
  /** a cuántos entrenamientos con lista vino cada chico */
  function porcentajes(d, chicos) {
    const ls = listasValidas(d);
    return chicos.map((c) => {
      const base = ls.filter((l) => l.fecha >= c.desde), vino = base.filter((l) => l.presentes.includes(c.id)).length;
      return { ...c, vino, de: base.length, pct: base.length ? Math.round((vino / base.length) * 100) : null };
    });
  }
  /** "martes y jueves a las 18:30" (de lunes a domingo) */
  function horariosTxt(hs) {
    const porHora = new Map();
    hs.slice().sort((a, b) => ((a.dia + 6) % 7) - ((b.dia + 6) % 7)).forEach((h) => porHora.set(h.hora, [...(porHora.get(h.hora) || []), DIA_S[h.dia]]));
    return [...porHora].map(([hora, ds]) => `${ds.length > 1 ? `${ds.slice(0, -1).join(", ")} y ${ds.at(-1)}` : ds[0]} a las ${hora}`).join(" · ");
  }
  /** cuántos vinieron, contando solo a los chicos que hoy están en la lista (los que ya no vienen no suman) */
  /** los chicos que estaban en la lista ese día: un chico sumado a mano no aparece en las listas de antes */
  const chicosEn = (activos, f) => activos.filter((c) => !c.desde || c.desde <= f);
  const vinieron = (l, activos) => { const ids = new Set(activos.map((c) => c.id)); return l.presentes.filter((id) => ids.has(id)).length; };
  /** a qué hora se guardó la lista */
  const tomoTxt = (l) => `guardada a las ${horaDe(l.ts)}`;
  /** si dos listas de chicos son la misma (en cualquier orden) */
  const mismos = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  /** hay cambios marcados en el celular que todavía no se guardaron (si quedó igual a lo guardado, no cuenta) */
  const sinGuardar = (cat, s) => { const b = borrador(cat, s.fecha); return !!b && !mismos(b.marcas, s.lista ? s.lista.presentes : []); };
  /** cómo está un entrenamiento, en pocas palabras */
  function estadoTxt(s, activos, cat) {
    // el motivo largo se corta: si no, en el celular tapa la fecha del renglón
    const mot = s.motivo && s.motivo.length > 22 ? `${s.motivo.slice(0, 21).trim()}…` : s.motivo;
    if (s.estado === "cancelado") return `Suspendido${mot ? `: ${esc(mot)}` : ""}`;
    if (sinGuardar(cat, s)) return "Sin guardar";
    if (s.lista) { const ch = chicosEn(activos, s.fecha); return `Vinieron ${vinieron(s.lista, ch)} de ${ch.length}`; }
    // hoy, antes de la hora del entrenamiento, todavía no "falta" la lista
    return s.fecha > hoyISO() ? "Próximo" : s.fecha === hoyISO() ? (s.hora > ahoraHora() ? "Más tarde" : "Falta la lista") : "Sin lista";
  }

  // los formularios chicos (suspender, cambiar la hora, agregar, días, borrar): aparecen en el lugar, sin ventanas
  // la hora se elige de una lista (de 7 a 23, cada 15 minutos): más fácil que escribirla y igual en todos los celulares
  const HORAS = Array.from({ length: 65 }, (_, i) => { const m = 7 * 60 + i * 15; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });
  const elegirHora = (id, valor) => `<select id="${id}" class="asis-input asis-input--hora">${[...new Set([...HORAS, valor].filter(Boolean))].sort()
    .map((h) => `<option${h === valor ? " selected" : ""}>${esc(h)}</option>`).join("")}</select>`;
  const cerrarBtn = `<button type="button" class="btn-sec" data-form="">Cerrar</button>`;
  // si no se pudo guardar (sin señal), el motivo elegido sigue elegido (S.amotivo)
  const formSuspender = (s, activos) => { const am = S.amotivo || {}; return `<div class="asis-form"><span class="asis-form__l">¿Por qué se suspende?</span>
      <div class="chips-g chips-g--asis" role="group" aria-label="Motivo">${["Lluvia", "Cancha en mal estado", "Otro"].map((m) =>
        `<button type="button" data-motivo="${m}" aria-pressed="${am.m === m}">${m === "Otro" ? "Otro motivo" : m}</button>`).join("")}</div>
      <label class="asis-form__campo" id="motivo-otro"${am.m === "Otro" ? "" : " hidden"}>Contá por qué<input id="motivo" class="asis-input" maxlength="120" autocomplete="off" value="${esc(am.txt || "")}"></label>
      ${s.lista ? `<p class="asis-form__aviso">Este día ya tiene lista (vinieron ${vinieron(s.lista, chicosEn(activos, s.fecha))} de ${chicosEn(activos, s.fecha).length}). Si lo suspendés, esa lista no cuenta.</p>`
        : borrador(S.acat, s.fecha) ? `<p class="asis-form__aviso">Tenés una lista sin guardar de este día. Si lo suspendés, esa lista no cuenta.</p>` : ""}
      <div class="asis-form__btns"><button type="button" class="btn btn--peligro btn--alto" data-cancelar-ok="${s.fecha}">Suspender el entrenamiento</button>${cerrarBtn}</div></div>`; };
  const formHora = (s) => `<div class="asis-form"><label class="asis-form__campo">Nueva hora para el ${esc(cuandoP(s))}
      ${elegirHora("hora-nueva", s.hora || "18:00")}</label>
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-hora-ok="${s.fecha}">Cambiar la hora</button>${cerrarBtn}</div></div>`;
  const formBorrarExtra = (s) => `<div class="asis-form"><span class="asis-form__l">¿Borrar el entrenamiento agregado del ${esc(cuandoP(s))}?</span>
      <div class="asis-form__btns"><button type="button" class="btn btn--peligro btn--alto" data-deshacer="${s.fecha}">Borrarlo</button>${cerrarBtn}</div></div>`;
  /** el primer día desde mañana que no tiene entrenamiento: así "agregar" no propone uno que ya existe */
  const diaLibre = (d) => { let f = masDias(hoyISO(), 1); while (sesiones(d, f, f).length) f = masDias(f, 1); return f; };
  const formAgregar = (d) => `<div class="asis-form"><div class="asis-form__fila"><label class="asis-form__campo">Día<input id="fecha-nueva" class="asis-input" type="date" value="${diaLibre(d)}" min="${masDias(hoyISO(), -60)}" max="${masDias(hoyISO(), DIAS_ADELANTE)}" required></label>
        <label class="asis-form__campo">Hora${elegirHora("hora-agregar", (d.horarios[0] || {}).hora || "18:00")}</label></div>
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-agregar-ok>${IC.mas}Agregar</button>${cerrarBtn}</div></div>`;
  // los días que entrena, cada uno con su hora (martes y jueves 18:30, sábado 10:00): al tocar un día, aparece su hora
  const SEMANA = [1, 2, 3, 4, 5, 6, 0];
  const formDias = (d) => `<div class="asis-form"><span class="asis-form__l">Tocá los días que entrena</span>
      <div class="chips-g chips-g--asis chips-g--dias" role="group" aria-label="Días">${SEMANA.map((n) =>
        `<button type="button" data-dia="${n}" aria-pressed="${d.horarios.some((h) => h.dia === n)}">${mayus(DIA_S[n].slice(0, 3))}</button>`).join("")}</div>
      <div class="asis-dias">${SEMANA.map((n) => { const h = d.horarios.find((x) => x.dia === n);
        return `<label class="asis-dia" data-dia-hora="${n}"${h ? " data-guardada" : " hidden"}><span>${mayus(DIA_S[n])}</span>${elegirHora(`hora-dia-${n}`, h ? h.hora : (d.horarios[0] || {}).hora || "18:00")}</label>`; }).join("")}</div>
      <div class="asis-form__btns"><button type="button" class="btn btn--ok btn--alto" data-horarios-ok>Guardar los días</button>${d.horarios.length ? cerrarBtn : ""}</div></div>`;

  /** suspender uno de siempre, o borrar uno agregado (si ya tiene lista, primero hay que borrar la lista: si no, no desaparece) */
  const botonQuitar = (s, borrar) => (s.estado !== "extra" ? `<button type="button" class="btn-sec" data-form="suspender:${s.fecha}">Suspender</button>`
    : s.lista ? "" : `<button type="button" class="btn-sec" data-form="suspender:${s.fecha}">${borrar}</button>`);
  /** el entrenamiento de hoy (o el próximo): lo primero, con un solo botón grande */
  function tarjetaHoy(cat, s, activos) {
    const hoy = hoyISO(), b = sinGuardar(cat, s) && borrador(cat, s.fecha);
    const estado = s.estado === "cancelado" ? `<p class="hoy__canc">Suspendido${s.motivo ? `: ${esc(s.motivo)}` : ""}</p>`
      : b ? `<p class="hoy__estado hoy__estado--ojo">${IC.alerta}<span>Tenés la lista sin guardar (${b.marcas.length} marcados)</span></p>`
      : s.lista ? `<p class="hoy__estado">${IC.tilde}<span>Vinieron <b>${vinieron(s.lista, chicosEn(activos, s.fecha))} de ${chicosEn(activos, s.fecha).length}</b> · ${tomoTxt(s.lista)}</span></p>`
      : s.estado === "movido" ? `<p class="hoy__nota">Cambió la hora (antes ${esc(s.antes)})</p>` : "";
    const principal = s.estado === "cancelado" ? `<button type="button" class="btn-sec btn-sec--ancho" data-deshacer="${s.fecha}">Deshacer: vuelve a haber entrenamiento</button>`
      : s.fecha <= hoy ? `<button type="button" class="btn btn--ok btn--grande" data-ir-lista="${s.fecha}">${IC.lista}${b ? "Seguir la lista" : s.lista ? "Sumar a alguien que llegó tarde" : "Tomar lista"}</button>` : "";
    const otras = s.estado === "cancelado" || s.estado === "nuevo" ? "" : `<div class="acc-2">${botonQuitar(s, "Borrarlo")}
        <button type="button" class="btn-sec" data-form="hora:${s.fecha}">Cambiar la hora</button></div>`;
    const form = S.aform === `suspender:${s.fecha}` ? (s.estado === "extra" ? formBorrarExtra(s) : formSuspender(s, activos)) : S.aform === `hora:${s.fecha}` ? formHora(s) : "";
    return `<div class="hoy${s.estado === "cancelado" ? " hoy--canc" : ""}">
      <h3 class="hoy__dia">${s.fecha === hoy ? "Hoy" : `Próximo: ${esc(diaMes(s.fecha))}`}${s.hora ? ` · ${esc(s.hora)}` : ""}</h3>
      ${estado}${principal}${otras}${form}</div>`;
  }

  /** los que no vinieron a ningún entrenamiento desde la tercera lista (y nadie dijo que siguen): se pregunta por ellos y,
      hasta que se conteste, no cuentan en el porcentaje (suelen ser fichados de la UAR que ya no vienen) */
  function nuncaVinieron(cat, d) {
    const siguen = new Set(d.chicos.filter((c) => c.estado === "sigue").map((c) => c.id));
    return porcentajes(d, chicosDe(cat, d).activos).filter((c) => c.de >= LISTAS_MIN && !c.vino && !siguen.has(c.id));
  }
  /** cuánto viene la categoría: de todas las veces que un chico pudo venir (con lista), cuántas vino. Igual en todas las pantallas */
  function promedioCat(cat, d) {
    const nunca = new Set(nuncaVinieron(cat, d).map((c) => c.id)), ls = listasValidas(d);
    const tot = porcentajes(d, chicosDe(cat, d).activos).filter((c) => !nunca.has(c.id)).reduce((t, c) => [t[0] + c.vino, t[1] + c.de], [0, 0]);
    return { p: tot[1] ? Math.round((tot[0] / tot[1]) * 100) : null, nListas: ls.length, ultima: ls.length ? ls.at(-1).fecha : null };
  }

  // la lista de categorías, con cuánto viene cada una
  function vAsistencia() {
    const r = ASIS.resumen;
    if (!r && !ASIS.error["*"]) cargarAsis(null);
    const fila = (cat) => {
      // el porcentaje se calcula con los datos de cada categoría, igual que adentro (se traen las que tienen listas)
      const res = r && r.resumen[cat], d = res && ASIS.cats[cat];
      if (res && !d && !ASIS.error[cat]) cargarAsis(cat);
      // las listas de días suspendidos no cuentan (igual que adentro de la categoría)
      const pr = d && promedioCat(cat, d), nL = pr ? pr.nListas : res ? res.listas : 0, ult = pr ? pr.ultima : res && res.ultima;
      return `<li><button type="button" class="fila-cat fila-cat--asis" data-ir-asis="${esc(cat)}">
        <span class="fila-cat__nom">${esc(cat)}<small>${!r ? "…" : nL ? `${pl(nL, "lista", "listas")} · la última, ${corta(ult)}` : "Todavía sin listas"}</small></span>
        ${pr ? (pr.nListas ? porcHTML(pr.p, pr.nListas >= LISTAS_MIN) : "") : res ? `<span class="porc porc--gris">…</span>` : ""}${IC.adelante}</button></li>`;
    };
    $("#vista").innerHTML = `
      <div class="cab">${volver(AREAS.asistencia, AREA_IR("asistencia"))}${cabTit("Asistencia por categoría", "asistencia")}</div>
      <section class="sec sec--pegada asis-v">
        ${ASIS.error["*"] ? cargandoHTML("*") : ""}
        <ul class="filas-cat">${ASIS_CATS.filter((c) => D.fichados[c] || (r && r.resumen[c])).map(fila).join("")}</ul>
      </section>`;
  }

  // una categoría: hoy, cómo viene la asistencia, los chicos, los entrenamientos y los días
  function vAsis() {
    const cat = S.acat, d = ASIS.cats[cat];
    const cab = `<div class="cab">${volver(AREAS.asistencia, AREA_IR("asistencia"))}${cabTit(esc(cat), "asisCat")}</div>`;
    if (!d) {
      if (!ASIS.error[cat]) cargarAsis(cat);
      $("#vista").innerHTML = `${cab}<section class="sec sec--pegada asis-v">${cargandoHTML(cat)}</section>`;
      return;
    }
    enCel.set(ULTIMA, cat);
    const hoy = hoyISO(), { activos } = chicosDe(cat, d), total = activos.length;
    // los de antes se muestran desde que se empezó a usar (la primera lista o el primer cambio), hasta 6 semanas para atrás
    const primero = [...d.listas, ...d.entrenamientos].map((x) => x.fecha).filter((f) => f < hoy).sort()[0] || hoy;
    const ses = sesiones(d, primero > masDias(hoy, -42) ? primero : masDias(hoy, -42), masDias(hoy, 14));
    const actual = ses.find((s) => s.fecha === hoy) || ses.find((s) => s.fecha > hoy && s.estado !== "cancelado")
      || (borrador(cat, hoy) ? { fecha: hoy, hora: "", estado: "nuevo", lista: null } : null);
    const validas = listasValidas(d), nListas = validas.length, conColor = nListas >= LISTAS_MIN;
    const pc = porcentajes(d, activos), ult = validas.at(-1), alUltimo = ult ? chicosEn(activos, ult.fecha) : [];
    // los que nunca vinieron: una tarjeta para decir si siguen (y no aparecen en "Los que menos vienen")
    const nunca = conColor ? nuncaVinieron(cat, d) : [], sinNunca = new Set(nunca.map((c) => c.id));
    const tarjNunca = !nunca.length ? "" : `<div class="hoy hoy--ojo nunca">
        <h3 class="hoy__dia">${cabNunca(nunca.length)}</h3>
        <ul class="asis-chicos asis-chicos--nunca">${nunca.map((c) => `<li><span class="asis-chicos__nom">${nombreHTML(c.nombre)}<small>Vino 0 de ${c.de}</small></span>
          <span class="nunca__btns"><button type="button" class="btn-sec btn-sec--chico" data-sacar="${esc(c.id)}" data-nombre="${esc(c.nombre)}">Ya no viene</button>
          <button type="button" class="btn-sec btn-sec--chico" data-sigue="${esc(c.id)}" data-nombre="${esc(c.nombre)}">Sigue</button></span></li>`).join("")}</ul></div>`;
    const resumen = !nListas ? ""
      : !conColor ? `<p class="titular">${nListas === 1 ? "Primera lista" : "Última lista"}: vinieron <b>${vinieron(ult, alUltimo)} de ${alUltimo.length}</b></p>`
      : `<p class="titular">Viene el <b>${promedioCat(cat, d).p}%</b> de las veces</p>
          <p class="asis-nota">En ${pl(nListas, "entrenamiento", "entrenamientos")} con lista este año</p>
          ${tarjNunca}
          <h3 class="grupo">Los que menos vienen</h3>
          <ul class="asis-chicos">${pc.filter((c) => c.de && !sinNunca.has(c.id)).sort((a, b) => a.pct - b.pct || porNombre(a, b)).slice(0, 5).map((c) =>
            `<li><span class="asis-chicos__nom">${nombreHTML(c.nombre)}<small>Vino ${c.vino} de ${c.de}</small></span>${porcHTML(c.pct, true)}</li>`).join("")}</ul>`;
    const proximos = ses.filter((s) => s.fecha >= hoy), pasados = ses.filter((s) => s.fecha < hoy).reverse();
    const filaSes = (s) => `<li><button type="button" class="fila-cat fila-cat--ses${s.fecha === hoy ? " fila-cat--hoy" : ""}${s.estado === "cancelado" ? " fila-cat--canc" : ""}" data-ir-lista="${s.fecha}">
        <span class="fila-cat__nom">${s.fecha === hoy ? "Hoy" : esc(mayus(corta(s.fecha)))}<small>${s.hora ? esc(s.hora) : "Sin hora"}${s.estado === "extra" ? " · agregado" : s.estado === "movido" ? " · cambió la hora" : ""}</small></span>
        <span class="ses-estado${s.estado !== "cancelado" && sinGuardar(cat, s) ? " ses-estado--ojo" : ""}">${estadoTxt(s, activos, cat)}</span>${IC.adelante}</button></li>`;
    $("#vista").innerHTML = `${cab}
      <section class="sec sec--pegada asis-v">
        ${actual ? tarjetaHoy(cat, actual, activos) : ""}
        ${!d.horarios.length ? `<div class="hoy"><h3 class="hoy__dia">¿Qué días entrena ${esc(cat)}?</h3>${formDias(d)}
            ${actual ? "" : `<button type="button" class="btn-sec btn-sec--ancho" data-ir-lista="${hoy}">O tomar lista hoy igual</button>`}</div>` : ""}
      </section>
      <section class="sec asis-v">
        ${resumen}
        <ul class="filas-cat asis-ir"><li><button type="button" class="fila-cat fila-cat--asis" data-ir-chicos>
          <span class="fila-cat__nom">Los chicos (${total})<small>Sumar o sacar chicos</small></span>${IC.adelante}</button></li></ul>
      </section>
      <section class="sec asis-v">
        <h2 class="h2">Entrenamientos</h2>
        ${proximos.length ? `<h3 class="grupo">Próximos</h3><ul class="filas-cat">${proximos.map(filaSes).join("")}</ul>` : ""}
        ${pasados.length ? `<h3 class="grupo">Anteriores</h3><ul class="filas-cat">${pasados.map(filaSes).join("")}</ul>` : ""}
        ${S.aform === "agregar" ? formAgregar(d) : `<button type="button" class="btn-sec btn-sec--ancho asis-mas" data-form="agregar">${IC.mas}Agregar un entrenamiento</button>`}
        ${d.horarios.length ? `<ul class="filas-cat asis-ir"><li><button type="button" class="fila-cat fila-cat--asis" data-form="dias" aria-expanded="${S.aform === "dias"}">
          <span class="fila-cat__nom">Días de entrenamiento<small>${esc(mayus(horariosTxt(d.horarios)))}</small></span><span class="ses-estado">Cambiar</span></button></li></ul>
          ${S.aform === "dias" ? formDias(d) : ""}` : ""}
      </section>
      ${avisoHTML()}`;
  }

  /** el título de la tarjeta de los que nunca vinieron, con el "?" pegado a la última palabra */
  const cabNunca = (n) => `${n === 1 ? "Nunca vino: ¿sigue en el" : "Nunca vinieron: ¿siguen en el"} <span class="junto">equipo?${ayudaBtn("nunca")}</span>`;
  /** de la lista o de los chicos, a la categoría */
  const VOLVER_ASIS = { ver: "asis", afecha: null, aform: null, marcas: null, aviso: null, estadoLista: null };
  /** lo que se ve si el buscador no encuentra a nadie */
  const sinChicos = `<p class="asis-nada" id="sin-chicos" hidden>No hay ningún chico con ese nombre.</p>`;

  // los chicos de la categoría: en orden alfabético, para sumar a uno nuevo o sacar a uno que ya no viene (con deshacer ahí mismo)
  function vChicos() {
    const cat = S.acat, d = ASIS.cats[cat];
    const cab = `<div class="cab">${volver(esc(cat), VOLVER_ASIS)}<h2 class="ej-tit">Los chicos de ${esc(cat)}</h2></div>`;
    if (!d) {
      if (!ASIS.error[cat]) cargarAsis(cat);
      $("#vista").innerHTML = `${cab}<section class="sec sec--pegada asis-v">${cargandoHTML(cat)}</section>`;
      return;
    }
    const { activos, fuera } = chicosDe(cat, d), conColor = listasValidas(d).length >= LISTAS_MIN;
    const pc = new Map(porcentajes(d, activos).map((c) => [c.id, c]));
    // los que se acaban de sacar quedan en su lugar, con "Deshacer"
    const filas = [...activos, ...fuera.filter((c) => S.recien.has(c.id))].sort(porNombre);
    const fila = (c) => S.recien.has(c.id) && !pc.has(c.id)
      ? `<li class="asis-chicos__fuera" data-q="${esc(norm(c.nombre))}"><span class="asis-chicos__nom">${nombreHTML(c.nombre)}<small>Ya no está en la lista</small></span>
          <button type="button" class="btn-sec btn-sec--chico" data-volver-chico="${esc(c.id)}">Deshacer</button></li>`
      : `<li data-q="${esc(norm(c.nombre))}"><span class="asis-chicos__nom">${nombreHTML(c.nombre)}<small>${c.mano ? "Sumado a mano · " : ""}${pc.get(c.id).de ? `Vino ${pc.get(c.id).vino} de ${pc.get(c.id).de}` : "Todavía sin listas"}</small></span>
          ${conColor && pc.get(c.id).de ? porcHTML(pc.get(c.id).pct, true) : ""}
          <button type="button" class="btn-sec btn-sec--chico" data-sacar="${esc(c.id)}" data-nombre="${esc(c.nombre)}">Ya no viene</button></li>`;
    const otrosFuera = fuera.filter((c) => !S.recien.has(c.id));
    $("#vista").innerHTML = `${cab}
      <section class="sec sec--pegada asis-v">
        <div class="asis-form asis-form--suelto"><label class="asis-form__campo" for="nuevo-chico">Sumar a un chico nuevo</label>
          <div class="asis-form__fila"><input id="nuevo-chico" class="asis-input" maxlength="80" placeholder="Apellido, nombre" autocomplete="off" enterkeyhint="done">
          <button type="button" class="btn btn--ok btn--alto" data-sumar-chico>${IC.mas}Sumar</button></div></div>
        ${activos.length > 20 ? `<label class="buscar-g asis-buscar"><span class="sr">Buscar un chico</span>${IC.buscar}<input type="search" id="buscar-chico" placeholder="Buscar por apellido" autocomplete="off" enterkeyhint="search"></label>` : ""}
        <h3 class="grupo">En la lista (${activos.length})</h3>
        <ul class="asis-chicos asis-chicos--editar" data-filtro>${filas.map(fila).join("")}</ul>
        ${otrosFuera.length ? `<h3 class="grupo">Ya no vienen (${otrosFuera.length})</h3>
          <ul class="asis-chicos asis-chicos--editar" data-filtro>${otrosFuera.map((c) => `<li data-q="${esc(norm(c.nombre))}"><span class="asis-chicos__nom">${nombreHTML(c.nombre)}</span>
            <button type="button" class="btn-sec btn-sec--chico" data-volver-chico="${esc(c.id)}">Volver a sumar</button></li>`).join("")}</ul>` : ""}
        ${sinChicos}
      </section>
      ${avisoHTML()}`;
  }

  // tomar lista: un toque por chico (verde con tilde = vino). Abajo, fijo, cuántos vinieron y guardar, con cómo va el guardado.
  function vLista() {
    const cat = S.acat, f = S.afecha, d = ASIS.cats[cat];
    const titLista = f > hoyISO() || (ASIS.cats[cat] && (sesiones(ASIS.cats[cat], f, f)[0] || {}).estado === "cancelado") ? "Entrenamiento" : "Lista";
    const cab = (hora) => `<div class="cab">${volver(esc(cat), VOLVER_ASIS)}
      <h2 class="ej-tit">${titLista} de ${esc(cat)}</h2><p class="prac-cuando">${IC.calendario}<span>${esc(mayus(cuandoP({ fecha: f })))}${hora ? ` · ${esc(hora)}` : ""}</span></p></div>`;
    if (!d) {
      if (!ASIS.error[cat]) cargarAsis(cat);
      $("#vista").innerHTML = `${cab()}<section class="sec sec--pegada asis-v">${cargandoHTML(cat)}</section>`;
      return;
    }
    enCel.set(ULTIMA, cat);
    const s = sesiones(d, f, f)[0] || { fecha: f, hora: "", estado: "nuevo", lista: null };
    const activos = chicosEn(chicosDe(cat, d).activos, f), total = activos.length, futuro = f > hoyISO(), canc = s.estado === "cancelado";
    if (!S.marcas) {
      // lo que quedó marcado en el celular sin guardar tiene prioridad; si no, lo que ya está guardado
      const b = borrador(cat, f), guardados = s.lista ? s.lista.presentes : [];
      S.marcas = new Set(b ? b.marcas : guardados);
      S.base = b ? b.base : guardados;
    }
    S.guardados = s.lista ? s.lista.presentes : [];
    const n = activos.filter((c) => S.marcas.has(c.id)).length;
    const acciones = s.estado === "nuevo" ? "" : S.aform === `suspender:${f}` ? (s.estado === "extra" ? formBorrarExtra(s) : formSuspender(s, activos))
      : S.aform === `hora:${f}` ? formHora(s)
      : `<div class="acc-2">${botonQuitar(s, "Borrar este entrenamiento")}
          <button type="button" class="btn-sec" data-form="hora:${f}">Cambiar la hora</button></div>`;
    let cuerpo;
    if (canc) {
      cuerpo = `<div class="hoy hoy--canc"><p class="hoy__canc">Este entrenamiento se suspendió${s.motivo ? `: ${esc(s.motivo)}` : ""}</p>
        <button type="button" class="btn-sec btn-sec--ancho" data-deshacer="${f}">Deshacer: vuelve a haber entrenamiento</button></div>`;
    } else if (futuro) {
      cuerpo = `<div class="hoy">${acciones}</div>`;
    } else {
      const borrarForm = S.aform === "borrar-lista" ? `<div class="asis-form"><span class="asis-form__l">¿Borrar la lista de este día? Se pierden los ${s.lista ? vinieron(s.lista, activos) : 0} que vinieron.</span>
          <div class="asis-form__btns"><button type="button" class="btn btn--peligro btn--alto" data-borrar-lista-ok>Borrar la lista</button>${cerrarBtn}</div></div>` : "";
      cuerpo = `
        ${s.lista ? `<p class="lista-info">${IC.tilde}<span>Vinieron ${vinieron(s.lista, activos)} de ${total} · ${tomoTxt(s.lista)}</span></p>` : ""}
        <div class="lista-cab"><span>${s.lista ? "Tocá a los que llegaron tarde" : "Tocá a los que vinieron"}</span><button type="button" class="btn-sec btn-sec--chico" data-todos${n ? " hidden" : ""}>Marcar a todos</button></div>
        ${total > 30 ? `<label class="buscar-g asis-buscar"><span class="sr">Buscar un chico</span>${IC.buscar}<input type="search" id="buscar-chico" placeholder="Buscar por apellido" autocomplete="off" enterkeyhint="search"></label>` : ""}
        <ul class="lista-g" data-filtro>${activos.map((c) => `<li data-q="${esc(norm(c.nombre))}"><button type="button" class="lista-it" data-marca="${esc(c.id)}" aria-pressed="${S.marcas.has(c.id)}">
          <span class="lista-it__ic">${IC.tilde}</span><span class="lista-it__nom">${nombreHTML(c.nombre)}</span></button></li>`).join("")}</ul>
        ${sinChicos}
        <div class="lista-mas"><h3 class="grupo">Este entrenamiento</h3>${acciones}
          ${s.lista && S.aform !== "borrar-lista" ? `<button type="button" class="btn-sec btn-sec--ancho" data-form="borrar-lista">Borrar la lista de este día</button>` : ""}${borrarForm}</div>
        <div class="lista-pie" id="pie-lista" role="status">${pieHTML(n, total)}</div>`;
    }
    $("#vista").innerHTML = `${cab(s.hora)}<section class="sec sec--pegada asis-v">${cuerpo}</section>${avisoHTML()}`;
  }
  /** la barra fija de abajo: cuántos vinieron y guardar; mientras guarda, si falla o si hay que volver a poner la clave */
  function pieHTML(n, total) {
    if (S.estadoLista === "guardando") return `<span><b class="num">${n}</b> de ${total} vinieron</span>
      <button type="button" class="btn btn--ok btn--grande" disabled><span class="girando" aria-hidden="true"></span>Guardando…</button>`;
    if (S.estadoLista === "error" || S.estadoLista === "servidor") return `<span class="lista-pie__error">No se guardó${S.estadoLista === "error" ? ": no hay señal" : ""}. Lo marcado queda en el celular.</span>
      <button type="button" class="btn btn--peligro btn--grande" data-guardar-lista>Probar de nuevo</button>`;
    if (S.estadoLista === "clave") return `<span class="lista-pie__error">Hay que volver a poner la clave. Lo marcado queda en el celular.</span>
      <button type="button" class="btn btn--peligro btn--grande" data-reclave>Poner la clave</button>`;
    const cambios = !mismos([...(S.marcas || [])], S.guardados || []);
    return `<span><b class="num" id="cont">${n}</b> de ${total} vinieron<small class="lista-pie__ojo" id="sin-guardar"${cambios ? "" : " hidden"}>Sin guardar</small></span>
      <button type="button" class="btn btn--ok btn--grande" data-guardar-lista>${IC.tilde}Guardar la lista</button>`;
  }
  function pintarPie() {
    const pie = $("#pie-lista");
    if (!pie) return;
    pie.classList.toggle("lista-pie--error", ["error", "servidor", "clave"].includes(S.estadoLista));
    pie.innerHTML = pieHTML(document.querySelectorAll(".lista-it[aria-pressed='true']").length, document.querySelectorAll(".lista-it").length);
  }
  /** guarda la lista: manda solo lo que cambió (así si otro entrenador también tomó lista, se juntan) y, si no hay señal, no se pierde nada */
  async function guardarLista() {
    const cat = S.acat, f = S.afecha;
    const b = borrador(cat, f) || { marcas: [...S.marcas], base: S.base || [] };
    S.estadoLista = "guardando"; pintarPie();
    try {
      await api({ cat, accion: "lista", fecha: f, presentes: b.marcas, base: b.base });
      guardarBorrador(cat, f, null);
      ASIS.cats[cat] = await api(null, cat);
      ASIS.resumen = null;
      S.estadoLista = null;
      const { activos } = chicosDe(cat, ASIS.cats[cat]), l = ASIS.cats[cat].listas.find((x) => x.fecha === f);
      avisar("ok", `Lista guardada: vinieron ${l ? vinieron(l, activos) : 0} de ${activos.length}`);
      volverAtras({ ver: "asis", afecha: null, aform: null, marcas: null });
    } catch (e) {
      S.estadoLista = e.message === "clave" ? "clave" : e.message === "servidor" ? "servidor" : "error";
      pintarPie();
    }
  }
  // si se cortó la señal mientras guardaba, apenas vuelve lo intenta solo
  addEventListener("online", () => { if (S && S.ver === "lista" && S.estadoLista === "error") guardarLista(); });

  /** la práctica en texto, para WhatsApp */
  function textoPractica(p) {
    const l = [`*${p.foco || "Práctica"}*`, `${p.grupo} · ${cuandoP(p)}${minDe(p) ? ` · ${minDe(p)} min` : ""}`];
    if (p.objetivos.length) l.push("", "Objetivos:", ...p.objetivos.map((o) => `• ${o}`));
    p.bloques.forEach((b) => {
      if (b.agua) { l.push(`(Agua${b.min ? ` ${b.min}'` : ""})`); return; }
      if (b.b) l.push("", `*${b.b}*`);
      b.items.forEach((it) => l.push(`${it.min ? `${it.min}' ` : "• "}${[it.obj, it.act, it.det].filter(Boolean).map((x) => x.replace(/\.+$/, "")).join(". ") || b.b || "—"}${it.grupo ? ` (${it.grupo})` : ""}`));
    });
    if (p.cierre) l.push("", "Charla final y elongación");
    l.push("", `Práctica de ${p.quien} · Club Los 50`);
    return l.join("\n");
  }
  const compartirPractica = () => { const p = D.guia.practicas.find((x) => x.id === S.practica); return compartir(p.foco, textoPractica(p)); };
  async function compartir(titulo, txt) {
    // en el celular abre el menú de compartir (WhatsApp, mail…); en la compu, WhatsApp Web
    if (navigator.share) {
      try { await navigator.share({ title: titulo, text: txt }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank", "noopener");
  }

  // ---------- eventos ----------
  document.addEventListener("click", (e) => {
    if (!S) return;
    const t = e.target.closest("[data-atras],[data-subir],[data-alcat],[data-ncat],[data-nota-ok],[data-borrar-nota-ok],[data-reintentar-notas],[data-tomar],[data-tver],[data-tdia],[data-toma-guardar],[data-reintentar-tests],[data-ir-equipo],[data-eq-n],[data-eq-id],[data-eq-vaciar],[data-eq-mas],[data-eq-guardar],[data-eq-borrar],[data-eq-descartar],[data-eq-compartir],[data-reintentar-eq],[data-amistoso-ok],[data-edad],[data-area],[data-area-cat],[data-play],[data-reclave],[data-ayuda],[data-cerrar-ayuda],[data-ir],[data-ir-cat],[data-ir-guia],[data-ir-ej],[data-ir-ej-para],[data-ir-ej-tab],[data-ir-line],[data-ir-puesto],[data-ir-practica],[data-ir-practicas],[data-pgrupo],[data-ir-asis],[data-ir-hoy],[data-ir-lista],[data-ir-chicos],[data-form],[data-reintentar],[data-motivo],[data-dia],[data-marca],[data-todos],[data-cancelar-ok],[data-deshacer],[data-hora-ok],[data-agregar-ok],[data-horarios-ok],[data-guardar-lista],[data-borrar-lista-ok],[data-sacar],[data-sigue],[data-volver-chico],[data-sumar-chico],[data-compartir-pr],[data-rol],[data-quitar-para],[data-tab],[data-anio],[data-ver],[data-ordj]");
    if (!t || t.disabled) return;
    if (t.tagName === "A") e.preventDefault(); // el escudo de arriba: va al inicio sin recargar
    const ds = t.dataset, ir = "lado" in ds ? irSinPaso : irA; // Anterior / Siguiente no suman pasos
    if ("atras" in ds) history.back();
    else if ("subir" in ds) irSinPaso(SUBIR);
    else if (ds.edad) { S.pedad = ds.edad; render(); }
    else if (ds.tomar) { const [ttest, tfecha] = ds.tomar.split("|"); irA({ ver: "toma", ttest, tfecha: tfecha || hoyISO(), aviso: null }); }
    else if (ds.tver) { S.tver = ds.tver; S.tdia = null; render(); }
    else if (ds.tdia) { S.tdia = ds.tdia; render(); }
    else if ("tomaGuardar" in ds) guardarToma();
    else if ("reintentarTests" in ds) { delete TST.error[S.tcat]; delete ASIS.error[S.tcat]; render(); }
    else if (ds.irEquipo) { const [eqcat, eqfecha] = ds.irEquipo.split("|"); irA({ ver: "equipo", eqcat, eqfecha, eqn: null, eqmas: 0, aform: null, aviso: null }); }
    else if (ds.eqN) { S.eqfoco = +ds.eqN; irA({ eqn: +ds.eqN, aviso: null }); }
    else if (ds.eqId) {
      // si el chico ya estaba en otro número, se cambian de lugar
      const e = eqActual(S.eqcat, S.eqfecha), num = String(S.eqn), id = ds.eqId, antes = e.jugadores[num];
      const ya = Object.keys(e.jugadores).find((n) => e.jugadores[n] === id && n !== num);
      if (ya) { if (antes) e.jugadores[ya] = antes; else delete e.jugadores[ya]; }
      e.jugadores[num] = id;
      eqAnotar(e);
      const pl = eqPlantel(S.eqcat), ap = (x) => esc(eqQuien(x, pl).nombre.split(",")[0]);
      if (antes !== id) avisar("ok", ya ? `${ap(id)} pasa al ${num}${antes ? ` y ${ap(antes)} al ${ya}` : ""}` : `${ap(id)} juega de ${num}`);
      volverAtras({ ver: "equipo", eqn: null });
    } else if ("eqVaciar" in ds) {
      const e = eqActual(S.eqcat, S.eqfecha);
      delete e.jugadores[S.eqn]; delete e.cambios[S.eqn];
      eqAnotar(e);
      avisar("ok", `El ${S.eqn} quedó vacío`);
      volverAtras({ ver: "equipo", eqn: null });
    } else if ("eqMas" in ds) { S.eqmas = eqHasta(eqActual(S.eqcat, S.eqfecha)) - 22; render(); }
    else if ("eqGuardar" in ds) guardarEquipo(false);
    else if ("eqBorrar" in ds) guardarEquipo(true);
    else if ("eqDescartar" in ds) { eqBorr.set(eqClave(S.eqcat, S.eqfecha), null); avisar("ok", "Volvió a lo guardado"); render(); }
    else if ("eqCompartir" in ds) compartir(`Equipo de ${S.eqcat}`, textoEquipo());
    else if ("reintentarEq" in ds) { EQ.error = null; render(); }
    else if ("amistosoOk" in ds) {
      const cat = $("#am-cat").value, fecha = $("#am-fecha").value, rival = $("#am-rival").value.trim();
      if (!fechaOk(fecha) || fecha < hoyISO()) { avisoSuelto("Elegí el día del partido."); $("#am-fecha").focus(); return; }
      const k = eqClave(cat, fecha);
      if (!eqBorr.get(k) && !eqGuardado(cat, fecha)) eqBorr.set(k, { jugadores: {}, cambios: {}, rival });
      irA({ ver: "equipo", eqcat: cat, eqfecha: fecha, eqn: null, eqmas: 0, aform: null, aviso: null });
    }
    else if ("alcat" in ds) { S.alcat = ds.alcat || null; render(); }
    else if ("ncat" in ds) { S.ncat = ds.ncat || null; render(); }
    else if ("reintentarNotas" in ds) { NOTAS.error = null; render(); }
    else if ("notaOk" in ds) {
      const texto = $("#nota-texto").value.trim(), por = $("#nota-por").value.trim(), cat = $("#nota-cat").value;
      if (texto.length < 3) { avisoSuelto("Escribí la nota."); $("#nota-texto").focus(); return; }
      if (por.length < 2) { avisoSuelto("Escribí tu nombre."); $("#nota-por").focus(); return; }
      enCel.set(claveNombreNota, por);
      guardarNota({ accion: "nota", cat, texto, por, fecha: hoyISO() }, "Nota guardada");
    } else if (ds.borrarNotaOk) guardarNota({ accion: "borrar_nota", id: Number(ds.borrarNotaOk), por: enCel.get(claveNombreNota) || "" }, "Nota borrada");
    else if (ds.area) irA(AREA_IR(ds.area));
    else if (ds.areaCat) {
      // la categoría elegida en un área queda en el celular: la próxima vez aparece marcada
      const v = ds.areaCat;
      enCel.set(claveArea(S.area), v);
      if (S.area === "asistencia") irA({ ver: "asis", acat: v, afecha: null, aform: null, marcas: null, aviso: null, estadoLista: null });
      else if (S.area === "planificacion") irA({ ver: "plan", pcat: v, qp: "" });
      else if (S.area === "tests") irA({ ver: "tests", tcat: v, tver: null, tdia: null });
      else irA({ ver: "partidos", mcat: v });
    }
    else if (ds.play) reproducir(ds.play);
    else if ("reclave" in ds) { olvidar(); location.reload(); } // vuelve a la misma pantalla después de la clave
    else if (ds.ayuda) abrirAyuda(ds.ayuda, t);
    else if ("cerrarAyuda" in ds) cerrarAyuda();
    else if (ds.ir) { if (ds.ir === S.ver && S.ver === "inicio") scrollTo({ top: 0 }); else irA({ ver: ds.ir, ...LIMPIO }); }
    else if (ds.irEj) ir({ ver: "ejercicio", ej: ds.irEj });
    else if (ds.irEjPara) irA({ ver: "ejercicios", tab: "juegos", rol: null, para: ds.irEjPara, gcat: null, qe: "" });
    else if (ds.irEjTab) irA({ ver: "ejercicios", tab: ds.irEjTab, rol: null, para: null, gcat: null, qe: "" });
    else if (ds.irLine) irA({ ver: "ejercicios", tab: "line", rol: ds.irLine, para: null, gcat: null, qe: "" });
    else if (ds.irPuesto) ir({ ver: "puesto", puesto: +ds.irPuesto });
    else if (ds.irPractica) ir({ ver: "practica", practica: ds.irPractica });
    else if (ds.irPracticas) irA({ ver: "practicas", pgrupo: ds.irPracticas, qp: "", cat: null, gcat: null, temp: null });
    else if (ds.irAsis) irA({ ver: "asis", acat: ds.irAsis, afecha: null, aform: null, marcas: null, aviso: null, estadoLista: null, cat: null, gcat: null, temp: null });
    else if (ds.irHoy) { const [acat, afecha] = ds.irHoy.split("|"); irA({ ver: "lista", acat, afecha, aform: null, marcas: null, aviso: null, estadoLista: null }); }
    else if (ds.irLista) irA({ ver: "lista", afecha: ds.irLista, aform: null, marcas: null, aviso: null, estadoLista: null });
    else if ("irChicos" in ds) irA({ ver: "chicos", aform: null, aviso: null, recien: new Set() });
    else if ("form" in ds) { if (!ds.form && S.aform === "nota" && $("#nota-texto")) $("#nota-texto").value = ""; S.aform = S.aform === ds.form || !ds.form ? null : ds.form; S.aviso = null; S.amotivo = null; render(); }
    else if (ds.reintentar) { delete ASIS.error[ds.reintentar]; render(); }
    else if (ds.motivo) {
      // un solo motivo elegido; "Otro motivo" abre el campo para escribirlo
      t.closest(".chips-g").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === t));
      const otro = $("#motivo-otro");
      otro.hidden = ds.motivo !== "Otro";
      if (!otro.hidden) $("#motivo").focus();
    } else if (ds.dia) {
      // al tocar un día nuevo aparece su hora, con la del día anterior que ya está (así martes y jueves quedan iguales)
      const on = t.getAttribute("aria-pressed") !== "true", fila = $(`[data-dia-hora="${ds.dia}"]`);
      t.setAttribute("aria-pressed", on);
      if (fila) {
        fila.hidden = !on;
        const otras = [...document.querySelectorAll("[data-dia-hora]")].filter((x) => !x.hidden && x !== fila);
        const antes = otras.filter((x) => SEMANA.indexOf(+x.dataset.diaHora) < SEMANA.indexOf(+ds.dia)).at(-1) || otras[0];
        if (on && !("guardada" in fila.dataset) && antes) fila.querySelector("select").value = antes.querySelector("select").value;
      }
    }
    else if (ds.marca) {
      // tomar lista sin volver a dibujar la pantalla (no salta el scroll); lo marcado queda guardado en el celular
      const on = !S.marcas.has(ds.marca);
      if (on) S.marcas.add(ds.marca); else S.marcas.delete(ds.marca);
      t.setAttribute("aria-pressed", on);
      guardarBorrador(S.acat, S.afecha, { marcas: [...S.marcas], base: S.base || [] });
      const c = $("#cont");
      if (c) c.textContent = document.querySelectorAll(".lista-it[aria-pressed='true']").length;
      const todos = $("[data-todos]");
      if (todos) todos.hidden = !!document.querySelector(".lista-it[aria-pressed='true']");
      const sg = $("#sin-guardar");
      if (sg) sg.hidden = mismos([...S.marcas], S.guardados || []);
    } else if ("todos" in ds) {
      S.marcas = new Set([...document.querySelectorAll(".lista-it")].map((x) => x.dataset.marca));
      guardarBorrador(S.acat, S.afecha, { marcas: [...S.marcas], base: S.base || [] });
      render();
    } else if (ds.cancelarOk) {
      const elegido = $("[data-motivo][aria-pressed='true']");
      const motivo = !elegido ? "" : elegido.dataset.motivo === "Otro" ? $("#motivo").value.trim() : elegido.dataset.motivo;
      S.amotivo = elegido ? { m: elegido.dataset.motivo, txt: $("#motivo").value } : null;
      guardarAsis({ accion: "entrenamiento", fecha: ds.cancelarOk, estado: "cancelado", motivo }, "Entrenamiento suspendido");
    } else if (ds.deshacer) {
      const fecha = ds.deshacer, s = sesiones(ASIS.cats[S.acat], fecha, fecha)[0], extra = s && s.estado === "extra";
      guardarAsis({ accion: "entrenamiento", fecha, estado: "normal" }, extra ? "Entrenamiento borrado" : "Listo: vuelve a haber entrenamiento",
        extra && S.ver === "lista" ? () => volverAtras(VOLVER_ASIS) : null);
    } else if (ds.horaOk) {
      const d = ASIS.cats[S.acat], hora = $("#hora-nueva").value, s = sesiones(d, ds.horaOk, ds.horaOk)[0];
      if (!hora) { $("#hora-nueva").focus(); return; }
      // si vuelve a la hora de siempre, deja de decir "cambió la hora"
      const deSiempre = d.horarios.find((h) => h.dia === dia(ds.horaOk).getDay());
      const estado = s && s.estado === "extra" ? "extra" : deSiempre && deSiempre.hora === hora ? "normal" : "movido";
      guardarAsis({ accion: "entrenamiento", fecha: ds.horaOk, estado, hora }, `Ahora es a las ${hora}`);
    } else if ("agregarOk" in ds) {
      const fecha = $("#fecha-nueva").value, hora = $("#hora-agregar").value;
      if (!fecha || !hora) { $(fecha ? "#hora-agregar" : "#fecha-nueva").focus(); return; }
      const fIn = $("#fecha-nueva");
      if (!fechaOk(fecha) || fecha < fIn.min || fecha > fIn.max) { avisoSuelto(`Elegí un día entre el ${cuandoP({ fecha: fIn.min })} y el ${cuandoP({ fecha: fIn.max })}.`); return; }
      // un día tiene un solo entrenamiento: si ya entrena, se le cambia la hora (si no, se pisaría el de siempre)
      const ya = sesiones(ASIS.cats[S.acat], fecha, fecha)[0];
      if (ya && ya.estado !== "cancelado") { avisoSuelto(`Ese día ya entrena${ya.hora ? ` a las ${ya.hora}` : ""}. Para cambiarle la hora, tocá ese día en la lista de entrenamientos.`); return; }
      guardarAsis({ accion: "entrenamiento", fecha, estado: "extra", hora }, `Entrenamiento agregado: ${diaMes(fecha)} a las ${hora}`);
    } else if ("horariosOk" in ds) {
      const dias = [...document.querySelectorAll("[data-dia][aria-pressed='true']")].map((x) => +x.dataset.dia);
      if (!dias.length && !ASIS.cats[S.acat].horarios.length) { avisoSuelto("Tocá al menos un día de entrenamiento."); return; }
      guardarAsis({ accion: "horarios", horarios: dias.map((dia) => ({ dia, hora: $(`#hora-dia-${dia}`).value })) }, dias.length ? "Días guardados" : "Se sacaron los días");
    } else if ("guardarLista" in ds) guardarLista();
    else if ("borrarListaOk" in ds) {
      guardarAsis({ accion: "borrar_lista", fecha: S.afecha }, "Lista borrada", () => {
        guardarBorrador(S.acat, S.afecha, null);
        volverAtras({ ver: "asis", afecha: null, aform: null, marcas: null });
      });
    } else if (ds.sacar) {
      const id = ds.sacar;
      guardarAsis({ accion: "chico", id, estado: "baja" }, `${esc(ds.nombre)} ya no está en la lista`, () => { S.recien.add(id); render(); });
    } else if (ds.sigue) guardarAsis({ accion: "chico", id: ds.sigue, estado: "sigue" }, `${esc(ds.nombre)} sigue en el equipo`);
    else if (ds.volverChico) {
      const id = ds.volverChico;
      guardarAsis({ accion: "chico", id, estado: "activo" }, "Volvió a la lista", () => { S.recien.delete(id); render(); });
    } else if ("sumarChico" in ds) {
      const nombre = $("#nuevo-chico").value.trim();
      if (nombre.length < 3) { avisoSuelto("Escribí el apellido y el nombre del chico."); $("#nuevo-chico").focus(); return; }
      // que no quede dos veces (así su asistencia no se parte en dos renglones)
      const { activos, fuera } = chicosDe(S.acat, ASIS.cats[S.acat]), k = claveNombre(nombre);
      const esta = activos.find((c) => claveNombre(c.nombre) === k), estaba = fuera.find((c) => claveNombre(c.nombre) === k);
      if (esta) { avisoSuelto(`${esc(esta.nombre)} ya está en la lista.`); return; }
      if (estaba) { avisoSuelto(`${esc(estaba.nombre)} ya estaba: tocá “Volver a sumar”, abajo de todo.`); return; }
      guardarAsis({ accion: "chico", estado: "alta", nombre }, `${esc(nombre)} se sumó a la lista`, () => { render(); const i = $("#nuevo-chico"); if (i) i.focus(); });
    }
    else if ("pgrupo" in ds) irA({ pgrupo: ds.pgrupo || null }, false);
    else if ("compartirPr" in ds) compartirPractica();
    else if ("rol" in ds) irA({ rol: ds.rol || null }, false);
    else if ("quitarPara" in ds) irA({ para: null }, false);
    else if (ds.irCat) irA({ ver: "cat", cat: ds.irCat, temp: null, verJ: false, verP: false, verN: false, verR: false });
    else if (ds.irGuia) ir({ ver: "guia", gcat: ds.irGuia, cat: null, temp: null });
    else if (ds.tab) { irA({ tab: ds.tab, rol: null, para: null }, false); $(`[data-tab="${ds.tab}"]`).focus(); }
    else if (ds.anio) irA({ temp: +ds.anio, verJ: false, verP: false, verN: false, verR: false }, false);
    else if (ds.ver) { S["ver" + ds.ver] = !S["ver" + ds.ver]; render(); }
    else if (ds.ordj) { S.ordenJ = ds.ordj; render(); }
  });

  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!S || !d.dataset || !d.dataset.sec) return;
    if (d.open) S.abiertos.add(d.dataset.sec); else S.abiertos.delete(d.dataset.sec);
    if (!d.open) d.querySelectorAll("video").forEach((v) => v.pause()); // al cerrar "Videos de partidos" no sigue sonando
  }, true);

  // la ayuda se cierra con Escape; mientras está abierta, el foco no se va a la pantalla de atrás (solo tiene el botón "Entendido")
  document.addEventListener("keydown", (e) => {
    const caja = $("#ayuda");
    if (!caja || caja.hidden) return;
    if (e.key === "Escape") cerrarAyuda();
    else if (e.key === "Tab") { e.preventDefault(); $(".ayuda__ok", caja).focus(); }
  });

  // buscador de cantos: filtra sin volver a dibujar la pantalla (así no se pierde el teclado)
  // el suplente: por quién entra y el minuto se guardan en el celular apenas se eligen (sin volver a dibujar la pantalla)
  // tests: al cambiar el día de la toma, lo cargado (sin guardar) pasa al día nuevo
  document.addEventListener("change", (e) => {
    if (!S || S.ver !== "toma" || e.target.id !== "toma-fecha") return;
    const f = e.target.value, k = S.ttest;
    if (!fechaOk(f) || f > hoyISO()) { e.target.value = S.tfecha; avisoSuelto("Elegí un día de hoy para atrás."); return; }
    const b = tomaBorr(S.tcat, S.tfecha, k);
    if (b && !tomaBorr(S.tcat, f, k)) { enCel.set(tomaClave(S.tcat, f, k), JSON.stringify(b)); enCel.set(tomaClave(S.tcat, S.tfecha, k), null); }
    irSinPaso({ tfecha: f });
  });
  document.addEventListener("change", (e) => {
    if (!S || S.ver !== "equipo") return;
    const t = e.target, num = t.dataset.eqPor || t.dataset.eqMin;
    if (!num) return;
    const ed = eqActual(S.eqcat, S.eqfecha), cb = ed.cambios[num] || { por: null, min: null }, v = t.value ? +t.value : null;
    const nuevo = "eqPor" in t.dataset ? { por: v, min: cb.min ?? null } : { por: cb.por ?? null, min: v };
    if (nuevo.por == null && nuevo.min == null) delete ed.cambios[num]; else ed.cambios[num] = nuevo;
    eqAnotar(ed);
    const sin = $("#eq-sin");
    if (sin) sin.hidden = !eqSinGuardar(S.eqcat, S.eqfecha);
  });
  document.addEventListener("input", (e) => {
    if (!S) return;
    if (e.target.id === "buscar-canto") { S.q = e.target.value; filtrarCantos(); }
    if (e.target.id === "buscar-ej") { S.qe = e.target.value; filtrarEj(); }
    if (e.target.id === "buscar-pr") { S.qp = e.target.value; filtrarPr(); }
    if ("tv" in e.target.dataset) {
      // lo cargado queda en el celular al momento; en rojo lo que no tiene sentido para ese test
      const t = testDe(S.ttest), b = {};
      e.target.classList.toggle("toma-in--mal", !!e.target.value.trim() && Number.isNaN(leerValor(t, e.target.value)));
      document.querySelectorAll("[data-tv]").forEach((i) => { if (i.value.trim()) b[i.dataset.tv] = i.value.trim(); });
      enCel.set(tomaClave(S.tcat, S.tfecha, S.ttest), JSON.stringify(b));
      $("#toma-n").textContent = Object.keys(b).length;
      $("#toma-sin").hidden = false;
    }
    if (e.target.id === "buscar-eq") {
      const q = norm(e.target.value.trim());
      let total = 0;
      document.querySelectorAll("[data-filtro-eq]").forEach((ul) => {
        let vis = 0;
        ul.querySelectorAll("li[data-q]").forEach((li) => { li.hidden = !!q && !li.dataset.q.includes(q); vis += !li.hidden; });
        ul.hidden = !vis; ul.previousElementSibling.hidden = !vis; total += vis;
      });
      $("#eq-nadie").hidden = total > 0;
      // de otras categorías, solo al buscar
      const x = eqCtx(), ids = new Set(x.pl.map((c) => c.id));
      const otros = q.length < 2 ? [] : [...eqTodos().values()].filter((c) => !ids.has(c.id) && norm(c.nombre).includes(q)).sort(porNombre).slice(0, 20);
      $("#eq-otros").innerHTML = otros.length ? `<h3 class="grupo">De otras categorías</h3><ul class="eq-l">${otros.map((c) => eqFila(c, c.cat, x)).join("")}</ul>` : "";
    }
    if (e.target.id === "buscar-chico") {
      const q = norm(e.target.value.trim());
      let vis = 0;
      document.querySelectorAll("[data-filtro] li[data-q]").forEach((li) => { li.hidden = !!q && !li.dataset.q.includes(q); vis += !li.hidden; });
      const sin = $("#sin-chicos");
      if (sin) sin.hidden = !q || vis > 0;
    }
  });

  // en "Sumar a un chico nuevo", la tecla Enter (o "Listo") del teclado también suma
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.id === "nuevo-chico") { e.preventDefault(); $("[data-sumar-chico]").click(); }
  });

  // después de "Cerrar sesión", el botón "atrás" del navegador no tiene que volver a mostrar la sección abierta
  addEventListener("pageshow", (e) => { if (e.persisted && S && !guardada()) location.reload(); });

  // ---------- inicio ----------
  intentarGuardada().then((ok) => { if (!ok) $("#clave").focus(); });
})();
